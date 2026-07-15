/** 共享 UI 基础组件（毛玻璃风格 v2） */
import React, { useState } from 'react'
import type { Difficulty, SongStatus } from '@shared'
import { toast } from '../stores/toast'

export function Spinner(): React.ReactElement {
  return <span className="spinner" />
}

export function Empty({
  children,
  icon = '🎵'
}: {
  children: React.ReactNode
  icon?: string
}): React.ReactElement {
  return (
    <div className="empty">
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      {children}
    </div>
  )
}

export function Card({
  title,
  actions,
  children,
  className,
  style
}: {
  title?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}): React.ReactElement {
  return (
    <section className={`card ${className ?? ''}`} style={style}>
      {(title || actions) && (
        <div className="row-between" style={{ marginBottom: title ? 16 : 0 }}>
          {title && <div className="card-title">{title}</div>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 560
}: {
  open: boolean
  title?: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
}): React.ReactElement | null {
  if (!open) return null
  return (
    <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: width }} onMouseDown={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              ✕
            </button>
          </div>
        )}
        {children}
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<SongStatus, string> = {
  'to-learn': '想学',
  learning: '学习中',
  learned: '已学会'
}

export function StatusBadge({ status }: { status: SongStatus }): React.ReactElement {
  return <span className={`badge badge-status-${status}`}>{STATUS_LABEL[status]}</span>
}

/** 难度星级：可点击设置；点已选的星可清空 */
export function Stars({
  value,
  onChange,
  readonly
}: {
  value: Difficulty | null
  onChange?: (v: Difficulty | null) => void
  readonly?: boolean
}): React.ReactElement {
  const cls = readonly ? 'stars' : 'stars'
  return (
    <span className={cls}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`star ${value && n <= value ? 'on' : ''}`}
          onClick={() => {
            if (!onChange) return
            onChange(value === n ? null : (n as Difficulty))
          }}
          style={{ cursor: onChange ? 'pointer' : 'default' }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmText = '确认',
  danger,
  onConfirm,
  onClose
}: {
  open: boolean
  title: string
  message: React.ReactNode
  confirmText?: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}): React.ReactElement {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => {
              onConfirm()
              onClose()
            }}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div style={{ color: 'var(--text-muted)' }}>{message}</div>
    </Modal>
  )
}

/** hook：异步动作带 loading + 错误 toast */
export function useAsyncAction(): {
  loading: boolean
  run: (fn: () => Promise<void>, successMsg?: string) => Promise<void>
} {
  const [loading, setLoading] = useState(false)
  return {
    loading,
    async run(fn, successMsg) {
      setLoading(true)
      try {
        await fn()
        if (successMsg) toast.success(successMsg)
      } catch (e) {
        toast.error((e as Error).message || '操作失败')
      } finally {
        setLoading(false)
      }
    }
  }
}
