/** useTuner — 吉他/尤克里里调音器 Hook
 *
 * 核心设计：
 *   - 自相关（Autocorrelation）音高检测 + 平滑滤波：避免音符跳变
 *   - 参考音：多泛音合成模拟吉他弦清脆透明音色
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

function noteKey(note: string, octave: number): string {
  return `${note}${octave}`
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

/** 音符稳定需要的连续帧数（~60fps 下约 200ms） */
const STABILITY_FRAMES = 12

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
  const refOscsRef = useRef<OscillatorNode[]>([])
  const refGainRef = useRef<GainNode | null>(null)
  const refTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 平滑/稳定 refs
  const stableNoteRef = useRef<string | null>(null)
  const stableOctaveRef = useRef<number | null>(null)
  const stableCountRef = useRef(0)
  const smoothFreqRef = useRef<number | null>(null)

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
      // 指数移动平均平滑频率
      const prevFreq = smoothFreqRef.current
      const smoothFreq = prevFreq ? prevFreq * 0.7 + rawFreq * 0.3 : rawFreq
      smoothFreqRef.current = smoothFreq

      const info = frequencyToNote(smoothFreq)
      const key = noteKey(info.note, info.octave)

      // 稳定性检查：连续检测到同一音符才更新显示
      if (stableNoteRef.current === key) {
        stableCountRef.current++
      } else {
        stableNoteRef.current = key
        stableOctaveRef.current = info.octave
        stableCountRef.current = 1
      }

      if (stableCountRef.current >= STABILITY_FRAMES) {
        setFrequency(Math.round(smoothFreq * 100) / 100)
        setNote(info.note)
        setOctave(info.octave)
        // cent 用更多平滑
        setCent((prev) => Math.round(prev * 0.6 + info.cent * 0.4))
      }
    } else {
      smoothFreqRef.current = null
      // 信号丢失：重置稳定性
      if (stableCountRef.current > 0) {
        stableCountRef.current = 0
        stableNoteRef.current = null
        stableOctaveRef.current = null
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

      // 重置平滑状态
      smoothFreqRef.current = null
      stableNoteRef.current = null
      stableOctaveRef.current = null
      stableCountRef.current = 0

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
    stableNoteRef.current = null
    stableOctaveRef.current = null
    stableCountRef.current = 0
    setActive(false)
    setFrequency(null)
    setNote(null)
    setOctave(null)
    setCent(0)
  }, [])

  /* ---- 参考音 ---- */
  const playReference = useCallback((noteName: string, noteOctave: number) => {
    // 停止之前的参考音
    for (const osc of refOscsRef.current) {
      try { osc.stop() } catch { /* */ }
    }
    refOscsRef.current = []
    if (refTimeoutRef.current) {
      clearTimeout(refTimeoutRef.current)
      refTimeoutRef.current = null
    }

    const ctx = ctxRef.current ?? new AudioContext()
    if (!ctxRef.current) ctxRef.current = ctx
    if (ctx.state === 'suspended') void ctx.resume()

    const freq = noteToFrequency(noteName, noteOctave)
    const now = ctx.currentTime

    // 总时长：低音 ~5s，高音 ~3.5s（吉他低音弦共鸣更久）
    const totalTime = 3.5 + 1.5 * (1 - Math.min(freq / 800, 1))

    // 主增益：拨弦式起音 + 长衰减 + 尾部快淡
    const masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.001, now)
    masterGain.gain.linearRampToValueAtTime(0.45, now + 0.005)   // 极快起音
    masterGain.gain.setTargetAtTime(0.25, now + 0.005, totalTime * 0.3)  // 自然衰减到 1/e
    masterGain.gain.setTargetAtTime(0.001, now + totalTime * 0.5, totalTime * 0.2) // 尾部淡出
    masterGain.connect(ctx.destination)
    refGainRef.current = masterGain

    // 泛音合成：模拟吉他弦清脆透明音色
    // 关键：基频用 sawtooth（丰富的奇偶泛音），大幅提升 2-5 次泛音增益
    const harmonics: { freqMul: number; volume: number; type: OscillatorType }[] = [
      { freqMul: 1,   volume: 0.6,  type: 'sawtooth' },  // 基频：锯齿波，含全部泛音，最清脆
      { freqMul: 2,   volume: 0.5,  type: 'sine' },       // 2 次泛音：八度，增强透明感
      { freqMul: 3,   volume: 0.3,  type: 'sine' },       // 3 次泛音：十二度
      { freqMul: 4,   volume: 0.15, type: 'sine' },       // 4 次泛音：二次八度
      { freqMul: 5,   volume: 0.06, type: 'sine' },       // 5 次泛音：大三度区域，增加"钢弦"质感
    ]

    const oscs: OscillatorNode[] = []

    for (const h of harmonics) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = h.type
      osc.frequency.value = freq * h.freqMul

      // 高次泛音衰减更快
      const hDecay = totalTime * (1 - (h.freqMul - 1) * 0.12)
      gain.gain.setValueAtTime(h.volume, now)
      gain.gain.setTargetAtTime(h.volume * 0.3, now + 0.01, hDecay * 0.4)
      gain.gain.exponentialRampToValueAtTime(0.001, now + hDecay)

      osc.connect(gain)
      gain.connect(masterGain)

      osc.start(now)
      osc.stop(now + hDecay + 0.1)
      oscs.push(osc)
    }

    refOscsRef.current = oscs
    setReferencePlaying(true)

    refTimeoutRef.current = setTimeout(() => {
      setReferencePlaying(false)
      refOscsRef.current = []
      refGainRef.current = null
      refTimeoutRef.current = null
    }, (totalTime + 0.3) * 1000)
  }, [])

  const stopReference = useCallback(() => {
    for (const osc of refOscsRef.current) {
      try { osc.stop() } catch { /* */ }
    }
    refOscsRef.current = []
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
      for (const osc of refOscsRef.current) { try { osc.stop() } catch { /* */ } }
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
