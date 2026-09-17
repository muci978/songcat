/**
 * 分享服务：保存图片、复制剪贴板
 * 截图由渲染端 html-to-image 完成，主进程只负责文件操作和剪贴板
 */
import { BrowserWindow, clipboard, dialog, nativeImage } from 'electron'
import { writeFile } from 'node:fs/promises'
import { validation } from './errors'

/** PNG dataUrl 前缀：渲染端 html-to-image 产出的均为 PNG */
const PNG_DATA_URL_PREFIX = /^data:image\/png;base64,/

/** 弹出保存对话框，将图片保存到用户指定路径。用户取消返回 { path: null }（非错误） */
export async function saveShareImage(dataUrl: string): Promise<{ path: string | null }> {
  if (typeof dataUrl !== 'string' || !PNG_DATA_URL_PREFIX.test(dataUrl)) {
    throw validation('无效的图片数据：仅支持 PNG dataUrl')
  }
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) throw new Error('No window available')

  const result = await dialog.showSaveDialog(win, {
    title: '保存分享图片',
    defaultPath: `songcat-share-${new Date().toISOString().slice(0, 10)}.png`,
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  })
  // 用户取消不是错误：返回 null，避免被 IPC 层归为 INTERNAL 并弹「内部错误」
  if (result.canceled || !result.filePath) return { path: null }

  const base64 = dataUrl.replace(PNG_DATA_URL_PREFIX, '')
  const buffer = Buffer.from(base64, 'base64')
  await writeFile(result.filePath, buffer)
  return { path: result.filePath }
}

/** 将图片复制到系统剪贴板 */
export async function copyShareImage(dataUrl: string): Promise<boolean> {
  if (typeof dataUrl !== 'string' || !PNG_DATA_URL_PREFIX.test(dataUrl)) {
    throw validation('无效的图片数据：仅支持 PNG dataUrl')
  }
  const base64 = dataUrl.replace(PNG_DATA_URL_PREFIX, '')
  const buffer = Buffer.from(base64, 'base64')
  const image = nativeImage.createFromBuffer(buffer)
  clipboard.writeImage(image)
  return true
}
