# SongCat Windows 桌面应用设计规格

日期：2026-06-30  
状态：已由用户批准进入规格文档阶段  
来源草案：`temp.md`  
目标平台：Windows 桌面应用  
技术栈：Electron + React  
AI 提供商：DeepSeek  
资源策略：只使用免费资源站；尽量下载，但不绕过付费墙、登录限制、DRM、验证码、反爬或站点限制。

> **v0.1.x 修订（2026-07）**：方向调整为「搜索优先 + guistudy 集成」。详见 README 的「v0.1.x 方向调整」：内置免费源精简为只 guistudy；guistudy 曲谱不下载，只存 URL 索引，查看时 webview 嵌入 guistudy 页（CSS 注入去品牌，复用其播放/循环/变调）；新增歌曲走「添加/搜索」一键入库；数据模型加 `source`/`instrument`；曲库加字母索引/排序/批量删除。本文以下为初稿规格，与修订冲突处以修订为准。

---

## 1. 产品定位

SongCat 是一个 Windows 本地优先的个人歌曲/曲谱练习管理器。它首先是本地曲库和练习笔记本：用户可以保存歌曲、PDF/图片/链接曲谱、原曲链接、练习记录、录音和备注。互联网搜索与 DeepSeek 只作为辅助导入能力，不能成为使用软件的前置依赖。

第一版目标是“有边界的完整核心版”：覆盖曲库、导入、免费资源站搜索、DeepSeek 候选建议、本地检索、曲谱查看、练习计时、仪表盘、每首歌最新录音、设置页、Windows 安装与卸载。

---

## 2. 第一版范围

### 2.1 必做能力

- Windows 桌面应用，可安装、可卸载。
- 本地歌曲/曲谱库。
- 歌曲字段：歌名、艺人、添加日期、备注、学习状态、收藏、难度、原曲播放链接。
- 学习状态：`to-learn`、`learning`、`learned`。
- 收藏独立于学习状态。
- 难度为手动 1–5 星，可为空。
- 曲谱资源支持 PDF、图片、链接。
- 手动导入 PDF/图片/链接。
- 免费资源站搜索，只使用免费来源。
- 用户确认后的单项下载。
- 下载失败时可保存链接。
- DeepSeek AI 搜索候选和元数据建议。
- 本地检索：歌名、艺人、拉丁标题首字母、中文拼音首字母、日期、学习状态、收藏。
- 曲谱查看页。
- 练习计时：开始、暂停、继续、结束，离开曲谱页或关闭应用时自动结束已开始的练习。
- Dashboard：歌曲统计、按学习状态与收藏统计、练习时间按年/月/日聚合、每日各歌曲练习占比、艺人占比。
- 每首歌只保留最新一条录音，可录制、试听、替换、删除。
- 可视化设置页：DeepSeek API key、免费资源站、搜索设置、曲库位置、外观、日志与备份。
- 导出备份 zip。
- 安全 IPC、API key 安全存储、外部链接默认系统浏览器打开。

### 2.2 第一版明确不做

这些能力不属于第一版实现范围，会在本文“未来版本扩展”中记录：

- 移动端。
- 云同步。
- 用户账号。
- 多设备同步。
- 社区分享。
- 批量爬取全站资源。
- 绕过登录、验证码、付费墙、DRM、反爬或速率限制。
- 多 AI 提供商。
- 自动识谱。
- 自动和弦识别。
- 内置节拍器。
- 自动滚谱。
- PDF 批注和曲谱编辑。
- 恢复备份导入流程。
- 自动更新体系。

---

## 3. 总体架构

### 3.1 Electron 分层

SongCat 使用标准 Electron 三层结构：

1. **Renderer 进程：React UI**
   - 负责界面、路由、表单、列表、图表、曲谱查看器和设置页。
   - 不直接访问 SQLite、文件系统、API key、系统路径。

2. **Preload 层：安全 IPC 门面**
   - 使用 `contextBridge` 暴露有限 typed API。
   - 不暴露任意文件读写、任意命令执行或原始 Node.js 能力。

3. **Main 进程：本地服务层**
   - 负责 SQLite、文件库、下载任务、DeepSeek 请求、设置、录音文件保存、Windows 用户数据路径、安装卸载相关集成。

### 3.2 主要 IPC API

Preload 暴露的 API 按模块组织：

- `library.searchSongs()`
- `library.createSong()`
- `library.updateSong()`
- `library.deleteSong()`
- `assets.importScoreFile()`
- `assets.addScoreLink()`
- `sources.searchFreeSources()`
- `downloads.startDownload()`
- `ai.searchCandidates()`
- `practice.startSession()`
- `practice.pauseSession()`
- `practice.resumeSession()`
- `practice.stopSession()`
- `recording.saveLatestTake()`
- `settings.get()`
- `settings.set()`
- `backup.exportZip()`

所有 IPC 输入都需要 schema 校验，错误以统一结构返回给 renderer。

### 3.3 核心模块

- **App Shell**：主窗口、导航、全局搜索、状态提示、错误提示。
- **Library**：歌曲 CRUD、状态、收藏、难度、备注。
- **Asset**：PDF/图片/链接曲谱，本地文件复制、hash、来源记录。
- **Search / Import**：本地搜索、免费资源站搜索、DeepSeek 候选、统一导入确认页。
- **Practice**：练习计时、暂停继续、自动停止、异常恢复。
- **Recording**：每首歌最新录音、替换保护、试听、删除。
- **Dashboard**：只读聚合统计。
- **Settings**：DeepSeek、免费资源站、曲库位置、外观、日志、备份。
- **Packaging**：Windows 安装包、卸载、用户数据保留策略。

---

## 4. 本地存储设计

### 4.1 默认目录

默认使用 Electron `app.getPath('userData')` 下的 SongCat 数据目录：

```text
%APPDATA%/SongCat/
  songcat.db
  library/
    songs/
      <song-id>/
        scores/
        images/
        recordings/
        imports/
    cache/
      thumbnails/
      downloads/
  backups/
  logs/
```

安装目录与用户数据目录分离。卸载默认只删除程序，不删除用户曲库。

### 4.2 SQLite 与文件库

- SQLite 保存结构化元数据。
- PDF、图片、录音保存在本地文件库。
- SQLite 不存大文件 blob，只存路径、hash、大小、MIME、来源等。
- 文件名使用 UUID 或 asset ID，不直接使用用户输入，避免非法字符和冲突。

---

## 5. 数据模型

### 5.1 `songs`

```text
id
title
title_pinyin_initial      -- 中文标题拼音首字母，保存时预计算；拉丁标题取首个字母大写
artist
artist_normalized
status                  -- to-learn | learning | learned
is_favorite             -- boolean
difficulty              -- 1-5，可为空
notes
original_audio_url
date_added
date_updated
last_opened_at
```

设计决策：

- `status` 只表示学习状态。
- `is_favorite` 独立保存。
- `artist_normalized` 用于搜索和统计。
- `title_pinyin_initial` 在歌曲创建/更新时由 main 进程预计算：中文标题取每个汉字的拼音首字母（如“简单爱”→“JDA”），拉丁标题取首字母大写；用于首字母检索，避免运行时全文拼音转换。
- `original_audio_url` 是原曲播放链接的唯一权威存储；`source_links(kind=audio)` 仅用于记录来源站点级的音频引用（如试听页），二者不重复存储同一链接。设置原曲链接时若 `source_links` 中无对应记录，可同时写入一条 `kind=audio` 来源记录用于溯源。
- `original_audio_url` 默认只保存链接，不下载音频。

### 5.2 `score_assets`

```text
id
song_id
type                    -- pdf | image | link
title
local_path
source_url
source_name
source_policy           -- free-direct | free-link-only | user-imported | unknown
file_hash
file_size
mime_type
original_filename
date_added
is_primary
```

设计决策：

- 一首歌可有多个曲谱资源。
- `is_primary` 表示默认打开资源。
- link 类型可无 `local_path`。
- 所有外部资源保留来源。

### 5.3 `source_links`

```text
id
song_id
url
source_name
kind                    -- score | audio | reference | search-result
title
notes
date_added
last_checked_at
```

### 5.4 `practice_sessions`

```text
id
song_id
started_at
ended_at
duration_seconds
last_heartbeat_at       -- 练习中每 30 秒更新一次，用于异常恢复
stop_reason             -- manual | leave-score-view | switch-song | app-close | recovery
created_at
```

Dashboard 所有统计都从原始 session 聚合，不维护手工 counter。

### 5.5 `recordings`

```text
id
song_id
local_path
file_hash
file_size
duration_seconds
recorded_at
mime_type
```

`recordings.song_id` 设唯一约束，保证每首歌只有一条当前录音。

### 5.6 `resource_sources`

```text
id
name
base_url
search_url_template
enabled
kind                    -- score | audio | mixed
policy                  -- direct-download | link-only | browser-only
notes
created_at
updated_at
```

只内置免费资源站。用户可新增自定义免费来源。

### 5.7 `download_jobs`

```text
id
song_id
source_url
source_name
target_asset_id
status                  -- pending | running | completed | failed | cancelled
error_message
started_at
completed_at
created_at
```

### 5.8 `settings`

```text
key
value_json
updated_at
```

API key 不明文存入此表。

---

## 6. API key 与敏感信息

DeepSeek API key 使用系统安全存储：优先 Windows Credential Manager 或 Electron 生态中的 `keytar`。SQLite 只保存：

- 是否已配置。
- 最后验证时间。
- key 后四位。

设置页支持：新增/替换 key、测试连接、删除 key。

日志中不能记录：

- 完整 API key。
- Authorization header。
- 本地 PDF/图片/录音内容。
- 默认完整 DeepSeek 响应。

---

## 7. 导入与搜索设计

### 7.1 统一导入确认页

所有导入路径最终进入同一个确认页：

- 手动导入。
- 免费资源站结果。
- DeepSeek 候选。
- 粘贴链接。

确认页包含：

- 歌名。
- 艺人。
- 学习状态。
- 收藏。
- 难度。
- 备注。
- 曲谱资源。
- 来源站点。
- 原始 URL。
- 下载状态。
- 原曲播放链接。

只有用户点击“保存到曲库”后才写入数据库和本地文件库。

### 7.2 手动导入

用户选择 PDF、图片或输入链接。文件导入流程：

1. renderer 选择文件。
2. main 校验文件类型。
3. 计算 hash。
4. 复制到对应歌曲目录。
5. 写入 `score_assets`。
6. 返回导入结果。

导入后不依赖原始路径。

### 7.3 本地搜索

支持：

- 歌名。
- 艺人。
- 备注。
- 首字母。
- 添加日期。
- 学习状态。
- 收藏。
- 难度。
- 是否有 PDF。
- 是否有录音。
- 是否有练习记录。

第一版使用普通索引 + SQLite FTS。中文搜索先支持普通包含匹配；中文拼音首字母检索通过保存时预计算 `title_pinyin_initial` 字段实现（见 5.1）。分词作为未来增强。

---

## 8. 免费资源站与下载策略

### 8.1 来源策略

每个免费资源站有能力档案：

- `direct-download`：明确允许直接下载公开 PDF/图片文件。
- `link-only`：保存网页链接，不自动抓取。
- `browser-only`：用系统浏览器打开，不在 app 内抓取。

### 8.2 “尽量下载”的定义

第一版将“尽量下载”定义为：

> 在免费资源站中，对用户明确选择的单个资源，如果它公开可访问、无需登录、无需验证码、无 DRM、无付费墙、无需反爬绕过，并且能识别为 PDF/图片文件，则 SongCat 尝试下载；否则保存链接并引导用户手动导入。

第一版不做批量爬取，不自动扫全站，不绕过限制。

### 8.3 下载流程

1. 用户选择结果。
2. SongCat 显示来源、URL、文件类型、保存目标。
3. 用户确认。
4. 下载到 `library/cache/downloads/<job-id>.tmp`。
5. 检查 MIME type 与扩展名。
6. 只接受 PDF/图片。
7. 计算 hash。
8. 移动到 song asset 目录。
9. 写入 `score_assets` 与 `source_links`。
10. 清理临时文件。

失败时记录原因，并允许保存链接。

第一版下载任务为“触发即忘 + 单项确认”：`download_jobs` 表保留状态用于健康检查与失败重试，renderer 通过确认页获知即时结果；失败/取消的残留任务由健康检查（15.3）暴露并清理。第一版不提供独立的下载队列 UI。

---

## 9. DeepSeek AI 导入设计

### 9.1 DeepSeek 的职责

DeepSeek 只做辅助建议：

- 根据自然语言查询生成候选歌曲。
- 规范化歌名和艺人。
- 建议搜索关键词。
- 建议可能的免费资源站搜索入口。
- 识别用户粘贴文本中的歌名、艺人、链接。
- 生成结构化导入草稿。

DeepSeek 不做：

- 自动判定版权。
- 自动绕过站点限制。
- 自动下载文件。
- 直接写入数据库。
- 替用户确认资源真实性。

### 9.2 API 设计

按 DeepSeek OpenAI-compatible `/chat/completions` 风格设计：

- Base URL：`https://api.deepseek.com`
- Header：`Authorization: Bearer <DEEPSEEK_API_KEY>`
- 第一版使用非流式 `stream: false`，因为 AI 搜索结果是短 JSON。
- 模型名不写死在业务逻辑中，设置页提供高级模型字段。第一版默认不内置模型名，首次使用 DeepSeek 前需用户在设置页填写或确认模型名；用户可留空以使用 DeepSeek 默认行为。

### 9.3 结构化输出

建议 schema：

```json
{
  "candidates": [
    {
      "title": "string",
      "artist": "string",
      "confidence": 0.0,
      "suggested_queries": ["string"],
      "possible_sources": [
        {
          "source_name": "string",
          "search_query": "string",
          "url": "string",
          "reason": "string"
        }
      ],
      "notes": "string"
    }
  ]
}
```

规则：

- 最多 5 个候选。
- 每个候选必须有歌名。
- 艺人可为空，但 UI 标记“待确认”。
- `confidence` 只作提示，不作事实。
- URL 必须校验。
- 响应必须 schema validate。
- 解析失败时提示重试，不保存半截数据。

### 9.4 隐私提示

设置页与 AI 搜索页提示：

> DeepSeek 搜索会把你的搜索关键词发送给 DeepSeek。SongCat 不会默认上传你的本地 PDF、图片或录音。

---

## 10. 曲谱查看与练习计时

### 10.1 Practice View

Practice View 是练习中心，包含：

- 歌名、艺人、学习状态、收藏、难度。
- PDF/图片曲谱查看区。
- 链接曲谱打开按钮。
- 练习计时器。
- 原曲链接。
- 备注。
- 录音控制。
- 最近练习记录。

第一版支持：PDF 翻页、图片缩放、适应宽度、专注模式、打开本地文件位置、打开来源链接。

第一版不做：批注、曲谱编辑、自动滚谱、节拍器、和弦识别。

### 10.2 计时规则

用户进入曲谱页后，计时器默认不自动开始。用户点击“开始练习”后开始计时。这样避免用户只是查看或整理曲谱时产生脏数据。

已开始的练习在以下情况自动结束：

- 离开当前曲谱查看页。
- 切换到另一首歌。
- 关闭应用窗口。
- 应用退出。
- 异常未结束 session 下次启动恢复。

支持暂停与继续。暂停期间不累计时长。SQLite 最终存净练习时长。

### 10.3 异常恢复

如果启动时发现 `ended_at` 为空的 session：

- 优先使用 `last_heartbeat_at` 补齐 `ended_at`。
- 如果无心跳（`last_heartbeat_at` 为空），令 `ended_at = min(now, started_at + 60 分钟)` 作为会话时长上限，并在日志中标记该 session 时长不可信。
- `duration_seconds` 由补齐后的 `ended_at - started_at` 计算；暂停期间累计的暂停时长从净时长中扣除。
- 标记 `stop_reason = recovery`。
- 写日志。

计时不自动改变歌曲学习状态，只可提示用户是否将 `to-learn` 改为 `learning`。

---

## 11. 录音设计

每首歌只保留最新一条录音。

流程：

1. 用户点击开始录音。
2. UI 明确显示正在录音。
3. 用户停止录音。
4. 新录音保存为临时文件。
5. 用户试听。
6. 用户点击“保存为最新录音”。
7. 如果已有录音，提示替换确认。
8. 新文件移动到 `recordings` 目录并确认落盘。
9. 在单个事务中更新 `recordings` 表（插入/更新新行）。
10. 事务提交成功后才删除旧文件。

录音替换的事务顺序：新文件确认落盘 → DB 事务提交 → 删除旧文件。任何一步失败都不得删除旧录音，旧 DB 行与旧文件必须保留。

录音默认只保存在本地，不上传。

---

## 12. Dashboard 设计

Dashboard 展示：

- 总歌曲数。
- 想学数量。
- 学习中数量。
- 已学会数量。
- 收藏数量。
- 今日练习分钟。
- 本月练习分钟。
- 今年练习分钟。
- 练习时间趋势。
- 今日各歌曲练习占比。
- 艺人占比。
- 最近练习歌曲。

Dashboard 聚合在 main 进程/SQLite 层完成，renderer 只接收轻量图表数据。

---

## 13. UI 与设置页

### 13.1 导航

一级导航：

- Dashboard。
- Library。
- Add/Search。
- Settings。

歌曲详情和 Practice View 从 Library 或搜索结果进入，不作为一级导航。

### 13.2 Library

支持列表和卡片展示，默认列表。支持搜索、状态筛选、收藏筛选、艺人筛选、日期排序、难度筛选、是否有曲谱、是否有录音。

### 13.3 Add/Search

分为四个 tab：

- 手动导入。
- 免费资源站。
- DeepSeek。
- 粘贴链接。

### 13.4 Settings

设置页分组：

- 曲库设置：查看当前曲库位置、打开曲库文件夹、导出备份、健康检查、清理临时下载。（第一版不支持修改曲库位置，迁移到自定义目录为未来版本，见 19.5。）
- 免费资源站：内置来源、启用/禁用、新增自定义免费来源、来源策略。
- 搜索设置：默认搜索引擎、搜索超时、下载超时。
- DeepSeek：API key、测试连接、删除 key、模型名高级设置、启用/禁用。
- 外观：跟随系统、浅色、深色、强调色、列表密度。
- 关于：版本号、数据目录、日志目录、打开日志。

### 13.5 视觉风格

风格方向：温暖、清爽、音乐练习笔记本。

要求：

- 背景柔和。
- 强调色可使用木色、暖橙、琥珀或柔和蓝绿色。
- 中文显示清晰。
- 轻微圆角与轻阴影。
- 图表少颜色、标签清晰。
- 下载功能不作为视觉中心。

避免：

- 过度紫色渐变。
- 复杂毛玻璃。
- 大量动画。
- 音乐播放器式重封面视觉。
- 后台管理系统式密集表格。

---

## 14. Windows 安装与用户数据策略

使用 `electron-builder` + NSIS 生成 Windows 安装包。

安装体验：

- 一键安装。
- 开始菜单快捷方式。
- 可选桌面快捷方式。
- 安装完成后可启动应用。
- 支持卸载。

目录策略：

```text
安装目录：
  C:\Users\<user>\AppData\Local\Programs\SongCat\

用户数据：
  C:\Users\<user>\AppData\Roaming\SongCat\
```

卸载默认保留用户数据。只有用户明确选择“同时删除 SongCat 曲库、数据库、录音和设置”时才删除用户数据目录。

---

## 15. 备份、日志与健康检查

### 15.1 备份

第一版提供导出备份 zip：

```text
SongCat Backup.zip
  manifest.json
  songcat.db
  library/
```

备份不包含明文 API key。

### 15.2 日志

记录：

- 应用启动失败。
- 数据库错误。
- 文件导入失败。
- 下载失败。
- DeepSeek 调用失败。
- 录音失败。
- 练习 session 恢复。

不记录完整 API key、本地文件内容、完整 AI 响应。

### 15.3 健康检查

设置页提供库健康检查：

- 数据库记录指向的文件是否存在。
- 录音文件是否存在。
- 未完成下载任务是否需要清理。
- 未结束 practice session 是否需要恢复。
- 是否有孤立临时文件。

---

## 16. 测试策略

### 16.1 测试分层

- 单元测试：领域模型、数据转换、DeepSeek 响应解析、来源策略、时间聚合、路径校验。
- 服务层测试：SQLite repository、文件导入、下载任务、练习 session、录音替换、设置读写。
- Electron IPC 测试：typed API、参数校验、错误格式、安全边界。
- 端到端/手动验收：安装、创建歌曲、导入曲谱、搜索、计时、录音、导出备份、卸载。

### 16.2 关键测试场景

必须覆盖：

- 创建、编辑、删除歌曲。
- 导入 PDF/图片/链接。
- 重复导入同一文件。
- 导入不支持文件类型。
- 本地搜索与筛选。
- `direct-download` / `link-only` / `browser-only` 来源策略。
- 下载成功、失败、取消、MIME 不匹配。
- DeepSeek 未配置 key、无效 key、网络超时、非 JSON、缺字段、正常候选。
- 练习开始、暂停、继续、结束、离开页面自动结束、应用关闭恢复。
- 录音权限失败、录音保存、替换失败保护旧录音。
- Dashboard 空状态、有数据状态、多天多歌曲统计。
- 设置页修改、备份导出、清理日志。
- 安装包安装、卸载、默认保留用户数据。

---

## 17. 风险边界

### 17.1 资源与版权风险

设计边界：

- 只内置免费资源站。
- 只对用户选择的单个资源尝试下载。
- 不做批量爬取。
- 不绕过限制。
- 保存来源和 URL。
- 不保证 AI 推荐资源一定可下载或可用。

UI 必须提示：

> 请确认你有权保存和使用该资源。SongCat 只帮助你管理个人曲库和免费公开资源链接。

### 17.2 AI 幻觉风险

DeepSeek 结果必须 schema validate、URL validate，并经用户确认。AI 结果标记为“DeepSeek 建议”。AI 不自动写库、不自动下载。

### 17.3 数据丢失风险

高风险操作：删除歌曲、替换录音、下载文件移动、数据库迁移、卸载。

应对：确认弹窗、事务化写入、临时文件 staging、旧录音延后删除、导出备份、卸载默认保留数据。

### 17.4 Electron 安全风险

- Renderer 无 Node 直接权限。
- IPC 白名单。
- 参数校验。
- 不加载任意远程网页到特权上下文。
- 外部链接走系统浏览器。

### 17.5 性能风险

建议目标：

```text
冷启动：目标 < 3 秒
空闲内存：目标 < 250 MB
打开曲库 1000 首：列表仍可流畅滚动
PDF 渲染：目标按不超过 50 页的文档验收，翻页无明显卡顿
打开/关闭大 PDF 后：内存可回落
Dashboard 查询：目标 < 500 ms
```

通过懒加载、虚拟列表、main 进程聚合、文件不进 React state、释放 object URL 和 media stream 控制风险。

---

## 18. 最终验收标准

第一版完成时应满足：

### 曲库

- 可以创建、编辑、删除歌曲。
- 每首歌有标题、艺人、添加日期、备注、学习状态、收藏、难度。
- 支持 `to-learn`、`learning`、`learned`。
- 收藏独立于学习状态。
- 可以添加 PDF、图片、链接曲谱。
- 可以添加原曲播放链接。
- 可以按标题、艺人、拉丁标题首字母、中文拼音首字母、日期、学习状态、收藏检索。

### 免费资源站

- 设置页能管理免费资源站。
- 只内置免费来源。
- 支持至少一种可直接下载的来源策略。
- 支持 link-only 和 browser-only 来源策略。
- 下载必须用户确认。
- 下载资源保留来源记录。
- 下载失败可保存链接。

### DeepSeek

- 设置页能配置、测试、删除 API key。
- AI 搜索能返回候选。
- 候选必须 schema validate。
- 候选必须用户确认后保存。
- AI 错误不会污染数据库。
- 本地 PDF、图片、录音不会默认上传给 DeepSeek。

### 曲谱与练习

- 可以查看 PDF/图片曲谱。
- 链接曲谱可打开系统浏览器。
- 可以开始、暂停、继续、结束练习。
- 离开曲谱页或关闭应用会自动停止已开始的练习。
- Dashboard 能显示年/月/日练习分钟。
- Dashboard 能显示每日各歌曲练习占比。

### 录音

- 每首歌可以录音。
- 可以试听。
- 保存后成为该歌最新录音。
- 每首歌只保留最新一条录音。
- 替换失败不会删除旧录音。
- 录音本地保存。

### 设置与安装

- 有可视化设置页。
- 支持导出备份。
- 设置页提供健康检查，覆盖 15.3 所列全部检查项。
- Windows 安装包可安装和卸载。
- 卸载默认保留用户数据。
- 用户明确选择时才删除曲库数据。

### 安全与维护

- Renderer 无 Node 直接权限。
- IPC 有明确接口。
- API key 不明文写数据库或日志。
- 下载、导入、AI 保存都走统一确认页。
- 代码模块边界清晰，可分别测试。

---

## 19. 未来版本扩展

以下功能本次暂不实现，但设计应尽量为未来扩展保留空间：

### 19.1 跨端与同步

- 移动端应用。
- 多设备同步。
- 云端备份。
- 用户账号。
- 局域网同步。
- Web 版或 PWA。

### 19.2 曲谱与练习增强

- PDF 批注。
- 曲谱文本编辑。
- 和弦/Tab 文本编辑器。
- 自动滚谱。
- 节拍器。
- 调号/变调辅助。
- 和弦图显示。
- 自动识别曲谱结构。
- 自动提取歌词、和弦或 Tab。
- 练习目标、计划、提醒。
- 练习 streak 与成就。

### 19.3 搜索与资源增强

- 中文分词检索（拼音首字母已在第一版支持）。
- 用户自定义来源模板的高级编辑。
- 资源站健康检查。
- 更完善的下载队列。
- 更完善的来源策略说明。
- 资源去重与相似匹配。
- 浏览器扩展或右键菜单导入。

### 19.4 AI 能力增强

- 多 AI 提供商。
- OpenAI-compatible 自定义 endpoint。
- 本地 LLM / Ollama。
- AI 元数据清洗。
- AI 重复歌曲检测。
- AI 生成练习建议。
- AI 从用户粘贴的网页文本中提取结构化曲目信息。
- AI 辅助整理备注。

### 19.5 数据管理增强

- 备份恢复。
- 自动备份。
- 数据迁移向导。
- 曲库迁移到自定义目录。
- 数据库版本迁移 UI。
- 导出 CSV/JSON。
- 导入其他曲库格式。

### 19.6 分发与维护增强

- 自动更新。
- 代码签名。
- 崩溃报告。
- 更完善的诊断包导出。
- 插件系统。
- 主题市场或更多视觉主题。

### 19.7 社区与分享

- 曲单分享。
- 练习记录导出为报告。
- 与朋友共享歌单。
- 社区曲谱收藏，但必须重新设计版权与来源策略。

---

## 20. 设计结论

SongCat 第一版应实现一个完整、可靠、漂亮的 Windows 本地曲谱练习管理器。它以本地 SQLite 与文件库为核心，用免费资源站和 DeepSeek 辅助发现资源，但所有外部内容必须经过用户确认后保存。第一版的成功标准不是“自动找到所有曲谱”，而是让用户能稳定地建立、维护和练习自己的个人曲库，同时保留来源、保护数据、控制风险，并为未来扩展留下清晰边界。
