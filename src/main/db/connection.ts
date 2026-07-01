/**
 * SQLite 连接管理（better-sqlite3，同步 API，适合 Electron main）。
 * - WAL 模式提升并发与性能。
 * - 外键约束开启。
 * - 单例 db，供各 repository 共用。
 */
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { runMigrations } from './migrate'

let dbInstance: DatabaseType | null = null

/** 打开/创建数据库并执行迁移。dbPath 通常为 userData/SongCat/songcat.db */
export function initDatabase(dbPath: string): DatabaseType {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('synchronous = NORMAL')
  runMigrations(db)
  dbInstance = db
  return db
}

/** 取得已初始化的 db 单例 */
export function getDb(): DatabaseType {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return dbInstance
}

/** 仅供测试：注入一个临时 db（如 :memory:） */
export function setDbForTesting(db: DatabaseType): void {
  dbInstance = db
}

export function closeDatabase(): void {
  try {
    dbInstance?.close()
  } finally {
    dbInstance = null
  }
}

export type Db = DatabaseType
