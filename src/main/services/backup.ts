/**
 * 备份导出与导入（设计 §15.1）。
 * 打包 manifest.json + songcat.db + library/ 为 zip（adm-zip，CJS，与 main CJS 输出兼容）。
 * 不含 secrets（DeepSeek API key 在系统安全存储，不入备份）。
 */
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { getBackupsDir, getDbPath, getLibraryRoot } from '../lib/paths'
import { ensureDir } from '../lib/filestore'
import { closeDatabase, getDb, initDatabase, isDbInitialized } from '../db/connection'
import { normalizeLocalPaths } from '../db/maintenance'
import { isWithin } from '../utils/path'
import { logger } from '../lib/logger'
import { ioErr } from './errors'

/** 导出备份 zip。destDir 为自定义导出目录，不传则默认存到 backups 目录 */
export async function exportZip(destDir?: string | null): Promise<{ path: string }> {
  const outDir = destDir && existsSync(destDir) ? destDir : getBackupsDir()
  await ensureDir(outDir)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(outDir, `SongCat Backup ${stamp}.zip`)
  try {
    // 先把 WAL 中的改动合并回主库并截断，确保打包进 zip 的 songcat.db 是完整快照
    // （原实现只读主库文件，会遗漏尚在 -wal 中、未 checkpoint 的数据 → 备份缺失最新改动）
    if (isDbInitialized()) {
      try {
        getDb().pragma('wal_checkpoint(TRUNCATE)')
      } catch (e) {
        logger.error('导出前 WAL checkpoint 失败，备份可能不含最新改动', e)
      }
    }
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

  // 关库前先校验关键内容存在，避免关库后才发现无效备份
  const dbEntry = zip.getEntry('songcat.db')
  if (!dbEntry) throw ioErr('无效备份：缺少 songcat.db')

  const dbPath = getDbPath()
  const libraryRoot = getLibraryRoot()
  const tmpDbPath = `${dbPath}.import`

  // 关闭数据库，准备覆盖
  closeDatabase()

  try {
    // 1. 先把新库写到临时文件（同目录，稍后用 rename 原子替换）
    mkdirSync(dirname(dbPath), { recursive: true })
    writeFileSync(tmpDbPath, dbEntry.getData())

    // 2. 解压 library/ 下的所有文件（覆盖当前曲库）
    const entries = zip.getEntries()
    for (const entry of entries) {
      const entryName = entry.entryName
      if (entry.isDirectory || !entryName.startsWith('library/')) continue
      const relativePath = entryName.slice('library/'.length)
      if (!relativePath) continue
      const destPath = join(libraryRoot, relativePath)
      // 安全检查：用 isWithin 精确判断（startsWith 有前缀绕过风险，如 lib vs lib-evil）
      if (!isWithin(libraryRoot, destPath)) continue
      mkdirSync(dirname(destPath), { recursive: true })
      writeFileSync(destPath, entry.getData())
    }

    // 3. 原子替换主库并清除属于旧库的 WAL 边车文件（否则旧 -wal 会污染新库）
    renameSync(tmpDbPath, dbPath)
    for (const suffix of ['-wal', '-shm']) {
      try { rmSync(`${dbPath}${suffix}`, { force: true }) } catch { /* ignore */ }
    }
  } catch (e) {
    // 失败：清理临时文件，尽力重新打开原数据库（此时主库尚未被替换）
    try { rmSync(tmpDbPath, { force: true }) } catch { /* ignore */ }
    try { initDatabase(dbPath) } catch { /* 尽力恢复 */ }
    logger.error('导入备份失败', e)
    throw ioErr(`导入失败：${(e as Error).message}`)
  }

  // 重新打开数据库，并把老备份里的绝对 local_path 规范化为相对存储
  initDatabase(dbPath)
  try {
    const n = normalizeLocalPaths()
    if (n > 0) logger.info(`导入后规范化 ${n} 条本地文件路径`)
  } catch (e) {
    logger.error('导入后路径规范化失败', e)
  }

  return { imported: true }
}
