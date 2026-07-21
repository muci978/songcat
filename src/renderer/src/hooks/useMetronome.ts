/** useMetronome — Web Audio API 节拍器 Hook
 *
 * 核心设计：
 *   - Lookahead Scheduler：用 setTimeout（25ms 间隔）+ AudioContext.currentTime 提前 100ms
 *     调度 OscillatorNode，保证节拍精度不受 JS 主线程阻塞影响
 *   - Click 合成：重音拍 1000Hz/50ms/0.8增益，普通拍 800Hz/35ms/0.5增益，
 *     次强拍（复合拍号中每 3 拍一组的首拍）900Hz/40ms/0.6增益
 *   - Tap Tempo：记录最近 5 次点击时间戳，计算平均间隔 → BPM
 *   - AudioContext 管理：首次 play 时创建，suspended 时 resume，组件卸载时 close
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/* 类型                                                                 */
/* ------------------------------------------------------------------ */

export interface TimeSignature {
  /** 每小节拍数（1-16） */
  beats: number
  /** 拍子单位（1-16，4 = 四分音符, 8 = 八分音符） */
  unit: number
}

export interface UseMetronomeOptions {
  initialBpm?: number
  initialTimeSignature?: TimeSignature
}

export interface UseMetronomeReturn {
  playing: boolean
  bpm: number
  timeSignature: TimeSignature
  currentBeat: number
  play: () => void
  stop: () => void
  toggle: () => void
  setBpm: (bpm: number) => void
  setTimeSignature: (ts: TimeSignature) => void
  tapTempo: () => void
}

/* ------------------------------------------------------------------ */
/* 常量                                                                 */
/* ------------------------------------------------------------------ */

const BPM_MIN = 40
const BPM_MAX = 240
const BPM_DEFAULT = 120
const TS_DEFAULT: TimeSignature = { beats: 4, unit: 4 }

/** 提前调度时间（秒） */
const SCHEDULE_AHEAD = 0.1
/** 调度循环间隔（毫秒） */
const LOOKAHEAD = 25
/** Tap Tempo 最大间隔（毫秒），超过则重置 */
const TAP_TIMEOUT = 2000
/** Tap Tempo 保留最近 N 次点击 */
const TAP_MAX_SAMPLES = 5

/* ------------------------------------------------------------------ */
/* Click 合成                                                           */
/* ------------------------------------------------------------------ */

type ClickType = 'accent' | 'normal' | 'subaccent'

function scheduleClick(ctx: AudioContext, time: number, type: ClickType): void {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'

  let freq: number
  let duration: number
  let volume: number

  switch (type) {
    case 'accent':
      freq = 1000
      duration = 0.05
      volume = 0.8
      break
    case 'subaccent':
      freq = 900
      duration = 0.04
      volume = 0.6
      break
    case 'normal':
    default:
      freq = 800
      duration = 0.035
      volume = 0.5
      break
  }

  osc.frequency.value = freq
  gain.gain.setValueAtTime(volume, time)
  gain.gain.exponentialRampToValueAtTime(0.001, time + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(time)
  osc.stop(time + duration + 0.01)
}

/** 判断某拍位的 click 类型 */
function getClickType(beatIndex: number, ts: TimeSignature): ClickType {
  if (beatIndex === 0) return 'accent'
  // 复合拍号（unit=8 且 beats 是 3 的倍数）：每 3 拍一组，组首为次强拍
  if (ts.unit === 8 && ts.beats % 3 === 0 && ts.beats >= 6 && beatIndex % 3 === 0) {
    return 'subaccent'
  }
  return 'normal'
}

/** 计算每拍间隔（秒） */
function beatInterval(bpm: number, ts: TimeSignature): number {
  // unit=8 时 BPM 表示附点四分音符速度，每拍 = 3 个八分音符
  if (ts.unit === 8) {
    return 60 / bpm / 3
  }
  return 60 / bpm
}

/* ------------------------------------------------------------------ */
/* Hook                                                                 */
/* ------------------------------------------------------------------ */

export function useMetronome(options: UseMetronomeOptions = {}) {
  const { initialBpm = BPM_DEFAULT, initialTimeSignature = TS_DEFAULT } = options

  const [playing, setPlaying] = useState(false)
  const [bpm, setBpmState] = useState(initialBpm)
  const [timeSignature, setTimeSignatureState] = useState<TimeSignature>(initialTimeSignature)
  const [currentBeat, setCurrentBeat] = useState(0)

  // Refs — 不触发重渲染的内部状态
  const ctxRef = useRef<AudioContext | null>(null)
  const nextBeatTimeRef = useRef(0)       // 下一拍的 AudioContext 时间
  const currentBeatRef = useRef(0)        // 下一拍的拍位（即将播放的拍）
  const lastScheduledBeatRef = useRef(-1) // 最近已调度声音的拍位
  const lastScheduledTimeRef = useRef(0)  // 最近已调度声音的时间
  const schedulerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bpmRef = useRef(initialBpm)
  const tsRef = useRef<TimeSignature>(initialTimeSignature)
  const playingRef = useRef(false)

  // Tap Tempo refs
  const tapTimesRef = useRef<number[]>([])
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ---- 获取或创建 AudioContext ---- */
  const getCtx = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      ctxRef.current = new AudioContext()
    }
    return ctxRef.current
  }, [])

  /* ---- 调度循环 ---- */
  const scheduler = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || !playingRef.current) return

    while (nextBeatTimeRef.current < ctx.currentTime + SCHEDULE_AHEAD) {
      const beatIndex = currentBeatRef.current
      const ts = tsRef.current

      // 调度 click 声音
      scheduleClick(ctx, nextBeatTimeRef.current, getClickType(beatIndex, ts))

      // 记录最近调度的拍位和时间（用于视觉反馈）
      lastScheduledBeatRef.current = beatIndex
      lastScheduledTimeRef.current = nextBeatTimeRef.current

      // 推进到下一拍
      nextBeatTimeRef.current += beatInterval(bpmRef.current, ts)
      currentBeatRef.current = (beatIndex + 1) % ts.beats
    }

    // 继续调度循环
    schedulerTimerRef.current = setTimeout(scheduler, LOOKAHEAD)
  }, [])

  /* ---- 视觉反馈更新（requestAnimationFrame） ---- */
  useEffect(() => {
    if (!playing) return

    let rafId: number
    const updateVisual = () => {
      const ctx = ctxRef.current
      if (ctx && playingRef.current) {
        const ts = tsRef.current
        const interval = beatInterval(bpmRef.current, ts)

        // 从最近一次调度的拍位和时间推算当前拍位
        const elapsed = ctx.currentTime - lastScheduledTimeRef.current
        const beatsElapsed = Math.floor(elapsed / interval)
        const displayBeat = (lastScheduledBeatRef.current + beatsElapsed) % ts.beats
        setCurrentBeat(displayBeat)
      }
      rafId = requestAnimationFrame(updateVisual)
    }
    rafId = requestAnimationFrame(updateVisual)
    return () => cancelAnimationFrame(rafId)
  }, [playing])

  /* ---- play / stop ---- */
  const play = useCallback(() => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') {
      void ctx.resume()
    }
    playingRef.current = true
    nextBeatTimeRef.current = ctx.currentTime + 0.05
    currentBeatRef.current = 0
    lastScheduledBeatRef.current = -1
    lastScheduledTimeRef.current = ctx.currentTime
    setPlaying(true)
    setCurrentBeat(0)
    scheduler()
  }, [getCtx, scheduler])

  const stop = useCallback(() => {
    playingRef.current = false
    if (schedulerTimerRef.current) {
      clearTimeout(schedulerTimerRef.current)
      schedulerTimerRef.current = null
    }
    setPlaying(false)
    setCurrentBeat(0)
    currentBeatRef.current = 0
  }, [])

  const toggle = useCallback(() => {
    if (playingRef.current) {
      stop()
    } else {
      play()
    }
  }, [play, stop])

  /* ---- BPM / 拍号变更 ---- */
  const setBpm = useCallback((newBpm: number) => {
    const clamped = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(newBpm)))
    bpmRef.current = clamped
    setBpmState(clamped)
  }, [])

  const setTimeSignature = useCallback((ts: TimeSignature) => {
    tsRef.current = ts
    setTimeSignatureState(ts)
    if (playingRef.current) {
      currentBeatRef.current = 0
      setCurrentBeat(0)
    }
  }, [])

  /* ---- Tap Tempo ---- */
  const tapTempo = useCallback(() => {
    const now = performance.now()

    if (tapTimerRef.current) {
      clearTimeout(tapTimerRef.current)
    }
    tapTimerRef.current = setTimeout(() => {
      tapTimesRef.current = []
    }, TAP_TIMEOUT)

    const times = tapTimesRef.current
    times.push(now)

    if (times.length > TAP_MAX_SAMPLES) {
      times.shift()
    }

    if (times.length < 2) return

    let totalInterval = 0
    for (let i = 1; i < times.length; i++) {
      totalInterval += times[i]! - times[i - 1]!
    }
    const avgInterval = totalInterval / (times.length - 1)
    const newBpm = Math.round(60000 / avgInterval)

    setBpm(newBpm)
  }, [setBpm])

  /* ---- 清理 ---- */
  useEffect(() => {
    return () => {
      playingRef.current = false
      if (schedulerTimerRef.current) {
        clearTimeout(schedulerTimerRef.current)
      }
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current)
      }
      if (ctxRef.current) {
        ctxRef.current.close().catch(() => {})
        ctxRef.current = null
      }
    }
  }, [])

  /* ---- 同步外部 initialBpm 变化（仅未播放时） ---- */
  useEffect(() => {
    if (!playingRef.current && initialBpm !== bpmRef.current) {
      bpmRef.current = initialBpm
      setBpmState(initialBpm)
    }
  }, [initialBpm])

  /* ---- 同步外部 initialTimeSignature 变化（仅未播放时） ---- */
  useEffect(() => {
    if (!playingRef.current) {
      const ts = initialTimeSignature
      if (ts.beats !== tsRef.current.beats || ts.unit !== tsRef.current.unit) {
        tsRef.current = ts
        setTimeSignatureState(ts)
      }
    }
  }, [initialTimeSignature.beats, initialTimeSignature.unit])

  return {
    playing,
    bpm,
    timeSignature,
    currentBeat,
    play,
    stop,
    toggle,
    setBpm,
    setTimeSignature,
    tapTempo
  }
}
