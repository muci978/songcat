/**
 * 同组曲谱排序调整 Modal。
 *
 * 对已导入的同组曲谱资源，支持拖拽排序调整翻页顺序。
 * 图片类型资源直接用 songcat-asset:// 协议显示缩略图。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScoreAsset } from '@shared'
import { LOCAL_ASSET_PROTOCOL } from '@shared'
import { api, unwrap } from '../lib/api'
import { toast } from '../stores/toast'
import { Modal, useAsyncAction } from './ui'

/** 类型图标（PDF 等无缩略图类型使用） */
function assetIcon(type: ScoreAsset['type']): string {
  if (type === 'pdf') return '📄'
  if (type === 'image') return '🖼'
  return '🔗'
}

/** 缩略图样式 */
const thumbStyle: React.CSSProperties = {
  width: 48,
  height: 64,
  objectFit: 'contain',
  borderRadius: 4,
  background: 'var(--bg-subtle)',
  flexShrink: 0,
  border: '1px solid var(--border)'
}

interface GroupSortModalProps {
  open: boolean
  groupId: string
  assets: ScoreAsset[]
  onClose: () => void
  onSorted: () => void
}

export function GroupSortModal({
  open,
  groupId,
  assets,
  onClose,
  onSorted
}: GroupSortModalProps): React.ReactElement | null {
  const [items, setItems] = useState<ScoreAsset[]>([])
  const action = useAsyncAction()
  const dragIndexRef = useRef<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // assets 变化时同步到 items
  useEffect(() => {
    setItems([...assets].sort((a, b) => a.groupSort - b.groupSort))
  }, [assets])

  const moveItem = useCallback((from: number, to: number) => {
    if (from === to) return
    setItems((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item!)
      return next
    })
  }, [])

  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    const target = e.currentTarget as HTMLElement
    target.style.opacity = '0.4'
  }, [])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    dragIndexRef.current = null
    setDropIndex(null)
    const target = e.currentTarget as HTMLElement
    target.style.opacity = '1'
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropIndex(index)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from !== null && from !== index) {
      moveItem(from, index)
    }
    dragIndexRef.current = null
    setDropIndex(null)
  }, [moveItem])

  const handleSave = () =>
    action.run(async () => {
      const orderedIds = items.map((a) => a.id)
      await unwrap(api.assets.reorderGroup(groupId, orderedIds))
      toast.success('排序已保存')
      onSorted()
    })

  return (
    <Modal
      open={open}
      title="调整页面顺序"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={action.loading} onClick={handleSave}>
            {action.loading ? '保存中…' : '保存顺序'}
          </button>
        </>
      }
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        拖拽调整曲谱页面的排列顺序，此顺序将决定练习翻页的先后。
      </div>
      <div
        style={{
          maxHeight: 440,
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        {items.map((asset, index) => (
          <div
            key={asset.id}
            draggable
            onDragStart={(e) => handleDragStart(e, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              cursor: 'grab',
              background: dropIndex === index ? 'var(--accent-soft)' : 'transparent',
              borderTop: dropIndex === index ? '2px solid var(--accent)' : 'none',
              transition: 'background 0.12s'
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 24,
                height: 24,
                borderRadius: 4,
                background: 'var(--bg-subtle)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-muted)',
                flexShrink: 0
              }}
            >
              {index + 1}
            </span>
            {asset.type === 'image' && asset.hasLocalFile ? (
              <img
                src={`${LOCAL_ASSET_PROTOCOL}://${asset.id}`}
                alt={asset.title ?? ''}
                style={thumbStyle}
                draggable={false}
              />
            ) : (
              <span style={{ fontSize: 28, flexShrink: 0, width: 48, textAlign: 'center' }}>
                {assetIcon(asset.type)}
              </span>
            )}
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 13
              }}
            >
              {asset.title ?? asset.originalFilename ?? '未命名'}
            </span>
            <span
              style={{
                marginLeft: 'auto',
                color: 'var(--text-faint)',
                fontSize: 12,
                flexShrink: 0
              }}
            >
              ⠿
            </span>
          </div>
        ))}
      </div>
    </Modal>
  )
}
