/**
 * guistudy 曲谱嵌入查看器。
 *
 * Electron <webview> 不会随 flex 容器自动撑满，因此：
 *   1. 外层容器由调用方给定具体高度（数字 px、vh/calc 字符串或百分比）。
 *   2. 内部用一个绝对定位的测量面，通过 ResizeObserver 拿到真实像素尺寸。
 *   3. 把像素宽高同时写进 <webview> 的 style 和 DOM property，触发渲染层重排。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
  /**
   * 外层容器高度。建议传固定值（如 700）或 '100%'；
   * 若用 '%'，请确保所有祖先都有确定高度，否则可能塌陷。
   */
  height?: string | number
}

export function GuistudyViewer({ url, height = 'calc(100vh - 160px)' }: GuistudyViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
  const [{ w, h }, setSize] = useState({ w: 800, h: 400 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const wvRef = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    addEventListener: (t: string, cb: () => void) => void
    removeEventListener: (t: string, cb: () => void) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }>(null)

  /** 同步地把像素尺寸写给 webview（style + attr 双保险） */
  const applyWebviewSize = () => {
    const el = wvRef.current
    if (!el || !(w > 0 && h > 0)) return
    const s = el.style as unknown as Record<string, string>
    s.width = `${w}px`
    s.height = `${h}px`
    try {
      el.setAttribute('width', `${w}`)
      el.setAttribute('height', `${h}`)
      // 某些 Electron 版本需要显式触发一次重排才能刷新 guest view geometry
      void el.offsetHeight
    } catch {
      /* ignore */
    }
  }

  // 注入隐藏 guistudy 广告/header/footer 的 CSS
  useEffect(() => {
    const wv = wvRef.current
    if (!wv) return
    const inject = () => {
      wv.insertCSS?.(HIDE_CSS).catch(() => {})
      applyWebviewSize()
    }
    wv.addEventListener('dom-ready', inject)
    wv.addEventListener('did-navigate-in-page', inject)
    return () => {
      wv.removeEventListener('dom-ready', inject)
      wv.removeEventListener('did-navigate-in-page', inject)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!el) return undefined

    let ro: ResizeObserver | null = null
    const measure = () => {
      const rect = el.getBoundingClientRect()
      setSize({
        w: Math.max(320, Math.round(rect.width)),
        h: Math.max(240, Math.round(rect.height))
      })
    }

    try {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    } catch {
      /* fall back to window.resize polling */
      window.addEventListener('resize', measure)
    }

    // 首次及后续多帧兜底：DOM 挂载后尺寸常需一两帧才稳定
    requestAnimationFrame(measure)
    const t1 = setTimeout(measure, 50)
    const t2 = setTimeout(measure, 250)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      if (ro && el) {
        ro.disconnect()
      } else {
        window.removeEventListener('resize', measure)
      }
    }
  }, [url])

  // 每次测到的新尺寸都立即应用到 webview
  useLayoutEffect(() => {
    applyWebviewSize()
  }, [w, h])

  const heightStyle = typeof height === 'number' ? `${height}px` : height

  return (
    <div
      className={fs ? '' : 'guistudy-viewer'}
      style={{
        position: fs ? 'fixed' : 'relative',
        zIndex: fs ? 9999 : 'auto',
        width: fs ? '100vw' : '100%',
        height: fs ? '100vh' : heightStyle,
        left: fs ? 0 : undefined,
        top: fs ? 0 : undefined,
        right: fs ? 0 : undefined,
        bottom: fs ? 0 : undefined,
        background: '#fff',
        borderRadius: fs ? 0 : 8,
        overflow: 'hidden'
      }}
    >
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setFs((v) => !v)}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, opacity: 0.9 }}
      >
        {fs ? '退出全屏 (Esc)' : '⤢ 全屏'}
      </button>
      <div
        ref={wrapRef}
        style={{ position: 'absolute', inset: 0, borderRadius: 8, overflow: 'hidden' }}
      >
        {/* @ts-expect-error Electron custom element */}
        <webview
          ref={wvRef as never}
          src={url}
          partition="persist:guistudy"
          allowpopups={false}
          disablewebsecurity={false}
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
