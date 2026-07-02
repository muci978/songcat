/**
 * guistudy（谱全了）集成服务。
 *
 * 关键认知：guistudy 搜索不靠 URL SSR（/tabs?keyword= 的 SSR 是默认列表，不含关键词），
 * 真正搜索是前端 JS 调 api.insstudy.com。而 api.insstudy.com 从外部直连不通（000/防盗链），
 * 只能从 guistudy.com 来源（隐藏 BrowserWindow 内）fetch。
 *
 * 故搜索策略：
 *   1. 隐藏窗口加载 guistudy.com（建立来源/session）
 *   2. 在页面内 executeJavaScript 直接 fetch api.insstudy.com 搜索（试多个候选端点）
 *   3. 拿到 JSON 就解析（可靠）
 *   4. 否则回退：加载 /tabs?keyword= 等 JS 渲染后 DOM 提取
 *
 * 注意：api 端点/响应结构需在 Windows 实测后微调（端点列表在 API_ENDPOINTS）。
 */
import { BrowserWindow } from 'electron'
import type { Instrument } from '@shared'

export const GUISTUDY_BASE = 'https://guistudy.com'
const API_BASE = 'https://api.insstudy.com'
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

/** 候选 API 端点（路径），将依次尝试并拼 keyword 参数 */
const API_ENDPOINTS = [
  '/api/score/search',
  '/api/score/searchList',
  '/api/score/list',
  '/api/tabs/search',
  '/api/search',
  '/score/search',
  '/api/score/page'
]

/** 在 guistudy 页面上下文里 fetch api.insstudy.com（同源防盗链可通过），返回原始 JSON 或 null */
function buildApiScript(q: string): string {
  return `
(async () => {
  const kw = ${JSON.stringify(q)};
  const tried = [];
  for (const ep of ${JSON.stringify(API_ENDPOINTS)}) {
    for (const qs of [
      'keyword=' + encodeURIComponent(kw) + '&no=1&size=20',
      'keyword=' + encodeURIComponent(kw),
      'name=' + encodeURIComponent(kw),
      'wd=' + encodeURIComponent(kw)
    ]) {
      const url = '${API_BASE}' + ep + '?' + qs;
      try {
        const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
        tried.push(ep + '?' + qs.split('=')[0] + ' -> ' + r.status);
        if (!r.ok) continue;
        const ct = r.headers.get('content-type') || '';
        if (ct.indexOf('json') < 0) continue;
        const j = await r.json();
        return { ok: true, endpoint: ep, json: j };
      } catch (e) {
        tried.push(ep + ' ERR ' + (e && e.message ? e.message : e));
      }
    }
  }
  return { ok: false, tried };
})()
`
}

/** 在嵌套对象里找第一个"像曲谱列表"的数组 */
function findScoreArray(obj: unknown): unknown[] | null {
  if (Array.isArray(obj)) {
    if (obj.length > 0 && obj[0] && typeof obj[0] === 'object') return obj
    return null
  }
  if (obj && typeof obj === 'object') {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const a = findScoreArray(v)
      if (a && a.length > 0) return a
    }
  }
  return null
}

function parseApiItem(it: Record<string, unknown>): GuistudySearchResult | null {
  const id = (it.id || it.scoreId || it.uuid) as string | undefined
  const title = (it.name || it.title || it.scoreName) as string | undefined
  if (!title) return null
  const sid = (it.screenshot || it.img || it.cover || it.pic) as string | undefined
  return {
    title,
    artist: ((it.singer || it.artist || it.singerName) as string) || null,
    url: id ? `${GUISTUDY_BASE}/tabs/${id}` : ((it.url || it.detailUrl) as string) || '',
    instrument: 'guitar',
    screenshotUrl: sid || (id ? `https://i.insstudy.com/file/gtp/screenshot/${id}.jpg` : null),
    typeLabel: ((it.typeName || it.type) as string) || null,
    keyLabel: ((it.key || it.tone || it.toneName) as string) || null
  }
}

function parseApi(json: unknown): GuistudySearchResult[] {
  // guistudy API 格式 {code, msg, data, ...}，优先在 data 里找曲谱数组
  const root = (json && typeof json === 'object' ? json : null) as Record<string, unknown> | null
  const data = root && 'data' in root ? (root.data as unknown) : json
  const arr = findScoreArray(data) ?? findScoreArray(json)
  if (!arr) return []
  return arr
    .map((it) => (it && typeof it === 'object' ? parseApiItem(it as Record<string, unknown>) : null))
    .filter((x): x is GuistudySearchResult => !!x && !!(x.url || x.screenshotUrl))
}

const DOM_EXTRACT = `(() => {
  const seen = new Set(); const out = [];
  document.querySelectorAll('a[href]').forEach(a => {
    const m = (a.href || '').match(/\\/tabs\\/([^?&#]+)$/);
    if (!m) return;
    if (seen.has(a.href)) return; seen.add(a.href);
    let card = a.closest('li, article, [class*="card"], [class*="item"], [class*="score"], [class*="list"]');
    if (!card) card = a.parentElement;
    const text = (card ? card.textContent : a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 300);
    const img = card && card.querySelector ? card.querySelector('img') : null;
    out.push({ href: a.href, text, img: (img && (img.src || img.getAttribute('data-src'))) || '' });
  });
  return out;
})()`

function parseDomItem(it: { href: string; text: string; img: string }): GuistudySearchResult | null {
  const artistMatch = it.text.match(/歌手[:：]\s*([^\s,，/]+)/)
  const keyMatch = it.text.match(/\b([A-G](?:b|#)?)调\b/)
  const typeMatch = it.text.match(/(弹唱|指弹)/)
  let title = it.text.split(/歌手[:：]/)[0] || ''
  title = title.replace(/(弹唱|指弹)/g, '').replace(/\b[A-G](?:b|#)?调\b/g, '').trim().split(/\s{2,}/)[0].slice(0, 60)
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
  // 监听对 api.insstudy.com 的请求，捕获 guistudy 自己调的真实搜索 API（写到错误信息便于排查/写死）
  const apiCalls: string[] = []
  win.webContents.session.webRequest.onBeforeRequest(
    { urls: ['https://api.insstudy.com/*'] },
    (details, cb) => {
      apiCalls.push(details.url)
      cb({})
    }
  )
  try {
    await win.loadURL(`${GUISTUDY_BASE}/tabs`)
    await new Promise((r) => setTimeout(r, 1500))

    // 优先：在页面内 fetch api.insstudy.com
    const api = (await win.webContents.executeJavaScript(buildApiScript(q)).catch(() => null)) as
      | { ok: true; endpoint: string; json: unknown }
      | { ok: false; tried: string[] }
      | null
    if (api && (api as { ok?: boolean }).ok) {
      const results = parseApi((api as { json: unknown }).json)
      if (results.length > 0) return results
    }

    // 回退：DOM 提取（加载关键词页，等 JS 渲染）
    await win.loadURL(`${GUISTUDY_BASE}/tabs?keyword=${encodeURIComponent(q)}`)
    for (let i = 0; i < 20; i++) {
      const has = await win.webContents.executeJavaScript(`!!document.querySelector('a[href*="/tabs/"]')`).catch(() => false)
      if (has) break
      await new Promise((r) => setTimeout(r, 500))
    }
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
          `JSON.stringify({title: document.title, url: location.href, links: document.querySelectorAll('a[href*="/tabs/"]').length, hasKw: document.body.innerText.indexOf(${JSON.stringify(q)}) >= 0, body: document.body.innerText.slice(0, 150)})`
        )
        .catch(() => '{}')
      const tried =
        api && !(api as { ok: boolean }).ok
          ? (api as { tried: string[] }).tried.join(' | ')
          : 'api 有响应但解析为空'
      throw new Error(
        `未找到「${q}」。API 尝试: ${tried}。guistudy 实际请求: ${apiCalls.length ? apiCalls.slice(0, 5).join(' | ') : '（无，可能 /tabs?keyword= 不触发搜索）'}。页面: ${diag}`
      )
    }
    return out
  } finally {
    win.destroy()
  }
}
