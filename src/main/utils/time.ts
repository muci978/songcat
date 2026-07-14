/**
 * 时间工具：ISO 字符串、本地时区日期 key。
 * Dashboard 聚合按本地时区分桶（用户感知的"今天"），不按 UTC。
 */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** 本地时区日期 key：YYYY-MM-DD */
export function localDateKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 任意 Date 的本地日期 key */
export function localDateKeyOfDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** 本地时区月份 key：YYYY-MM */
export function localMonthKey(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`
}

/** 本地时区年份 key：YYYY */
export function localYearKey(iso: string): string {
  return String(new Date(iso).getFullYear())
}

export function isSameLocalDay(iso: string, ref: Date): boolean {
  return localDateKey(iso) === localDateKeyOfDate(ref)
}

/** 生成从 startDate（含）到 endDate（含）的日期 key 序列，倒序 */
export function dateKeyRange(startDate: Date, endDate: Date): string[] {
  const out: string[] = []
  const start = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
  if (start.getTime() > end.getTime()) return out
  const cur = new Date(end)
  while (cur.getTime() >= start.getTime()) {
    out.push(localDateKeyOfDate(cur))
    cur.setDate(cur.getDate() - 1)
  }
  return out
}

/** 某日期往前推 days 天（含当天） */
export function recentDays(ref: Date, days: number): { start: Date; end: Date } {
  const end = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate(), 23, 59, 59, 999)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  start.setHours(0, 0, 0, 0)
  return { start, end }
}

/** 生成从 ref 往前推 months 个月的月份 key 序列（YYYY-MM），倒序，含当前月 */
export function recentMonthKeys(ref: Date, months: number): string[] {
  const out: string[] = []
  for (let i = 0; i < months; i++) {
    const y = ref.getFullYear()
    const m = ref.getMonth() + 1 - i
    const adjY = y + Math.floor((m - 1) / 12)
    const adjM = ((m - 1) % 12) + 1
    out.push(`${adjY}-${pad2(adjM)}`)
  }
  return out
}

/** 生成从 ref 往前推 years 个年份 key 序列（YYYY），倒序，含当前年 */
export function recentYearKeys(ref: Date, years: number): string[] {
  const out: string[] = []
  for (let i = 0; i < years; i++) {
    out.push(String(ref.getFullYear() - i))
  }
  return out
}

/** 把 (minutes) 时长格式化为 "1h 23m" / "5m" / "45s" */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0s'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  if (m === 0) return `${s}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  if (h === 0) return `${mm}m`
  return `${h}h ${mm}m`
}
