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

/** 获取今日目标。
 *  优先返回今日已设定的目标；今日无记录时沿用「最近一次设定的目标」（跨天/重启保持不变，
 *  修复过去每天重置为默认 30 分钟的问题）；从未设定过才返回默认值 1800 秒 = 30 分钟。 */
export function getTodayGoal(): PracticeGoal {
  // 用本地日期做 key，与 dashboard/aggregate 的本地时区分桶口径一致（避免跨时区错位）
  const today = localDateKeyOfDate(new Date())
  const row = practiceGoalsRepository.getByDate(today)
  if (row) return rowToGoal(row)

  // 今日尚未单独设定：沿用最近一次设定过的目标（以今日为展示日期）
  const latest = practiceGoalsRepository.getLatest()
  if (latest) return { ...rowToGoal(latest), date: today }

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
