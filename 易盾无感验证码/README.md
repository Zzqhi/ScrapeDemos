# 易盾无感验证码（INTELLISENSE）逆向分析

## 概述

网易易盾 NECaptcha SDK v2.28.5 的无感验证码（INTELLISENSE, type=5）完整逆向实现。
采用 Python 编排请求流程 + Node.js 处理加密逻辑的架构。

## 验证流程

```
getconf ──→ get ──→ [等待1~2s] ──→ check ──→ validate
   │          │                       │
   │          │                       └─ 提交加密行为数据
   │          └─ 获取验证 token
   └─ 获取配置（dt, zoneId, ir配置）
```

### 第1步: getconf

```
GET https://c.dun.163.com/api/v2/getconf
```

获取验证码配置信息，返回关键字段：

| 字段 | 说明 |
|------|------|
| `dt` | 设备令牌，后续请求必带 |
| `zoneId` | 区域标识（如 `NANP`） |
| `ir.pn` | IR SDK 的 productId，用于生成 irToken |
| `ir.token` | IR 回退 token（当 IR SDK 在线请求失败时使用） |

### 第2步: get

```
GET https://c.dun.163.com/api/v3/get
```

携带 `dt`、`fp`（设备指纹）、`cb`（加密校验）、`irToken`（设备风控令牌），获取验证 token。

返回关键字段：

| 字段 | 说明 |
|------|------|
| `token` | 验证令牌，32位十六进制串 |
| `type` | 验证类型（5 = INTELLISENSE） |

### 第3步: check

```
GET https://c.dun.163.com/api/v3/check
```

提交加密后的行为数据（鼠标轨迹），服务端验证后返回：

| 字段 | 说明 |
|------|------|
| `result` | `true` = 验证通过 |
| `validate` | 验证凭证，用于业务接口二次校验 |

## 文件结构

```
易盾无感验证码/
├── main.py            # 主流程编排（Python）
├── gen_fp.js          # 浏览器指纹生成
├── gen_cb.js          # cb 加密 + AES/XOR 加密工具库
├── gen_irToken.js     # IR SDK 设备风控令牌生成
├── gen_data.js        # check 请求行为数据加密 + 轨迹模拟
├── core.js            # NECaptcha SDK 源码（v2.28.5，参考用）
└── irToken.js         # IR SDK 源码（参考用）
```

## 加密算法

### 自定义 AES 分组加密

所有加密参数（fp, cb, data）共用同一套自定义分组密码：

```
明文 → 附加CRC32校验 → 填充至64字节块 → 逐块变换 → 自定义Base64编码
```

核心常量：

| 常量 | 值 |
|------|-----|
| SEED_KEY | `fd6a43ae25f74398b61c03c83be37449` |
| ROUND_KEY | `037606da0296055c` |
| SBOX | 256字节替换表（hex编码） |
| Base64字母表 | `MB.CfHUzEeJpsuGkgNwhqiSaI4Fd9L6jYKZAxn1/Vml0c5rbXRP+8tD3QTO2vWyo` |
| Base64填充字符 | `7` |

逐块变换流程：

```
block → applyRound(ROUND_KEY变换) → XOR(key) → shift(feedback) → XOR(feedback) → SBOX×2 → 更新feedback
```

ROUND_KEY `037606da0296055c` 拆分为4组操作（每组2字节 opIdx + param）：
- `03,76` → XOR递增（从0x76开始）
- `06,DA` → ADD递减（从0xDA开始）
- `02,96` → ADD常量（0x96）
- `05,5C` → XOR递减（从0x5C开始）

### XOR 编码

用于 check 请求的轨迹数据加密：

```
xorEncode(key, value) → XOR(valueBytes, keyBytes) → 自定义Base64编码
```

XOR Base64 使用不同的字母表：`i/x1Xg...`，填充字符 `3`。

### CRC32 完整性校验

AES 加密前对明文计算 CRC32，转为8位十六进制字符串后附加到明文末尾。
服务端解密后通过 CRC32 验证数据完整性。

**重要**：`aesEncryptBytes`（用于 IR SDK）必须手动附加 CRC32，否则服务端返回 `Decrypt Failure`。

## IR SDK（设备风控令牌）

IR SDK 是独立于验证码 SDK 的反欺诈模块，通过 `createNECaptchaGuardian` 外部加载。

### 数据采集

使用 TLV（Type-Length-Value）编码格式：

```
[typeId (2字节)] [length (2字节)] [value (N字节)]
```

TLV 编码函数：

| 函数 | 用途 | 示例 |
|------|------|------|
| `tn(fn, id, size)` | 整数编码 | `tn(() => 1, 225, 1)` |
| `un(fn, id, maxLen)` | 字符串编码（UTF8截断） | `un(() => ua, 252, 100)` |
| `$(fn, id, size)` | 布尔编码（1=真, 2=假） | `$(()=>true, 218, 1)` |
| `cn(fn, id, sizes)` | 数组编码（多值拼接） | `cn(()=>[1920,1080], 508, [4,4])` |
| `fn(fn, id, size)` | 十六进制字符串编码 | `fn(()=>hexNow, 902, 16)` |

数据采集分三部分：
- **Kr()**: 70+ 个设备指纹字段（UA、屏幕、Canvas、WebGL、插件等）
- **Vr()**: 14 个会话字段（appId、sdkVersion、timestamp等）
- **Wr()**: 13 个事件计数器（moveCount、clickCount 等）

### 加密与上传

```
Kr() + Vr() + Wr() → 拼接TLV → Fisher-Yates随机打乱 → 附加CRC32 → AES加密 → Base64编码
```

POST 到 `https://ir-sdk.dun.163.com/v4/j/up`：

```json
{
  "p": "productId",
  "v": "2.0.13_yanzhengma",
  "vk": "d44593ca",
  "n": "uuid",
  "d": "加密后的Base64数据"
}
```

注意：Content-Type 必须为 `text/plain`（非 `application/json`）。

服务端返回 `{ data: { tk: "irToken" } }`。

### 回退机制

当 IR SDK 在线请求失败时（如 `Decrypt Failure`），core.js 会回退到 `getconf` 返回的 `ir.token` 直接使用。

## check 请求数据格式

INTELLISENSE 模式下 data 字段为 JSON 字符串：

```json
{
  "d": "",
  "m": "aesEncrypt(sampled_traces.join(':'))",
  "p": "aesEncrypt(xorEncode(token, '0,0,elapsed_ms'))",
  "ext": "aesEncrypt(xorEncode(token, 'mouseDownCount,traceLength'))"
}
```

| 字段 | 含义 | 加密链 |
|------|------|--------|
| `d` | 固定空字符串 | 无 |
| `m` | 鼠标轨迹数据 | 每条 xorEncode → 采样50条 → join(':') → aesEncrypt |
| `p` | 点击坐标+耗时 | xorEncode → aesEncrypt |
| `ext` | 点击次数+轨迹总数 | xorEncode → aesEncrypt |

轨迹点格式：`[x, y, elapsed_ms, isTrusted]`，转字符串后 xorEncode。

## 轨迹模拟

采用贝塞尔曲线模拟自然鼠标移动：

1. **三阶贝塞尔曲线**生成平滑路径，控制点随机偏移产生弧度
2. **ease-in-out 时间映射**模拟加速→匀速→减速
3. **高斯噪声**（Box-Muller变换）添加 ±1.5px 微颤
4. **随机时间间隔** 8~30ms（模拟浏览器事件调度）
5. **isTrusted=1** 标记为真实浏览器事件
6. 生成 15~30 个轨迹点，不超过 50 条的采样上限

## JSONP 通信

所有 API 端点使用 JSONP 跨域机制：

```
callback=__JSONP_{7位随机字符}_{递增计数器}
```

响应格式：`__JSONP_xxx_0({...json...})`，解析时用正则提取 JSON 对象。

## 运行

```bash
cd 易盾无感验证码
python main.py
```

输出示例：

```
[getconf] dt=xxx, zoneId=NANP
[node] fp=xxx..., cb=xxx...
[ir] code=200, irToken=xxx...
[get] token=xxx, type=5, zoneId=NANP
[check] result=True, validate=xxx...
```

## 依赖

- Python 3.x + requests
- Node.js (v18+)
