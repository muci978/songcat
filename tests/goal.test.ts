import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { closeDatabase, setDbForTesting } from '@main/db/connection'
import { runMigrations } from '@main/db/migrate'
import { practiceGoalsRepository } from '@main/db/repositories'
import { getTodayGoal, setTodayGoal } from '@main/services/goal'
import { localDateKeyOfDate } from '@main/utils'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  setDbForTesting(db)
})
afterEach(() => {
  closeDatabase()
})

describe('练习目标沿用逻辑（getTodayGoal）', () => {
  const today = localDateKeyOfDate(new Date())

  it('今日已设定：返回今日目标', () => {
    setTodayGoal(3600)
    const g = getTodayGoal()
    expect(g.targetSeconds).toBe(3600)
    expect(g.date).toBe(today)
  })

  it('今日未设定但有历史：沿用最近一次，日期为今日', () => {
    // 直接写入一条过去日期的目标（不经 setTodayGoal，避免用到今日 key）
    practiceGoalsRepository.upsert('2020-01-01', 2400)
    const g = getTodayGoal()
    expect(g.targetSeconds).toBe(2400) // 沿用历史值
    expect(g.date).toBe(today) // 但展示为今日
  })

  it('从未设定：返回默认 1800 秒', () => {
    const g = getTodayGoal()
    expect(g.targetSeconds).toBe(1800)
    expect(g.date).toBe(today)
    expect(g.id).toBe('')
  })

  it('沿用取最近日期（getLatest 按日期倒序）', () => {
    practiceGoalsRepository.upsert('2020-01-01', 1000)
    practiceGoalsRepository.upsert('2021-06-15', 2000)
    const g = getTodayGoal()
    expect(g.targetSeconds).toBe(2000) // 2021 > 2020
  })
})
