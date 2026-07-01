/**
 * 曲谱资源服务（设计 §5.2、§7.2）。
 * - 文件导入：dialog 选文件 → 校验类型 → hash 去重 → 复制到歌曲目录 → 写 score_assets + source_links。
 * - 链接：写入 type=link 的 score_assets（无 local_path）+ source_links。
 * - is_primary：首个资源自动设为主；删除主资源后由用户重设。
 */
import { basename } from 'node:path'
import { dialog, shell } from 'electron'
import { assetsRepository, sourceLinksRepository } from '../db/repositories'
import { classifyScoreFile, extensionFor, hashFile, hostOf, isHttpUrl } from '../utils'
import { copyFileInto, safeUnlink, uniqueFilename } from '../lib/filestore'
import { ensureSongDirs, getSongImagesDir, getSongScoresDir } from '../lib/paths'
import type { AddScoreLinkInput, ImportFilePathInput, ScoreAsset } from '@shared'
import { notFound, unsupported, validation } from './errors'

function rowToModel(assetId: string): ScoreAsset {
  const row = assetsRepository.getById(assetId)!
  return assetsRepository.toModels([row])[0]
}

export async function importFileDialog(songId: string): Promise<ScoreAsset | null> {
  const result = await dialog.showOpenDialog({
    title: '导入曲谱（PDF / 图片）',
    properties: ['openFile'],
    filters: [
      { name: '曲谱与图片', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return null
  return importFilePath({
    songId,
    filePath: result.filePaths[0],
    sourcePolicy: 'user-imported',
    originalFilename: basename(result.filePaths[0])
  })
}

export async function importFilePath(input: ImportFilePathInput): Promise<ScoreAsset> {
  const { songId, filePath } = input
  const filename = input.originalFilename ?? basename(filePath) ?? 'asset'
  const type = classifyScoreFile({ filename }).type
  if (!type) throw unsupported(`不支持的曲谱文件类型：${filename}`)

  const hash = await hashFile(filePath)
  // 同首歌内同 hash 视为重复导入，直接返回已存在资源
  const dup = assetsRepository.getByHash(hash)
  if (dup && dup.song_id === songId) return rowToModel(dup.id)

  ensureSongDirs(songId)
  const destDir = type === 'pdf' ? getSongScoresDir(songId) : getSongImagesDir(songId)
  const stored = await copyFileInto(
    filePath,
    destDir,
    uniqueFilename(filename, extensionFor(type, filename))
  )

  const isFirst = assetsRepository.listBySong(songId).length === 0
  const row = assetsRepository.create({
    songId,
    type,
    title: input.title ?? stripExt(filename),
    localPath: stored.path,
    sourceUrl: input.sourceUrl ?? null,
    sourceName: input.sourceName ?? null,
    sourcePolicy: input.sourcePolicy ?? 'user-imported',
    fileHash: hash,
    fileSize: stored.size,
    mimeType: type === 'pdf' ? 'application/pdf' : guessImageMime(filename),
    originalFilename: filename,
    isPrimary: isFirst
  })

  if (input.sourceUrl && isHttpUrl(input.sourceUrl)) {
    if (!sourceLinksRepository.findBySongAndUrl(songId, input.sourceUrl)) {
      sourceLinksRepository.create({
        songId,
        url: input.sourceUrl,
        kind: 'score',
        sourceName: input.sourceName ?? hostOf(input.sourceUrl),
        title: input.title ?? null,
        notes: null
      })
    }
  }
  return rowToModel(row.id)
}

export function addScoreLink(songId: string, input: AddScoreLinkInput): ScoreAsset {
  if (!isHttpUrl(input.url)) throw validation(`链接无效：${input.url}`)
  const isFirst = assetsRepository.listBySong(songId).length === 0
  const row = assetsRepository.create({
    songId,
    type: 'link',
    title: input.title ?? null,
    localPath: null,
    sourceUrl: input.url,
    sourceName: input.sourceName ?? hostOf(input.url),
    sourcePolicy: 'free-link-only',
    source: input.source ?? 'local',
    instrument: input.instrument ?? null,
    fileHash: null,
    fileSize: null,
    mimeType: null,
    originalFilename: null,
    isPrimary: isFirst
  })
  sourceLinksRepository.create({
    songId,
    url: input.url,
    kind: 'score',
    sourceName: input.sourceName ?? hostOf(input.url),
    title: input.title ?? null,
    notes: input.notes ?? null
  })
  return rowToModel(row.id)
}

export function setPrimary(assetId: string): void {
  const row = assetsRepository.getById(assetId)
  if (!row) throw notFound(`资源不存在：${assetId}`)
  assetsRepository.setPrimary(assetId)
}

export async function removeAsset(assetId: string): Promise<boolean> {
  const row = assetsRepository.getById(assetId)
  if (!row) return false
  const ok = assetsRepository.delete(assetId)
  if (ok && row.local_path) await safeUnlink(row.local_path)
  return ok
}

export async function openLocalFolder(assetId: string): Promise<void> {
  const row = assetsRepository.getById(assetId)
  if (!row || !row.local_path) throw notFound(`本地文件不存在：${assetId}`)
  shell.showItemInFolder(row.local_path)
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '')
}

function guessImageMime(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  return 'image/jpeg'
}
