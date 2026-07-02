/**
 * guistudy 曲谱嵌入查看器。
 * - Electron <webview> 无法像普通元素那样解析 flex 容器里的百分比高度，
 *   因此使用 ResizeObserver 测量容器像素尺寸后显式赋给 webview。
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
  height?: string | number
}

export function GuistudyViewer({ url, height = 'calc(100vh - 160px)' }: GuistudyViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
  const [{ w, h }, setSize] = useState({ w: 0, h: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const wvRef = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    addEventListener: (t: string, cb: () => void) => void
    removeEventListener: (t: string, cb: () => void) => void
  }>(null)

  // 注入隐藏 guistudy 广告/header/footer 的 CSS
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

  // 全屏 Esc 退出
  useEffect(() => {
    if (!fs) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFs(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fs])

  // 监听容器尺寸并把像素值写给 webview
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    let ro: ResizeObserver | null = null
    try {
      ro = new ResizeObserver(([entry]) => {
        const cr = entry?.contentRect ?? el.getBoundingClientRect()
        setSize({
          w: Math.max(320, Math.round(cr.width)),
          h: Math.max(200, Math.round(cr.height))
        })
      })
      ro.observe(el)
      // 初始化一次
      const rect = el.getBoundingClientRect()
      setSize({
        w: Math.max(320, Math.round(rect.width)),
        h: Math.max(200, Math.round(rect.height))
      })
    } catch {
      /* ignore unsupported environments */
    }
    return () => {
      if (ro && el) ro.unobserve(el)
    }
  }, [url])

  const heightStyle = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      style={{
        position: fs ? 'fixed' : 'relative',
        inset: fs ? 0 : undefined,
        top: fs ? 0 : undefined,
        right: fs ? 0 : undefined,
        bottom: fs ? 0 : undefined,
        left: fs ? 0 : undefined,
        zIndex: fs ? 9999 : 'auto',
        width: '100%',
        height: fs ? '100vh' : heightStyle,
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
      <div
        ref={wrapRef}
        style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 8, overflow: 'hidden' }}
      >
        {/* @ts-expect-error Electron custom element */}
        <webview
          ref={wvRef as never}
          src={url}
          partition="persist:guistudy"
          allowpopups={false}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: `${w}px`,
            height: `${h}px`,
            border: 0,
            display: 'block',
            background: '#fff'
          }}
        />
      </div>
    </div>
  )
}
