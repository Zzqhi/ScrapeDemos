# 顶象(DingXiang)滑块验证码逆向 - 进度记录

## 目标
让 Python 脚本独立完成顶象滑块验证, 通过 `/api/v1` 拿到 success token.

## 当前状态: 加密算法已逆向完成, 但**内部 state 无法在 jsdom 中复刻**, /api/v1 仍返回 `error`.

---

## 已完成的工作

### 1. 协议外壳逆向 ✅
- **`customBtoa` base64 表**: `XmYj3u1PnvisIZUF8ThR/a6DfO+kW4JHrCELycAzSxleoQp02MtwV9Nd57qGgbKB=`
- **段头格式**: `[type:1B, len_hi:1B, len_lo:1B, payload:NB]`
- **UA 字符串格式**: `<version>#<customBtoa(_ua)>` — 当前 version = `5658`

### 2. 段类型代号映射(新版与旧版完全不同)

| 方法 | 新 type | 旧 type |
|------|---------|---------|
| getTM | 12 | 4 |
| getBR | 5 | 13 |
| getSC | 3 | 17 |
| getLO | 4 | 6 |
| getCF | 1 | 5 |
| getDI | 2 | 7 |
| getEM | 8 | 10 |
| getJSV | 11 | 18 |
| getTK | 14 | 9 |
| sendTemp | 9 | 12 |
| getMM | 7 | 11 |
| getMD | 6 | 15 |
| getKD | 16 | 1 |
| getFO | 15 | 14 |
| getTC | 18 | 2 |
| getTMV | 10 | 8 |
| recordSA | 17 | 3 |
| recordCA | 13 | 16 |

### 3. 加密算法(差分采样确认)

| 段 | 算法 |
|----|------|
| **TM (12)** | XOR 周期 key `[0x7b, 0xb7]` |
| **LO (4)** | XOR 常量 0xd1 |
| **EM (8)** | XOR cycle key `[0x4a, 0x35, 0x37, 0x4a]` |
| **JSV (11)** | XOR 常量 0x49 |
| **TK (14)** | `mask[i] = (0x44 + 2*i) & 0xff` 线性 |
| **TEMP (9)** | roll-shift L=2, R=5, seed=367 |
| **SC (3)** | 字节级匹配(算法对) |
| **MM (7)** | chain XOR with plain evolution, init=0xdd |
| **SA (17)** | xy 字节匹配, elapsed mask 依赖未知内部 state |

### 4. /api/v1 提交参数(已修)
- `version` 5563 → **5658**
- `jsv` `5.1.53` → **`1.5.46.2`**
- 移除了多余的 `w`/`h` 字段

### 5. Node sidecar 架构 (`scripts/gen_ua.js`)
- jsdom 加载真实线上 `greenseer_live.js`
- polyfill: navigator(UA/platform/lang), screen, window dims
- 等待 `setImmediate` 让 greenseer 异步 start() 完成(getSC 在异步分支里)
- 暴露事件 API: `mm/md/sa/sendSA/temp/raw_app` 等

### 6. 浏览器侧综合插桩
- 通过 `_ua` 字符串的 `Object.defineProperty` setter 监听**任意路径**的字节写入
- prototype + 实例 own property 双重 patch
- 抓到完整 78 个 `recordSA(args)` 输入 + 所有 `app(type, encrypted_payload)` 输出
- 真实成功 verify_body 已捕获并解码成 76 个段

### 7. 真实滑动事件流(已捕获)

```
dt=0     app(7, ...)  → hover MM (10字节加密)
dt=1076  app(7, ...)  → drag-start MM (10字节)
dt=1143  app(6, ...)  → MD (11字节)
dt=1144  getDI → app(2, c7) → DI (1字节)
dt=1213-5164  recordSA × 78 (累积到 _sa)
dt=2278  app(7, ...) → 中途 MM (45字节, 含 target id)
dt=6232  sendSA → 78×app(17) → 一次性 flush 78 个 SA 段
dt=6232+ sendTemp → app(9, ...) → TEMP 段(347B, 含 body HTML)
dt=6233  syncToForm → 写入 form
```

---

## 卡住的根因

**SA 段加密 mask 字节 0-3 在 sidecar 与真实之间常量偏差 3-5**.

byte 4-7(pageX/pageY)已字节级匹配, 证明:
1. 加密算法本身正确
2. 输入数据(elapsed/x/y)正确
3. 但 `encrypt_sa` 的内部 state 起点不同

试过下列对齐方法都失败:
- ✗ `preInitMs=0` 让 tm 锚定 startTime
- ✗ `raw_app` 重放 4 个 pre-SA 段(MM/MM/MD/DI)
- ✗ 调真正的 getMM/getMD/getDI 触发 process() 推进状态
- ✗ 上述组合

state 偏差稳定 = greenseer 内部维护着一个**闭包/全局变量**, 它在浏览器里走过了 jsdom 复刻不出的探测路径(可能是 constid-js 收集时的字段、`Function.prototype.toString` 在 V8 下的特定输出、performance API 行为差异等).

---

## 下一步: Playwright 路线

继续在 jsdom 里对齐 state 的成本/收益比不划算. 推荐:
1. Playwright 启动 Chromium → 加载顶象 captcha-ui
2. ddddocr 计算 target_x
3. `page.mouse.move/down/up` 模拟人类滑动(带抖动+overshoot)
4. 让真正的 greenseer 在真正的 V8 里跑(state 自然对齐)
5. 通过 `page.on('response')` 抓 `/api/v1` 拿 token

---

## 关键产物

- `captcha_solver.py` — Python 主流程(/api/a + ddddocr + sidecar UA + /api/v1)
- `captcha_fetcher.py` — /api/a 请求 + 背景图还原
- `ua_simulator.py` — 旧版 greenseer 的 Python 翻译(已废弃, 留档)
- `simulate_constid_c1.js` — constid /udid/c1 模拟器(40 字节 token)
- `scripts/gen_ua.js` — jsdom + greenseer sidecar
- `scripts/greenseer_live.js` — 当前线上 greenseer.js (74KB) 的副本
- `scripts/ua_simulator.js` — 旧版 ua simulator JS 实现(留档对比)
