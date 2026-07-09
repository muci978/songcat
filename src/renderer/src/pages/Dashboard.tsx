/** Dashboard 页面（设计 §12）：统计卡片 + 趋势 + 占比图 + 最近练习 —— 明亮毛玻璃风格 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts'
import type { DashboardStats } from '@shared'
import { api, unwrap } from '../lib/api'
import { formatDate, formatSeconds, minutesLabel, truncate } from '../lib/format'
import { Card, Empty, Spinner } from '../components/ui'

/* 明亮暖色系配色方案 */
const PIE_COLORS = ['#f97316', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4']
const BAR_COLOR = '#f97316'

export default function Dashboard(): React.ReactElement {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setStats(await unwrap(api.dashboard.getStats()))
      } catch (e) {
        setError((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) return <Spinner />
  if (error || !stats) return <Empty>无法加载统计数据：{error}</Empty>

  const trendData = [...stats.trend]
    .reverse()
    .map((t) => ({ date: t.date.slice(5), minutes: Math.round(t.seconds / 60) }))
  const todaySongData = stats.todayBySong.slice(0, 6).map((s) => ({
    name: truncate(s.title, 8),
    seconds: Math.round(s.seconds / 60)
  }))
  const artistData = stats.byArtist.slice(0, 6).map((a) => ({
    name: truncate(a.artist ?? '未知', 10),
    value: a.seconds
  }))

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {/* 统计卡片 —— 更大的圆角和悬浮效果 */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', marginBottom: 28 }}>
        <StatCard label="总歌曲" value={stats.totalSongs} />
        <StatCard label="想学" value={stats.toLearnCount} />
        <StatCard label="学习中" value={stats.learningCount} />
        <StatCard label="已学会" value={stats.learnedCount} />
        <StatCard label="收藏" value={stats.favoriteCount} />
        <StatCard label="今日练习" value={minutesLabel(stats.todayPracticeSeconds)} />
        <StatCard label="本月练习" value={minutesLabel(stats.monthPracticeSeconds)} />
        <StatCard label="今年练习" value={minutesLabel(stats.yearPracticeSeconds)} />
      </div>

      {/* 趋势图 */}
      <Card title="练习时间趋势（近 30 天 · 分钟）" className="grid">
        <div style={{ height: 260 }}>
          {trendData.some((d) => d.minutes > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  axisLine={{ stroke: 'rgba(0,0,0,0.08)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  allowDecimals={false}
                  axisLine={{ stroke: 'rgba(0,0,0,0.08)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: '#ffffff',
                    border: '1px solid rgba(0,0,0,0.08)',
                    borderRadius: 12,
                    fontSize: 13,
                    color: '#1f2937',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                  }}
                />
                <Bar dataKey="minutes" fill={BAR_COLOR} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>近 30 天还没有练习记录</Empty>
          )}
        </div>
      </Card>

      {/* 饼图区域 */}
      <div className="grid grid-auto" style={{ marginTop: 28 }}>
        <Card title="今日各歌曲练习占比">
          <div style={{ height: 260 }}>
            {todaySongData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={todaySongData}
                    dataKey="seconds"
                    nameKey="name"
                    outerRadius={90}
                    innerRadius={50}
                    label={false}
                    stroke="rgba(15,15,26,0.3)"
                    strokeWidth={2}
                  >
                    {todaySongData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => `${Math.round(Number(v))} 分钟`}
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 12,
                      fontSize: 13,
                      color: '#1f2937',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty>今日还没有练习</Empty>
            )}
          </div>
        </Card>

        <Card title="艺人练习占比（全部）">
          <div style={{ height: 260 }}>
            {artistData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={artistData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={90}
                    innerRadius={50}
                    stroke="rgba(15,15,26,0.3)"
                    strokeWidth={2}
                  >
                    {artistData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => formatSeconds(Number(v))}
                    contentStyle={{
                      background: '#ffffff',
                      border: '1px solid rgba(0,0,0,0.08)',
                      borderRadius: 12,
                      fontSize: 13,
                      color: '#1f2937',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty>还没有练习数据</Empty>
            )}
          </div>
        </Card>
      </div>

      {/* 最近练习 */}
      <Card title="最近练习" className="grid" style={{ marginTop: 28 }}>
        {stats.recentPractice.length > 0 ? (
          stats.recentPractice.map((r) => (
            <Link
              key={r.songId}
              to={`/songs/${r.songId}/practice`}
              className="list-row"
              style={{ gridTemplateColumns: '1fr auto' }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{r.title}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {r.artist ?? '未知艺人'} · 最近 {formatDate(r.lastPracticedAt)}
                </div>
              </div>
              <div className="faint" style={{ fontSize: 12 }}>
                今日 {minutesLabel(r.secondsToday)}
              </div>
            </Link>
          ))
        ) : (
          <Empty>还没有练习记录，去曲库选一首开始吧</Empty>
        )}
      </Card>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }): React.ReactElement {
  return (
    <div className="card" style={{ textAlign: 'center', transition: 'all 0.3s ease' }}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
