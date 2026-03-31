# cBH 函数逆向分析进度文档

## 概述

test.js 中的 `cBH` 函数（第 8933 行）在 live 脚本中对应 `t84` 函数，定义在 `O2N` 的 switch-case `Y8`（Y8=25）内部。

Live 脚本 URL: `https://www.dhl.com/HQl4zWYs0/vIz/Wnh/gzZEKsp8zj_Y/O19SzVbw4S8L2b/XGwSAQ/LhIYM/kZOGl8B`

---

## 一、函数调用链

```
O2N (case Y8 初始化)
  → QKN() (触发 sensor 发送)
    → sfN() (条件判断后调用 t84 + MPN)
      → t84() (组装 sensor_data，等价于 cBH)
      → MPN() (XHR POST 发送)
```

---

## 二、变量映射表（test.js cBH → live t84）

### 核心数据组装变量

| test.js (cBH) | live (t84) | 含义 | 运行时值示例 |
|---|---|---|---|
| `LSH` | `c14` | 屏幕/环境指纹对象 | `{fpValStr:";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1", rVal:"-1", rCFP:"-1", td:2, fpValCalculated:true}` |
| `qlH` | `qDN` | `Date.now() - bmak.startTs` | `3686962` |
| `tXH` | `Ux4` | `do_en`（document 事件启用标志） | boolean |
| `bXH` | `r84` | `dm_en`（DOM 事件启用标志） | boolean |
| `rsH` | `Cm4` | `t_en`（touch 事件启用标志） | boolean |
| `EFH` | `OX4` | `"do_en,dm_en,t_en"` 拼接字符串 | 字符串 |
| `KBH` | `YKN` | `BGH()`/`pIN()` — input 标签属性 | `"0,0,0,0,4706,113,0;..."` |
| `QsH` | `Mb4` | `document.URL` 经正则替换 | URL 字符串 |
| `HCH` | `q44` | 平台版本号 | `"10,1"` |
| `dpH` | `Hc4` | `G0H()`/`vMN()` — cookie 中的 hash | `"A27741CBDDC9103CA90D379DC833A175"` |
| `HPH` | `Em4` | `fBH()`/`Yx4()` — hash 比较结果 | `{mis:0, og:"sm"}` |
| `r6H` | `kb4` | `qSH()`/`cb4()` — 浏览器指纹 JSON 数组 | 见下方详细内容 |
| `KSH` | `gC4` | `bRH()`/`UMN()` — startTs 处理 | `[109305, 101]` |
| `OsH` | `wc4` | 第二个时间差 `Date.now() - startTs` | 毫秒数 |
| `rpH` | `E3N` | `parseInt(UhH/vKN, 10)` | 整数 |
| `xcH` | `ADN` | `HxH(t8,[])`/`BX4(PX,[])` — 采集数据 | `30261689` |
| `H6H` | `qc4` | `Date.now()` 快照 | 时间戳 |
| `kDH` | `Jm4` | `xq(LSH.fpValStr)`/`DQN(c14.fpValStr)` | `4542` |
| `NsH` | `q74` | 固定字符串 | `"PiZtE"` |
| `MXH` | `wC4` | `FnH()()`/`K6N()()` — SHA256 hash | hash 字符串 |
| `pCH` | `f3N` | `k3()`/`wx()` — 校验码 | `"acYYffdj99cfkigcdofg"` |
| `XkH` | `xb4` | 最终 sensor_data 对象 | 大对象 |
| `SUH` | `AsN` | JSON.stringify → 加密 → 最终字符串 | sensor_data 字符串 |
| `PkH` | `Ob4` | 发送计数器 | `0` |
| `A8H` | `LZN` | firstLoad 标志 | `true` |
| `UhH` | `vKN` | 某个数值 | `18982` |

### 事件数据变量

| test.js | live | 含义 |
|---|---|---|
| `CBH = jEH()` | `Oc4 = wON()` | 鼠标事件数据 |
| `gsH = nQH()` | `l14 = gFN()` | 键盘事件数据 |
| `qkH = PjH()` | `B94 = PWN()` | 触摸事件数据 |
| `PKH()` | `XPN()` | 事件数据解析器（拆分为 4 部分） |
| `sCH` | `FkN` | 事件数据拼接 |
| `BBH, VJH, UVH, pkH` | `Ib4, XN4, ZJ4, CRN` | 鼠标事件 4 部分 |
| `TFH, rXH, jbH, KWH` | `cC4, HX4, mDN, pc4` | 键盘事件 4 部分 |
| `gFH, BcH, rbH, ACH, IbH, V6H` | `zx4, Om4, F44, z94, jX4, H84` | 触摸事件 6 部分 |

### 加密/后处理相关

| test.js | live | 含义 |
|---|---|---|
| `vrH()` | `wMN()` | 字符替换加密函数 |
| `q0H(Y, [...])` | `AhN(lF, [...])` | 某种变换 |
| `S7Y() / cmH()` | `w3N() / xDN()` | 头部生成 |
| `FnH()` | `K6N()` | 返回 hash 函数（V5N） |
| `k3()` | `wx()` | 校验码计算 |
| `NLN` | `NLN` | SHA-256 函数（变量名碰巧相同） |

### 辅助函数

| test.js | live | 含义 |
|---|---|---|
| `kwH()` | `BxN()` | `Date.now()` |
| `KtN()` | `KtN()` | `navigator.userAgent`（变量名相同） |
| `s5()` | `KtN()` | UA 获取 |
| `ZC()` | `ww()` | 减法 `a - b` |
| `gG()` | `VG()` | 取反 `!x` |
| `kZ()` | `Yp()` | 严格相等 `===` |
| `hI()` | `BO()` | 不等 `!==` |
| `n1(t8, [...])` | `Bl(PJ, [...])` | 对象构造器（从 key-value 数组构建对象） |
| `gU()` | `xd()` | 字符串拼接 `+` |
| `mkH()` | `L3N()` | 日志/调试函数 |
| `ws()` | `ws()` | cookie 读取（变量名相同） |

---

## 三、LSH / c14 分析

### 初始化

test.js 第 10928 行：
```js
var LSH = n1(t8, [key1, val1, key2, val2, ...]);
// 构建包含 fpValStr, rVal, rCFP 等字段的对象
```

### 条件更新（在 cBH/t84 内部）

```js
if (!LSH.fpValCalculated && (A8H === false || PkH > 0)) {
    LSH = Object.assign(LSH, KTH(), {fpValCalculated: false});
}
```

等价 live 代码：
```js
if (VG(c14[...fpValCalculated...]) && (Yp(LZN, VG(VG(Q9))) || Rq(Ob4, wW))) {
    c14 = J2.Object.assign(c14, QWN(), Bl(PJ, [...fpValCalculated..., VG(Q9)]));
}
```

### KTH() / QWN() 返回值

采集 screen 相关数据，伪代码在 `dhl/intermediate/screen_node.js`：

```js
{
    fpValStr: ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1",
    //         空;SvK;mZK;nWK(16);nWK(44);nWK(26);nWK(41);LvK(545);nWK(22);ZSK;V6K;jZK;VgK;SvK
    td: 2  // 计算耗时（毫秒）
}
```

字段含义：
- `""` — 空字符串（占位）
- `-1` — `navigator.doNotTrack`（SvK）
- `"dis"` — mZK 固定值
- `",7"` — `nWK(16, [])` 返回值
- `true` — `nWK(44, [])` 某种特性检测
- `true` — `nWK(26, [])` 某种特性检测
- `true` — `nWK(41, [])` 某种特性检测
- `-480` — 时区偏移 `LvK(545, [])`
- `true` — `nWK(22, [])` 某种特性检测
- `24/32` — `screen.colorDepth`
- `24/32` — `screen.pixelDepth`
- `true` — `navigator.cookieEnabled`
- `false` — `navigator.javaEnabled()`
- `-1` — `navigator.doNotTrack`

### DQN / xq 函数

将 `fpValStr` 中所有 ASCII < 128 的字符的 charCode 求和：

```js
function DQN(str) {
    if (str == null) return -1;
    var sum = 0;
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) sum += code;
    }
    return sum;
}
```

运行时值：`4542`

---

## 四、cb4() / qSH() 浏览器指纹（已解明）

返回 JSON 数组，每个元素是一个 `{key: value}` 对象：

```json
[
  {"ibr": 0},           // 是否为机器人浏览器
  {"wih": 780},          // window.innerHeight
  {"wiw": 836},          // window.innerWidth
  {"npl": 5},            // navigator.plugins.length
  {"wow": 844},          // window.outerWidth
  {"ash": 891},          // screen.availHeight
  {"ua": "Mozilla/5.0..."}, // navigator.userAgent
  {"asw": 1718},         // screen.availWidth
  {"hal": 887214165746}, // performance.memory 或类似
  {"pha": 0},            // 某个标志
  {"swi": 1718},         // screen.width
  {"nap": "Gecko"},      // navigator.appName 相关
  {"tsd": 0},            // 某个标志
  {"she": 918},          // screen.height
  {"xag": 12147},        // 某个采集值
  {"nps": "20030107"},   // navigator.productSub
  {"ucs": "7396"},       // 某个字符串
  {"adp": "cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:1,isc:0,vib:1,bat:1,x11:0,x12:1"}, // 高级特性检测
  {"ran": "0.298352781149"}, // Math.random 快照
  {"wdr": 0},            // 某个标志
  {"dau": 0},            // 某个标志
  {"nal": "en-US"},      // navigator.language
  {"hz1": 436593}        // 某个 hash
]
```

---

## 五、其他关键函数运行时值

| 函数 | 返回值 | 说明 |
|---|---|---|
| `vMN()` / G0H | `"A27741CBDDC9103CA90D379DC833A175"` | 读取 `_abck` cookie 第一个 `~` 前的 hash，详见 `screen_node.js` |
| `Yx4()` / fBH | `{mis:0, og:"sm"}` | 比较当前与上次 cookie hash，mis=0 匹配/-1 不匹配，og="sm" 初始/旧hash，详见 `screen_node.js` |
| `UMN()` / bRH | `[109305, 101]` | startTs 的某种变换（随机因子 + 校验） |
| `BX4(PX,[])` / HxH | `30261689` | 25 属性位掩码（navigator/Math/window），详见 `screen_node.js` |
| `pIN()` / BGH | `"0,0,0,0,4706,113,0;..."` | 页面 input 元素属性（type, maxLength, value 等） |
| `wON()` | `"0,0,0,0"` | 鼠标事件（无操作时为 0） |
| `gFN()` | `"0,0,0,0"` | 键盘事件（无操作时为 0） |
| `PWN()` | `",,,,,"`  | 触摸事件（无操作时为空） |

---

## 六、sensor_data 最终格式

```
{ver};{field1};{field2};{field3};{timestamp_delta};{sha256_hash};{event_counts};{encrypted_data}
```

- 总共 23 个分号分隔的字段
- field0 = `3` (版本号)
- field1 = `0`
- field2 = `1`
- field3 = `0`
- field4 = `3686962` (时间差 ms)
- field5 = `jfrn/T6rQQcFgSW5eNibEwH7sUbD1TLIOALzldqy+ps=` (SHA256 base64)
- field6 = `29,0,0,0,3,0` (事件计数: ke_cnt, me_cnt, te_cnt, doe_cnt, dme_cnt, dte_cnt)
- field7+ = 加密后的数据

加密过程：
1. `xb4` = 组装大对象（所有采集数据）
2. `AsN = JSON.stringify(xb4)`
3. `AsN = AhN(lF, [AsN, pX4[1]])` — 某种变换
4. `AsN = wMN(AsN, pX4[0])` — 字符替换加密
5. 拼接头部和时序数据

---

## 七、bmak 全局对象

```js
window.bmak = {
    startTs: 1774428331492,  // 脚本加载时的 Date.now()
    firstLoad: true,         // 是否首次加载
    listFunctions: {}        // 函数注册表
}
```

---

## 八、未完成/需深追的部分

### 优先级高
1. **`wMN` 加密算法** — 字符映射替换，基于 `hLN[127]` 数组和 `j5N`（可打印 ASCII 字符集）。需要完整还原加密逻辑才能本地生成 sensor_data。
2. **`K6N()` / `FnH()` → SHA256 hash 计算** — 输入是哪些字段的拼接？需要解析 `Bl(PJ, [...])` 的完整参数列表。
3. **`wx()` / `k3()` 校验码** — 4 个参数：时间差、hash、计数器、事件数据，生成 `"acYYffdj99cfkigcdofg"` 这样的字符串。
4. **`AhN(lF, [...])` 变换** — JSON.stringify 后的第一步变换，需要确认 lF 对应的 case 逻辑。

### 优先级中
5. ~~**`BX4(PX, [])` → 30261689**~~ ✅ **已完成** — 25 个属性的位掩码（22 navigator + 2 Math + 1 window），详见 `screen_node.js` 中 `getNavigatorBitmask()`。
6. **`UMN(startTs)` 的完整逻辑** — 已知使用 `Math.random` 和 `Math.floor`，返回 `[number, number]`。
7. **`cb4()` / `qSH()` 指纹中未确认的字段**：`hal`, `xag`, `ucs`, `hz1` 的具体含义。
8. **`pIN()` / `BGH()` input 采集** — 采集了哪些 input 的哪些属性。

### 优先级低
9. **事件采集逻辑** — `wON/gFN/PWN` 在有用户交互时会返回什么数据。
10. **`w3N() / xDN()` 头部生成** — sensor_data 字符串的前缀部分。
11. **`firstLoad` 分支** — 首次加载时额外执行的 `Wc4()`, `c44()`, `ljN()` 等初始化。

---

## 九、exports 对象结构（XLN[0]）

O2N 调用时传入的参数对象：

```json
{
  "i": 1,
  "l": false,
  "exports": {
    "reset": false,
    "navPerm": "8",
    "ifrmAttr": [],
    "perfAttr": "",
    "pluginData": "",
    "filePath": "",
    "iframeChromium": "",
    "stealthPluginManipulation": "",
    "runtimePlaywright": "",
    "sharedArrayBuffer": "",
    "devPixelRatio": "",
    "synthesisSpeechHash": "0",
    "ajType": 0,
    "sensorData": "...(完整sensor_data)...",
    "fpcf": {
      "fpValStr": ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1",
      "rVal": "-1",
      "rCFP": "-1",
      "td": 2,
      "fpValCalculated": true
    },
    "tabId": "mn5stb6sy9c01",
    "trusted": 0,
    "notTrusted": 0,
    "ajt13Count": 0,
    "untrustedKeyDownCount": 0,
    "untrustedClickCount": 0,
    "untrustedInputCount": 0
  }
}
```
