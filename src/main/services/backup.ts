/**
 * 备份导出（设计 §15.1）。
 * 打包 manifest.json + songcat.db + library/ 为 zip（adm-zip，CJS，与 main CJS 输出兼容）。
 * 不含 secrets（DeepSeek API key 在系统安全存储，不入备份）。
 */
import AdmZip from 'adm-zip'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getBackupsDir, getDbPath, getLibraryRoot } from '../lib/paths'
import { ensureDir } from '../lib/filestore'
import { ioErr } from './errors'

export async function exportZip(): Promise<{ path: string }> {
  await ensureDir(getBackupsDir())
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(getBackupsDir(), `SongCat Backup ${stamp}.zip`)
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
