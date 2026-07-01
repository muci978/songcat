/**
 * 数据库行 ↔ 业务模型映射。
 * 设计要点：score_assets.local_path 与 recordings.local_path 不暴露给 renderer，
 * 业务模型用 `hasLocalFile` / 由 main 经自定义协议提供访问（设计 §17.4）。
 */
import type {
  Difficulty,
  DownloadJob,
  PracticeSession,
  Recording,
  ResourceSource,
  ScoreAsset,
  Song,
  SongRow,
  SourceLink
} from '@shared'
import type {
  DownloadJobRow,
  PracticeSessionRow,
  RecordingRow,
  ResourceSourceRow,
  ScoreAssetRow,
  SourceLinkRow
} from '@shared'

export function rowToSong(r: SongRow): Song {
  return {
    id: r.id,
    title: r.title,
    titlePinyinInitial: r.title_pinyin_initial,
    artist: r.artist,
    artistNormalized: r.artist_normalized,
    status: r.status,
    isFavorite: !!r.is_favorite,
    difficulty: (r.difficulty ?? null) as Difficulty | null,
    notes: r.notes,
    originalAudioUrl: r.original_audio_url,
    dateAdded: r.date_added,
    dateUpdated: r.date_updated,
    lastOpenedAt: r.last_opened_at
  }
}

export interface SongSummaryRow extends SongRow {
  score_count: number
  has_pdf: 0 | 1
  has_recording: 0 | 1
  has_practice: 0 | 1
  total_practice_seconds: number
  last_practiced_at: string | null
}

export function rowToSongSummary(r: SongSummaryRow): import('@shared').SongSummary {
  const base = rowToSong(r)
  return {
    ...base,
    scoreCount: r.score_count,
    hasPdf: !!r.has_pdf,
    hasRecording: !!r.has_recording,
    hasPractice: !!r.has_practice,
    totalPracticeSeconds: r.total_practice_seconds,
    lastPracticedAt: r.last_practiced_at
  }
}

export function rowToScoreAsset(r: ScoreAssetRow): ScoreAsset {
  return {
    id: r.id,
    songId: r.song_id,
    type: r.type,
    title: r.title,
    hasLocalFile: !!r.local_path,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    sourcePolicy: r.source_policy,
    fileSize: r.file_size,
    mimeType: r.mime_type,
    originalFilename: r.original_filename,
    dateAdded: r.date_added,
    isPrimary: !!r.is_primary
  }
}

export function rowToSourceLink(r: SourceLinkRow): SourceLink {
  return {
    id: r.id,
    songId: r.song_id,
    url: r.url,
    sourceName: r.source_name,
    kind: r.kind,
    title: r.title,
    notes: r.notes,
    dateAdded: r.date_added,
    lastCheckedAt: r.last_checked_at
  }
}

export function rowToPracticeSession(r: PracticeSessionRow): PracticeSession {
  return {
    id: r.id,
    songId: r.song_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    lastHeartbeatAt: r.last_heartbeat_at,
    stopReason: r.stop_reason,
    createdAt: r.created_at
  }
}

export function rowToRecording(r: RecordingRow): Recording {
  return {
    id: r.id,
    songId: r.song_id,
    durationSeconds: r.duration_seconds,
    recordedAt: r.recorded_at,
    mimeType: r.mime_type,
    fileSize: r.file_size
  }
}

export function rowToResourceSource(r: ResourceSourceRow): ResourceSource {
  return {
    id: r.id,
    name: r.name,
    baseUrl: r.base_url,
    searchUrlTemplate: r.search_url_template,
    enabled: !!r.enabled,
    kind: r.kind,
    policy: r.policy,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

export function rowToDownloadJob(r: DownloadJobRow): DownloadJob {
  return {
    id: r.id,
    songId: r.song_id,
    sourceUrl: r.source_url,
    sourceName: r.source_name,
    targetAssetId: r.target_asset_id,
    status: r.status,
    errorMessage: r.error_message,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    createdAt: r.created_at
  }
}
