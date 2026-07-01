/**
 * URL 安全校验。仅允许 http/https，杜绝 javascript:/file:/ 等危险协议。
 */
export function isHttpUrl(s: string): boolean {
  if (!s || typeof s !== 'string') return false
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** 取 URL 所在的站点名（host），用于来源记录的回退命名 */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).host || null
  } catch {
    return null
  }
}
