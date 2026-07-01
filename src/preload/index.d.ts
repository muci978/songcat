/**
 * Renderer 侧的全局类型声明：window.songcat 是 preload 暴露的 SongCatApi。
 */
import type { SongCatApi } from '@shared'

declare global {
  interface Window {
    songcat: SongCatApi
  }
}

export {}
