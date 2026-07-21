/** MetronomeCard — 节拍器 Card 组件
 *
 * 接受外部 useMetronome 实例，包含：
 * BeatIndicator、BPM 控制、拍号选择、播放/暂停、Tap Tempo
 */
import { useCallback, useEffect, useRef } from 'react'
import { Card } from './ui'
import type { UseMetronomeReturn, TimeSignature } from '../hooks/useMetronome'

/* ------------------------------------------------------------------ */
/* BeatIndicator — 拍位视觉指示器                                        */
/* ------------------------------------------------------------------ */

function BeatIndicator({
  beats,
  currentBeat
}: {
  beats: number
  currentBeat: number
}): React.ReactElement {
  const dotSize = beats > 8 ? 8 : beats > 6 ? 10 : 12
  const gap = beats > 8 ? 4 : 8

  return (
    <div className="row" style={{ justifyContent: 'center', gap, margin: '8px 0', flexWrap: 'wrap' }}>
      {Array.from({ length: beats }, (_, i) => {
        const isActive = i === currentBeat
        const isAccent = i === 0 && isActive
        return (
          <span
            key={i}
            className={`beat-dot ${isActive ? 'active' : ''} ${isAccent ? 'accent-active' : ''}`}
            style={{
              width: dotSize,
              height: dotSize,
              ...(!isActive ? { background: 'var(--border-strong)' } : {})
            }}
          />
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* StepperButton — 长按加速的步进按钮                                     */
/* ------------------------------------------------------------------ */

function StepperButton({
  label,
  onChange,
  step = 1
}: {
  label: string
  onChange: (delta: number) => void
  step?: number
}): React.ReactElement {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepRef = useRef(step)

  const clear = useCallback(() => {
    stepRef.current = step
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [step])

  useEffect(() => {
    return () => clear()
  }, [clear])

  const handleDown = () => {
    onChange(stepRef.current)
    timeoutRef.current = setTimeout(() => {
      stepRef.current = step * 5
      onChange(stepRef.current)
      intervalRef.current = setInterval(() => {
        onChange(stepRef.current)
      }, 120)
    }, 500)
  }

  const handleUp = () => {
    clear()
  }

  return (
    <button
      className="btn btn-sm btn-ghost stepper-btn"
      onMouseDown={handleDown}
      onMouseUp={handleUp}
      onMouseLeave={handleUp}
    >
      {label}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* NumberStepper — 数字微调器                                            */
/* ------------------------------------------------------------------ */

function NumberStepper({
  value,
  min,
  max,
  onChange
}: {
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}): React.ReactElement {
  return (
    <div className="row" style={{ gap: 4, alignItems: 'center' }}>
      <button
        className="btn btn-sm btn-ghost"
        style={{ padding: '2px 6px', fontSize: 14 }}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <span style={{ width: 24, textAlign: 'center', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
        {value}
      </span>
      <button
        className="btn btn-sm btn-ghost"
        style={{ padding: '2px 6px', fontSize: 14 }}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
      >
        ＋
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* MetronomeCard                                                        */
/* ------------------------------------------------------------------ */

interface MetronomeCardProps {
  /** 外部 useMetronome 实例 */
  metro: UseMetronomeReturn
  /** BPM/拍号变更回调（用于持久化到歌曲） */
  onBpmChange?: (bpm: number) => void
  onTimeSignatureChange?: (ts: string) => void
}

function formatTimeSignature(ts: TimeSignature): string {
  return `${ts.beats}/${ts.unit}`
}

export function MetronomeCard({
  metro,
  onBpmChange,
  onTimeSignatureChange
}: MetronomeCardProps): React.ReactElement {
  // BPM 变更时通知父组件
  const prevBpmRef = useRef(metro.bpm)
  useEffect(() => {
    if (metro.bpm !== prevBpmRef.current) {
      prevBpmRef.current = metro.bpm
      onBpmChange?.(metro.bpm)
    }
  }, [metro.bpm]) // eslint-disable-line react-hooks/exhaustive-deps

  // 拍号变更时通知父组件
  const prevTsRef = useRef(formatTimeSignature(metro.timeSignature))
  useEffect(() => {
    const tsStr = formatTimeSignature(metro.timeSignature)
    if (tsStr !== prevTsRef.current) {
      prevTsRef.current = tsStr
      onTimeSignatureChange?.(tsStr)
    }
  }, [metro.timeSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBeatsChange = (newBeats: number) => {
    metro.setTimeSignature({ ...metro.timeSignature, beats: newBeats })
  }

  const handleUnitChange = (newUnit: number) => {
    metro.setTimeSignature({ ...metro.timeSignature, unit: newUnit })
  }

  return (
    <Card title="节拍器">
      {/* 拍位指示器 */}
      <BeatIndicator beats={metro.timeSignature.beats} currentBeat={metro.currentBeat} />

      {/* BPM 数字显示 */}
      <div style={{ textAlign: 'center', margin: '4px 0' }}>
        <div style={{ fontSize: 48, fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
          {metro.bpm}
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>BPM</div>
      </div>

      {/* BPM 步进 + 滑块 */}
      <div className="row" style={{ gap: 8, alignItems: 'center', margin: '8px 0' }}>
        <StepperButton label="−" onChange={(d) => metro.setBpm(metro.bpm + d)} step={-1} />
        <input
          type="range"
          className="bpm-slider grow"
          min={40}
          max={240}
          value={metro.bpm}
          onChange={(e) => metro.setBpm(parseInt(e.target.value, 10))}
        />
        <StepperButton label="＋" onChange={(d) => metro.setBpm(metro.bpm + d)} step={1} />
      </div>

      {/* 拍号选择 */}
      <div className="row-between" style={{ margin: '8px 0', alignItems: 'center' }}>
        <span className="label" style={{ margin: 0, fontSize: 13 }}>拍号</span>
        <div className="row" style={{ gap: 4, alignItems: 'center' }}>
          <NumberStepper value={metro.timeSignature.beats} min={1} max={16} onChange={handleBeatsChange} />
          <span style={{ fontSize: 18, fontWeight: 300, color: 'var(--text-muted)' }}>/</span>
          <NumberStepper value={metro.timeSignature.unit} min={1} max={16} onChange={handleUnitChange} />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="row" style={{ gap: 8, marginTop: 8 }}>
        <button
          className={`btn ${metro.playing ? '' : 'btn-primary'}`}
          onClick={metro.toggle}
        >
          {metro.playing ? '⏸ 暂停' : '▶ 开始'}
        </button>
        <button className="btn btn-ghost" onClick={metro.tapTempo}>
          Tap
        </button>
      </div>
    </Card>
  )
}
