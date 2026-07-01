/**
 * settings 表 repository（设计 §5.8）。
 * key/value_json 通用存储。AppSettings 整体序列化为 'app_settings' 单键。
 * 注意：API key 本体不入此表，仅存"是否已配置/后四位/最后验证时间"（设计 §6）。
 */
import { getDb } from '../connection'
import { nowIso } from '../../utils'

export const SETTINGS_KEY_APP = 'app_settings'

export const settingsRepository = {
  get<T = unknown>(key: string): T | undefined {
    const row = getDb().prepare('SELECT value_json FROM settings WHERE key = ?').get(key) as
      | { value_json: string }
      | undefined
    if (!row) return undefined
    try {
      return JSON.parse(row.value_json) as T
    } catch {
      return undefined
    }
  },

  set(key: string, value: unknown): void {
    const now = nowIso()
    getDb()
      .prepare(
        `INSERT INTO settings (key, value_json, updated_at)
         VALUES (@key, @json, @now)
         ON CONFLICT(key) DO UPDATE SET
           value_json = excluded.value_json,
           updated_at = excluded.updated_at`
      )
      .run({ key, json: JSON.stringify(value), now })
  },

  delete(key: string): boolean {
    const r = getDb().prepare('DELETE FROM settings WHERE key = ?').run(key)
    return r.changes > 0
  },

  list(): { key: string; value_json: string; updated_at: string }[] {
    return getDb().prepare('SELECT key, value_json, updated_at FROM settings').all() as {
      key: string
      value_json: string
      updated_at: string
    }[]
  }
}
