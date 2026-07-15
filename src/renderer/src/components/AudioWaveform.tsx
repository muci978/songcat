import { useEffect, useRef } from 'react'

interface AudioWaveformProps {
  stream: MediaStream
}

/**
 * 实时录音波形可视化组件。
 * 接收 MediaStream，使用 AudioContext + AnalyserNode 绘制实时波形。
 */
export function AudioWaveform({ stream }: AudioWaveformProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const audioCtx = new AudioContext()
    ctxRef.current = audioCtx
    const source = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const canvasCtx = canvas.getContext('2d')!

    const draw = () => {
      animRef.current = requestAnimationFrame(draw)
      analyser.getByteTimeDomainData(dataArray)

      const width = canvas.width
      const height = canvas.height

      canvasCtx.fillStyle = 'transparent'
      canvasCtx.clearRect(0, 0, width, height)

      // 使用 accent 颜色
      const style = getComputedStyle(document.documentElement)
      const accent = style.getPropertyValue('--accent').trim() || '#f97316'

      canvasCtx.lineWidth = 2
      canvasCtx.strokeStyle = accent
      canvasCtx.beginPath()

      const sliceWidth = width / bufferLength
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0
        const y = (v * height) / 2
        if (i === 0) {
          canvasCtx.moveTo(x, y)
        } else {
          canvasCtx.lineTo(x, y)
        }
        x += sliceWidth
      }

      canvasCtx.lineTo(width, height / 2)
      canvasCtx.stroke()
    }

    draw()

    return () => {
      cancelAnimationFrame(animRef.current)
      source.disconnect()
      audioCtx.close()
      ctxRef.current = null
    }
  }, [stream])

  return (
    <canvas
      ref={canvasRef}
      width={340}
      height={48}
      style={{ width: '100%', height: 48, borderRadius: 8, background: 'var(--bg-subtle)' }}
    />
  )
}
