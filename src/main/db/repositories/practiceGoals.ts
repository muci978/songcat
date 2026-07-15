/** practice_goals 表 repository */
import { getDb } from '../connection'
import { newId, nowIso } from '../../utils'

export interface PracticeGoalRow {
  id: string
  target_seconds: number
  date: string
  created_at: string
  updated_at: string
}

export const practiceGoalsRepository = {
  getByDate(date: string): PracticeGoalRow | undefined {
    return getDb()
      .prepare('SELECT * FROM practice_goals WHERE date = ?')
      .get(date) as PracticeGoalRow | undefined
  },

  upsert(date: string, targetSeconds: number): PracticeGoalRow {
    const db = getDb()
    const now = nowIso()
    const existing = this.getByDate(date)
    if (existing) {
      db.prepare('UPDATE practice_goals SET target_seconds = ?, updated_at = ? WHERE id = ?')
        .run(targetSeconds, now, existing.id)
      return { ...existing, target_seconds: targetSeconds, updated_at: now }
    }
    const id = newId()
    db.prepare(
      'INSERT INTO practice_goals (id, target_seconds, date, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, targetSeconds, date, now, now)
    return { id, target_seconds: targetSeconds, date, created_at: now, updated_at: now }
  }
}
