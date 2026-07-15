import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SongSummary } from '@shared'

interface SongComboboxProps {
  songs: SongSummary[]
  value: string
  onChange: (id: string) => void
}

const MAX_VISIBLE = 20

/**
 * 可搜索的歌曲下拉选择器，替代原生 <select> + 1000 个 <option>。
 * 输入关键字即时前端过滤，最多显示 20 条，支持键盘导航。
 */
export function SongCombobox({ songs, value, onChange }: SongComboboxProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // 当前选中歌曲的显示文本
  const selectedSong = songs.find((s) => s.id === value)
  const displayText = selectedSong ? `${selectedSong.title} — ${selectedSong.artist ?? '未知艺人'}` : ''

  // 过滤结果
  const filtered = useMemo(() => {
    if (!query.trim()) return songs.slice(0, MAX_VISIBLE)
    const q = query.toLowerCase()
    return songs
      .filter((s) => {
        const label = `${s.title} ${s.artist ?? ''}`.toLowerCase()
        return label.includes(q)
      })
      .slice(0, MAX_VISIBLE)
  }, [songs, query])

  // 点击外部关闭
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const handleSelect = useCallback(
    (id: string) => {
      onChange(id)
      setOpen(false)
      setQuery('')
      setHighlightIndex(-1)
    },
    [onChange]
  )

  const handleFocus = useCallback(() => {
    setOpen(true)
    if (value) {
      // 有选中值时，打开后清空 query 让用户看到完整列表
      setQuery('')
    }
  }, [value])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!open) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
          setOpen(true)
          e.preventDefault()
        }
        return
      }
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (highlightIndex >= 0 && highlightIndex < filtered.length) {
            handleSelect(filtered[highlightIndex].id)
          }
          break
        case 'Escape':
          e.preventDefault()
          setOpen(false)
          setHighlightIndex(-1)
          break
      }
    },
    [open, filtered, highlightIndex, handleSelect]
  )

  // 高亮项滚动到可见区域
  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return
    const item = listRef.current.children[highlightIndex] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIndex])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        className="input"
        type="text"
        placeholder="搜索歌曲…"
        value={open ? query : (displayText || query)}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
          setHighlightIndex(-1)
        }}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
      {open && (
        <div
          ref={listRef}
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-lg)',
            marginTop: 4
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 14px', color: 'var(--text-faint)', fontSize: 13 }}>
              无匹配歌曲
            </div>
          ) : (
            filtered.map((s, i) => {
              const label = `${s.title} — ${s.artist ?? '未知艺人'}`
              const isSelected = s.id === value
              const isHighlighted = i === highlightIndex
              return (
                <div
                  key={s.id}
                  onClick={() => handleSelect(s.id)}
                  onMouseEnter={() => setHighlightIndex(i)}
                  style={{
                    padding: '8px 14px',
                    fontSize: 14,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'var(--accent-soft)'
                      : isHighlighted
                        ? 'var(--bg-subtle)'
                        : 'transparent',
                    color: isSelected ? 'var(--accent)' : 'var(--text)',
                    fontWeight: isSelected ? 600 : 400,
                    borderBottom: '1px solid var(--border)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {label}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
