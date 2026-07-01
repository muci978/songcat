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
import { searchGuistudy } from './guistudy'

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

export async function searchFreeSources(query: string): Promise<FreeSourceSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  try {
    const results = await searchGuistudy(q)
    return results.map((r) => ({
      sourceName: 'guistudy 谱全了',
      sourcePolicy: 'browser-only' as const,
      title: r.title,
      artist: r.artist,
      url: r.url,
      instrument: r.instrument,
      screenshotUrl: r.screenshotUrl,
      typeLabel: r.typeLabel,
      keyLabel: r.keyLabel,
      snippet: [
        r.instrument === 'ukulele' ? '尤克里里' : '吉他',
        r.typeLabel,
        r.keyLabel
      ]
        .filter(Boolean)
        .join(' · ')
    }))
  } catch (e) {
    throw validation(`guistudy 搜索失败：${(e as Error).message}`)
  }
}
