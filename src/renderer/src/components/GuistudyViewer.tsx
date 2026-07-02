/**
 * guistudy 曲谱嵌入查看器。
 * - <webview> 加载曲谱页 URL，注入 CSS 隐藏站点 chrome（保守，只藏 header/footer/广告）。
 * - 默认占较大高度；「全屏」按钮调用原生 Fullscreen API 把容器铺满整个屏幕。
 */
import { useEffect, useRef } from 'react'

const HIDE_CSS = `
  header, footer, nav,
  [class*="back-to-top"], [class*="backTop"],
  [class*="download-app"], [class*="app-download"],
  [class*="popup-ad"], [class*="ad-banner"] {
    display: none !important;
  }
  body, html { background: #fff !important; }
`

interface GuistudyViewerProps {
  url: string
  /** 容器高度，默认 82vh（尽量大，方便看谱） */
  height?: string
}

export function GuistudyViewer({ url, height = '82vh' }: GuistudyViewerProps): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null)
  const wvRef = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    addEventListener: (t: string, cb: () => void) => void
    removeEventListener: (t: string, cb: () => void) => void
  }>(null)

  useEffect(() => {
    const wv = wvRef.current
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

  const toggleFullscreen = () => {
    const el = wrapRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void el.requestFullscreen()
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        height,
        // 全屏时铺满整个屏幕（:fullscreen 伪类）
        background: '#fff',
        borderRadius: 8,
        overflow: 'hidden'
      }}
    >
      <webview
        ref={wvRef as never}
        src={url}
        partition="persist:guistudy"
        allowpopups={false}
        style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#fff' }}
      />
      <button
        className="btn btn-sm"
        onClick={toggleFullscreen}
        title="全屏查看曲谱（Esc 退出）"
        style={{ position: 'absolute', top: 8, right: 8, opacity: 0.85 }}
      >
        ⛶ 全屏
      </button>
    </div>
  )
}
