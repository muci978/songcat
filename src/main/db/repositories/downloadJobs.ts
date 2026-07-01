/**
 * download_jobs 表 repository（设计 §5.7、§8.3）。
 * 触发即忘 + 单项确认：保留状态用于健康检查与失败清理。
 */
import { getDb } from '../connection'
import { rowToDownloadJob } from '../mappers'
import type { DownloadJob, DownloadJobRow, DownloadJobStatus } from '@shared'
import { newId, nowIso } from '../../utils'

export interface NewDownloadJobRecord {
  songId?: string | null
  sourceUrl: string
  sourceName?: string | null
}

export const downloadJobsRepository = {
  create(rec: NewDownloadJobRecord): DownloadJobRow {
    const id = newId()
    const now = nowIso()
    getDb()
      .prepare(
        `INSERT INTO download_jobs
           (id, song_id, source_url, source_name, target_asset_id, status, error_message,
            started_at, completed_at, created_at)
         VALUES (@id, @songId, @sourceUrl, @sourceName, NULL, 'pending', NULL, NULL, NULL, @now)`
      )
      .run({
        id,
        songId: rec.songId ?? null,
        sourceUrl: rec.sourceUrl,
        sourceName: rec.sourceName ?? null,
        now
      })
    return this.getById(id)!
  },

  getById(id: string): DownloadJobRow | undefined {
    return getDb().prepare('SELECT * FROM download_jobs WHERE id = ?').get(id) as
      | DownloadJobRow
      | undefined
  },

  toModel(row: DownloadJobRow): DownloadJob {
    return rowToDownloadJob(row)
  },

  markStatus(
    id: string,
    status: DownloadJobStatus,
    extra?: { targetAssetId?: string; errorMessage?: string | null }
  ): void {
    const now = nowIso()
    const sets: string[] = []
    const params: Record<string, unknown> = { id }
    if (status === 'running') {
      sets.push('started_at = @now')
    }
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      sets.push('completed_at = @now')
    }
    sets.push('status = @status')
    params.status = status
    params.now = now
    if (extra?.targetAssetId !== undefined) {
      sets.push('target_asset_id = @target')
      params.target = extra.targetAssetId
    }
    if (extra?.errorMessage !== undefined) {
      sets.push('error_message = @err')
      params.err = extra.errorMessage
    }
    getDb().prepare(`UPDATE download_jobs SET ${sets.join(', ')} WHERE id = @id`).run(params)
  },

  /** 未完成的任务（健康检查 / 清理用） */
  findUnfinished(): DownloadJobRow[] {
    return getDb()
      .prepare("SELECT * FROM download_jobs WHERE status IN ('pending','running')")
      .all() as DownloadJobRow[]
  },

  delete(id: string): boolean {
    const r = getDb().prepare('DELETE FROM download_jobs WHERE id = ?').run(id)
    return r.changes > 0
  }
}
