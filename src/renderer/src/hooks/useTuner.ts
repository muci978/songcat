/** useTuner — 吉他/尤克里里调音器 Hook
 *
 * 核心设计：
 *   - 自相关（Autocorrelation）音高检测 + 平滑滤波
 *   - 参考音：简洁正弦波 + 长衰减
 *   - 麦克风管理：getUserMedia 获取音频流，组件卸载时释放
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
/* 自相关音高检测                                                        */
/* ------------------------------------------------------------------ */

const FFT_SIZE = 2048
const MIN_FREQUENCY = 60
const MAX_FREQUENCY = 1400

function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length

  let rms = 0
  for (let i = 0; i < SIZE; i++) {
    rms += buf[i]! * buf[i]!
  }
  rms = Math.sqrt(rms / SIZE)
  if (rms < 0.01) return null

  const correlations = new Float32Array(SIZE)
  for (let lag = 0; lag < SIZE; lag++) {
    let sum = 0
    for (let i = 0; i < SIZE - lag; i++) {
      sum += buf[i]! * buf[i + lag]!
    }
    correlations[lag] = sum
  }

  let firstDip = 0
  while (firstDip < SIZE - 1 && correlations[firstDip + 1]! > correlations[firstDip]!) {
    firstDip++
  }

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
  const refTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 平滑 refs：用滑动窗口投票，而非严格的连续帧匹配
  const recentNotesRef = useRef<string[]>([])
  const smoothFreqRef = useRef<number | null>(null)
  // 信号丢失计数：连续 N 帧无信号才清空，避免闪烁
  const silenceCountRef = useRef(0)

  /** 滑动窗口大小（帧数） */
  const WINDOW = 8
  /** 连续无信号多少帧才清空显示 */
  const SILENCE_THRESHOLD = 15

  /* ---- 检测循环（带平滑） ---- */
  const detect = useCallback(() => {
    if (!activeRef.current) return

    const analyser = analyserRef.current
    const ctx = ctxRef.current
    if (!analyser || !ctx) return

    const buf = new Float32Array(analyser.fftSize)
    analyser.getFloatTimeDomainData(buf)

    const rawFreq = detectPitch(buf, ctx.sampleRate)

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
      let bestKey = key
      let bestCount = 0
      for (const k of recentNotesRef.current) {
        counts[k] = (counts[k] || 0) + 1
        if (counts[k]! > bestCount) {
          bestCount = counts[k]!
          bestKey = k
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

      smoothFreqRef.current = null
      recentNotesRef.current = []
      silenceCountRef.current = 0

      activeRef.current = true
      setActive(true)
      rafRef.current = requestAnimationFrame(detect)
    } catch {
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
    smoothFreqRef.current = null
    recentNotesRef.current = []
    silenceCountRef.current = 0
    setActive(false)
    setFrequency(null)
    setNote(null)
    setOctave(null)
    setCent(0)
  }, [])

  /* ---- 参考音：简洁正弦波 + 长衰减 ---- */
  const playReference = useCallback((noteName: string, noteOctave: number) => {
    // 停止之前的参考音
    if (refOscRef.current) {
      try { refOscRef.current.stop() } catch { /* */ }
      refOscRef.current = null
    }
    if (refTimeoutRef.current) {
      clearTimeout(refTimeoutRef.current)
      refTimeoutRef.current = null
    }

    const ctx = ctxRef.current ?? new AudioContext()
    if (!ctxRef.current) ctxRef.current = ctx
    if (ctx.state === 'suspended') void ctx.resume()

    const freq = noteToFrequency(noteName, noteOctave)
    const now = ctx.currentTime

    // 持续时间：低音 5s，高音 3.5s
    const duration = 3.5 + 1.5 * (1 - Math.min(freq / 800, 1))

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.value = freq

    // 起音 + 自然长衰减
    gain.gain.setValueAtTime(0.001, now)
    gain.gain.linearRampToValueAtTime(0.5, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + duration + 0.1)

    refOscRef.current = osc
    refGainRef.current = gain
    setReferencePlaying(true)

    refTimeoutRef.current = setTimeout(() => {
      setReferencePlaying(false)
      refOscRef.current = null
      refGainRef.current = null
      refTimeoutRef.current = null
    }, (duration + 0.2) * 1000)
  }, [])

  const stopReference = useCallback(() => {
    if (refOscRef.current) {
      try { refOscRef.current.stop() } catch { /* */ }
      refOscRef.current = null
    }
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
      if (refOscRef.current) { try { refOscRef.current.stop() } catch { /* */ } }
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
    start,
    stop,
    playReference,
    stopReference,
    referencePlaying
  }
}
