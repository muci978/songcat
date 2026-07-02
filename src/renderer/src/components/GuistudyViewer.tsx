/**
 * guistudy 曲谱嵌入查看器。
 * - 默认占 calc(100vh - 160px)（整个窗口除导航/padding）；「全屏」切 fixed inset:0 + 100vh。
 * - 注意：webview 是 Electron 特殊元素，flex 对它不生效，必须用 height:100% 撑满容器。
 */
import { useEffect, useRef, useState } from 'react'

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
  height?: string
}

export function GuistudyViewer({ url, height = 'calc(100vh - 160px)' }: GuistudyViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
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

  useEffect(() => {
    if (!fs) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFs(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fs])

  return (
    <div
      style={{
        position: fs ? 'fixed' : 'relative',
        inset: fs ? 0 : 'auto',
        zIndex: fs ? 9999 : 'auto',
        width: '100%',
        height: fs ? '100vh' : height,
        background: '#fff',
        borderRadius: fs ? 0 : 8,
        overflow: 'hidden'
      }}
    >
      <button
        className="btn btn-sm"
        onClick={() => setFs((v) => !v)}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 2, opacity: 0.9 }}
      >
        {fs ? '退出全屏 (Esc)' : '⤢ 全屏'}
      </button>
      <webview
        ref={wvRef as never}
        src={url}
        partition="persist:guistudy"
        allowpopups={false}
        style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#fff' }}
      />
    </div>
  )
}
