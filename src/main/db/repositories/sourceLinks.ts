/**
 * source_links 表 repository（设计 §5.3）。
 */
import { getDb } from '../connection'
import { rowToSourceLink } from '../mappers'
import type { SourceLink, SourceLinkKind, SourceLinkRow } from '@shared'
import { newId, nowIso } from '../../utils'

export interface NewSourceLinkRecord {
  songId: string
  url: string
  sourceName?: string | null
  kind: SourceLinkKind
  title?: string | null
  notes?: string | null
}

export const sourceLinksRepository = {
  listBySong(songId: string): SourceLinkRow[] {
    return getDb()
      .prepare('SELECT * FROM source_links WHERE song_id = ? ORDER BY date_added DESC')
      .all(songId) as SourceLinkRow[]
  },

  toModels(rows: SourceLinkRow[]): SourceLink[] {
    return rows.map(rowToSourceLink)
  },

  findBySongAndUrl(songId: string, url: string): SourceLinkRow | undefined {
    return getDb()
      .prepare('SELECT * FROM source_links WHERE song_id = ? AND url = ?')
      .get(songId, url) as SourceLinkRow | undefined
  },

  create(rec: NewSourceLinkRecord): SourceLinkRow {
    const id = newId()
    const now = nowIso()
    getDb()
      .prepare(
        `INSERT INTO source_links
           (id, song_id, url, source_name, kind, title, notes, date_added, last_checked_at)
         VALUES (@id, @songId, @url, @sourceName, @kind, @title, @notes, @now, @now)`
      )
      .run({
        id,
        songId: rec.songId,
        url: rec.url,
        sourceName: rec.sourceName ?? null,
        kind: rec.kind,
        title: rec.title ?? null,
        notes: rec.notes ?? null,
        now
      })
    return getDb().prepare('SELECT * FROM source_links WHERE id = ?').get(id) as SourceLinkRow
  },

  delete(id: string): boolean {
    const r = getDb().prepare('DELETE FROM source_links WHERE id = ?').run(id)
    return r.changes > 0
  }
}
