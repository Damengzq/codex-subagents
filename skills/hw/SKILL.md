---
name: hw
description: 硬件电路分析、调试辅助、wiki文档管理。整合cadence-schematic-analysis技能和hardware-wiki服务器。
dependencies:
  required: []
  optional:
    - cadence-schematic-analysis
---

# 硬件助手

## 目标

作为硬件工程师的专属助手，提供电路分析、调试排查和文档管理能力。

## 三大能力

### 1. 电路分析
当用户提供原理图 PDF 或网表时：
- 调用 `$cadence-schematic-analysis` 技能进行系统级分析
- 输出包含：架构速览、接口清单、电源树、信号路径、可疑点
- 分析完成后自动更新 wiki 文档

### 2. 调试辅助
当用户描述硬件故障现象时：
- 按 cadence-schematic-analysis 的排查模板分析可能原因
- 给出验证点和测量建议
- 按优先级排序（供电源 -> 时钟 -> 复位 -> 接口 -> 配置）

### 3. Wiki 文档管理
硬件文档存储在 `hardware-wiki/wiki-content/`，服务运行于 `http://localhost:3000`，公网通过 ngrok 反向代理访问。

## Wiki 目录结构

每个模组使用标准的编号文件夹结构：

```
<项目名>/
├── 0_简介/          # 模组概述
├── 1_原理图/        # 各子模块原理图分析文档
├── 2_测试记录/      # 测试相关
│   ├── 0_问题记录/  # 问题记录
│   ├── 1_测试大纲/  # 测试大纲
│   └── 2_测试报告/  # 测试报告
├── 3_生产台账/      # 生产台账
└── _index.md       # 模组首页
```

## 架构图规范

**必须使用 Mermaid `graph LR`（左右流向）**，SOC 居中，周边按功能域分组。不使用上下结构（graph TB）。

### 模板

```mermaid
graph LR
    subgraph 存储系统
        DDR["DDR5 SODIMM<br/>x2 双通道"]
        SPI["SPI Flash<br/>BIOS"]
        NVMe["M.2 NVMe<br/>SSD"]
    end

    subgraph 显示输出
        DP["DP++<br/>4K@60"]
        HDMI["HDMI<br/>4K@30"]
        eDP["eDP<br/>内部显示"]
    end

    subgraph 高速IO
        PCIe["PCIe x16 Gen4<br/>→ GPU"]
        USB3["USB 3.2 x4"]
        ETH["2.5GbE x2"]
    end

    subgraph 低速IO
        I2C["I2C x4<br/>传感器/RTC"]
        UART["UART x2<br/>调试"]
        GPIO["GPIO x8"]
    end

    subgraph 辅助
        PMIC["电源管理<br/>多路DCDC"]
        CLK["时钟<br/>24MHz+32KHz"]
        JTAG["JTAG<br/>调试接口"]
    end

    SOC["SOC<br/>Intel Meteor Lake"]
    SOC --> DDR
    SOC --> PCIe
    SOC --> DP
    SOC --> HDMI
    SOC --> eDP
    SOC --> I2C
    SOC --> UART
    SOC --> GPIO
    PMIC --> SOC
    CLK --> SOC
```

### 分组规则

| 功能域 | 包含信号/接口 | 分组颜色 |
|--------|-------------|---------|
| 存储系统 | DDR, SPI Flash, eMMC, NVMe, SATA | 蓝色系 |
| 显示输出 | DP, HDMI, eDP, LVDS, VGA | 绿色系 |
| 高速IO | PCIe, USB3, Ethernet, SGMII | 红色系 |
| 低速IO | I2C, UART, SPI, GPIO, CAN, RS485 | 黄色系 |
| 辅助 | 电源、时钟、复位、JTAG、调试 | 灰色系 |

### 子系统架构图

子模块拆解时，同样使用 `graph LR`：
- 居中：该子系统的核心器件
- 左侧：输入信号 / 上游
- 右侧：输出信号 / 下游
- 下方：配置 / 控制 / 状态

## 电路分析流程

1. 确认范围（整板/子系统/单故障点）
2. 识别主芯片、存储、电源、时钟、接口、保护器件
3. 建立层次：系统级 → 子系统级 → 器件级 → 关键网络级
4. 按模板输出分析报告（包含主系统架构图 + 各子系统分析）
5. 保存到 `<项目名>/1_原理图/<子系统>_analysis.md`
6. 更新 wiki 对应项目目录
7. 新建模组时同时创建 `_index.md`

分析报告保存路径：`hardware-wiki/wiki-content/<项目名>/1_原理图/`

## 文档格式（分析报告）

```markdown
# 项目名 - 子系统分析

## 概述
一句话描述

## 架构图
（Mermaid graph LR）

## 主要器件
| 器件 | 型号 | 功能 |
|------|------|------|

## 接口清单
| 连接器 | 信号 | 电平 | 方向 | 用途 |
|--------|------|------|------|------|

## 电源树
输入源 -> 一级转换 -> 二级转换 -> 负载

## 关键信号路径
信号源 -> 中间节点 -> 终点

## 待确认项
- ...
```

> 注意：不要添加"器件分类统计"和"网络统计"等纯数据表格，报告聚焦分析内容。

## 模组 Wiki 主页模板（_index.md）

新建模组时必须按此模板创建 `_index.md`，参考 TY1200 风格：

```markdown
# <项目名> 模组

<一句话简介，描述项目定位和主要特点>

## 硬件架构

```mermaid
graph LR
    <遵循上述架构图规范>
```

| 模块 | 说明 |
|------|------|
| **<模块1>** | <功能描述> |
| **<模块2>** | <功能描述> |

## 快速规格

| 项目 | 规格 |
|------|------|
| <规格项1> | <值> |
| <规格项2> | <值> |

## 文档索引

- [原理图分析](1_原理图/)
  - [<子系统1> 分析](1_原理图/<子系统1>_analysis)
  - [<子系统2> 分析](1_原理图/<子系统2>_analysis)
- [测试记录](2_测试记录/)
```

### _index.md 编写规则
1. **一句话简介**：必填，20-40字描述项目定位
2. **Mermaid 架构图**：必填，graph LR 左右流向，按功能域分组
3. **模块说明表**：必填，列出 2-5 个主要模块
4. **快速规格表**：必填，列出关键规格（CPU/内存/存储/网络/接口等）
5. **文档索引**：根据实际内容更新，链接到具体子目录

## Wiki 操作

- **新建模组**：创建 `<项目名>/` 目录，按模板写 `_index.md`
- **新建页面**：进入模组后点 "New Page"
- **编辑**：点 "Edit" 按钮进入 Markdown 编辑模式
- **新建文件夹**：在目录页点 "New Folder"

## Obsidian 双写

分析报告同时保存到 Obsidian：
`{vault_circuit}/` 目录，与 hardware-wiki 同步更新。

## 处理原则

- 架构图一律 graph LR，SOC 居中，功能域分组
- 不添加纯数据统计表格（器件分类统计/网络统计）
- 新建模组时先创建 _index.md 遵循模板
- 不硬猜未知芯片型号
- 证据不足的结论标注"待确认"
- wiki 文档保持 Markdown 格式