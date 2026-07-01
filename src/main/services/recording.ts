/**
 * 录音服务（设计 §5.5、§11）。
 * 每首歌只保留最新一条。替换事务顺序：
 *   新文件落盘 → DB upsert 提交 → 删除旧文件。
 * 任何一步失败都不得删除旧录音（旧 DB 行与旧文件必须保留）。
 */
import { recordingsRepository } from '../db/repositories'
import { safeUnlink, uniqueFilename, writeBufferInto } from '../lib/filestore'
import { ensureSongDirs, getSongRecordingsDir } from '../lib/paths'
import type { Recording, SaveRecordingInput } from '@shared'
import { nowIso } from '../utils'
import { logger } from '../lib/logger'
import { ioErr } from './errors'

function mimeToExt(mime: string): string {
  const m = mime.toLowerCase()
  if (m.includes('webm')) return '.webm'
  if (m.includes('ogg')) return '.ogg'
  if (m.includes('mp4') || m.includes('m4a')) return '.m4a'
  return '.webm'
}

export async function saveLatestTake(input: SaveRecordingInput): Promise<Recording> {
  const { songId, arrayBuffer, mimeType, durationSeconds } = input
  ensureSongDirs(songId)
  const oldRow = recordingsRepository.getBySong(songId)
  const oldPath = oldRow?.local_path ?? null
  const filename = uniqueFilename('recording', mimeToExt(mimeType))

  // 1. 新文件落盘
  const stored = await writeBufferInto(arrayBuffer, getSongRecordingsDir(songId), filename)
  try {
    // 2. DB 事务提交（INSERT OR REPLACE，song_id 唯一）
    recordingsRepository.upsert({
      songId,
      localPath: stored.path,
      fileHash: stored.hash,
      fileSize: stored.size,
      durationSeconds,
      recordedAt: nowIso(),
      mimeType
    })
    // 3. 提交成功后才删除旧文件
    if (oldPath) await safeUnlink(oldPath)
  } catch (e) {
    // DB 失败：删除刚写的新文件，旧 DB 行与旧文件保留
    logger.error('录音 upsert 失败，保留旧录音', e)
    await safeUnlink(stored.path)
    throw ioErr('保存录音失败')
  }

  const row = recordingsRepository.getBySong(songId)
  return recordingsRepository.toModel(row) as Recording
}

export function getRecordingForSong(songId: string): Recording | null {
  return recordingsRepository.toModel(recordingsRepository.getBySong(songId))
}

export async function removeRecording(songId: string): Promise<boolean> {
  const row = recordingsRepository.getBySong(songId)
  if (!row) return false
  const ok = recordingsRepository.deleteBySong(songId)
  if (ok && row.local_path) await safeUnlink(row.local_path)
  return ok
}
