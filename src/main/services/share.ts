/**
 * 分享服务：保存图片、复制剪贴板
 * 截图由渲染端 html-to-image 完成，主进程只负责文件操作和剪贴板
 */
import { BrowserWindow, clipboard, dialog, nativeImage } from 'electron'
import { writeFile } from 'node:fs/promises'

/** 弹出保存对话框，将图片保存到用户指定路径 */
export async function saveShareImage(dataUrl: string): Promise<{ path: string }> {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) throw new Error('No window available')

  const result = await dialog.showSaveDialog(win, {
    title: '保存分享图片',
    defaultPath: `songcat-share-${new Date().toISOString().slice(0, 10)}.png`,
    filters: [{ name: 'PNG 图片', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePath) throw new Error('用户取消保存')

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  await writeFile(result.filePath, buffer)
  return { path: result.filePath }
}

/** 将图片复制到系统剪贴板 */
export async function copyShareImage(dataUrl: string): Promise<boolean> {
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  const image = nativeImage.createFromBuffer(buffer)
  clipboard.writeImage(image)
  return true
}
