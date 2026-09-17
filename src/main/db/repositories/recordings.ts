/**
 * recordings 表 repository（设计 §5.5、§11）。
 * 每首歌可保留多条录音，其中一条标记为主录音（is_primary=1）。
 * 保存事务顺序（设计 §11）：新文件落盘 → DB insert 提交 → （删除时）再删文件。
 */
import { getDb } from '../connection'
import { rowToRecording } from '../mappers'
import type { Recording, RecordingRow } from '@shared'
import { newId } from '../../utils'

export interface InsertRecordingRecord {
  songId: string
  localPath: string
  fileHash?: string | null
  fileSize?: number | null
  durationSeconds?: number | null
  recordedAt: string
  mimeType?: string | null
}

export const recordingsRepository = {
  /** 某歌全部录音，主录音优先、其次按录制时间倒序。 */
  listBySong(songId: string): RecordingRow[] {
    return getDb()
      .prepare(
        'SELECT * FROM recordings WHERE song_id = ? ORDER BY is_primary DESC, recorded_at DESC'
      )
      .all(songId) as RecordingRow[]
  },

  getById(id: string): RecordingRow | undefined {
    return getDb().prepare('SELECT * FROM recordings WHERE id = ?').get(id) as
      | RecordingRow
      | undefined
  },

  /** 某歌的主录音（无则返回任意最近一条，均无返回 undefined）。 */
  getPrimaryBySong(songId: string): RecordingRow | undefined {
    return getDb()
      .prepare(
        'SELECT * FROM recordings WHERE song_id = ? ORDER BY is_primary DESC, recorded_at DESC LIMIT 1'
      )
      .get(songId) as RecordingRow | undefined
  },

  toModel(row: RecordingRow | undefined): Recording | null {
    return row ? rowToRecording(row) : null
  },

  /** 插入一条新录音；若为该歌首条则自动设为主录音。返回新行。 */
  insert(rec: InsertRecordingRecord): RecordingRow {
    const id = newId()
    const db = getDb()
    const existing = db
      .prepare('SELECT COUNT(*) AS n FROM recordings WHERE song_id = ?')
      .get(rec.songId) as { n: number }
    const isPrimary = existing.n === 0 ? 1 : 0
    db.prepare(
      `INSERT INTO recordings
         (id, song_id, local_path, file_hash, file_size, duration_seconds, recorded_at, mime_type, is_primary)
       VALUES (@id, @songId, @localPath, @fileHash, @fileSize, @duration, @recordedAt, @mimeType, @isPrimary)`
    ).run({
      id,
      songId: rec.songId,
      localPath: rec.localPath,
      fileHash: rec.fileHash ?? null,
      fileSize: rec.fileSize ?? null,
      duration: rec.durationSeconds ?? null,
      recordedAt: rec.recordedAt,
      mimeType: rec.mimeType ?? null,
      isPrimary
    })
    return this.getById(id)!
  },

  /** 将指定录音设为主录音（清空同歌其它录音的主标记）。 */
  setPrimary(id: string): boolean {
    const db = getDb()
    const row = this.getById(id)
    if (!row) return false
    const tx = db.transaction(() => {
      db.prepare('UPDATE recordings SET is_primary = 0 WHERE song_id = ?').run(row.song_id)
      db.prepare('UPDATE recordings SET is_primary = 1 WHERE id = ?').run(id)
    })
    tx()
    return true
  },

  /** 删除一条录音；若删的是主录音且仍有其它录音，则把最近一条提升为主。返回被删行（供删文件）。 */
  deleteById(id: string): RecordingRow | undefined {
    const db = getDb()
    const row = this.getById(id)
    if (!row) return undefined
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM recordings WHERE id = ?').run(id)
      if (row.is_primary) {
        const next = db
          .prepare(
            'SELECT id FROM recordings WHERE song_id = ? ORDER BY recorded_at DESC LIMIT 1'
          )
          .get(row.song_id) as { id: string } | undefined
        if (next) db.prepare('UPDATE recordings SET is_primary = 1 WHERE id = ?').run(next.id)
      }
    })
    tx()
    return row
  }
}
