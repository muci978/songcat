/**
 * SongCat 共享常量
 * 不依赖 Node / DOM，可被三端引用。
 */
import type { AppSettings } from './types/ipc'

/** 自定义协议：renderer 通过此 URL 访问本地曲谱文件（main 端按 assetId 查库校验后返回流） */
export const LOCAL_ASSET_PROTOCOL = 'songcat-asset'
/** 自定义协议：renderer 通过此 URL 访问某歌最新录音（main 端按 songId 查库校验后返回流） */
export const LOCAL_RECORDING_PROTOCOL = 'songcat-recording'

/** 数据库文件名 */
export const DB_FILENAME = 'songcat.db'

/** 目录相对名（相对 userData 根） */
export const DIR = {
  library: 'library',
  songs: 'songs',
  scores: 'scores',
  images: 'images',
  recordings: 'recordings',
  imports: 'imports',
  cache: 'cache',
  thumbnails: 'thumbnails',
  downloads: 'downloads',
  backups: 'backups',
  logs: 'logs'
} as const

/** 练习心跳间隔（设计 §5.4：每 30 秒更新一次） */
export const HEARTBEAT_INTERVAL_MS = 30_000

/** 异常恢复时无心跳 session 的时长上限（设计 §10.3：60 分钟） */
export const MAX_RECOVERY_SESSION_MINUTES = 60

/** 允许导入/下载的 PDF MIME */
export const PDF_MIMES = ['application/pdf'] as const
/** 允许导入/下载的图片 MIME */
export const IMAGE_MIMES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp'
] as const

/** 按扩展名推断资源类型 */
export const PDF_EXTENSIONS = ['.pdf'] as const
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'] as const

/** 录音允许的 MIME（MediaRecorder 产出） */
export const RECORDING_MIMES = ['audio/webm', 'audio/webm;codecs=opus', 'audio/ogg', 'audio/mp4'] as const

/** 内置免费资源站（设计：只内置 guistudy，SongCat 嵌入其曲谱页，本地只存 URL 索引） */
export const BUILTIN_RESOURCE_SOURCES = [
  {
    name: 'guistudy 谱全了',
    baseUrl: 'https://guistudy.com',
    searchUrlTemplate: 'https://guistudy.com/tabs?keyword={q}',
    enabled: true,
    kind: 'score' as const,
    policy: 'browser-only' as const,
    notes: '免费吉他谱/尤克里里谱站。SongCat 嵌入其曲谱页（复用播放/循环/变调等功能），本地只存 URL 索引，不下载文件。'
  }
]

/** 强调色色板（设计 §13.5：木色、暖橙、琥珀、柔和蓝绿） */
export const ACCENT_PALETTE = [
  { name: '暖橙', value: '#c2410c' },
  { name: '琥珀', value: '#b45309' },
  { name: '木色', value: '#9a6a3e' },
  { name: '陶土', value: '#a8412f' },
  { name: '柔和蓝绿', value: '#0f766e' },
  { name: '橄榄', value: '#707c3a' }
] as const

/**
 * 设置项默认值（不含运行时才知道的字段：libraryPath、deepSeek key 相关）。
 * main 端初始化 settings 时与持久化值合并。
 */
export const DEFAULT_SETTINGS_BASE = {
  defaultResourceSourceId: null,
  searchTimeoutMs: 15_000,
  downloadTimeoutMs: 60_000,
  deepSeekEnabled: false,
  deepSeekBaseUrl: 'https://api.deepseek.com',
  deepSeekModel: null,
  theme: 'system' as AppSettings['theme'],
  accent: '#c2410c',
  listDensity: 'comfortable' as AppSettings['listDensity']
}

/** 免责声明文案（设计 §17.1） */
export const DISCLAIMER_TEXT =
  '请确认你有权保存和使用该资源。SongCat 只帮助你管理个人曲库和免费公开资源链接。'

/** DeepSeek 隐私提示（设计 §9.4） */
export const DEEPSEEK_PRIVACY_TEXT =
  'DeepSeek 搜索会把你的搜索关键词发送给 DeepSeek。SongCat 不会默认上传你的本地 PDF、图片或录音。'
