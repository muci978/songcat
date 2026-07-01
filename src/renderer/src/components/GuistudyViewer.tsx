/**
 * guistudy 曲谱嵌入查看器（设计：不下载，直接嵌入 guistudy 曲谱页，复用其播放/循环/变调）。
 * 用 Electron <webview> 加载曲谱页 URL，注入 CSS 隐藏 guistudy 的导航/页脚/广告/品牌，
 * 只留曲谱查看器，让用户感觉是 SongCat 原生的一部分。
 *
 * 注意：guistudy 页面 DOM 结构可能随改版变化，HIDE_CSS 选择器需在 Windows 实测后微调。
 */
import { useEffect, useRef } from 'react'

// 隐藏 guistudy 站点 chrome（header/nav/footer/广告/侧栏/回到顶部/下载引导等），只留曲谱区
const HIDE_CSS = `
  header, nav, footer,
  [class*="header"], [class*="nav-bar"], [class*="navbar"], [class*="footer"],
  [class*="ad"], [class*="banner"], [class*="download-app"], [class*="app-download"],
  [class*="back-to-top"], [class*="backTop"], [class*="sidebar"], [class*="menu"],
  [class*="popup"], [class*="modal-mask"], [class*="login"] {
    display: none !important;
  }
  body, html { background: #faf7f2 !important; }
  /* 取消可能的全局最大宽度限制，让曲谱区占满 */
  .nuxt-content, [class*="container"], [class*="content"], main { max-width: 100% !important; padding: 0 !important; }
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
