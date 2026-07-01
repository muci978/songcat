# SongCat

Windows 本地优先的个人歌曲 / 曲谱练习管理器。本地 SQLite 曲库 + 文件库为核心，免费资源站与 DeepSeek 仅作辅助导入，所有外部内容须经用户确认后保存。

> 设计规格见 `2026-06-30-songcat-design.md`。

## 技术栈

- **Electron + React + TypeScript**（main / preload / renderer 三层）
- **better-sqlite3**（同步 SQLite，main 进程）
- **Electron safeStorage**（API key 加密存储，Windows 走 DPAPI）
- **pinyin-pro**（中文拼音首字母预计算）
- **zod**（IPC 参数与 DeepSeek 响应校验）
- **recharts**（Dashboard 图表）· **zustand**（renderer 状态）· **react-router**（HashRouter）
- **adm-zip**（备份 zip）· **electron-log**（日志）
- **electron-builder + NSIS**（Windows 安装包）

## 目录结构

```
src/
  shared/            # 三端共享：类型、IPC 契约、枚举、常量
  main/
    index.ts         # 主进程入口：窗口、自定义协议、初始化、异常恢复、关闭钩子
    db/              # 连接、schema、迁移、种子、映射、8 张表的 repositories
    services/        # 业务服务：library/asset/practice/recording/ai/sources/download/dashboard/backup/health/settings
    ipc/             # IPC handler 注册（统一 IpcResult 包装）
    lib/             # paths（文件库目录树）、logger、filestore（导入/落盘/hash）
    security/        # keychain（safeStorage 封装）
    utils/           # 纯函数：pinyin/normalize/time/aggregate/path/mime/url/crypto/id
  preload/
    index.ts         # contextBridge 暴露 typed API（SongCatApi），无 Node 直接权限
  renderer/
    src/
      pages/         # Dashboard / Library / AddSearch / SongDetail / Practice / Settings
      components/    # Layout（侧边栏+toast）、ui（Card/Modal/Stars/ConfirmDialog…）
      stores/        # settings（主题/强调色应用）、toast
      lib/           # api（unwrap）、format
      styles/        # global.css（设计系统：温暖笔记本风格 + 暗色 + 强调色）
tests/               # vitest：纯函数 + repository（:memory: SQLite）
```

## 开发命令

```bash
npm install              # 安装依赖（native 模块 better-sqlite3 会编译/下载预构建）
npm run dev              # 启动开发（electron-vite dev）
npm run typecheck        # 全量类型检查（node + web）
npm run test             # 单元测试
npm run build            # 构建产物到 out/（main + preload + renderer）
npm run build:win        # 打包 Windows NSIS 安装包（需在 Windows 或配 wine）
```

## 关键设计落点

- **安全 IPC**：Renderer 无 Node 权限；preload 仅暴露 `window.songcat`（SongCatApi）；所有输入 zod/手动校验；外部链接走系统浏览器；本地文件经自定义协议 `songcat-asset://` / `songcat-recording://` 访问，路径不暴露给 renderer（防越界）。
- **API key**：DeepSeek key 用 Electron safeStorage 加密落盘，DB 只存「是否已配置 / 后四位 / 最后验证时间」，不入日志。
- **练习计时**：进入曲谱页不自动开始；点击开始后计时；离开/切歌/关应用自动结束；心跳每 30s 落库；启动异常恢复补齐未结束会话（用 last_heartbeat_at，无心跳则按 60 分钟上限）。
- **录音替换事务**：新文件落盘 → DB 事务提交 → 删旧文件；任一步失败都保留旧录音。
- **下载策略**：`direct-download` 才尝试下载并校验 MIME（仅 PDF/图片）；疑似付费墙/登录（返回 HTML）即拒绝并提示保存链接；绝不绕过限制。
- **资源策略**：只内置免费来源（IMSLP / Mutopia / MuseScore 公开页），第一版 `searchFreeSources` 返回搜索入口链接，不抓取全站。

## Windows 打包与安装

本项目含 better-sqlite3 等 native 模块，**必须在 Windows 环境完成打包**（Linux/WSL 无法交叉产出可用的 Windows 包——native 无法交叉编译、NSIS 需要 wine）。

### 1. 把源码复制到 Windows 本地盘
从 WSL 取出（Windows 资源管理器地址栏输入）：
```
\\wsl.localhost\Ubuntu-24.04\home\lhy\songcat
```
复制到如 `D:\songcat`。**不要在 `\\wsl.localhost\...` 路径上直接 `npm install`**——会很慢且 native 模块易出错。

### 2. 安装前置
- **Node.js 22 LTS**：https://nodejs.org （安装时勾选 "Tools for Native Modules"，会自动装 VS Build Tools；万一 better-sqlite3 需要本地编译时用得上）
- （可选）Git

### 3. 构建安装包（PowerShell）
```powershell
cd D:\songcat
npm install
npm run build:win
```
- `npm install` 会自动下载 Windows 版 better-sqlite3 prebuilt（通常无需编译）
- `npm run build:win` 首次会下载 Electron 43 + NSIS 工具（约 200MB）

国内网络建议先设镜像加速：
```powershell
$env:ELECTRON_MIRROR="https://cdn.npmmirror.com/binaries/electron/"
$env:ELECTRON_BUILDER_BINARIES_MIRROR="https://cdn.npmmirror.com/binaries/electron-builder-binaries/"
```

产物：`release\0.1.0\SongCat-0.1.0-Setup.exe`（NSIS 一键安装包）

### 4. 安装与卸载
- 双击 `Setup.exe` 一键安装（自动创建开始菜单 + 桌面快捷方式）
- 首次运行 Windows SmartScreen 可能提示"未知发布者"（应用未代码签名）→ 点"仍要运行"
- 卸载默认**保留**用户数据 `%APPDATA%\SongCat\`（曲库/数据库/录音/设置）；仅当明确选择才删除

## 环境说明

- 需要 Node 20+（含 native 编译工具链以构建 better-sqlite3）。
- 目标平台 Windows；`build:win` 在 Windows 上直接执行，或 Linux + wine。
- 卸载默认保留用户数据（`%APPDATA%/SongCat/`），仅用户明确选择时才删除。
