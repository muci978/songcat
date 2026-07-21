/** Tuner 页面 — 吉他/尤克里里调音器
 *
 * 独立页面，从侧边栏导航进入
 * 功能：实时音高检测 + 音准指示器 + 参考音 + 调弦快捷按钮
 */
import { useState } from 'react'
import { useTuner, TUNER_PRESETS, type TunerPreset } from '../hooks/useTuner'

/* ------------------------------------------------------------------ */
/* 音准指示器 — 半圆弧刻度                                               */
/* ------------------------------------------------------------------ */

function TunerArc({ cent }: { cent: number }): React.ReactElement {
  // 弧线参数
  const radius = 120
  const startAngle = -150 // 度
  const endAngle = -30
  const totalAngle = endAngle - startAngle // 120 度

  // 指针角度：cent -50~+50 映射到 startAngle~endAngle
  const clampedCent = Math.max(-50, Math.min(50, cent))
  const needleAngle = startAngle + ((clampedCent + 50) / 100) * totalAngle

  // 颜色
  const absCent = Math.abs(cent)
  const color = absCent <= 5 ? 'var(--success)' : absCent <= 15 ? 'var(--warning)' : 'var(--danger)'

  // 生成刻度线
  const ticks: { angle: number; major: boolean; label?: string }[] = []
  for (let c = -50; c <= 50; c += 5) {
    const angle = startAngle + ((c + 50) / 100) * totalAngle
    ticks.push({
      angle,
      major: c % 10 === 0,
      label: c === 0 ? '0' : c % 50 === 0 ? `${c}` : undefined
    })
  }

  const toRad = (deg: number) => (deg * Math.PI) / 180

  return (
    <svg width={300} height={170} viewBox="0 0 300 170" style={{ display: 'block', margin: '0 auto' }}>
      {/* 背景弧 */}
      <path
        d={describeArc(150, 160, radius, startAngle, endAngle)}
        fill="none"
        stroke="var(--border-strong)"
        strokeWidth={3}
        strokeLinecap="round"
      />

      {/* 刻度线 */}
      {ticks.map((t, i) => {
        const rad = toRad(t.angle)
        const inner = radius - (t.major ? 15 : 8)
        const x1 = 150 + inner * Math.cos(rad)
        const y1 = 160 - inner * Math.sin(rad)
        const x2 = 150 + radius * Math.cos(rad)
        const y2 = 160 - radius * Math.sin(rad)
        return (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={t.major ? 'var(--text-muted)' : 'var(--border-strong)'}
            strokeWidth={t.major ? 2 : 1}
          />
        )
      })}

      {/* 中心 0 标记 */}
      <circle cx={150} cy={160 - radius} r={4} fill="var(--text-muted)" />

      {/* 指针 */}
      {(() => {
        const rad = toRad(needleAngle)
        const nx = 150 + (radius - 25) * Math.cos(rad)
        const ny = 160 - (radius - 25) * Math.sin(rad)
        return (
          <>
            <line x1={150} y1={160} x2={nx} y2={ny}
              stroke={color} strokeWidth={2.5} strokeLinecap="round"
              style={{ transition: 'all 0.15s ease' }}
            />
            <circle cx={150} cy={160} r={6} fill={color}
              style={{ transition: 'fill 0.15s ease' }}
            />
            <circle cx={nx} cy={ny} r={5} fill={color}
              style={{ transition: 'all 0.15s ease' }}
            />
          </>
        )
      })()}
    </svg>
  )
}

/** 生成 SVG 弧路径 */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(startAngle))
  const y1 = cy - r * Math.sin(toRad(startAngle))
  const x2 = cx + r * Math.cos(toRad(endAngle))
  const y2 = cy - r * Math.sin(toRad(endAngle))
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

/* ------------------------------------------------------------------ */
/* 调弦预设按钮                                                         */
/* ------------------------------------------------------------------ */

function PresetButtons({
  preset,
  onPlayString
}: {
  preset: TunerPreset
  onPlayString: (note: string, octave: number) => void
}): React.ReactElement {
  return (
    <div>
      <div className="label" style={{ marginBottom: 8 }}>{preset.name}</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        {preset.strings.map((s, i) => (
          <button
            key={i}
            className="btn btn-sm tuner-string-btn"
            onClick={() => onPlayString(s.note, s.octave)}
          >
            {s.note}{s.octave}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tuner 页面                                                           */
/* ------------------------------------------------------------------ */

export default function Tuner(): React.ReactElement {
  const tuner = useTuner()
  const [selectedPreset, setSelectedPreset] = useState<TunerPreset>(TUNER_PRESETS[0]!)

  const absCent = Math.abs(tuner.cent)
  const accuracyColor = absCent <= 5 ? 'var(--success)' : absCent <= 15 ? 'var(--warning)' : 'var(--danger)'
  const accuracyLabel = !tuner.note ? '—' : absCent <= 5 ? '准确' : absCent <= 15 ? '接近' : '偏高/偏低'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 24 }}>
      <h2 style={{ marginBottom: 24 }}>调音器</h2>

      {/* 音准指示器 */}
      <TunerArc cent={tuner.active ? tuner.cent : 0} />

      {/* 音符显示 */}
      <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
        <span style={{ fontSize: 80, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
          {tuner.note ?? '—'}
        </span>
        <span style={{ fontSize: 28, fontWeight: 400, color: 'var(--text-muted)', verticalAlign: 'super', marginLeft: 2 }}>
          {tuner.octave ?? ''}
        </span>
      </div>

      {/* 频率 + 偏差 */}
      <div className="row" style={{ gap: 16, marginBottom: 8 }}>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)', fontSize: 15 }}>
          {tuner.frequency ? `${tuner.frequency.toFixed(1)} Hz` : '— Hz'}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: accuracyColor, fontSize: 15, fontWeight: 600 }}>
          {tuner.active ? `${tuner.cent > 0 ? '+' : ''}${tuner.cent}¢` : '—'}
        </span>
      </div>

      {/* 准确度标签 */}
      <div style={{ fontSize: 14, color: accuracyColor, fontWeight: 600, marginBottom: 16 }}>
        {tuner.active ? accuracyLabel : '点击下方按钮开始'}
      </div>

      {/* 操作按钮 */}
      <div className="row" style={{ gap: 12, marginBottom: 32 }}>
        <button
          className={`btn ${tuner.active ? 'btn-danger' : 'btn-primary'}`}
          onClick={tuner.active ? tuner.stop : tuner.start}
        >
          {tuner.active ? '⏹ 停止' : '🎤 开始调音'}
        </button>
        {tuner.note && tuner.octave !== null && (
          <button
            className="btn"
            onClick={() => tuner.playReference(tuner.note!, tuner.octave!)}
            disabled={tuner.referencePlaying}
          >
            🔔 参考音
          </button>
        )}
      </div>

      {/* 调弦预设 */}
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          {TUNER_PRESETS.map((p) => (
            <button
              key={p.name}
              className={`btn btn-sm ${selectedPreset.name === p.name ? 'btn-primary' : ''}`}
              onClick={() => setSelectedPreset(p)}
            >
              {p.name}
            </button>
          ))}
        </div>
        <PresetButtons
          preset={selectedPreset}
          onPlayString={(note, octave) => tuner.playReference(note, octave)}
        />
      </div>
    </div>
  )
}
