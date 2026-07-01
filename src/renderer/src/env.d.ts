/// <reference types="vite/client" />

// Electron <webview> 标签的 JSX 声明（用于嵌入 guistudy 曲谱页）
declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src: string
          allowpopups?: boolean
          partition?: string
          useragent?: string
          disablewebsecurity?: boolean
        },
        HTMLElement
      >
    }
  }
}

export {}
