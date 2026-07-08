/**
 * 图片曲谱查看器，支持全屏、翻页和缩放。
 *
 * 缩放交互：
 * - 鼠标滚轮：以光标位置为中心缩放
 * - 工具栏按钮：＋ / － / 重置
 * - 双击：在适应窗口和 100% 之间切换
 * - 拖拽平移：放大后可拖拽移动图片
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScoreAsset } from '@shared'
import { LOCAL_ASSET_PROTOCOL } from '@shared'

const MIN_SCALE = 0.5
const MAX_SCALE = 5
const SCALE_STEP = 0.25

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
  const dragStartRef = useRef({ x: 0, y: 0, ox: 0, oy: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // 重置缩放和平移
  const resetView = useCallback(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
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

  // 滚轮缩放（以鼠标位置为中心）
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return

    const rect = container.getBoundingClientRect()
    // 鼠标相对于容器的位置
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta))
      if (next === prev) return prev

      // 以鼠标位置为中心缩放：调整偏移使鼠标下的点保持不动
      const ratio = next / prev
      setOffset((o) => ({
        x: mouseX - ratio * (mouseX - o.x),
        y: mouseY - ratio * (mouseY - o.y)
      }))
      return next
    })
  }, [])

  // 双击切换：适应窗口(1x) ↔ 100%(2x)
  const handleDoubleClick = useCallback(() => {
    if (scale === 1) {
      setScale(2)
      setOffset({ x: 0, y: 0 })
    } else {
      setScale(1)
      setOffset({ x: 0, y: 0 })
    }
  }, [scale])

  // 拖拽平移
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (scale <= 1) return
    e.preventDefault()
    setDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y
    }
  }, [scale, offset])

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
  const zoomIn = () => setScale((s) => Math.min(MAX_SCALE, s + SCALE_STEP))
  const zoomOut = () => setScale((s) => Math.max(MIN_SCALE, s - SCALE_STEP))

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
      {/* 工具栏 */}
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
        <button className="btn btn-sm" onClick={zoomOut} disabled={scale <= MIN_SCALE}>
          －
        </button>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text-muted)',
            minWidth: 44,
            textAlign: 'center',
          }}
        >
          {Math.round(scale * 100)}%
        </span>
        <button className="btn btn-sm" onClick={zoomIn} disabled={scale >= MAX_SCALE}>
          ＋
        </button>
        {isZoomed && (
          <button className="btn btn-sm" onClick={resetView}>
            重置
          </button>
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
          cursor: isZoomed ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
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
