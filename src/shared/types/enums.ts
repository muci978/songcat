/**
 * SongCat 共享枚举 / 字面量类型
 * 被 main、preload、renderer 三端共享。不要在此 import 任何 Node 或 DOM 专属 API。
 */

/** 歌曲学习状态（与收藏独立） */
export type SongStatus = 'to-learn' | 'learning' | 'learned'

export const SONG_STATUSES: readonly SongStatus[] = ['to-learn', 'learning', 'learned'] as const

/** 曲谱资源类型 */
export type ScoreAssetType = 'pdf' | 'image' | 'link'

export const SCORE_ASSET_TYPES: readonly ScoreAssetType[] = ['pdf', 'image', 'link'] as const

/**
 * 曲谱资源来源策略（score_assets.source_policy）
 * - free-direct：免费资源站，已直接下载到本地
 * - free-link-only：免费资源站，仅保存链接（无法或不允许直接下载）
 * - user-imported：用户手动导入的本地文件
 * - unknown：来源不明
 */
export type AssetSourcePolicy = 'free-direct' | 'free-link-only' | 'user-imported' | 'unknown'

/** source_links.kind —— 来源链接的用途分类 */
export type SourceLinkKind = 'score' | 'audio' | 'reference' | 'search-result'

/** practice_sessions.stop_reason —— 练习会话结束原因 */
export type PracticeStopReason =
  | 'manual'
  | 'leave-score-view'
  | 'switch-song'
  | 'app-close'
  | 'recovery'

/** resource_sources.kind —— 免费资源站类型 */
export type ResourceSourceKind = 'score' | 'audio' | 'mixed'

/**
 * resource_sources.policy —— 免费资源站下载策略
 * - direct-download：明确允许直接下载公开 PDF/图片
 * - link-only：只保存网页链接，不自动抓取
 * - browser-only：用系统浏览器打开，不在 app 内抓取
 */
export type ResourceSourcePolicy = 'direct-download' | 'link-only' | 'browser-only'

/** download_jobs.status */
export type DownloadJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** 视觉主题 */
export type ThemeMode = 'system' | 'light' | 'dark'

/** 列表密度 */
export type ListDensity = 'compact' | 'comfortable'
