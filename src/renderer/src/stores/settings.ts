/** Settings store：加载/更新设置，并把 theme/accent/density 应用到 <html> */
import { create } from 'zustand'
import type { AppSettings } from '@shared'
import { api, unwrap } from '../lib/api'

interface SettingsState {
  settings: AppSettings | null
  load: () => Promise<void>
  update: (patch: Partial<AppSettings>) => Promise<void>
  applyTheme: () => void
}

export const useSettings = create<SettingsState>((set, get) => ({
  settings: null,
  load: async () => {
    try {
      const s = await unwrap(api.settings.get())
      set({ settings: s })
      get().applyTheme()
      // 跟随系统主题变化（仅 theme=system 时由 applyTheme 重新判定）
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (get().settings?.theme === 'system') get().applyTheme()
      })
    } catch {
      /* 忽略：UI 用默认主题 */
    }
  },
  applyTheme: () => {
    const s = get().settings
    if (!s) return
    const root = document.documentElement
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = s.theme === 'dark' || (s.theme === 'system' && prefersDark)
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.density = s.listDensity
    if (s.accent) root.style.setProperty('--accent', s.accent)
  },
  update: async (patch) => {
    const s = await unwrap(api.settings.set(patch))
    set({ settings: s })
    get().applyTheme()
  }
}))
