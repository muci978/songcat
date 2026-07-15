/**
 * 备份导出与导入（设计 §15.1）。
 * 打包 manifest.json + songcat.db + library/ 为 zip（adm-zip，CJS，与 main CJS 输出兼容）。
 * 不含 secrets（DeepSeek API key 在系统安全存储，不入备份）。
 */
import AdmZip from 'adm-zip'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getBackupsDir, getDbPath, getLibraryRoot } from '../lib/paths'
import { ensureDir } from '../lib/filestore'
import { closeDatabase, initDatabase } from '../db/connection'
import { ioErr } from './errors'

/** 导出备份 zip。destDir 为自定义导出目录，不传则默认存到 backups 目录 */
export async function exportZip(destDir?: string | null): Promise<{ path: string }> {
  const outDir = destDir && existsSync(destDir) ? destDir : getBackupsDir()
  await ensureDir(outDir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(outDir, `SongCat Backup ${stamp}.zip`)
  try {
    const zip = new AdmZip()
    zip.addFile(
      'manifest.json',
      Buffer.from(
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            app: 'SongCat',
            note: '本备份不含 DeepSeek API key。'
          },
          null,
          2
        )
      )
    )
    zip.addFile('songcat.db', readFileSync(getDbPath()))
    zip.addLocalFolder(getLibraryRoot(), 'library')
    zip.writeZip(dest)
  } catch (e) {
    throw ioErr(`备份失败：${(e as Error).message}`)
  }
  return { path: dest }
}

/** 从 zip 文件导入备份，覆盖当前数据库和曲库文件 */
export async function importZip(zipPath: string): Promise<{ imported: boolean }> {
  if (!existsSync(zipPath)) throw ioErr('备份文件不存在')

  let zip: AdmZip
  try {
    zip = new AdmZip(zipPath)
  } catch (e) {
    throw ioErr(`无法读取备份文件：${(e as Error).message}`)
  }

  // 校验 manifest
  const manifestEntry = zip.getEntry('manifest.json')
  if (!manifestEntry) throw ioErr('无效备份：缺少 manifest.json')
  try {
    const manifest = JSON.parse(manifestEntry.getData().toString())
    if (manifest.app !== 'SongCat') throw ioErr('无效备份：不是 SongCat 备份文件')
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('无效备份')) throw e
    throw ioErr('无效备份：manifest.json 格式错误')
  }

  // 关闭数据库，准备覆盖
  closeDatabase()

  try {
    const dbPath = getDbPath()
    const libraryRoot = getLibraryRoot()

    // 解压 songcat.db
    const dbEntry = zip.getEntry('songcat.db')
    if (dbEntry) {
      const dbDir = dirname(dbPath)
      const dbContent = dbEntry.getData()
      const { writeFileSync: writeSync, mkdirSync } = await import('node:fs')
      mkdirSync(dbDir, { recursive: true })
      writeSync(dbPath, dbContent)
    }

    // 解压 library/ 下的所有文件
    const entries = zip.getEntries()
    for (const entry of entries) {
      const entryName = entry.entryName
      if (!entry.isDirectory && entryName.startsWith('library/')) {
        const relativePath = entryName.slice('library/'.length)
        if (!relativePath) continue
        const destPath = join(libraryRoot, relativePath)
        // 安全检查：确保目标路径在 libraryRoot 内
        if (!destPath.startsWith(libraryRoot)) continue
        const destDir = dirname(destPath)
        const { writeFileSync: writeSync, mkdirSync } = await import('node:fs')
        mkdirSync(destDir, { recursive: true })
        writeSync(destPath, entry.getData())
      }
    }
  } catch (e) {
    // 即使解压失败也要重新打开数据库
    try { initDatabase(getDbPath()) } catch { /* 尽力恢复 */ }
    throw ioErr(`导入失败：${(e as Error).message}`)
  }

  // 重新打开数据库
  initDatabase(getDbPath())

  return { imported: true }
}
