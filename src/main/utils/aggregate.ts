/**
 * 练习时间聚合（纯函数，可单元测试）。
 * Dashboard 所有统计都从原始 session 聚合，不维护手工 counter（设计 §5.4、§12）。
 * 按本地时区分桶。
 */
import {
  localDateKey,
  localDateKeyOfDate,
  localMonthKey,
  localYearKey,
  recentDays,
  dateKeyRange
} from './time'

export interface SessionAggItem {
  songId: string
  startedAt: string
  durationSeconds: number
}

export interface SongLookup {
  id: string
  title: string
  /** 已规范化的艺人名（用于艺人占比） */
  artist: string | null
}

export interface AggregateResult {
  todaySeconds: number
  monthSeconds: number
  yearSeconds: number
  /** 最近 trendDays 天（含无练习日，0 填充），按日期倒序 */
  trend: { date: string; seconds: number }[]
  /** 今日各歌曲练习时长 */
  todayBySong: { songId: string; title: string; artist: string | null; seconds: number }[]
  /** 全部时段艺人练习占比 */
  byArtist: { artist: string | null; seconds: number }[]
}

export function aggregatePractice(
  sessions: SessionAggItem[],
  songs: Map<string, SongLookup>,
  now: Date,
  trendDays = 30
): AggregateResult {
  const todayKey = localDateKeyOfDate(now)
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const yearKey = String(now.getFullYear())

  let todaySeconds = 0
  let monthSeconds = 0
  let yearSeconds = 0
  const todayBySong = new Map<string, number>()
  const byArtist = new Map<string, number>()
  const trendMap = new Map<string, number>()

  for (const s of sessions) {
    if (s.durationSeconds <= 0) continue
    const dk = localDateKey(s.startedAt)
    const mk = localMonthKey(s.startedAt)
    const yk = localYearKey(s.startedAt)

    if (dk === todayKey) {
      todaySeconds += s.durationSeconds
      todayBySong.set(s.songId, (todayBySong.get(s.songId) ?? 0) + s.durationSeconds)
    }
    if (mk === monthKey) monthSeconds += s.durationSeconds
    if (yk === yearKey) yearSeconds += s.durationSeconds

    const song = songs.get(s.songId)
    const artistKey = song?.artist ?? ''
    byArtist.set(artistKey, (byArtist.get(artistKey) ?? 0) + s.durationSeconds)

    trendMap.set(dk, (trendMap.get(dk) ?? 0) + s.durationSeconds)
  }

  const { start, end } = recentDays(now, trendDays)
  const trendDates = dateKeyRange(start, end) // 倒序
  const trend = trendDates.map((date) => ({ date, seconds: trendMap.get(date) ?? 0 }))

  const todayBySongArr = [...todayBySong.entries()]
    .map(([songId, seconds]) => {
      const song = songs.get(songId)
      return {
        songId,
        title: song?.title ?? '(已删除)',
        artist: song?.artist ?? null,
        seconds
      }
    })
    .sort((a, b) => b.seconds - a.seconds)

  const byArtistArr = [...byArtist.entries()]
    .map(([artist, seconds]) => ({ artist: artist || null, seconds }))
    .sort((a, b) => b.seconds - a.seconds)

  return {
    todaySeconds,
    monthSeconds,
    yearSeconds,
    trend,
    todayBySong: todayBySongArr,
    byArtist: byArtistArr
  }
}
