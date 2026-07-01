/**
 * 库健康检查 + 恢复/清理（设计 §15.3）。
 * 检查项：score_assets 文件、recordings 文件、未完成 download jobs、未结束 practice sessions、孤立临时文件。
 * 恢复/清理动作记入 report.recovered。
 */
import { existsSync } from 'node:fs'
import { readdir, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { getDb } from '../db/connection'
import { downloadJobsRepository, practiceSessionsRepository } from '../db/repositories'
import { getDownloadsCacheDir } from '../lib/paths'
import { recoverInterruptedSessions } from './practice'
import type { HealthReport } from '@shared'

export async function runHealthCheck(): Promise<HealthReport> {
  const db = getDb()

  // 1. score_assets 指向的文件是否存在
  const assets = db
    .prepare(
      `SELECT a.id AS asset_id, a.song_id, a.local_path, s.title
       FROM score_assets a LEFT JOIN songs s ON s.id = a.song_id
       WHERE a.local_path IS NOT NULL`
    )
    .all() as { asset_id: string; song_id: string; local_path: string; title: string | null }[]
  const missingScoreFiles = assets
    .filter((a) => !existsSync(a.local_path))
    .map((a) => ({ assetId: a.asset_id, songId: a.song_id, title: a.title ?? '(已删除)' }))

  // 2. recordings 文件是否存在
  const recs = db
    .prepare(
      `SELECT r.song_id, r.local_path, s.title
       FROM recordings r LEFT JOIN songs s ON s.id = r.song_id`
    )
    .all() as { song_id: string; local_path: string; title: string | null }[]
  const missingRecordings = recs
    .filter((r) => !existsSync(r.local_path))
    .map((r) => ({ songId: r.song_id, title: r.title ?? '(已删除)' }))

  // 3. 未完成 download jobs
  const unfinishedJobs = downloadJobsRepository.findUnfinished()
  const unfinishedDownloads = unfinishedJobs.map((j) => ({
    jobId: j.id,
    sourceUrl: j.source_url
  }))

  // 4. 未结束 practice sessions（快照后恢复）
  const activeSessions = practiceSessionsRepository.findAllActive()
  const unfinishedPracticeSessions = activeSessions.map((s) => ({
    sessionId: s.id,
    songId: s.song_id
  }))

  const recovered: string[] = []

  // 清理未完成 job 的残留临时文件，并把 job 标记 cancelled
  for (const j of unfinishedJobs) {
    const tmpPath = join(getDownloadsCacheDir(), `${j.id}.tmp`)
    try {
      if (existsSync(tmpPath)) await unlink(tmpPath)
    } catch {
      /* ignore */
    }
    downloadJobsRepository.markStatus(j.id, 'cancelled', {
      errorMessage: 'health check: unfinished job'
    })
    recovered.push(`已放弃未完成的下载任务：${j.source_url}`)
  }

  // 恢复未结束 practice sessions
  const recoveredCount = recoverInterruptedSessions()
  if (recoveredCount > 0) recovered.push(`恢复了 ${recoveredCount} 个未结束的练习会话`)

  // 5. 孤立临时文件（cache/downloads 下非 job 关联的残留）
  const orphanTempFiles: string[] = []
  const knownJobIds = new Set(unfinishedJobs.map((j) => `${j.id}.tmp`))
  let entries: string[] = []
  try {
    entries = await readdir(getDownloadsCacheDir())
  } catch {
    entries = []
  }
  for (const name of entries) {
    if (name.endsWith('.tmp') && !knownJobIds.has(name)) {
      const p = join(getDownloadsCacheDir(), name)
      orphanTempFiles.push(p)
      try {
        await unlink(p)
        recovered.push(`删除孤立临时文件：${name}`)
      } catch {
        /* ignore */
      }
    }
  }

  return {
    missingScoreFiles,
    missingRecordings,
    unfinishedDownloads,
    unfinishedPracticeSessions,
    orphanTempFiles,
    recovered
  }
}
