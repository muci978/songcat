/**
 * 系统托盘（设计：托盘管理）。
 * - 关闭主窗口 → 隐藏到托盘（不退出），托盘可见。
 * - 单击/双击托盘 → 显示窗口；右键菜单「显示/退出」。
 * - 「退出」才真正退出（setIsQuitting → close 不拦截 → app quit）。
 */
import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'

let tray: Tray | null = null
let quitting = false

export function getIsQuitting(): boolean {
  return quitting
}

export function setIsQuitting(v: boolean): void {
  quitting = v
}

function resolveIcon(): string {
  // 打包后 icon.png 由 electron-builder extraResources 放到 resources/
  if (app.isPackaged) return join(process.resourcesPath, 'icon.png')
  return join(__dirname, '../../build/icon.png')
}

function showMain(getMainWindow: () => BrowserWindow | null): void {
  const win = getMainWindow()
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

export function createTray(getMainWindow: () => BrowserWindow | null): void {
  if (tray) return
  const img = nativeImage.createFromPath(resolveIcon())
  const icon = img.isEmpty() ? img : img.resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('SongCat')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示 SongCat', click: () => showMain(getMainWindow) },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          setIsQuitting(true)
          app.quit()
        }
      }
    ])
  )
  tray.on('click', () => showMain(getMainWindow))
  tray.on('double-click', () => showMain(getMainWindow))
}
