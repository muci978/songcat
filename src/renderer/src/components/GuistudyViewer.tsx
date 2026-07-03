/**
 * guistudy 曲谱嵌入查看器。
 *
 * Electron <webview> 不会随 flex 容器自动撑满，因此：
 *   1. 外层容器使用 flex 布局，自动填充父容器。
 *   2. 内部用一个相对定位的测量面，通过 ResizeObserver 拿到真实像素尺寸。
 *   3. 把像素宽高同时写进 <webview> 的 style 和 DOM property，触发渲染层重排。
 *   4. 在 webview dom-ready 后应用尺寸，避免初始尺寸错误导致后续无法调整。
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
   * 外层容器高度。如果不传，组件会自动填充父容器（需要父容器是 flex 容器）。
   * 如果传固定值（如 700）或 '100%'，则使用指定高度。
   */
  height?: string | number
}

export function GuistudyViewer({ url, height }: GuistudyViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
  const [{ w, h }, setSize] = useState({ w: 800, h: 600 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const wvRef = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    addEventListener: (t: string, cb: () => void) => void
    removeEventListener: (t: string, cb: () => void) => void
    executeJavaScript?: (code: string) => Promise<unknown>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }>(null)
  const readyRef = useRef(false)
  const pendingSizeRef = useRef<{ w: number; h: number } | null>(null)

  /** 同步地把像素尺寸写给 webview（style + attr + 强制重排三保险） */
  const applyWebviewSize = (width: number, height: number) => {
    const el = wvRef.current
    if (!el || width <= 0 || height <= 0) return

    // 保存到 pending，如果 webview 还没 ready，等 ready 后再应用
    pendingSizeRef.current = { w: width, h: height }

    // 如果 webview 还没 ready，不应用尺寸（避免应用错误尺寸）
    if (!readyRef.current) return

    const s = el.style as unknown as Record<string, string>
    s.width = `${width}px`
    s.height = `${height}px`

    try {
      el.setAttribute('width', `${width}`)
      el.setAttribute('height', `${height}`)

      // 强制重排 - 多种方法确保生效
      void el.offsetHeight

      // 如果以上方法不够，尝试修改 display 强制重绘
      const originalDisplay = s.display
      s.display = 'none'
      void el.offsetHeight
      s.display = originalDisplay || 'block'
      void el.offsetHeight

      // 通知 webview 内部页面尺寸变化
      if (el.executeJavaScript) {
        el.executeJavaScript(`
          window.dispatchEvent(new Event('resize'));
          if (window.onresize) window.onresize();
        `).catch(() => {})
      }
    } catch {
      /* ignore */
    }
  }

  // 注入隐藏 guistudy 广告/header/footer 的 CSS，并在 dom-ready 时应用尺寸
  useEffect(() => {
    const wv = wvRef.current
    if (!wv) return

    const onReady = () => {
      readyRef.current = true
      wv.insertCSS?.(HIDE_CSS).catch(() => {})

      // 应用待处理的尺寸
      const pending = pendingSizeRef.current
      if (pending) {
        applyWebviewSize(pending.w, pending.h)
      }
    }

    wv.addEventListener('dom-ready', onReady)
    wv.addEventListener('did-navigate-in-page', onReady)

    return () => {
      readyRef.current = false
      wv.removeEventListener('dom-ready', onReady)
      wv.removeEventListener('did-navigate-in-page', onReady)
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
    let stableCount = 0
    let lastRect = { width: 0, height: 0 }

    const measure = () => {
      const rect = el.getBoundingClientRect()
      const newW = Math.max(320, Math.round(rect.width))
      const newH = Math.max(240, Math.round(rect.height))

      // 防抖：连续两次测量结果相同才应用
      if (rect.width === lastRect.width && rect.height === lastRect.height) {
        stableCount++
      } else {
        stableCount = 0
        lastRect = { width: rect.width, height: rect.height }
      }

      // 第一次测量或稳定后更新
      if (stableCount >= 1) {
        setSize({ w: newW, h: newH })
      }
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
    const timers = [
      setTimeout(measure, 0),
      setTimeout(measure, 50),
      setTimeout(measure, 100),
      setTimeout(measure, 250),
      setTimeout(measure, 500),
      setTimeout(measure, 1000),
    ]

    return () => {
      timers.forEach(clearTimeout)
      if (ro) {
        ro.disconnect()
      } else {
        window.removeEventListener('resize', measure)
      }
    }
  }, [url])

  // 每次测到的新尺寸都立即应用到 webview
  useLayoutEffect(() => {
    applyWebviewSize(w, h)
  }, [w, h])

  const containerStyle = height
    ? { height: typeof height === 'number' ? `${height}px` : height }
    : { flex: 1, minHeight: 0 }

  return (
    <div
      className={fs ? '' : 'guistudy-viewer'}
      style={{
        position: fs ? 'fixed' : 'relative',
        zIndex: fs ? 9999 : 'auto',
        width: fs ? '100vw' : '100%',
        height: fs ? '100vh' : undefined,
        left: fs ? 0 : undefined,
        top: fs ? 0 : undefined,
        right: fs ? 0 : undefined,
        bottom: fs ? 0 : undefined,
        background: '#fff',
        borderRadius: fs ? 0 : 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...containerStyle,
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
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          borderRadius: 8,
        }}
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
            background: '#fff',
          }}
        />
      </div>
    </div>
  )
}
