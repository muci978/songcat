/**
 * 下载服务（设计 §8）。
 * 策略：
 *   - direct-download：下载到 cache/downloads/<jobId>.tmp → MIME/扩展校验（只接受 PDF/图片）
 *     → 移入歌曲目录 → 写 score_assets + source_links → 标记 job completed。
 *   - link-only / browser-only：不抓取，直接保存链接（addScoreLink）。
 * 失败（网络/MIME 不匹配/疑似付费墙）：标记 job failed，返回 job 供 renderer 提示"保存链接"。
 * 绝不绕过登录/付费墙/验证码/DRM（设计 §8.2、§17.1）。
 */
import { join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { downloadJobsRepository } from '../db/repositories'
import { addScoreLink, importFilePath } from './asset'
import { classifyScoreFile, inferTypeByMime, isHttpUrl } from '../utils'
import { getDownloadsCacheDir } from '../lib/paths'
import { safeUnlink } from '../lib/filestore'
import { getSettings } from './settings'
import type { DownloadJob, ScoreAsset, StartDownloadInput } from '@shared'
import { blocked, networkErr, validation } from './errors'

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    return last && /\.[A-Za-z0-9]+$/.test(last) ? decodeURIComponent(last) : 'download'
  } catch {
    return 'download'
  }
}

export async function startDownload(
  input: StartDownloadInput
): Promise<ScoreAsset | DownloadJob> {
  if (!isHttpUrl(input.sourceUrl)) throw validation(`无效 URL：${input.sourceUrl}`)
  const { songId, sourceUrl, sourceName, sourcePolicy, title } = input

  // link-only / browser-only：不在 app 内抓取
  if (sourcePolicy !== 'direct-download') {
    return addScoreLink(songId, {
      url: sourceUrl,
      sourceName: sourceName ?? undefined,
      title: title ?? undefined
    })
  }

  const job = downloadJobsRepository.create({
    songId,
    sourceUrl,
    sourceName: sourceName ?? null
  })
  downloadJobsRepository.markStatus(job.id, 'running')
  try {
    const settings = getSettings()
    const tmpPath = join(getDownloadsCacheDir(), `${job.id}.tmp`)
    const { filename } = await downloadAndClassify(
      sourceUrl,
      tmpPath,
      settings.downloadTimeoutMs
    )
    const asset = await importFilePath({
      songId,
      filePath: tmpPath,
      sourceUrl,
      sourceName: sourceName ?? null,
      sourcePolicy: 'free-direct',
      originalFilename: filename,
      title: title ?? null
    })
    await safeUnlink(tmpPath)
    downloadJobsRepository.markStatus(job.id, 'completed', { targetAssetId: asset.id })
    return asset
  } catch (e) {
    const message = (e as Error).message
    downloadJobsRepository.markStatus(job.id, 'failed', { errorMessage: message })
    // 返回 job，renderer 据此提示失败并可"保存链接"
    return downloadJobsRepository.toModel(downloadJobsRepository.getById(job.id)!)
  }
}

async function downloadAndClassify(
  url: string,
  destPath: string,
  timeoutMs: number
): Promise<{ filename: string }> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: 'follow' })
  } catch (e) {
    throw networkErr(`下载失败：${(e as Error).message}`)
  }
  if (res.status === 401 || res.status === 403) {
    throw blocked('资源需要登录或鉴权，已停止（不绕过限制）。可改为保存链接。')
  }
  if (!res.ok) throw networkErr(`下载失败：HTTP ${res.status}`)

  const mime = res.headers.get('content-type') ?? ''
  const filename = filenameFromUrl(url)
  const type = inferTypeByMime(mime) ?? classifyScoreFile({ filename }).type
  if (!type) {
    // 多为 HTML（登录页/付费墙/验证码），拒绝抓取
    throw blocked('资源非 PDF/图片，可能需要登录、为付费内容或被反爬限制。可改为保存链接。')
  }

  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(destPath, buf)
  return { filename }
}
