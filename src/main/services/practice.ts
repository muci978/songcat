/**
 * 练习计时服务（设计 §5.4、§10）。
 *
 * 计时模型（不改 schema，复用字段语义）：
 *   - last_heartbeat_at 非 NULL = 当前正在计时段的起点；
 *   - last_heartbeat_at = NULL   = 暂停态（不计时）；
 *   - duration_seconds = 已确认并入的净时长（每次心跳/暂停/停止时增量累加）。
 *
 * 自动结束（设计 §10.2）：离开曲谱页、切换歌曲、关闭应用、应用退出。
 * 异常恢复（设计 §10.3）：启动时把 ended_at 为空的会话补齐，reason='recovery'。
 */
import { getDb } from '../db/connection'
import { practiceSessionsRepository } from '../db/repositories'
import type { PracticeStopReason } from '@shared'
import { MAX_RECOVERY_SESSION_MINUTES } from '@shared'
import { nowIso } from '../utils'
import { logger } from '../lib/logger'

const MAX_SESSION_SECONDS = MAX_RECOVERY_SESSION_MINUTES * 60

function elapsedSeconds(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso)
  return ms > 0 ? Math.floor(ms / 1000) : 0
}

export function startSession(songId: string): { sessionId: string } {
  // 若该歌曲已有进行中会话，先按 switch-song 结束（同一首歌同时只允许一个进行中）
  const active = practiceSessionsRepository.findActiveBySong(songId)
  if (active) finishInternal(active.id, 'switch-song', nowIso())
  const row = practiceSessionsRepository.create({ songId, startedAt: nowIso() })
  return { sessionId: row.id }
}

/** 心跳：每 30s 调用一次。把上一段增量并入 duration，重置段起点。暂停态不计时。 */
export function heartbeat(sessionId: string): void {
  const s = practiceSessionsRepository.getById(sessionId)
  if (!s || s.ended_at || !s.last_heartbeat_at) return
  const now = nowIso()
  const delta = elapsedSeconds(s.last_heartbeat_at, now)
  getDb()
    .prepare(
      'UPDATE practice_sessions SET duration_seconds = duration_seconds + ?, last_heartbeat_at = ? WHERE id = ?'
    )
    .run(delta, now, sessionId)
}

export function pauseSession(sessionId: string): void {
  const s = practiceSessionsRepository.getById(sessionId)
  if (!s || s.ended_at || !s.last_heartbeat_at) return
  const now = nowIso()
  const delta = elapsedSeconds(s.last_heartbeat_at, now)
  getDb()
    .prepare(
      'UPDATE practice_sessions SET duration_seconds = duration_seconds + ?, last_heartbeat_at = NULL WHERE id = ?'
    )
    .run(delta, sessionId)
}

export function resumeSession(sessionId: string): void {
  const s = practiceSessionsRepository.getById(sessionId)
  if (!s || s.ended_at) return
  getDb()
    .prepare('UPDATE practice_sessions SET last_heartbeat_at = ? WHERE id = ?')
    .run(nowIso(), sessionId)
}

export function stopSession(
  sessionId: string,
  reason: PracticeStopReason = 'manual'
): void {
  finishInternal(sessionId, reason, nowIso())
}

/** 结束所有进行中会话（应用关闭前调用） */
export function stopAllActive(reason: PracticeStopReason = 'app-close'): void {
  const active = practiceSessionsRepository.findAllActive()
  const now = nowIso()
  for (const s of active) finishInternal(s.id, reason, now)
}

function finishInternal(sessionId: string, reason: PracticeStopReason, now: string): void {
  const s = practiceSessionsRepository.getById(sessionId)
  if (!s || s.ended_at) return
  let duration = s.duration_seconds
  if (s.last_heartbeat_at) {
    duration += elapsedSeconds(s.last_heartbeat_at, now)
  }
  practiceSessionsRepository.finish(sessionId, {
    endedAt: now,
    durationSeconds: duration,
    stopReason: reason
  })
}

/**
 * 启动时异常恢复（设计 §10.3）。
 * 返回恢复的会话数。
 */
export function recoverInterruptedSessions(): number {
  const active = practiceSessionsRepository.findAllActive()
  let recovered = 0
  for (const s of active) {
    const startMs = Date.parse(s.started_at)
    const capMs = startMs + MAX_SESSION_SECONDS * 1000
    let endedAt: string
    let duration = s.duration_seconds
    let untrusted = false

    if (s.last_heartbeat_at) {
      // 计时中崩溃：以最后心跳作为结束点（保守，不臆造未计时的时长）
      endedAt = s.last_heartbeat_at
    } else {
      // 暂停态崩溃：无心跳，取 started_at 之后 MAX 或 now 中较小作 ended_at
      const candidate = Math.min(Date.now(), capMs)
      endedAt = new Date(candidate).toISOString()
      if (candidate >= capMs) untrusted = true
    }
    if (duration > MAX_SESSION_SECONDS) {
      duration = MAX_SESSION_SECONDS
      untrusted = true
    }

    practiceSessionsRepository.finish(s.id, {
      endedAt,
      durationSeconds: duration,
      stopReason: 'recovery'
    })
    if (untrusted) logger.warn(`恢复会话 ${s.id} 时长受限/不可信`)
    else logger.info(`恢复未结束的练习会话 ${s.id}（song ${s.song_id}）`)
    recovered++
  }
  return recovered
}

export function getActiveForSong(songId: string): { sessionId: string } | null {
  const s = practiceSessionsRepository.findActiveBySong(songId)
  return s ? { sessionId: s.id } : null
}
