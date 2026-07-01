/**
 * score_assets 表 repository（设计 §5.2）。
 * 返回 ScoreAssetRow；local_path 在此层可见，service/IPC 边界再剥离为 hasLocalFile。
 */
import { getDb } from '../connection'
import { rowToScoreAsset } from '../mappers'
import type { AssetSourcePolicy, ScoreAsset, ScoreAssetRow, ScoreAssetType } from '@shared'
import { newId, nowIso } from '../../utils'

export interface NewScoreAssetRecord {
  songId: string
  type: ScoreAssetType
  title?: string | null
  localPath?: string | null
  sourceUrl?: string | null
  sourceName?: string | null
  sourcePolicy?: AssetSourcePolicy
  fileHash?: string | null
  fileSize?: number | null
  mimeType?: string | null
  originalFilename?: string | null
  isPrimary?: boolean
}

export const assetsRepository = {
  listBySong(songId: string): ScoreAssetRow[] {
    return getDb()
      .prepare(
        'SELECT * FROM score_assets WHERE song_id = ? ORDER BY is_primary DESC, date_added ASC'
      )
      .all(songId) as ScoreAssetRow[]
  },

  toModels(rows: ScoreAssetRow[]): ScoreAsset[] {
    return rows.map(rowToScoreAsset)
  },

  getById(id: string): ScoreAssetRow | undefined {
    return getDb().prepare('SELECT * FROM score_assets WHERE id = ?').get(id) as
      | ScoreAssetRow
      | undefined
  },

  getByHash(hash: string): ScoreAssetRow | undefined {
    return getDb().prepare('SELECT * FROM score_assets WHERE file_hash = ?').get(hash) as
      | ScoreAssetRow
      | undefined
  },

  create(rec: NewScoreAssetRecord): ScoreAssetRow {
    const db = getDb()
    const id = newId()
    const now = nowIso()
    const tx = db.transaction(() => {
      if (rec.isPrimary) {
        db.prepare('UPDATE score_assets SET is_primary = 0 WHERE song_id = ?').run(rec.songId)
      }
      db.prepare(
        `INSERT INTO score_assets
           (id, song_id, type, title, local_path, source_url, source_name, source_policy,
            file_hash, file_size, mime_type, original_filename, date_added, is_primary)
         VALUES (@id, @songId, @type, @title, @localPath, @sourceUrl, @sourceName, @sourcePolicy,
            @fileHash, @fileSize, @mimeType, @originalFilename, @now, @isPrimary)`
      ).run({
        id,
        songId: rec.songId,
        type: rec.type,
        title: rec.title ?? null,
        localPath: rec.localPath ?? null,
        sourceUrl: rec.sourceUrl ?? null,
        sourceName: rec.sourceName ?? null,
        sourcePolicy: rec.sourcePolicy ?? 'unknown',
        fileHash: rec.fileHash ?? null,
        fileSize: rec.fileSize ?? null,
        mimeType: rec.mimeType ?? null,
        originalFilename: rec.originalFilename ?? null,
        now,
        isPrimary: rec.isPrimary ? 1 : 0
      })
    })
    tx()
    return this.getById(id)!
  },

  setPrimary(assetId: string): void {
    const db = getDb()
    const a = this.getById(assetId)
    if (!a) return
    const tx = db.transaction(() => {
      db.prepare('UPDATE score_assets SET is_primary = 0 WHERE song_id = ?').run(a.song_id)
      db.prepare('UPDATE score_assets SET is_primary = 1 WHERE id = ?').run(assetId)
    })
    tx()
  },

  delete(id: string): boolean {
    const r = getDb().prepare('DELETE FROM score_assets WHERE id = ?').run(id)
    return r.changes > 0
  }
}
