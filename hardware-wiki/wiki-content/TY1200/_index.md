# TY1200 模组

TY1200 模组采用 MXM 3.8A 标准的模块化设计，分为 CPU 载卡和 GPU 核心板两部分。

## 硬件架构

| 模块 | 说明 |
|------|------|
| **CPU 载卡** | Intel Meteor Lake-U/H 平台，负责系统控制、电源管理、I/O 扩展 |
| **GPU 核心板** | MR100 系列，MXM 接口连接，专注图形处理 |

## 快速规格

| 项目 | 规格 |
|------|------|
| CPU | Intel Meteor Lake-U/H (BGA2049) |
| GPU | MR100 (MXM 3.8A) |
| 内存 | DDR5 SODIMM x2 双通道 |
| 存储 | SPI Flash + M.2 NVMe |
| 网络 | 2x 2.5GbE (I225-V) |
| USB | 4x USB3 + 2x USB-C PD |
| GPU 互联 | PCIe x16 Gen4 |

## 文档索引

- [原理图分析](schematic)
  - [TY1200 模组总体分析](schematic/TY1200_Schematic_Analysis)
  - [CPU 载卡详细分析](schematic/CPU_CARRIER_MXM_V10_Schematic_Analysis)
