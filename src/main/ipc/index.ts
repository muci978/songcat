/**
 * IPC handler 注册（设计 §3.2、§17.4）。
 * - 每个通道对应一个 service / repo 调用，统一用 handle() 包装为 IpcResult。
 * - AppError 映射为结构化 IpcError；其他异常归为 INTERNAL。
 */
import { app, ipcMain, shell } from 'electron'
import { IPC, type ErrorCode, type IpcResult } from '@shared'
import { isAppError } from '../services/errors'
import { assetsRepository } from '../db/repositories'
import { getLogsDir, getPathInfo } from '../lib/paths'
import * as libraryService from '../services/library'
import * as assetService from '../services/asset'
import * as sourcesService from '../services/sources'
import * as downloadService from '../services/download'
import * as aiService from '../services/ai'
import * as practiceService from '../services/practice'
import * as recordingService from '../services/recording'
import * as dashboardService from '../services/dashboard'
import * as settingsService from '../services/settings'
import * as backupService from '../services/backup'
import * as healthService from '../services/health'

async function handle<T>(fn: () => T | Promise<T>): Promise<IpcResult<T>> {
  try {
    const data = await fn()
    return { ok: true, data }
  } catch (e) {
    if (isAppError(e)) {
      return { ok: false, error: { code: e.code, message: e.message, details: e.details } }
    }
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: { code: 'INTERNAL' as ErrorCode, message: message || 'Internal error' } }
  }
}

export function registerIpc(): void {
  /* ---------------- library ---------------- */
  ipcMain.handle(IPC.library.search, (_e, q) => handle(() => libraryService.searchSongs(q)))
  ipcMain.handle(IPC.library.getSong, (_e, id) => handle(() => libraryService.getSongDetail(id)))
  ipcMain.handle(IPC.library.create, (_e, input) => handle(() => libraryService.createSong(input)))
  ipcMain.handle(IPC.library.update, (_e, id, input) =>
    handle(() => libraryService.updateSong(id, input))
  )
  ipcMain.handle(IPC.library.delete, (_e, id) =>
    handle(async () => ({ deleted: await libraryService.deleteSong(id) }))
  )
  ipcMain.handle(IPC.library.touch, (_e, id) => handle(() => libraryService.touchSong(id)))
  ipcMain.handle(IPC.library.findOrCreate, (_e, title, artist) =>
    handle(() => libraryService.findOrCreateSongByTitleArtist(title, artist))
  )

  /* ---------------- assets ---------------- */
  ipcMain.handle(IPC.assets.list, (_e, songId) =>
    handle(() => assetsRepository.toModels(assetsRepository.listBySong(songId)))
  )
  ipcMain.handle(IPC.assets.importFileDialog, (_e, songId) =>
    handle(() => assetService.importFileDialog(songId))
  )
  ipcMain.handle(IPC.assets.importFilePath, (_e, input) =>
    handle(() => assetService.importFilePath(input))
  )
  ipcMain.handle(IPC.assets.addScoreLink, (_e, songId, input) =>
    handle(() => assetService.addScoreLink(songId, input))
  )
  ipcMain.handle(IPC.assets.setPrimary, (_e, assetId) =>
    handle(() => assetService.setPrimary(assetId))
  )
  ipcMain.handle(IPC.assets.remove, (_e, assetId) =>
    handle(async () => ({ removed: await assetService.removeAsset(assetId) }))
  )
  ipcMain.handle(IPC.assets.openLocalFolder, (_e, assetId) =>
    handle(() => assetService.openLocalFolder(assetId))
  )

  /* ---------------- sources ---------------- */
  ipcMain.handle(IPC.sources.list, () => handle(() => sourcesService.listSources()))
  ipcMain.handle(IPC.sources.create, (_e, input) =>
    handle(() => sourcesService.createSource(input))
  )
  ipcMain.handle(IPC.sources.update, (_e, input) =>
    handle(() => sourcesService.updateSource(input))
  )
  ipcMain.handle(IPC.sources.remove, (_e, id) =>
    handle(() => ({ removed: sourcesService.removeSource(id) }))
  )
  ipcMain.handle(IPC.sources.searchFreeSources, (_e, query) =>
    handle(() => sourcesService.searchFreeSources(query))
  )

  /* ---------------- downloads ---------------- */
  ipcMain.handle(IPC.downloads.startDownload, (_e, input) =>
    handle(() => downloadService.startDownload(input))
  )

  /* ---------------- ai ---------------- */
  ipcMain.handle(IPC.ai.searchCandidates, (_e, input) =>
    handle(() => aiService.searchCandidates(input))
  )
  ipcMain.handle(IPC.ai.testConnection, () => handle(() => aiService.testConnection()))

  /* ---------------- practice ---------------- */
  ipcMain.handle(IPC.practice.startSession, (_e, songId) =>
    handle(() => practiceService.startSession(songId))
  )
  ipcMain.handle(IPC.practice.pauseSession, (_e, sessionId) =>
    handle(() => practiceService.pauseSession(sessionId))
  )
  ipcMain.handle(IPC.practice.resumeSession, (_e, sessionId) =>
    handle(() => practiceService.resumeSession(sessionId))
  )
  ipcMain.handle(IPC.practice.stopSession, (_e, sessionId, reason) =>
    handle(() => practiceService.stopSession(sessionId, reason))
  )
  ipcMain.handle(IPC.practice.heartbeat, (_e, sessionId) =>
    handle(() => practiceService.heartbeat(sessionId))
  )
  ipcMain.handle(IPC.practice.getActiveForSong, (_e, songId) =>
    handle(() => practiceService.getActiveForSong(songId))
  )

  /* ---------------- recording ---------------- */
  ipcMain.handle(IPC.recording.saveLatestTake, (_e, input) =>
    handle(() => recordingService.saveLatestTake(input))
  )
  ipcMain.handle(IPC.recording.getForSong, (_e, songId) =>
    handle(() => recordingService.getRecordingForSong(songId))
  )
  ipcMain.handle(IPC.recording.remove, (_e, songId) =>
    handle(async () => ({ removed: await recordingService.removeRecording(songId) }))
  )

  /* ---------------- dashboard ---------------- */
  ipcMain.handle(IPC.dashboard.getStats, () => handle(() => dashboardService.getStats()))

  /* ---------------- settings ---------------- */
  ipcMain.handle(IPC.settings.get, () => handle(() => settingsService.getSettings()))
  ipcMain.handle(IPC.settings.set, (_e, patch) =>
    handle(() => settingsService.updateSettings(patch))
  )
  ipcMain.handle(IPC.settings.setDeepSeekKey, (_e, key) =>
    handle(() => settingsService.setDeepSeekKey(key))
  )
  ipcMain.handle(IPC.settings.deleteDeepSeekKey, () =>
    handle(() => settingsService.deleteDeepSeekKey())
  )

  /* ---------------- backup ---------------- */
  ipcMain.handle(IPC.backup.exportZip, () => handle(() => backupService.exportZip()))

  /* ---------------- health ---------------- */
  ipcMain.handle(IPC.health.runCheck, () => handle(() => healthService.runHealthCheck()))

  /* ---------------- system ---------------- */
  ipcMain.handle(IPC.system.openExternal, (_e, url) =>
    handle(async () => {
      await shell.openExternal(url)
      return true
    })
  )
  ipcMain.handle(IPC.system.openPath, (_e, p) =>
    handle(async () => {
      await shell.openPath(p)
      return true
    })
  )
  ipcMain.handle(IPC.system.openLogsFolder, () =>
    handle(async () => {
      await shell.openPath(getLogsDir())
      return true
    })
  )
  ipcMain.handle(IPC.system.getPathInfo, () => handle(() => getPathInfo()))
  ipcMain.handle(IPC.system.appVersion, () => handle(() => app.getVersion()))
}
