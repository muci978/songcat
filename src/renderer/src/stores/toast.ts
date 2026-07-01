/** 轻量 toast store（zustand） */
import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'
interface ToastItem {
  id: string
  message: string
  kind: ToastKind
}
interface ToastState {
  toasts: ToastItem[]
  show: (message: string, kind?: ToastKind) => void
  dismiss: (id: string) => void
}

export const useToast = create<ToastState>((set) => ({
  toasts: [],
  show: (message, kind = 'info') => {
    const id = Math.random().toString(36).slice(2)
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 3800)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}))

export const toast = {
  info: (m: string) => useToast.getState().show(m, 'info'),
  success: (m: string) => useToast.getState().show(m, 'success'),
  error: (m: string) => useToast.getState().show(m, 'error')
}
