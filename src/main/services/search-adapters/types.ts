/**
 * 搜索适配器类型定义。
 * 每个免费资源站对应一个 SearchAdapter 实现，
 * 统一搜索接口，便于扩展新来源。
 */
import type { Instrument, ResourceSourcePolicy } from '@shared'

/** 搜索适配器接口 */
export interface SearchAdapter {
  /** 来源 ID（对应 resource_sources 表的 id） */
  sourceId: string
  /** 来源显示名 */
  sourceName: string
  /** 来源策略 */
  sourcePolicy: ResourceSourcePolicy
  /** 执行搜索 */
  search(query: string): Promise<AdapterSearchResult[]>
}

/** 适配器层搜索结果（与来源无关的通用结构） */
export interface AdapterSearchResult {
  title: string
  artist: string | null
  url: string
  instrument: Instrument | null
  screenshotUrl: string | null
  typeLabel: string | null
  keyLabel: string | null
}
