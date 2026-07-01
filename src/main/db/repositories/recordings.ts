/**
 * recordings 表 repository（设计 §5.5、§11）。
 * song_id 唯一约束：每首歌只保留最新一条录音。
 * 替换事务顺序（设计 §11）：新文件落盘 → DB upsert 提交 → 删旧文件。
 *   旧文件路径必须在 upsert 之前由 service 取得（getBySong），故 upsert 只负责写新行。
 */
import { getDb } from '../connection'
import { rowToRecording } from '../mappers'
import type { Recording, RecordingRow } from '@shared'
import { newId } from '../../utils'

export interface UpsertRecordingRecord {
  songId: string
  localPath: string
  fileHash?: string | null
  fileSize?: number | null
  durationSeconds?: number | null
  recordedAt: string
  mimeType?: string | null
}

export const recordingsRepository = {
  getBySong(songId: string): RecordingRow | undefined {
    return getDb().prepare('SELECT * FROM recordings WHERE song_id = ?').get(songId) as
      | RecordingRow
      | undefined
  },

  toModel(row: RecordingRow | undefined): Recording | null {
    return row ? rowToRecording(row) : null
  },

  /** INSERT OR REPLACE（song_id 唯一）。返回新行。 */
  upsert(rec: UpsertRecordingRecord): RecordingRow {
    const id = newId()
    getDb()
      .prepare(
        `INSERT INTO recordings
           (id, song_id, local_path, file_hash, file_size, duration_seconds, recorded_at, mime_type)
         VALUES (@id, @songId, @localPath, @fileHash, @fileSize, @duration, @recordedAt, @mimeType)
         ON CONFLICT(song_id) DO UPDATE SET
           local_path = excluded.local_path,
           file_hash = excluded.file_hash,
           file_size = excluded.file_size,
           duration_seconds = excluded.duration_seconds,
           recorded_at = excluded.recorded_at,
           mime_type = excluded.mime_type`
      )
      .run({
        id,
        songId: rec.songId,
        localPath: rec.localPath,
        fileHash: rec.fileHash ?? null,
        fileSize: rec.fileSize ?? null,
        duration: rec.durationSeconds ?? null,
        recordedAt: rec.recordedAt,
        mimeType: rec.mimeType ?? null
      })
    return this.getBySong(rec.songId)!
  },

  getBySongStrict(songId: string): RecordingRow {
    const r = this.getBySong(songId)
    if (!r) throw new Error(`recording not found for song ${songId}`)
    return r
  },

  deleteBySong(songId: string): boolean {
    const r = getDb().prepare('DELETE FROM recordings WHERE song_id = ?').run(songId)
    return r.changes > 0
  }
}
