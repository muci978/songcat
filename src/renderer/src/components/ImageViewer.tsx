/**
 * 图片曲谱查看器，支持全屏、翻页和缩放。
 *
 * 全屏机制：纯 CSS position:fixed + 100vw/100vh。
 * 全屏时通过 React Portal 渲染到 body 顶层，避免被祖先 overflow 裁切。
 *
 * 缩放交互（仅全屏时可用）：
 * - 鼠标滚轮：以光标位置为中心平滑缩放（CSS transition 动画）
 * - 工具栏按钮：＋ / －，可输入百分比（如 103、115）
 * - 双击：在适应窗口和 200% 之间切换
 * - 拖拽平移：放大后可拖拽移动图片
 * - 一键重置：恢复适应窗口
 * - Ctrl+滚轮：更精细的缩放步进
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import type { ScoreAsset } from '@shared'
import { LOCAL_ASSET_PROTOCOL } from '@shared'

const MIN_SCALE = 0.25
const MAX_SCALE = 8
const WHEEL_STEP = 0.01
const BTN_STEP = 0.05
const TRANSITION_MS = 120

interface ImageViewerProps {
  assetId: string
  alt?: string
  height?: string | number
  group?: ScoreAsset[]
  currentId?: string
}

export function ImageViewer({
  assetId,
  alt,
  height,
  group,
  currentId
}: ImageViewerProps): React.ReactElement {
  const [fs, setFs] = useState(false)
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [inputVal, setInputVal] = useState('100')
  const [animating, setAnimating] = useState(false)

  // 用 ref 存储实时值，避免 useCallback 闭包过期问题
  const scaleRef = useRef(1)
  const offsetRef = useRef({ x: 0, y: 0 })
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // 同步 ref
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

  // 全屏时阻止背景滚动
  useEffect(() => {
    document.body.style.overflow = fs ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [fs])

  // 清理定时器
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
      // 放大到 200%
      scaleRef.current = 2
      offsetRef.current = { x: 0, y: 0 }
      setScale(2)
      setOffset({ x: 0, y: 0 })
      setInputVal('200')
    } else {
      // 重置
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
    // 缩放或偏移与默认状态不同时允许拖拽（含 <100% 的情况）
    const s = scaleRef.current
    const o = offsetRef.current
    if (s === 1 && o.x === 0 && o.y === 0) return
    e.preventDefault()
    setDragging(true)
    // 拖拽开始时立即关闭动画，避免拖拽时图片"漂移"
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
    const prev = scaleRef.current
    const next = Math.min(MAX_SCALE, prev + BTN_STEP)
    scaleRef.current = next
    setScale(next)
    setInputVal(String(Math.round(next * 100)))
    startAnimation()
  }, [startAnimation])

  const zoomOut = useCallback(() => {
    const prev = scaleRef.current
    const next = Math.max(MIN_SCALE, prev - BTN_STEP)
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

  const containerStyle = height
    ? { height: typeof height === 'number' ? `${height}px` : height, flex: 'none' as const }
    : { flex: 1, minHeight: 0 }

  const src = `${LOCAL_ASSET_PROTOCOL}://${assetId}`

  const showPager = fs && group && group.length > 1 && currentId
  const curIdx = showPager ? group.findIndex((g) => g.id === currentId) : -1
  const songId = showPager ? group[0]?.songId : undefined

  const goPrev = () => {
    if (!showPager || curIdx <= 0) return
    const prev = group![curIdx - 1]
    if (prev && songId) navigate(`/songs/${songId}/practice/${prev.id}`)
  }
  const goNext = () => {
    if (!showPager || curIdx >= group!.length - 1) return
    const next = group![curIdx + 1]
    if (next && songId) navigate(`/songs/${songId}/practice/${next.id}`)
  }

  // Esc 退出 + 翻页快捷键
  useEffect(() => {
    if (!fs) return
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return
      if (e.key === 'Escape') setFs(false)
      if (showPager) {
        if (e.key === 'ArrowLeft') goPrev()
        if (e.key === 'ArrowRight') goNext()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, showPager, curIdx, group, songId])

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

      {/* 图片容器 */}
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
        <img
          src={src}
          alt={alt ?? '曲谱'}
          draggable={false}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            maxWidth: !isZoomed ? '100%' : 'none',
            maxHeight: !isZoomed ? '100%' : 'none',
            objectFit: 'contain',
            transition: animating && !dragging
              ? `transform ${TRANSITION_MS}ms cubic-bezier(0.22, 0.61, 0.36, 1)`
              : 'none',
            userSelect: 'none',
            willChange: 'transform',
          }}
        />
      </div>

      {/* 翻页控件 */}
      {showPager && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '8px 0', background: 'rgba(255,255,255,0.9)', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-sm" disabled={curIdx <= 0} onClick={goPrev}>← 上一页</button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{curIdx + 1} / {group!.length}</span>
          <button className="btn btn-sm" disabled={curIdx >= group!.length - 1} onClick={goNext}>下一页 →</button>
        </div>
      )}
    </div>
  )

  // 全屏时 Portal 到 body，避免被祖先 overflow 裁切
  return fs ? createPortal(viewer, document.body) : viewer
}
