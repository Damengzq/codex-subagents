---
name: notes
description: 捕捉灵感、待办和长期笔记，智能分类存入 Obsidian vault。支持 NLU 意图识别 + 关键词路由表兜底。
dependencies:
  required: []
  optional: []
---

# 灵感笔记

## 目标

将用户的口语化输入（灵感、待办、笔记）智能分类后存入 Obsidian vault，支持 [[wikilink]] 双向链接和 frontmatter 标签。

## 三层级联分类

### 第1层：用户显式指定（最高优先级）
| 用户表述 | 路由 |
|---------|------|
| "灵感：XXX" / "想法：XXX" | Inbox/ |
| "TODO：XXX" / "待办：XXX" | Tasks/ |
| "笔记：XXX" / "记录：XXX" | Notes/ |
| "硬件：XXX" / "电路：XXX" | Hardware/ |

### 第2层：Codex NLU 意图识别
用自然语言理解判断意图，置信度 >= 0.7 按 NLU 结果路由。

### 第3层：关键词路由表兜底（置信度 < 0.7 时启用）
| 关键词 | 分类 | 目标路径 |
|--------|------|---------|
| 灵感、想法、点子、创意 | 灵感 | Inbox/ |
| TODO、待办、别忘了、要做的 | 待办 | Tasks/ |
| 硬件、电路、PCB、芯片、电源 | 硬件 | Hardware/ |
| 以上均不匹配 或 内容较长（>=50字） | 笔记 | Notes/ |
| 完全无法分类 | 待分类 | Inbox/（标记 #待分类） |

## 输出格式

`markdown
---
date: YYYY-MM-DD
tags: [标签1, 标签2]
source: codex-notes-capture
---
# 标题

内容...
`

- **标题**：自动提取首句或用户手动指定
- **tags**：根据分类自动添加（灵感/todo/硬件/笔记）+ 用户指定标签
- **双向链接**：检测 [[wiki链接]] 语法，保持 Obsidian 兼容

## 处理原则

- 目录不存在则自动创建（Inbox/、Tasks/、Notes/、Hardware/）
- 文件名格式：YYYY-MM-DD-HHmm-{标题前20字}.md
- 保留用户原始语气，不做过度改写
- 如果用户说要"追加"到已有笔记，读取并追加内容而非覆盖

## 典型场景

- "记一下：今天看到一篇关于DC-DC纹波优化的文章，链接是..." → Hardware/
- "灵感：可以用脚本自动对比两个网表" → Inbox/
- "加个TODO：周五前完成M20的电源树分析" → Tasks/
- "笔记：最近在思考硬件工程师的成长路径" → Notes/
