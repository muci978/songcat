import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { closeDatabase, getDb, setDbForTesting } from '@main/db/connection'
import { runMigrations } from '@main/db/migrate'
import { practiceSessionsRepository, songsRepository } from '@main/db/repositories'
import { startSession, heartbeat, pauseSession } from '@main/services/practice'
import { HEARTBEAT_INTERVAL_MS } from '@shared'

let db: Database.Database

/** 服务层封顶值：单段 delta 最多并入 2×心跳周期（睡眠/挂起防护） */
const CAP = (HEARTBEAT_INTERVAL_MS / 1000) * 2

beforeEach(() => {
  db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  setDbForTesting(db)
})
afterEach(() => {
  closeDatabase()
})

/** 把某会话的段起点 last_heartbeat_at 直接改到 N 秒前，模拟一段真实经过时间 */
function backdateHeartbeat(sessionId: string, secondsAgo: number): void {
  const iso = new Date(Date.now() - secondsAgo * 1000).toISOString()
  getDb().prepare('UPDATE practice_sessions SET last_heartbeat_at = ? WHERE id = ?').run(iso, sessionId)
}

describe('练习计时防护（practice service）', () => {
  it('单段 delta 超过封顶被 cap（睡眠/挂起不误计入）', () => {
    const s = songsRepository.create({ title: 'A' })
    const { sessionId } = startSession(s.id)
    // 模拟机器睡眠：段起点在 10 倍封顶秒之前
    backdateHeartbeat(sessionId, CAP * 10)
    heartbeat(sessionId)
    expect(practiceSessionsRepository.getById(sessionId)!.duration_seconds).toBe(CAP)
  })

  it('正常 delta 全额计入', () => {
    const s = songsRepository.create({ title: 'A' })
    const { sessionId } = startSession(s.id)
    const seconds = Math.floor(CAP / 3) // 明显小于封顶
    backdateHeartbeat(sessionId, seconds)
    heartbeat(sessionId)
    const dur = practiceSessionsRepository.getById(sessionId)!.duration_seconds
    // 允许 ±1 秒的执行耗时误差
    expect(dur).toBeGreaterThanOrEqual(seconds - 1)
    expect(dur).toBeLessThanOrEqual(seconds + 1)
  })

  it('pauseSession 并入当前段后把 last_heartbeat_at 置 NULL', () => {
    const s = songsRepository.create({ title: 'A' })
    const { sessionId } = startSession(s.id)
    backdateHeartbeat(sessionId, 10)
    pauseSession(sessionId)
    const row = practiceSessionsRepository.getById(sessionId)!
    expect(row.last_heartbeat_at).toBeNull()
    expect(row.duration_seconds).toBeGreaterThanOrEqual(9)
    expect(row.duration_seconds).toBeLessThanOrEqual(11)
  })

  it('暂停态（last_heartbeat_at=NULL）下 heartbeat 不再累加', () => {
    const s = songsRepository.create({ title: 'A' })
    const { sessionId } = startSession(s.id)
    pauseSession(sessionId) // 段极短，duration≈0，且置 NULL
    const before = practiceSessionsRepository.getById(sessionId)!.duration_seconds
    heartbeat(sessionId) // 暂停态：应直接 return，无变化
    const after = practiceSessionsRepository.getById(sessionId)!.duration_seconds
    expect(after).toBe(before)
  })
})
