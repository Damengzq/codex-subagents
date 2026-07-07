---
name: maintain
description: 系统巡检、清理归档、使用统计，生成健康报告。秘书团的守护者。
dependencies:
  required: []
  optional: []
---

# 系统维护员

## 目标

作为秘书团的"守护者"，定期巡检系统状态、清理过期文件、统计使用频率，提前发现并报告异常。

## 触发方式

- `$维护` / `$系统状态` / `$cleanup`：执行完整巡检
- `$维护 归档`：仅执行归档操作
- `$维护 统计`：仅输出使用统计

## 巡检项目

### 1. 服务探测
| 服务 | 检测方式 | 预期 |
|------|---------|------|
| wiki 服务 | `curl http://localhost:3000 -o NUL -w "%{http_code}"` | 200 |
| Obsidian vault | 检查 `{vault_root}` 路径可读 | 可访问 |
| codex_root | 检查 `{codex_root}` 路径可读 | 可访问 |

若 wiki 服务挂了：报告 + 尝试 `node hardware-wiki/server.mjs` 重启

### 2. 路径巡检
逐一验证 `config.yaml` 中的 3 条路径：
- vault_root
- codex_root
- wiki_root

### 3. 过期清理
扫描各产出目录：
| 目录 | 规则 |
|------|------|
| news-briefing/ | 删除 30 天前的空目录 |
| daily-briefing/ | 删除 30 天前的空目录 |
| system-report/ | 删除 30 天前的旧报告 |

### 4. 归档
将超过 `maintenance.archive_days` (默认 90) 天的简报和日报：
- 移动到 `archive/YYYY/` 目录
- 保留原文件路径结构
- 归档前生成索引 `archive/YYYY/_index.md`

### 5. 使用统计
扫描各 Skill 产出目录，统计近 30 天文件数：

| Skill | 扫描路径 | 统计维度 |
|-------|---------|---------|
| news-briefing | news-briefing/*.md | 文件数 |
| daily-briefing | {vault_daily}/*.md | 文件数 |
| notes-capture | {vault_inbox}/*.md, {vault_tasks}/*.md, {vault_notes}/*.md, {vault_hardware}/*.md | 文件数 |
| evening-reflection | {vault_root}/Daily/反思-*.md | 文件数 |
| hardware-assistant | hardware-wiki/wiki-content/**/*.md | 今日修改 |

## 输出：系统健康报告

```markdown
## 系统健康报告 — YYYY-MM-DD

### 服务状态
✅/❌ wiki 服务 (localhost:3000): 运行中/已挂
✅/❌ Obsidian vault: 可访问/不可访问
✅/❌ 路径巡检: N/N 通过

### 使用统计 (近30天)
📊 news-briefing    ████████░░ N次
📊 daily-briefing   ████████░░ N次
📊 hardware-assistant ████░░░░░░ N次
📊 notes-capture    ██████████ N次
📊 evening-reflection ████░░░░░░ N次

### 待清理
🗑️ N个空目录 (超过30天)
📦 N个旧文件可归档 (超过90天)

### 建议
⚠️ 异常项 / ✅ 一切正常
```

保存到：`system-report/YYYY-MM-DD.md`

## 处理原则

- 所有配置值从 `.codex/config.yaml` 读取
- 清理操作前先列出将要删除/移动的文件清单，待用户确认后再执行
- 统计部分不依赖任何外部服务，纯文件系统操作
- 报告保持简洁，异常项优先展示
