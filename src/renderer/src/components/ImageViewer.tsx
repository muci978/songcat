/**
 * 图片曲谱查看器，支持全屏、翻页和缩放。
 *
 * 缩放交互（仅全屏时可用）：
 * - 鼠标滚轮：以光标位置为中心缩放（低灵敏度）
 * - 工具栏按钮：＋ / －，可输入百分比（如 103、115）
 * - 双击：在适应窗口和 100% 之间切换
 * - 拖拽平移：放大后可拖拽移动图片
 * - 一键重置：恢复适应窗口
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScoreAsset } from '@shared'
import { LOCAL_ASSET_PROTOCOL } from '@shared'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
/** 滚轮步进（低灵敏度） */
const WHEEL_STEP = 0.05
/** 按钮步进 */
const BTN_STEP = 0.1

interface ImageViewerProps {
  assetId: string
  alt?: string
  height?: string | number
  /** 同组曲谱列表（用于全屏翻页） */
  group?: ScoreAsset[]
  /** 当前曲谱 ID（用于翻页定位） */
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
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // 重置缩放和平移
  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setInputVal('100')
  }, [])

  // 切换曲谱时重置
  useEffect(() => {
    resetView()
  }, [assetId, resetView])

  // 退出全屏时重置
  useEffect(() => {
    if (!fs) resetView()
  }, [fs, resetView])

  // 全屏 Esc 退出
  useEffect(() => {
    if (!fs) return
    const onKey = (e: KeyboardEvent) => {
      // 输入框聚焦时不拦截 Esc
      if (document.activeElement === inputRef.current) return
      if (e.key === 'Escape') setFs(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fs])

  // 全屏时阻止背景滚动
  useEffect(() => {
    if (fs) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [fs])

  // 设置缩放并同步输入框
  const applyScale = useCallback((next: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
    setScale(clamped)
    setInputVal(String(Math.round(clamped * 100)))
    return clamped
  }, [])

  // 滚轮缩放（以鼠标位置为中心，仅全屏）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!fs) return
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const delta = e.deltaY < 0 ? WHEEL_STEP : -WHEEL_STEP
    setScale((prev) => {
      const next = applyScale(prev + delta)
      if (next === prev) return prev

      // 以鼠标位置为中心缩放
      const ratio = next / prev
      setOffset((o) => ({
        x: mouseX - ratio * (mouseX - o.x),
        y: mouseY - ratio * (mouseY - o.y)
      }))
      return next
    })
  }, [fs, applyScale])

  // 双击切换：适应窗口(1x) ↔ 2x（仅全屏）
  const handleDoubleClick = useCallback(() => {
    if (!fs) return
    if (scale === 1) {
      applyScale(2)
      setOffset({ x: 0, y: 0 })
    } else {
      resetView()
    }
  }, [fs, scale, applyScale, resetView])

  // 拖拽平移（仅全屏 + 放大时）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!fs || scale <= 1) return
    e.preventDefault()
    setDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y
    }
  }, [fs, scale, offset])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    setOffset({
      x: dragStartRef.current.ox + dx,
      y: dragStartRef.current.oy + dy
    })
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
  }, [])

  // 缩放按钮
  const zoomIn = () => applyScale(scale + BTN_STEP)
  const zoomOut = () => applyScale(scale - BTN_STEP)

  // 输入框处理
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setInputVal(val)
    // 仅在输入纯数字时实时应用
    const num = parseInt(val, 10)
    if (!isNaN(num) && num >= Math.round(MIN_SCALE * 100) && num <= Math.round(MAX_SCALE * 100)) {
      setScale(num / 100)
      setOffset({ x: 0, y: 0 })
    }
  }

  const handleInputBlur = () => {
    const num = parseInt(inputVal, 10)
    if (isNaN(num) || num < Math.round(MIN_SCALE * 100)) {
      applyScale(MIN_SCALE)
    } else if (num > Math.round(MAX_SCALE * 100)) {
      applyScale(MAX_SCALE)
    } else {
      applyScale(num / 100)
      setOffset((prev) => (prev.x !== 0 || prev.y !== 0) ? { x: 0, y: 0 } : prev)
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur()
    }
  }

  const containerStyle = height
    ? { height: typeof height === 'number' ? `${height}px` : height, flex: 'none' as const }
    : { flex: 1, minHeight: 0 }

  const src = `${LOCAL_ASSET_PROTOCOL}://${assetId}`

  // 翻页逻辑
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

  // 全屏时左右箭头翻页
  useEffect(() => {
    if (!fs || !showPager) return
    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fs, showPager, curIdx, group, songId])

  const isZoomed = scale > 1

  return (
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
      {/* 工具栏：全屏时显示缩放控件 */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          display: 'flex',
          gap: 4,
          alignItems: 'center',
          opacity: 0.9,
        }}
      >
        {fs && (
          <>
            <button className="btn btn-sm" onClick={zoomOut} disabled={scale <= MIN_SCALE}>
              －
            </button>
            <input
              ref={inputRef}
              type="text"
              value={inputVal}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              style={{
                width: 52,
                padding: '2px 4px',
                border: '1px solid var(--border-strong)',
                borderRadius: 4,
                background: 'var(--bg-elevated)',
                color: 'var(--text)',
                fontSize: 12,
                fontWeight: 600,
                textAlign: 'center',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 2 }}>%</span>
            <button className="btn btn-sm" onClick={zoomIn} disabled={scale >= MAX_SCALE}>
              ＋
            </button>
            <button className="btn btn-sm" onClick={resetView} title="重置为适应窗口">
              ↺
            </button>
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
            maxWidth: scale === 1 ? '100%' : 'none',
            maxHeight: scale === 1 ? '100%' : 'none',
            objectFit: 'contain',
            transition: dragging ? 'none' : 'transform 0.15s ease',
            userSelect: 'none',
          }}
        />
      </div>

      {/* 全屏翻页控件 */}
      {showPager && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '8px 0',
            background: 'rgba(255,255,255,0.9)',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            className="btn btn-sm"
            disabled={curIdx <= 0}
            onClick={goPrev}
          >
            ← 上一页
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {curIdx + 1} / {group!.length}
          </span>
          <button
            className="btn btn-sm"
            disabled={curIdx >= group!.length - 1}
            onClick={goNext}
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  )
}
