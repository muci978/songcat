/**
 * guistudy 曲谱嵌入查看器。
 *
 * 从截图分析：webview 容器很大，但网页只渲染了顶部一小部分。
 * 可能原因：guistudy 是移动端网页，在桌面端 webview 中显示不正常。
 * 解决方案：设置移动端 useragent，让网页返回移动端版本。
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/** 隐藏广告 + 强制内容填充 */
const MINIMAL_HIDE_CSS = `
  [class*="popup-ad"], [class*="ad-banner"], [class*="app-download"],
  .adsbygoogle, iframe[src*="ad"] {
    display: none !important;
  }
  /* 强制 guistudy 内容填充 */
  html, body {
    width: 100% !important;
    height: auto !important;
    min-height: 100% !important;
    overflow-y: auto !important;
  }
  body > * {
    max-width: 100% !important;
  }
`

/** 移动端 User-Agent */
const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

interface GuistudyViewerProps {
  url: string
  height?: string | number
}

export function GuistudyViewer({ url, height }: GuistudyViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
  const [{ w, h }, setSize] = useState({ w: 800, h: 600 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const wvRef = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
    addEventListener: (t: string, cb: () => void) => void
    removeEventListener: (t: string, cb: () => void) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }>(null)
  const readyRef = useRef(false)
  const pendingSizeRef = useRef<{ w: number; h: number } | null>(null)

  /** 同步地把像素尺寸写给 webview */
  const applyWebviewSize = (width: number, height: number) => {
    const el = wvRef.current
    if (!el || width <= 0 || height <= 0) return
    pendingSizeRef.current = { w: width, h: height }
    if (!readyRef.current) return

    const s = el.style as unknown as Record<string, string>
    s.width = `${width}px`
    s.height = `${height}px`

    try {
      el.setAttribute('width', `${width}`)
      el.setAttribute('height', `${height}`)
      void el.offsetHeight
    } catch { /* ignore */ }
  }

  // webview ready 时注入 CSS 和设置 useragent
  useEffect(() => {
    const wv = wvRef.current
    if (!wv) return

    const onReady = () => {
      readyRef.current = true
      wv.insertCSS?.(MINIMAL_HIDE_CSS).catch(() => {})

      // 强制设置 viewport，确保内容正确缩放
      wv.executeJavaScript?.(`
        (function() {
          // 移除现有的 viewport meta 标签
          const existing = document.querySelector('meta[name="viewport"]');
          if (existing) existing.remove();

          // 创建新的 viewport meta 标签
          const meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes';
          document.head.appendChild(meta);

          // 强制 body 高度自适应
          document.body.style.height = 'auto';
          document.body.style.minHeight = '100vh';
          document.documentElement.style.height = 'auto';
        })();
      `).catch(() => {})

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

  // 监听容器尺寸
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

      if (rect.width === lastRect.width && rect.height === lastRect.height) {
        stableCount++
      } else {
        stableCount = 0
        lastRect = { width: rect.width, height: rect.height }
      }

      if (stableCount >= 1) {
        setSize({ w: newW, h: newH })
      }
    }

    try {
      ro = new ResizeObserver(measure)
      ro.observe(el)
    } catch {
      window.addEventListener('resize', measure)
    }

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
      if (ro) ro.disconnect()
      else window.removeEventListener('resize', measure)
    }
  }, [url])

  // 尺寸变化时应用到 webview
  useLayoutEffect(() => {
    applyWebviewSize(w, h)
  }, [w, h])

  const containerStyle = height
    ? { height: typeof height === 'number' ? `${height}px` : height, flex: 'none' as const }
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
          overflow: 'hidden',
        }}
      >
        {/* @ts-expect-error Electron custom element */}
        <webview
          ref={wvRef as never}
          src={url}
          partition="persist:guistudy"
          allowpopups={false}
          disablewebsecurity={false}
          nodeintegration={false}
          nodeIntegration={false}
          useragent={MOBILE_USER_AGENT}
          webpreferences="zoomFactor=1.0, defaultZoomLevel=0, contextIsolation=true, sandbox=true"
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
            background: '#fff',
          }}
        />
      </div>
    </div>
  )
}
