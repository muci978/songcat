/** 时间/文本格式化（renderer 用） */

export function formatSeconds(total: number): string {
  if (!total || total < 0) return '0m'
  const m = Math.floor(total / 60)
  const s = Math.round(total % 60)
  if (m === 0) return `${s}s`
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}m`
  return `${h}h ${m % 60}m`
}

/** 计时器显示 mm:ss / hh:mm:ss */
export function formatClock(total: number): string {
  const s = Math.floor(total % 60)
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return ''
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function minutesLabel(seconds: number): string {
  const m = Math.round(seconds / 60)
  return `${m} 分钟`
}
