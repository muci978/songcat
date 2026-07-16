/**
 * 通用 Web 搜索适配器（预留）。
 * 使用 searchUrlTemplate 拼接 URL，隐藏窗口加载 + 通用 DOM 提取。
 * 当前为占位实现，后续根据具体站点优化提取逻辑。
 */
import type { BrowserWindow } from 'electron'
import { ResourceSourcePolicy } from '@shared'
import type { ResourceSource } from '@shared'
import type { SearchAdapter, AdapterSearchResult } from './types'

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/** 通用 DOM 提取：找所有外部链接 + 父容器文本 + 图片 */
const GENERIC_DOM_EXTRACT = `(() => {
  const seen = new Set(); const out = [];
  const base = location.origin;
  document.querySelectorAll('a[href]').forEach(a => {
    const href = a.href || '';
    if (!href.startsWith('http')) return;
    if (href.startsWith(base + '/')) return; // 跳过站内导航链接
    if (seen.has(href)) return; seen.add(href);
    let card = a.closest('li, article, [class*="card"], [class*="item"], [class*="result"], [class*="list"]');
    if (!card) card = a.parentElement;
    const text = (card ? card.textContent : a.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 400);
    const img = card && card.querySelector ? card.querySelector('img') : null;
    out.push({ href, text, img: (img && (img.src || img.getAttribute('data-src'))) || '' });
  });
  return out;
})()`

export class GenericAdapter implements SearchAdapter {
  readonly sourceId: string
  readonly sourceName: string
  readonly sourcePolicy: ResourceSourcePolicy
  private readonly searchUrlTemplate: string | null

  constructor(source: ResourceSource) {
    this.sourceId = source.id
    this.sourceName = source.name
    this.sourcePolicy = source.policy
    this.searchUrlTemplate = source.searchUrlTemplate
  }

  async search(query: string): Promise<AdapterSearchResult[]> {
    if (!this.searchUrlTemplate) {
      throw new Error(`来源「${this.sourceName}」未配置搜索 URL 模板，无法搜索。`)
    }

    const searchUrl = this.searchUrlTemplate.replace('{q}', encodeURIComponent(query))
    const { BrowserWindow } = await import('electron')

    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        sandbox: false,
        contextIsolation: true,
        nodeIntegration: false,
        partition: `persist:source-${this.sourceId}`
      }
    })
    win.webContents.setUserAgent(CHROME_UA)

    try {
      await win.loadURL(searchUrl)
      // 等待页面渲染
      await new Promise((r) => setTimeout(r, 2000))

      const raw = (await win.webContents.executeJavaScript(GENERIC_DOM_EXTRACT).catch(() => [])) as {
        href: string
        text: string
        img: string
      }[]

      const out: AdapterSearchResult[] = []
      const seen = new Set<string>()
      for (const it of raw || []) {
        if (seen.has(it.href)) continue
        seen.add(it.href)
        // 通用解析：取第一行非空文本作为标题
        const lines = it.text.split(/\n/).map((l: string) => l.trim()).filter(Boolean)
        const title = lines[0]?.slice(0, 60) || it.href
        if (!title) continue
        out.push({
          title,
          artist: lines[1]?.slice(0, 60) || null,
          url: it.href,
          instrument: null,
          screenshotUrl: it.img || null,
          typeLabel: null,
          keyLabel: null
        })
      }

      if (out.length === 0) {
        throw new Error(`在「${this.sourceName}」未找到「${query}」的结果。`)
      }
      return out
    } finally {
      win.destroy()
    }
  }
}
