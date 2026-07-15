/**
 * songs 表 repository（设计 §5.1）。
 * 作为 repository 层的范例：返回数据库行（SongRow / SongSummaryRow），
 * 由 service 层负责 Row ↔ 业务模型映射、副作用（文件操作）与事务编排。
 *
 * 搜索（设计 §7.3）：普通包含匹配（LIKE）+ 拼音首字母前缀（title_pinyin_initial）。
 */
import { getDb } from '../connection'
import { rowToSong, rowToSongSummary, type SongSummaryRow } from '../mappers'
import type {
  Difficulty,
  PaginatedResult,
  Song,
  SongRow,
  SongSearchQuery,
  SongStatus,
  SongSummary
} from '@shared'
import {
  computeTitleInitial,
  newId,
  normalizeArtist,
  normalizeTitle,
  nowIso
} from '../../utils'

export interface NewSongRecord {
  title: string
  artist?: string | null
  status?: SongStatus
  isFavorite?: boolean
  difficulty?: Difficulty | null
  notes?: string | null
  originalAudioUrl?: string | null
}

export interface SongPatch {
  title?: string
  artist?: string | null
  status?: SongStatus
  isFavorite?: boolean
  difficulty?: Difficulty | null
  notes?: string | null
  originalAudioUrl?: string | null
}

/** 列表查询所需的聚合子选择（score 数 / pdf / 录音 / 练习 / 总时长 / 最近练习）
 *  单行查询（getSummaryById）仍用内联子查询；search() 使用 LEFT JOIN 聚合提升性能 */
const SUMMARY_COLUMNS = `
  (SELECT COUNT(*) FROM score_assets a WHERE a.song_id = s.id) AS score_count,
  EXISTS(SELECT 1 FROM score_assets a WHERE a.song_id = s.id AND a.type = 'pdf') AS has_pdf,
  EXISTS(SELECT 1 FROM recordings r WHERE r.song_id = s.id) AS has_recording,
  EXISTS(SELECT 1 FROM practice_sessions p WHERE p.song_id = s.id) AS has_practice,
  COALESCE((SELECT SUM(p2.duration_seconds) FROM practice_sessions p2 WHERE p2.song_id = s.id), 0) AS total_practice_seconds,
  (SELECT MAX(p3.started_at) FROM practice_sessions p3 WHERE p3.song_id = s.id) AS last_practiced_at
`

/** 构建 WHERE 子句（search 和 searchCount 共用） */
function buildWhereClause(q: SongSearchQuery): { whereSql: string; params: Record<string, unknown> } {
  const where: string[] = []
  const params: Record<string, unknown> = {}

  if (q.text) {
    const t = q.text.trim()
    where.push(
      `(LOWER(s.title) LIKE @text
        OR LOWER(COALESCE(s.artist, '')) LIKE @text
        OR LOWER(COALESCE(s.notes, '')) LIKE @text
        OR s.title_pinyin_initial LIKE @pinyin)`
    )
    params.text = `%${t.toLowerCase()}%`
    params.pinyin = `${t.toUpperCase()}%`
  }
  if (q.status) {
    where.push('s.status = @status')
    params.status = q.status
  }
  if (q.isFavorite !== undefined) {
    where.push('s.is_favorite = @fav')
    params.fav = q.isFavorite ? 1 : 0
  }
  if (q.artist) {
    where.push("(s.artist_normalized LIKE @artistNorm OR LOWER(COALESCE(s.artist,'')) LIKE @artistRaw)")
    params.artistNorm = `%${normalizeArtist(q.artist) ?? ''}%`
    params.artistRaw = `%${q.artist.toLowerCase()}%`
  }
  if (q.minDifficulty !== undefined) {
    where.push('s.difficulty >= @minD')
    params.minD = q.minDifficulty
  }
  if (q.maxDifficulty !== undefined) {
    where.push('s.difficulty <= @maxD')
    params.maxD = q.maxDifficulty
  }
  if (q.initial) {
    where.push('s.title_pinyin_initial LIKE @initial')
    params.initial = `${q.initial.toUpperCase()}%`
  }
  if (q.hasPdf) {
    where.push('a.score_count > 0')
  }
  if (q.hasRecording) {
    where.push('r.has_recording = 1')
  }
  if (q.hasPractice) {
    where.push('p.has_practice = 1')
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  return { whereSql, params }
}

/** LEFT JOIN 聚合子查询（search 用，比相关子查询高效） */
const JOIN_AGGREGATES = `
  LEFT JOIN (
    SELECT song_id,
      COUNT(*) AS score_count,
      MAX(CASE WHEN type = 'pdf' THEN 1 ELSE 0 END) AS has_pdf
    FROM score_assets GROUP BY song_id
  ) a ON a.song_id = s.id
  LEFT JOIN (
    SELECT song_id, 1 AS has_recording FROM recordings GROUP BY song_id
  ) r ON r.song_id = s.id
  LEFT JOIN (
    SELECT song_id,
      1 AS has_practice,
      SUM(duration_seconds) AS total_practice_seconds,
      MAX(started_at) AS last_practiced_at
    FROM practice_sessions GROUP BY song_id
  ) p ON p.song_id = s.id
`

const AGGREGATE_COLUMNS = `
  COALESCE(a.score_count, 0) AS score_count,
  COALESCE(a.has_pdf, 0) AS has_pdf,
  COALESCE(r.has_recording, 0) AS has_recording,
  COALESCE(p.has_practice, 0) AS has_practice,
  COALESCE(p.total_practice_seconds, 0) AS total_practice_seconds,
  p.last_practiced_at
`

export const songsRepository = {
  exists(id: string): boolean {
    const row = getDb().prepare('SELECT 1 FROM songs WHERE id = ?').get(id)
    return !!row
  },

  getById(id: string): SongRow | undefined {
    return getDb().prepare('SELECT * FROM songs WHERE id = ?').get(id) as SongRow | undefined
  },

  /** 单首歌带聚合计数（详情页用） */
  getSummaryById(id: string): SongSummary | undefined {
    const row = getDb()
      .prepare(`SELECT s.*, ${SUMMARY_COLUMNS} FROM songs s WHERE s.id = ?`)
      .get(id) as SongSummaryRow | undefined
    return row ? rowToSongSummary(row) : undefined
  },

  toModel(row: SongRow | undefined): Song | undefined {
    return row ? rowToSong(row) : undefined
  },

  search(q: SongSearchQuery = {}): PaginatedResult<SongSummary> {
    const db = getDb()
    const { whereSql, params } = buildWhereClause(q)
    const orderSql =
      q.dateSort === 'oldest' ? 'ORDER BY s.date_added ASC, s.id ASC' : 'ORDER BY s.date_added DESC, s.id DESC'
    const limit = q.limit ?? 1000
    const offset = q.offset ?? 0

    // 总数
    const countSql = `SELECT COUNT(*) AS total FROM songs s ${JOIN_AGGREGATES} ${whereSql}`
    const total = (db.prepare(countSql).get(params) as { total: number }).total

    // 分页数据
    params.limit = limit
    params.offset = offset
    const dataSql = `SELECT s.*, ${AGGREGATE_COLUMNS} FROM songs s ${JOIN_AGGREGATES} ${whereSql} ${orderSql} LIMIT @limit OFFSET @offset`
    const rows = db.prepare(dataSql).all(params) as SongSummaryRow[]

    return {
      items: rows.map(rowToSongSummary),
      total,
      limit,
      offset
    }
  },

  create(rec: NewSongRecord): SongRow {
    const db = getDb()
    const now = nowIso()
    const title = normalizeTitle(rec.title)
    const artist = rec.artist?.trim() ? rec.artist.trim() : null
    const artistNorm = normalizeArtist(artist)
    const pinyin = computeTitleInitial(title)
    const id = newId()
    db.prepare(
      `INSERT INTO songs
         (id, title, title_pinyin_initial, artist, artist_normalized, status, is_favorite,
          difficulty, notes, original_audio_url, date_added, date_updated, last_opened_at)
       VALUES (@id, @title, @pinyin, @artist, @artistNorm, @status, @fav,
          @difficulty, @notes, @audio, @now, @now, NULL)`
    ).run({
      id,
      title,
      pinyin,
      artist,
      artistNorm,
      status: rec.status ?? 'to-learn',
      fav: rec.isFavorite ? 1 : 0,
      difficulty: rec.difficulty ?? null,
      notes: rec.notes ?? null,
      audio: rec.originalAudioUrl ?? null,
      now
    })
    return this.getById(id)!
  },

  update(id: string, patch: SongPatch): SongRow | undefined {
    const db = getDb()
    const current = this.getById(id)
    if (!current) return undefined

    const sets: string[] = ['date_updated = @now']
    const params: Record<string, unknown> = { now: nowIso(), id }

    if (patch.title !== undefined) {
      const title = normalizeTitle(patch.title)
      params.title = title
      params.pinyin = computeTitleInitial(title)
      sets.push('title = @title', 'title_pinyin_initial = @pinyin')
    }
    if (patch.artist !== undefined) {
      const artist = patch.artist?.trim() ? patch.artist.trim() : null
      params.artist = artist
      params.artistNorm = normalizeArtist(artist)
      sets.push('artist = @artist', 'artist_normalized = @artistNorm')
    }
    if (patch.status !== undefined) {
      params.status = patch.status
      sets.push('status = @status')
    }
    if (patch.isFavorite !== undefined) {
      params.fav = patch.isFavorite ? 1 : 0
      sets.push('is_favorite = @fav')
    }
    if (patch.difficulty !== undefined) {
      params.difficulty = patch.difficulty
      sets.push('difficulty = @difficulty')
    }
    if (patch.notes !== undefined) {
      params.notes = patch.notes
      sets.push('notes = @notes')
    }
    if (patch.originalAudioUrl !== undefined) {
      params.audio = patch.originalAudioUrl
      sets.push('original_audio_url = @audio')
    }

    db.prepare(`UPDATE songs SET ${sets.join(', ')} WHERE id = @id`).run(params)
    return this.getById(id)
  },

  touchOpenedAt(id: string): void {
    getDb().prepare('UPDATE songs SET last_opened_at = @now WHERE id = @id').run({
      now: nowIso(),
      id
    })
  },

  delete(id: string): boolean {
    const r = getDb().prepare('DELETE FROM songs WHERE id = ?').run(id)
    return r.changes > 0
  },

  /** 所有歌曲的轻量信息（Dashboard 聚合用，避免 N+1） */
  allForAggregation(): { id: string; title: string; artist: string | null; artist_normalized: string | null }[] {
    return getDb()
      .prepare('SELECT id, title, artist, artist_normalized FROM songs')
      .all() as { id: string; title: string; artist: string | null; artist_normalized: string | null }[]
  },

  /** 批量更新歌曲排序顺序 */
  reorder(items: { id: string; sortOrder: number }[]): void {
    const db = getDb()
    const stmt = db.prepare('UPDATE songs SET sort_order = ? WHERE id = ?')
    const tx = db.transaction(() => {
      for (const item of items) {
        stmt.run(item.sortOrder, item.id)
      }
    })
    tx()
  }
}
