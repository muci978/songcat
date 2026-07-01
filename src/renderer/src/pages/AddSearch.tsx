/** AddSearch 页面（设计 §7、§13.3、§8、§9）：
 *  四个 tab：手动导入 / 免费资源站 / DeepSeek / 粘贴链接。
 *  歌曲选择器在多 tab 间复用；外部链接统一走系统浏览器。 */
import { useEffect, useRef, useState } from 'react'
import type {
  AiCandidate,
  FreeSourceSearchResult,
  ResourceSourcePolicy,
  SongSummary
} from '@shared'
import { DEEPSEEK_PRIVACY_TEXT, DISCLAIMER_TEXT } from '@shared'
import { api, unwrap } from '../lib/api'
import { truncate } from '../lib/format'
import { toast } from '../stores/toast'
import { Card, Empty, Spinner, useAsyncAction } from '../components/ui'

type TabKey = 'manual' | 'sources' | 'ai' | 'link'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'manual', label: '手动导入' },
  { key: 'sources', label: '免费资源站' },
  { key: 'ai', label: 'DeepSeek' },
  { key: 'link', label: '粘贴链接' }
]

const POLICY_LABEL: Record<ResourceSourcePolicy, string> = {
  'direct-download': '可直下载',
  'link-only': '仅链接',
  'browser-only': '浏览器打开'
}

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
        setSongs(list)
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
  const { songs, loading } = useSongList()
  const [songId, setSongId] = useState('')
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [sourceName, setSourceName] = useState('')
  const importAction = useAsyncAction()
  const linkAction = useAsyncAction()

  const importFile = () =>
    importAction.run(async () => {
      if (!songId) throw new Error('请先选择歌曲')
      const a = await unwrap(api.assets.importFileDialog(songId))
      if (a) toast.success('已导入：' + (a.title || '曲谱'))
    })

  const saveLink = () =>
    linkAction.run(async () => {
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
      toast.success('已保存链接')
      setUrl('')
      setTitle('')
      setSourceName('')
    })

  if (loading) return <Spinner />

  return (
    <Card title="选择目标歌曲">
      <div className="field">
        <label className="label">歌曲</label>
        <SongSelect songs={songs} value={songId} onChange={setSongId} />
      </div>

      <div className="field">
        <label className="label">导入本地曲谱文件</label>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={importAction.loading || !songId}
            onClick={importFile}
          >
            {importAction.loading ? '导入中…' : '导入 PDF / 图片文件'}
          </button>
          <span className="hint">支持 PDF 与常见图片格式，导入后保存到歌曲目录。</span>
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
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            className="input grow"
            placeholder="来源站点（可选）"
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
          />
          <button
            className="btn btn-primary"
            disabled={linkAction.loading || !songId || !url.trim()}
            onClick={saveLink}
          >
            {linkAction.loading ? '保存中…' : '保存链接'}
          </button>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Tab 2：免费资源站                                                     */
/* ------------------------------------------------------------------ */

function SourcesTab(): React.ReactElement {
  const { songs, loading } = useSongList()
  const [songId, setSongId] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FreeSourceSearchResult[] | null>(null)
  const [searching, setSearching] = useState(false)
  const dlBusyRef = useRef<Record<string, boolean>>({})

  const search = async () => {
    const q = query.trim()
    if (!q) {
      toast.error('请输入搜索关键词')
      return
    }
    setSearching(true)
    try {
      setResults(await unwrap(api.sources.searchFreeSources(q)))
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

  const downloadDirect = async (r: FreeSourceSearchResult) => {
    if (!songId) {
      toast.error('请先选择目标歌曲')
      return
    }
    const key = r.url
    if (dlBusyRef[key]) return
    dlBusyRef[key] = true
    try {
      const res = await unwrap(
        api.downloads.startDownload({
          songId,
          sourceUrl: r.url,
          sourceName: r.sourceName,
          sourcePolicy: r.sourcePolicy,
          title: r.title
        })
      )
      if ('status' in res) {
        toast.error('下载失败：' + (res.errorMessage ?? '未知错误'))
        toast.info('可改用「保存链接」记录此页面')
      } else {
        toast.success('已下载到所选歌曲：' + (res.title || r.title || '曲谱'))
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      dlBusyRef[key] = false
    }
  }

  const saveLink = async (r: FreeSourceSearchResult) => {
    if (!songId) {
      toast.error('请先选择目标歌曲')
      return
    }
    try {
      await unwrap(
        api.assets.addScoreLink(songId, {
          url: r.url,
          title: r.title,
          sourceName: r.sourceName
        })
      )
      toast.success('已保存链接')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (loading) return <Spinner />

  return (
    <div>
      <Card title="选择目标歌曲" style={{ marginBottom: 16 }}>
        <SongSelect songs={songs} value={songId} onChange={setSongId} />
      </Card>

      <Card title="搜索免费资源站" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input grow"
            placeholder="输入歌名 / 艺人 / 关键词…"
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
          SongCat 只保存公开页面链接；只有明确允许直下载的资源站才会尝试下载到本地。
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
              <div className="row-between" style={{ marginBottom: 6 }}>
                <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                  <span className="badge">{POLICY_LABEL[r.sourcePolicy]}</span>
                  <span className="faint" style={{ fontSize: 12 }}>
                    {r.sourceName}
                  </span>
                </div>
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {r.title ?? '（无标题）'}
              </div>
              <div className="faint row" style={{ fontSize: 12, gap: 6, marginBottom: 8 }}>
                <span>{truncate(r.url, 70)}</span>
              </div>
              {r.snippet && (
                <div className="faint" style={{ fontSize: 12, marginBottom: 8 }}>
                  {r.snippet}
                </div>
              )}
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm" onClick={() => void openUrl(r.url)}>
                  打开
                </button>
                {r.sourcePolicy === 'direct-download' && (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={!songId}
                    onClick={() => void downloadDirect(r)}
                  >
                    下载到所选歌曲
                  </button>
                )}
                <button
                  className="btn btn-sm"
                  disabled={!songId}
                  onClick={() => void saveLink(r)}
                >
                  保存链接
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
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

  const addToLibrary = async (c: AiCandidate) => {
    try {
      await unwrap(
        api.library.create({
          title: c.title,
          artist: c.artist || null,
          status: 'to-learn'
        })
      )
      toast.success('已加入曲库，可在曲库继续导入曲谱')
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
                <button
                  className="btn btn-sm btn-primary"
                  onClick={() => void addToLibrary(c)}
                >
                  加入曲库
                </button>
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
