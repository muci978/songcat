/**
 * guistudy（谱全了）集成服务。
 *
 * 设计：本地只存 guistudy 曲谱页 URL 索引，不下载文件。
 *   - 搜索：用隐藏 BrowserWindow 加载 guistudy 搜索页，等 SPA 渲染后从 DOM 提取曲谱列表。
 *   - 查看：renderer 用 webview 嵌入曲谱页 URL（/tabs/{id}），注入 CSS 让其看起来像 SongCat 原生。
 *
 * 注意：guistudy 是 Nuxt/Vite SPA，DOM 结构可能随站点改版变化。提取逻辑用启发式
 *       （找所有 /tabs/{id} 链接 + 父卡片文字），首次在 Windows 运行时若结果不对，
 *       需在此调整 EXTRACT_SCRIPT 的选择器。带浏览器 UA + Referer 模拟正常访问，
 *       不破解付费/登录/验证码。
 */
import { BrowserWindow } from 'electron'
import type { Instrument } from '@shared'

export const GUISTUDY_BASE = 'https://guistudy.com'
const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** guistudy 搜索结果（映射到 FreeSourceSearchResult） */
export interface GuistudySearchResult {
  title: string
  artist: string | null
  /** 曲谱详情页 URL，形如 https://guistudy.com/tabs/1Oy6jj7V1 */
  url: string
  instrument: Instrument
  screenshotUrl: string | null
  /** 弹唱/指弹 */
  typeLabel: string | null
  /** 调，如 G/C/Eb */
  keyLabel: string | null
}

/** 在搜索页 DOM 里提取曲谱卡片的脚本（注入到页面执行） */
const EXTRACT_SCRIPT = `(() => {
  const seen = new Set();
  const out = [];
  // 曲谱详情页链接：/tabs/{id}（排除 /tabs?style= 列表分类、/tabs、/ukulele 等导航）
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href;
    const m = href.match(/\\/tabs\\/([^?&#]+)$/);
    if (!m) return;                  // 只取 /tabs/{id} 详情链接
    if (seen.has(href)) return;
    seen.add(href);
    // 父卡片（尝试多种容器）
    let card = a.closest('li, article, [class*="card"], [class*="item"], [class*="score"], [class*="list"]');
    if (!card) card = a.parentElement && a.parentElement.parentElement ? a.parentElement.parentElement : a.parentElement;
    const text = (card ? card.textContent : a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400);
    const img = (card && card.querySelector ? card.querySelector('img') : null) || a.querySelector('img');
    const imgSrc = img && (img.src || img.getAttribute('data-src') || '');
    out.push({ href, text, img: imgSrc || '' });
  });
  return out;
})()`

interface RawItem {
  href: string
  text: string
  img: string
}

/** 轮询直到 DOM 出现 /tabs/{id} 链接或超时（秒） */
async function waitForResults(win: BrowserWindow, timeoutMs = 15000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const ok = await win.webContents
      .executeJavaScript(`!!document.querySelector('a[href*="/tabs/"]')`)
      .catch(() => false)
    if (ok) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

function parseItem(it: RawItem): GuistudySearchResult | null {
  const artistMatch = it.text.match(/歌手[:：]\s*([^\s,，/]+)/)
  const keyMatch = it.text.match(/\b([A-G](?:b|#)?)调\b/)
  const typeMatch = it.text.match(/(弹唱|指弹)/)
  const instrument: Instrument = /ukulele/i.test(it.href) ? 'ukulele' : 'guitar'
  // 标题：去掉"歌手:..."之后的部分，再去掉类型/调
  let title = it.text
  const cut = title.split(/歌手[:：]/)[0] || ''
  title = cut.replace(/(弹唱|指弹)/g, '').replace(/\b[A-G](?:b|#)?调\b/g, '').trim()
  title = title.split(/\s{2,}/)[0].slice(0, 60)
  if (!title) return null
  return {
    title,
    artist: artistMatch?.[1] || null,
    url: it.href,
    instrument,
    screenshotUrl: it.img || null,
    typeLabel: typeMatch?.[1] || null,
    keyLabel: keyMatch?.[1] || null
  }
}

/**
 * 在 guistudy 上搜索关键词，返回曲谱列表。
 * 用隐藏 BrowserWindow 加载搜索页 → 等渲染 → DOM 提取。
 */
export async function searchGuistudy(query: string): Promise<GuistudySearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: 'persist:guistudy'
    }
  })
  win.webContents.setUserAgent(CHROME_UA)
  try {
    await win.loadURL(`${GUISTUDY_BASE}/search?keyword=${encodeURIComponent(q)}`)
    await waitForResults(win)
    // 渲染后再多等一拍，确保卡片完整
    await new Promise((r) => setTimeout(r, 800))
    const raw = (await win.webContents.executeJavaScript(EXTRACT_SCRIPT)) as RawItem[]
    const seen = new Set<string>()
    const out: GuistudySearchResult[] = []
    for (const it of raw || []) {
      if (seen.has(it.href)) continue
      seen.add(it.href)
      const parsed = parseItem(it)
      if (parsed) out.push(parsed)
    }
    return out
  } finally {
    win.destroy()
  }
}
