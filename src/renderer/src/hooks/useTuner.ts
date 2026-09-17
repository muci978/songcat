/** useTuner — 吉他调音器 Hook
 *
 * 核心设计：
 *   - 音高检测：YIN 算法（de Cheveigné & Kawahara, 2002）
 *       差分函数 → 累积均值归一化差分(CMND) → 绝对阈值取谷 → 抛物线插值
 *     相比朴素自相关，CMND 归一化能显著抑制八度误判、对音量变化更稳健，是主流吉他
 *     调音器（如 badlogic/tuner、pitchfinder）采用的算法。
 *   - 平滑：频率 EMA + 滑动窗口投票 + 信号丢失容差，避免读数抖动/闪烁。
 *   - 参考音：多泛音合成模拟钢弦吉他拨弦。
 *   - 麦克风管理：getUserMedia 获取音频流，组件卸载时释放。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/* 音符定义                                                             */
/* ------------------------------------------------------------------ */

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
const A4_FREQUENCY = 440
const A4_MIDI = 69

function frequencyToNote(freq: number): { note: string; octave: number; cent: number } {
  const midi = A4_MIDI + 12 * Math.log2(freq / A4_FREQUENCY)
  const roundedMidi = Math.round(midi)
  const cent = Math.round((midi - roundedMidi) * 100)
  const noteIndex = ((roundedMidi % 12) + 12) % 12
  const octave = Math.floor(roundedMidi / 12) - 1
  return {
    note: NOTE_NAMES[noteIndex]!,
    octave,
    cent: Math.max(-50, Math.min(50, cent))
  }
}

function noteToFrequency(note: string, octave: number): number {
  const noteIndex = NOTE_NAMES.indexOf(note as typeof NOTE_NAMES[number])
  if (noteIndex === -1) return A4_FREQUENCY
  const midi = (octave + 1) * 12 + noteIndex
  return A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / 12)
}

/* ------------------------------------------------------------------ */
/* YIN 音高检测                                                          */
/* ------------------------------------------------------------------ */

/**
 * 分析窗口：4096 样本 ≈ 93ms（44.1k）。
 * 取较大窗口是为低音弦服务：低音 E2≈82Hz 周期约 12ms，窗口需容纳多个周期，
 * 差分函数在 (SIZE - tauMax) 段上才有足够样本，读数才稳；对稳态调音音也更抗噪。
 */
const FFT_SIZE = 4096
const MIN_FREQUENCY = 60 // 低于 E2(82Hz) 留出失谐余量
const MAX_FREQUENCY = 1400
/** YIN 绝对阈值：CMND 首次跌破该值处即认定为基频周期（越小越严格，0.10~0.15 为常用区间） */
const YIN_THRESHOLD = 0.12
/** RMS 静音门限：低于此不做检测 */
const RMS_GATE = 0.01

/** 检测节流间隔（毫秒），约 30fps —— rAF 仍每帧继续，但不足该间隔就跳过重算 */
const DETECT_INTERVAL_MS = 1000 / 30

// 复用缓冲：避免每帧 new Float32Array 造成 GC 压力（长度固定为 FFT_SIZE）
const timeDomainBuf = new Float32Array(FFT_SIZE)
const diffBuf = new Float32Array(FFT_SIZE) // 差分函数 d(tau)
const cmndBuf = new Float32Array(FFT_SIZE) // 累积均值归一化差分 d'(tau)

/**
 * YIN 音高检测：返回基频（Hz），无可信音高时返回 null。
 * 步骤见 de Cheveigné & Kawahara (2002)：差分 → CMND → 绝对阈值 → 抛物线插值。
 */
function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length

  // RMS 门限：过滤静音/底噪
  let rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i]! * buf[i]!
  rms = Math.sqrt(rms / SIZE)
  if (rms < RMS_GATE) return null

  const tauMin = Math.max(1, Math.floor(sampleRate / MAX_FREQUENCY))
  const tauMax = Math.min(Math.floor(sampleRate / MIN_FREQUENCY), SIZE - 1)
  if (tauMax <= tauMin) return null

  // Step 1：差分函数 d(tau) = Σ (x[i] - x[i+tau])²
  const diff = diffBuf
  diff[0] = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0
    const n = SIZE - tau
    for (let i = 0; i < n; i++) {
      const delta = buf[i]! - buf[i + tau]!
      sum += delta * delta
    }
    diff[tau] = sum
  }

  // Step 2：累积均值归一化差分 CMND —— 使不同基频的谷值可比，并压制八度误判
  const cmnd = cmndBuf
  cmnd[0] = 1
  let running = 0
  for (let tau = 1; tau <= tauMax; tau++) {
    running += diff[tau]!
    cmnd[tau] = running === 0 ? 1 : (diff[tau]! * tau) / running
  }

  // Step 3：绝对阈值 —— 找首个跌破阈值的谷，再向后走到局部极小；无则取全局最小兜底
  let tauEst = -1
  for (let tau = tauMin; tau <= tauMax; tau++) {
    if (cmnd[tau]! < YIN_THRESHOLD) {
      while (tau + 1 <= tauMax && cmnd[tau + 1]! < cmnd[tau]!) tau++
      tauEst = tau
      break
    }
  }
  if (tauEst === -1) {
    // 未跌破阈值：取全局最小，但若仍偏高说明非周期性（噪声/杂音），拒绝
    let minVal = Infinity
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau]! < minVal) {
        minVal = cmnd[tau]!
        tauEst = tau
      }
    }
    if (tauEst === -1 || minVal > 0.5) return null
  }

  // Step 4：抛物线插值细化 tau（亚样本精度）
  let refinedTau = tauEst
  if (tauEst > tauMin && tauEst < tauMax) {
    const s0 = cmnd[tauEst - 1]!
    const s1 = cmnd[tauEst]!
    const s2 = cmnd[tauEst + 1]!
    const denom = s0 - 2 * s1 + s2
    if (denom !== 0) {
      const shift = (s0 - s2) / (2 * denom)
      refinedTau = tauEst + Math.max(-1, Math.min(1, shift))
    }
  }

  return refinedTau > 0 ? sampleRate / refinedTau : null
}

/* ------------------------------------------------------------------ */
/* Hook                                                                 */
/* ------------------------------------------------------------------ */

export interface TunerPreset {
  name: string
  strings: { note: string; octave: number }[]
}

export const GUITAR_STANDARD: TunerPreset = {
  name: '标准吉他',
  strings: [
    { note: 'E', octave: 2 },
    { note: 'A', octave: 2 },
    { note: 'D', octave: 3 },
    { note: 'G', octave: 3 },
    { note: 'B', octave: 3 },
    { note: 'E', octave: 4 }
  ]
}

export const TUNER_PRESETS: TunerPreset[] = [GUITAR_STANDARD]

export interface UseTunerReturn {
  active: boolean
  frequency: number | null
  note: string | null
  octave: number | null
  cent: number
  error: string | null
  start: () => void
  stop: () => void
  playReference: (note: string, octave: number) => void
  stopReference: () => void
  referencePlaying: boolean
}

export function useTuner(): UseTunerReturn {
  const [active, setActive] = useState(false)
  const [frequency, setFrequency] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [octave, setOctave] = useState<number | null>(null)
  const [cent, setCent] = useState(0)
  const [referencePlaying, setReferencePlaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const rafRef = useRef<number>(0)
  const activeRef = useRef(false)

  // 参考音 refs（多振荡器 + 噪声层）
  const refNodesRef = useRef<OscillatorNode[]>([])
  const refGainRef = useRef<GainNode | null>(null)
  const refTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 平滑 refs：用滑动窗口投票，而非严格的连续帧匹配
  const recentNotesRef = useRef<string[]>([])
  const smoothFreqRef = useRef<number | null>(null)
  // 信号丢失计数：连续 N 帧无信号才清空，避免闪烁
  const silenceCountRef = useRef(0)
  // 上次真正执行检测的时间戳（用于节流到约 30fps）
  const lastDetectRef = useRef(0)

  /** 滑动窗口大小（帧数） */
  const WINDOW = 8
  /** 连续无信号多少帧才清空显示 */
  const SILENCE_THRESHOLD = 15

  /* ---- 检测循环（带平滑） ---- */
  const detect = useCallback(() => {
    if (!activeRef.current) return

    // 节流到约 30fps：距上次检测不足 ~33ms 则跳过重算，仅继续 rAF 保持循环
    const nowMs = performance.now()
    if (nowMs - lastDetectRef.current < DETECT_INTERVAL_MS) {
      rafRef.current = requestAnimationFrame(detect)
      return
    }
    lastDetectRef.current = nowMs

    const analyser = analyserRef.current
    const ctx = ctxRef.current
    if (!analyser || !ctx) return

    analyser.getFloatTimeDomainData(timeDomainBuf)

    const rawFreq = detectPitch(timeDomainBuf, ctx.sampleRate)

    if (rawFreq !== null && rawFreq >= MIN_FREQUENCY && rawFreq <= MAX_FREQUENCY) {
      silenceCountRef.current = 0

      // 频率平滑：指数移动平均
      const prev = smoothFreqRef.current
      const smoothFreq = prev ? prev * 0.7 + rawFreq * 0.3 : rawFreq
      smoothFreqRef.current = smoothFreq

      const info = frequencyToNote(smoothFreq)
      const key = `${info.note}${info.octave}`

      // 滑动窗口投票：最近 WINDOW 帧，取出现最多的音符
      recentNotesRef.current.push(key)
      if (recentNotesRef.current.length > WINDOW) {
        recentNotesRef.current.shift()
      }

      // 统计窗口内最多的音符
      const counts: Record<string, number> = {}
      let bestCount = 0
      for (const k of recentNotesRef.current) {
        counts[k] = (counts[k] || 0) + 1
        if (counts[k]! > bestCount) {
          bestCount = counts[k]!
        }
      }

      // 窗口内超过半数才更新（减少跳变）
      if (bestCount >= Math.ceil(WINDOW / 2)) {
        setFrequency(Math.round(smoothFreq * 100) / 100)
        setNote(info.note)
        setOctave(info.octave)
        setCent((prev) => Math.round(prev * 0.5 + info.cent * 0.5))
      }
    } else {
      // 无信号：累计后清空，避免闪烁
      silenceCountRef.current++
      if (silenceCountRef.current >= SILENCE_THRESHOLD) {
        smoothFreqRef.current = null
        recentNotesRef.current = []
        setFrequency(null)
        setNote(null)
        setOctave(null)
        setCent(0)
      }
    }

    rafRef.current = requestAnimationFrame(detect)
  }, [])

  /* ---- start / stop ---- */
  const start = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // 复用已存在的 AudioContext（如先前 playReference 创建的），避免覆盖旧 ctx 造成泄漏
      const ctx = ctxRef.current ?? new AudioContext()
      ctxRef.current = ctx
      if (ctx.state === 'suspended') void ctx.resume()

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source

      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyserRef.current = analyser

      source.connect(analyser)

      smoothFreqRef.current = null
      recentNotesRef.current = []
      silenceCountRef.current = 0
      lastDetectRef.current = 0

      activeRef.current = true
      setActive(true)
      rafRef.current = requestAnimationFrame(detect)
    } catch (e) {
      activeRef.current = false
      setActive(false)
      // 释放可能已获取的音频流，避免残留占用
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      const err = e as DOMException
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setError('麦克风权限被拒绝，请在系统设置中允许访问麦克风后重试')
      } else if (err && (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError')) {
        setError('未检测到麦克风设备，请连接麦克风后重试')
      } else {
        setError(`无法访问麦克风：${err?.message || '未知错误'}`)
      }
    }
  }, [detect])

  const stop = useCallback(() => {
    activeRef.current = false
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    if (analyserRef.current) {
      analyserRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (ctxRef.current) {
      ctxRef.current.close().catch(() => {})
      ctxRef.current = null
    }
    smoothFreqRef.current = null
    recentNotesRef.current = []
    silenceCountRef.current = 0
    setActive(false)
    setFrequency(null)
    setNote(null)
    setOctave(null)
    setCent(0)
    setError(null)
  }, [])

  /* ---- 参考音：模拟钢弦吉他拨弦 ---- */
  const playReference = useCallback((noteName: string, noteOctave: number) => {
    // 停止之前的参考音
    for (const n of refNodesRef.current) { try { n.stop() } catch { /* */ } }
    refNodesRef.current = []
    if (refTimeoutRef.current) {
      clearTimeout(refTimeoutRef.current)
      refTimeoutRef.current = null
    }

    const ctx = ctxRef.current ?? new AudioContext()
    if (!ctxRef.current) ctxRef.current = ctx
    if (ctx.state === 'suspended') void ctx.resume()

    const freq = noteToFrequency(noteName, noteOctave)
    const now = ctx.currentTime

    // 总时长：低音弦共鸣更久
    const duration = 4.0 + 2.0 * (1 - Math.min(freq / 600, 1))

    // 主增益：拨弦式极快起音 → 指数衰减
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.001, now)
    masterGain.gain.linearRampToValueAtTime(0.35, now + 0.003)  // 极快起音（3ms）
    masterGain.gain.setTargetAtTime(0.15, now + 0.003, duration * 0.25)  // 自然衰减
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration)
    masterGain.connect(ctx.destination)
    refGainRef.current = masterGain

    // 钢弦吉他泛音特征：
    // - 基频用 sine（干净），但加独立的泛音层来增加明亮感
    // - 泛音增益比真实吉他稍高（方便听辨），但衰减更快
    // - 高次泛音极快衰减 → 只有拨弦瞬间"闪亮"，随后迅速消失
    //   这就是"清脆透亮但不电子"的关键
    const harmonics: { n: number; vol: number }[] = [
      { n: 1,  vol: 1.0  },  // 基频
      { n: 2,  vol: 0.55 },  // 八度：钢弦的八度泛音很强
      { n: 3,  vol: 0.35 },  // 十二度
      { n: 4,  vol: 0.18 },  // 二次八度
      { n: 5,  vol: 0.10 },  // 大三度区域
      { n: 6,  vol: 0.05 },  // 更高泛音，只给拨弦瞬间一点闪光
    ]

    const nodes: OscillatorNode[] = []

    for (const h of harmonics) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.value = freq * h.n

      // 高次泛音衰减越来越快：基频持续整段，6次泛音只持续 1/4
      // 这模拟了钢弦的物理特性：高频振动能量迅速耗散
      const hDecay = duration * Math.pow(0.75, h.n - 1)

      // 高次泛音的起音更尖锐（瞬间更亮），然后迅速回落
      gain.gain.setValueAtTime(h.vol, now)
      if (h.n > 1) {
        // 泛音：快速闪现后衰减
        gain.gain.setTargetAtTime(h.vol * 0.2, now + 0.01, hDecay * 0.15)
      }
      gain.gain.exponentialRampToValueAtTime(0.001, now + hDecay)

      osc.connect(gain)
      gain.connect(masterGain)

      osc.start(now)
      osc.stop(now + hDecay + 0.05)
      nodes.push(osc)
    }

    refNodesRef.current = nodes
    setReferencePlaying(true)

    refTimeoutRef.current = setTimeout(() => {
      setReferencePlaying(false)
      refNodesRef.current = []
      refGainRef.current = null
      refTimeoutRef.current = null
    }, (duration + 0.2) * 1000)
  }, [])

  const stopReference = useCallback(() => {
    for (const n of refNodesRef.current) { try { n.stop() } catch { /* */ } }
    refNodesRef.current = []
    refGainRef.current = null
    if (refTimeoutRef.current) {
      clearTimeout(refTimeoutRef.current)
      refTimeoutRef.current = null
    }
    setReferencePlaying(false)
  }, [])

  /* ---- 清理 ---- */
  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      for (const n of refNodesRef.current) { try { n.stop() } catch { /* */ } }
      if (refTimeoutRef.current) clearTimeout(refTimeoutRef.current)
      if (sourceRef.current) sourceRef.current.disconnect()
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop())
      if (ctxRef.current) ctxRef.current.close().catch(() => {})
    }
  }, [])

  return {
    active,
    frequency,
    note,
    octave,
    cent,
    error,
    start,
    stop,
    playReference,
    stopReference,
    referencePlaying
  }
}
