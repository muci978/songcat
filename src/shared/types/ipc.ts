/**
 * SongCat IPC 契约
 * - channel 名称常量（main 注册 handler、preload 调用 invoke 时共用，避免字符串散落）
 * - 请求 / 响应 DTO 类型
 * - 统一返回结构 IpcResult<T> 与 IpcError
 * - preload 暴露的 typed API 接口 SongCatApi
 *
 * 设计原则（见设计稿 §3.2、§17.4）：
 *   - 所有输入经 schema 校验；错误以统一结构返回。
 *   - 本地文件路径不直接暴露给 renderer；renderer 通过自定义协议访问本地文件。
 */
import type {
  AiCandidate,
  DashboardStats,
  Difficulty,
  DownloadJob,
  FreeSourceSearchResult,
  HealthReport,
  Recording,
  ResourceSource,
  ScoreAsset,
  Song,
  SongDetail,
  SongSummary
} from './models'
import type {
  ListDensity,
  ResourceSourceKind,
  ResourceSourcePolicy,
  ScoreAssetSource,
  Instrument,
  SongStatus,
  ThemeMode
} from './enums'

/* ------------------------------------------------------------------ */
/* 统一错误与返回结构                                                     */
/* ------------------------------------------------------------------ */

export type ErrorCode =
  | 'VALIDATION' // 参数校验失败
  | 'NOT_FOUND' // 资源不存在
  | 'CONFLICT' // 状态冲突（如每首歌唯一录音、每首歌唯一进行中 session）
  | 'UNAUTHORIZED' // API key 未配置或无效
  | 'NETWORK' // 网络错误
  | 'RATE_LIMIT' // 被限速 / 反爬
  | 'AI' // DeepSeek 解析 / schema 校验失败
  | 'IO' // 文件系统 / 数据库错误
  | 'UNSUPPORTED_TYPE' // 不支持的文件类型 / MIME 不匹配
  | 'BLOCKED' // 命中付费墙 / 登录 / 验证码 / DRM，拒绝抓取
  | 'INTERNAL' // 未分类内部错误

export interface IpcError {
  code: ErrorCode
  message: string
  details?: unknown
}

export type IpcResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: IpcError }

/** 构造成功结果（main handler 用） */
export const ok = <T>(data: T): IpcResult<T> => ({ ok: true, data })
/** 构造失败结果（main handler 用） */
export const fail = (code: ErrorCode, message: string, details?: unknown): IpcError => ({
  code,
  message,
  details
})

/* ------------------------------------------------------------------ */
/* channel 名称常量                                                      */
/* ------------------------------------------------------------------ */

export const IPC = {
  library: {
    search: 'library:search',
    getSong: 'library:getSong',
    create: 'library:create',
    update: 'library:update',
    delete: 'library:delete',
    touch: 'library:touch',
    findOrCreate: 'library:findOrCreate'
  },
  assets: {
    list: 'assets:list',
    importFileDialog: 'assets:importFileDialog',
    importFilePath: 'assets:importFilePath',
    addScoreLink: 'assets:addScoreLink',
    update: 'assets:update',
    remove: 'assets:remove',
    setPrimary: 'assets:setPrimary',
    openLocalFolder: 'assets:openLocalFolder'
  },
  sources: {
    list: 'sources:list',
    create: 'sources:create',
    update: 'sources:update',
    remove: 'sources:remove',
    searchFreeSources: 'sources:searchFreeSources'
  },
  downloads: {
    startDownload: 'downloads:startDownload'
  },
  ai: {
    searchCandidates: 'ai:searchCandidates',
    testConnection: 'ai:testConnection'
  },
  practice: {
    startSession: 'practice:startSession',
    pauseSession: 'practice:pauseSession',
    resumeSession: 'practice:resumeSession',
    stopSession: 'practice:stopSession',
    heartbeat: 'practice:heartbeat',
    getActiveForSong: 'practice:getActiveForSong'
  },
  recording: {
    saveLatestTake: 'recording:saveLatestTake',
    getForSong: 'recording:getForSong',
    remove: 'recording:remove'
  },
  dashboard: {
    getStats: 'dashboard:getStats'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set',
    setDeepSeekKey: 'settings:setDeepSeekKey',
    deleteDeepSeekKey: 'settings:deleteDeepSeekKey'
  },
  backup: {
    exportZip: 'backup:exportZip'
  },
  health: {
    runCheck: 'health:runCheck'
  },
  system: {
    openExternal: 'system:openExternal',
    openPath: 'system:openPath',
    openLogsFolder: 'system:openLogsFolder',
    getPathInfo: 'system:getPathInfo',
    appVersion: 'system:appVersion'
  }
} as const

/* ------------------------------------------------------------------ */
/* 请求 DTO                                                              */
/* ------------------------------------------------------------------ */

export interface SongSearchQuery {
  text?: string
  status?: SongStatus
  isFavorite?: boolean
  artist?: string
  /** 按添加日期排序：'newest' | 'oldest' */
  dateSort?: 'newest' | 'oldest'
  minDifficulty?: Difficulty
  maxDifficulty?: Difficulty
  hasPdf?: boolean
  hasRecording?: boolean
  hasPractice?: boolean
  /** 首字母筛选（拉丁标题首字母或中文拼音首字母，大写） */
  initial?: string
  limit?: number
  offset?: number
}

export interface CreateSongInput {
  title: string
  artist?: string | null
  status?: SongStatus
  isFavorite?: boolean
  difficulty?: Difficulty | null
  notes?: string | null
  originalAudioUrl?: string | null
}

export type UpdateSongInput = Partial<CreateSongInput>

export interface AddScoreLinkInput {
  title?: string | null
  url: string
  sourceName?: string | null
  /** 来源：guistudy（嵌入查看）/ local / ai；默认 local */
  source?: ScoreAssetSource
  instrument?: Instrument | null
  notes?: string | null
}

export interface ImportFilePathInput {
  songId: string
  /** main 端可直接处理的本地文件绝对路径（如下载完成后的临时文件） */
  filePath: string
  sourceUrl?: string | null
  sourceName?: string | null
  sourcePolicy?: import('./enums').AssetSourcePolicy
  originalFilename?: string | null
  title?: string | null
  groupId?: string | null
  groupSort?: number
}

export interface CreateResourceSourceInput {
  name: string
  baseUrl?: string | null
  searchUrlTemplate?: string | null
  enabled?: boolean
  kind: ResourceSourceKind
  policy: ResourceSourcePolicy
  notes?: string | null
}

export type UpdateResourceSourceInput = Partial<CreateResourceSourceInput> & { id: string }

export interface StartDownloadInput {
  songId: string
  sourceUrl: string
  sourceName?: string | null
  sourcePolicy: ResourceSourcePolicy
  title?: string | null
}

export interface SaveRecordingInput {
  songId: string
  /** webm/opus 等录音原始字节 */
  arrayBuffer: ArrayBuffer
  mimeType: string
  durationSeconds: number
}

export interface AiSearchInput {
  query: string
}

export interface TestDeepSeekResult {
  ok: boolean
  /** key 后四位（回显，非完整 key） */
  keySuffix: string | null
  model: string | null
  latencyMs: number | null
  message: string
}

/* ------------------------------------------------------------------ */
/* 设置（settings）                                                      */
/* ------------------------------------------------------------------ */

export interface AppSettings {
  // 免费资源站全局开关、默认搜索引擎
  defaultResourceSourceId: string | null
  searchTimeoutMs: number
  downloadTimeoutMs: number

  // DeepSeek
  deepSeekEnabled: boolean
  deepSeekBaseUrl: string
  /** 模型名高级设置（可空，见设计 §9.2） */
  deepSeekModel: string | null
  /** 是否已配置 key（key 本体存在系统安全存储） */
  deepSeekKeyConfigured: boolean
  deepSeekKeyLastFour: string | null
  deepSeekKeyLastVerifiedAt: string | null

  // 外观
  theme: ThemeMode
  accent: string
  listDensity: ListDensity

  // 曲库（第一版只读位置）
  libraryPath: string
}

/* ------------------------------------------------------------------ */
/* 系统信息                                                              */
/* ------------------------------------------------------------------ */

export interface PathInfo {
  libraryPath: string
  dbPath: string
  logsPath: string
  backupsPath: string
  userDataPath: string
}

/* ------------------------------------------------------------------ */
/* preload 暴露的 typed API（SongCatApi）                                */
/* ------------------------------------------------------------------ */

export interface LibraryApi {
  search(q: SongSearchQuery): Promise<IpcResult<SongSummary[]>>
  getSong(id: string): Promise<IpcResult<SongDetail>>
  create(input: CreateSongInput): Promise<IpcResult<Song>>
  update(id: string, input: UpdateSongInput): Promise<IpcResult<Song>>
  delete(id: string): Promise<IpcResult<{ deleted: boolean }>>
  /** 更新 last_opened_at（进入 Practice View 时调用） */
  touch(id: string): Promise<IpcResult<void>>
  /** 按标题+艺人查找；不存在则创建（搜索结果一键入库用） */
  findOrCreate(title: string, artist?: string | null): Promise<IpcResult<Song>>
}

export interface AssetsApi {
  list(songId: string): Promise<IpcResult<ScoreAsset[]>>
  /** 弹出原生文件选择对话框，导入 PDF/图片（可多选） */
  importFileDialog(songId: string): Promise<IpcResult<ScoreAsset[]>>
  /** main 端直接按路径导入（用于已下载到本地的文件） */
  importFilePath(input: ImportFilePathInput): Promise<IpcResult<ScoreAsset>>
  addScoreLink(songId: string, input: AddScoreLinkInput): Promise<IpcResult<ScoreAsset>>
  setPrimary(assetId: string): Promise<IpcResult<void>>
  remove(assetId: string): Promise<IpcResult<{ removed: boolean }>>
  openLocalFolder(assetId: string): Promise<IpcResult<void>>
}

export interface SourcesApi {
  list(): Promise<IpcResult<ResourceSource[]>>
  create(input: CreateResourceSourceInput): Promise<IpcResult<ResourceSource>>
  update(input: UpdateResourceSourceInput): Promise<IpcResult<ResourceSource>>
  remove(id: string): Promise<IpcResult<{ removed: boolean }>>
  searchFreeSources(query: string): Promise<IpcResult<FreeSourceSearchResult[]>>
}

export interface DownloadsApi {
  startDownload(input: StartDownloadInput): Promise<IpcResult<ScoreAsset | DownloadJob>>
}

export interface AiApi {
  searchCandidates(input: AiSearchInput): Promise<IpcResult<AiCandidate[]>>
  testConnection(): Promise<IpcResult<TestDeepSeekResult>>
}

export interface PracticeApi {
  startSession(songId: string): Promise<IpcResult<{ sessionId: string }>>
  pauseSession(sessionId: string): Promise<IpcResult<void>>
  resumeSession(sessionId: string): Promise<IpcResult<void>>
  stopSession(sessionId: string, reason?: import('./enums').PracticeStopReason): Promise<IpcResult<void>>
  heartbeat(sessionId: string): Promise<IpcResult<void>>
  getActiveForSong(songId: string): Promise<IpcResult<{ sessionId: string } | null>>
}

export interface RecordingApi {
  saveLatestTake(input: SaveRecordingInput): Promise<IpcResult<Recording>>
  getForSong(songId: string): Promise<IpcResult<Recording | null>>
  remove(songId: string): Promise<IpcResult<{ removed: boolean }>>
}

export interface DashboardApi {
  getStats(): Promise<IpcResult<DashboardStats>>
}

export interface SettingsApi {
  get(): Promise<IpcResult<AppSettings>>
  set(patch: Partial<AppSettings>): Promise<IpcResult<AppSettings>>
  /** key 本体写入系统安全存储；DB 只存后四位与是否已配置 */
  setDeepSeekKey(key: string): Promise<IpcResult<AppSettings>>
  deleteDeepSeekKey(): Promise<IpcResult<AppSettings>>
}

export interface BackupApi {
  exportZip(): Promise<IpcResult<{ path: string }>>
}

export interface HealthApi {
  runCheck(): Promise<IpcResult<HealthReport>>
}

export interface SystemApi {
  /** 外部链接走系统浏览器（设计 §2.1、§17.4） */
  openExternal(url: string): Promise<IpcResult<boolean>>
  openPath(path: string): Promise<IpcResult<boolean>>
  openLogsFolder(): Promise<IpcResult<boolean>>
  getPathInfo(): Promise<IpcResult<PathInfo>>
  appVersion(): Promise<IpcResult<string>>
}

export interface SongCatApi {
  library: LibraryApi
  assets: AssetsApi
  sources: SourcesApi
  downloads: DownloadsApi
  ai: AiApi
  practice: PracticeApi
  recording: RecordingApi
  dashboard: DashboardApi
  settings: SettingsApi
  backup: BackupApi
  health: HealthApi
  system: SystemApi
}
