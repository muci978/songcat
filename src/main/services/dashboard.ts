/**
 * Dashboard 统计服务（设计 §12）。
 * 所有统计从原始 session 聚合（aggregatePractice 纯函数），按本地时区分桶。
 */
import { getDb } from '../db/connection'
import { practiceSessionsRepository, songsRepository } from '../db/repositories'
import { aggregatePractice } from '../utils'
import type { DashboardStats } from '@shared'

export function getStats(): DashboardStats {
  const now = new Date()

  const sessions = practiceSessionsRepository.allForAggregation().map((s) => ({
    songId: s.song_id,
    startedAt: s.started_at,
    durationSeconds: s.duration_seconds
  }))
  const songsArr = songsRepository.allForAggregation()
  const songsMap = new Map(
    songsArr.map((s) => [
      s.id,
      {
        id: s.id,
        title: s.title,
        artist: s.artist_normalized ?? s.artist ?? null
      }
    ])
  )
  const agg = aggregatePractice(sessions, songsMap, now, 30)

  const totals = getDb()
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status='to-learn' THEN 1 ELSE 0 END) AS to_learn,
              SUM(CASE WHEN status='learning' THEN 1 ELSE 0 END) AS learning,
              SUM(CASE WHEN status='learned' THEN 1 ELSE 0 END) AS learned,
              COALESCE(SUM(is_favorite), 0) AS favorite
       FROM songs`
    )
    .get() as {
    total: number
    to_learn: number
    learning: number
    learned: number
    favorite: number
  }

  // 最近练习的 5 首歌（按最后练习时间）
  const recentRows = getDb()
    .prepare(
      `SELECT s.id AS song_id, s.title, s.artist, MAX(p.started_at) AS last_at
       FROM practice_sessions p JOIN songs s ON s.id = p.song_id
       WHERE p.ended_at IS NOT NULL
       GROUP BY s.id ORDER BY last_at DESC LIMIT 5`
    )
    .all() as { song_id: string; title: string; artist: string | null; last_at: string }[]
  const todayMap = new Map(agg.todayBySong.map((t) => [t.songId, t.seconds]))
  const recentPractice = recentRows.map((r) => ({
    songId: r.song_id,
    title: r.title,
    artist: r.artist,
    lastPracticedAt: r.last_at,
    secondsToday: todayMap.get(r.song_id) ?? 0
  }))

  return {
    totalSongs: totals.total,
    toLearnCount: totals.to_learn,
    learningCount: totals.learning,
    learnedCount: totals.learned,
    favoriteCount: totals.favorite,
    todayPracticeSeconds: agg.todaySeconds,
    monthPracticeSeconds: agg.monthSeconds,
    yearPracticeSeconds: agg.yearSeconds,
    trend: agg.trend,
    todayBySong: agg.todayBySong,
    byArtist: agg.byArtist,
    recentPractice
  }
}
