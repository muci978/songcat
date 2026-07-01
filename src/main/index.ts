/**
 * Electron main entry（设计 §3、§10、§17.4）。
 * - 注册自定义协议（曲谱/录音的本地文件访问，按 id 校验后返回流，路径不暴露给 renderer）。
 * - 启动初始化：路径、日志、数据库、种子、异常恢复、IPC。
 * - 外部链接一律走系统浏览器；关闭应用前结束所有进行中的练习会话。
 * - 单实例锁：避免误启动多份导致内存占满（设计 §2.1）。
 */
import { app, BrowserWindow, shell, protocol, net, dialog } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { LOCAL_ASSET_PROTOCOL, LOCAL_RECORDING_PROTOCOL } from '@shared'
import { getDbPath, getLogsDir, initPaths } from './lib/paths'
import { initLogger, logger } from './lib/logger'
import { closeDatabase, getDb, initDatabase, isDbInitialized } from './db/connection'
import { seedBuiltinSources } from './db/seed'
import { registerIpc } from './ipc'
import { recoverInterruptedSessions, stopAllActive } from './services/practice'
import { assetsRepository, recordingsRepository } from './db/repositories'
import { createTray, getIsQuitting, setIsQuitting } from './tray'

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
      nodeIntegration: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())
  // 关闭按钮 → 收到托盘（不退出）；真正退出（托盘「退出」）时 getIsQuitting() 为 true 才放行
  mainWindow.on('close', (e) => {
    if (!getIsQuitting()) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })
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

// 单实例锁：第二个实例启动时聚焦已有窗口，而非开新进程
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    let initOk = true
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
      // 不再静默吞：弹框显示真正错误，便于诊断；不开窗口、直接退出，避免半坏状态
      initOk = false
      const detail = e instanceof Error ? `${e.message}\n\n${e.stack ?? ''}` : String(e)
      try {
        logger.error('应用初始化失败', e)
      } catch {
        /* logger 自身不可用时忽略 */
      }
      dialog.showErrorBox(
        'SongCat 启动失败',
        `初始化失败，请把以下信息反馈：\n\n${detail}\n\n日志目录：${getLogsDir()}`
      )
    }

    if (initOk) {
      createWindow()
      createTray(() => mainWindow)
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
      })
    } else {
      app.quit()
    }
  })

  // 关闭应用前结束所有进行中的练习会话（设计 §10.2）。
  // 若 db 未初始化（初始化失败），跳过，避免退出时二次崩溃。
  app.on('window-all-closed', () => {
    if (isDbInitialized()) stopAllActive('app-close')
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', () => {
    setIsQuitting(true)
    if (isDbInitialized()) stopAllActive('app-close')
  })
}

process.on('exit', () => {
  closeDatabase()
})
