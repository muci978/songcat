/**
 * guistudy 曲谱嵌入查看器。
 *
 * 全屏机制：纯 CSS position:fixed + 100vw/100vh。
 * 全屏时通过 React Portal 渲染到 body 顶层，避免被祖先 overflow 裁切。
 * Electron webview 内部使用 display:flex 确保 iframe 填满容器。
 * 参考：https://www.electronjs.org/docs/latest/api/webview-tag#css-styling-notes
 */
import { useEffect, useRef, useState, memo } from 'react'
import { createPortal } from 'react-dom'

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

export const GuistudyViewer = memo(function GuistudyViewer({ url, height }: GuistudyViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
  const wvRef = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
    addEventListener: (t: string, cb: () => void) => void
    removeEventListener: (t: string, cb: () => void) => void
    [key: string]: any
  }>(null)

  const prevUrlRef = useRef(url)
  useEffect(() => {
    if (url !== prevUrlRef.current) {
      prevUrlRef.current = url
      const wv = wvRef.current
      if (wv) wv.src = url
    }
  }, [url])

  useEffect(() => {
    const wv = wvRef.current
    if (!wv) return
    const onReady = () => {
      wv.insertCSS?.(MINIMAL_HIDE_CSS).catch(() => {})
      wv.executeJavaScript?.(`
        (function() {
          const existing = document.querySelector('meta[name="viewport"]');
          if (existing) existing.remove();
          const meta = document.createElement('meta');
          meta.name = 'viewport';
          meta.content = 'width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes';
          document.head.appendChild(meta);

          // 强制 body 高度自适应
          document.body.style.height = 'auto';
          document.body.style.minHeight = '100vh';
          document.documentElement.style.height = 'auto';

          // 强制所有直接子元素填充宽度
          document.body.style.display = 'flex';
          document.body.style.flexDirection = 'column';
          document.body.style.alignItems = 'stretch';
        })();
      `).catch(() => {})
    }
    wv.addEventListener('dom-ready', onReady)
    wv.addEventListener('did-navigate-in-page', onReady)
    return () => {
      wv.removeEventListener('dom-ready', onReady)
      wv.removeEventListener('did-navigate-in-page', onReady)
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

  // 全屏时阻止背景滚动
  useEffect(() => {
    document.body.style.overflow = fs ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [fs])

  const containerStyle = height
    ? { height: typeof height === 'number' ? `${height}px` : height, flex: 'none' as const }
    : { flex: 1, minHeight: 0 }

  const viewer = (
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
        ...(fs ? {} : containerStyle),
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
      {/*
        webview 容器：使用 flex:1 + minHeight:0 确保填满剩余空间。
        Electron webview 内部使用 display:flex，子 iframe 会自动填满 webview 容器。
      */}
      <div
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
          src={prevUrlRef.current}
          partition="persist:guistudy"
          allowpopups={false}
          disablewebsecurity={false}
          nodeintegration={false}
          nodeIntegration={false}
          useragent={MOBILE_USER_AGENT}
          webpreferences="contextIsolation=true, sandbox=true"
          style={{
            display: 'flex',
            width: '100%',
            height: '100%',
            border: 0,
            background: '#fff',
          }}
        />
      </div>
    </div>
  )

  // 全屏时 Portal 到 body，避免被祖先 overflow 裁切
  return fs ? createPortal(viewer, document.body) : viewer
})
