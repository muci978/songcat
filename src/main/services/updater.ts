/**
 * 更新检查服务。
 * 通过 GitHub Releases 公开 API 检查新版本，不使用 electron-updater。
 * - checkForUpdate(): 调用 GitHub API，比较 semver
 * - 返回 UpdateInfo（含版本号、下载页 URL、changelog）
 */
import { app } from 'electron'
import type { UpdateInfo } from '@shared'
import { logger } from '../lib/logger'
import { networkErr } from './errors'

const GITHUB_REPO = 'muci978/songcat'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`
const GITHUB_RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`

interface GitHubRelease {
  tag_name: string
  html_url: string
  body: string | null
  published_at: string
  prerelease: boolean
  draft: boolean
}

/**
 * 比较两个 semver 版本号。
 * 返回：>0 表示 a > b，0 表示相等，<0 表示 a < b。
 */
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0)
  }
  return 0
}

/** 构造"无更新"结果 */
function noUpdate(currentVersion: string): UpdateInfo {
  return {
    latestVersion: currentVersion,
    currentVersion,
    hasUpdate: false,
    releaseUrl: GITHUB_RELEASES_PAGE,
    releaseNotes: '',
    publishedAt: ''
  }
}

/**
 * 检查 GitHub Releases 是否有新版本。
 * 开发模式下跳过（app.isPackaged === false）。
 */
export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion()

  // 开发模式下跳过自动检查
  if (!app.isPackaged) {
    return noUpdate(currentVersion)
  }

  let res: Response
  try {
    res = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SongCat-UpdateCheck'
      },
      signal: AbortSignal.timeout(15_000)
    })
  } catch (e) {
    throw networkErr(`更新检查网络错误：${(e as Error).message}`)
  }

  if (res.status === 403) {
    // GitHub API 限速（未认证 60 次/小时）
    throw networkErr('GitHub API 限速，请稍后再试。')
  }
  if (!res.ok) {
    throw networkErr(`GitHub API 返回 HTTP ${res.status}`)
  }

  const release = (await res.json()) as GitHubRelease

  // 跳过 draft 和 prerelease
  if (release.draft || release.prerelease) {
    return noUpdate(currentVersion)
  }

  const latestVersion = release.tag_name.replace(/^v/, '')
  const hasUpdate = compareSemver(latestVersion, currentVersion) > 0

  if (hasUpdate) {
    logger.info(`发现新版本：${latestVersion}（当前 ${currentVersion}）`)
  } else {
    logger.info(`已是最新版本：${currentVersion}`)
  }

  return {
    latestVersion,
    currentVersion,
    hasUpdate,
    releaseUrl: release.html_url,
    releaseNotes: release.body ?? '',
    publishedAt: release.published_at
  }
}
