# M20 CAN接口调试记录

## 问题概述

M20模块（M1000 SOM）通过CH9431（SPI转CAN）芯片提供CAN接口，插入706载板后通过TPT1051HV收发器输出到J16连接器。

**现象**：M20 的 `can0`(spi3.0) 和 `can1`(spi4.0) 只能发送不能接收，接收到的帧 ID 和 data 全为乱码。

### 架构

```
M20: M1000 --SPI3--> CH9431(U14) --CAN_TX/RX--> J1 --> 706载板 TPT1051HV --> CAN总线
     M1000 --SPI4--> CH9431(U15) --CAN_TX/RX--> J1 --> 706载板 TPT1051HV --> CAN总线
```

| 接口 | SPI | CH9431 | 晶振 | Linux |
|------|-----|--------|------|-------|
| CAN0 | SPI3, CS0 | U14 | Y2(16MHz) | can0(spi3.0) |
| CAN1 | SPI4, CS0 | U15 | Y3(16MHz) | can1(spi4.0) |

---

## 调试时间线

| 阶段 | 操作 | 结论 |
|------|------|------|
| 1 | 环回测试 | can0 自收自发正常 → CH9431芯片 + SPI + 驱动协议正常 |
| 2 | M20 发 → shanhai 收 | shanhai 正确收到 → CAN收发器TX通路正常 |
| 3 | shanhai 发 → M20 收 | M20 收不到 → 问题在驱动软件层，非硬件 |
| 4 | 反汇编 `.ko` 分析 `ch9431_hw_rx` | SPI命令和ID解析逻辑均符合数据手册 |
| 5 | 读 CH9431 寄存器 dump | 发现 RX 掩码(mask)配置异常 |
| 6 | 对照 CH9431 数据手册 | 确认 mask 极性与 MCP2515 相反 |
| 7 | 修改驱动后验证 | RX 正常工作 |

---

## 根因分析：4个驱动Bug

### Bug 1：接收掩码(mask)极性错误 — 核心问题

**现象**：M20 完全收不到帧（发送 SID ≠ 0x000 时），连环回也失败。

**根因**：CH9431 的接收掩码极性**与 MCP2515 相反**。

| 控制器 | mask bit = 1 | mask bit = 0 |
|--------|:-----------:|:-----------:|
| MCP2515 | dons care（不检查） | must match（必须匹配） |
| CH9431 | **must match**（必须匹配） | **dons care**（不检查） |

驱动原代码按 MCP2515 惯例写 `mask = 0xFF`（以为"全部不关心"），CH9431 实际解读为"所有位必须精确匹配 filter = 0x00"，结果**只有 SID = 0x000 的帧能通过**，其余 ID 被硬件静默丢弃。

**修复**：`ch9431.c:ch9431_setup()` — mask 由 `0xFF` 改为 `0x00`

```c
// 修改前：mask = 0xFF（所有位必须匹配 filter=0x00 → 只收 SID=0x000）
// 修改后：mask = 0x00（接受任意 ID 的标准帧）
ch9431_set_rxmask(ch9431, 0, 0x00);
ch9431_set_rxmask(ch9431, 1, 0x00);
```

> WCH 官方参考代码 `CH9431_Init()` 也设置 `rxmn.SID = 0`，确认了此行为。

---

### Bug 2：SPI批量读字节序错误

**现象**：mask 修复后能收到帧，但 `candump` 显示的帧 ID 是乱码。

**根因**：驱动使用 SPI "Read RX Buffer" 命令 (`0x90`) 批量读取接收缓冲区 5 字节，但该命令返回的**字节布局与逐寄存器读** (`CMD_CAN_READ = 0x03`) **不一致**，导致 SIDL/SIDH/DLC 字节错位。

**修复**：改为逐个寄存器读取

```c
// ch9431_hw_rx_frame(): 逐寄存器读 ID + DLC
buf[0] = ch9431_read_reg(ch9431, base + 0);       // RXB0SIDL (0x61)
buf[1] = ch9431_read_reg(ch9431, base + 1);       // RXB0SIDH (0x62)
buf[2] = ch9431_read_reg(ch9431, base + 2);       // RXB0EIDL (0x63)
buf[3] = ch9431_read_reg(ch9431, base + 3);       // RXB0EIDH (0x64)
buf[4] = ch9431_read_reg(ch9431, base + 4);       // RXB0DLC  (0x65)

// ch9431_read_mem(): 逐字节读 data
for (i = 0; i < len; i++)
    buff[i] = ch9431_read_reg(ch9431, base + i);
```

> WCH 官方参考代码 `CH9431_Receive_Buffer0()` 也使用逐寄存器读取方式。

---

### Bug 3：双芯片 probe 竞态（ENODEV）

**现象**：`modprobe ch9431` 时，spi3.0 和 spi4.0 只有一个成功，另一个报错：

```
ch9431 spi4.0: Cannot initialize ch9431. Wrong wiring?
ch9431 spi4.0: ch9431_probe failed, err=19
```

**根因**：两颗 CH9431 共用 SPI reset 路径，第二个芯片在第一个芯片 reset 后尚未完全就绪，`ch9431_hw_probe()` 读 SYSCTRL 状态检查 `(ctrl & 0x17) != 0x07` 失败。

**修复**：

```bash
# 方法A：卸载后等 15s 再加载
sudo rmmod ch9431; sleep 15; sudo modprobe ch9431

# 方法B：手动 bind 失败的设备
echo spi4.0 > /sys/bus/spi/drivers/ch9431/bind
```

---

### Bug 4：时钟频率未初始化

**现象**：bit timing 异常。

**根因**：`ch9431->can.clock.freq` 在 `ch9431_setup()` 使用前未赋值，默认为 0。

**修复**：`ch9431.c:ch9431_probe()` 硬编码时钟频率

```c
ch9431->can.clock.freq = CH9431_CLK_FREQ;  // 20MHz
```

---

## 修复清单

| 文件 | 函数 | 修改 | 目的 |
|------|------|------|------|
| `ch9431.c` | `ch9431_setup()` | mask `0xFF` → `0x00` | 接受所有标准帧 |
| `ch9431.c` | `ch9431_hw_rx_frame()` | 批量读 → 逐寄存器读 | 修复 RX ID 字节序 |
| `ch9431.c` | `ch9431_read_mem()` | 批量读 → 逐寄存器读 | 修复 RX data 字节序 |
| `ch9431.c` | `ch9431_probe()` | 添加 `clock.freq = 20MHz` | 修复 bit timing |

---

## 关键知识点

### CH9431 与 MCP2515 差异

| 项目 | CH9431 | MCP2515 |
|------|--------|---------|
| RXB0 SID 寄存器顺序 | 0x61=SIDL, 0x62=SIDH | 0x61=SIDH, 0x62=SIDL |
| mask 极性 | 0=不检查, 1=必须匹配 | 1=不检查, 0=必须匹配 |
| 推荐读取方式 | 逐寄存器读(0x03) | SPI批量读 |

### 接受所有标准帧的过滤器配置

```c
// RXF0: EN=1, EXIDE=0 (标准帧)
write_reg(0x00, 0x00);  // RXF0SIDL
write_reg(0x01, 0x08);  // RXF0SIDH: EN=1, EXIDE=0

// RXM0: 全部不检查
write_reg(0x1F, 0x00);  // RXM0SIDL
write_reg(0x20, 0x00);  // RXM0SIDH
```

---

## 验证方法

```bash
# 1. 环回自检
sudo ip link set can0 down
sudo ip link set can0 type can bitrate 500000 loopback on
sudo ip link set can0 up
cansend can0 123#0011223344556677
# 预期: can0 123 [8] 00 11 22 33 44 55 66 77

# 2. 外部收发测试
sudo ip link set can0 down
sudo ip link set can0 type can bitrate 500000 loopback off
sudo ip link set can0 up
# 另一节点发送，观察 candump can0
```

---

## 环境信息

| 项目 | 详情 |
|------|------|
| 模块 | M1000 SOM (AP108AA-300-AA) |
| CAN控制器 | CH9431T ×2 |
| CAN收发器 | TPT1051HV ×2 (706载板) |
| 驱动 | ch9431 V1.3 (WCH, 2025.06) |
| 内核 | Linux 6.6.10 aarch64 |
| 晶振 | XC21M4-16.000 (16MHz ±10ppm)，内部PLL倍频至20MHz |
| 速率 | 500kbps, sample-point 0.800 |
