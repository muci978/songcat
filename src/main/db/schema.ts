/**
 * SQLite schema（设计 §5）。
 * 第一版用 LIKE 包含匹配 + 预计算的 title_pinyin_initial（设计 §7.3），
 * 不引入 FTS5 external-content 表（避免同步触发器复杂度），分词检索列为未来增强。
 *
 * 约定：
 *   - 主键 id 为 TEXT（UUID）。
 *   - 时间为 TEXT（ISO 8601 UTC）。
 *   - 布尔为 INTEGER 0/1。
 *   - 外键级联删除（songs 删除时其资产/链接/会话/录音一并删除）。
 */

export const SCHEMA_STATEMENTS: readonly string[] = [
  // songs
  `CREATE TABLE IF NOT EXISTS songs (
     id                   TEXT PRIMARY KEY NOT NULL,
     title                TEXT NOT NULL,
     title_pinyin_initial TEXT,
     artist               TEXT,
     artist_normalized    TEXT,
     status               TEXT NOT NULL DEFAULT 'to-learn'
                          CHECK (status IN ('to-learn','learning','learned')),
     is_favorite          INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
     difficulty           INTEGER CHECK (difficulty IS NULL OR (difficulty BETWEEN 1 AND 5)),
     notes                TEXT,
     original_audio_url   TEXT,
     date_added           TEXT NOT NULL,
     date_updated         TEXT NOT NULL,
     last_opened_at       TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_songs_status ON songs(status)`,
  `CREATE INDEX IF NOT EXISTS idx_songs_favorite ON songs(is_favorite)`,
  `CREATE INDEX IF NOT EXISTS idx_songs_artist_norm ON songs(artist_normalized)`,
  `CREATE INDEX IF NOT EXISTS idx_songs_date_added ON songs(date_added)`,
  `CREATE INDEX IF NOT EXISTS idx_songs_pinyin ON songs(title_pinyin_initial)`,
  `CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title)`,

  // score_assets
  `CREATE TABLE IF NOT EXISTS score_assets (
     id               TEXT PRIMARY KEY NOT NULL,
     song_id          TEXT NOT NULL,
     type             TEXT NOT NULL,
     title            TEXT,
     local_path       TEXT,
     source_url       TEXT,
     source_name      TEXT,
     source_policy    TEXT NOT NULL DEFAULT 'unknown'
                      CHECK (source_policy IN ('free-direct','free-link-only','user-imported','unknown')),
     source           TEXT NOT NULL DEFAULT 'local',
     instrument       TEXT,
     file_hash        TEXT,
     file_size        INTEGER,
     mime_type        TEXT,
     original_filename TEXT,
     date_added       TEXT NOT NULL,
     is_primary       INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
     group_id         TEXT,
     group_sort       INTEGER NOT NULL DEFAULT 0,
     FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_assets_song ON score_assets(song_id)`,
  `CREATE INDEX IF NOT EXISTS idx_assets_hash ON score_assets(file_hash)`,
  `CREATE INDEX IF NOT EXISTS idx_assets_type ON score_assets(type)`,
  `CREATE INDEX IF NOT EXISTS idx_assets_song_group ON score_assets(song_id, group_id)`,

  // source_links
  `CREATE TABLE IF NOT EXISTS source_links (
     id              TEXT PRIMARY KEY NOT NULL,
     song_id         TEXT NOT NULL,
     url             TEXT NOT NULL,
     source_name     TEXT,
     kind            TEXT NOT NULL
                     CHECK (kind IN ('score','audio','reference','search-result')),
     title           TEXT,
     notes           TEXT,
     date_added      TEXT NOT NULL,
     last_checked_at TEXT,
     FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_source_links_song ON source_links(song_id)`,
  `CREATE INDEX IF NOT EXISTS idx_source_links_kind ON source_links(kind)`,

  // practice_sessions
  `CREATE TABLE IF NOT EXISTS practice_sessions (
     id                TEXT PRIMARY KEY NOT NULL,
     song_id           TEXT NOT NULL,
     started_at        TEXT NOT NULL,
     ended_at          TEXT,
     duration_seconds  INTEGER NOT NULL DEFAULT 0,
     last_heartbeat_at TEXT,
     stop_reason       TEXT CHECK (stop_reason IS NULL
                        OR stop_reason IN ('manual','leave-score-view','switch-song','app-close','recovery')),
     created_at        TEXT NOT NULL,
     FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_practice_song ON practice_sessions(song_id)`,
  `CREATE INDEX IF NOT EXISTS idx_practice_started ON practice_sessions(started_at)`,
  // 部分索引：快速定位未结束会话
  `CREATE INDEX IF NOT EXISTS idx_practice_active ON practice_sessions(song_id) WHERE ended_at IS NULL`,

  // recordings（每首歌唯一一条）
  `CREATE TABLE IF NOT EXISTS recordings (
     id               TEXT PRIMARY KEY NOT NULL,
     song_id          TEXT NOT NULL UNIQUE,
     local_path       TEXT NOT NULL,
     file_hash        TEXT,
     file_size        INTEGER,
     duration_seconds INTEGER,
     recorded_at      TEXT NOT NULL,
     mime_type        TEXT,
     FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
   )`,

  // resource_sources（免费资源站）
  `CREATE TABLE IF NOT EXISTS resource_sources (
     id                   TEXT PRIMARY KEY NOT NULL,
     name                 TEXT NOT NULL,
     base_url             TEXT,
     search_url_template  TEXT,
     enabled              INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
     kind                 TEXT NOT NULL CHECK (kind IN ('score','audio','mixed')),
     policy               TEXT NOT NULL
                          CHECK (policy IN ('direct-download','link-only','browser-only')),
     notes                TEXT,
     created_at           TEXT NOT NULL,
     updated_at           TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sources_enabled ON resource_sources(enabled)`,

  // download_jobs
  `CREATE TABLE IF NOT EXISTS download_jobs (
     id              TEXT PRIMARY KEY NOT NULL,
     song_id         TEXT,
     source_url      TEXT NOT NULL,
     source_name     TEXT,
     target_asset_id TEXT,
     status          TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','completed','failed','cancelled')),
     error_message   TEXT,
     started_at      TEXT,
     completed_at    TEXT,
     created_at      TEXT NOT NULL,
     FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE SET NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_status ON download_jobs(status)`,

  // settings（key/value；API key 不入此表）
  `CREATE TABLE IF NOT EXISTS settings (
     key        TEXT PRIMARY KEY NOT NULL,
     value_json TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`
]
