/**
 * practice_sessions 表 repository（设计 §5.4、§10）。
 * 关键：ended_at IS NULL 表示进行中；同一首歌同时只能有一个进行中 session（由 service 保证）。
 */
import { getDb } from '../connection'
import { rowToPracticeSession } from '../mappers'
import type { PracticeSession, PracticeSessionRow, PracticeStopReason } from '@shared'
import { newId, nowIso } from '../../utils'

export interface NewPracticeSessionRecord {
  songId: string
  startedAt: string
}

export interface FinishSessionInput {
  endedAt: string
  durationSeconds: number
  stopReason: PracticeStopReason
  lastHeartbeatAt?: string | null
}

export const practiceSessionsRepository = {
  create(rec: NewPracticeSessionRecord): PracticeSessionRow {
    const id = newId()
    const now = nowIso()
    getDb()
      .prepare(
        `INSERT INTO practice_sessions
           (id, song_id, started_at, ended_at, duration_seconds, last_heartbeat_at, stop_reason, created_at)
         VALUES (@id, @songId, @startedAt, NULL, 0, @startedAt, NULL, @now)`
      )
      .run({ id, songId: rec.songId, startedAt: rec.startedAt, now })
    return this.getById(id)!
  },

  getById(id: string): PracticeSessionRow | undefined {
    return getDb().prepare('SELECT * FROM practice_sessions WHERE id = ?').get(id) as
      | PracticeSessionRow
      | undefined
  },

  toModel(row: PracticeSessionRow): PracticeSession {
    return rowToPracticeSession(row)
  },

  updateHeartbeat(id: string, time: string): void {
    getDb().prepare('UPDATE practice_sessions SET last_heartbeat_at = ? WHERE id = ?').run(time, id)
  },

  finish(id: string, input: FinishSessionInput): void {
    getDb()
      .prepare(
        `UPDATE practice_sessions
         SET ended_at = @endedAt, duration_seconds = @duration, stop_reason = @reason,
             last_heartbeat_at = COALESCE(@heartbeat, last_heartbeat_at)
         WHERE id = @id`
      )
      .run({
        id,
        endedAt: input.endedAt,
        duration: input.durationSeconds,
        reason: input.stopReason,
        heartbeat: input.lastHeartbeatAt ?? null
      })
  },

  /** 该歌曲是否有进行中的 session */
  findActiveBySong(songId: string): PracticeSessionRow | undefined {
    return getDb()
      .prepare('SELECT * FROM practice_sessions WHERE song_id = ? AND ended_at IS NULL')
      .get(songId) as PracticeSessionRow | undefined
  },

  /** 所有未结束的 session（启动异常恢复用，设计 §10.3） */
  findAllActive(): PracticeSessionRow[] {
    return getDb()
      .prepare('SELECT * FROM practice_sessions WHERE ended_at IS NULL')
      .all() as PracticeSessionRow[]
  },

  recentBySong(songId: string, limit = 10): PracticeSessionRow[] {
    return getDb()
      .prepare(
        `SELECT * FROM practice_sessions
         WHERE song_id = ? AND ended_at IS NOT NULL
         ORDER BY started_at DESC LIMIT ?`
      )
      .all(songId, limit) as PracticeSessionRow[]
  },

  /** Dashboard 聚合用：全部 session 的最小字段 */
  allForAggregation(): { song_id: string; started_at: string; duration_seconds: number }[] {
    return getDb()
      .prepare('SELECT song_id, started_at, duration_seconds FROM practice_sessions WHERE ended_at IS NOT NULL')
      .all() as { song_id: string; started_at: string; duration_seconds: number }[]
  }
}
