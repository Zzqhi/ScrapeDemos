# DHL Akamai sensor_data 逆向 TODO

## 目标
完整还原 sensor_data 的生成逻辑，实现本地构造合法 sensor_data。

---

## 已完成

### 整体框架
- [x] 定位 sensor_data POST 发送函数链：`O2N → QKN → sfN → t84 → MPN`
- [x] 建立 test.js(cBH) ↔ live(t84) 变量映射表（40+ 变量）
- [x] 解析 sensor_data 最终格式：`ver;f1;f2;...;sha256;counts;encrypted`
- [x] 解析 exports/XLN[0] 对象结构
- [x] 识别 bmak 全局对象结构

### 数据采集
- [x] `fpValStr` 生成（14 字段分号拼接） → `screen_node.js`
- [x] `xq()/DQN()` ASCII charCode 求和 → 4542
- [x] `LSH/c14` 对象结构及初始化流程
- [x] `KTH()/QWN()` 包装层（timing + fpValStr）
- [x] `HxH(t8)/BX4(PX)` navigator/Math 25 属性位掩码 → 30261689 → `screen_node.js`
- [x] `cb4()/qSH()` 浏览器指纹 JSON（22 字段，大部分已解明）
- [x] `vMN()/G0H()` cookie hash 读取
- [x] `Yx4()/fBH()` hash 比较结果 `{mis, og}`
- [x] 事件数据变量映射（鼠标/键盘/触摸 → 4/4/6 部分拆分）

---

## 未完成

### P0 — 加密管线（不完成无法生成合法 sensor_data）

- [ ] **`wMN()` 字符替换加密**
  - test.js: `vrH()`，live: `wMN()`
  - 基于 `hLN[127]` 映射数组 + `j5N`（可打印 ASCII 字符集）
  - 输入: JSON.stringify 后经 AhN 变换的字符串 + 密钥 `pX4[0]`
  - 需要: 完整还原映射表构建逻辑和替换算法

- [ ] **`AhN(lF, [str, key])` 预变换**
  - test.js: `q0H(Y, [...])`
  - JSON.stringify 之后、wMN 加密之前的变换步骤
  - 需要: 确认 lF 对应的 case 分支逻辑

- [ ] **`K6N()/FnH()` SHA256 hash**
  - 返回一个函数 `V5N`，调用后计算 SHA256
  - 输入: 多个字段拼接（需解析 `Bl(PJ, [...])` 的完整参数）
  - 输出: base64 编码的 SHA256 → `"jfrn/T6rQQcFgSW5eNibEwH7sUbD1TLIOALzldqy+ps="`

- [ ] **`wx()/k3()` 校验码**
  - 4 个参数: 时间差、hash、计数器、事件数据
  - 输出: 类似 `"acYYffdj99cfkigcdofg"` 的字符串
  - 需要: 理解编码规则

### P1 — 数据组装（需要理解才能正确填充字段）

- [ ] **`w3N()/xDN()` sensor_data 头部生成**
  - test.js: `S7Y()/cmH()`
  - 生成 sensor_data 字符串的前缀/版本信息部分

- [ ] **`UMN()/bRH()` startTs 变换**
  - 已知: 使用 `Math.random` + `Math.floor`，返回 `[number, number]`
  - 需要: 完整还原算法

- [ ] **`pIN()/BGH()` input 元素采集**
  - 返回: `"0,0,0,0,4706,113,0;..."`
  - 需要: 确认采集了哪些 input 的哪些属性（type/maxLength/value 等）

- [ ] **`cb4()/qSH()` 中未确认字段**
  - `hal`: 887214165746 — 可能是 performance.memory 相关
  - `xag`: 12147 — 含义不明
  - `ucs`: "7396" — 含义不明
  - `hz1`: 436593 — 某种 hash

### P2 — 事件与初始化（无用户交互时可跳过）

- [ ] **事件采集逻辑**
  - `wON()` 鼠标事件 → 无操作时 `"0,0,0,0"`
  - `gFN()` 键盘事件 → 无操作时 `"0,0,0,0"`
  - `PWN()` 触摸事件 → 无操作时 `",,,,,"`
  - 有交互时的数据格式需要深入分析

- [ ] **`firstLoad` 分支初始化**
  - `Wc4()`, `c44()`, `ljN()` 等首次加载额外执行的函数
  - 可能影响后续 sensor_data 的某些字段

- [ ] **密钥来源 `pX4`**
  - `pX4[0]` 用于 wMN 加密
  - `pX4[1]` 用于 AhN 变换
  - 需要确认密钥从哪里获取（可能来自初始 GET 响应或硬编码）

---

## 文件索引

| 文件 | 内容 |
|------|------|
| `screen_node.js` | fpValStr(14字段) + navigator位掩码(25属性) 伪代码 |
| `progress_cBH_analysis.md` | 完整分析进度、变量映射表、运行时值 |
| `fp_node.js` | 指纹相关 |
| `qbb_node.js` | qbb 相关逻辑 |
| `rnb_reconstructed.js` | rnb 还原 |
| `get_telemetry.js` | 遥测采集 |
| `bmak_dump.json` | bmak 对象运行时快照 |
| `sensor_callstack.json` | POST 发送时的调用栈 |

---

## 建议攻克顺序

```
1. wMN 加密算法 ← 核心，决定能否本地生成
   ↓
2. AhN 预变换 ← wMN 的输入依赖这一步
   ↓
3. K6N SHA256  ← sensor_data 的完整性校验
   ↓
4. wx 校验码  ← sensor_data 的二次校验
   ↓
5. w3N 头部   ← 拼接最终字符串
   ↓
6. UMN/pIN 等字段 ← 正确填充数据
```
