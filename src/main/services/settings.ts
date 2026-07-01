/**
 * 设置服务（设计 §6、§13.4）。
 * - 非敏感设置存 settings 表（'app_settings' 单键）。
 * - DeepSeek API key 本体存系统安全存储（keychain.ts），表里只存后四位 / 是否已配置 / 最后验证时间。
 * - libraryPath 运行时计算，不持久化（第一版只读位置，设计 §13.4）。
 */
import { settingsRepository, SETTINGS_KEY_APP } from '../db/repositories'
import { DEFAULT_SETTINGS_BASE } from '@shared'
import type { AppSettings } from '@shared'
import { nowIso } from '../utils'
import {
  deleteSecret,
  lastFour,
  loadSecret,
  saveSecret,
  secretExists
} from '../security/keychain'
import { getLibraryRoot } from '../lib/paths'

export const DEEPSEEK_SECRET_NAME = 'deepseek_api_key'

type StoredSettings = Partial<Omit<AppSettings, 'libraryPath' | 'deepSeekKeyConfigured'>>

function readStored(): StoredSettings {
  return settingsRepository.get<StoredSettings>(SETTINGS_KEY_APP) ?? {}
}
function writeStored(s: StoredSettings): void {
  settingsRepository.set(SETTINGS_KEY_APP, s)
}

export function getSettings(): AppSettings {
  const stored = readStored()
  return {
    ...DEFAULT_SETTINGS_BASE,
    ...stored,
    libraryPath: getLibraryRoot(),
    deepSeekKeyConfigured: secretExists(DEEPSEEK_SECRET_NAME),
    deepSeekKeyLastFour: stored.deepSeekKeyLastFour ?? null,
    deepSeekKeyLastVerifiedAt: stored.deepSeekKeyLastVerifiedAt ?? null
  }
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const current = readStored()
  // 这些字段由专用方法/运行时管理，禁止通过通用 patch 改写
  const forbidden: (keyof AppSettings)[] = [
    'libraryPath',
    'deepSeekKeyConfigured',
    'deepSeekKeyLastFour',
    'deepSeekKeyLastVerifiedAt'
  ]
  const safe: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(patch)) {
    if (!forbidden.includes(k as keyof AppSettings)) safe[k] = v
  }
  writeStored({ ...current, ...safe })
  return getSettings()
}

export function setDeepSeekKey(key: string): AppSettings {
  const trimmed = key.trim()
  if (!trimmed) throw new Error('API key is empty')
  saveSecret(DEEPSEEK_SECRET_NAME, trimmed)
  const current = readStored()
  writeStored({
    ...current,
    deepSeekKeyLastFour: lastFour(trimmed),
    deepSeekKeyLastVerifiedAt: null
  })
  return getSettings()
}

export function deleteDeepSeekKey(): AppSettings {
  deleteSecret(DEEPSEEK_SECRET_NAME)
  const current = readStored()
  writeStored({
    ...current,
    deepSeekKeyLastFour: null,
    deepSeekKeyLastVerifiedAt: null
  })
  return getSettings()
}

export function getDeepSeekKey(): string | null {
  return loadSecret(DEEPSEEK_SECRET_NAME)
}

export function markDeepSeekVerified(): void {
  const current = readStored()
  writeStored({ ...current, deepSeekKeyLastVerifiedAt: nowIso() })
}
