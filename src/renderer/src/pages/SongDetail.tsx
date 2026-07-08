/** 歌曲详情页 SongDetail（设计 §7.1 字段、§5.1/§5.2、§13 导航） */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type {
  Difficulty,
  ScoreAsset,
  SongDetail as SongDetailModel,
  SongStatus
} from '@shared'
import { LOCAL_RECORDING_PROTOCOL } from '@shared'
import { api, unwrap } from '../lib/api'
import { formatDate, formatDateTime, formatSeconds } from '../lib/format'
import { toast } from '../stores/toast'
import {
  Card,
  ConfirmDialog,
  Empty,
  Modal,
  Spinner,
  Stars,
  StatusBadge,
  useAsyncAction
} from '../components/ui'
import { SortPreviewModal } from '../components/SortPreviewModal'
import { GroupSortModal } from '../components/GroupSortModal'

const STOP_REASON_LABEL: Record<string, string> = {
  manual: '手动结束',
  'leave-score-view': '离开曲谱',
  'switch-song': '切换歌曲',
  'app-close': '关闭应用',
  recovery: '异常恢复'
}

function assetIcon(type: ScoreAsset['type']): string {
  if (type === 'pdf') return '📄'
  if (type === 'image') return '🖼'
  return '🔗'
}

function fileSizeLabel(bytes: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SongDetail(): React.ReactElement {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<SongDetailModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showEdit, setShowEdit] = useState(false)
  const [confirmDeleteSong, setConfirmDeleteSong] = useState(false)
  const [addLinkOpen, setAddLinkOpen] = useState(false)
  const [removeAssetId, setRemoveAssetId] = useState<string | null>(null)
  const [confirmRemoveRecording, setConfirmRemoveRecording] = useState(false)

  const songId = id ?? ''

  const reload = useCallback(async () => {
    if (!songId) {
      setError('缺少歌曲 ID')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const d = await unwrap(api.library.getSong(songId))
      setDetail(d)
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [songId])

  useEffect(() => {
    void reload()
  }, [reload])

  const deleteAction = useAsyncAction()

  const onDeleteSong = () =>
    deleteAction.run(async () => {
      await unwrap(api.library.delete(songId))
      toast.success('已删除')
      navigate('/library')
    })

  if (loading && !detail) return <Spinner />
  if (error || !detail) {
    return <Empty icon="⚠️">无法加载歌曲详情：{error ?? '未知错误'}</Empty>
  }

  const recordingUrl = `${LOCAL_RECORDING_PROTOCOL}://${songId}`
  const totalPractice = detail.totalPracticeSeconds ?? 0

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ marginBottom: 6 }}>
            <Link to="/library" className="btn btn-ghost btn-sm">
              ← 返回曲库
            </Link>
          </div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {detail.title}
            {detail.isFavorite && <span className="badge badge-fav">★</span>}
            <StatusBadge status={detail.status} />
          </h1>
          <div className="muted" style={{ fontSize: 13 }}>
            {detail.artist ?? '未知艺人'}
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => setShowEdit(true)}>
            编辑信息
          </button>
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/songs/${songId}/practice`)}
          >
            进入练习
          </button>
          <button className="btn btn-danger" onClick={() => setConfirmDeleteSong(true)}>
            删除
          </button>
        </div>
      </div>

      {/* 概要 Card */}
      <Card title="概要" style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 24 }}>
          <div className="stat">
            <div className="stat-label">学习状态</div>
            <div className="stat-value">
              <StatusBadge status={detail.status} />
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">收藏</div>
            <div className="stat-value">{detail.isFavorite ? '★' : '☆'}</div>
          </div>
          <div className="stat">
            <div className="stat-label">难度</div>
            <div className="stat-value">
              <Stars value={detail.difficulty} readonly />
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">添加日期</div>
            <div className="stat-value" style={{ fontSize: 16 }}>
              {formatDate(detail.dateAdded)}
            </div>
          </div>
          <div className="stat">
            <div className="stat-label">累计练习</div>
            <div className="stat-value" style={{ fontSize: 16 }}>
              {totalPractice > 0 ? formatSeconds(totalPractice) : '—'}
            </div>
          </div>
          {detail.originalAudioUrl && (
            <div className="stat">
              <div className="stat-label">原曲链接</div>
              <div className="stat-value" style={{ fontSize: 14 }}>
                <button
                  className="btn btn-sm"
                  onClick={() =>
                    void unwrap(api.system.openExternal(detail.originalAudioUrl!)).catch((e) =>
                      toast.error((e as Error).message)
                    )
                  }
                >
                  ▶ 打开原曲
                </button>
              </div>
            </div>
          )}
        </div>
        {detail.notes && (
          <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
            <div className="label">备注</div>
            <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>
              {detail.notes}
            </div>
          </div>
        )}
      </Card>

      {/* 曲谱资源 Card */}
      <Card
        title={`曲谱资源（${detail.scores.length}）`}
        style={{ marginBottom: 16 }}
        actions={
          <div className="actions">
            <ImportButton songId={songId} onDone={() => void reload()} />
            <button className="btn btn-sm" onClick={() => setAddLinkOpen(true)}>
              添加链接
            </button>
          </div>
        }
      >
        {detail.scores.length === 0 ? (
          <Empty icon="📄">还没有曲谱资源。点"导入文件"或"添加链接"开始。</Empty>
        ) : (
          detail.scores.map((a) => (
            <AssetRow
              key={a.id}
              asset={a}
              allAssets={detail.scores}
              songId={songId}
              onChanged={() => void reload()}
              onRemove={(aid) => setRemoveAssetId(aid)}
            />
          ))
        )}
      </Card>

      {/* 来源链接 Card */}
      <Card title={`来源链接（${detail.sourceLinks.length}）`} style={{ marginBottom: 16 }}>
        {detail.sourceLinks.length === 0 ? (
          <Empty icon="🔗">没有来源链接</Empty>
        ) : (
          detail.sourceLinks.map((l) => (
            <div key={l.id} className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {l.title ?? l.url}
                  <span className="tag" style={{ marginLeft: 8 }}>
                    {l.kind}
                  </span>
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {l.sourceName ? `${l.sourceName} · ` : ''}
                  {l.url}
                </div>
              </div>
              <button
                className="btn btn-sm"
                onClick={() =>
                  void unwrap(api.system.openExternal(l.url)).catch((e) =>
                    toast.error((e as Error).message)
                  )
                }
              >
                打开
              </button>
            </div>
          ))
        )}
      </Card>

      {/* 录音 Card */}
      <Card title="录音" style={{ marginBottom: 16 }}>
        {detail.recording ? (
          <div>
            <audio controls src={recordingUrl} style={{ width: '100%' }} />
            <div className="row-between" style={{ marginTop: 10 }}>
              <div className="faint" style={{ fontSize: 12 }}>
                录制于 {formatDateTime(detail.recording.recordedAt)}
                {detail.recording.durationSeconds
                  ? ` · 时长 ${formatSeconds(detail.recording.durationSeconds)}`
                  : ''}
                {detail.recording.fileSize
                  ? ` · ${fileSizeLabel(detail.recording.fileSize)}`
                  : ''}
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setConfirmRemoveRecording(true)}
              >
                删除录音
              </button>
            </div>
          </div>
        ) : (
          <Empty icon="🎙">
            还没有录音。
            <button
              className="btn btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => navigate(`/songs/${songId}/practice`)}
            >
              去练习页录制
            </button>
          </Empty>
        )}
      </Card>

      {/* 最近练习 Card */}
      <Card title="最近练习">
        {detail.recentSessions.length === 0 ? (
          <Empty icon="📈">还没有练习记录</Empty>
        ) : (
          detail.recentSessions.map((s) => (
            <div key={s.id} className="list-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{formatDateTime(s.startedAt)}</div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {s.endedAt ? `结束于 ${formatDateTime(s.endedAt)}` : '进行中'}
                </div>
              </div>
              <div className="faint" style={{ fontSize: 12 }}>
                {formatSeconds(s.durationSeconds)}
              </div>
              <div className="faint" style={{ fontSize: 12 }}>
                {s.stopReason ? STOP_REASON_LABEL[s.stopReason] ?? s.stopReason : '—'}
              </div>
            </div>
          ))
        )}
      </Card>

      {/* 编辑信息 Modal */}
      <EditSongModal
        open={showEdit}
        detail={detail}
        onClose={() => setShowEdit(false)}
        onSaved={() => {
          setShowEdit(false)
          void reload()
        }}
      />

      {/* 添加链接 Modal */}
      <AddScoreLinkModal
        open={addLinkOpen}
        songId={songId}
        onClose={() => setAddLinkOpen(false)}
        onAdded={() => {
          setAddLinkOpen(false)
          void reload()
        }}
      />

      {/* 删除歌曲确认 */}
      <ConfirmDialog
        open={confirmDeleteSong}
        title="删除歌曲"
        message={`确定删除「${detail.title}」？该歌曲的所有曲谱、录音与练习记录将被一并删除，且无法恢复。`}
        confirmText="删除"
        danger
        onConfirm={() => void onDeleteSong()}
        onClose={() => setConfirmDeleteSong(false)}
      />

      {/* 删除曲谱资源确认 */}
      <ConfirmDialog
        open={removeAssetId !== null}
        title="删除曲谱资源"
        message="确定删除该曲谱资源？本地文件也将被移除。"
        confirmText="删除"
        danger
        onConfirm={() => {
          if (removeAssetId) void removeAsset(removeAssetId, reload)
          setRemoveAssetId(null)
        }}
        onClose={() => setRemoveAssetId(null)}
      />

      {/* 删除录音确认 */}
      <ConfirmDialog
        open={confirmRemoveRecording}
        title="删除录音"
        message="确定删除录音？该操作不可恢复。"
        confirmText="删除"
        danger
        onConfirm={() => {
          void removeRecording(songId, reload)
          setConfirmRemoveRecording(false)
        }}
        onClose={() => setConfirmRemoveRecording(false)}
      />
    </div>
  )
}

async function removeAsset(
  assetId: string,
  reload: () => Promise<void>
): Promise<void> {
  try {
    await unwrap(api.assets.remove(assetId))
    toast.success('已删除')
    await reload()
  } catch (e) {
    toast.error((e as Error).message)
  }
}

async function removeRecording(
  songId: string,
  reload: () => Promise<void>
): Promise<void> {
  try {
    await unwrap(api.recording.remove(songId))
    toast.success('已删除录音')
    await reload()
  } catch (e) {
    toast.error((e as Error).message)
  }
}

/** 曲谱资源行 */
function AssetRow({
  asset,
  allAssets,
  songId,
  onChanged,
  onRemove
}: {
  asset: ScoreAsset
  allAssets: ScoreAsset[]
  songId: string
  onChanged: () => void
  onRemove: (assetId: string) => void
}): React.ReactElement {
  const setPrimaryAction = useAsyncAction()
  const openFolderAction = useAsyncAction()
  const [sortOpen, setSortOpen] = useState(false)

  const group = asset.groupId ? allAssets.filter((a) => a.groupId === asset.groupId).sort((a, b) => a.groupSort - b.groupSort) : [asset]
  const groupIndex = group.findIndex((a) => a.id === asset.id)

  const onSetPrimary = () =>
    setPrimaryAction.run(async () => {
      await unwrap(api.assets.setPrimary(asset.id))
      await onChanged()
    }, '已设为主资源')

  const onOpenFolder = () =>
    openFolderAction.run(async () => {
      await unwrap(api.assets.openLocalFolder(asset.id))
    })

  return (
    <div className="list-row" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
      <div style={{ fontSize: 20 }}>{assetIcon(asset.type)}</div>
      <div>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}>
          <strong>{asset.title ?? asset.originalFilename ?? '未命名'}</strong>
          {asset.isPrimary && <span className="badge">主资源</span>}
          <span className="tag">{asset.type}</span>
          {group.length > 1 && (
            <span className="tag">
              第 {groupIndex + 1}/{group.length} 页
            </span>
          )}
        </div>
        <div className="faint" style={{ fontSize: 12 }}>
          {asset.sourceName ? `${asset.sourceName} · ` : ''}
          {fileSizeLabel(asset.fileSize)}
          {asset.hasLocalFile ? '' : ' · 无本地文件'}
        </div>
      </div>
      <div className="actions">
        {(asset.type === 'pdf' || asset.type === 'image' || asset.source === 'guistudy') && (
          <Link className="btn btn-sm" to={`/songs/${songId}/practice/${asset.id}`}>
            查看
          </Link>
        )}
        {asset.sourceUrl && asset.type === 'link' && asset.source !== 'guistudy' && (
          <button
            className="btn btn-sm"
            onClick={() =>
              void unwrap(api.system.openExternal(asset.sourceUrl!)).catch((e) =>
                toast.error((e as Error).message)
              )
            }
          >
            打开
          </button>
        )}
        {!asset.isPrimary && (
          <button
            className="btn btn-sm"
            disabled={setPrimaryAction.loading}
            onClick={onSetPrimary}
          >
            设为主
          </button>
        )}
        {asset.hasLocalFile && (
          <button
            className="btn btn-sm"
            disabled={openFolderAction.loading}
            onClick={onOpenFolder}
          >
            打开位置
          </button>
        )}
        {group.length > 1 && asset.groupId && (
          <button className="btn btn-sm" onClick={() => setSortOpen(true)}>
            排序
          </button>
        )}
        <button className="btn btn-danger btn-sm" onClick={() => onRemove(asset.id)}>
          删除
        </button>
      </div>
      {sortOpen && asset.groupId && (
        <GroupSortModal
          open={sortOpen}
          groupId={asset.groupId}
          assets={group}
          onClose={() => setSortOpen(false)}
          onSorted={() => {
            setSortOpen(false)
            void onChanged()
          }}
        />
      )}
    </div>
  )
}

/** 导入文件按钮 */
function ImportButton({
  songId,
  onDone
}: {
  songId: string
  onDone: () => void
}): React.ReactElement {
  const action = useAsyncAction()
  const [sortOpen, setSortOpen] = useState(false)
  const [pendingPaths, setPendingPaths] = useState<string[]>([])

  const handleClick = () =>
    action.run(async () => {
      const paths = await unwrap(api.assets.selectFiles())
      if (paths.length === 0) return
      if (paths.length === 1) {
        // 单文件直接导入，无需排序
        await unwrap(
          api.assets.importFilePath({
            songId,
            filePath: paths[0]!,
            sourcePolicy: 'user-imported'
          })
        )
        toast.success('已导入 1 个曲谱')
        onDone()
      } else {
        // 多文件弹出排序 Modal
        setPendingPaths(paths)
        setSortOpen(true)
      }
    })

  return (
    <>
      <button
        className="btn btn-sm btn-primary"
        disabled={action.loading}
        onClick={handleClick}
      >
        {action.loading ? '选择中…' : '导入文件'}
      </button>
      <SortPreviewModal
        open={sortOpen}
        filePaths={pendingPaths}
        songId={songId}
        onClose={() => setSortOpen(false)}
        onImported={() => {
          setSortOpen(false)
          onDone()
        }}
      />
    </>
  )
}

/** 编辑歌曲 Modal */
function EditSongModal({
  open,
  detail,
  onClose,
  onSaved
}: {
  open: boolean
  detail: SongDetailModel
  onClose: () => void
  onSaved: () => void
}): React.ReactElement {
  const [title, setTitle] = useState(detail.title)
  const [artist, setArtist] = useState(detail.artist ?? '')
  const [status, setStatus] = useState<SongStatus>(detail.status)
  const [isFavorite, setIsFavorite] = useState(detail.isFavorite)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(detail.difficulty)
  const [notes, setNotes] = useState(detail.notes ?? '')
  const [audio, setAudio] = useState(detail.originalAudioUrl ?? '')
  const action = useAsyncAction()

  // 每次 Modal 重新打开时，把表单重置为最新的 detail
  useEffect(() => {
    if (open) {
      setTitle(detail.title)
      setArtist(detail.artist ?? '')
      setStatus(detail.status)
      setIsFavorite(detail.isFavorite)
      setDifficulty(detail.difficulty)
      setNotes(detail.notes ?? '')
      setAudio(detail.originalAudioUrl ?? '')
    }
  }, [
    open,
    detail.title,
    detail.artist,
    detail.status,
    detail.isFavorite,
    detail.difficulty,
    detail.notes,
    detail.originalAudioUrl
  ])

  const submit = () =>
    action.run(async () => {
      if (!title.trim()) throw new Error('请输入歌名')
      await unwrap(
        api.library.update(detail.id, {
          title: title.trim(),
          artist: artist.trim() || null,
          status,
          isFavorite,
          difficulty,
          notes: notes.trim() || null,
          originalAudioUrl: audio.trim() || null
        })
      )
      toast.success('已保存')
      onSaved()
    }, '已保存')

  return (
    <Modal
      open={open}
      title="编辑歌曲信息"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={action.loading} onClick={submit}>
            {action.loading ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label">歌名 *</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label className="label">艺人</label>
        <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 24, marginBottom: 12 }}>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">学习状态</label>
          <select
            className="select"
            value={status}
            onChange={(e) => setStatus(e.target.value as SongStatus)}
          >
            <option value="to-learn">想学</option>
            <option value="learning">学习中</option>
            <option value="learned">已学会</option>
          </select>
        </div>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">难度</label>
          <Stars value={difficulty} onChange={setDifficulty} />
        </div>
        <div className="field" style={{ margin: 0, justifyContent: 'flex-end' }}>
          <label className="label">收藏</label>
          <button
            className={`btn btn-sm ${isFavorite ? 'btn-primary' : ''}`}
            onClick={() => setIsFavorite((v) => !v)}
          >
            {isFavorite ? '★ 已收藏' : '☆ 收藏'}
          </button>
        </div>
      </div>
      <div className="field">
        <label className="label">原曲播放链接</label>
        <input
          className="input"
          placeholder="https://..."
          value={audio}
          onChange={(e) => setAudio(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label">备注</label>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
      </div>
    </Modal>
  )
}

/** 添加曲谱链接 Modal */
function AddScoreLinkModal({
  open,
  songId,
  onClose,
  onAdded
}: {
  open: boolean
  songId: string
  onClose: () => void
  onAdded: () => void
}): React.ReactElement {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [sourceName, setSourceName] = useState('')
  const action = useAsyncAction()

  const reset = () => {
    setUrl('')
    setTitle('')
    setSourceName('')
  }

  const submit = () =>
    action.run(async () => {
      if (!url.trim()) throw new Error('请输入链接地址')
      await unwrap(
        api.assets.addScoreLink(songId, {
          url: url.trim(),
          title: title.trim() || null,
          sourceName: sourceName.trim() || null
        })
      )
      toast.success('已添加链接')
      reset()
      onAdded()
    }, '已添加链接')

  return (
    <Modal
      open={open}
      title="添加曲谱链接"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={action.loading} onClick={submit}>
            {action.loading ? '添加中…' : '添加'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label">链接地址 *</label>
        <input
          className="input"
          placeholder="https://..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label className="label">标题</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="label">来源名称</label>
        <input
          className="input"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
        />
      </div>
    </Modal>
  )
}
