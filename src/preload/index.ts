/**
 * Preload 安全门面（设计 §3.1、§17.4）。
 * 用 contextBridge 暴露有限的 typed API（SongCatApi），renderer 无 Node 直接权限。
 * 每个方法只是 ipcRenderer.invoke 的薄封装，参数透传，返回 Promise<IpcResult<T>>。
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type SongCatApi } from '@shared'

const api: SongCatApi = {
  library: {
    search: (q) => ipcRenderer.invoke(IPC.library.search, q),
    getSong: (id) => ipcRenderer.invoke(IPC.library.getSong, id),
    create: (input) => ipcRenderer.invoke(IPC.library.create, input),
    update: (id, input) => ipcRenderer.invoke(IPC.library.update, id, input),
    delete: (id) => ipcRenderer.invoke(IPC.library.delete, id),
    touch: (id) => ipcRenderer.invoke(IPC.library.touch, id),
    findOrCreate: (title, artist) => ipcRenderer.invoke(IPC.library.findOrCreate, title, artist)
  },
  assets: {
    list: (songId) => ipcRenderer.invoke(IPC.assets.list, songId),
    importFileDialog: (songId) => ipcRenderer.invoke(IPC.assets.importFileDialog, songId),
    selectFiles: () => ipcRenderer.invoke(IPC.assets.selectFiles),
    importFilePath: (input) => ipcRenderer.invoke(IPC.assets.importFilePath, input),
    addScoreLink: (songId, input) => ipcRenderer.invoke(IPC.assets.addScoreLink, songId, input),
    setPrimary: (assetId) => ipcRenderer.invoke(IPC.assets.setPrimary, assetId),
    remove: (assetId) => ipcRenderer.invoke(IPC.assets.remove, assetId),
    openLocalFolder: (assetId) => ipcRenderer.invoke(IPC.assets.openLocalFolder, assetId),
    reorderGroup: (groupId, orderedIds) => ipcRenderer.invoke(IPC.assets.reorderGroup, groupId, orderedIds),
    getThumbnails: (filePaths) => ipcRenderer.invoke(IPC.assets.getThumbnails, filePaths)
  },
  sources: {
    list: () => ipcRenderer.invoke(IPC.sources.list),
    create: (input) => ipcRenderer.invoke(IPC.sources.create, input),
    update: (input) => ipcRenderer.invoke(IPC.sources.update, input),
    remove: (id) => ipcRenderer.invoke(IPC.sources.remove, id),
    searchFreeSources: (query) => ipcRenderer.invoke(IPC.sources.searchFreeSources, query)
  },
  downloads: {
    startDownload: (input) => ipcRenderer.invoke(IPC.downloads.startDownload, input)
  },
  ai: {
    searchCandidates: (input) => ipcRenderer.invoke(IPC.ai.searchCandidates, input),
    testConnection: () => ipcRenderer.invoke(IPC.ai.testConnection)
  },
  practice: {
    startSession: (songId) => ipcRenderer.invoke(IPC.practice.startSession, songId),
    pauseSession: (sessionId) => ipcRenderer.invoke(IPC.practice.pauseSession, sessionId),
    resumeSession: (sessionId) => ipcRenderer.invoke(IPC.practice.resumeSession, sessionId),
    stopSession: (sessionId, reason) =>
      ipcRenderer.invoke(IPC.practice.stopSession, sessionId, reason),
    heartbeat: (sessionId) => ipcRenderer.invoke(IPC.practice.heartbeat, sessionId),
    getActiveForSong: (songId) => ipcRenderer.invoke(IPC.practice.getActiveForSong, songId)
  },
  recording: {
    saveLatestTake: (input) => ipcRenderer.invoke(IPC.recording.saveLatestTake, input),
    getForSong: (songId) => ipcRenderer.invoke(IPC.recording.getForSong, songId),
    remove: (songId) => ipcRenderer.invoke(IPC.recording.remove, songId)
  },
  dashboard: {
    getStats: () => ipcRenderer.invoke(IPC.dashboard.getStats)
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settings.get),
    set: (patch) => ipcRenderer.invoke(IPC.settings.set, patch),
    setDeepSeekKey: (key) => ipcRenderer.invoke(IPC.settings.setDeepSeekKey, key),
    deleteDeepSeekKey: () => ipcRenderer.invoke(IPC.settings.deleteDeepSeekKey)
  },
  backup: {
    exportZip: () => ipcRenderer.invoke(IPC.backup.exportZip)
  },
  health: {
    runCheck: () => ipcRenderer.invoke(IPC.health.runCheck)
  },
  updater: {
    checkForUpdate: () => ipcRenderer.invoke(IPC.updater.checkForUpdate)
  },
  system: {
    openExternal: (url) => ipcRenderer.invoke(IPC.system.openExternal, url),
    openPath: (p) => ipcRenderer.invoke(IPC.system.openPath, p),
    openLogsFolder: () => ipcRenderer.invoke(IPC.system.openLogsFolder),
    getPathInfo: () => ipcRenderer.invoke(IPC.system.getPathInfo),
    appVersion: () => ipcRenderer.invoke(IPC.system.appVersion),
    setFullscreen: (fullscreen) => ipcRenderer.invoke(IPC.system.setFullscreen, fullscreen),
    onFullscreenChanged: (callback) => {
      const handler = (_event: Electron.IpcRendererEvent, isFullscreen: boolean) => callback(isFullscreen)
      ipcRenderer.on('fullscreen-changed', handler)
      return () => ipcRenderer.removeListener('fullscreen-changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('songcat', api)
