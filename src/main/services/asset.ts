/**
 * 曲谱资源服务（设计 §5.2、§7.2）。
 * - 文件导入：dialog 选文件 → 校验类型 → hash 去重 → 复制到歌曲目录 → 写 score_assets + source_links。
 * - 链接：写入 type=link 的 score_assets（无 local_path）+ source_links。
 * - is_primary：首个资源自动设为主；删除主资源后由用户重设。
 */
import { basename } from 'node:path'
import { dialog, nativeImage, shell } from 'electron'
import { assetsRepository, sourceLinksRepository } from '../db/repositories'
import { classifyScoreFile, extensionFor, hashFile, hostOf, isHttpUrl } from '../utils'
import { copyFileInto, safeUnlink, uniqueFilename } from '../lib/filestore'
import { ensureSongDirs, getSongImagesDir, getSongScoresDir } from '../lib/paths'
import { newId } from '../utils/id'
import type { AddScoreLinkInput, ImportFilePathInput, ScoreAsset } from '@shared'
import { notFound, unsupported, validation } from './errors'

function rowToModel(assetId: string): ScoreAsset {
  const row = assetsRepository.getById(assetId)!
  return assetsRepository.toModels([row])[0]
}

export async function importFileDialog(songId: string): Promise<ScoreAsset[]> {
  const result = await dialog.showOpenDialog({
    title: '导入曲谱（PDF / 图片，可多选）',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '曲谱与图片', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return []
  const groupId = result.filePaths.length > 1 ? newId() : undefined
  const assets: ScoreAsset[] = []
  for (let i = 0; i < result.filePaths.length; i++) {
    try {
      assets.push(
        await importFilePath({
          songId,
          filePath: result.filePaths[i]!,
          sourcePolicy: 'user-imported',
          originalFilename: basename(result.filePaths[i]!),
          groupId,
          groupSort: i
        })
      )
    } catch {
      // 单个文件失败不影响其他
    }
  }
  return assets
}

/** 弹出文件选择对话框，仅返回路径列表（不执行导入），用于排序预览后再导入 */
export async function selectScoreFiles(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    title: '选择曲谱文件（PDF / 图片，可多选）',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '曲谱与图片', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }
    ]
  })
  if (result.canceled || !result.filePaths.length) return []
  return result.filePaths
}

/** 调整同组曲谱的排列顺序 */
export function reorderGroup(groupId: string, orderedIds: string[]): void {
  assetsRepository.reorderGroup(groupId, orderedIds)
}

/** 获取文件路径对应的缩略图 data URL 映射 */
export function getThumbnails(filePaths: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (const fp of filePaths) {
    const lower = fp.toLowerCase()
    // PDF 无法用 nativeImage 生成缩略图，跳过
    if (lower.endsWith('.pdf')) {
      result[fp] = ''
      continue
    }
    try {
      const image = nativeImage.createFromPath(fp)
      if (image.isEmpty()) {
        result[fp] = ''
        continue
      }
      const size = image.getSize()
      const maxSide = 128
      const scale = Math.min(maxSide / size.width, maxSide / size.height, 1)
      const resized = image.resize({
        width: Math.max(1, Math.round(size.width * scale)),
        height: Math.max(1, Math.round(size.height * scale))
      })
      result[fp] = resized.toDataURL()
    } catch {
      result[fp] = ''
    }
  }
  return result
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
    isPrimary: isFirst,
    groupId: input.groupId ?? null,
    groupSort: input.groupSort ?? 0
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
