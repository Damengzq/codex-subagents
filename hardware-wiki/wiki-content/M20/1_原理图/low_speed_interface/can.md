# CAN Test

## Compile Environment

```
ssh racobit@192.168.200.244
# password: racobit
```

## Start Claude

```
cd /data2/m20/sdk
source ~/deepseek_env.sh
claude --dangerously-skip-permissions --continue
```

## CAN Related Files

| File | Description |
|------|-------------|
| `/data2/m20/sdk/m1000-linux-kernel` | Kernel source |
| `drivers/can_spi` | CAN driver |
| `m20.dts` | Device tree file |
| `CAN_debug_env.md` | M20 test method |
| `CAN_interface_debug.md` | AI analysis from zhongqin |

## CAN Test Steps

### Install Tools

```bash
sudo apt-get update
sudo apt-get install can-utils
```

### Configure Interfaces

```bash
sudo ip link set can0 down
sudo ip link set can1 down
sudo ip link set can0 up type can bitrate 500000
sudo ip link set can1 up type can bitrate 500000
ip -d link show can0
ip -d link show can1
```

### Send / Receive Test

**Terminal A - Listen on can1:**

```bash
sudo candump can1
```

**Terminal B - Send on can0:**

```bash
# Standard frame: CANID#DATA
sudo cansend can0 123#DEADBEEF
sudo cansend can0 001#AA
sudo cansend can0 456#0102030405060708
# Remote frame
sudo cansend can0 200#R8
```

**Expected output on Terminal A:**

```
(timestamp)  can1  123  [4]  DE AD BE EF
```

## Clock Frequency

```bash
ip -details link show can1
```