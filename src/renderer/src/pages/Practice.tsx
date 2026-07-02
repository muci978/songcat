/** Practice 页面（设计 §10、§11、§10.1 Practice View）
 * 曲谱查看 + 练习计时 + 备注 + 录音 + 最近练习记录。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { SongDetail } from '@shared'
import { api, unwrap } from '../lib/api'
import { formatClock, formatDateTime, formatSeconds } from '../lib/format'
import { toast } from '../stores/toast'
import { Card, ConfirmDialog, Empty, Spinner, Stars, StatusBadge, useAsyncAction } from '../components/ui'
import { GuistudyViewer } from '../components/GuistudyViewer'

/** 计时器状态机 */
type TimerPhase = 'idle' | 'running' | 'paused'

export default function Practice(): React.ReactElement {
  const { id = '', assetId } = useParams<{ id: string; assetId?: string }>()
  const navigate = useNavigate()

  const [detail, setDetail] = useState<SongDetail | null>(null)
  const [loading, setLoading] = useState(true)

  // ---- 计时器状态 ----
  const [phase, setPhase] = useState<TimerPhase>('idle')
  const [elapsed, setElapsed] = useState(0)
  const sessionIdRef = useRef<string | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ---- 备注编辑 ----
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')

  // ---- 录音 ----
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recordStartRef = useRef<number>(0)
  const [confirmDeleteRecording, setConfirmDeleteRecording] = useState(false)

  const saveAction = useAsyncAction()
  const importAction = useAsyncAction()

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setDetail(await unwrap(api.library.getSong(id)))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  // 初次加载 + touch last_opened
  useEffect(() => {
    void reload()
    void api.library.touch(id).catch(() => {})
  }, [id, reload])

  // 清理所有 interval，并自动结束未完成的 session（设计 §10.2：离开曲谱页时自动结束）
  useEffect(() => {
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      const sid = sessionIdRef.current
      if (sid) {
        // 卸载时静默结束，忽略错误
        void api.practice.stopSession(sid, 'leave-score-view').catch(() => {})
        sessionIdRef.current = null
      }
    }
  }, [])

  // ---- 计时器操作 ----
  const startHeartbeat = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      const sid = sessionIdRef.current
      if (sid) void api.practice.heartbeat(sid).catch(() => {})
    }, 30_000)
  }, [])

  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current)
    tickRef.current = setInterval(() => {
      setElapsed((e) => e + 1)
    }, 1000)
  }, [])

  const handleStart = async (): Promise<void> => {
    try {
      const { sessionId } = await unwrap(api.practice.startSession(id))
      sessionIdRef.current = sessionId
      setElapsed(0)
      setPhase('running')
      startTick()
      startHeartbeat()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handlePause = async (): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      await unwrap(api.practice.pauseSession(sid))
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
      setPhase('paused')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleResume = async (): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      await unwrap(api.practice.resumeSession(sid))
      startTick()
      setPhase('running')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleStop = async (): Promise<void> => {
    const sid = sessionIdRef.current
    if (!sid) return
    try {
      await unwrap(api.practice.stopSession(sid, 'manual'))
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
        heartbeatRef.current = null
      }
      sessionIdRef.current = null
      setElapsed(0)
      setPhase('idle')
      toast.success('已结束本次练习')
      await reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // ---- 备注保存 ----
  const handleSaveNotes = (): Promise<void> =>
    saveAction.run(async () => {
      await unwrap(api.library.update(id, { notes: notesDraft.trim() || null }))
      setEditingNotes(false)
      await reload()
    }, '备注已保存')

  const handleImportScore = (): Promise<void> =>
    importAction.run(async () => {
      const assets = await unwrap(api.assets.importFileDialog(id))
      if (assets.length > 0) {
        await reload()
      }
    })

  // ---- 录音 ----
  const handleStartRecording = async (): Promise<void> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        try {
          const mimeTypeUsed = recorder.mimeType || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type: mimeTypeUsed })
          const buf = await blob.arrayBuffer()
          const durationSeconds = Math.max(1, Math.round((performance.now() - recordStartRef.current) / 1000))
          await unwrap(
            api.recording.saveLatestTake({
              songId: id,
              arrayBuffer: buf,
              mimeType: blob.type || mimeTypeUsed,
              durationSeconds
            })
          )
          toast.success('录音已保存')
          await reload()
        } catch (e) {
          toast.error((e as Error).message)
        } finally {
          chunksRef.current = []
        }
      }
      recorderRef.current = recorder
      recordStartRef.current = performance.now()
      recorder.start()
      setRecording(true)
    } catch (e) {
      toast.error((e as Error).message || '无法访问麦克风')
    }
  }

  const handleStopRecording = (): void => {
    const recorder = recorderRef.current
    const stream = streamRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    recorderRef.current = null
    streamRef.current = null
    setRecording(false)
  }

  const handleDeleteRecording = (): Promise<void> =>
    saveAction.run(async () => {
      await unwrap(api.recording.remove(id))
      setConfirmDeleteRecording(false)
      await reload()
    }, '录音已删除')

  // 录音组件卸载时清理资源（避免遗留硬件占用）
  useEffect(() => {
    return () => {
      const recorder = recorderRef.current
      const stream = streamRef.current
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop()
        } catch {
          /* ignore */
        }
      }
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  // 分组浏览键盘快捷键：←/→ 翻页（仅在多成员组有效）
  useEffect(() => {
    if (!selectedScore?.groupId || group.length <= 1) return
    const curIdx = group.findIndex((s) => s.id === selectedScore.id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        const prev = group[curIdx - 1]
        if (prev) navigate(`/songs/${id}/practice/${prev.id}`)
      } else if (e.key === 'ArrowRight') {
        const next = group[curIdx + 1]
        if (next) navigate(`/songs/${id}/practice/${next.id}`)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedScore, group, id, navigate])

  if (loading) return <Spinner />
  if (!detail) return <Empty>无法加载歌曲信息。</Empty>

  // 选择要展示的曲谱：URL assetId 优先；无则按主资源 → guistudy → 本地文件 → 外部链接兜底
  const primaryScore = detail.scores.find((s) => s.isPrimary)
  const selectedScore =
    (assetId && detail.scores.find((s) => s.id === assetId)) ??
    primaryScore ??
    detail.scores.find((s) => s.source === 'guistudy') ??
    detail.scores.find((s) => (s.type === 'pdf' || s.type === 'image') && s.hasLocalFile) ??
    detail.scores.find((s) => s.type === 'link' && s.source !== 'guistudy')

  const assetUrl = (assetId: string): string => `songcat-asset://${assetId}`

  // 当前曲谱所在分组（用于多图/PDF连续浏览）
  const group = selectedScore ? siblingGroup(selectedScore, detail.scores) : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 48px)' }}>
      {/* 顶部信息 */}
      <div className="page-header">
        <div>
          <Link to={`/songs/${id}`} className="faint" style={{ fontSize: 13 }}>
            ← 返回歌曲详情
          </Link>
          <h1 style={{ marginTop: 6 }}>{detail.title}</h1>
          <div className="row wrap" style={{ gap: 12, marginTop: 6, alignItems: 'center' }}>
            <span className="faint">{detail.artist ?? '未知艺人'}</span>
            <StatusBadge status={detail.status} />
            {detail.isFavorite && <span className="badge badge-fav">★</span>}
            <Stars value={detail.difficulty} readonly />
            {detail.originalAudioUrl && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={() => void api.system.openExternal(detail.originalAudioUrl!).catch(() => {})}
              >
                原曲链接 ↗
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 主区域：两栏 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
        {/* 左栏：曲谱查看区 */}
        <Card
          title="曲谱"
          actions={
            detail.scores.length > 0 ? (
              <button className="btn btn-sm btn-ghost" onClick={handleImportScore}>
                ＋ 导入曲谱
              </button>
            ) : undefined
          }
          style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {selectedScore && group.length > 1 && selectedScore.type !== 'link' && (
              <GroupPager songId={id} group={group} currentId={selectedScore.id} />
            )}
            <div style={{ flex: 1, minHeight: 0 }}>
              {selectedScore ? (
                selectedScore.source === 'guistudy' && selectedScore.sourceUrl ? (
                  <GuistudyViewer url={selectedScore.sourceUrl} height="100%" />
                ) : selectedScore.type === 'pdf' ? (
                  <iframe
                    title={selectedScore.title ?? '曲谱'}
                    src={assetUrl(selectedScore.id)}
                    style={{ width: '100%', height: '100%', border: '0', borderRadius: 8 }}
                  />
                ) : selectedScore.type === 'image' ? (
                  <img
                    src={assetUrl(selectedScore.id)}
                    alt={selectedScore.title ?? '曲谱'}
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  />
                ) : selectedScore.sourceUrl ? (
                  <div className="row">
                    <button
                      className="btn btn-primary"
                      onClick={() => void api.system.openExternal(selectedScore.sourceUrl!).catch(() => {})}
                    >
                      打开曲谱链接 ↗
                    </button>
                  </div>
                ) : (
                  <Empty icon="🎼">
                  <div>这首歌还没有可展示的曲谱。</div>
                  <div className="row" style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-primary"
                      disabled={importAction.loading}
                      onClick={handleImportScore}
                    >
                      {importAction.loading ? '导入中…' : '导入曲谱'}
                    </button>
                  </div>
                </Empty>
              )
            ) : (
              <Empty icon="🎼">
                <div>这首歌还没有曲谱。</div>
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-primary"
                    disabled={importAction.loading}
                    onClick={handleImportScore}
                  >
                    {importAction.loading ? '导入中…' : '导入曲谱'}
                  </button>
                </div>
              </Empty>
            )}
          </div>
        </div>
      </Card>

        {/* 右栏：控制面板 */}
        <div style={{ width: 340, flexShrink: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 练习计时器 */}
          <Card title="练习计时器">
          <div className="row-between" style={{ alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 40, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {formatClock(elapsed)}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                {phase === 'idle' && '点击"开始练习"开始计时'}
                {phase === 'running' && '练习中…'}
                {phase === 'paused' && '已暂停'}
              </div>
            </div>
            <div className="row wrap" style={{ gap: 8 }}>
              {phase === 'idle' && (
                <button className="btn btn-primary" onClick={() => void handleStart()}>
                  开始练习
                </button>
              )}
              {phase === 'running' && (
                <>
                  <button className="btn" onClick={() => void handlePause()}>
                    暂停
                  </button>
                  <button className="btn btn-danger" onClick={() => void handleStop()}>
                    结束
                  </button>
                </>
              )}
              {phase === 'paused' && (
                <>
                  <button className="btn btn-primary" onClick={() => void handleResume()}>
                    继续
                  </button>
                  <button className="btn btn-danger" onClick={() => void handleStop()}>
                    结束
                  </button>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* 备注 */}
        <Card
          title="备注"
          actions={
            !editingNotes ? (
              <button className="btn btn-sm btn-ghost" onClick={() => {
                setNotesDraft(detail.notes ?? '')
                setEditingNotes(true)
              }}>
                编辑备注
              </button>
            ) : undefined
          }
        >
          {editingNotes ? (
            <div>
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                autoFocus
              />
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button
                  className="btn btn-primary"
                  disabled={saveAction.loading}
                  onClick={() => void handleSaveNotes()}
                >
                  {saveAction.loading ? '保存中…' : '保存'}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setEditingNotes(false)
                    setNotesDraft('')
                  }}
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {detail.notes ? (
                detail.notes
              ) : (
                <span className="faint">还没有备注。</span>
              )}
            </div>
          )}
        </Card>

        {/* 录音 */}
        <Card title="录音">
          {recording ? (
            <div className="row-between" style={{ alignItems: 'center' }}>
              <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: 'pulse 1s infinite'
                  }}
                />
                <span style={{ fontWeight: 600 }}>正在录音…</span>
              </div>
              <button className="btn btn-danger" onClick={handleStopRecording}>
                停止
              </button>
            </div>
          ) : detail.recording ? (
            <div>
              <audio
                controls
                src={`songcat-recording://${id}`}
                style={{ width: '100%' }}
              />
              <div className="row-between" style={{ marginTop: 12 }}>
                <span className="faint" style={{ fontSize: 12 }}>
                  录于 {formatDateTime(detail.recording.recordedAt)}
                  {detail.recording.durationSeconds ? ` · ${formatSeconds(detail.recording.durationSeconds)}` : ''}
                </span>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn" onClick={() => void handleStartRecording()}>
                    重新录音
                  </button>
                  <button className="btn btn-danger" onClick={() => setConfirmDeleteRecording(true)}>
                    删除录音
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="row">
              <button className="btn btn-primary" onClick={() => void handleStartRecording()}>
                开始录音
              </button>
            </div>
          )}
        </Card>

        {/* 最近练习记录 */}
        <Card title="最近练习记录">
          {detail.recentSessions.length > 0 ? (
            detail.recentSessions.map((s) => (
              <div key={s.id} className="list-row" style={{ gridTemplateColumns: '1fr auto' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {formatDateTime(s.startedAt)}
                    {s.endedAt ? ` → ${formatDateTime(s.endedAt)}` : '（进行中）'}
                  </div>
                  <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                    {s.stopReason ? `原因：${STOP_REASON_LABEL[s.stopReason]}` : ''}
                  </div>
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {formatSeconds(s.durationSeconds)}
                </div>
              </div>
            ))
          ) : (
            <Empty icon="⏱">还没有练习记录。</Empty>
          )}
        </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteRecording}
        title="删除录音"
        message="确定删除这条录音吗？此操作不可撤销。"
        confirmText="删除"
        danger
        onConfirm={() => void handleDeleteRecording()}
        onClose={() => setConfirmDeleteRecording(false)}
      />
    </div>
  )
}

const STOP_REASON_LABEL: Record<string, string> = {
  manual: '手动结束',
  'leave-score-view': '离开曲谱页',
  'switch-song': '切换歌曲',
  'app-close': '关闭应用',
  recovery: '异常恢复'
}

function siblingGroup(score: ScoreAsset, all: ScoreAsset[]): ScoreAsset[] {
  if (!score.groupId) return [score]
  return all
    .filter((s) => s.groupId === score.groupId)
    .sort((a, b) => a.groupSort - b.groupSort)
}

function GroupPager({
  songId,
  group,
  currentId,
}: {
  songId: string
  group: ScoreAsset[]
  currentId: string
}): React.ReactElement {
  const navigate = useNavigate()
  const curIdx = group.findIndex((g) => g.id === currentId)
  const goPrev = () => {
    const prev = group[curIdx - 1]
    if (prev) navigate(`/songs/${songId}/practice/${prev.id}`)
  }
  const goNext = () => {
    const next = group[curIdx + 1]
    if (next) navigate(`/songs/${songId}/practice/${next.id}`)
  }

  return (
    <div className="row-between" style={{ paddingBottom: 8 }}>
      <button className="btn btn-sm" disabled={curIdx <= 0} onClick={goPrev}>
        ← 上一页
      </button>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
        {curIdx + 1} / {group.length}
      </span>
      <button className="btn btn-sm" disabled={curIdx >= group.length - 1} onClick={goNext}>
        下一页 →
      </button>
    </div>
  )
}
