/**
 * 首次启动种子：内置免费资源站（设计 §5.6、§8）。
 * 仅当 resource_sources 表为空时插入，用户后续的自定义/启停不受影响。
 */
import { BUILTIN_RESOURCE_SOURCES } from '@shared'
import { newId, nowIso } from '../utils'
import type { Db } from './connection'

export function seedBuiltinSources(db: Db): void {
  const row = db.prepare('SELECT COUNT(*) AS c FROM resource_sources').get() as { c: number }
  if (row.c > 0) return
  const now = nowIso()
  const stmt = db.prepare(
    `INSERT INTO resource_sources
       (id, name, base_url, search_url_template, enabled, kind, policy, notes, created_at, updated_at)
     VALUES (@id, @name, @base_url, @search_url_template, @enabled, @kind, @policy, @notes, @created_at, @updated_at)`
  )
  const tx = db.transaction((items: typeof BUILTIN_RESOURCE_SOURCES) => {
    for (const s of items) {
      stmt.run({
        id: newId(),
        name: s.name,
        base_url: s.baseUrl,
        search_url_template: s.searchUrlTemplate,
        enabled: s.enabled ? 1 : 0,
        kind: s.kind,
        policy: s.policy,
        notes: s.notes,
        created_at: now,
        updated_at: now
      })
    }
  })
  tx(BUILTIN_RESOURCE_SOURCES)
}
