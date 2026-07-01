/**
 * DeepSeek AI 服务（设计 §9）。
 * 职责：生成候选歌曲、规范化、建议关键词/来源、识别粘贴文本、生成导入草稿。
 * 不做：自动下载、自动写库、替用户确认（设计 §9.1）。
 *
 * 安全（设计 §6、§15.2）：
 *   - Authorization header 不入日志；响应只解析结构化 JSON，不全文打日志。
 *   - 本地 PDF/图片/录音默认不上传。
 */
import { z } from 'zod'
import { getDeepSeekKey, getSettings, markDeepSeekVerified } from './settings'
import type { AiCandidate, AiSearchInput, TestDeepSeekResult } from '@shared'
import { isHttpUrl } from '../utils'
import { aiErr, networkErr, unauthorized, validation } from './errors'

const SYSTEM_PROMPT = `你是音乐曲谱助理。用户会给你：歌词片段、歌手名、歌名，或它们的组合（常只记得歌词不知歌名）。
请识别出歌曲，返回严格的 JSON，结构为：
{"candidates":[{"title":"歌名","artist":"艺人(可空)","confidence":0~1,"lyrics_snippet":"识别所依据的歌词(可空)","suggested_queries":["可在曲谱站搜索的词，如'歌名 艺人'"],"possible_sources":[{"source_name":"站点名","search_query":"该站搜索词","url":"该歌曲乐谱页或搜索页 URL","reason":"推荐理由"}],"notes":"备注"}]}
规则：
- 最多 5 个候选，每个候选必须有非空 title。
- 通过歌词要尽量准确定位歌曲（用 lyrics_snippet 说明识别依据）。
- url 必须是合法 http/https。优先给 guistudy（谱全了）的搜索 URL：https://guistudy.com/tabs?keyword=（歌名+艺人，URL 编码）；其次其他公开免费乐谱站（Ultimate Guitar、吉他社等）。
- 不要编造不存在的具体曲谱页 URL（尤其是 guistudy.com/tabs/{id}，你不知道真实 id，编造会 404）；不确定时一律给该站的搜索 URL。
- 只输出 JSON，不要任何额外文字或代码块标记。`

const sourceSchema = z.object({
  source_name: z.string(),
  search_query: z.string().optional().default(''),
  url: z.string(),
  reason: z.string().optional().default('')
})

const candidateSchema = z.object({
  title: z.string().min(1),
  artist: z.string().nullable().optional().default(''),
  confidence: z.number().min(0).max(1).optional().default(0),
  lyrics_snippet: z.string().optional().default(''),
  suggested_queries: z.array(z.string()).optional().default([]),
  possible_sources: z.array(sourceSchema).optional().default([]),
  notes: z.string().optional().default('')
})

const responseSchema = z.object({
  candidates: z.array(candidateSchema).max(5)
})

function ensureEnabled(): {
  key: string
  baseUrl: string
  model: string | null
  timeoutMs: number
} {
  const settings = getSettings()
  if (!settings.deepSeekEnabled) throw unauthorized('DeepSeek 未启用，请在设置页开启。')
  const key = getDeepSeekKey()
  if (!key) throw unauthorized('未配置 DeepSeek API key。')
  return {
    key,
    baseUrl: settings.deepSeekBaseUrl.replace(/\/$/, ''),
    model: settings.deepSeekModel || null,
    timeoutMs: settings.searchTimeoutMs
  }
}

async function chatJson(opts: {
  baseUrl: string
  key: string
  model: string | null
  timeoutMs: number
  userContent: string
}): Promise<unknown> {
  const body: Record<string, unknown> = {
    // DeepSeek API 必须带 model；用户未填时用默认 deepseek-chat（设计 §9.2：可留空走默认）
    model: opts.model || 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: opts.userContent }
    ],
    stream: false,
    response_format: { type: 'json_object' }
  }

  let res: Response
  try {
    res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.key}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs)
    })
  } catch (e) {
    throw networkErr(`DeepSeek 网络错误：${(e as Error).message}`)
  }
  if (res.status === 401 || res.status === 403) throw unauthorized('DeepSeek API key 无效。')
  if (res.status === 429) throw aiErr('DeepSeek 限速，请稍后重试。')
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw aiErr(`DeepSeek 返回 HTTP ${res.status}${errText ? '：' + errText.slice(0, 300) : ''}`)
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = json.choices?.[0]?.message?.content
  if (!content) throw aiErr('DeepSeek 响应缺少内容。')
  try {
    return JSON.parse(content)
  } catch {
    throw aiErr('DeepSeek 响应不是合法 JSON。')
  }
}

export async function searchCandidates(input: AiSearchInput): Promise<AiCandidate[]> {
  const query = input.query?.trim()
  if (!query) throw validation('请输入搜索内容。')
  const cfg = ensureEnabled()
  const raw = await chatJson({ ...cfg, userContent: query })
  let parsed: z.infer<typeof responseSchema>
  try {
    parsed = responseSchema.parse(raw)
  } catch (e) {
    throw aiErr('DeepSeek 响应结构校验失败。', (e as Error).message)
  }

  return parsed.candidates.map((c) => ({
    title: c.title,
    artist: c.artist ? c.artist : null,
    confidence: c.confidence,
    lyricsSnippet: c.lyrics_snippet,
    suggestedQueries: c.suggested_queries,
    possibleSources: c.possible_sources
      .filter((s) => isHttpUrl(s.url))
      .map((s) => ({
        sourceName: s.source_name,
        searchQuery: s.search_query,
        url: s.url,
        reason: s.reason
      })),
    notes: c.notes
  }))
}

export async function testConnection(): Promise<TestDeepSeekResult> {
  const settings = getSettings()
  const key = getDeepSeekKey()
  const startedAt = Date.now()
  if (!settings.deepSeekEnabled || !key) {
    return {
      ok: false,
      keySuffix: settings.deepSeekKeyLastFour,
      model: settings.deepSeekModel,
      latencyMs: null,
      message: 'DeepSeek 未启用或未配置 key。'
    }
  }
  try {
    await chatJson({
      baseUrl: settings.deepSeekBaseUrl.replace(/\/$/, ''),
      key,
      model: settings.deepSeekModel || null,
      timeoutMs: settings.searchTimeoutMs,
      userContent: 'ping，请返回 {"candidates":[]}'
    })
    markDeepSeekVerified()
    return {
      ok: true,
      keySuffix: settings.deepSeekKeyLastFour,
      model: settings.deepSeekModel,
      latencyMs: Date.now() - startedAt,
      message: '连接成功。'
    }
  } catch (e) {
    return {
      ok: false,
      keySuffix: settings.deepSeekKeyLastFour,
      model: settings.deepSeekModel,
      latencyMs: Date.now() - startedAt,
      message: (e as Error).message
    }
  }
}
