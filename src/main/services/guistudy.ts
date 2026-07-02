/**
 * guistudy（谱全了）集成服务。
 *
 * 关键：真实搜索 URL 是 /searchResults?searchValue=<关键词>（SSR 已含搜索结果，
 * 含歌名/歌手/曲谱链接）。之前的 /tabs?keyword= 是默认热门列表（不搜索）。
 * 曲谱详情页 URL 是 /tabs/{id}（如 /tabs/1sdjVaOSDpI）。
 *
 * 策略：隐藏窗口加载 /searchResults?searchValue= → SSR 已有结果 → DOM 提取曲谱卡片。
 */
import { BrowserWindow } from 'electron'
import type { Instrument } from '@shared'

export const GUISTUDY_BASE = 'https://guistudy.com'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export interface GuistudySearchResult {
  title: string
  artist: string | null
  url: string
  instrument: Instrument
  screenshotUrl: string | null
  typeLabel: string | null
  keyLabel: string | null
}

/** DOM 提取脚本：找所有 /tabs/{id} 详情链接 + 其卡片文本 + 截图 */
const DOM_EXTRACT = `(() => {
  const seen = new Set(); const out = [];
  document.querySelectorAll('a[href]').forEach(a => {
    const m = (a.href || '').match(/\\/tabs\\/([^?&#]+)$/);
    if (!m) return;
    if (seen.has(a.href)) return; seen.add(a.href);
    let card = a.closest('li, article, [class*="card"], [class*="item"], [class*="score"], [class*="list"]');
    if (!card) card = a.parentElement;
    const text = (card ? card.textContent : a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400);
    const img = card && card.querySelector ? card.querySelector('img') : null;
    out.push({ href: a.href, text, img: (img && (img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src'))) || '' });
  });
  return out;
})()`

function parseDomItem(it: { href: string; text: string; img: string }): GuistudySearchResult | null {
  const artistMatch = it.text.match(/歌手[:：]\s*([^\s,，/]+)/)
  const keyMatch = it.text.match(/\b([A-G](?:b|#)?)调\b/)
  const typeMatch = it.text.match(/(弹唱|指弹)/)
  // 标题：歌手之前的部分，去掉类型/调
  let title = it.text.split(/歌手[:：]/)[0] || it.text
  title = title.replace(/(弹唱|指弹)/g, '').replace(/\b[A-G](?:b|#)?调\b/g, '').trim()
  title = title.split(/\s{2,}/)[0].slice(0, 60)
  if (!title) return null
  return {
    title,
    artist: artistMatch?.[1] || null,
    url: it.href,
    instrument: /ukulele/i.test(it.href) ? 'ukulele' : 'guitar',
    screenshotUrl: it.img || null,
    typeLabel: typeMatch?.[1] || null,
    keyLabel: keyMatch?.[1] || null
  }
}

export async function searchGuistudy(query: string): Promise<GuistudySearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { sandbox: false, contextIsolation: true, nodeIntegration: false, partition: 'persist:guistudy' }
  })
  win.webContents.setUserAgent(CHROME_UA)
  try {
    await win.loadURL(`${GUISTUDY_BASE}/searchResults?searchValue=${encodeURIComponent(q)}`)
    // SSR 已含结果，稍等确保渲染完成
    await new Promise((r) => setTimeout(r, 1500))
    const raw = (await win.webContents.executeJavaScript(DOM_EXTRACT).catch(() => [])) as {
      href: string
      text: string
      img: string
    }[]
    const seen = new Set<string>()
    const out: GuistudySearchResult[] = []
    for (const it of raw || []) {
      if (seen.has(it.href)) continue
      seen.add(it.href)
      const p = parseDomItem(it)
      if (p) out.push(p)
    }
    if (out.length === 0) {
      const diag = await win.webContents
        .executeJavaScript(
          `JSON.stringify({title: document.title, url: location.href, links: document.querySelectorAll('a[href*="/tabs/"]').length, hasKw: document.body.innerText.indexOf(${JSON.stringify(q)}) >= 0, body: document.body.innerText.slice(0, 300)})`
        )
        .catch(() => '{}')
      throw new Error(`未找到「${q}」的结果。页面诊断: ${diag}`)
    }
    return out
  } finally {
    win.destroy()
  }
}
