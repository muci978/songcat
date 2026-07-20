/**
 * ShareModal — 分享设置弹窗
 * - 左侧：勾选列表（8 个可选项）
 * - 右侧：预览说明
 * - 底部：复制到剪贴板 / 保存为图片
 * - 使用 Canvas 2D API 手动绘制分享卡片（不依赖 DOM-to-image 或 capturePage）
 */
import { useCallback, useEffect, useState } from 'react'
import type { DashboardStats, PracticeGoal } from '@shared'
import { api, unwrap } from '../lib/api'
import { Modal, useAsyncAction } from './ui'
import { toast } from '../stores/toast'
import { drawShareCard, SHARE_ITEMS, DEFAULT_SELECTED, type ShareItemId } from './ShareCard'

interface ShareModalProps {
  open: boolean
  stats: DashboardStats
  goal: PracticeGoal | null
  onClose: () => void
}

export function ShareModal({ open, stats, goal, onClose }: ShareModalProps): React.ReactElement {
  const [selectedItems, setSelectedItems] = useState<Set<ShareItemId>>(DEFAULT_SELECTED)
  const [generating, setGenerating] = useState(false)
  const [appVersion, setAppVersion] = useState('0.0.0')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const { run } = useAsyncAction()

  // 获取应用版本
  useEffect(() => {
    if (open) {
      void (async () => {
        try {
          const v = await unwrap(api.system.appVersion())
          setAppVersion(v)
        } catch { /* ignore */ }
      })()
    }
  }, [open])

  // 重置勾选状态
  useEffect(() => {
    if (open) setSelectedItems(DEFAULT_SELECTED)
  }, [open])

  // 选中项变化时更新预览
  useEffect(() => {
    if (!open) return
    try {
      const url = drawShareCard({ stats, goal, selectedItems, appVersion, pixelRatio: 1 })
      setPreviewUrl(url)
    } catch {
      setPreviewUrl(null)
    }
  }, [open, stats, goal, selectedItems, appVersion])

  const toggleItem = useCallback((id: ShareItemId) => {
    setSelectedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  /** 生成高清图片 */
  const generateImage = useCallback(async (): Promise<string> => {
    return drawShareCard({ stats, goal, selectedItems, appVersion, pixelRatio: 2 })
  }, [stats, goal, selectedItems, appVersion])

  const handleCopy = useCallback(() => {
    run(async () => {
      setGenerating(true)
      try {
        const dataUrl = await generateImage()
        const result = await api.share.copyShareImage(dataUrl)
        if (!result.ok) throw new Error(result.error.message)
        toast.success('已复制到剪贴板')
        onClose()
      } finally {
        setGenerating(false)
      }
    })
  }, [generateImage, run, onClose])

  const handleSave = useCallback(() => {
    run(async () => {
      setGenerating(true)
      try {
        const dataUrl = await generateImage()
        const result = await api.share.saveShareImage(dataUrl)
        if (!result.ok) throw new Error(result.error.message)
        toast.success(`已保存到 ${result.data.path}`)
        onClose()
      } finally {
        setGenerating(false)
      }
    })
  }, [generateImage, run, onClose])

  return (
    <>
      <Modal
        open={open}
        title="分享练习统计"
        onClose={onClose}
        width={820}
        footer={
          open ? (
            <>
              <button className="btn" onClick={onClose} disabled={generating}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleCopy}
                disabled={generating || selectedItems.size === 0}
              >
                {generating ? '生成中...' : '📋 复制到剪贴板'}
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={generating || selectedItems.size === 0}
              >
                {generating ? '生成中...' : '💾 保存为图片'}
              </button>
            </>
          ) : undefined
        }
      >
        <div style={{ display: 'flex', gap: 20 }}>
          {/* 左侧：勾选列表 */}
          <div style={{ flex: '0 0 200px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
              选择分享内容
            </div>
            {SHARE_ITEMS.map((item) => (
              <label
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontSize: 14,
                  color: 'var(--text)',
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedItems.has(item.id)}
                  onChange={() => toggleItem(item.id)}
                  style={{ cursor: 'pointer', width: 16, height: 16, accentColor: 'var(--accent)' }}
                />
                {item.label}
              </label>
            ))}
          </div>

          {/* 右侧：Canvas 预览 */}
          <div style={{
            flex: 1,
            background: 'var(--bg)',
            borderRadius: 12,
            padding: 16,
            overflow: 'auto',
            maxHeight: 500,
            border: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
          }}>
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="分享卡片预览"
                style={{
                  maxWidth: '100%',
                  borderRadius: 8,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
                }}
              />
            ) : (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                勾选内容后预览卡片
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* 生成中 overlay */}
      {generating && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
        }}>
          <div style={{
            background: 'var(--card-bg, #fff)',
            borderRadius: 16,
            padding: '24px 32px',
            fontSize: 15,
            fontWeight: 600,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          }}>
            正在生成图片...
          </div>
        </div>
      )}
    </>
  )
}
