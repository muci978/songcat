/** 练习目标服务 */
import { practiceGoalsRepository } from '../db/repositories'
import type { PracticeGoal } from '@shared'
import { localDateKeyOfDate } from '../utils'

function rowToGoal(row: { id: string; target_seconds: number; date: string; created_at: string; updated_at: string }): PracticeGoal {
  return {
    id: row.id,
    targetSeconds: row.target_seconds,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

/** 获取今日目标（无则返回默认值 1800 秒 = 30 分钟） */
export function getTodayGoal(): PracticeGoal {
  // 用本地日期做 key，与 dashboard/aggregate 的本地时区分桶口径一致（避免跨时区错位）
  const today = localDateKeyOfDate(new Date())
  const row = practiceGoalsRepository.getByDate(today)
  if (row) return rowToGoal(row)
  return {
    id: '',
    targetSeconds: 1800,
    date: today,
    createdAt: '',
    updatedAt: ''
  }
}

/** 设置今日目标秒数 */
export function setTodayGoal(targetSeconds: number): PracticeGoal {
  const today = localDateKeyOfDate(new Date())
  const row = practiceGoalsRepository.upsert(today, targetSeconds)
  return rowToGoal(row)
}
