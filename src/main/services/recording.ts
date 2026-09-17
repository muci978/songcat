/**
 * 录音服务（设计 §5.5、§11）。
 * 每首歌可保留多条录音，其中一条标记为主录音。保存顺序：
 *   新文件落盘 → DB insert 提交（失败则删除刚写的新文件）。
 * 删除：先删 DB 行（含主录音自动改选），再删本地文件。
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

/** 追加保存一条新录音（不覆盖已有录音）。首条自动成为主录音。 */
export async function saveTake(input: SaveRecordingInput): Promise<Recording> {
  const { songId, arrayBuffer, mimeType, durationSeconds } = input
  ensureSongDirs(songId)
  const filename = uniqueFilename('recording', mimeToExt(mimeType))

  // 1. 新文件落盘
  const stored = await writeBufferInto(arrayBuffer, getSongRecordingsDir(songId), filename)
  let row
  try {
    // 2. DB 插入新行
    row = recordingsRepository.insert({
      songId,
      localPath: stored.path,
      fileHash: stored.hash,
      fileSize: stored.size,
      durationSeconds,
      recordedAt: nowIso(),
      mimeType
    })
  } catch (e) {
    // DB 失败：删除刚写的新文件
    logger.error('录音 insert 失败', e)
    await safeUnlink(stored.path)
    throw ioErr('保存录音失败')
  }

  return recordingsRepository.toModel(row) as Recording
}

/** 某歌全部录音，主录音优先。 */
export function listRecordings(songId: string): Recording[] {
  return recordingsRepository.listBySong(songId).map((r) => recordingsRepository.toModel(r)!)
}

/** 删除指定录音（含本地文件）。 */
export async function removeById(recordingId: string): Promise<boolean> {
  const removed = recordingsRepository.deleteById(recordingId)
  if (!removed) return false
  if (removed.local_path) await safeUnlink(removed.local_path)
  return true
}

/** 设为主录音。 */
export function setPrimary(recordingId: string): boolean {
  return recordingsRepository.setPrimary(recordingId)
}
