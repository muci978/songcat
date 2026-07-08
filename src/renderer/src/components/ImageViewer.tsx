/**
 * 图片曲谱查看器，支持全屏和翻页。
 *
 * 复用 GuistudyViewer 的全屏模式模式：
 * CSS fixed + 100vw/100vh + Esc 退出。
 * 全屏模式下底部显示翻页控件。
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ScoreAsset } from '@shared'
import { LOCAL_ASSET_PROTOCOL } from '@shared'

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
  const navigate = useNavigate()

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
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => setFs((v) => !v)}
        style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, opacity: 0.9 }}
      >
        {fs ? '退出全屏 (Esc)' : '⤢ 全屏'}
      </button>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img
          src={src}
          alt={alt ?? '曲谱'}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
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
