/**
 * guistudy 曲谱嵌入查看器。
 *
 * 从截图分析：webview 容器很大，但网页只渲染了顶部一小部分。
 * 可能原因：guistudy 是移动端网页，在桌面端 webview 中显示不正常。
 * 解决方案：设置移动端 useragent，让网页返回移动端版本。
 *
 * 全屏修复：Electron webview 内部使用 display:flex 确保 iframe 填满容器。
 * 关键是让 webview 通过 CSS flex 布局自动填满父容器，而不是用 JS 手动设置像素值。
 * 参考：https://www.electronjs.org/docs/latest/api/webview-tag#css-styling-notes
 */
import { useEffect, useRef, useState } from 'react'

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
  const wvRef = useRef<HTMLElement & {
    insertCSS?: (css: string) => Promise<unknown>
    executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>
    addEventListener: (t: string, cb: () => void) => void
    removeEventListener: (t: string, cb: () => void) => void
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any
  }>(null)

  // webview ready 时注入 CSS 和设置 useragent
  useEffect(() => {
    const wv = wvRef.current
    if (!wv) return

    const onReady = () => {
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
        因此只需确保 webview 本身通过 CSS 填满其父容器即可，无需 JS 手动设置像素尺寸。
        参考：https://www.electronjs.org/docs/latest/api/webview-tag#css-styling-notes
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
          src={url}
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
}
