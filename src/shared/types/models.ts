/**
 * SongCat 数据模型
 * 包含两类：
 *   1. `*Row` —— 数据库行的原始形态（boolean 存为 0/1，时间为 ISO 字符串）
 *   2. 业务模型 —— 经转换、贴近业务语义的形态（boolean、命名 camelCase）
 * main 端负责 Row ↔ 业务模型的转换。
 */
import type {
  AssetSourcePolicy,
  DownloadJobStatus,
  Instrument,
  PracticeStopReason,
  ResourceSourceKind,
  ResourceSourcePolicy,
  ScoreAssetSource,
  ScoreAssetType,
  SongStatus,
  SourceLinkKind
} from './enums'

/** 难度：1–5 星，可为空 */
export type Difficulty = 1 | 2 | 3 | 4 | 5

/* ------------------------------------------------------------------ */
/* 数据库行类型                                                          */
/* ------------------------------------------------------------------ */

export interface SongRow {
  id: string
  title: string
  title_pinyin_initial: string | null
  artist: string | null
  artist_normalized: string | null
  status: SongStatus
  is_favorite: 0 | 1
  difficulty: number | null
  notes: string | null
  original_audio_url: string | null
  date_added: string
  date_updated: string
  last_opened_at: string | null
}

export interface ScoreAssetRow {
  id: string
  song_id: string
  type: ScoreAssetType
  title: string | null
  local_path: string | null
  source_url: string | null
  source_name: string | null
  source_policy: AssetSourcePolicy
  source: ScoreAssetSource
  instrument: Instrument | null
  file_hash: string | null
  file_size: number | null
  mime_type: string | null
  original_filename: string | null
  date_added: string
  is_primary: 0 | 1
}

export interface SourceLinkRow {
  id: string
  song_id: string
  url: string
  source_name: string | null
  kind: SourceLinkKind
  title: string | null
  notes: string | null
  date_added: string
  last_checked_at: string | null
}

export interface PracticeSessionRow {
  id: string
  song_id: string
  started_at: string
  ended_at: string | null
  duration_seconds: number
  last_heartbeat_at: string | null
  stop_reason: PracticeStopReason | null
  created_at: string
}

export interface RecordingRow {
  id: string
  song_id: string
  local_path: string
  file_hash: string | null
  file_size: number | null
  duration_seconds: number | null
  recorded_at: string
  mime_type: string | null
}

export interface ResourceSourceRow {
  id: string
  name: string
  base_url: string | null
  search_url_template: string | null
  enabled: 0 | 1
  kind: ResourceSourceKind
  policy: ResourceSourcePolicy
  notes: string | null
  created_at: string
  updated_at: string
}

export interface DownloadJobRow {
  id: string
  song_id: string | null
  source_url: string
  source_name: string | null
  target_asset_id: string | null
  status: DownloadJobStatus
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface SettingRow {
  key: string
  value_json: string
  updated_at: string
}

/* ------------------------------------------------------------------ */
/* 业务模型                                                              */
/* ------------------------------------------------------------------ */

export interface Song {
  id: string
  title: string
  titlePinyinInitial: string | null
  artist: string | null
  artistNormalized: string | null
  status: SongStatus
  isFavorite: boolean
  difficulty: Difficulty | null
  notes: string | null
  originalAudioUrl: string | null
  dateAdded: string
  dateUpdated: string
  lastOpenedAt: string | null
}

/** 列表展示用的轻量歌曲（带聚合计数） */
export interface SongSummary extends Song {
  scoreCount: number
  hasPdf: boolean
  hasRecording: boolean
  hasPractice: boolean
  totalPracticeSeconds: number
  lastPracticedAt: string | null
}

export interface ScoreAsset {
  id: string
  songId: string
  type: ScoreAssetType
  title: string | null
  /** renderer 用 `localFileUrl`（自定义协议）访问；本地路径不暴露给 renderer */
  hasLocalFile: boolean
  sourceUrl: string | null
  sourceName: string | null
  sourcePolicy: AssetSourcePolicy
  /** 来源：guistudy（只存URL嵌入查看）/ local / ai */
  source: ScoreAssetSource
  /** 乐器分类（guitar/ukulele），可为空 */
  instrument: Instrument | null
  fileSize: number | null
  mimeType: string | null
  originalFilename: string | null
  dateAdded: string
  isPrimary: boolean
}

export interface SourceLink {
  id: string
  songId: string
  url: string
  sourceName: string | null
  kind: SourceLinkKind
  title: string | null
  notes: string | null
  dateAdded: string
  lastCheckedAt: string | null
}

export interface PracticeSession {
  id: string
  songId: string
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  lastHeartbeatAt: string | null
  stopReason: PracticeStopReason | null
  createdAt: string
}

export interface Recording {
  id: string
  songId: string
  /** renderer 用 `playbackUrl` 播放；本地路径不暴露 */
  durationSeconds: number | null
  recordedAt: string
  mimeType: string | null
  fileSize: number | null
}

export interface ResourceSource {
  id: string
  name: string
  baseUrl: string | null
  searchUrlTemplate: string | null
  enabled: boolean
  kind: ResourceSourceKind
  policy: ResourceSourcePolicy
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface DownloadJob {
  id: string
  songId: string | null
  sourceUrl: string
  sourceName: string | null
  targetAssetId: string | null
  status: DownloadJobStatus
  errorMessage: string | null
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

/* ------------------------------------------------------------------ */
/* 复合 / 聚合类型                                                       */
/* ------------------------------------------------------------------ */

export interface SongDetail extends SongSummary {
  scores: ScoreAsset[]
  sourceLinks: SourceLink[]
  recording: Recording | null
  recentSessions: PracticeSession[]
}

/** 单条搜索结果（免费资源站或 DeepSeek 候选统一形态之一） */
export interface FreeSourceSearchResult {
  sourceName: string
  sourcePolicy: ResourceSourcePolicy
  title: string | null
  url: string
  /** 推断的资源类型（若能识别） */
  inferredType: ScoreAssetType | null
  snippet: string | null
}

/** DeepSeek 候选（见设计 §9.3 schema） */
export interface AiCandidateSource {
  sourceName: string
  searchQuery: string
  url: string
  reason: string
}

export interface AiCandidate {
  title: string
  artist: string | null
  confidence: number
  suggestedQueries: string[]
  possibleSources: AiCandidateSource[]
  notes: string
}

/** Dashboard 统计（见设计 §12） */
export interface DashboardStats {
  totalSongs: number
  toLearnCount: number
  learningCount: number
  learnedCount: number
  favoriteCount: number
  todayPracticeSeconds: number
  monthPracticeSeconds: number
  yearPracticeSeconds: number
  /** 最近 N 天的练习分钟趋势 */
  trend: { date: string; seconds: number }[]
  /** 今日各歌曲练习占比 */
  todayBySong: { songId: string; title: string; artist: string | null; seconds: number }[]
  /** 全部练习的艺人占比 */
  byArtist: { artist: string | null; seconds: number }[]
  /** 最近练习的歌曲 */
  recentPractice: {
    songId: string
    title: string
    artist: string | null
    lastPracticedAt: string
    secondsToday: number
  }[]
}

/** 健康检查报告（见设计 §15.3） */
export interface HealthReport {
  missingScoreFiles: { assetId: string; songId: string; title: string }[]
  missingRecordings: { songId: string; title: string }[]
  unfinishedDownloads: { jobId: string; sourceUrl: string }[]
  unfinishedPracticeSessions: { sessionId: string; songId: string }[]
  orphanTempFiles: string[]
  /** 已执行的恢复/清理动作摘要 */
  recovered: string[]
}
