import type { PracticeGoal } from '@shared'

interface GoalProgressProps {
  goal: PracticeGoal
  practicedSeconds: number
}

/**
 * 练习目标进度环形图组件。
 * 显示"今日已练 X / 目标 Y 分钟"和环形进度。
 */
export function GoalProgress({ goal, practicedSeconds }: GoalProgressProps): React.ReactElement {
  const targetMin = Math.round(goal.targetSeconds / 60)
  const practicedMin = Math.round(practicedSeconds / 60)
  const progress = goal.targetSeconds > 0 ? Math.min(practicedSeconds / goal.targetSeconds, 1) : 0
  const reached = progress >= 1

  // SVG 环形进度参数
  const radius = 32
  const stroke = 6
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress)

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={80} height={80} style={{ flexShrink: 0, transform: 'rotate(-90deg)' }}>
        {/* 背景环 */}
        <circle
          cx={40} cy={40} r={radius}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={stroke}
        />
        {/* 进度环 */}
        <circle
          cx={40} cy={40} r={radius}
          fill="none"
          stroke={reached ? 'var(--success)' : 'var(--accent)'}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: reached ? 'var(--success)' : 'var(--text)' }}>
          {practicedMin} / {targetMin} 分钟
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          {reached ? '🎉 今日目标已达成！' : `还需 ${targetMin - practicedMin} 分钟达成目标`}
        </div>
      </div>
    </div>
  )
}
