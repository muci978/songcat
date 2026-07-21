/** useTuner — 吉他/尤克里里调音器 Hook
 *
 * 核心设计：
 *   - 自相关（Autocorrelation）音高检测：从麦克风获取时域数据，
 *     做自相关运算找基频周期 → f = sampleRate / period
 *   - 参考音：OscillatorNode + GainNode 播放标准音高正弦波，2 秒自动淡出
 *   - 麦克风管理：getUserMedia 获取音频流，组件卸载时释放
 */
import { useCallback, useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/* 音符定义                                                             */
/* ------------------------------------------------------------------ */

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const

/** A4 = 440Hz，所有音符基于此计算 */
const A4_FREQUENCY = 440
const A4_MIDI = 69

/** 频率 → 音符信息 */
function frequencyToNote(freq: number): { note: string; octave: number; cent: number } {
  // MIDI 编号 = 69 + 12 * log2(freq / 440)
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

/** 音符+八度 → 频率 */
function noteToFrequency(note: string, octave: number): number {
  const noteIndex = NOTE_NAMES.indexOf(note as typeof NOTE_NAMES[number])
  if (noteIndex === -1) return A4_FREQUENCY
  const midi = (octave + 1) * 12 + noteIndex
  return A4_FREQUENCY * Math.pow(2, (midi - A4_MIDI) / 12)
}

/* ------------------------------------------------------------------ */
/* 自相关音高检测                                                        */
/* ------------------------------------------------------------------ */

const FFT_SIZE = 2048
/** 检测频率范围：E2(82.4Hz) ~ E6(1318.5Hz) */
const MIN_FREQUENCY = 60
const MAX_FREQUENCY = 1400

/**
 * 自相关音高检测算法
 * @param buf 时域浮点数据
 * @param sampleRate 音频采样率
 * @returns 检测到的频率，未检测到返回 null
 */
function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length

  // 计算 RMS，信号太弱则跳过
  let rms = 0
  for (let i = 0; i < SIZE; i++) {
    rms += buf[i]! * buf[i]!
  }
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return null

  // 自相关
  const correlations = new Float32Array(SIZE)
  for (let lag = 0; lag < SIZE; lag++) {
    let sum = 0
    for (let i = 0; i < SIZE - lag; i++) {
      sum += buf[i]! * buf[i + lag]!
    }
    correlations[lag] = sum
  }

  // 找第一个下降点（跳过 lag=0 的自峰）
  let firstDip = 0
  while (firstDip < SIZE - 1 && correlations[firstDip + 1]! > correlations[firstDip]!) {
    firstDip++
  }

  // 从第一个下降点之后找最大峰值
  let bestLag = -1
  let bestCorr = -Infinity
  const minLag = Math.floor(sampleRate / MAX_FREQUENCY)
  const maxLag = Math.min(Math.floor(sampleRate / MIN_FREQUENCY), SIZE - 1)

  for (let lag = Math.max(firstDip + 1, minLag); lag <= maxLag; lag++) {
    if (correlations[lag]! > bestCorr) {
      bestCorr = correlations[lag]!
      bestLag = lag
    }
  }

  if (bestLag === -1) return null

  // 抛物线插值提高精度
  const y1 = correlations[bestLag - 1] ?? 0
  const y2 = correlations[bestLag]!
  const y3 = correlations[bestLag + 1] ?? 0
  const shift = (y3 - y1) / (2 * (2 * y2 - y1 - y3))
  const refinedLag = bestLag + (isFinite(shift) ? shift : 0)

  return sampleRate / refinedLag
}

/* ------------------------------------------------------------------ */
/* Hook                                                                 */
/* ------------------------------------------------------------------ */

export interface TunerPreset {
  name: string
  strings: { note: string; octave: number }[]
}

/** 标准吉他调弦 */
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

/** 尤克里里调弦 */
export const UKULELE_STANDARD: TunerPreset = {
  name: '尤克里里',
  strings: [
    { note: 'G', octave: 4 },
    { note: 'C', octave: 4 },
    { note: 'E', octave: 4 },
    { note: 'A', octave: 4 }
  ]
}

export const TUNER_PRESETS: TunerPreset[] = [GUITAR_STANDARD, UKULELE_STANDARD]

export interface UseTunerReturn {
  active: boolean
  frequency: number | null
  note: string | null
  octave: number | null
  cent: number
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

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const rafRef = useRef<number>(0)
  const activeRef = useRef(false)

  // 参考音 refs
  const refOscRef = useRef<OscillatorNode | null>(null)
  const refGainRef = useRef<GainNode | null>(null)

  /* ---- 检测循环 ---- */
  const detect = useCallback(() => {
    if (!activeRef.current) return

    const analyser = analyserRef.current
    const ctx = ctxRef.current
    if (!analyser || !ctx) return

    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)

    const freq = detectPitch(buf, ctx.sampleRate)

    if (freq !== null && freq >= MIN_FREQUENCY && freq <= MAX_FREQUENCY) {
      const info = frequencyToNote(freq)
      setFrequency(Math.round(freq * 100) / 100)
      setNote(info.note)
      setOctave(info.octave)
      setCent(info.cent)
    } else {
      setFrequency(null)
      setNote(null)
      setOctave(null)
      setCent(0)
    }

    rafRef.current = requestAnimationFrame(detect)
  }, [])

  /* ---- start / stop ---- */
  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const ctx = new AudioContext()
      ctxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      sourceRef.current = source

      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyserRef.current = analyser

      source.connect(analyser)

      activeRef.current = true
      setActive(true)
      rafRef.current = requestAnimationFrame(detect)
    } catch {
      // 麦克风权限被拒
      activeRef.current = false
      setActive(false)
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
    setActive(false)
    setFrequency(null)
    setNote(null)
    setOctave(null)
    setCent(0)
  }, [])

  /* ---- 参考音 ---- */
  const playReference = useCallback((noteName: string, noteOctave: number) => {
    // 停止之前的参考音
    if (refOscRef.current) {
      try { refOscRef.current.stop() } catch { /* */ }
      refOscRef.current = null
    }

    const ctx = ctxRef.current ?? new AudioContext()
    if (!ctxRef.current) ctxRef.current = ctx
    if (ctx.state === 'suspended') void ctx.resume()

    const freq = noteToFrequency(noteName, noteOctave)

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = freq

    gain.gain.setValueAtTime(0.4, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 2.1)

    refOscRef.current = osc
    refGainRef.current = gain

    setReferencePlaying(true)

    // 2 秒后自动标记停止
    setTimeout(() => {
      setReferencePlaying(false)
      refOscRef.current = null
      refGainRef.current = null
    }, 2100)
  }, [])

  const stopReference = useCallback(() => {
    if (refOscRef.current) {
      try { refOscRef.current.stop() } catch { /* */ }
      refOscRef.current = null
    }
    refGainRef.current = null
    setReferencePlaying(false)
  }, [])

  /* ---- 清理 ---- */
  useEffect(() => {
    return () => {
      activeRef.current = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (refOscRef.current) { try { refOscRef.current.stop() } catch { /* */ } }
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
    start,
    stop,
    playReference,
    stopReference,
    referencePlaying
  }
}
