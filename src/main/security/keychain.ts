/**
 * API key 等敏感信息的安全存储（设计 §6）。
 * 优先使用 Electron safeStorage（Windows: DPAPI；macOS: Keychain；Linux: libsecret）。
 * 若加密不可用（如开发机无 keyring），回退到本地文件 + 警告日志，保证开发可运行；
 * 生产 Windows 不会触发回退。
 */
import { safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { getSecretsDir } from '../lib/paths'
import { logger } from '../lib/logger'

const SECRET_PREFIX = 'sk_'

function secretPath(name: string): string {
  return join(getSecretsDir(), `${SECRET_PREFIX}${name}.bin`)
}

export function isSecretStorageAvailable(): boolean {
  return safeStorage.isEncryptionAvailable()
}

function ensureSecretsDir(): void {
  mkdirSync(getSecretsDir(), { recursive: true })
}

/** 保存密文。加密不可用时回退为明文文件并警告。 */
export function saveSecret(name: string, value: string): void {
  ensureSecretsDir()
  const path = secretPath(name)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(value)
    writeFileSync(path, encrypted)
  } else {
    logger.warn(`safeStorage unavailable; storing secret "${name}" in plaintext (dev fallback).`)
    writeFileSync(path, value, 'utf8')
  }
}

/** 读取密文并解密；不存在返回 null。 */
export function loadSecret(name: string): string | null {
  const path = secretPath(name)
  if (!existsSync(path)) return null
  const buf = readFileSync(path)
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(buf)
    } catch {
      // 可能是明文回退遗留或环境变更，尝试当明文
      logger.warn(`Failed to decrypt secret "${name}"; attempting plaintext read.`)
      try {
        return buf.toString('utf8')
      } catch {
        return null
      }
    }
  }
  try {
    return buf.toString('utf8')
  } catch {
    return null
  }
}

export function deleteSecret(name: string): void {
  const path = secretPath(name)
  if (existsSync(path)) unlinkSync(path)
}

export function secretExists(name: string): boolean {
  return existsSync(secretPath(name))
}

/** 取密钥末四位用于设置页回显（非完整 key） */
export function lastFour(value: string): string {
  if (!value || value.length < 4) return ''
  return value.slice(-4)
}
