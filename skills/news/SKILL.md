---
name: news
description: 搜索全网AI动态（GitHub/Zhihu/Bilibili/Xiaohongshu/Twitter/Douyin），调用 agent-reach 多平台采集，去重分类后生成结构化简报。
dependencies:
  required:
    - agent-reach
  optional: []
---

# AI新闻简报

## 目标

调用 `$agent-reach` 全网多平台采集 AI 新闻（GitHub、知乎、B站、小红书、Twitter/X、抖音、V2EX、Reddit），去重分类后生成结构化简报。

## 流程

### 1. 确认范围
- 默认：今日新闻
- 可选：本周、"最近N天"、自定义日期范围

### 2. 多平台采集（通过 agent-reach）

**必须使用 `$agent-reach` 进行所有平台搜索**，不要自己发明方案。

| 平台 | 搜索策略 | agent-reach 命令 |
|------|---------|-----------------|
| 通用搜索 | AI 新闻全局搜索 | Exa: `mcporter call 'exa.web_search_exa(query: "AI news today", numResults: 10)'` |
| GitHub | AI trending 仓库 | `gh search repos "AI" --sort stars --limit 10` |
| 知乎 | 人工智能热榜 | web_search: "知乎 人工智能 热榜" |
| B站 | AI 科技热门 | `bili search "AI 人工智能" --type video -n 10` |
| 小红书 | AI工具推荐 | `opencli xiaohongshu search "AI工具 2026" -f yaml` |
| Twitter/X | AI 新闻讨论 | `twitter search "AI news" -n 10` |
| Reddit | AI 社区讨论 | `opencli reddit search "artificial intelligence" -f yaml` |
| V2EX | 技术社区讨论 | `curl -s "https://www.v2ex.com/api/topics/show.json?node_name=ai"` |

**采集顺序**：并行搜索 → 汇总所有结果 → 去重 → 分类。

### 3. 去重引擎
- **标题相似度 > 0.8**（simhash/jaccard）-> 合并为一条
- **URL 完全相同** -> 去重
- **同一主题 >=3 平台覆盖** -> 标记为 `🔥 多平台热议`

### 4. 分类汇总
| 类别 | 说明 |
|------|------|
| 模型发布 | 新模型、新版本、新能力 |
| 工具框架 | 开发工具、开源框架 |
| 论文研究 | 重要论文、技术突破 |
| 产品商业 | 产品发布、融资、行业动态 |
| 其他 | 政策、教育、趣闻 |

### 5. 生成简报

保存到: `{vault_news}/AI新闻简报-YYYY-MM-DD.md`

```markdown
# AI 新闻简报 - YYYY-MM-DD

## 🔥 多平台热议
> 同一话题在 3+ 平台被广泛讨论

- **话题标题**
  - 来源：平台A、平台B、平台C
  - 摘要：2-3句话

## 模型发布
...

## 工具框架
...

## 论文研究
...

## 产品商业
...

## 其他
...
```

### 6. 推送（预留）
若 FEISHU_WEBHOOK_URL 非空 -> 推送 Top 3 摘要到飞书

## 处理原则

- **平台搜索必须走 agent-reach**，不自己构造搜索命令
- 每条新闻必须有来源链接
- 精简描述（每条2-3句话）
- 中立客观，不做主观评价
- 如果某平台无相关结果，标注"暂无数据"
- 每周版本：汇总7天简报 -> `{vault_news}/AI新闻周报-YYYY-WW.md`