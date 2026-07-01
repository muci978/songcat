/**
 * 免费资源站服务（设计 §5.6、§8、§13.4）。
 * 第一版 searchFreeSources 返回每个启用来源的"搜索入口链接"，
 * 用户据此在站点查找资源，再用"粘贴链接"导入（避免抓取/反爬）。
 * 实际抓取与去重作为未来增强（设计 §19.3）。
 */
import { resourceSourcesRepository } from '../db/repositories'
import type {
  CreateResourceSourceInput,
  FreeSourceSearchResult,
  ResourceSource,
  UpdateResourceSourceInput
} from '@shared'
import { isHttpUrl } from '../utils'
import { validation } from './errors'

export function listSources(): ResourceSource[] {
  return resourceSourcesRepository.toModels(resourceSourcesRepository.list())
}

export function createSource(input: CreateResourceSourceInput): ResourceSource {
  if (!input.name?.trim()) throw validation('来源名称不能为空。')
  if (input.baseUrl && !isHttpUrl(input.baseUrl)) throw validation('baseUrl 链接无效。')
  const row = resourceSourcesRepository.create({
    name: input.name.trim(),
    baseUrl: input.baseUrl ?? null,
    searchUrlTemplate: input.searchUrlTemplate ?? null,
    enabled: input.enabled ?? true,
    kind: input.kind,
    policy: input.policy,
    notes: input.notes ?? null
  })
  return resourceSourcesRepository.toModels([row])[0]
}

export function updateSource(input: UpdateResourceSourceInput): ResourceSource {
  const row = resourceSourcesRepository.update(input.id, {
    name: input.name,
    baseUrl: input.baseUrl,
    searchUrlTemplate: input.searchUrlTemplate,
    enabled: input.enabled,
    kind: input.kind,
    policy: input.policy,
    notes: input.notes
  })
  if (!row) throw validation(`来源不存在：${input.id}`)
  return resourceSourcesRepository.toModels([row])[0]
}

export function removeSource(id: string): boolean {
  return resourceSourcesRepository.delete(id)
}

export function searchFreeSources(query: string): FreeSourceSearchResult[] {
  const q = query.trim()
  if (!q) return []
  const sources = resourceSourcesRepository.listEnabled()
  return sources.map((s) => ({
    sourceName: s.name,
    sourcePolicy: s.policy,
    title: `在 ${s.name} 搜索`,
    url: buildSearchUrl(s.search_url_template, s.base_url, q),
    inferredType: s.kind === 'audio' ? null : 'pdf',
    snippet: s.notes
  }))
}

function buildSearchUrl(
  template: string | null,
  baseUrl: string | null,
  query: string
): string {
  const enc = encodeURIComponent(query)
  if (template && template.includes('{q}')) return template.replace('{q}', enc)
  if (baseUrl) return `${baseUrl.replace(/\/$/, '')}/?q=${enc}`
  return `https://www.google.com/search?q=${enc}+sheet+music`
}
