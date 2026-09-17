import { describe, it, expect } from 'vitest'
import {
  frequencyToNote,
  noteToFrequency,
  detectPitch,
  A4_FREQUENCY,
  FFT_SIZE
} from '@renderer/lib/pitch'

describe('frequencyToNote / noteToFrequency（等程律换算）', () => {
  it('A4=440 → A4，cent≈0', () => {
    const r = frequencyToNote(440)
    expect(r.note).toBe('A')
    expect(r.octave).toBe(4)
    expect(Math.abs(r.cent)).toBeLessThanOrEqual(1)
  })

  it('中央 C（261.63Hz）→ C4', () => {
    const r = frequencyToNote(261.63)
    expect(r.note).toBe('C')
    expect(r.octave).toBe(4)
    expect(Math.abs(r.cent)).toBeLessThanOrEqual(1)
  })

  it('noteToFrequency(A,4) = 440', () => {
    expect(noteToFrequency('A', 4)).toBeCloseTo(A4_FREQUENCY, 5)
  })

  it('往返一致：note→freq→note', () => {
    const cases: { note: string; octave: number }[] = [
      { note: 'E', octave: 2 },
      { note: 'A', octave: 2 },
      { note: 'D', octave: 3 },
      { note: 'G', octave: 3 },
      { note: 'B', octave: 3 },
      { note: 'E', octave: 4 }
    ]
    for (const c of cases) {
      const f = noteToFrequency(c.note, c.octave)
      const back = frequencyToNote(f)
      expect(back.note).toBe(c.note)
      expect(back.octave).toBe(c.octave)
      expect(Math.abs(back.cent)).toBeLessThanOrEqual(1)
    }
  })

  it('未知音名回退到 A4 频率', () => {
    expect(noteToFrequency('H', 4)).toBeCloseTo(A4_FREQUENCY, 5)
  })

  it('cent 被 clamp 到 ±50', () => {
    // 任意频率 cent 都在 [-50, 50]
    for (const f of [82, 110, 196, 329.6, 500, 987]) {
      const r = frequencyToNote(f)
      expect(r.cent).toBeGreaterThanOrEqual(-50)
      expect(r.cent).toBeLessThanOrEqual(50)
    }
  })
})

describe('detectPitch（YIN 基频检测）', () => {
  const SR = 44100

  /** 合成指定频率、幅度的正弦到 Float32Array（长度 FFT_SIZE） */
  function sine(freq: number, amp = 0.5, sr = SR): Float32Array {
    const buf = new Float32Array(FFT_SIZE)
    for (let i = 0; i < FFT_SIZE; i++) {
      buf[i] = amp * Math.sin((2 * Math.PI * freq * i) / sr)
    }
    return buf
  }

  it('对 440Hz 正弦检测结果落在容差内', () => {
    const f = detectPitch(sine(440), SR)
    expect(f).not.toBeNull()
    expect(Math.abs(f! - 440)).toBeLessThan(2)
  })

  it('对低音 110Hz(A2 区) 正弦检测准确', () => {
    const f = detectPitch(sine(110), SR)
    expect(f).not.toBeNull()
    expect(Math.abs(f! - 110)).toBeLessThan(2)
  })

  it('对 329.63Hz(E4) 正弦检测准确', () => {
    const f = detectPitch(sine(329.63), SR)
    expect(f).not.toBeNull()
    expect(Math.abs(f! - 329.63)).toBeLessThan(2)
  })

  it('静音（全 0）返回 null', () => {
    expect(detectPitch(new Float32Array(FFT_SIZE), SR)).toBeNull()
  })

  it('低于 RMS 门限的极弱信号返回 null', () => {
    expect(detectPitch(sine(440, 0.001), SR)).toBeNull()
  })
})
