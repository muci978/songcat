/**
 * 文件库路径管理（设计 §4.1 目录树）。
 * userData 在 Windows 打包后为 %APPDATA%/SongCat；其下为 songcat.db + library/ + backups/ + logs/。
 * 所有"按 songId 派生路径"的操作都用 safeJoin 防越界（renderer 不直接持有路径）。
 */
import { app } from 'electron'
import { join } from 'node:path'
import { mkdirSync } from 'node:fs'
import { DIR, DB_FILENAME } from '@shared'
import type { PathInfo } from '@shared'
import { safeJoin } from '../utils/path'

let userDataRoot = ''

export function initPaths(): void {
  userDataRoot = app.getPath('userData')
  ensureLibraryDirs()
}

export function getUserDataRoot(): string {
  if (!userDataRoot) userDataRoot = app.getPath('userData')
  return userDataRoot
}

export function getDbPath(): string {
  return join(getUserDataRoot(), DB_FILENAME)
}

export function getLibraryRoot(): string {
  return join(getUserDataRoot(), DIR.library)
}

/** <song-id> 根目录 */
export function getSongDir(songId: string): string {
  return safeJoin(getLibraryRoot(), DIR.songs, songId)
}

export function getSongScoresDir(songId: string): string {
  return safeJoin(getSongDir(songId), DIR.scores)
}

export function getSongImagesDir(songId: string): string {
  return safeJoin(getSongDir(songId), DIR.images)
}

export function getSongRecordingsDir(songId: string): string {
  return safeJoin(getSongDir(songId), DIR.recordings)
}

export function getSongImportsDir(songId: string): string {
  return safeJoin(getSongDir(songId), DIR.imports)
}

export function getCacheRoot(): string {
  return join(getLibraryRoot(), DIR.cache)
}

export function getThumbnailsDir(): string {
  return join(getCacheRoot(), DIR.thumbnails)
}

export function getDownloadsCacheDir(): string {
  return join(getCacheRoot(), DIR.downloads)
}

export function getBackupsDir(): string {
  return join(getUserDataRoot(), DIR.backups)
}

export function getLogsDir(): string {
  return join(getUserDataRoot(), DIR.logs)
}

/** secrets 目录：加密后的 API key 文件（设计 §6） */
export function getSecretsDir(): string {
  return join(getUserDataRoot(), 'secrets')
}

/** 为某歌曲创建所需的全部子目录 */
export function ensureSongDirs(songId: string): void {
  for (const d of [
    getSongScoresDir(songId),
    getSongImagesDir(songId),
    getSongRecordingsDir(songId),
    getSongImportsDir(songId)
  ]) {
    mkdirSync(d, { recursive: true })
  }
}

/** 启动时创建库目录骨架 */
export function ensureLibraryDirs(): void {
  for (const d of [
    getLibraryRoot(),
    join(getLibraryRoot(), DIR.songs),
    getCacheRoot(),
    getThumbnailsDir(),
    getDownloadsCacheDir(),
    getBackupsDir(),
    getLogsDir(),
    getSecretsDir()
  ]) {
    mkdirSync(d, { recursive: true })
  }
}

export function getPathInfo(): PathInfo {
  return {
    libraryPath: getLibraryRoot(),
    dbPath: getDbPath(),
    logsPath: getLogsDir(),
    backupsPath: getBackupsDir(),
    userDataPath: getUserDataRoot()
  }
}
