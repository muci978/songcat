/**
 * 数据库迁移。第一版只有 v1（建表）。
 * 用 SQLite 的 PRAGMA user_version 记录版本，幂等可重复执行。
 */
import { SCHEMA_STATEMENTS } from './schema'
import type { Db } from './connection'

interface Migration {
  version: number
  run: (db: Db) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    run: (db) => {
      db.exec(SCHEMA_STATEMENTS.join('\n;\n'))
    }
  }
]

export function runMigrations(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number
  for (const m of migrations) {
    if (m.version > current) {
      const tx = db.transaction(() => {
        m.run(db)
        db.pragma(`user_version = ${m.version}`)
      })
      tx()
    }
  }
}

export function getSchemaVersion(db: Db): number {
  return db.pragma('user_version', { simple: true }) as number
}
