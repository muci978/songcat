/**
 * guistudy 曲谱嵌入查看器（不下载，嵌入 guistudy 曲谱页，复用其播放/循环/变调）。
 * - 默认占 90vh（尽量大）；「全屏」切到 fixed inset:0 + 100vh，真正铺满屏幕，Esc 或按钮退出。
 * - webview 用 flex:1 填满按钮下方所有空间。
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

  // Esc 退出全屏
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
        display: 'flex',
        flexDirection: 'column',
        borderRadius: fs ? 0 : 8,
        overflow: 'hidden'
      }}
    >
      <div
        className="row-between"
        style={{ flex: '0 0 auto', padding: '6px 8px', background: 'var(--bg-subtle)' }}
      >
        <span className="hint">guistudy 曲谱（嵌入查看，可播放 / 循环 / 变调）</span>
        <button className="btn btn-sm" onClick={() => setFs((v) => !v)}>
          {fs ? '退出全屏 (Esc)' : '⤢ 全屏'}
        </button>
      </div>
      <webview
        ref={wvRef as never}
        src={url}
        partition="persist:guistudy"
        allowpopups={false}
        style={{ width: '100%', flex: 1, minHeight: 0, border: 0, display: 'block', background: '#fff' }}
      />
    </div>
  )
}
