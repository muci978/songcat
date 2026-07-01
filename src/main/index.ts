/**
 * Electron main entry（设计 §3、§10、§17.4）。
 * - 注册自定义协议（曲谱/录音的本地文件访问，按 id 校验后返回流，路径不暴露给 renderer）。
 * - 启动初始化：路径、日志、数据库、种子、异常恢复、IPC。
 * - 外部链接一律走系统浏览器；关闭应用前结束所有进行中的练习会话。
 */
import { app, BrowserWindow, shell, protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { LOCAL_ASSET_PROTOCOL, LOCAL_RECORDING_PROTOCOL } from '@shared'
import { initPaths, getDbPath } from './lib/paths'
import { initLogger, logger } from './lib/logger'
import { closeDatabase, getDb, initDatabase } from './db/connection'
import { seedBuiltinSources } from './db/seed'
import { registerIpc } from './ipc'
import { recoverInterruptedSessions, stopAllActive } from './services/practice'
import { assetsRepository, recordingsRepository } from './db/repositories'

// 必须在 app ready 之前注册自定义协议为 privileged（支持 fetch/流式）
protocol.registerSchemesAsPrivileged([
  {
    scheme: LOCAL_ASSET_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  },
  {
    scheme: LOCAL_RECORDING_PROTOCOL,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#faf7f2',
    title: 'SongCat',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 外部链接走系统浏览器（设计 §17.4）
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL()
    if (url !== current) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerProtocolHandlers(): void {
  // songcat-asset://<assetId> → 该曲谱本地文件
  protocol.handle(LOCAL_ASSET_PROTOCOL, async (request) => {
    const id = new URL(request.url).host
    const row = assetsRepository.getById(id)
    if (!row || !row.local_path || !existsSync(row.local_path)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(row.local_path).toString())
  })

  // songcat-recording://<songId> → 该歌最新录音
  protocol.handle(LOCAL_RECORDING_PROTOCOL, async (request) => {
    const songId = new URL(request.url).host
    const row = recordingsRepository.getBySong(songId)
    if (!row || !existsSync(row.local_path)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(row.local_path).toString())
  })
}

app.whenReady().then(() => {
  try {
    initPaths()
    initLogger()
    initDatabase(getDbPath())
    seedBuiltinSources(getDb())
    const recovered = recoverInterruptedSessions()
    if (recovered > 0) logger.info(`启动恢复：补齐 ${recovered} 个未结束的练习会话`)
    registerProtocolHandlers()
    registerIpc()
  } catch (e) {
    logger.error('应用初始化失败', e)
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 关闭应用前结束所有进行中的练习会话（设计 §10.2）
app.on('window-all-closed', () => {
  stopAllActive('app-close')
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopAllActive('app-close')
})

process.on('exit', () => {
  closeDatabase()
})
