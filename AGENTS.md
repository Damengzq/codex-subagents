# 子代理秘书团 · 项目指南

> 本文件为 Codex 代理提供项目结构、路径约定、技能说明和操作规范。

---

## 项目概览

基于 Codex Skill + 飞书 Bot + Obsidian + ngrok 的个人 AI 秘书系统，包含 6 个 Skill 和 1 个飞书网关。

## 目录结构

```
D:\zz\codex\
├── AGENTS.md                    ← 本文件
├── .codex\
│   └── config.yaml              ← 核心配置（路径、集成）
├── (skills 全部安装在全局 ~/.codex/skills/)
├── skills\                  ← 仓库备份（Codex 不扫描，不会被加载）
├── feishu-gateway\
│   ├── server.py                ← Flask v3（LLM意图+飞书回复）
│   ├── proxy.py                 ← 反向代理 :8088
│   ├── start.bat                ← 一键启动
│   └── ngrok.exe                ← 内网穿透
└── hardware-wiki\
    ├── server.mjs               ← Wiki 服务 :3000
    └── wiki-content\            ← 文档内容
```

## Obsidian Vault 映射

| 用途 | 路径 | Skill |
|------|------|-------|
| 灵感 | `08_Notes/Inbox/` | `$notes` |
| 待办 | `08_Notes/Tasks/` | `$notes` |
| 笔记 | `08_Notes/Notes/` | `$notes` |
| 硬件 | `08_Notes/Hardware/` | `$notes` |
| 日程 | `02_日志/Daily/` | `$daily` `$reflect` |
| AI新闻 | `AI日报/AI新闻/` | `$news` |
| 电路分析 | `04_项目/2026_LK/电路分析skill/` | `$hw` |

## 6 个 Skill

| 触发 | 功能 |
|------|------|
| `$notes` | 飞书消息 → LLM意图识别 → Obsidian |
| `$daily` | 收集安排 → 日程早报 |
| `$reflect` | 今日产出 → 复盘反思 |
| `$news` | 全网搜刮 AI 动态 → 简报 |
| `$hw` | 电路分析 + 硬件 Wiki |
| `$maintain` | 系统巡检 + 清理归档 |

## 飞书网关架构

```
飞书 → ngrok(公网) → :8088 代理 → /feishu/* → Flask :5678
                                 → 其他     → Wiki  :3000
```

- 公网 URL：`https://haywood-nondenunciative-panickingly.ngrok-free.dev`
- 启动：双击 `feishu-gateway\start.bat`
- ngrok 免费版不支持代理，启动前须清除 `HTTP_PROXY`

## 关键路径

- Python：`D:\software\ESP32\Espressif\python_env\idf5.5_py3.11_env\Scripts\python.exe`
- Node.js：`C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`
- 代理：`http://127.0.0.1:7897`（Flask/Python 使用，ngrok 不使用）
- 配置：`D:\zz\codex\.codex\config.yaml`
- 全局 Skill 目录：`C:\Users\Administrator\.codex\skills\`

## 约定

- 默认中文交流；代码/路径保持英文
- **Skill 必须创建在全局目录** `~/.codex/skills/`，不要创建项目级 skill
- 仓库中 `skills/` 目录仅用于备份和版本控制，**不会被 Codex 加载**（不是 `.codex/skills/`）
- 写 UTF-8 文件不用 BOM（`encoding="utf-8"` 而非 `utf-8-sig`）
- 端口 3000/5678/8088 启动前确认无残留
- PowerShell 传 JSON 用 base64 或临时文件，避免引号转义
- Skill 触发用 `$` + skill 的 `name` 字段（非 `display_name`）
- 路径写绝对路径，不硬编码到 Skill 内部

## 排查速查

| 症状 | 检查 |
|------|------|
| 飞书无回复 | `curl localhost:8088/health` |
| Wiki 打不开 | 检查 :3000、`server.mjs` 是否报错 |
| ngrok 断连 | 确认 `HTTP_PROXY` 已清除 |
| Skill 不触发 | `$` + skill name（非 display_name）|