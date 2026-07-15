import { useSyncExternalStore } from 'react'

function getTheme(): string {
  return document.documentElement.dataset.theme || 'light'
}

function subscribe(callback: () => void): () => void {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  })
  return () => observer.disconnect()
}

/** 响应式检测当前主题，data-theme 变化时自动更新 */
export function useTheme(): { isDark: boolean; theme: string } {
  const theme = useSyncExternalStore(subscribe, getTheme)
  return { isDark: theme === 'dark', theme }
}
