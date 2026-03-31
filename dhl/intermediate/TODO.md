# DHL Akamai sensor_data 逆向 TODO

## 目标
完整还原 sensor_data 的生成逻辑，实现本地构造合法 sensor_data。

---

## 已完成

### 整体框架
- [x] 定位 sensor_data POST 发送函数链：`O2N → QKN → sfN → t84 → MPN`
- [x] 建立 test.js(cBH) ↔ live(t84) 变量映射表（40+ 变量）
- [x] 解析 sensor_data 最终格式：`header;timing;encrypted_payload`
- [x] 解析 exports/XLN[0] 对象结构
- [x] 识别 bmak 全局对象结构

### 数据采集
- [x] `fpValStr` 生成（14 字段分号拼接） → `screen_node.js`
- [x] `xq()/DQN()` ASCII charCode 求和 → 4542
- [x] `LSH/c14` 对象结构及初始化流程
- [x] `KTH()/QWN()` 包装层（timing + fpValStr）
- [x] `HxH(t8)/BX4(PX)` navigator/Math 25 属性位掩码 → 30261689 → `screen_node.js`
- [x] `cb4()/qSH()` 浏览器指纹 JSON（23 字段，全部解明） → `screen_node_xag_live.js`
- [x] `vMN()/G0H()` cookie hash 读取
- [x] `Yx4()/fBH()` hash 比较结果 `{mis, og}`
- [x] 事件数据变量映射（鼠标/键盘/触摸 → 4/4/6 部分拆分）
- [x] `ajr` 字段: `sha256Hex(userAgent) + sha256Hex(startTimestamp)` → `screen_node_xag_live.js`
- [x] `adp` 字段: 14 项自动化检测探针完整还原 → `screen_node_xag_live.js`
- [x] `fpc` 字段: `xq(fpValStr)` 的字符串化
- [x] `din` 浏览器指纹 23 字段运行时顺序已确认 → `getBrowserFingerprint()`
- [x] `build9013PayloadLive()` 完整 payload 结构及默认值 → `screen_node_xag_live.js`
- [x] `din` 字段 shuffle 前固定顺序确认 (2026-03-30): ua,xag,nps,nal,nap,npl,pha,wdr,dau,hz1,tsd,asw,ash,swi,she,wiw,wih,wow,adp,ucs,ran,hal,ibr

### 加密管线
- [x] **`wMN()/vrH()` 字符替换加密 — 算法完整还原** ✅
  - 多字母替换密码（polyalphabetic substitution cipher）
  - 字符集 `gh`（92 字符）: `" !#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~"`
  - 跳过字符: `"` (34), `'` (39), `\` (92) → CP = -1，不做替换
  - 映射表 `CP[0..126]`: ASCII → gh 索引（-1 表示不替换）
  - LCG 密钥更新: `key *= 65793; key &= 0xFFFFFFFF; key += 4282663; key &= 0x7FFFFF`
  - 每字符偏移: `offset = ((key >>> 8) & 0xFFFF) % 92`
  - 替换: `newIdx = (CP[charCode] + offset) % 92; char = gh[newIdx]`
  - **密钥来源: `bm_sz` cookie 的 `~` 分隔第 3 段，`parseInt` 取整**
  - 实测验证: `encrypt(gnInput, 3289157) === encrypted` ✅

- [x] **sensor_data 明文字段名完整解明** ✅
  - 通过 hook `JSON.stringify` 捕获加密前明文
  - 完整字段名: `ver, fpt, fpc, ajr, din, eem, ffs, vev, inf, ajt, kev, dme, mev, doe, pur, pev, mst, o9, tev, sde, per, pde, oev, if, pus, ffl, sww, te, nte, mte, tcd, pnte, pte, pmte, tab, sws, mis, og, fwd`
  - `din` = 浏览器指纹数组 (qSH 输出)
  - `mst` = 遥测元数据数组 (含 kevl, mevl, tevl, sts, nfas, jsrf 等)
  - `ffl` = 脚本标识 (URL 中的 `ictOrfLtXVN2rmL51S`)

- [x] **sensor_data 最终组装流程** ✅
  - `SUH = JSON.stringify(XkH)` → 序列化数据对象
  - `SUH = q0H(Y, [SUH, hOH[1]])` → AhN 字符置换（permutation）
  - `SUH = vrH(SUH, hOH[0])` → wMN 加密
  - `nNY = timing_string` → 计时/计数器拼接
  - `MTY = S7Y(hOH) 或 cmH(hOH)` → header 生成
  - `final = MTY + ";" + nNY + ";" + SUH` → 最终拼接
  - header 格式: `"3;0;1;0;{timestamp_diff};{sha256_base64};{counts}"`

- [x] **`K6N()/FnH()` SHA256 hash** ✅
  - 标准 SHA256 实现（QAH/b3Q/fx 函数），含完整 K 表
  - 输出: base64 编码
  - 输入: 多个字段拼接（需进一步确认完整参数列表）

- [x] **密钥来源已确认** ✅
  - `hOH = mMH()` 从 `bm_sz` cookie 解析
  - `bm_sz` 格式: `HASH~base64data~key0~key1`
  - `hOH[0]` = `parseInt(bm_sz.split('~')[2])` → wMN/czG 加密密钥（实测 = 3289157）
  - `hOH[1]` = bundle 内嵌常量，通过 `AI[encodedKey]()` 获取
    - AI 对象键名是数字替换编码，密码表每次加载变化
    - 后缀分隔符 + 填充（如 `xMMMMMM`、`Obbbbbb`、`2nnnnnn`）
    - seeds[1] = 非标准常量的那个 AI 值（排除 65793/4282663/8388607 等已知 LCG 常量）
    - 观测值: 4257762 / 8735511 / 9882545 / 1245143 / 3795670 / 3606464（每 bundle 版本不同）

- [x] **seeds[1] AST 自动提取 — 完整实现** ✅ → `extract_seed1.js`
  - 用 Babel 解析 bundle AST，无需运行代码
  - 自动定位 AI 对象键名数组（60-70 个编码字符串）
  - 自动破解数字替换密码：已知常量 65793(5位) + 4282663(7位) 反推映射
  - 分隔符自动检测（排除 dispatch table 干扰）
  - 5 常量交叉验证: 65793, 4282663, 8388607, 65535, 4294967295
  - 2026-03-31 对当前 live bundle 仍然可行:
    - `node extract_seed1.js current_live_bundle_20260331c.js`
    - 输出 `seeds[1] = 2102249`
    - 运行时 `Jd9() = [3425335, 2102249]`，与提取结果的第二项完全一致
  - 2026-03-31 同一路径后续轮换 bundle 仍可提取:
    - `node extract_seed1.js current_live_bundle_20260331d.js`
    - 输出 `seeds[1] = 7961354`
    - 说明即使 URL 路径不变，bundle 内容也会轮换，`seeds[1]` 不能长期硬编码
  - 2026-03-31 当前再后续轮换 bundle 仍可提取:
    - `node extract_seed1.js current_live_bundle_20260331e.js`
    - 输出 `seeds[1] = 8456161`
  - 2026-03-31 当前 f 版轮换 bundle 仍可提取:
    - `node extract_seed1.js current_live_bundle_20260331f.js`
    - 输出 `seeds[1] = 7602719`
  - 四个 bundle 版本全部通过:
    - `tmp_dhl_current_bundle.js` → seeds[1] = 1245143
    - `test.js` → seeds[1] = 3606464
    - 浏览器 live bundle (2026-03-27) → seeds[1] = 3795670
    - 浏览器 live bundle (2026-03-31) → seeds[1] = 2102249

---

## 未完成

### P0 — 加密管线剩余

- [x] **`AhN` 字符置换算法 — 完整还原** ✅ → `screen_node_xag_live.js:ahnPermute()`
  - **关键发现**: 不是字符级 shuffle，是**按 `:` 分隔符拆分 token 后做 Fisher-Yates shuffle**
  - Dispatcher case 29 (Dg) in live bundle
  - 分隔符: `":"` (冒号)，JSON 字符串被拆为 ~216 个 token
  - LCG 常量与 czG **完全相同**: multiply=65793, add=4282663, mask=0x7FFFFF, shift=8, AND=0xFFFF
  - 算法:
    ```
    tokens = input.split(":")
    for i = 0 to tokens.length:
      idx1 = ((key >> 8) & 0xFFFF) % tokens.length
      key = (key * 65793) & 0xFFFFFFFF; key = (key + 4282663) & 0x7FFFFF
      idx2 = ((key >> 8) & 0xFFFF) % tokens.length
      key = (key * 65793) & 0xFFFFFFFF; key = (key + 4282663) & 0x7FFFFF
      swap(tokens[idx1], tokens[idx2])
    return tokens.join(":")
    ```
  - 密钥: `seeds[1]` = bundle 内嵌常量 `AI["HkAhJ$$II"]()` (每 bundle 不同，如 4257762 / 8735511)
  - 运行时验证: key=4257762, len=216 → iter0: idx1=215, idx2=59 ✓; iter1: idx1=37, idx2=198 ✓
  - **加密管线完整流程确认**:
    1. `JSON.stringify(payload)` → 序列化
    2. `ahnPermute(json, seeds[1])` → token shuffle (按 `:` 拆分)
    3. `czG_live(permuted, seeds[0])` → 多表替换加密
    4. `header + ";" + timing + ";" + encrypted` → 最终拼接
  - **之前的 encode9013PayloadLive 有两个错误**: 缺少 AhN 步骤 + 密钥用反了（已修正）

- [x] **mst 31 字段完整追踪** ✅ (2026-03-30, HmK/gpK 运行时断点)
  - 变量映射 (live bundle): C2K→kevl, qPK→mevl, sDK→tevl, mPK→devl, CTK→dmvl,
    vEK→pevl, FzK→tovl, GNK→delt, qrK→it, PEK→sts, HzK→fct, bLK→dd2,
    mEK→kc, OtK→mc, U2K→ww8, BDK→pc, qtK→tc, hsK→ssts, qCK→tst,
    htK→nfas, NrK→jsrf, VPK→jsrf1/jsrf2, n6K→signals, MrK+brK+j0K→dvc
  - 新确认公式:
    - kevl/mevl/tevl = 变量 | 默认值 (1/32/32)，位掩码 OR
    - devl = doe 字符串第 2 字段 (doc event 时间戳差)
    - dmvl = dme 字符串第 2 字段 (device motion 时间戳差)
    - tovl = devl + dmvl
    - delt = Date.now() - bmak.startTs
    - **ww8 = parseInt(dd2 / 6, 10)** (dd2 除以 6 取整)
    - **ssts = delt + 1** (捕获时间差 1ms)
    - **tst = tovl** (等值)
    - fct = fpState.td (指纹计算耗时)
    - nfas = 30261689 (dispatcher case 62, bundle 常量)
    - dvc = MrK + "," + brK + "," + j0K
      - MrK = SY(delt, ajr, fct, tovl) — canvas/webgl 指纹哈希
      - brK = 小时间差 (~8ms)
      - j0K = 插件枚举字符串
  - 新发现的 payload 字段 (OvK 完整结构):
    - `dsi` 数组: get/set/ico/ift/xof/xot/wev/wre/wdr/iks/lds/sst
    - `wsl` 字符串: WebGL/screen 指纹
    - `hls` 字符串
    - `ffl` = URL 路径中的脚本标识 (如 "ua5fmf0pQwkJm2u1Op")
    - `per` = "99999944949322244999" (非之前的 "8")
    - `ajt` = "10,1" (非之前的 "0,0")
    - `sww` 包含 s024-s074 大量 Client Hints 数据
    - `fwd` 字段不在当前 live bundle OvK 中

- [x] **mst builder 落地到还原脚本** ✅ (2026-03-30)
  - `screen_node_xag_live.js` 新增:
    - `buildMstLive()`
    - `computeMstDd2Live()`
    - `computeMstWw8Live()`
    - `computeMstDvcLive()`
  - 已将 `build9013PayloadLive()` 中内联 `mst` 数组抽离为独立构造函数
  - 已确认纯 Node 环境下可直接生成 31 字段 `mst`，不再依赖 `window`
  - `dvc` 当前支持显式传入 `dvc` 或 `dvcParts=[hash,delta,plugins]` 组装
  - 未解部分仍然是 `dvc.hash(SY)`、`jsrf1/jsrf2`、`signals` 的真实运行时来源

- [x] **mst 当前 live bundle 实值捕获** ✅ (2026-03-30, JSON.stringify Hook)
  - 通过 `inject_before_load + JSON.stringify(payload)` 直接抓到加密前明文 payload
  - 当前 bundle 路径: `ua5fmf0pQwkJm2u1Op`
  - 已确认当前 live payload 中：
    - `ajt = "0,0"`（不是旧记录里的 `"10,1"`）
    - `per = "8"`（不是旧记录里的 `99999944949322244999`）
    - `sww = {"s024":-1}`（当前路径只看到最小对象）
    - `fwd = [{fmh:""},{fmz:""},{ssh:"0"}]`
  - 三次 `mst` 实测样本：
    - 样本1: `delt=15, ssts=23, jsrf1=60246, jsrf2=82, dvc=a377iqmdidak73kif2di,23,h+j+d+c+b+e+g+f+i+a+l+`
    - 样本2: `delt=8, ssts=11, jsrf1=83573, jsrf2=41, dvc=a3hh9ifc9fdiaalh9yol,21,h+j+d+c+b+e+g+f+i+a+l+`
    - 样本3: `delt=5, ssts=7, jsrf1=30944, jsrf2=54, dvc=ad77komflafqikQqQ27f,16,h+j+d+c+b+e+g+f+i+a+l+`
  - 由 live 证据推翻的旧结论：
    - `ww8 = parseInt(dd2 / 6, 10)`：当前 bundle 不成立，实测稳定为 `0`
    - `ssts = delt + 1`：当前 bundle 不成立，`ssts` 与 `delt` 不相等
  - 当前稳定结论：
    - `dd2 = parseInt(parseInt(sts / (2016 * 2016), 10) / 23, 10)` ✅
    - `ww8 = 0`（当前 no-interaction 路径）✅
    - `jsrf = "PiZtE"` ✅
    - `jsrf1/jsrf2` 每次请求都会变化
    - `dvc` 第 3 段插件串当前稳定为 `h+j+d+c+b+e+g+f+i+a+l+`

- [ ] **`wx()/k3()` 校验码 — dvc 字段**
  - 4 个参数: 时间差、hash、计数器、事件数据
  - 输出: `"3377gqg73fqa7k13xqsi,8,j+k+d+l+i+e+g+h+c+a+"` 格式
  - dvc = MrK(canvas hash) + "," + brK(时间差) + "," + j0K(插件枚举)
  - MrK 由 SY(GNK, mTK, HzK, FzK) 计算
  - 需要: SY 函数内部逻辑还原

### P0.5 — 两阶段 POST 模式 (2026-03-31 运行时发现)

> 当前 bundle (`current_live_bundle_20260331g.js`) 发送 **两次** sensor_data POST:
> - **第 1 次** (delt≈9ms): 页面加载后立即发送，异步字段尚未完成
> - **第 2 次** (delt≈160s 或异步完成后): 包含所有异步填充的完整数据
>
> 调用栈不同:
> - 第 1 次: `l8X → p9X → xf6 → dFX → ...`
> - 第 2 次: `l8X → p9X → cBX → pV → ...`

| 字段 | 第 1 次 POST | 第 2 次 POST | 说明 |
|------|------------|------------|------|
| `per` | `”8”` | `”99999944949322244999”` | 异步 Permissions API |
| `dsi` | `undefined` | 完整 12 字段数组 | 异步 DOM 检测 |
| `wsl` | `undefined` | `”4294967296,35760836,...,1,1”` | 异步 performance/WebGL |
| `hls` | `undefined` | `”-1,,,1,”` | 异步探针 |
| `sww` | `{s024: -1}` | 完整 ~50 字段对象 | 异步 Client Hints |
| `fwd` | `[{fmh:””},{fmz:””},{ssh:”0”}]` | `[{fmh:””},{fmz:”1”},{ssh:”<sha256>”}]` | ssh 异步填充 |
| `ajt` | `”0,0”` | `”10,1”` | LPW 状态演化 |
| `inf` | `=== ffs` (4 个 input) | `!== ffs` (inf=4, ffs=5) | ffs 动态变化 |
| `mst.devl/dmvl` | `0` / `0` | `160059` / `160059` | 文档/设备事件 |
| `mst.delt` | `9` | `160355` | 时间差 |
| `mst.ww8` | `0` | `3164` | 见下方分析 |
| `mst.ssts` | `11` | `160355` | 见下方分析 |
| `mst.jsrf1/jsrf2` | `32644/40` | `105388/53` | 每次请求不同 |
| `mst.dvc` | `”a3YYe7....,27,b+j+...”` | `”cciiej....,42,b+j+...”` | hash 和 delta 变化 |
| `sws` | `0` | `0` | 两次都相同 |
| `pmte` | `0` | `0` | 两次都相同 |

### P1 — 还原脚本审计（`screen_node_xag_live.js`）

> 2026-03-31 审计。标注哪些字段有完整生成逻辑、哪些只是透传 opts 或硬编码。
> 2026-03-31 运行时捕获更新：g 版 bundle 两阶段 POST 完整 payload。

#### `build9013PayloadLive()` payload 字段审计

**有完整生成逻辑 ✅**

| 字段 | 生成方式 |
|------|---------|
| `fpt` | `fpValStr` 14 字段指纹 ← `screen_node.js` |
| `fpc` | `buildFpcLive()` = `String(xq(fpt))` |
| `ajr` | ~~`sha256(UA)+sha256(startTs)`~~ — **当前 bundle 已变更**，处理逻辑已实现 |
| `din` | `getBrowserFingerprint()` 23 字段数组 |
| `eem` | 固定 `”do_en,dm_en,t_en”` |
| `ffs` | `buildFfsLive()` 遍历 input 元素 |
| `pur` | `location.href` |
| `sde` | 固定 `”0,0,0,0,1,0,0”` |
| `o9`/`pus`/`te`/`nte`/`mte`/`pnte`/`pte`/`tab` | 固定 0 |
| `tcd` | 固定 `{}` |
| `mis` | 固定 0 |
| `og` | 固定 `”sm”` |
| `fwd` | `[{fmh:””},{fmz:”0”或”1”},{ssh:”0”或sha256}]` — 第 2 次 POST 异步填充 |

**有生成函数但逻辑不完整 ⚠️**

- [ ] **`per`** — `buildPerLive()` 硬编码返回 `”99999944949322244999”`
  - 未实际查询 Permissions API
  - 20 个权限名的固定列表未确认
  - 需要: 还原异步查询 `navigator.permissions.query()` 的逻辑
  - 2026-03-31 运行时补充:
    - **第 1 次 POST: `per = “8”`** — 异步查询未完成时的占位值
    - **第 2 次 POST: `per = “99999944949322244999”`** — 20 位查询结果
    - 说明 `per` 有一个同步 fallback 值 `”8”`，以及一个异步完成后的完整值
    - 每位数字含义: 9=not_supported/error, 4=denied, 3=prompt, 2=granted
    - 仍需: 确认 20 个权限名的顺序列表

- [ ] **`dsi`** — `buildDsiLive()` 多个字段硬编码
  - `ico`: 空字符串，缺 sha256 输入源追踪
  - `ift`: 硬编码 `”3”`，实际是 iframe/frame 计数，**页面相关**
  - `xof`/`xot`: 硬编码 `”2,5,1,1,8”`，cross-origin frame 统计，**页面相关**
  - 需要: 还原 `ico` 的 hash 输入、`ift`/`xof` 的 DOM 查询逻辑
  - 2026-03-31 运行时补充:
    - **第 1 次 POST: `dsi = undefined`** — 异步检测未完成，JSON 序列化时被省略
    - **第 2 次 POST: `dsi` 完整 12 字段**:
      - `get: “”` ✅
      - `set: “0”` ✅
      - **`ico: “070f409b82df3bdd2f51a6415c7895353c153c47fe6dd8a0f87f3d14c46ccb2b”`** — 64 字符 sha256 hex
      - `ift: “3”` ✅ 与硬编码一致
      - `xof: “2,5,1,1,8”` ✅ 与硬编码一致
      - `xot: “2,5,1,1,8”` ✅
      - `wev: “NA;wev;NA”` ✅
      - `wre: “NA;wre;NA”` ✅
      - `wdr: “0”` ✅
      - `iks: “”` ✅
      - `lds: “1”` ✅
      - `sst: “”` ✅
    - `ift`/`xof`/`xot` 在当前 DHL 页面稳定为 `”3”` / `”2,5,1,1,8”`，但仍是页面相关值
    - **关键仍缺**: `ico` 的输入源（什么内容被 sha256？）

- [ ] **`wsl`** — `buildWslLive()` 部分硬编码
  - `[0-2]` performance.memory: ✅ 有实际读取
  - `[3]` AudioContext sampleRate: 硬编码 `-1`，未探测
  - `[4]` meta 标签计数: ✅ 有实际查询
  - `[5-9]` 能力标志位 `1,1,1,0,1`: **硬编码**，探测逻辑未还原
  - `[10-17]` WebGL 参数: 全空，**WebGL 指纹采集逻辑完全未还原**
  - `[18-19]` 尾部标志位: 硬编码 `1,1`
  - 需要: 还原 `[3]` AudioContext、`[5-9]` 能力探测、`[10-17]` WebGL 参数
  - 2026-03-31 运行时补充:
    - **第 1 次 POST: `wsl = undefined`** — 异步采集未完成
    - **第 2 次 POST: `wsl = “4294967296,35760836,31651184,400,19,1,1,1,0,1,,,,,,,,,1,1”`**
      - `[0]` = 4294967296 (2^32, jsHeapSizeLimit) ✅
      - `[1]` = 35760836 (totalJSHeapSize) ✅
      - `[2]` = 31651184 (usedJSHeapSize) ✅
      - **`[3]` = 400** — **不是 -1！** 不像 sampleRate (44100/48000)，可能是 AudioContext 相关的其他值或耗时
      - `[4]` = 19 (meta tags) ✅
      - `[5-9]` = `1,1,1,0,1` ✅ 与硬编码一致
      - `[10-17]` = 全空 — headless/无 GPU 环境 WebGL 不可用，实际浏览器会有值
      - `[18-19]` = `1,1` ✅

- [ ] **`sww`** — `buildSwwLive()` 框架完整但有硬编码
  - `swrt`/`wrt`: 默认 `7`/`20`，脚本/窗口运行时指标计算逻辑未还原
  - `s027`/`s028`: 固定 null，含义未确认
  - 奇偶对称采样（反篡改）框架: ✅ 已实现
  - navigator/UA-CH 读取: ✅ 有实际读取
  - 需要: 还原 `swrt`/`wrt` 计算、确认 `s027`/`s028`
  - 2026-03-31 运行时补充:
    - **第 1 次 POST: `sww = {s024: -1}`** — 仅 s024，异步未完成
    - **第 2 次 POST: 完整对象**:
      - `s024: 0` (从 -1 变为 0)
      - **`swrt: 8`** (实测值，非默认 7)
      - **`wrt: 15`** (实测值，非默认 20)
      - `s027: null, s028: null` ✅ 运行时确认始终为 null
      - `s029/s030: “Asia/Shanghai”` ✅
      - `s031/s032: “en-US”` ✅
      - `s033/s034: [“en-US”,”en”]` ✅
      - `s035/s036: 8` ✅
      - `s037/s038: 2` (hardwareConcurrency) ✅
      - `s039/s040: [“3g”,-1,”null”]` ✅ 连接信息
      - `s041-s046:` UA/appVersion/platform 对称采样 ✅
      - `s047/s048:` brands 数组 ✅
      - `s049-s066:` UA-CH 高熵值对称采样 ✅
      - `s067-s074: null` ✅
    - swrt/wrt 分析: 来自 `rTX()` 函数（运行时性能计量），每次请求值不同
    - s027/s028: 运行时确认为 null，可以确定当前路径下**不使用**

- [ ] **`hls`** — 无生成函数，硬编码 `”-1,,,1,”`
  - 2026-03-31 静态补充:
    - 初始化/重置路径: `LAW = “-1,,,1,”` (live.js:6807)
    - 异步路径 `GAW()`: 先置临时值，再从 9 项探针数组 `j60` 拼接覆盖 (live.js:7337-7374)
    - 异常路径: fallback 到另一固定字符串构造 (live.js:7379)
  - 2026-03-31 运行时补充:
    - **第 1 次 POST: `hls = undefined`** — 异步探针未完成，JSON 序列化时被省略
    - **第 2 次 POST: `hls = “-1,,,1,”`** — 异步完成后回退到默认值
    - 说明当前 headless 环境下 `hls` 异步探针没能取到有效数据，最终 fallback 为初始值
  - 仍需: 运行时断点拿到 `j60[0..4]` 对 `hls` 五段的实际映射（需要在真实浏览器环境中测试）

**完全没有生成逻辑，纯透传 opts ❌**

- [x] **`ver`** — 已定位到当前 bundle 的初始化解码链 (2026-03-31)
  - **每次 bundle 更新都会变**
  - 2026-03-31 当前 paused-frame live 值: `y5rI+vtIYAZJrvGePz3kUram5oCNR/QVus0LswZEZeM=`
  - 2026-03-31 同一路径后续轮换 bundle 的新值: `yacvPNkHbOPdHJGCxibCUnXbqZM6JrA0AUpc39c5d0c=`
  - 2026-03-31 当前再后续轮换 bundle 的新值: `nvhrNrCoFGIbD/ukOAYB2m53Jy/bCtQW3jFLi/OeRmQ=`
  - 2026-03-31 较早一次 hook 还抓到过旧值: `ubAhg4nzYgG/X9FbSuJd5myzi9xbP3+e6E5ZbEaQwAU=`
    - 说明它确实是随 bundle/版本切换的字段；即使脚本 URL 路径不变，内容轮换后 `ver` 也会变化，不能继续保留旧硬编码
  - 2026-03-31 动态/静态证据链:
    - `l2X` 中 payload 主体通过 `lr9 = x5(R3, [key1, val1, key2, val2, ...])` 构造
    - 暂停帧直接求值可得第 1 组 pair 为: `"ver" -> vF9`
    - 当前 bundle `current_live_bundle_20260331c.js` 中只有 1 处定义:
      `var vF9 = MO()[Bg(kO)](...)[MO()[Bg(Zh)](...)](bO()[Dl(I49)](...))`
    - 暂停帧拆表达式结果:
      - 左值 `MO()[Bg(kO)](...) = ""`
      - 方法名 `MO()[Bg(Zh)](...) = "concat"`
      - 右值 `bO()[Dl(I49)](...) = "y5rI+vtIYAZJrvGePz3kUram5oCNR/QVus0LswZEZeM="`
      - 因此 `vF9 === ""["concat"](decoded_string)`
    - 继续下钻当前 bundle 可见:
      - `Dl(I49) = "ON"`，即 `bO()[Dl(I49)] === bO().ON`
      - 当前缓存后的 getter 形态是 `function(){return A0;}`
      - 初始化代码模板来自 `case U9`: `var A0 = LM(jK, G8, Ml); bO()[kC] = function(){ return A0; }`
      - 即 `ver` 的 decoded string 进一步来自 `LM(480, 89, 96)` 这条 closure 缓存链
    - 参与该表达式调用位点的入参是常量索引 `dz=480, IF=66, vg=96`，不是请求时动态数据
    - 当前 bundle `current_live_bundle_20260331e.js` 再次确认结构不变，只是变量名和最终值轮换:
      - 唯一赋值位点: `var kPf=Wq()[Cl(Fl)](rJf,fD,hV)[Pl(typeof Ls()[hd(rd)],kR([],[][[]]))?Ls()[hd(FR)](vC(vC(Vd)),lAf,z2,Oj):Ls()[hd(gH)].apply(null,[vC(Vd),WN,Gs,m0])](Ls()[hd(Sx)](VU,dE,YKh,KV));`
      - 在该断点处逐项求值:
        - 左值 `Wq()[Cl(Fl)](rJf,fD,hV) = ""`
        - 方法名分支结果 = `"concat"`
        - 右值 `Ls()[hd(Sx)](VU,dE,YKh,KV) = "nvhrNrCoFGIbD/ukOAYB2m53Jy/bCtQW3jFLi/OeRmQ="`
      - 因此当前 e 版仍然满足 `kPf === ""["concat"](decoded_string)`，只是 decoded string 已换新值
    - 当前 bundle `current_live_bundle_20260331f.js` 再继续轮换后，decoded string 的上游模板也进一步钉到初始化解码器:
      - 现场单步从 `var kPf=...` 进入后，命中 `var px=function Qj9(Un9,NC9){...}`
      - `Qj9` 的 `case mX` 明确是“批量注册 getter 并缓存”的模板：
        `zb()[qn9[fU9]] = ...`
        `var AA9 = zT9(fj(fj(xw)), vm9, Qn9);`
        `zb()[qJ9] = function(){ return AA9; };`
      - `case L2` 可见 `qn9 = NC9[0]`，随后 `fU9 = 0`
      - `kw/Phr` 的 `case H0` 明确调用 `px(L2, [G29()])`
      - 因此当前 f 版可以确认：
        - getter 键名数组来源是 `G29()`
        - `decoded_string` 的真正上游已不是直接明文 getter，而是 `Qj9(case mX) -> zT9(...) -> Of(ck, ...)` 这条初始化缓存链
      - 这说明后续若要做纯静态 `extract_ver`，重点应该继续静态化 `zT9/Of(ck)`，而不是再追某个轮换后的局部变量名
    - 当前 f 版继续下钻 `zT9` 后，新确认:
      - `kw/Phr` 的 `case w0` 明确挂接:
        `zT9 = function(SN9, fG9, B19) { return Of.apply(this, [ck, arguments]); }`
      - 因此 `zT9` 只是转发壳，真正逻辑在 `Of/W09` 的 `case ck`
      - `Of/W09` 定义形态:
        `var Of = function W09(n59, nW9) { ... switch(n59) { ... case ck: { ... }}}`
      - 当前 `case ck` 的静态上下文表明它不是请求时 hash，而是在已有对象/环境上做存在性检查后，返回某个对象方法结果:
        - 入参对象是 `gc = YP[0]`
        - 命中条件之一是某些 `WX[...]` / `gc[...]` 路径非空
        - 返回语句形态是 `WX[...][...](gc)`
      - 这进一步说明 `decoded_string` 的生成依赖 bundle 初始化期的对象图和缓存表，不是单纯的源码明文或脚本 URL 派生值
    - 当前 f 版继续把 `case ck` 的索引层拆开后，又拿到一组更细的静态证据:
      - 基础数值链来自同一个初始化 switch:
        - `xw=1`
        - `c5=2`
        - `R8=3`
        - `WH=4`
        - `jn=5`
        - `xJ=7`
        - `sW=6`
        - `Np=9`
        - `hS=10`
        - `hC=8`
      - 因而 `case ck` 里几个关键索引可以直接静态算出:
        - `np = xJ - Np + c5 * hC = 14` -> `Cw(np) = "rU"`
        - `W6 = R8 - xJ * xw + Np * WH = 32` -> `SD(W6) = "DN"`
        - `dA = xw * hS + c5 * jn - hC = 12` -> `Nn(dA) = "rk"`
        - `nj = Np * WH - hC - xJ + hS = 31` -> `SD(nj) = "Pt"`
        - `TC = WH + jn - R8 + hS * sW = 66` -> `Nn(TC) = "mU"`
        - `Gn = sW + Np + hC - WH = 19` -> `Cw(Gn) = "U4"`
      - 结合当前页面主世界直接求值，又拿到这些 getter 的运行时形态:
        - `V5()[Cw(np)]` 的当前形态是缓存 getter: `function(){return hB;}`
        - `jj()[SD(W6)]` 的当前形态是缓存 getter: `function(){return ll9;}`
        - `zb()[Nn(dA)]` 的当前形态是缓存 getter: `function(){return AA9;}`
        - `zb()[Nn(TC)]` 的当前形态仍是未缓存 wrapper:
          `function(VU9, vm9, Qn9) { var AA9 = zT9(fj(fj(xw)), vm9, Qn9); zb()[qJ9] = function(){ return AA9; }; return AA9; }`
        - `zb()[Nn(nj)]` 的当前形态是缓存 getter: `function(){return AA9;}`
      - 同一轮主世界试读时，曾成功拿到一组返回值样本:
        - `V5()[Cw(np)]() -> "Symbol"`
        - `jj()[SD(W6)]() -> "iterator"`
        - `zb()[Nn(dA)]() -> "Array"`
        - `zb()[Nn(nj)]() -> "login"`
      - 但重复直接调用 getter 会再次落回 `Qj9`/初始化链，说明这组 getter 的状态与当前时序强相关，不能把一次试读值直接当作最终稳定语义；后续仍应以 `case ck` 命中时的暂停帧为准
      - 已把这一层静态提取固化进 `extract_ver_static.js`
        - 作用: 从保存下来的 bundle 中直接提取 `G29` 表、基础数值链、`case ck` 的索引和值名映射
        - 2026-03-31 对 `current_live_bundle_20260331f.js` 实跑:
          - `baseValues = {xw:1,c5:2,R8:3,WH:4,jn:5,xJ:7,sW:6,Np:9,hS:10,wn:0,gW:33,hC:8,I3:128}`
          - `caseCkIndexes = {np:14,W6:32,dA:12,nj:31,TC:66,Gn:19}`
          - `caseCkKeys = {np:"rU",W6:"DN",dA:"rk",nj:"Pt",TC:"mU",Gn:"U4"}`
        - 这说明 `Of(ck)` 的索引层已经可以纯静态自动化，下一步只剩把 `case ck` 里这些 key 对应的 getter/返回值链继续静态化
  - 排除项:
    - 不是当前 Akamai script URL 的 SHA256(base64)
    - 不是当前保存 bundle 文件 `current_live_bundle_20260331b.js` 的 SHA256(base64) (`3tpODgMar1IMH6V+Xy/8c3ZdVjE6htRj+ehUIz94sE8=`)
    - 在线源码中搜不到最终明文值，说明它不是明文内嵌，而是运行时解码出的 bundle 常量
  - 已落地:
    - `screen_node_xag_live.js -> buildVerLive()` 已取消旧硬编码，改为必须外部提供
    - `extract_ver.js` 新增：用于抓取当前 live 运行时 `ver`，避免继续手填过期值
    - 2026-03-31 实跑验证:
      - `node extract_ver.js --port 9222 --timeout 25000`
      - 成功抓到:
        - `ver = "yacvPNkHbOPdHJGCxibCUnXbqZM6JrA0AUpc39c5d0c="`
        - `ajt = "0,0"`
        - `ffl = "J3aE8rSc6GQSLfJO"`
        - `akamaiScriptUrl = "https://www.dhl.com/lUuI09H8kk2lCTn_ihnlZXLM/J3aE8rSc6GQSLfJO/ZHE1PQ/dlZdB/nwEPFIB"`
  - 后续可选:
    - 继续追 `bO()[Dl(I49)](dz, IF, vg)` 的字符串表来源，做成自动提取而不是更新当前值

- [ ] **`ajt`** — 硬编码 `"10,1"` 或 `"0,0"`
  - 2026-03-31 静态补充: `cKW = LPW + "," + v3W`，不是固定字面量
  - `LPW` 由多条交互/状态分支改写（如 `U1W/RzW/vpW/sW0` 等），`v3W` 在 `UAW()/fcW()` 通过后累加
  - 当前 no-interaction live 样本仍为 `"0,0"`
  - 仍需: 建立 `LPW` 数值 → 具体场景的完整映射

- [ ] **`inf`** — fallback 到 `ffs`
  - 2026-03-31 当前 no-interaction live 捕获: `inf === ffs`
  - live 实测 `inf` 在有 focus 事件时可能 ≠ `ffs`
  - 需要: 确认 `inf` 在无交互/有交互路径下的区别

- [x] **`ffl`** — 已确认并落地到还原脚本 (2026-03-31)
  - 2026-03-31 动态确认:
    - Akamai script URL: `https://www.dhl.com/lUuI09H8kk2lCTn_ihnlZXLM/J3aE8rSc6GQSLfJO/ZHE1PQ/dlZdB/nwEPFIB`
    - 实际 `ffl = "J3aE8rSc6GQSLfJO"`
    - 对应 URL 第 2 段（0-based segment[1]）
  - 2026-03-31 静态补充: `z3W` 初始为空串，随后在 live.js:8881 从活动脚本 URL / src 的 `split()` 结果中取段
  - 当前 bundle URL 证据:
    - GET script: `https://www.dhl.com/lUuI09H8kk2lCTn_ihnlZXLM/J3aE8rSc6GQSLfJO/ZHE1PQ/dlZdB/nwEPFIB`
    - POST sensor: `reqid=307` 同一路径
  - 已落地: `screen_node_xag_live.js -> buildFflLive()`

- [ ] **`sws`** — 透传，默认 0
  - 2026-03-31 静态补充:
    - payload 发出的是 `dDW ? 1 : 0`
    - `WCW()` 明确检测 `Navigator.prototype.serviceWorker`
      `ServiceWorker`, `ServiceWorkerContainer`, `frames.ServiceWorkerRegistration`
    - `M3W()` 中先将 `dDW = false`，异常路径保持 false；成功路径通过异步分支改写
  - 当前 no-interaction live 捕获: `sws = 0`
  - 仍需: 动态确认成功路径下 `dDW` 何时被置真，以及 `d5W/UbW` 输入来源

- [ ] **`pmte`** — 透传，默认 0
  - 实际是 `l5[kA]` 条件值，需确认 `l5[kA]` 含义

- [ ] **事件数据字段 (9个)** — 全部纯透传 `opts.xxx || ""`
  - `vev`(视觉), `kev`(键盘), `dme`(设备运动), `mev`(鼠标),
    `doe`(文档), `pev`(指针), `tev`(触摸), `oev`(其他), `if`(input focus), `pde`(指针详情)
  - 无交互时为空: ✅ 正确
  - 有交互时: **完全没有生成逻辑**
  - 需要: 还原 `vRW()` → `z7W()` 事件数据格式化管线

#### `buildMstLive()` 30 子字段审计

**有完整逻辑 ✅**

| 字段 | 说明 |
|------|------|
| `it` | 固定 0（当前路径） |
| `dd2` | `computeMstDd2Live()` = `parseInt(parseInt(sts/(2016*2016),10)/23,10)` |
| `ww8` | `computeMstWw8Live()` = 当前路径固定 0 |
| `tst` | `= tovl` |
| `nfas` | 固定 `30261689`（bundle 常量） |
| `jsrf` | 固定 `"PiZtE"` |

**有框架但输入来源未还原 ⚠️**

- [ ] **`kevl`/`mevl`/`tevl`** — 有 `| 1`/`| 32` 位运算，但输入值从 opts 透传
  - 实际事件位掩码的累加逻辑未还原
  - 需要: 追踪 live 中 `C2K`/`qPK`/`sDK` 的写入点

- [ ] **`devl`/`dmvl`/`pevl`/`tovl`** — 依赖 `buildMstEventStateLive()`
  - 该函数只是包装 opts，**没有从 `doe`/`dme` 字符串中解析第 2 字段的逻辑**
  - 需要: `devl = parseInt(doe.split(",")[1])` 等解析逻辑

- [ ] **`delt`** — 依赖 `mstEventState.delt`，从 opts 透传
  - 实际 = `Date.now() - bmak.startTs`，在调用时计算
  - 需要: 在生成器入口自动计算

- [ ] **`sts`** — `startTimestamp` 纯透传
  - **`UMN()/bRH()` startTs 变换逻辑未还原**
  - 需要: 完整还原 `Math.random` + `Math.floor` 算法

- [ ] **`fct`** — `fpState.td` 透传
  - = 指纹计算耗时 (ms)
  - 需要: 在 `getBrowserFingerprint()` 调用时测量 `Date.now()` 差值

- [ ] **`ssts`** — fallback `delt+1`，但 live 显示不等于 `delt+1`
  - 实际计算逻辑未确认
  - 需要: 运行时断点确认 `hsK` 的真实赋值

- [ ] **`rval`/`rcfp`** — 依赖 `fpState`，默认 `"-1"`
  - 来源未还原，可能与 canvas/webgl 指纹相关
  - 需要: 追踪 `fpState.rVal`/`fpState.rCFP` 的写入

**完全未还原 ❌**

- [ ] **`kc`/`mc`/`pc`/`tc`** — 事件计数器，纯透传默认 0
  - kc=键盘计数, mc=鼠标计数, pc=指针计数, tc=触摸计数
  - 无交互时 = 0: ✅ 正确
  - 有交互时: 计数逻辑未还原

- [ ] **`jsrf1`/`jsrf2`** — 纯透传 null
  - 脚本完整性值，**每次请求都不同**
  - live 样本: `60246/82`, `83573/41`, `30944/54`
  - 需要: 完整还原计算逻辑（可能是对 bundle 自身做 hash/checksum）

- [ ] **`signals`** — 透传默认 `"0"`
  - 信号位，含义和计算未还原

- [ ] **`mwd`** — 透传默认 `"0"`
  - 含义和计算未还原

- [ ] **`hea`** — 透传默认 `""`
  - 含义和计算未还原

- [ ] **`dvc`** — `computeMstDvcLive()` 只做 3 段拼接
  - `hash` = `SY(delt, ajr, fct, tovl)` → **核心 hash 算法完全未还原**
  - `delta` = `lkK() - AnK` (小时间差) → 透传
  - `plugins` = `"h+j+d+c+b+e+g+f+i+a+l+"` → 硬编码，插件枚举逻辑未还原
  - 需要: P0 优先还原 `SY()` 函数

- [ ] **`srd`** — 透传默认 `"0"`
  - 含义未知

- [ ] **`tid`** — 透传默认 `""`
  - 含义未知

### P1.5 — 数据组装（已有条目保留）

- [x] **`pIN()/BGH()` input 元素采集** ✅ → `screen_node_xag_live.js`
  - `buildFfsLive()` 遍历 `document.querySelectorAll("input")`
  - 过滤: 跳过 `id === "c-tracking--input"` 的元素
  - 每个 input 输出 7 字段 tuple: `typeCode,autocompleteCode,hasDefaultDelta,requiredFlag,xq(id),xq(name),hasValue;`

- [x] **`cb4()/qSH()` 剩余标志位 — 全部解明** ✅ → `screen_node_xag_live.js`
  - `pha`/`wdr`/`dau`/`tsd`/`ibr`/`xag` 全部还原

- [ ] **`w3N()/S7Y()/cmH()` sensor_data 头部生成**
  - 已知 header 格式: `"3;0;1;0;{timestamp_diff};{sha256};{counts}"`
  - 需要: 确认 version 和 flag 字段的来源
  - 需要: 确认 counts 字段 `"25,0,0,2,3,0"` 各元素含义

- [ ] **`UMN()/bRH()` startTs 变换**
  - 已知: 使用 `Math.random` + `Math.floor`，返回 `[number, number]`
  - 需要: 完整还原算法

### P2 — 事件与初始化（无用户交互时可跳过）

- [ ] **事件采集逻辑 (9 个事件字段)**
  - `vRW()` → `z7W()` 事件格式化管线
  - `wON()` 鼠标事件 → 无操作时 `"0,0,0,0"`
  - `gFN()` 键盘事件 → 无操作时 `"0,0,0,0"`
  - `PWN()` 触摸事件 → 无操作时 `",,,,,"`
  - 有交互时的数据格式需要深入分析
  - 关联 mst 字段: `kevl`/`mevl`/`tevl`/`devl`/`dmvl`/`pevl`/`kc`/`mc`/`pc`/`tc`

- [ ] **`firstLoad` 分支初始化**
  - `Wc4()`, `c44()`, `ljN()` 等首次加载额外执行的函数
  - 可能影响后续 sensor_data 的某些字段

---

### 攻克优先级总结

```
P0 — 无交互路径生成合法 sensor_data 必须:
  1. ver: 从 bundle 提取 (每版本变化)
  2. ffl: 从 bundle URL 提取 ✅
  3. dvc.hash (SY 函数): 核心校验码
  4. jsrf1/jsrf2: 脚本完整性 (每次请求变化)
  5. sts/startTs: bRH() 变换逻辑
  6. header 生成: S7Y()/cmH()
  7. dsi.ico: sha256 输入源
  8. ssts: 实际计算逻辑

P1 — 提高通过率:
  9. per: Permissions API 查询
  10. wsl[5-17]: 能力标志 + WebGL 参数
  11. sww.swrt/wrt: 运行时指标
  12. hls: 5 字段来源
  13. ajt: 生成逻辑
  14. rval/rcfp/signals/mwd/hea/srd/tid: 来源确认

P2 — 有交互时:
  15. 9 个事件字段生成逻辑
  16. mst 事件计数器 (kc/mc/pc/tc/kevl/mevl/tevl 等)
```

---

## YTW 变量映射表（live.js 6535-6676 行）

`YTW = Rx(TS, [...])` 构建 sensor_data 的核心 payload 对象。
以下是 live.js 中每个变量与 sensor data 字段的对应关系。

### 已还原字段

| 键名 | live.js 变量 | 赋值位置 | 含义 | 还原函数 |
|------|-------------|---------|------|---------|
| `ver` | `OWW` | 8202 | bundle 版本 hash 字符串 | 直接值 |
| `fpt` | `HDW[x7()[bl(AF)](...)]` | 6541 | 浏览器指纹字符串(14字段) | `fpValStr` |
| `fpc` | `bnW` | 6504 | `xq(fpValStr)` 校验和 | `buildFpcLive()` |
| `ajr` | `mfW` | 6516 | `sha256(UA)+sha256(startTs)` | `buildAjrLive()` |
| `din` | `d1W` = `MVW()` | 6515 | 浏览器指纹 23 字段数组 | `getBrowserFingerprint()` |
| `eem` | `D3W` | 6469 | `"do_en,dm_en,t_en"` 事件启用状态 | 字符串拼接 |
| `ffs` | `gQW` = `WwW()` | 6470 | 表单 input 指纹 | `buildFfsLive()` |
| `vev` | `O9W` | 8574/3922 | 视觉事件数据 | 事件收集(无交互=`""`) |
| `inf` | `p5W` | 8560 | input focus 数据 | 事件收集(无交互=`ffs`) |
| `ajt` | `cKW` | 6472 | AJAX timing `"10,1"` / `"0,0"` | 拼接 |
| `kev` | `fnW` = `cQW[...]` | 6490 | 键盘事件 | 事件收集(无交互=`""`) |
| `dme` | `dTW` | 8566/6797 | 设备运动事件 | 事件收集(无交互=`""`) |
| `mev` | `YZW` = `cQW[Bb]` | 6491 | 鼠标事件 | 事件收集(无交互=`""`) |
| `doe` | `UvW` | 8565/6794 | 文档事件 | 事件收集(无交互=`""`) |
| `pur` | `BBW` | 6471 | `location.href` | 直接值 |
| `pev` | `DkW` = `cQW[lL]` | 6493 | 指针事件 | 事件收集(无交互=`""`) |
| `mst` | `ElW` | 6519 | 遥测元数据(31子字段数组) | `buildMstLive()` |
| `o9` | `tBW` = `AH` (0) | 8579 | 固定 0 | 常量 |
| `tev` | `XKW` = `cQW[...]` | 6492 | 触摸事件 | 事件收集(无交互=`""`) |
| `sde` | `NBW` = `qAW()` | 6528 | `"0,0,0,0,1,0,0"` | `qAW()` |
| `hls` | `LAW` | 6807/7337 | `"-1,,,1,"` | 直接值 |
| `per` | `BAW` | 6531 | Permissions API 20 位查询 | `buildPerLive()` |
| `dsi` | `F5W` | 6532 | DOM/script 完整性 12 字段 | `buildDsiLive()` |
| `wsl` | `XQW` | 6533 | performance.memory 等 20 字段 | `buildWslLive()` |
| `pde` | `lVW` | 8556/6814 | 指针事件详情 | 事件收集(无交互=`""`) |
| `oev` | `VfW` = `cQW[WL]` | 6494 | 其他事件 | 事件收集(无交互=`""`) |
| `if` | `NnW` = `cQW[B7]` | 6495 | input focus 事件 | 事件收集(无交互=`""`) |
| `pus` | `J5W` = `AH` (0) | 8632 | push 状态 | 常量(0) |
| `ffl` | `z3W` | 8561 | URL 中脚本标识符 | 直接值 |
| `sww` | `UbW` | 6834/7177 | Client Hints 一致性检查 | `buildSwwLive()` |
| `te` | `DVW` = `AH` (0) | 8645 | touch end 计数 | 事件计数(0) |
| `nte` | `bVW` = `AH` (0) | 8646 | native touch end 计数 | 事件计数(0) |
| `mte` | `LvW` = `AH` (0) | 8648 | mouse/touch end 计数 | 事件计数(0) |
| `tcd` | `FMW(F7W)` = `FMW({})` | 8651 | touch coordinate data | 空对象 |
| `pnte` | `hEW` = `AH` (0) | 8647 | pointer native touch end | 事件计数(0) |
| `pte` | `bxW` = `AH` (0) | 8649 | pointer touch end | 事件计数(0) |
| `pmte` | `SHW` = `l5[kA]` | 8650 | pointer mouse touch end | 条件值 |
| `tab` | `XrW` = `AH` (0) | 8658 | tab 状态 | 常量(0) |
| `sws` | `dDW ? Bb : l5[kA]` | 6663 | service worker 状态 | 条件值 |
| `mis` | `V3W[zN()[b3(KMW)](...)]` | 6667 | cookie hash mis | `0` |
| `og` | `V3W[zN()[b3(P5)](...)]` | 6673 | cookie hash og | `"sm"` |

### 待动态确认

| 项目 | live.js 位置 | 说明 |
|------|-------------|------|
| 第 1 个键名 | `NZ()[dd(KMW)](Jt, W0W, K5)` (6536) | 应为 `"ver"`，需 eval 确认 |
| 第 601 行键名 | `cH(typeof Ch()[DZ(L5)], ...) ? ... : Ch()[DZ(rV)](nzW, xWW)` | 应为 `"hls"`，需 eval 确认 |
| `OWW` 值格式 | `NZ()[dd(kk)](...)[Hw()[Rp(FA)](...)](...)` (8202) | bundle 版本 hash，需确认格式 |

### 事件收集变量来源（cQW 系列）

```
LTW = vRW()                         // 事件数据快照
cQW = z7W(LTW, l5[pO])              // 分解为各事件类型
fnW  = cQW[HG[...]]  → kev (键盘)
YZW  = cQW[Bb]       → mev (鼠标)
XKW  = cQW[HG[...]]  → tev (触摸)
DkW  = cQW[lL]       → pev (指针)
VfW  = cQW[WL]       → oev (其他)
NnW  = cQW[B7]       → if  (input focus)
```

---

## 文件索引

| 文件 | 内容 |
|------|------|
| `screen_node.js` | fpValStr(14字段) + navigator位掩码(25属性) + qSH(23字段) 伪代码 |
| `progress_cBH_analysis.md` | 完整分析进度、变量映射表、运行时值 |
| `fp_node.js` | 指纹相关（仅供参考，不完整） |
| `qbb_node.js` | qbb 相关逻辑 |
| `rnb_reconstructed.js` | rnb 还原 |
| `get_telemetry.js` | 遥测采集 |
| `screen_node_xag_live.js` | **live bundle 还原**: xag 14-bit 位掩码、pha/wdr/dau/tsd/ibr 探针、adp 14 项检测、ajr 构造、ffs input 采集、din 23 字段指纹(含运行时顺序)、9013 payload 结构、czG 加密、H4G seed 解析、**AhN token shuffle (按 `:` 拆分)**、完整 encode 管线 |
| `extract_seed1.js` | **AST 自动提取 seeds[1]**: Babel 解析 bundle → 自动破解数字替换密码 → 提取 bundle 内嵌常量。用法: `node extract_seed1.js <bundle.js>` |
| `extract_ver_static.js` | **ver 静态中间提取器**: 从保存的 bundle 提取 `G29`、基础数值链、`Of/W09 case ck` 索引、`V5/jj/zb` getter 注册模板、`px.call(...)` 注册入口。当前实现优先使用固定锚点 `indexOf` 切片，避免大段正则。 |
| `bmak_dump.json` | bmak 对象运行时快照 |
| `sensor_callstack.json` | POST 发送时的调用栈 |

---

## 建议攻克顺序

```
1. AhN 字符置换 ← ✅ 已完成
2. seeds[1] 提取 ← ✅ 已完成 (AST 自动提取, extract_seed1.js)
   ↓
3. dvc/SY 校验码  ← canvas/webgl 指纹哈希 + 插件枚举
   ↓
4. dsi/wsl/sww 新字段  ← payload 完整性
   ↓
5. 头部生成 + counts 字段  ← 拼接最终字符串
   ↓
6. UMN startTs 变换  ← 正确填充数据
   ↓
7. jsrf1/jsrf2 脚本完整性  ← 理解计算逻辑
   ↓
8. 本地生成器实现  ← 用 Node.js 实现完整 sensor_data 构造
```
