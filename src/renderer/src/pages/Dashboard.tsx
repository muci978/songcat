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

/* 浅色+半透明配色方案 */
const PIE_COLORS = [
  'rgba(249, 115, 22, 0.6)',   // 橙色
  'rgba(34, 197, 94, 0.6)',    // 绿色
  'rgba(59, 130, 246, 0.6)',   // 蓝色
  'rgba(245, 158, 11, 0.6)',   // 琥珀色
  'rgba(168, 85, 247, 0.6)',   // 紫色
  'rgba(236, 72, 153, 0.6)',   // 粉色
  'rgba(6, 182, 212, 0.6)',    // 青色
]
const PIE_COLORS_SOLID = [
  '#f97316', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'
]
const BAR_COLOR = '#38bdf8'
const BAR_COLOR_HOVER = '#0ea5e9'

/* 统计卡片鲜艳配色 */
const STAT_COLORS = [
  { bg: '#f97316', gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)' },
  { bg: '#22c55e', gradient: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)' },
  { bg: '#3b82f6', gradient: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)' },
  { bg: '#f59e0b', gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' },
  { bg: '#a855f7', gradient: 'linear-gradient(135deg, #a855f7 0%, #9333ea 100%)' },
  { bg: '#ec4899', gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 100%)' },
  { bg: '#06b6d4', gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)' },
  { bg: '#ef4444', gradient: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' },
]

export default function Dashboard(): React.ReactElement {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [trendPeriod, setTrendPeriod] = useState<'day' | 'month' | 'year'>('day')

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
  const todayArtistData = stats.todayBySong.reduce((acc, s) => {
    const artist = s.artist ?? '未知'
    const existing = acc.find((a) => a.name === artist)
    if (existing) {
      existing.value += s.seconds
    } else {
      acc.push({ name: artist, value: s.seconds })
    }
    return acc
  }, [] as { name: string; value: number }[]).sort((a, b) => b.value - a.value).slice(0, 6)
  const allArtistData = stats.byArtist.slice(0, 6).map((a) => ({
    name: truncate(a.artist ?? '未知', 10),
    value: a.seconds
  }))

  return (
    <div>
      <div className="page-header">
        <h1>Dashboard</h1>
      </div>

      {/* 统计卡片 —— 横向彩色长条卡片 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 28, overflowX: 'auto' }}>
        <StatCard label="总歌曲" value={stats.totalSongs} colorIndex={0} />
        <StatCard label="想学" value={stats.toLearnCount} colorIndex={1} />
        <StatCard label="学习中" value={stats.learningCount} colorIndex={2} />
        <StatCard label="已学会" value={stats.learnedCount} colorIndex={3} />
        <StatCard label="收藏" value={stats.favoriteCount} colorIndex={4} />
        <StatCard label="今日练习" value={minutesLabel(stats.todayPracticeSeconds)} colorIndex={5} />
        <StatCard label="本月练习" value={minutesLabel(stats.monthPracticeSeconds)} colorIndex={6} />
        <StatCard label="今年练习" value={minutesLabel(stats.yearPracticeSeconds)} colorIndex={7} />
      </div>

      {/* 趋势图 */}
      <Card title="练习时间趋势" className="grid" actions={
        <div style={{ display: 'flex', gap: 8 }}>
          {(['day', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setTrendPeriod(p)}
              style={{
                padding: '4px 12px',
                borderRadius: 8,
                border: 'none',
                background: trendPeriod === p ? '#38bdf8' : '#e0f2fe',
                color: trendPeriod === p ? '#ffffff' : '#0369a1',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {p === 'day' ? '日' : p === 'month' ? '月' : '年'}
            </button>
          ))}
        </div>
      }>
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
                <Bar dataKey="minutes" fill={BAR_COLOR} radius={[8, 8, 0, 0]}>
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
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty>近 30 天还没有练习记录</Empty>
          )}
        </div>
      </Card>

      {/* 饼图区域 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginTop: 28 }}>
        <Card title="今日各歌曲练习占比">
          <div style={{ height: 300 }}>
            {todaySongData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={todaySongData}
                    dataKey="seconds"
                    nameKey="name"
                    outerRadius={(data, index) => 80 + (index % 3) * 15}
                    innerRadius={50}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {todaySongData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        stroke={PIE_COLORS_SOLID[i % PIE_COLORS_SOLID.length]}
                        strokeWidth={2}
                      />
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

        <Card title="今日艺人练习占比">
          <div style={{ height: 300 }}>
            {todayArtistData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={todayArtistData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={(data, index) => 80 + (index % 3) * 15}
                    innerRadius={50}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {todayArtistData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        stroke={PIE_COLORS_SOLID[i % PIE_COLORS_SOLID.length]}
                        strokeWidth={2}
                      />
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
              <Empty>今日还没有练习数据</Empty>
            )}
          </div>
        </Card>

        <Card title="全部艺人练习占比">
          <div style={{ height: 300 }}>
            {allArtistData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allArtistData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={(data, index) => 80 + (index % 3) * 15}
                    innerRadius={50}
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {allArtistData.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                        stroke={PIE_COLORS_SOLID[i % PIE_COLORS_SOLID.length]}
                        strokeWidth={2}
                      />
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

function StatCard({ label, value, colorIndex }: { label: string; value: string | number; colorIndex: number }): React.ReactElement {
  const color = STAT_COLORS[colorIndex % STAT_COLORS.length]
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 120,
        background: color.gradient,
        borderRadius: 12,
        padding: '16px 12px',
        color: '#ffffff',
        textAlign: 'center',
        transition: 'all 0.3s ease',
        cursor: 'default',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)'
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
      }}
    >
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, letterSpacing: '-0.02em' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
    </div>
  )
}
