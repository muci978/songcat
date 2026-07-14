/**
 * PDF 曲谱查看器，支持全屏和缩放。
 *
 * 全屏机制：纯 CSS position:fixed + 100vw/100vh。
 * 全屏时通过 React Portal 渲染到 body 顶层，避免被祖先 overflow 裁切。
 *
 * 缩放交互（仅全屏时可用）：
 * - 鼠标滚轮：以光标位置为中心平滑缩放（CSS transition 动画）
 * - 工具栏按钮：＋ / －，可输入百分比
 * - 双击：在适应窗口和 150% 之间切换
 * - 拖拽平移：放大后可拖拽移动
 * - 一键重置：恢复适应窗口
 * - Ctrl+滚轮：更精细的缩放步进
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LOCAL_ASSET_PROTOCOL } from '@shared'

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const WHEEL_STEP = 0.01
const BTN_STEP = 0.05
const TRANSITION_MS = 120

interface PdfViewerProps {
  assetId: string
  title?: string
  height?: string | number
}

export function PdfViewer({
  assetId,
  title,
  height
}: PdfViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [inputVal, setInputVal] = useState('100')
  const [animating, setAnimating] = useState(false)

  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { scaleRef.current = scale }, [scale])
  useEffect(() => { offsetRef.current = offset }, [offset])

  const clearAnimTimer = useCallback(() => {
    if (animTimerRef.current) {
      clearTimeout(animTimerRef.current)
      animTimerRef.current = null
    }
  }, [])

  const startAnimation = useCallback(() => {
    setAnimating(true)
    clearAnimTimer()
    animTimerRef.current = setTimeout(() => setAnimating(false), TRANSITION_MS)
  }, [clearAnimTimer])

  const resetView = useCallback(() => {
    scaleRef.current = 1
    offsetRef.current = { x: 0, y: 0 }
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setInputVal('100')
    setAnimating(false)
    clearAnimTimer()
  }, [clearAnimTimer])

  useEffect(() => { resetView() }, [assetId, resetView])
  useEffect(() => { if (!fs) resetView() }, [fs, resetView])

  useEffect(() => {
    document.body.style.overflow = fs ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [fs])

  useEffect(() => clearAnimTimer, [clearAnimTimer])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!fs) return
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const step = WHEEL_STEP
    const delta = e.deltaY < 0 ? step : -step

    const prev = scaleRef.current
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta))
    if (next === prev) return

    const ratio = next / prev
    const curOffset = offsetRef.current
    const newOffset = {
      x: mouseX - ratio * (mouseX - curOffset.x),
      y: mouseY - ratio * (mouseY - curOffset.y)
    }

    scaleRef.current = next
    offsetRef.current = newOffset
    setScale(next)
    setOffset(newOffset)
    setInputVal(String(Math.round(next * 100)))
    startAnimation()
  }, [fs, startAnimation])

  const handleDoubleClick = useCallback(() => {
    if (!fs) return
    if (scaleRef.current <= 1.01) {
      scaleRef.current = 1.5
      offsetRef.current = { x: 0, y: 0 }
      setScale(1.5)
      setOffset({ x: 0, y: 0 })
      setInputVal('150')
    } else {
      scaleRef.current = 1
      offsetRef.current = { x: 0, y: 0 }
      setScale(1)
      setOffset({ x: 0, y: 0 })
      setInputVal('100')
    }
    startAnimation()
  }, [fs, startAnimation])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!fs) return
    const s = scaleRef.current
    const o = offsetRef.current
    if (s === 1 && o.x === 0 && o.y === 0) return
    e.preventDefault()
    setDragging(true)
    setAnimating(false)
    clearAnimTimer()
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offsetRef.current.x,
      oy: offsetRef.current.y
    }
  }, [fs, clearAnimTimer])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const newOffset = {
      x: dragStartRef.current.ox + e.clientX - dragStartRef.current.x,
      y: dragStartRef.current.oy + e.clientY - dragStartRef.current.y
    }
    offsetRef.current = newOffset
    setOffset(newOffset)
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    if (!dragging) return
    setDragging(false)
  }, [dragging])

  const zoomIn = useCallback(() => {
    const next = Math.min(MAX_SCALE, scaleRef.current + BTN_STEP)
    scaleRef.current = next
    setScale(next)
    setInputVal(String(Math.round(next * 100)))
    startAnimation()
  }, [startAnimation])

  const zoomOut = useCallback(() => {
    const next = Math.max(MIN_SCALE, scaleRef.current - BTN_STEP)
    scaleRef.current = next
    setScale(next)
    setInputVal(String(Math.round(next * 100)))
    startAnimation()
  }, [startAnimation])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputVal(val)
    const num = parseInt(val, 10)
    if (!isNaN(num) && num >= Math.round(MIN_SCALE * 100) && num <= Math.round(MAX_SCALE * 100)) {
      const s = num / 100
      scaleRef.current = s
      offsetRef.current = { x: 0, y: 0 }
      setScale(s)
      setOffset({ x: 0, y: 0 })
      startAnimation()
    }
  }

  const handleInputBlur = () => {
    const num = parseInt(inputVal, 10)
    let s: number
    if (isNaN(num) || num < Math.round(MIN_SCALE * 100)) s = MIN_SCALE
    else if (num > Math.round(MAX_SCALE * 100)) s = MAX_SCALE
    else s = num / 100
    scaleRef.current = s
    offsetRef.current = { x: 0, y: 0 }
    setScale(s)
    setOffset({ x: 0, y: 0 })
    setInputVal(String(Math.round(s * 100)))
    startAnimation()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') inputRef.current?.blur()
  }

  // Esc 退出
  useEffect(() => {
    if (!fs) return
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return
      if (e.key === 'Escape') setFs(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fs])

  const containerStyle = height
    ? { height: typeof height === 'number' ? `${height}px` : height, flex: 'none' as const }
    : { flex: 1, minHeight: 0 }

  const src = `${LOCAL_ASSET_PROTOCOL}://${assetId}`
  const isZoomed = scale !== 1 || offset.x !== 0 || offset.y !== 0

  const viewer = (
    <div
      style={{
        position: fs ? 'fixed' : 'relative',
        zIndex: fs ? 9999 : 'auto',
        width: fs ? '100vw' : '100%',
        height: fs ? '100vh' : undefined,
        left: fs ? 0 : undefined,
        top: fs ? 0 : undefined,
        right: fs ? 0 : undefined,
        bottom: fs ? 0 : undefined,
        background: '#fff',
        borderRadius: fs ? 0 : 8,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...(fs ? {} : containerStyle),
      }}
    >
      {/* 工具栏 */}
      <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 4, alignItems: 'center', opacity: 0.9 }}>
        {fs && (
          <>
            <button className="btn btn-sm" onClick={zoomOut} disabled={scale <= MIN_SCALE}>－</button>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              style={{ width: 52, padding: '2px 4px', border: '1px solid var(--border-strong)', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text)', fontSize: 12, fontWeight: 600, textAlign: 'center', outline: 'none' }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>%</span>
            <button className="btn btn-sm" onClick={zoomIn} disabled={scale >= MAX_SCALE}>＋</button>
            <button className="btn btn-sm" onClick={resetView} title="重置为适应窗口">↺</button>
          </>
        )}
        <button className="btn btn-sm" onClick={() => setFs((v) => !v)}>
          {fs ? '退出全屏' : '⤢ 全屏'}
        </button>
      </div>

      {/* PDF 容器 */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          cursor: fs && isZoomed ? (dragging ? 'grabbing' : 'grab') : (fs ? 'zoom-in' : 'default'),
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: '100%',
            height: '100%',
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            transition: animating && !dragging
              ? `transform ${TRANSITION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
              : 'none',
            willChange: 'transform',
          }}
        >
          <iframe
            title={title ?? '曲谱'}
            src={src}
            style={{
              width: '100%',
              height: '100%',
              border: 0,
              background: '#fff',
              pointerEvents: dragging ? 'none' : 'auto',
            }}
          />
        </div>
      </div>
    </div>
  )

  return fs ? createPortal(viewer, document.body) : viewer
}
