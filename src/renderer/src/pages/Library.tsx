/** Library 页面（设计 §13.2）：搜索、多维筛选、列表/卡片视图、新建歌曲 */
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Difficulty, SongStatus, SongSummary } from '@shared'
import type { SongSearchQuery } from '@shared'
import { api, unwrap } from '../lib/api'
import { formatDate, formatSeconds, truncate } from '../lib/format'
import { toast } from '../stores/toast'
import {
  Card,
  Empty,
  Modal,
  Spinner,
  Stars,
  StatusBadge,
  useAsyncAction
} from '../components/ui'

const STATUS_OPTIONS: { value: SongStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'to-learn', label: '想学' },
  { value: 'learning', label: '学习中' },
  { value: 'learned', label: '已学会' }
]

export default function Library(): React.ReactElement {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [status, setStatus] = useState<SongStatus | ''>('')
  const [favOnly, setFavOnly] = useState(false)
  const [hasPdf, setHasPdf] = useState(false)
  const [hasRecording, setHasRecording] = useState(false)
  const [hasPractice, setHasPractice] = useState(false)
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [showCreate, setShowCreate] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const q: SongSearchQuery = {
        text: text.trim() || undefined,
        status: (status || undefined) as SongStatus | undefined,
        isFavorite: favOnly || undefined,
        hasPdf: hasPdf || undefined,
        hasRecording: hasRecording || undefined,
        hasPractice: hasPractice || undefined,
        dateSort: 'newest',
        limit: 2000
      }
      setSongs(await unwrap(api.library.search(q)))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [text, status, favOnly, hasPdf, hasRecording, hasPractice])

  useEffect(() => {
    const t = setTimeout(() => void reload(), 200)
    return () => clearTimeout(t)
  }, [reload])

  return (
    <div>
      <div className="page-header">
        <h1>
          曲库 <span className="faint" style={{ fontSize: 14 }}>（{songs.length}）</span>
        </h1>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            ＋ 新建歌曲
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: 16 }}>
        <div className="row wrap" style={{ gap: 12 }}>
          <input
            className="input grow"
            style={{ minWidth: 200 }}
            placeholder="搜索歌名、艺人、备注或拼音首字母…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <select
            className="select"
            style={{ width: 'auto' }}
            value={status}
            onChange={(e) => setStatus(e.target.value as SongStatus | '')}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <FilterChip active={favOnly} onClick={() => setFavOnly((v) => !v)}>
            ★ 收藏
          </FilterChip>
          <FilterChip active={hasPdf} onClick={() => setHasPdf((v) => !v)}>
            有曲谱
          </FilterChip>
          <FilterChip active={hasRecording} onClick={() => setHasRecording((v) => !v)}>
            有录音
          </FilterChip>
          <FilterChip active={hasPractice} onClick={() => setHasPractice((v) => !v)}>
            有练习
          </FilterChip>
          <div className="grow" />
          <div className="row">
            <button
              className={`btn btn-sm ${view === 'list' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('list')}
            >
              列表
            </button>
            <button
              className={`btn btn-sm ${view === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('grid')}
            >
              卡片
            </button>
          </div>
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : songs.length === 0 ? (
        <Empty>曲库为空，或没有匹配的歌曲。点"新建歌曲"开始建立你的曲库。</Empty>
      ) : view === 'list' ? (
        <Card style={{ padding: 0 }}>
          {songs.map((s) => (
            <Link
              key={s.id}
              to={`/songs/${s.id}`}
              className="list-row"
              style={{ gridTemplateColumns: '1fr auto auto auto auto' }}
            >
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>{s.title}</span>
                  {s.isFavorite && <span className="badge badge-fav">★</span>}
                </div>
                <div className="faint" style={{ fontSize: 12 }}>
                  {s.artist ?? '未知艺人'}
                </div>
              </div>
              <StatusBadge status={s.status} />
              <Stars value={s.difficulty} readonly />
              <div className="faint row" style={{ fontSize: 12, gap: 10 }}>
                {s.scoreCount > 0 && <span>谱{s.scoreCount}</span>}
                {s.hasRecording && <span>🎙</span>}
                {s.totalPracticeSeconds > 0 && <span>{formatSeconds(s.totalPracticeSeconds)}</span>}
              </div>
              <div className="faint" style={{ fontSize: 12 }}>
                {formatDate(s.dateAdded)}
              </div>
            </Link>
          ))}
        </Card>
      ) : (
        <div className="grid grid-auto">
          {songs.map((s) => (
            <Link key={s.id} to={`/songs/${s.id}`} className="card" style={{ textDecoration: 'none' }}>
              <div className="row-between">
                <strong>{truncate(s.title, 16)}</strong>
                {s.isFavorite && <span className="badge badge-fav">★</span>}
              </div>
              <div className="faint" style={{ fontSize: 12, margin: '4px 0 10px' }}>
                {truncate(s.artist ?? '未知艺人', 20)}
              </div>
              <div className="row-between">
                <StatusBadge status={s.status} />
                <Stars value={s.difficulty} readonly />
              </div>
              <div className="faint row" style={{ fontSize: 11, gap: 8, marginTop: 8 }}>
                {s.scoreCount > 0 && <span>谱{s.scoreCount}</span>}
                {s.hasRecording && <span>🎙</span>}
                {s.totalPracticeSeconds > 0 && <span>{formatSeconds(s.totalPracticeSeconds)}</span>}
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateSongModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void reload()}
      />
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <button className={`btn btn-sm ${active ? 'btn-primary' : ''}`} onClick={onClick}>
      {children}
    </button>
  )
}

function CreateSongModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}): React.ReactElement {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [status, setStatus] = useState<SongStatus>('to-learn')
  const [isFavorite, setIsFavorite] = useState(false)
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null)
  const [notes, setNotes] = useState('')
  const [audio, setAudio] = useState('')
  const action = useAsyncAction()

  const reset = () => {
    setTitle('')
    setArtist('')
    setStatus('to-learn')
    setIsFavorite(false)
    setDifficulty(null)
    setNotes('')
    setAudio('')
  }

  const submit = () =>
    action.run(async () => {
      if (!title.trim()) throw new Error('请输入歌名')
      await unwrap(
        api.library.create({
          title: title.trim(),
          artist: artist.trim() || null,
          status,
          isFavorite,
          difficulty,
          notes: notes.trim() || null,
          originalAudioUrl: audio.trim() || null
        })
      )
      toast.success('已添加到曲库')
      reset()
      onClose()
      onCreated()
    }, '已添加到曲库')

  return (
    <Modal
      open={open}
      title="新建歌曲"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" disabled={action.loading} onClick={submit}>
            {action.loading ? '保存中…' : '保存到曲库'}
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
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}
