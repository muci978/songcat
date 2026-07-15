/** Settings 页面（设计 §13.4、§6、§8、§15）：曲库 / 资源站 / 搜索 / DeepSeek / 外观 / 关于 */
import { useEffect, useState } from 'react'
import type {
  AppSettings,
  HealthReport,
  PathInfo,
  ResourceSource,
  ResourceSourceKind,
  ResourceSourcePolicy,
  TestDeepSeekResult,
  UpdateInfo
} from '@shared'
import { ACCENT_PALETTE, DEEPSEEK_PRIVACY_TEXT } from '@shared'
import { api, unwrap } from '../lib/api'
import { formatDateTime } from '../lib/format'
import { toast } from '../stores/toast'
import { useSettings } from '../stores/settings'
import { Card, ConfirmDialog, Modal, Spinner, useAsyncAction } from '../components/ui'
import { UpdateDialog } from '../components/UpdateDialog'

const KIND_LABEL: Record<ResourceSourceKind, string> = {
  score: '曲谱',
  audio: '音频',
  mixed: '混合'
}
const POLICY_LABEL: Record<ResourceSourcePolicy, string> = {
  'direct-download': '直接下载',
  'link-only': '仅链接',
  'browser-only': '仅浏览器'
}

export default function Settings(): React.ReactElement {
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)

  const [sources, setSources] = useState<ResourceSource[]>([])
  const [pathInfo, setPathInfo] = useState<PathInfo | null>(null)
  const [appVersion, setAppVersion] = useState<string>('')
  const [healthReport, setHealthReport] = useState<HealthReport | null>(null)
  const [showHealth, setShowHealth] = useState(false)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
  const [showUpdate, setShowUpdate] = useState(false)

  const reloadSources = async (): Promise<void> => {
    try {
      setSources(await unwrap(api.sources.list()))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  useEffect(() => {
    void reloadSources()
    void (async () => {
      try {
        setPathInfo(await unwrap(api.system.getPathInfo()))
      } catch (e) {
        toast.error((e as Error).message)
      }
    })()
    void (async () => {
      try {
        setAppVersion(await unwrap(api.system.appVersion()))
      } catch {
        /* 版本号缺失不致命 */
      }
    })()
  }, [])

  if (!settings) return <Spinner />

  return (
    <div>
      <div className="page-header">
        <h1>设置</h1>
      </div>

      {/* 1. 曲库设置 */}
      <LibrarySettingsCard
        settings={settings}
        pathInfo={pathInfo}
        onHealth={(r) => {
          setHealthReport(r)
          setShowHealth(true)
        }}
      />

      {/* 2. 免费资源站 */}
      <SourcesCard sources={sources} reload={reloadSources} />

      {/* 3. 搜索设置 */}
      <SearchSettingsCard settings={settings} update={update} sources={sources} />

      {/* 4. DeepSeek */}
      <DeepSeekCard settings={settings} update={update} />

      {/* 5. 外观 */}
      <AppearanceCard settings={settings} update={update} />

      {/* 6. 关于 */}
      <AboutCard
        appVersion={appVersion}
        pathInfo={pathInfo}
        onCheckUpdate={async () => {
          try {
            const info = await unwrap(api.updater.checkForUpdate())
            if (info.hasUpdate) {
              setUpdateInfo(info)
              setShowUpdate(true)
            } else {
              toast.success('已是最新版本')
            }
          } catch (e) {
            toast.error((e as Error).message)
          }
        }}
      />

      <HealthReportModal open={showHealth} report={healthReport} onClose={() => setShowHealth(false)} />

      <UpdateDialog
        open={showUpdate}
        info={updateInfo}
        onClose={() => setShowUpdate(false)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. 曲库设置                                                           */
/* ------------------------------------------------------------------ */

function LibrarySettingsCard({
  settings,
  pathInfo,
  onHealth
}: {
  settings: AppSettings
  pathInfo: PathInfo | null
  onHealth: (r: HealthReport) => void
}): React.ReactElement {
  const openFolder = useAsyncAction()
  const exportZip = useAsyncAction()
  const importZip = useAsyncAction()
  const health = useAsyncAction()
  const changeDir = useAsyncAction()
  const resetDir = useAsyncAction()
  const [confirmImport, setConfirmImport] = useState(false)
  const [importZipPath, setImportZipPath] = useState<string | null>(null)

  return (
    <Card title="数据管理" style={{ marginBottom: 20, borderRadius: 'var(--radius)' }}>
      <div className="field">
        <label className="label">数据目录</label>
        <div className="row" style={{ gap: 8 }}>
          <input className="input grow" value={pathInfo?.userDataPath ?? '—'} readOnly />
          <button
            className="btn btn-sm"
            disabled={changeDir.loading}
            onClick={() =>
              changeDir.run(async () => {
                const dir = await unwrap(api.system.selectDataDir())
                if (dir) {
                  toast.success(`已设置数据目录，请重启应用生效\n${dir}`)
                }
              })
            }
          >
            更改
          </button>
          <button
            className="btn btn-sm"
            disabled={resetDir.loading}
            onClick={() =>
              resetDir.run(async () => {
                await unwrap(api.system.resetDataDir())
                toast.success('已恢复默认目录，请重启应用生效')
              })
            }
          >
            恢复默认
          </button>
        </div>
        <div className="hint">更改后需重启应用生效。数据目录包含数据库、曲谱文件、录音、日志等所有数据。</div>
      </div>
      <div className="row wrap" style={{ gap: 10, marginBottom: 20 }}>
        <button
          className="btn"
          disabled={openFolder.loading}
          onClick={() =>
            openFolder.run(async () => {
              await unwrap(api.system.openPath(pathInfo?.userDataPath ?? settings.libraryPath))
            })
          }
        >
          打开数据目录
        </button>
        <button
          className="btn"
          disabled={exportZip.loading}
          onClick={() =>
            exportZip.run(async () => {
              // 弹出文件夹选择导出目录
              const dir = await unwrap(api.system.selectDataDir())
              const { path } = await unwrap(api.backup.exportZip(dir))
              toast.success('已导出到 ' + path)
            })
          }
        >
          {exportZip.loading ? '导出中…' : '导出备份'}
        </button>
        <button
          className="btn"
          disabled={importZip.loading}
          onClick={async () => {
            try {
              const zipPath = await unwrap(api.system.selectZipFile())
              if (zipPath) {
                setImportZipPath(zipPath)
                setConfirmImport(true)
              }
            } catch {
              /* 取消选择 */
            }
          }}
        >
          {importZip.loading ? '导入中…' : '导入备份'}
        </button>
        <button
          className="btn"
          disabled={health.loading}
          onClick={() =>
            health.run(async () => {
              const report = await unwrap(api.health.runCheck())
              onHealth(report)
            })
          }
        >
          {health.loading ? '检查中…' : '运行健康检查'}
        </button>
      </div>
      {pathInfo && (
        <div className="row-between wrap" style={{ gap: 16 }}>
          <PathStat label="数据库" value={pathInfo.dbPath} />
          <PathStat label="日志目录" value={pathInfo.logsPath} />
        </div>
      )}

      <ConfirmDialog
        open={confirmImport}
        title="导入备份"
        danger
        confirmText="导入"
        message="导入备份将覆盖当前所有数据（数据库 + 曲谱文件 + 录音），此操作不可撤销。确定继续吗？"
        onConfirm={() =>
          importZip.run(async () => {
            if (!importZipPath) return
            await unwrap(api.backup.importZip(importZipPath))
            setConfirmImport(false)
            toast.success('备份已导入，请重启应用以确保数据刷新')
          })
        }
        onClose={() => setConfirmImport(false)}
      />
    </Card>
  )
}

function PathStat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="stat grow">
      <div className="stat-label">{label}</div>
      <div className="faint" style={{ fontSize: 12, wordBreak: 'break-all' }}>
        {value}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2. 免费资源站                                                         */
/* ------------------------------------------------------------------ */

function SourcesCard({
  sources,
  reload
}: {
  sources: ResourceSource[]
  reload: () => Promise<void>
}): React.ReactElement {
  const [showCreate, setShowCreate] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<ResourceSource | null>(null)
  const toggleAction = useAsyncAction()
  const removeAction = useAsyncAction()

  return (
    <Card
      title="免费资源站"
      style={{ marginBottom: 20, borderRadius: 'var(--radius)' }}
      actions={
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
          ＋ 新增来源
        </button>
      }
    >
      {sources.length === 0 ? (
        <div className="empty">还没有配置任何免费资源站。</div>
      ) : (
        sources.map((s) => (
          <div
            key={s.id}
            className="list-row"
            style={{ gridTemplateColumns: '1fr auto auto auto', cursor: 'default' }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {s.baseUrl && (
                <div className="faint" style={{ fontSize: 12 }}>
                  {s.baseUrl}
                </div>
              )}
            </div>
            <span className="tag">{KIND_LABEL[s.kind]}</span>
            <span className="tag">{POLICY_LABEL[s.policy]}</span>
            <div className="row" style={{ gap: 8 }}>
              <Toggle
                on={s.enabled}
                disabled={toggleAction.loading}
                onClick={() =>
                  toggleAction.run(async () => {
                    await unwrap(api.sources.update({ id: s.id, enabled: !s.enabled }))
                    await reload()
                  })
                }
              />
              <button className="btn btn-ghost btn-sm" onClick={() => setRemoveTarget(s)}>
                删除
              </button>
            </div>
          </div>
        ))
      )}

      <CreateSourceModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={() => void reload()}
      />

      <ConfirmDialog
        open={!!removeTarget}
        title="删除来源"
        danger
        confirmText="删除"
        message={`确定要删除来源「${removeTarget?.name ?? ''}」吗？`}
        onConfirm={() =>
          removeAction.run(async () => {
            if (!removeTarget) return
            await unwrap(api.sources.remove(removeTarget.id))
            await reload()
            toast.success('已删除来源')
          })
        }
        onClose={() => setRemoveTarget(null)}
      />
    </Card>
  )
}

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        background: on ? 'var(--accent)' : 'var(--bg-subtle)',
        border: on ? '2px solid var(--accent)' : '2px solid var(--border-strong)',
        width: 40,
        height: 24,
        padding: 0,
        borderRadius: 999,
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.15s, border-color 0.15s',
        outline: 'none',
        flexShrink: 0,
      }}
      aria-pressed={on}
      aria-label={on ? '已启用，点击禁用' : '已禁用，点击启用'}
    >
      <span
        style={{
          display: 'block',
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: 'var(--bg-elevated)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          transform: on ? 'translateX(17px)' : 'translateX(-1px)',
          transition: 'transform 0.15s ease',
        }}
      />
    </button>
  )
}

function CreateSourceModal({
  open,
  onClose,
  onCreated
}: {
  open: boolean
  onClose: () => void
  onCreated: () => void
}): React.ReactElement {
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [searchUrlTemplate, setSearchUrlTemplate] = useState('')
  const [kind, setKind] = useState<ResourceSourceKind>('score')
  const [policy, setPolicy] = useState<ResourceSourcePolicy>('link-only')
  const [notes, setNotes] = useState('')
  const action = useAsyncAction()

  const reset = () => {
    setName('')
    setBaseUrl('')
    setSearchUrlTemplate('')
    setKind('score')
    setPolicy('link-only')
    setNotes('')
  }

  const submit = () =>
    action.run(async () => {
      if (!name.trim()) throw new Error('请输入来源名称')
      await unwrap(
        api.sources.create({
          name: name.trim(),
          baseUrl: baseUrl.trim() || null,
          searchUrlTemplate: searchUrlTemplate.trim() || null,
          kind,
          policy,
          notes: notes.trim() || null
        })
      )
      toast.success('已新增来源')
      reset()
      onClose()
      onCreated()
    }, '已新增来源')

  return (
    <Modal
      open={open}
      title="新增免费来源"
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
        <label className="label">名称 *</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label className="label">Base URL</label>
        <input
          className="input"
          placeholder="https://example.com"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="label">搜索 URL 模板</label>
        <input
          className="input"
          placeholder="https://example.com/search?q={q}"
          value={searchUrlTemplate}
          onChange={(e) => setSearchUrlTemplate(e.target.value)}
        />
        <div className="hint">用 {`{q}`} 作为关键词占位符。</div>
      </div>
      <div className="row" style={{ gap: 16, marginBottom: 12 }}>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">类型</label>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as ResourceSourceKind)}>
            <option value="score">曲谱</option>
            <option value="audio">音频</option>
            <option value="mixed">混合</option>
          </select>
        </div>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">下载策略</label>
          <select className="select" value={policy} onChange={(e) => setPolicy(e.target.value as ResourceSourcePolicy)}>
            <option value="direct-download">直接下载</option>
            <option value="link-only">仅链接</option>
            <option value="browser-only">仅浏览器</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label">备注</label>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* 3. 搜索设置                                                           */
/* ------------------------------------------------------------------ */

function SearchSettingsCard({
  settings,
  update,
  sources
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
  sources: ResourceSource[]
}): React.ReactElement {
  const [searchTimeout, setSearchTimeout] = useState(String(settings.searchTimeoutMs))
  const [downloadTimeout, setDownloadTimeout] = useState(String(settings.downloadTimeoutMs))

  // settings 变化时同步本地输入
  useEffect(() => {
    setSearchTimeout(String(settings.searchTimeoutMs))
  }, [settings.searchTimeoutMs])
  useEffect(() => {
    setDownloadTimeout(String(settings.downloadTimeoutMs))
  }, [settings.downloadTimeoutMs])

  const applyTimeout = async (): Promise<void> => {
    try {
      const st = Number(searchTimeout)
      const dt = Number(downloadTimeout)
      if (!Number.isFinite(st) || st <= 0) throw new Error('搜索超时必须为正数')
      if (!Number.isFinite(dt) || dt <= 0) throw new Error('下载超时必须为正数')
      await update({ searchTimeoutMs: st, downloadTimeoutMs: dt })
      toast.success('已保存超时设置')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <Card title="搜索设置" style={{ marginBottom: 16 }}>
      <div className="field">
        <label className="label">默认来源</label>
        <select
          className="select"
          value={settings.defaultResourceSourceId ?? ''}
          onChange={(e) => void update({ defaultResourceSourceId: e.target.value || null })}
        >
          <option value="">（未指定）</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="hint">用于 Add/Search 页面免费资源站搜索的默认来源。</div>
      </div>
      <div className="row" style={{ gap: 16, marginBottom: 12 }}>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">搜索超时（毫秒）</label>
          <input
            className="input"
            type="number"
            min={1000}
            step={1000}
            value={searchTimeout}
            onChange={(e) => setSearchTimeout(e.target.value)}
            onBlur={() => void applyTimeout()}
          />
        </div>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">下载超时（毫秒）</label>
          <input
            className="input"
            type="number"
            min={1000}
            step={1000}
            value={downloadTimeout}
            onChange={(e) => setDownloadTimeout(e.target.value)}
            onBlur={() => void applyTimeout()}
          />
        </div>
      </div>
      <button className="btn btn-sm" onClick={() => void applyTimeout()}>
        保存超时设置
      </button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 4. DeepSeek                                                          */
/* ------------------------------------------------------------------ */

function DeepSeekCard({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}): React.ReactElement {
  const [keyInput, setKeyInput] = useState('')
  const [modelInput, setModelInput] = useState(settings.deepSeekModel ?? '')
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(false)
  const saveKey = useAsyncAction()
  const testAction = useAsyncAction()
  const deleteKeyAction = useAsyncAction()

  useEffect(() => {
    setModelInput(settings.deepSeekModel ?? '')
  }, [settings.deepSeekModel])

  const doSaveKey = () =>
    saveKey.run(async () => {
      if (!keyInput.trim()) throw new Error('请输入 API key')
      await unwrap(api.settings.setDeepSeekKey(keyInput.trim()))
      setKeyInput('')
      toast.success('已保存 DeepSeek API key')
    })

  const doTest = () =>
    testAction.run(async () => {
      const r: TestDeepSeekResult = await unwrap(api.ai.testConnection())
      if (r.ok) {
        toast.success(`连接成功（${r.latencyMs ?? 0}ms）`)
      } else {
        toast.error('失败：' + r.message)
      }
    })

  const doDeleteKey = () =>
    deleteKeyAction.run(async () => {
      await unwrap(api.settings.deleteDeepSeekKey())
      toast.success('已删除 API key')
    })

  return (
    <Card title="DeepSeek" style={{ marginBottom: 16 }}>
      <div className="hint" style={{ marginBottom: 12 }}>
        {DEEPSEEK_PRIVACY_TEXT}
      </div>

      <div className="row-between" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>启用 DeepSeek 搜索</div>
          <div className="faint" style={{ fontSize: 12 }}>
            启用后可在 Add/Search 页使用 AI 智能搜索候选来源。
          </div>
        </div>
        <Toggle on={settings.deepSeekEnabled} onClick={() => void update({ deepSeekEnabled: !settings.deepSeekEnabled })} />
      </div>

      <div className="field">
        <label className="label">API key</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input grow"
            type="password"
            placeholder={settings.deepSeekKeyConfigured ? '已配置（输入新 key 可覆盖）' : 'sk-...'}
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button className="btn btn-primary" disabled={saveKey.loading} onClick={doSaveKey}>
            {saveKey.loading ? '保存中…' : '保存 key'}
          </button>
        </div>
        {settings.deepSeekKeyConfigured && (
          <div className="hint">
            已配置 key（后四位 {settings.deepSeekKeyLastFour ?? '****'}）
            {settings.deepSeekKeyLastVerifiedAt
              ? ` · 最近验证 ${formatDateTime(settings.deepSeekKeyLastVerifiedAt)}`
              : ' · 尚未验证'}
          </div>
        )}
      </div>

      <div className="row wrap" style={{ gap: 10, marginBottom: 20 }}>
        <button className="btn" disabled={!settings.deepSeekKeyConfigured || testAction.loading} onClick={doTest}>
          {testAction.loading ? '测试中…' : '测试连接'}
        </button>
        <button
          className="btn btn-danger"
          disabled={!settings.deepSeekKeyConfigured}
          onClick={() => setConfirmDeleteKey(true)}
        >
          删除 key
        </button>
      </div>

      <div className="field">
        <label className="label">模型名（高级）</label>
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input grow"
            placeholder="留空使用默认模型"
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            onBlur={() => {
              const v = modelInput.trim()
              if (v !== (settings.deepSeekModel ?? '')) void update({ deepSeekModel: v || null })
            }}
          />
          <button
            className="btn btn-sm"
            onClick={() => {
              const v = modelInput.trim()
              if (v !== (settings.deepSeekModel ?? '')) void update({ deepSeekModel: v || null })
            }}
          >
            保存
          </button>
        </div>
        <div className="hint">仅在需要切换 DeepSeek 模型时填写。</div>
      </div>

      <ConfirmDialog
        open={confirmDeleteKey}
        title="删除 API key"
        danger
        confirmText="删除"
        message="删除后 DeepSeek 相关功能将不可用，确定继续吗？"
        onConfirm={doDeleteKey}
        onClose={() => setConfirmDeleteKey(false)}
      />
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 5. 外观                                                              */
/* ------------------------------------------------------------------ */

function AppearanceCard({
  settings,
  update
}: {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => Promise<void>
}): React.ReactElement {
  return (
    <Card title="外观" style={{ marginBottom: 16 }}>
      <div className="row" style={{ gap: 16, marginBottom: 12 }}>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">主题</label>
          <select
            className="select"
            value={settings.theme}
            onChange={(e) => void update({ theme: e.target.value as AppSettings['theme'] })}
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>
        <div className="field grow" style={{ margin: 0 }}>
          <label className="label">列表密度</label>
          <select
            className="select"
            value={settings.listDensity}
            onChange={(e) => void update({ listDensity: e.target.value as AppSettings['listDensity'] })}
          >
            <option value="comfortable">宽松</option>
            <option value="compact">紧凑</option>
          </select>
        </div>
      </div>
      <div className="field" style={{ margin: 0 }}>
        <label className="label">强调色</label>
        <div className="row wrap" style={{ gap: 10 }}>
          {ACCENT_PALETTE.map((c) => {
            const active = settings.accent.toLowerCase() === c.value.toLowerCase()
            return (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={c.name}
                onClick={() => void update({ accent: c.value })}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: active ? '3px solid var(--text)' : '3px solid transparent',
                  background: c.value,
                  cursor: 'pointer',
                  padding: 0,
                  boxShadow: active ? '0 0 0 2px var(--bg-elevated)' : 'none'
                }}
              />
            )
          })}
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 6. 关于                                                              */
/* ------------------------------------------------------------------ */

function AboutCard({
  appVersion,
  pathInfo,
  onCheckUpdate
}: {
  appVersion: string
  pathInfo: PathInfo | null
  onCheckUpdate: () => Promise<void>
}): React.ReactElement {
  const openLogs = useAsyncAction()
  const checkUpdate = useAsyncAction()

  return (
    <Card title="关于" style={{ marginBottom: 16 }}>
      <div className="row-between" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600 }}>SongCat</div>
          <div className="faint" style={{ fontSize: 12 }}>
            版本 {appVersion || '—'}
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-sm"
            disabled={checkUpdate.loading}
            onClick={() => checkUpdate.run(onCheckUpdate)}
          >
            {checkUpdate.loading ? '检查中…' : '检查更新'}
          </button>
          <button
            className="btn btn-sm"
            disabled={openLogs.loading}
            onClick={() =>
              openLogs.run(async () => {
                await unwrap(api.system.openLogsFolder())
              })
            }
          >
            打开日志
          </button>
        </div>
      </div>
      {pathInfo && (
        <div className="row wrap" style={{ gap: 16 }}>
          <PathStat label="数据目录" value={pathInfo.userDataPath} />
          <PathStat label="日志目录" value={pathInfo.logsPath} />
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* 健康检查报告 Modal                                                    */
/* ------------------------------------------------------------------ */

function HealthReportModal({
  open,
  report,
  onClose
}: {
  open: boolean
  report: HealthReport | null
  onClose: () => void
}): React.ReactElement {
  return (
    <Modal
      open={open}
      title="健康检查报告"
      width={620}
      onClose={onClose}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          关闭
        </button>
      }
    >
      {!report ? (
        <div className="empty">无报告</div>
      ) : (
        <>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', marginBottom: 20 }}>
            <ReportStat label="缺失曲谱文件" value={report.missingScoreFiles.length} danger />
            <ReportStat label="缺失录音" value={report.missingRecordings.length} danger />
            <ReportStat label="未完成下载" value={report.unfinishedDownloads.length} warn />
            <ReportStat label="未结束练习" value={report.unfinishedPracticeSessions.length} warn />
            <ReportStat label="孤立临时文件" value={report.orphanTempFiles.length} warn />
            <ReportStat label="数据库完整性" value={report.dbIntegrityOk ? 0 : 1} danger />
            <ReportStat label="外键违反" value={report.foreignKeyViolations.length} danger />
            <ReportStat label="孤立歌曲目录" value={report.orphanSongDirs.length} warn />
            <ReportStat label="孤立曲谱文件" value={report.orphanScoreFiles.length} warn />
          </div>

          {report.missingScoreFiles.length > 0 && (
            <ReportList title={`缺失的曲谱文件（${report.missingScoreFiles.length}）`}>
              {report.missingScoreFiles.map((m) => (
                <li key={m.assetId}>
                  {m.title} <span className="faint">（{m.songId}）</span>
                </li>
              ))}
            </ReportList>
          )}
          {report.missingRecordings.length > 0 && (
            <ReportList title={`缺失的录音（${report.missingRecordings.length}）`}>
              {report.missingRecordings.map((m, i) => (
                <li key={`${m.songId}-${i}`}>{m.title}</li>
              ))}
            </ReportList>
          )}
          {report.unfinishedDownloads.length > 0 && (
            <ReportList title={`未完成的下载任务（${report.unfinishedDownloads.length}）`}>
              {report.unfinishedDownloads.map((d) => (
                <li key={d.jobId}>
                  <span className="faint">{d.sourceUrl}</span>
                </li>
              ))}
            </ReportList>
          )}
          {report.unfinishedPracticeSessions.length > 0 && (
            <ReportList title={`未结束的练习会话（${report.unfinishedPracticeSessions.length}）`}>
              {report.unfinishedPracticeSessions.map((p) => (
                <li key={p.sessionId}>
                  song: <span className="faint">{p.songId}</span>
                </li>
              ))}
            </ReportList>
          )}
          {report.orphanTempFiles.length > 0 && (
            <ReportList title={`孤立临时文件（${report.orphanTempFiles.length}）`}>
              {report.orphanTempFiles.map((f, i) => (
                <li key={`${i}-${f}`} className="faint" style={{ wordBreak: 'break-all' }}>
                  {f}
                </li>
              ))}
            </ReportList>
          )}

          {!report.dbIntegrityOk && (
            <ReportList title={`数据库完整性检查失败`}>
              {report.dbIntegrityErrors.map((e, i) => (
                <li key={i} className="faint" style={{ wordBreak: 'break-all' }}>
                  {e}
                </li>
              ))}
            </ReportList>
          )}
          {report.foreignKeyViolations.length > 0 && (
            <ReportList title={`外键违反（${report.foreignKeyViolations.length}）`}>
              {report.foreignKeyViolations.map((v, i) => (
                <li key={i} className="faint">
                  表 {v.table} 行 {v.rowid} → 引用 {v.parent}（FK ID {v.fkid}）
                </li>
              ))}
            </ReportList>
          )}
          {report.orphanSongDirs.length > 0 && (
            <ReportList title={`孤立歌曲目录（${report.orphanSongDirs.length}）`}>
              {report.orphanSongDirs.map((d, i) => (
                <li key={i} className="faint" style={{ wordBreak: 'break-all' }}>
                  {d}
                </li>
              ))}
            </ReportList>
          )}
          {report.orphanScoreFiles.length > 0 && (
            <ReportList title={`孤立曲谱文件（${report.orphanScoreFiles.length}）`}>
              {report.orphanScoreFiles.map((f, i) => (
                <li key={i} className="faint" style={{ wordBreak: 'break-all' }}>
                  {f}
                </li>
              ))}
            </ReportList>
          )}

          {report.recovered.length > 0 ? (
            <div style={{ marginTop: 16 }}>
              <div className="label" style={{ marginBottom: 6 }}>
                已执行的恢复 / 清理动作
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {report.recovered.map((r, i) => (
                  <li key={i} className="muted" style={{ fontSize: 12 }}>
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="empty" style={{ padding: 16 }}>
              曲库健康，无异常。
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

function ReportStat({
  label,
  value,
  danger,
  warn
}: {
  label: string
  value: number
  danger?: boolean
  warn?: boolean
}): React.ReactElement {
  const color = danger && value > 0 ? 'var(--danger)' : warn && value > 0 ? 'var(--warning)' : 'var(--text)'
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="stat-value" style={{ color }}>
        {value}
      </div>
      <div className="stat-label">{label}</div>
    </div>
  )
}

function ReportList({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="label" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>{children}</ul>
    </div>
  )
}
