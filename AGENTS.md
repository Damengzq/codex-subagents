# 子代理秘书团 · 项目指南

> Codex 代理上下文：项目结构、路径约定、技能说明、操作规范。

---

## 项目概览

基于 Codex Skill + 飞书 Bot + Obsidian + ngrok 的个人 AI 秘书系统。

- **6 个 Skill**：灵感笔记 / 工作进度 / 晚间反思 / AI 新闻 / 硬件助手 / 系统巡检
- **飞书网关**：LLM 意图识别 + 自动回复 + Obsidian 写入
- **硬件 Wiki**：本地 Markdown 文档服务器 + ngrok 公网访问

## 目录结构

```
D:\zz\codex\
├── AGENTS.md                         ← 本文件
├── .codex\
│   ├── config.yaml                   ← 核心配置（路径、凭据、维护参数）
│   └── config.toml                   ← Codex 自动生成
├── skills\                           ← 仓库备份（Codex 不扫描，仅版本控制）
│   ├── notes\  daily\  reflect\
│   ├── news\   hw\     maintain\
├── feishu-gateway\
│   ├── server.py                     ← Flask v3：LLM 意图识别 + 飞书回复
│   ├── proxy.py                      ← 反向代理 :8088 → :5678 / :3000
│   ├── start.bat                     ← 一键启动（Wiki → Flask → Proxy → ngrok）
│   └── ngrok.exe                     ← 内网穿透
└── hardware-wiki\
    ├── server.mjs                    ← Wiki 服务 :3000
    ├── start.bat                     ← 独立启动（不含 ngrok）
    └── wiki-content\                 ← 按模组组织的 Markdown 文档
        ├── TY1200\  M20\  MXM\  SH100\
```

## 全局 Skill（~/.codex/skills/）

> **唯一加载源**。项目 `skills/` 目录仅作备份，不会被 Codex 扫描。

### 核心 6 个

| 触发 | 名称 | 功能 | 依赖 |
|------|------|------|------|
| `$notes` | 灵感笔记 | 飞书消息 → LLM 意图识别 → Obsidian 四分类 | — |
| `$daily` | 工作进度 | 当日/周/月进度统计，自动扫描灵感笔记 | `notes`(可选) |
| `$reflect` | 晚间反思 | 基于今日产出引导复盘反思 | `daily`(可选) |
| `$news` | AI 新闻 | agent-reach 多平台采集 → 去重分类 → 简报 | `agent-reach` |
| `$hw` | 硬件助手 | 电路分析 + 调试辅助 + Wiki 管理 | `cadence-schematic-analysis`(可选) |
| `$maintain` | 系统巡检 | 清理归档、路径检查、Wiki 状态、使用统计 | — |

### 支撑 Skills

| 触发 | 用途 |
|------|------|
| `$cadence-schematic-analysis` | Allegro PST 网表解析 → 电路分析文档 |
| `$agent-reach` | 15 平台互联网搜索路由器 |
| `$find-skills` | Skill 发现与安装 |

### 技能调用链

```
$notes  ──→ Obsidian（Inbox / Tasks / Notes / Hardware）
$daily  ──→ 扫描 Obsidian + 用户对话 → 工作进度-YYYY-MM-DD.md
$reflect ─→ 读取日报产出 → 反思-YYYY-MM-DD.md
$news   ──→ $agent-reach 多平台搜索 → AI新闻简报.md
$hw     ──→ $cadence-schematic-analysis → 电路分析文档 + _index.md
```

## Obsidian Vault 映射

Vault 根：`D:\zz\Dameng`

| 用途 | 路径 | 写入者 |
|------|------|--------|
| 灵感速记 | `08_Notes/Inbox/` | `$notes` |
| 待办事项 | `08_Notes/Tasks/` | `$notes` |
| 笔记归档 | `08_Notes/Notes/` | `$notes` |
| 硬件备忘 | `08_Notes/Hardware/` | `$notes` |
| 工作进度 | `02_日志/Daily/` | `$daily` `$reflect` |
| AI 新闻 | `AI日报/AI新闻/` | `$news` |
| 电路分析 | `04_项目/2026_LK/电路分析skill/` | `$hw` |

## 飞书网关架构

```
手机飞书 → 飞书服务器 → ngrok(公网) → :8088 proxy
                                        ├── /feishu/* → Flask :5678
                                        └── 其他请求   → Wiki  :3000
```

- **公网 URL**：`https://haywood-nondenunciative-panickingly.ngrok-free.dev`
- **事件 URL**：上述地址 + `/feishu/event`
- **意图分类**：关键词快速匹配 → LLM (gpt-4o-mini) 兜底
- **自动回复**：灵感/待办/笔记/硬件 写 Obsidian 后确认；闲聊返回介绍；查询搜索 Vault
- **启动**：`feishu-gateway\start.bat`（顺序：Wiki → Flask → Proxy → ngrok）

## 关键路径

| 资源 | 路径 |
|------|------|
| Python | `D:\software\ESP32\Espressif\python_env\idf5.5_py3.11_env\Scripts\python.exe` |
| Node.js | `C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` |
| 全局 Skill | `C:\Users\Administrator\.codex\skills\` |
| 项目配置 | `D:\zz\codex\.codex\config.yaml` |
| 代理 | `http://127.0.0.1:7897`（Clash，Python/Flask 使用） |
| GitHub | https://github.com/Damengzq/codex-subagents |

## 约定

1. **Skill 只创建在全局** `~/.codex/skills/`，不在项目 `.codex/skills/` 下创建
2. 仓库 `skills/` 仅备份，不会被 Codex 加载
3. 默认中文交流；代码/路径/命令保持英文
4. 写 UTF-8 文件不用 BOM，用 `encoding="utf-8"`
5. 端口 3000/5678/8088 启动前确认无残留进程
6. PowerShell 传 JSON 用 base64 或临时文件，避免引号转义
7. Skill 触发用 `$` + skill 的 `name` 字段
8. ngrok 启动前必须清除 `HTTP_PROXY`（免费版不支持代理）
9. 密钥凭据放环境变量，不硬编码到代码文件

## 分析文档规范

- **架构图**：Mermaid `graph LR` 左右流向，SOC 居中，功能域分组
- **文档模板**：参考 `cadence-schematic-analysis/examples/CPU_CARRIER_MXM_V10_Schematic_Analysis.md`
- **禁止**：器件分类统计、网络统计等纯数据表格
- **_index.md**：按 TY1200 风格（简介 + 架构图 + 模块表 + 规格表 + 索引）

## 排查速查

| 症状 | 检查 |
|------|------|
| 飞书无回复 | `curl localhost:8088/health`，看 `flask.log` |
| Wiki 打不开 | `curl localhost:3000`，检查 `server.mjs` 报错 |
| ngrok 断连 | 确认 `HTTP_PROXY` 已清除，Token 未过期 |
| Skill 不触发 | `$` + skill `name` 字段，非 `display_name` |
| 端口冲突 | `netstat -ano | findstr "3000 5678 8088"` |