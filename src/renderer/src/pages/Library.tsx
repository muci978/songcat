/** Library 页面：搜索、多维筛选、排序、首字母分组视图、卡片视图、批量删除 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { SongStatus, SongSummary } from '@shared'
import type { SongSearchQuery } from '@shared'
import { api, unwrap } from '../lib/api'
import { formatSeconds, truncate } from '../lib/format'
import { toast } from '../stores/toast'
import { Card, ConfirmDialog, Empty, Spinner, Stars, StatusBadge } from '../components/ui'
import { useInfiniteScroll } from '../hooks/useInfiniteScroll'

const STATUS_OPTIONS: { value: SongStatus | ''; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'to-learn', label: '想学' },
  { value: 'learning', label: '学习中' },
  { value: 'learned', label: '已学会' }
]

type SortBy = 'title' | 'artist' | 'dateAdded' | 'difficulty' | 'custom'

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'title', label: '标题' },
  { value: 'artist', label: '歌手' },
  { value: 'dateAdded', label: '入库时间' },
  { value: 'difficulty', label: '难度' },
  { value: 'custom', label: '自定义' }
]

/** 取一首歌的分组首字母（大写 A–Z 或 '#'） */
function groupInitial(s: SongSummary): string {
  const raw = s.titlePinyinInitial?.trim()
  if (raw && /^[A-Za-z]/.test(raw)) return raw[0].toUpperCase()
  const t = s.title.trim()
  if (t && /^[A-Za-z]/.test(t)) return t[0].toUpperCase()
  return '#'
}

/** 计算某首歌在指定排序下的次级排序 key 字符串（用于稳定排序的 tie-break） */
function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

export default function Library(): React.ReactElement {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const PAGE_SIZE = 50
  const hasMore = songs.length < total
  const [text, setText] = useState('')
  const [status, setStatus] = useState<SongStatus | ''>('')
  const [favOnly, setFavOnly] = useState(false)
  const [hasPdf, setHasPdf] = useState(false)
  const [hasRecording, setHasRecording] = useState(false)
  const [hasPractice, setHasPractice] = useState(false)
  const [view, setView] = useState<'alpha' | 'grid'>('alpha')
  const [sortBy, setSortBy] = useState<SortBy>('title')
  const [letterFilter, setLetterFilter] = useState<string | null>(null)

  // 多选 / 批量删除
  const [multiSelect, setMultiSelect] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [singleDelete, setSingleDelete] = useState<SongSummary | null>(null)

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
        limit: PAGE_SIZE,
        offset: 0
      }
      const result = await unwrap(api.library.search(q))
      setSongs(result.items)
      setTotal(result.total)
      setOffset(0)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [text, status, favOnly, hasPdf, hasRecording, hasPractice])

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return
    setLoading(true)
    try {
      const nextOffset = offset + PAGE_SIZE
      const q: SongSearchQuery = {
        text: text.trim() || undefined,
        status: (status || undefined) as SongStatus | undefined,
        isFavorite: favOnly || undefined,
        hasPdf: hasPdf || undefined,
        hasRecording: hasRecording || undefined,
        hasPractice: hasPractice || undefined,
        dateSort: 'newest',
        limit: PAGE_SIZE,
        offset: nextOffset
      }
      const result = await unwrap(api.library.search(q))
      setSongs(prev => [...prev, ...result.items])
      setTotal(result.total)
      setOffset(nextOffset)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [offset, hasMore, loading, text, status, favOnly, hasPdf, hasRecording, hasPractice])

  const { sentinelRef } = useInfiniteScroll({ hasMore, isLoading: loading, onLoadMore: loadMore })

  useEffect(() => {
    const t = setTimeout(() => void reload(), 200)
    return () => clearTimeout(t)
  }, [reload])

  // 切换排序模式或多选模式时，清空选择状态
  useEffect(() => {
    setSelected(new Set())
  }, [sortBy, multiSelect])

  // 前端排序（首字母视图强制按标题排序以确保分组正确；自定义排序按首字母+sortOrder）
  const sorted = useMemo(() => {
    const arr = letterFilter ? songs.filter((s) => groupInitial(s) === letterFilter) : [...songs]
    const effectiveSort = view === 'alpha' ? (sortBy === 'custom' ? 'custom' : 'title') : sortBy
    switch (effectiveSort) {
      case 'title':
        arr.sort((a, b) => {
          const g = cmpStr(groupInitial(a), groupInitial(b))
          if (g !== 0) return g
          return cmpStr(a.title, b.title)
        })
        break
      case 'artist':
        arr.sort((a, b) => {
          const g = cmpStr(a.artist ?? 'zzz', b.artist ?? 'zzz')
          if (g !== 0) return g
          return cmpStr(a.title, b.title)
        })
        break
      case 'dateAdded':
        arr.sort((a, b) => cmpStr(b.dateAdded, a.dateAdded) || cmpStr(a.title, b.title))
        break
      case 'difficulty':
        arr.sort(
          (a, b) =>
            (b.difficulty ?? 0) - (a.difficulty ?? 0) || cmpStr(a.title, b.title)
        )
        break
      case 'custom':
        arr.sort((a, b) => {
          const g = cmpStr(groupInitial(a), groupInitial(b))
          if (g !== 0) return g
          return a.sortOrder - b.sortOrder || cmpStr(a.title, b.title)
        })
        break
    }
    return arr
  }, [songs, sortBy, view, letterFilter])

  // 标题排序时的字母分组（保持顺序）
  const groups = useMemo(() => {
    const map = new Map<string, SongSummary[]>()
    for (const s of sorted) {
      const k = groupInitial(s)
      const list = map.get(k)
      if (list) list.push(s)
      else map.set(k, [s])
    }
    // 字母按 A–Z 然后 '#' 排序
    return [...map.entries()].sort((a, b) => {
      if (a[0] === '#') return 1
      if (b[0] === '#') return -1
      return cmpStr(a[0], b[0])
    })
  }, [sorted])

  // 可用字母基于全量歌曲（不受当前筛选影响）
  const availableLetters = useMemo(() => {
    const s = new Set(songs.map(groupInitial))
    return [...s].sort((a, b) => (a === '#' ? 1 : b === '#' ? -1 : cmpStr(a, b)))
  }, [songs])

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAll = () => setSelected(new Set(sorted.map((s) => s.id)))
  const clearSelection = () => setSelected(new Set())

  const doBulkDelete = async () => {
    if (selected.size === 0) return
    setBulkDeleting(true)
    try {
      await Promise.all([...selected].map((id) => unwrap(api.library.delete(id))))
      toast.success(`已删除 ${selected.size} 首歌曲`)
      setSelected(new Set())
      await reload()
    } catch (e) {
      toast.error((e as Error).message)
      await reload()
    } finally {
      setBulkDeleting(false)
    }
  }

  const doSingleDelete = async (s: SongSummary) => {
    try {
      await unwrap(api.library.delete(s.id))
      toast.success(`已删除《${s.title}》`)
      await reload()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>
          曲库 <span className="faint" style={{ fontSize: 14 }}>（{songs.length}）</span>
        </h1>
        <div className="actions">
          <button
            className={`btn btn-sm ${multiSelect ? 'btn-primary' : ''}`}
            onClick={() => setMultiSelect((v) => !v)}
          >
            {multiSelect ? '✓ 多选中' : '多选'}
          </button>
        </div>
      </div>

      <Card style={{ marginBottom: 20, borderRadius: 'var(--radius)' }}>
        <div className="row wrap" style={{ gap: 14 }}>
          <input
            className="input grow"
            style={{ minWidth: 220, borderRadius: 'var(--radius-sm)' }}
            placeholder="搜索歌名、艺人、备注或拼音首字母…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <select
            className="select"
            style={{ width: 'auto', borderRadius: 'var(--radius-sm)' }}
            value={status}
            onChange={(e) => setStatus(e.target.value as SongStatus | '')}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ width: 'auto', borderRadius: 'var(--radius-sm)' }}
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                排序：{o.label}
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
              className={`btn btn-sm ${view === 'alpha' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('alpha')}
            >
              A-Z
            </button>
            <button
              className={`btn btn-sm ${view === 'grid' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setView('grid')}
            >
              卡片
            </button>
          </div>
        </div>

        {multiSelect && (
          <div
            className="row wrap"
            style={{ gap: 14, marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}
          >
            <span className="faint" style={{ fontSize: 12 }}>
              已选 {selected.size} / {sorted.length}
            </span>
            <button className="btn btn-sm" onClick={selectAll} disabled={sorted.length === 0}>
              全选
            </button>
            <button
              className="btn btn-sm"
              onClick={clearSelection}
              disabled={selected.size === 0}
            >
              清空
            </button>
            <div className="grow" />
            <button
              className="btn btn-sm btn-danger"
              disabled={selected.size === 0}
              onClick={() => setBulkDeleteOpen(true)}
            >
              删除选中（{selected.size}）
            </button>
          </div>
        )}
      </Card>

      {loading ? (
        <Spinner />
      ) : songs.length === 0 ? (
        <Empty>曲库为空，或没有匹配的歌曲。去"添加/搜索"页搜索入库吧。</Empty>
      ) : view === 'alpha' ? (
        <AlphabetIndex
          letters={availableLetters}
          activeLetter={letterFilter}
          onPick={(ch) => setLetterFilter((prev) => (prev === ch ? null : ch))}
        />
      ) : null}

      {!loading && songs.length > 0 && (
        <>
          {view === 'alpha' ? (
            <AlphaView
              groups={groups}
              multiSelect={multiSelect}
              selected={selected}
              onToggle={toggleSelect}
              onDelete={setSingleDelete}
              sortable={sortBy === 'custom'}
              onReorder={(items) => { void unwrap(api.library.reorder(items)).then(() => void reload()) }}
            />
          ) : (
            <div className="grid grid-auto">
              {sorted.map((s) => (
                <GridViewItem
                  key={s.id}
                  s={s}
                  multiSelect={multiSelect}
                  selected={selected.has(s.id)}
                  onToggle={toggleSelect}
                  onDelete={setSingleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* 无限滚动哨兵 & 状态 */}
      {!loading && songs.length > 0 && hasMore && <div ref={sentinelRef} style={{ height: 1 }} />}
      {loading && songs.length > 0 && <div style={{ textAlign: 'center', padding: 16 }}><Spinner /></div>}
      {!loading && !hasMore && songs.length > 0 && (
        <div className="faint" style={{ textAlign: 'center', padding: 16, fontSize: 13 }}>
          已加载全部 {total} 首歌曲
        </div>
      )}

      <ConfirmDialog
        open={bulkDeleteOpen}
        title="批量删除"
        danger
        confirmText={bulkDeleting ? '删除中…' : `删除 ${selected.size} 首`}
        message={
          <>
            确认删除选中的 <strong>{selected.size}</strong> 首歌曲？此操作不可撤销，歌曲下的曲谱、录音、练习记录将一并删除。
          </>
        }
        onConfirm={() => void doBulkDelete()}
        onClose={() => setBulkDeleteOpen(false)}
      />

      <ConfirmDialog
        open={singleDelete !== null}
        title="删除歌曲"
        danger
        confirmText="删除"
        message={
          <>
            确认删除《<strong>{singleDelete?.title}</strong>》？此操作不可撤销。
          </>
        }
        onConfirm={() => {
          if (singleDelete) void doSingleDelete(singleDelete)
          setSingleDelete(null)
        }}
        onClose={() => setSingleDelete(null)}
      />
    </div>
  )
}

/* --------------------------- 字母筛选条 --------------------------- */

function AlphabetIndex({
  letters,
  activeLetter,
  onPick
}: {
  letters: string[]
  activeLetter: string | null
  onPick: (ch: string) => void
}): React.ReactElement {
  const all = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const present = new Set(letters)
  return (
    <Card style={{ padding: 10, marginBottom: 16, borderRadius: 'var(--radius)' }}>
      <div className="row wrap" style={{ gap: 4 }}>
        {[...all].map((ch) => (
          <button
            key={ch}
            className={`btn btn-sm ${
              activeLetter === ch ? 'btn-primary' : present.has(ch) ? '' : 'btn-ghost'
            }`}
            disabled={!present.has(ch)}
            onClick={() => onPick(ch)}
            style={{
              minWidth: 32,
              padding: '4px 0',
              borderRadius: 'var(--radius-sm)',
              opacity: present.has(ch) ? 1 : 0.35,
              cursor: present.has(ch) ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {ch}
          </button>
        ))}
        <button
          key="#"
          className={`btn btn-sm ${activeLetter === '#' ? 'btn-primary' : present.has('#') ? '' : 'btn-ghost'}`}
          disabled={!present.has('#')}
          onClick={() => onPick('#')}
          style={{
            minWidth: 36,
            padding: '4px 0',
            borderRadius: 'var(--radius-sm)',
            opacity: present.has('#') ? 1 : 0.35,
            cursor: present.has('#') ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          #
        </button>
      </div>
    </Card>
  )
}

/* --------------------------- 首字母分组视图（多列紧凑） --------------------------- */

function AlphaView({
  groups,
  multiSelect,
  selected,
  onToggle,
  onDelete,
  sortable,
  onReorder
}: {
  groups: [string, SongSummary[]][]
  multiSelect: boolean
  selected: Set<string>
  onToggle: (id: string) => void
  onDelete: (s: SongSummary) => void
  sortable: boolean
  onReorder: (items: { id: string; sortOrder: number }[]) => void
}): React.ReactElement {
  // 根据屏幕宽度动态列数：窄屏1列，逐渐到最多4列
  const colCount = window.innerWidth < 640 ? 1 : window.innerWidth < 900 ? 2 : window.innerWidth < 1200 ? 3 : 4
  const dragIndexRef = useRef<number | null>(null)

  const handleDragStart = (e: React.DragEvent, index: number) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.4'
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (e: React.DragEvent, list: SongSummary[], dropIndex: number) => {
    e.preventDefault()
    const from = dragIndexRef.current
    if (from === null || from === dropIndex) return
    // 创建新数组，避免修改 props
    const newList = [...list]
    const [item] = newList.splice(from, 1)
    newList.splice(dropIndex, 0, item)
    onReorder(newList.map((s, i) => ({ id: s.id, sortOrder: i })))
    dragIndexRef.current = null
  }

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1'
    }
    dragIndexRef.current = null
  }

  return (
    <div style={{ columns: colCount, columnGap: 12 }}>
      {groups.map(([letter, list]) => (
        <div
          key={letter}
          style={{ breakInside: 'avoid', marginBottom: 4 }}
        >
          <Card style={{ padding: 0 }}>
            {list.map((s, i) => (
              <div
                key={s.id}
                draggable={sortable}
                onDragStart={sortable ? (e) => handleDragStart(e, i) : undefined}
                onDragOver={sortable ? handleDragOver : undefined}
                onDrop={sortable ? (e) => handleDrop(e, list, i) : undefined}
                onDragEnd={sortable ? handleDragEnd : undefined}
                style={sortable ? { cursor: 'grab' } : undefined}
              >
                <AlphaSongRow
                  s={s}
                  showLetter={i === 0}
                  letter={letter}
                  multiSelect={multiSelect}
                  checked={selected.has(s.id)}
                  onToggle={onToggle}
                  onDelete={onDelete}
                  dragHandle={sortable}
                />
              </div>
            ))}
          </Card>
        </div>
      ))}
    </div>
  )
}

function AlphaSongRow({
  s,
  showLetter,
  letter,
  multiSelect,
  checked,
  onToggle,
  onDelete,
  dragHandle
}: {
  s: SongSummary
  showLetter: boolean
  letter: string
  multiSelect: boolean
  checked: boolean
  onToggle: (id: string) => void
  onDelete: (s: SongSummary) => void
  dragHandle?: boolean
}): React.ReactElement {
  const stopAndDelete = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDelete(s)
  }
  const rowStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: multiSelect ? 'auto 28px 1fr auto auto' : dragHandle ? 'auto 28px 1fr auto auto' : '28px 1fr auto auto',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    textDecoration: 'none',
    color: 'inherit',
    borderBottom: '1px solid var(--border)',
    fontSize: 13,
  }
  const inner = (
    <>
      {multiSelect && (
        <input
          type="checkbox"
          checked={checked}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggle(s.id)}
          style={{ cursor: 'pointer' }}
        />
      )}
      {dragHandle && !multiSelect && (
        <span style={{ cursor: 'grab', color: 'var(--text-faint)', fontSize: 14, userSelect: 'none' }}>⠿</span>
      )}
      <span
        style={{
          fontWeight: 800,
          fontSize: 14,
          color: showLetter ? 'var(--accent)' : 'transparent',
          userSelect: 'none',
          textAlign: 'center',
        }}
      >
        {letter}
      </span>
      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        <span style={{ fontWeight: 600 }}>{s.title}</span>
        <span className="faint" style={{ marginLeft: 8 }}>{s.artist ?? '未知艺人'}</span>
      </div>
      <StatusBadge status={s.status} />
      <div className="faint row" style={{ fontSize: 11, gap: 6, alignItems: 'center' }}>
        {s.scoreCount > 0 && <span>谱{s.scoreCount}</span>}
        {s.hasRecording && <span>🎙</span>}
        <button
          className="btn btn-sm btn-ghost"
          onClick={stopAndDelete}
          title="删除"
          style={{ padding: '0 4px', color: 'var(--danger, var(--text-muted))' }}
        >
          ✕
        </button>
      </div>
    </>
  )
  // 拖拽排序模式下用 div 而非 Link，避免 Link 拦截 drag 事件
  if (dragHandle && !multiSelect) {
    return <div style={rowStyle}>{inner}</div>
  }
  return (
    <Link
      to={multiSelect ? '#' : `/songs/${s.id}`}
      onClick={(e) => {
        if (multiSelect) e.preventDefault()
      }}
      style={rowStyle}
    >
      {inner}
    </Link>
  )
}

/* --------------------------- 卡片视图 --------------------------- */

function GridViewItem({
  s,
  multiSelect,
  selected,
  onToggle,
  onDelete
}: {
  s: SongSummary
  multiSelect: boolean
  selected: boolean
  onToggle: (id: string) => void
  onDelete: (s: SongSummary) => void
}): React.ReactElement {
  return (
    <Link
      to={multiSelect ? '#' : `/songs/${s.id}`}
      onClick={(e) => {
        if (multiSelect) e.preventDefault()
      }}
      className="card"
      style={{ textDecoration: 'none', position: 'relative' }}
    >
      {multiSelect && (
        <input
          type="checkbox"
          checked={selected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggle(s.id)}
          style={{ position: 'absolute', top: 8, right: 8, cursor: 'pointer' }}
        />
      )}
      <div className="row-between">
        <strong>{truncate(s.title, 16)}</strong>
        {s.isFavorite && !multiSelect && <span className="badge badge-fav">★</span>}
      </div>
      <div className="faint" style={{ fontSize: 12, margin: '4px 0 10px' }}>
        {truncate(s.artist ?? '未知艺人', 20)}
      </div>
      <div className="row-between">
        <StatusBadge status={s.status} />
        <Stars value={s.difficulty} readonly />
      </div>
      <div className="faint row-between" style={{ fontSize: 11, gap: 8, marginTop: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          {s.scoreCount > 0 && <span>谱{s.scoreCount}</span>}
          {s.hasRecording && <span>🎙</span>}
          {s.totalPracticeSeconds > 0 && <span>{formatSeconds(s.totalPracticeSeconds)}</span>}
        </div>
        <button
          className="btn btn-sm btn-ghost"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onDelete(s)
          }}
          title="删除"
          style={{ padding: '0 4px' }}
        >
          ✕
        </button>
      </div>
    </Link>
  )
}

/* --------------------------- 小组件 --------------------------- */

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
