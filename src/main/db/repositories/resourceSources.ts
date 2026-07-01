/**
 * resource_sources 表 repository（设计 §5.6）。
 * 内置来源由 seed.ts 首次启动写入；用户可新增自定义、启停。
 */
import { getDb } from '../connection'
import { rowToResourceSource } from '../mappers'
import type {
  ResourceSource,
  ResourceSourceKind,
  ResourceSourcePolicy,
  ResourceSourceRow
} from '@shared'
import { newId, nowIso } from '../../utils'

export interface NewResourceSourceRecord {
  name: string
  baseUrl?: string | null
  searchUrlTemplate?: string | null
  enabled?: boolean
  kind: ResourceSourceKind
  policy: ResourceSourcePolicy
  notes?: string | null
}

export interface ResourceSourcePatch {
  name?: string
  baseUrl?: string | null
  searchUrlTemplate?: string | null
  enabled?: boolean
  kind?: ResourceSourceKind
  policy?: ResourceSourcePolicy
  notes?: string | null
}

export const resourceSourcesRepository = {
  list(): ResourceSourceRow[] {
    return getDb().prepare('SELECT * FROM resource_sources ORDER BY created_at ASC').all() as ResourceSourceRow[]
  },

  listEnabled(): ResourceSourceRow[] {
    return getDb()
      .prepare('SELECT * FROM resource_sources WHERE enabled = 1 ORDER BY created_at ASC')
      .all() as ResourceSourceRow[]
  },

  toModels(rows: ResourceSourceRow[]): ResourceSource[] {
    return rows.map(rowToResourceSource)
  },

  getById(id: string): ResourceSourceRow | undefined {
    return getDb().prepare('SELECT * FROM resource_sources WHERE id = ?').get(id) as
      | ResourceSourceRow
      | undefined
  },

  create(rec: NewResourceSourceRecord): ResourceSourceRow {
    const id = newId()
    const now = nowIso()
    getDb()
      .prepare(
        `INSERT INTO resource_sources
           (id, name, base_url, search_url_template, enabled, kind, policy, notes, created_at, updated_at)
         VALUES (@id, @name, @baseUrl, @searchUrlTemplate, @enabled, @kind, @policy, @notes, @now, @now)`
      )
      .run({
        id,
        name: rec.name,
        baseUrl: rec.baseUrl ?? null,
        searchUrlTemplate: rec.searchUrlTemplate ?? null,
        enabled: rec.enabled === false ? 0 : 1,
        kind: rec.kind,
        policy: rec.policy,
        notes: rec.notes ?? null,
        now
      })
    return this.getById(id)!
  },

  update(id: string, patch: ResourceSourcePatch): ResourceSourceRow | undefined {
    const sets: string[] = ['updated_at = @now']
    const params: Record<string, unknown> = { now: nowIso(), id }
    if (patch.name !== undefined) {
      params.name = patch.name
      sets.push('name = @name')
    }
    if (patch.baseUrl !== undefined) {
      params.baseUrl = patch.baseUrl
      sets.push('base_url = @baseUrl')
    }
    if (patch.searchUrlTemplate !== undefined) {
      params.tmpl = patch.searchUrlTemplate
      sets.push('search_url_template = @tmpl')
    }
    if (patch.enabled !== undefined) {
      params.enabled = patch.enabled ? 1 : 0
      sets.push('enabled = @enabled')
    }
    if (patch.kind !== undefined) {
      params.kind = patch.kind
      sets.push('kind = @kind')
    }
    if (patch.policy !== undefined) {
      params.policy = patch.policy
      sets.push('policy = @policy')
    }
    if (patch.notes !== undefined) {
      params.notes = patch.notes
      sets.push('notes = @notes')
    }
    getDb().prepare(`UPDATE resource_sources SET ${sets.join(', ')} WHERE id = @id`).run(params)
    return this.getById(id)
  },

  delete(id: string): boolean {
    const r = getDb().prepare('DELETE FROM resource_sources WHERE id = ?').run(id)
    return r.changes > 0
  }
}
