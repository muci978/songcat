/** AddSearch 页面（设计 §7、§13.3、§8、§9）：
 *  四个 tab：手动导入 / 免费资源站 / DeepSeek / 粘贴链接。
 *  歌曲选择器在多 tab 间复用；外部链接统一走系统浏览器。 */
import { useEffect, useRef, useState } from 'react'
import type {
  AiCandidate,
  FreeSourceSearchResult,
  SongSummary
} from '@shared'
import { DEEPSEEK_PRIVACY_TEXT, DISCLAIMER_TEXT } from '@shared'
import { api, unwrap } from '../lib/api'
import { toast } from '../stores/toast'
import { Card, Empty, Modal, Spinner, useAsyncAction } from '../components/ui'
import { GuistudyViewer } from '../components/GuistudyViewer'
import { SortPreviewModal } from '../components/SortPreviewModal'

type TabKey = 'manual' | 'sources' | 'ai' | 'link'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'manual', label: '手动导入' },
  { key: 'sources', label: '免费资源站' },
  { key: 'ai', label: 'DeepSeek' },
  { key: 'link', label: '粘贴链接' }
]

export default function AddSearch(): React.ReactElement {
  const [tab, setTab] = useState<TabKey>('manual')

  return (
    <div>
      <div className="page-header">
        <h1>添加 / 搜索</h1>
      </div>
      <div className="hint" style={{ marginBottom: 16 }}>
        {DISCLAIMER_TEXT}
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`btn btn-sm ${tab === t.key ? 'btn-primary' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'manual' && <ManualTab />}
      {tab === 'sources' && <SourcesTab />}
      {tab === 'ai' && <AiTab />}
      {tab === 'link' && <LinkTab />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 歌曲选择器（多 tab 复用）                                              */
/* ------------------------------------------------------------------ */

function useSongList(): { songs: SongSummary[]; loading: boolean } {
  const [songs, setSongs] = useState<SongSummary[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    void (async () => {
      try {
        const list = await unwrap(api.library.search({ limit: 1000 }))
        setSongs(list.items)
      } catch (e) {
        toast.error((e as Error).message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])
  return { songs, loading }
}

function SongSelect({
  songs,
  value,
  onChange
}: {
  songs: SongSummary[]
  value: string
  onChange: (id: string) => void
}): React.ReactElement {
  if (songs.length === 0) {
    return <Empty>先到曲库新建歌曲，才能把曲谱或链接关联到歌曲。</Empty>
  }
  return (
    <select
      className="select"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">请选择歌曲…</option>
      {songs.map((s) => (
        <option key={s.id} value={s.id}>
          {s.title} — {s.artist ?? '未知艺人'}
        </option>
      ))}
    </select>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 1：手动导入                                                       */
/* ------------------------------------------------------------------ */

function ManualTab(): React.ReactElement {
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [url, setUrl] = useState('')
  const [linkTitle, setLinkTitle] = useState('')
  const [sourceName, setSourceName] = useState('')
  const importAction = useAsyncAction()
  const linkAction = useAsyncAction()
  const [sortOpen, setSortOpen] = useState(false)
  const [pendingPaths, setPendingPaths] = useState<string[]>([])
  const [pendingSongId, setPendingSongId] = useState('')

  const handleImportFile = () =>
    importAction.run(async () => {
      const t = title.trim()
      if (!t) throw new Error('请输入歌名')
      // 先创建/查找歌曲
      const song = await unwrap(api.library.findOrCreate(t, artist.trim() || undefined))
      setPendingSongId(song.id)

      // 弹出文件选择
      const paths = await unwrap(api.assets.selectFiles())
      if (paths.length === 0) return
      if (paths.length === 1) {
        // 单文件直接导入
        await unwrap(
          api.assets.importFilePath({
            songId: song.id,
            filePath: paths[0]!,
            sourcePolicy: 'user-imported'
          })
        )
        toast.success('已导入 1 个曲谱')
      } else {
        // 多文件弹出排序 Modal
        setPendingPaths(paths)
        setSortOpen(true)
      }
    })

  const saveLink = () =>
    linkAction.run(async () => {
      const t = title.trim()
      if (!t) throw new Error('请输入歌名')
      const u = url.trim()
      if (!u) throw new Error('请输入链接')
      const song = await unwrap(api.library.findOrCreate(t, artist.trim() || undefined))
      await unwrap(
        api.assets.addScoreLink(song.id, {
          url: u,
          title: linkTitle.trim() || null,
          sourceName: sourceName.trim() || null
        })
      )
      toast.success('已保存链接')
      setUrl('')
      setLinkTitle('')
      setSourceName('')
    })

  return (
    <Card title="导入曲谱到新歌曲">
      <div className="field">
        <label className="label">歌名 *</label>
        <input
          className="input"
          placeholder="输入歌名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label className="label">艺人</label>
        <input
          className="input"
          placeholder="可选"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="label">导入本地曲谱文件</label>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={importAction.loading || !title.trim()}
            onClick={handleImportFile}
          >
            {importAction.loading ? '选择中…' : '导入 PDF / 图片文件'}
          </button>
          <span className="hint">支持 PDF 与常见图片格式，可多选。自动创建歌曲记录。</span>
        </div>
      </div>

      <div className="field" style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
        <label className="label">或添加一个网页链接</label>
        <div className="field" style={{ margin: 0 }}>
          <input
            className="input"
            placeholder="https://… （必填）"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="row" style={{ gap: 8, marginTop: 8 }}>
          <input
            className="input grow"
            placeholder="链接标题（可选）"
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
          />
          <input
            className="input grow"
            placeholder="来源站点（可选）"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={linkAction.loading || !title.trim() || !url.trim()}
            onClick={saveLink}
          >
            {linkAction.loading ? '保存中…' : '保存链接'}
          </button>
        </div>
      </div>

      <SortPreviewModal
        open={sortOpen}
        filePaths={pendingPaths}
        songId={pendingSongId}
        onClose={() => setSortOpen(false)}
        onImported={() => setSortOpen(false)}
      />
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 2：免费资源站                                                     */
/* ------------------------------------------------------------------ */

function SourcesTab(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FreeSourceSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const busyRef = useRef<Record<string, boolean>>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const [renameTarget, setRenameTarget] = useState<{
    songId: string; title: string; artist: string | null
  } | null>(null)

  const search = async () => {
    const q = query.trim()
    if (!q) {
      toast.error('请输入搜索关键词')
      return
    }
    setSearching(true)
    setResults(null)
    try {
      setResults(await unwrap(api.sources.searchFreeSources(q)))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  // 一键入库：按标题+艺人 findOrCreate 歌曲，再保存 guistudy 曲谱页 URL（嵌入查看）
  const importToLibrary = async (r: FreeSourceSearchResult) => {
    if (busyRef[r.url]) return
    busyRef[r.url] = true
    try {
      const song = await unwrap(api.library.findOrCreate(r.title, r.artist ?? undefined))
      await unwrap(
        api.assets.addScoreLink(song.id, {
          url: r.url,
          title: r.title,
          sourceName: r.sourceName,
          source: 'guistudy',
          instrument: r.instrument ?? undefined
        })
      )
      setRenameTarget({ songId: song.id, title: song.title, artist: song.artist })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      busyRef[r.url] = false
    }
  }

  return (
    <div>
      <Card title="搜索曲谱（guistudy 谱全了）" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input grow"
            placeholder="输入歌名 / 艺人 / 关键词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search()
            }}
            autoFocus
          />
          <button className="btn btn-primary" disabled={searching} onClick={() => void search()}>
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          在 guistudy 免费曲谱库搜索吉他谱/尤克里里谱。点「一键入库」后本地只保存曲谱页链接，打开时直接在 SongCat 内嵌查看（可播放/循环/变调），不下载文件。
        </div>
      </Card>

      {searching ? (
        <Spinner />
      ) : results === null ? null : results.length === 0 ? (
        <Empty>没有匹配的结果，换一组关键词试试。</Empty>
      ) : (
        <div className="grid grid-auto">
          {results.map((r, i) => (
            <Card key={i}>
              {r.screenshotUrl && (
                <img
                  src={r.screenshotUrl}
                  alt=""
                  style={{ width: '100%', borderRadius: 6, marginBottom: 8 }}
                />
              )}
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{r.title}</div>
              <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
                {r.artist ?? '未知艺人'}
              </div>
              <div className="row wrap" style={{ gap: 4, marginBottom: 8 }}>
                {r.instrument && (
                  <span className="tag">
                    {r.instrument === 'ukulele' ? '尤克里里' : '吉他'}
                  </span>
                )}
                {r.typeLabel && <span className="tag">{r.typeLabel}</span>}
                {r.keyLabel && <span className="tag">{r.keyLabel}</span>}
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setPreviewUrl(r.url)
                    setPreviewTitle(r.title)
                  }}
                >
                  预览
                </button>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={busyRef[r.url]}
                  onClick={() => void importToLibrary(r)}
                >
                  {busyRef[r.url] ? '入库中…' : '一键入库'}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ScorePreviewModal
        open={previewUrl !== null}
        url={previewUrl}
        title={previewTitle}
        onClose={() => { setPreviewUrl(null); setPreviewTitle('') }}
      />
      <RenameModal
        open={renameTarget !== null}
        songId={renameTarget?.songId ?? ''}
        title={renameTarget?.title ?? ''}
        artist={renameTarget?.artist ?? null}
        onClose={() => setRenameTarget(null)}
        onSaved={() => setRenameTarget(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 3：DeepSeek                                                       */
/* ------------------------------------------------------------------ */

function AiTab(): React.ReactElement {
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<AiCandidate[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewTitle, setPreviewTitle] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [renameTarget, setRenameTarget] = useState<{
    songId: string; title: string; artist: string | null
  } | null>(null)

  const search = async () => {
    const q = query.trim()
    if (!q) {
      toast.error('请输入搜索内容')
      return
    }
    setSearching(true)
    try {
      setCandidates(await unwrap(api.ai.searchCandidates({ query: q })))
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSearching(false)
    }
  }

  const openUrl = async (url: string) => {
    try {
      await unwrap(api.system.openExternal(url))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handlePreview = async (c: AiCandidate) => {
    setPreviewLoading(true)
    setPreviewTitle(c.title)
    try {
      const kw = c.artist ? `${c.title} ${c.artist}` : c.title
      const results = await unwrap(api.sources.searchFreeSources(kw))
      if (results.length > 0) {
        setPreviewUrl(results[0].url)
      } else {
        setPreviewUrl(null)
      }
    } catch {
      setPreviewUrl(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  const addToLibrary = async (c: AiCandidate) => {
    try {
      const song = await unwrap(api.library.findOrCreate(c.title, c.artist || undefined))
      // AI 识别出歌后，自动用 guistudy 搜该歌，取第一首曲谱关联入库（一键带谱）
      const kw = c.artist ? `${c.title} ${c.artist}` : c.title
      try {
        const results = await unwrap(api.sources.searchFreeSources(kw))
        if (results.length > 0) {
          // 优先取标题匹配的，避免搜索结果含其他歌时取到不相关的
          const matched = results.filter(
            (r) => r.title.includes(c.title) || c.title.includes(r.title) || (r.artist && c.artist && r.artist.includes(c.artist))
          )
          const top = matched[0] ?? results[0]
          await unwrap(
            api.assets.addScoreLink(song.id, {
              url: top.url,
              title: top.title,
              sourceName: top.sourceName,
              source: 'guistudy',
              instrument: top.instrument ?? undefined
            })
          )
        }
      } catch {
        // 自动找谱失败不阻塞入库
      }
      setRenameTarget({ songId: song.id, title: song.title, artist: song.artist })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div>
      <Card style={{ marginBottom: 16 }}>
        <div className="hint">{DEEPSEEK_PRIVACY_TEXT}</div>
      </Card>

      <Card title="用 DeepSeek 找歌" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input grow"
            placeholder="自然语言、歌名、艺人或一句歌词…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search()
            }}
          />
          <button
            className="btn btn-primary"
            disabled={searching}
            onClick={() => void search()}
          >
            {searching ? '搜索中…' : '搜索'}
          </button>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          DeepSeek 只做辅助建议，结果需要你自行确认，不会自动下载或写入数据库。
        </div>
      </Card>

      {searching ? (
        <Spinner />
      ) : candidates === null ? null : candidates.length === 0 ? (
        <Empty>没有候选结果，换个说法再试一次。</Empty>
      ) : (
        <div className="grid grid-auto">
          {candidates.map((c, i) => (
            <Card key={i}>
              <div className="row-between" style={{ marginBottom: 6 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{c.title}</div>
                  <div className="faint" style={{ fontSize: 12 }}>
                    {c.artist ? c.artist : '待确认'} · 置信度{' '}
                    {Math.round(c.confidence * 100)}%
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button
                    className="btn btn-sm"
                    disabled={previewLoading}
                    onClick={() => void handlePreview(c)}
                  >
                    {previewLoading ? '搜索中…' : '预览'}
                  </button>
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => void addToLibrary(c)}
                  >
                    加入曲库
                  </button>
                </div>
              </div>

              {c.suggestedQueries.length > 0 && (
                <div className="row wrap" style={{ gap: 6, margin: '8px 0' }}>
                  {c.suggestedQueries.map((q, j) => (
                    <span key={j} className="tag">
                      {q}
                    </span>
                  ))}
                </div>
              )}

              {c.possibleSources.length > 0 && (
                <div style={{ margin: '8px 0' }}>
                  <div className="hint" style={{ marginBottom: 4 }}>
                    可能的来源
                  </div>
                  {c.possibleSources.map((s, j) => (
                    <div
                      key={j}
                      className="row-between"
                      style={{ padding: '4px 0', fontSize: 13 }}
                    >
                      <div className="row" style={{ gap: 8 }}>
                        <span>{s.sourceName}</span>
                        <span className="faint" style={{ fontSize: 11 }}>
                          {s.reason}
                        </span>
                      </div>
                      <button
                        className="btn btn-sm"
                        onClick={() => void openUrl(s.url)}
                      >
                        打开
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {c.notes && (
                <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
                  {c.notes}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <ScorePreviewModal
        open={previewUrl !== null || (previewTitle !== '' && previewLoading)}
        url={previewUrl}
        title={previewTitle}
        onClose={() => { setPreviewUrl(null); setPreviewTitle('') }}
      />
      <RenameModal
        open={renameTarget !== null}
        songId={renameTarget?.songId ?? ''}
        title={renameTarget?.title ?? ''}
        artist={renameTarget?.artist ?? null}
        onClose={() => setRenameTarget(null)}
        onSaved={() => setRenameTarget(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 4：粘贴链接                                                       */
/* ------------------------------------------------------------------ */

function LinkTab(): React.ReactElement {
  const { songs, loading } = useSongList()
  const [songId, setSongId] = useState('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [sourceName, setSourceName] = useState('')
  const action = useAsyncAction()

  const save = () =>
    action.run(async () => {
      if (!songId) throw new Error('请先选择歌曲')
      const u = url.trim()
      if (!u) throw new Error('请输入链接')
      await unwrap(
        api.assets.addScoreLink(songId, {
          url: u,
          title: title.trim() || null,
          sourceName: sourceName.trim() || null
        })
      )
      setUrl('')
      setTitle('')
      setSourceName('')
    }, '已保存链接')

  if (loading) return <Spinner />

  return (
    <Card title="粘贴链接到歌曲">
      <div className="field">
        <label className="label">链接 *</label>
        <input
          className="input"
          placeholder="https://…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label">目标歌曲</label>
        <SongSelect songs={songs} value={songId} onChange={setSongId} />
      </div>
      <div className="row" style={{ gap: 8 }}>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">标题（可选）</label>
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">来源站点（可选）</label>
          <input
            className="input"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
        </div>
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button
          className="btn btn-primary"
          disabled={action.loading || !songId || !url.trim()}
          onClick={save}
        >
          {action.loading ? '保存中…' : '保存链接'}
        </button>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 曲谱预览 Modal                                                       */
/* ------------------------------------------------------------------ */

function ScorePreviewModal({
  open,
  url,
  title,
  onClose
}: {
  open: boolean
  url: string | null
  title: string
  onClose: () => void
}): React.ReactElement | null {
  if (!open) return null
  return (
    <Modal open={open} title={`预览：${title}`} onClose={onClose} width={960}>
      {url ? (
        <div style={{ width: '100%', height: 640 }}>
          <GuistudyViewer url={url} height="100%" />
        </div>
      ) : (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-faint)' }}>
          未找到可预览的曲谱页面。
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* 入库后重命名 Modal                                                    */
/* ------------------------------------------------------------------ */

function RenameModal({
  open,
  songId,
  title: initialTitle,
  artist: initialArtist,
  onClose,
  onSaved
}: {
  open: boolean
  songId: string
  title: string
  artist: string | null
  onClose: () => void
  onSaved: () => void
}): React.ReactElement | null {
  const [title, setTitle] = useState(initialTitle)
  const [artist, setArtist] = useState(initialArtist ?? '')
  const action = useAsyncAction()

  useEffect(() => {
    if (open) {
      setTitle(initialTitle)
      setArtist(initialArtist ?? '')
    }
  }, [open, initialTitle, initialArtist])

  const save = () =>
    action.run(async () => {
      if (!title.trim()) throw new Error('歌名不能为空')
      await unwrap(
        api.library.update(songId, {
          title: title.trim(),
          artist: artist.trim() || null
        })
      )
      onSaved()
    }, '曲名已更新')

  return (
    <Modal
      open={open}
      title="确认入库信息"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            保持原名
          </button>
          <button className="btn btn-primary" disabled={action.loading} onClick={save}>
            {action.loading ? '保存中…' : '保存'}
          </button>
        </>
      }
    >
      <div className="field">
        <label className="label">歌名 *</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>
      <div className="field">
        <label className="label">艺人</label>
        <input
          className="input"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />
      </div>
    </Modal>
  )
}
