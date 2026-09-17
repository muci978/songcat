/** pitch —— 音高检测与音符换算的纯函数（无 DOM/Web Audio 依赖，可单元测试）
 *
 * 从 useTuner.ts 抽离：
 *   - frequencyToNote / noteToFrequency：频率 ↔ 音名/八度/音分换算（A4=440，等程律）
 *   - detectPitch：YIN 算法（de Cheveigné & Kawahara, 2002）基频检测
 */

/* ------------------------------------------------------------------ */
/* 音符定义                                                             */
/* ------------------------------------------------------------------ */

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const
export const A4_FREQUENCY = 440
export const A4_MIDI = 69

export function frequencyToNote(freq: number): { note: string; octave: number; cent: number } {
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

export function noteToFrequency(note: string, octave: number): number {
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
export const FFT_SIZE = 4096
export const MIN_FREQUENCY = 60 // 低于 E2(82Hz) 留出失谐余量
export const MAX_FREQUENCY = 1400
/** YIN 绝对阈值：CMND 首次跌破该值处即认定为基频周期（越小越严格，0.10~0.15 为常用区间） */
const YIN_THRESHOLD = 0.12
/** RMS 静音门限：低于此不做检测 */
const RMS_GATE = 0.01

// 复用缓冲：避免每帧 new Float32Array 造成 GC 压力（长度固定为 FFT_SIZE）
export const timeDomainBuf = new Float32Array(FFT_SIZE)
const diffBuf = new Float32Array(FFT_SIZE) // 差分函数 d(tau)
const cmndBuf = new Float32Array(FFT_SIZE) // 累积均值归一化差分 d'(tau)

/**
 * YIN 音高检测：返回基频（Hz），无可信音高时返回 null。
 * 步骤见 de Cheveigné & Kawahara (2002)：差分 → CMND → 绝对阈值 → 抛物线插值。
 */
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const SIZE = buf.length

  // RMS 门限：过滤静音/底噪
  let rms = 0
  for (let i = 0; i < SIZE; i++) rms += buf[i]! * buf[i]!
  rms = Math.sqrt(rms / SIZE)
  if (rms < RMS_GATE) return null

  const tauMin = Math.max(1, Math.floor(sampleRate / MAX_FREQUENCY))
  const tauMax = Math.min(Math.floor(sampleRate / MIN_FREQUENCY), SIZE - 1)
  if (tauMax <= tauMin) return null

  // Step 1：差分函数 d(tau) = Σ (x[i] - x[i+tau])²。缓冲不足时按需扩容。
  const diff = diffBuf.length > tauMax ? diffBuf : new Float32Array(tauMax + 1)
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
  const cmnd = cmndBuf.length > tauMax ? cmndBuf : new Float32Array(tauMax + 1)
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
