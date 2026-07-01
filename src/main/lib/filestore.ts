/**
 * 文件库操作 helper：导入/移动/落盘/校验/清理。
 * 所有写操作都先 ensureDir；hash 用于去重与来源记录（设计 §4.2、§7.2）。
 */
import { copyFile, mkdir, stat, rename, unlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { hashFile } from '../utils/crypto'

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true })
}

export interface StoredFile {
  path: string
  size: number
  hash: string
}

/** 复制源文件到目标目录（保留独立文件名），返回路径/大小/hash */
export async function copyFileInto(
  srcPath: string,
  destDir: string,
  filename: string
): Promise<StoredFile> {
  await ensureDir(destDir)
  const dest = join(destDir, filename)
  await copyFile(srcPath, dest)
  return finalize(dest)
}

/** 移动源文件到目标目录（下载 staging 完成后落盘用） */
export async function moveFileInto(
  srcPath: string,
  destDir: string,
  filename: string
): Promise<StoredFile> {
  await ensureDir(destDir)
  const dest = join(destDir, filename)
  try {
    await rename(srcPath, dest)
  } catch {
    // 跨设备 rename 会失败，回退为 copy + unlink
    await copyFile(srcPath, dest)
    await safeUnlink(srcPath)
  }
  return finalize(dest)
}

/** 把已存在的字节写入目标路径（录音用） */
export async function writeBufferInto(
  data: ArrayBuffer | Uint8Array,
  destDir: string,
  filename: string
): Promise<StoredFile> {
  await ensureDir(destDir)
  const dest = join(destDir, filename)
  const buf = data instanceof Uint8Array ? data : new Uint8Array(data)
  const { writeFile } = await import('node:fs/promises')
  await writeFile(dest, buf)
  return finalize(dest)
}

async function finalize(path: string): Promise<StoredFile> {
  const s = await stat(path)
  const hash = await hashFile(path)
  return { path, size: s.size, hash }
}

/** 安全删除：存在才删，失败不抛 */
export async function safeUnlink(p: string): Promise<void> {
  if (!p) return
  try {
    if (existsSync(p)) await unlink(p)
  } catch {
    // 忽略删除失败（健康检查可后续清理）
  }
}

/** 生成不冲突的文件名（带短随机后缀），扩展名来自传入 */
export function uniqueFilename(base: string, ext: string): string {
  const safeBase = base.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 24) || 'asset'
  const suffix = Math.random().toString(36).slice(2, 8)
  const e = ext.startsWith('.') ? ext : ext ? `.${ext}` : ''
  return `${safeBase}_${suffix}${e}`
}

export { dirname, existsSync }
