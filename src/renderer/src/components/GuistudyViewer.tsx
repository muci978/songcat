/**
 * guistudy 曲谱嵌入查看器（设计：不下载，直接嵌入 guistudy 曲谱页，复用其播放/循环/变调）。
 * 用 Electron <webview> 加载曲谱页 URL，注入 CSS 隐藏 guistudy 的导航/页脚/广告/品牌，
 * 只留曲谱查看器，让用户感觉是 SongCat 原生的一部分。
 *
 * 注意：guistudy 页面 DOM 结构可能随改版变化，HIDE_CSS 选择器需在 Windows 实测后微调。
 */
import { useEffect, useRef } from 'react'

// 只隐藏明确的站点级导航/页脚/广告/回到顶部/下载引导。
// 注意：不要用宽泛的 [class*="header"]/[class*="content"]/[class*="sidebar"] 等，
// 那会误伤 guistudy 曲谱查看器，导致嵌入后空白。
const HIDE_CSS = `
  header, footer, nav,
  [class*="back-to-top"], [class*="backTop"],
  [class*="download-app"], [class*="app-download"],
  [class*="popup-ad"], [class*="ad-banner"] {
    display: none !important;
  }
  body, html { background: #faf7f2 !important; }
`

interface GuistudyViewerProps {
  url: string
  /** 高度，默认 75vh */
  height?: string
}

export function GuistudyViewer({ url, height = '75vh' }: GuistudyViewerProps): React.ReactElement {
  const ref = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    addEventListener: (type: string, cb: () => void) => void
    removeEventListener: (type: string, cb: () => void) => void
  }>(null)

  useEffect(() => {
    const wv = ref.current
    if (!wv) return
    const inject = () => {
      wv.insertCSS?.(HIDE_CSS).catch(() => {})
    }
    wv.addEventListener('dom-ready', inject)
    wv.addEventListener('did-navigate-in-page', inject)
    return () => {
      wv.removeEventListener('dom-ready', inject)
      wv.removeEventListener('did-navigate-in-page', inject)
    }
  }, [url])

  return (
    <webview
      ref={ref as never}
      src={url}
      // 用独立 partition 隔离 cookie；禁用 node integration 保持安全
      partition="persist:guistudy"
      allowpopups={false}
      style={{ width: '100%', height, border: 0, borderRadius: 8, display: 'block' }}
    />
  )
}
