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
  },
  {
    version: 2,
    run: (db) => {
      // 重建 score_assets：去掉 type CHECK（支持 guitar-pro/ukulele-pro），加 source/instrument
      db.exec(`
        CREATE TABLE IF NOT EXISTS _score_assets_v2 (
          id TEXT PRIMARY KEY NOT NULL,
          song_id TEXT NOT NULL,
          type TEXT NOT NULL,
          title TEXT,
          local_path TEXT,
          source_url TEXT,
          source_name TEXT,
          source_policy TEXT NOT NULL DEFAULT 'unknown',
          source TEXT NOT NULL DEFAULT 'local',
          instrument TEXT,
          file_hash TEXT,
          file_size INTEGER,
          mime_type TEXT,
          original_filename TEXT,
          date_added TEXT NOT NULL,
          is_primary INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
        );
        INSERT OR IGNORE INTO _score_assets_v2
          (id, song_id, type, title, local_path, source_url, source_name, source_policy,
           source, instrument, file_hash, file_size, mime_type, original_filename, date_added, is_primary)
        SELECT id, song_id, type, title, local_path, source_url, source_name, source_policy,
           'local', NULL, file_hash, file_size, mime_type, original_filename, date_added, is_primary
        FROM score_assets;
        DROP TABLE score_assets;
        ALTER TABLE _score_assets_v2 RENAME TO score_assets;
        CREATE INDEX IF NOT EXISTS idx_assets_song ON score_assets(song_id);
        CREATE INDEX IF NOT EXISTS idx_assets_hash ON score_assets(file_hash);
        CREATE INDEX IF NOT EXISTS idx_assets_type ON score_assets(type);
      `)
    }
  },
  {
    version: 3,
    run: (db) => {
      db.exec(`
        ALTER TABLE score_assets ADD COLUMN group_id TEXT;
        ALTER TABLE score_assets ADD COLUMN group_sort INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_assets_song_group ON score_assets(song_id, group_id);
        PRAGMA foreign_key_check;
      `)
    }
  },
  {
    version: 4,
    run: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS practice_goals (
          id TEXT PRIMARY KEY NOT NULL,
          target_seconds INTEGER NOT NULL DEFAULT 1800,
          date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_goals_date ON practice_goals(date);
      `)
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
