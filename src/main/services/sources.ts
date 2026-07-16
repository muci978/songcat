/**
 * 免费资源站服务（设计 §5.6、§8、§13.4）。
 * 支持多来源搜索：每个启用的来源对应一个 SearchAdapter，
 * guistudy 使用专用适配器，其余使用通用适配器。
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
import { createAdapter } from './search-adapters'

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

/**
 * 按来源 ID 搜索免费资源。
 * 根据 sourceId 查找对应来源，创建适配器执行搜索。
 */
export async function searchFreeSources(
  query: string,
  sourceId: string
): Promise<FreeSourceSearchResult[]> {
  const q = query.trim()
  if (!q) return []

  // 查找来源
  const row = resourceSourcesRepository.getById(sourceId)
  if (!row) throw validation(`来源不存在：${sourceId}`)
  const source = resourceSourcesRepository.toModels([row])[0]
  if (!source) throw validation(`来源不存在：${sourceId}`)
  if (!source.enabled) throw validation(`来源「${source.name}」已禁用。`)

  // 创建适配器并搜索
  const adapter = createAdapter(source)
  try {
    const results = await adapter.search(q)
    return results.map((r) => ({
      sourceId: adapter.sourceId,
      sourceName: adapter.sourceName,
      sourcePolicy: adapter.sourcePolicy,
      title: r.title,
      artist: r.artist,
      url: r.url,
      instrument: r.instrument,
      screenshotUrl: r.screenshotUrl,
      typeLabel: r.typeLabel,
      keyLabel: r.keyLabel,
      snippet: [
        r.instrument === 'ukulele' ? '尤克里里' : r.instrument === 'guitar' ? '吉他' : null,
        r.typeLabel,
        r.keyLabel
      ]
        .filter(Boolean)
        .join(' · ') || null
    }))
  } catch (e) {
    throw validation(`${adapter.sourceName} 搜索失败：${(e as Error).message}`)
  }
}
