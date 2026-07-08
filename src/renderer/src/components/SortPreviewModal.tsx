/**
 * 曲谱导入排序预览 Modal。
 *
 * 用户选择多个文件后，弹出此 Modal 展示文件列表，
 * 支持拖拽排序调整顺序，确认后按排序结果逐个导入。
 * 图片文件显示缩略图预览。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ImportFilePathInput } from '@shared'
import { api, unwrap } from '../lib/api'
import { toast } from '../stores/toast'
import { Modal, useAsyncAction } from './ui'

/** 从文件路径中提取文件名（兼容 Windows 和 Unix 路径） */
function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** 根据文件扩展名判断图标 */
function fileIcon(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.pdf')) return '📄'
  return '🖼'
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

interface SortPreviewModalProps {
  open: boolean
  filePaths: string[]
  songId: string
  onClose: () => void
  onImported: () => void
}

export function SortPreviewModal({
  open,
  filePaths,
  songId,
  onClose,
  onImported
}: SortPreviewModalProps): React.ReactElement | null {
  const [items, setItems] = useState<string[]>([])
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({})
  const action = useAsyncAction()
  const dragIndexRef = useRef<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // filePaths 变化时同步到 items 并加载缩略图
  useEffect(() => {
    setItems([...filePaths])
    if (filePaths.length > 0) {
      void api.assets.getThumbnails(filePaths).then((result) => {
        if (result.ok) {
          setThumbnails(result.data)
        }
      })
    }
  }, [filePaths])

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

  const handleConfirm = () =>
    action.run(async () => {
      const groupId = items.length > 1 ? crypto.randomUUID() : undefined
      let imported = 0
      const errors: string[] = []
      for (let i = 0; i < items.length; i++) {
        try {
          const input: ImportFilePathInput = {
            songId,
            filePath: items[i]!,
            sourcePolicy: 'user-imported',
            originalFilename: basename(items[i]!),
            groupId,
            groupSort: i
          }
          await unwrap(api.assets.importFilePath(input))
          imported++
        } catch (e) {
          errors.push(`${basename(items[i]!)}：${(e as Error).message}`)
        }
      }
      if (errors.length > 0) {
        toast.error(`导入失败：${errors.join('；')}`)
      }
      if (imported > 0) {
        toast.success(`已导入 ${imported} 个曲谱`)
        onImported()
      }
    })

  return (
    <Modal
      open={open}
      title="排列导入顺序"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={action.loading} onClick={handleConfirm}>
            {action.loading ? '导入中…' : `确认导入（${items.length} 个文件）`}
          </button>
        </>
      }
    >
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        拖拽调整曲谱的排列顺序，此顺序将决定练习翻页的先后。
      </div>
      <div
        style={{
          maxHeight: 440,
          overflowY: 'auto',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        {items.map((path, index) => {
          const name = basename(path)
          const thumb = thumbnails[path]
          return (
            <div
              key={path}
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
              {thumb ? (
                <img
                  src={thumb}
                  alt={name}
                  style={thumbStyle}
                  draggable={false}
                />
              ) : (
                <span style={{ fontSize: 28, flexShrink: 0, width: 48, textAlign: 'center' }}>
                  {fileIcon(name)}
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
                {name}
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
          )
        })}
      </div>
    </Modal>
  )
}
