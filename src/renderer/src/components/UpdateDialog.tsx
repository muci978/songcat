/**
 * 更新提示弹窗。
 * 发现新版本时显示，用户可选择"去下载"（跳转 GitHub Release 页面）或"跳过"。
 */
import { api, unwrap } from '../lib/api'
import { Modal, useAsyncAction } from './ui'
import type { UpdateInfo } from '@shared'

export function UpdateDialog({
  open,
  info,
  onClose
}: {
  open: boolean
  info: UpdateInfo | null
  onClose: () => void
}): React.ReactElement | null {
  const openExternal = useAsyncAction()

  if (!open || !info) return null

  const handleDownload = () =>
    openExternal.run(async () => {
      await unwrap(api.system.openExternal(info.releaseUrl))
      onClose()
    })

  return (
    <Modal
      open={open}
      title="🎉 发现新版本"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            稍后提醒
          </button>
          <button
            className="btn btn-primary"
            disabled={openExternal.loading}
            onClick={handleDownload}
          >
            {openExternal.loading ? '跳转中…' : '去下载'}
          </button>
        </>
      }
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          SongCat {info.latestVersion} 已发布
        </div>
        <div className="faint" style={{ fontSize: 12 }}>
          当前版本 {info.currentVersion}
        </div>
      </div>
      {info.releaseNotes && (
        <pre
          style={{
            maxHeight: 200,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.6,
            padding: '8px 12px',
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            fontFamily: 'inherit'
          }}
        >
          {info.releaseNotes}
        </pre>
      )}
    </Modal>
  )
}
