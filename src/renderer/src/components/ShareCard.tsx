/**
 * ShareCard — 分享卡片 Canvas 绘制
 * - 固定明亮暖色风格
 * - 固定宽度 600px，高度随勾选项自适应
 * - 使用 Canvas 2D API 手动绘制，不依赖 Recharts/DOM-to-image
 * - 导出为 PNG data URL
 */
import type { DashboardStats, PracticeGoal } from '@shared'
import { formatSeconds, minutesLabel, truncate } from '../lib/format'

/* ---- 固定明亮暖色配色 ---- */
const C = {
  bg: '#faf8f5',
  cardBg: '#ffffff',
  text: '#1f2937',
  textMuted: '#6b7280',
  accent: '#f97316',
  border: '#e5e2de',
  barFill: '#38bdf8',
  pieColors: ['#f97316', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ec4899', '#06b6d4'],
  statGradients: [
    ['#f97316', '#ea580c'],
    ['#22c55e', '#16a34a'],
    ['#3b82f6', '#2563eb'],
    ['#f59e0b', '#d97706'],
  ] as const,
}

/* ---- 可勾选内容项 ---- */
export type ShareItemId =
  | 'todayPractice'
  | 'streakDays'
  | 'monthPractice'
  | 'learnedCount'
  | 'goalProgress'
  | 'trendChart'
  | 'songPie'
  | 'artistPie'

export const SHARE_ITEMS: { id: ShareItemId; label: string; defaultChecked: boolean }[] = [
  { id: 'todayPractice', label: '今日练习时间', defaultChecked: true },
  { id: 'streakDays', label: '连续练习天数', defaultChecked: true },
  { id: 'monthPractice', label: '本月练习时间', defaultChecked: false },
  { id: 'learnedCount', label: '已学会歌曲数', defaultChecked: false },
  { id: 'goalProgress', label: '练习目标进度', defaultChecked: true },
  { id: 'trendChart', label: '练习趋势图', defaultChecked: true },
  { id: 'songPie', label: '今日歌曲练习饼图', defaultChecked: false },
  { id: 'artistPie', label: '今日艺人练习饼图', defaultChecked: false },
]

export const DEFAULT_SELECTED = new Set<ShareItemId>(
  SHARE_ITEMS.filter((i) => i.defaultChecked).map((i) => i.id)
)

/* ---- 绘制工具函数 ---- */

function fillRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
}

function strokeRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.stroke()
}

/** 绘制渐变圆角矩形 */
function fillGradientRoundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
  colors: readonly [string, string]
): void {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h)
  grad.addColorStop(0, colors[0])
  grad.addColorStop(1, colors[1])
  ctx.fillStyle = grad
  fillRoundRect(ctx, x, y, w, h, r)
}

/** 绘制环形进度 */
function drawRingProgress(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, strokeW: number,
  progress: number, reached: boolean
): void {
  // 背景环
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.strokeStyle = C.border
  ctx.lineWidth = strokeW
  ctx.stroke()

  // 进度环
  if (progress > 0) {
    const startAngle = -Math.PI / 2
    const endAngle = startAngle + Math.PI * 2 * Math.min(progress, 1)
    ctx.beginPath()
    ctx.arc(cx, cy, r, startAngle, endAngle)
    ctx.strokeStyle = reached ? '#22c55e' : C.accent
    ctx.lineWidth = strokeW
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.lineCap = 'butt'
  }
}

/** 绘制柱状图（value 为秒数，Y 轴显示分钟） */
function drawBarChart(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  data: { label: string; value: number }[]
): void {
  if (data.length === 0) return

  const maxVal = Math.max(...data.map((d) => d.value), 1)
  const maxMin = Math.ceil(maxVal / 60) // Y 轴最大分钟数
  const barPadding = 8
  const bottomAxisH = 20
  const topPadding = 8
  const leftAxisW = 36
  const chartW = w - leftAxisW
  const chartH = h - bottomAxisH - topPadding
  const gap = chartW / data.length
  const barW = gap - barPadding

  // 网格线 + Y 轴刻度
  ctx.strokeStyle = 'rgba(0,0,0,0.06)'
  ctx.lineWidth = 1
  const ySteps = 4
  for (let i = 0; i <= ySteps; i++) {
    const gy = y + topPadding + (chartH / ySteps) * i
    ctx.beginPath()
    ctx.moveTo(x + leftAxisW, gy)
    ctx.lineTo(x + w, gy)
    ctx.stroke()
    // Y 轴刻度标签
    const minVal = Math.round(maxMin * (1 - i / ySteps))
    ctx.fillStyle = C.textMuted
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'right'
    // Y 轴刻度标签（仅在顶部标注单位）
    const label = i === 0 ? `${minVal}m` : `${minVal}`
    ctx.fillText(label, x + leftAxisW - 4, gy + 3)
  }
  ctx.textAlign = 'left'

  // 柱子
  data.forEach((d, i) => {
    const bx = x + leftAxisW + barPadding / 2 + i * gap
    const barH = Math.max((d.value / (maxMin * 60)) * chartH, d.value > 0 ? 2 : 0)
    const by = y + topPadding + chartH - barH

    if (barH > 0) {
      // 圆角柱子（顶部圆角）
      const r = Math.min(4, barW / 2, barH / 2)
      ctx.fillStyle = C.barFill
      ctx.beginPath()
      ctx.moveTo(bx + r, by)
      ctx.lineTo(bx + barW - r, by)
      ctx.quadraticCurveTo(bx + barW, by, bx + barW, by + r)
      ctx.lineTo(bx + barW, by + barH)
      ctx.lineTo(bx, by + barH)
      ctx.lineTo(bx, by + r)
      ctx.quadraticCurveTo(bx, by, bx + r, by)
      ctx.closePath()
      ctx.fill()
    }

    // X 轴标签
    ctx.fillStyle = C.textMuted
    ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(d.label, bx + barW / 2, y + h - 4)
  })
  ctx.textAlign = 'left'
}

/** 绘制饼图 */
function drawPieChart(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, outerR: number, innerR: number,
  data: { label: string; value: number }[]
): void {
  if (data.length === 0) return

  const total = data.reduce((s, d) => s + d.value, 0)
  if (total === 0) return

  let startAngle = -Math.PI / 2
  data.forEach((d, i) => {
    const sliceAngle = (d.value / total) * Math.PI * 2
    const endAngle = startAngle + sliceAngle

    // 扇形
    ctx.beginPath()
    ctx.arc(cx, cy, outerR, startAngle, endAngle)
    ctx.arc(cx, cy, innerR, endAngle, startAngle, true)
    ctx.closePath()
    ctx.fillStyle = C.pieColors[i % C.pieColors.length]
    ctx.fill()
    ctx.strokeStyle = C.cardBg
    ctx.lineWidth = 2
    ctx.stroke()

    startAngle = endAngle
  })
}

/* ---- 主绘制函数 ---- */

export interface DrawShareCardOptions {
  stats: DashboardStats
  goal: PracticeGoal | null
  selectedItems: Set<ShareItemId>
  appVersion: string
  /** 像素比，默认 2（高清） */
  pixelRatio?: number
}

/** 绘制分享卡片到 Canvas 并返回 PNG data URL */
export function drawShareCard(opts: DrawShareCardOptions): string {
  const { stats, goal, selectedItems, appVersion, pixelRatio = 2 } = opts
  const W = 600
  const P = 32 // padding
  const contentW = W - P * 2
  const font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'

  // ---- 第一遍：计算总高度 ----
  let totalH = P // top padding
  totalH += 50 // header

  // 统计卡片
  const statCards: { value: string; label: string; colors: readonly [string, string] }[] = []
  if (selectedItems.has('todayPractice')) {
    statCards.push({ value: minutesLabel(stats.todayPracticeSeconds), label: '今日练习', colors: C.statGradients[0] })
  }
  if (selectedItems.has('strendDays')) {
    statCards.push({ value: `${stats.streakDays} 天`, label: '🔥 连续', colors: C.statGradients[1] })
  }
  if (selectedItems.has('monthPractice')) {
    statCards.push({ value: formatSeconds(stats.monthPracticeSeconds), label: '本月练习', colors: C.statGradients[2] })
  }
  if (selectedItems.has('learnedCount')) {
    statCards.push({ value: `${stats.learnedCount} 首`, label: '已学会', colors: C.statGradients[3] })
  }
  if (statCards.length > 0) totalH += 64 + 20

  // 练习目标进度
  const showGoal = selectedItems.has('goalProgress') && goal
  if (showGoal) totalH += 70 + 20

  // 趋势图——用秒数绘制，显示时转换为分钟
  // stats.trend 按日期倒序（最新在前），取前7个即最近7天，再反转为正序
  const trendData = [...stats.trend]
    .slice(0, 7)
    .reverse()
    .map((t) => ({ label: t.date.slice(5), value: t.seconds }))
  const showTrend = selectedItems.has('trendChart')
  if (showTrend) totalH += 200 + 20

  // 饼图
  const todaySongData = stats.todayBySong.slice(0, 6).map((s) => ({
    label: truncate(s.title, 8),
    value: Math.round(s.seconds / 60)
  }))
  const todayArtistData = stats.todayBySong.reduce((acc, s) => {
    const artist = s.artist ?? '未知'
    const existing = acc.find((a) => a.label === artist)
    if (existing) {
      existing.value += s.seconds
    } else {
      acc.push({ label: artist, value: s.seconds })
    }
    return acc
  }, [] as { label: string; value: number }[]).sort((a, b) => b.value - a.value).slice(0, 6)

  const showSongPie = selectedItems.has('songPie')
  const showArtistPie = selectedItems.has('artistPie')
  const showAnyPie = showSongPie || showArtistPie
  if (showAnyPie) totalH += 280 + 20

  // 底部水印
  totalH += 32 + P // watermark + bottom padding

  // ---- 创建 Canvas ----
  const canvas = document.createElement('canvas')
  canvas.width = W * pixelRatio
  canvas.height = totalH * pixelRatio
  const ctx = canvas.getContext('2d')!
  ctx.scale(pixelRatio, pixelRatio)

  // ---- 背景 ----
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, totalH)

  // ---- 头部 ----
  let curY = P
  ctx.font = `28px ${font}`
  ctx.fillStyle = C.text
  ctx.fillText('🎸', P, curY + 28)
  ctx.font = `700 20px ${font}`
  ctx.fillStyle = C.text
  ctx.fillText('SongCat 练习报告', P + 40, curY + 24)
  const today = new Date()
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  ctx.font = `13px ${font}`
  ctx.fillStyle = C.textMuted
  ctx.fillText(dateStr, P + 40, curY + 42)
  curY += 50

  // ---- 统计卡片 ----
  if (statCards.length > 0) {
    const cardH = 64
    const gap = 10
    const cardW = (contentW - gap * (statCards.length - 1)) / statCards.length
    statCards.forEach((card, i) => {
      const cx = P + i * (cardW + gap)
      fillGradientRoundRect(ctx, cx, curY, cardW, cardH, 10, card.colors)
      // 数值
      ctx.fillStyle = '#ffffff'
      ctx.font = `700 22px ${font}`
      ctx.textAlign = 'center'
      ctx.fillText(card.value, cx + cardW / 2, curY + 30)
      // 标签
      ctx.font = `600 11px ${font}`
      ctx.globalAlpha = 0.9
      ctx.fillText(card.label, cx + cardW / 2, curY + 50)
      ctx.globalAlpha = 1
    })
    ctx.textAlign = 'left'
    curY += cardH + 20
  }

  // ---- 练习目标进度 ----
  if (showGoal && goal) {
    const targetMin = Math.round(goal.targetSeconds / 60)
    const practicedMin = Math.round(stats.todayPracticeSeconds / 60)
    const progress = goal.targetSeconds > 0 ? Math.min(stats.todayPracticeSeconds / goal.targetSeconds, 1) : 0
    const reached = progress >= 1

    // 卡片背景
    ctx.fillStyle = C.cardBg
    fillRoundRect(ctx, P, curY, contentW, 70, 12)
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    strokeRoundRect(ctx, P, curY, contentW, 70, 12)

    // 环形进度
    drawRingProgress(ctx, P + 45, curY + 35, 22, 5, progress, reached)

    // 文字
    ctx.font = `700 16px ${font}`
    ctx.fillStyle = reached ? '#22c55e' : C.text
    ctx.fillText(`${practicedMin} / ${targetMin} 分钟`, P + 80, curY + 30)
    ctx.font = `12px ${font}`
    ctx.fillStyle = C.textMuted
    ctx.fillText(
      reached ? '🎉 今日目标已达成！' : `还需 ${targetMin - practicedMin} 分钟达成目标`,
      P + 80, curY + 50
    )
    curY += 70 + 20
  }

  // ---- 趋势图 ----
  if (showTrend) {
    const chartH = 200
    ctx.fillStyle = C.cardBg
    fillRoundRect(ctx, P, curY, contentW, chartH, 12)
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    strokeRoundRect(ctx, P, curY, contentW, chartH, 12)

    // 标题
    ctx.font = `600 13px ${font}`
    ctx.fillStyle = C.text
    ctx.fillText('近 7 天练习趋势', P + 16, curY + 24)

    // 图表
    if (trendData.some((d) => d.value > 0)) {
      // 浅蓝色图表区域背景
      ctx.fillStyle = 'rgba(56, 189, 248, 0.05)'
      ctx.fillRect(P + 16, curY + 32, contentW - 32, chartH - 48)
      drawBarChart(ctx, P + 16, curY + 32, contentW - 32, chartH - 48, trendData)
    } else {
      ctx.font = `13px ${font}`
      ctx.fillStyle = C.textMuted
      ctx.textAlign = 'center'
      ctx.fillText('近 7 天还没有练习记录', P + contentW / 2, curY + 32 + (chartH - 48) / 2)
      ctx.textAlign = 'left'
    }
    curY += chartH + 20
  }

  // ---- 饼图 ----
  if (showAnyPie) {
    const pieH = 280
    const pieCount = (showSongPie ? 1 : 0) + (showArtistPie ? 1 : 0)
    const pieW = (contentW - 12 * (pieCount - 1)) / pieCount

    // 卡片背景
    ctx.fillStyle = C.cardBg
    fillRoundRect(ctx, P, curY, contentW, pieH, 12)
    ctx.strokeStyle = C.border
    ctx.lineWidth = 1
    strokeRoundRect(ctx, P, curY, contentW, pieH, 12)

    let pieX = P
    if (showSongPie) {
      // 标题
      ctx.font = `600 13px ${font}`
      ctx.fillStyle = C.text
      ctx.textAlign = 'center'
      ctx.fillText('今日歌曲练习', pieX + pieW / 2, curY + 24)

      // 饼图
      drawPieChart(ctx, pieX + pieW / 2, curY + 24 + 120, 100, 40, todaySongData)

      // 图例
      ctx.textAlign = 'left'
      const legendY = curY + 24 + 120 + 100 + 12
      todaySongData.forEach((d, i) => {
        const lx = pieX + 12 + (i % 3) * (pieW / 3 - 4)
        const ly = legendY + Math.floor(i / 3) * 16
        ctx.fillStyle = C.pieColors[i % C.pieColors.length]
        ctx.fillRect(lx, ly - 6, 8, 8)
        ctx.fillStyle = C.textMuted
        ctx.font = `10px ${font}`
        ctx.fillText(d.label, lx + 12, ly + 2)
      })

      pieX += pieW + 12
    }
    if (showArtistPie) {
      ctx.font = `600 13px ${font}`
      ctx.fillStyle = C.text
      ctx.textAlign = 'center'
      ctx.fillText('今日艺人练习', pieX + pieW / 2, curY + 24)

      drawPieChart(ctx, pieX + pieW / 2, curY + 24 + 120, 100, 40, todayArtistData)

      ctx.textAlign = 'left'
      const legendY = curY + 24 + 120 + 100 + 12
      todayArtistData.forEach((d, i) => {
        const lx = pieX + 12 + (i % 3) * (pieW / 3 - 4)
        const ly = legendY + Math.floor(i / 3) * 16
        ctx.fillStyle = C.pieColors[i % C.pieColors.length]
        ctx.fillRect(lx, ly - 6, 8, 8)
        ctx.fillStyle = C.textMuted
        ctx.font = `10px ${font}`
        ctx.fillText(d.label, lx + 12, ly + 2)
      })
    }
    ctx.textAlign = 'left'
    curY += pieH + 20
  }

  // ---- 底部水印 ----
  curY += 12
  ctx.strokeStyle = C.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(P, curY - 12)
  ctx.lineTo(W - P, curY - 12)
  ctx.stroke()

  ctx.font = `11px ${font}`
  ctx.fillStyle = C.textMuted
  ctx.fillText('Generated by SongCat', P, curY + 2)
  ctx.textAlign = 'right'
  ctx.fillText(`v${appVersion}`, W - P, curY + 2)
  ctx.textAlign = 'left'

  // ---- 导出 PNG ----
  return canvas.toDataURL('image/png')
}
