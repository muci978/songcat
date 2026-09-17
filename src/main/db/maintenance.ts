/**
 * 数据库维护：存量数据规范化（在启动流程 initDatabase 之后调用）。
 *
 * 为什么不放在 db/migrate.ts：
 *   迁移模块被测试直接 import 且不依赖 electron；而路径规范化需要 getLibraryRoot()
 *   （依赖 electron app），放进迁移会把 electron 依赖引入测试路径。故独立于此。
 */
import { isAbsolute, relative } from 'node:path'
import { getDb } from './connection'
import { getLibraryRoot } from '../lib/paths'
import { isWithin, toPosix } from '../utils/path'

/**
 * 把存量的绝对 local_path 规范化为相对曲库根的 POSIX 路径（幂等）。
 * 仅转换"位于当前曲库根内的绝对路径"；库外的绝对路径与已是相对的路径保持不变。
 * 相对路径存储使备份/换机/换数据目录后仍能通过 resolveLibraryPath 正确定位文件。
 * @returns 实际转换的行数
 */
export function normalizeLocalPaths(): number {
  const db = getDb()
  const root = getLibraryRoot()
  let changed = 0
  // 表名为硬编码字面量，非外部输入，无注入风险
  for (const table of ['score_assets', 'recordings'] as const) {
    const rows = db
      .prepare(`SELECT id, local_path FROM ${table} WHERE local_path IS NOT NULL`)
      .all() as { id: string; local_path: string }[]
    const upd = db.prepare(`UPDATE ${table} SET local_path = ? WHERE id = ?`)
    const tx = db.transaction(() => {
      for (const r of rows) {
        if (isAbsolute(r.local_path) && isWithin(root, r.local_path)) {
          upd.run(toPosix(relative(root, r.local_path)), r.id)
          changed++
        }
      }
    })
    tx()
  }
  return changed
}
