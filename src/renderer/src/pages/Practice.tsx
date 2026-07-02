/** Practice 页面（设计 §10、§11、§10.1 Practice View）
 * 曲谱查看 + 练习计时 + 备注 + 录音 + 最近练习记录。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { SongDetail } from '@shared'
import { api, unwrap } from '../lib/api'
import { formatClock, formatDateTime, formatSeconds } from '../lib/format'
import { toast } from '../stores/toast'
import { Card, ConfirmDialog, Empty, Spinner, Stars, StatusBadge, useAsyncAction } from '../components/ui'
import { GuistudyViewer } from '../components/GuistudyViewer'

/** 计时器状态机 */
type TimerPhase = 'idle' | 'running' | 'paused'

export default function Practice(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>()

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
      const asset = await unwrap(api.assets.importFileDialog(id))
      if (asset) {
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

  if (loading) return <Spinner />
  if (!detail) return <Empty>无法加载歌曲信息。</Empty>

  // 选择要展示的曲谱：优先 guistudy（嵌入查看），再 primary 的 pdf/image，再普通 link
  const primaryScore = detail.scores.find((s) => s.isPrimary)
  const guistudyScore =
    (primaryScore && primaryScore.source === 'guistudy' ? primaryScore : undefined) ??
    detail.scores.find((s) => s.source === 'guistudy')
  const fileScore =
    primaryScore && primaryScore.type !== 'link'
      ? primaryScore
      : detail.scores.find((s) => (s.type === 'pdf' || s.type === 'image') && s.hasLocalFile) ??
        (primaryScore && primaryScore.type !== 'link' ? primaryScore : undefined)
  const linkScore =
    primaryScore && primaryScore.type === 'link' && primaryScore.source !== 'guistudy'
      ? primaryScore
      : detail.scores.find((s) => s.type === 'link' && s.source !== 'guistudy') ?? undefined

  const assetUrl = (assetId: string): string => `songcat-asset://${assetId}`

  return (
    <div>
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

      <div className="grid" style={{ gridTemplateColumns: '1fr' }}>
        {/* 曲谱查看区 */}
        <Card
          title="曲谱"
          actions={
            detail.scores.length > 0 ? (
              <button className="btn btn-sm btn-ghost" onClick={handleImportScore}>
                ＋ 导入曲谱
              </button>
            ) : undefined
          }
        >
          {guistudyScore && guistudyScore.sourceUrl ? (
            <GuistudyViewer url={guistudyScore.sourceUrl} height="82vh" />
          ) : fileScore ? (
            fileScore.type === 'pdf' ? (
              <iframe
                title={fileScore.title ?? '曲谱'}
                src={assetUrl(fileScore.id)}
                style={{ width: '100%', height: '70vh', border: '0', borderRadius: 8 }}
              />
            ) : fileScore.type === 'image' ? (
              <img src={assetUrl(fileScore.id)} alt={fileScore.title ?? '曲谱'} style={{ maxWidth: '100%' }} />
            ) : null
          ) : linkScore ? (
            <div className="row">
              <button
                className="btn btn-primary"
                onClick={() =>
                  linkScore.sourceUrl
                    ? void api.system.openExternal(linkScore.sourceUrl).catch(() => {})
                    : toast.error('该曲谱未提供链接')
                }
              >
                打开曲谱链接 ↗
              </button>
            </div>
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
        </Card>

        {/* 练习计时器 */}
        <Card title="练习计时器" style={{ marginTop: 16 }}>
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
          style={{ marginTop: 16 }}
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
        <Card title="录音" style={{ marginTop: 16 }}>
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
        <Card title="最近练习记录" style={{ marginTop: 16 }}>
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
