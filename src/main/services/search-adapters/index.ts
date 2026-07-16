/**
 * 搜索适配器注册表。
 * 根据来源信息匹配对应的 SearchAdapter 实现。
 */
import type { ResourceSource } from '@shared'
import type { SearchAdapter } from './types'
import { GuistudyAdapter, isGuistudySource } from './guistudy'
import { GenericAdapter } from './generic'

/**
 * 为给定来源创建对应的搜索适配器。
 * 已知来源（guistudy）使用专用适配器，其余使用通用适配器。
 */
export function createAdapter(source: ResourceSource): SearchAdapter {
  if (isGuistudySource(source)) {
    return new GuistudyAdapter(source)
  }
  return new GenericAdapter(source)
}

/**
 * 为所有启用来源创建搜索适配器。
 */
export function createAdapters(sources: ResourceSource[]): SearchAdapter[] {
  return sources.filter((s) => s.enabled).map(createAdapter)
}
