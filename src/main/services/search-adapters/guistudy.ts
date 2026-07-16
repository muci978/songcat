/**
 * guistudy（谱全了）搜索适配器。
 * 封装现有 searchGuistudy() 为 SearchAdapter 实现。
 */
import type { ResourceSource, ResourceSourcePolicy } from '@shared'
import type { SearchAdapter, AdapterSearchResult } from './types'
import { searchGuistudy } from '../guistudy'

export class GuistudyAdapter implements SearchAdapter {
  readonly sourceId: string
  readonly sourceName: string
  readonly sourcePolicy: ResourceSourcePolicy

  constructor(source: ResourceSource) {
    this.sourceId = source.id
    this.sourceName = source.name
    this.sourcePolicy = source.policy
  }

  async search(query: string): Promise<AdapterSearchResult[]> {
    const results = await searchGuistudy(query)
    return results.map((r) => ({
      title: r.title,
      artist: r.artist,
      url: r.url,
      instrument: r.instrument,
      screenshotUrl: r.screenshotUrl,
      typeLabel: r.typeLabel,
      keyLabel: r.keyLabel
    }))
  }
}

/** 判断一个来源是否匹配 guistudy 适配器 */
export function isGuistudySource(source: ResourceSource): boolean {
  const name = source.name.toLowerCase()
  const baseUrl = (source.baseUrl ?? '').toLowerCase()
  return name.includes('guistudy') || baseUrl.includes('guistudy.com')
}
