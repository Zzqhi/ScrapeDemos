# 顶象滑块 sidecar 差分分析报告

## 1. 实验设计

通过 `inject_before_load` 在 greenseer 加载前 hook `_dx.UA.init`, 在每个 UA 实例的 prototype 上包装 `process()` 和 `app()`, 完整捕获:
- **process(...)** 输出: 加密前的 plain 字节
- **app(type, encrypted)** 输入: 加密后的 encrypted 字节

由用户手动滑动一次, 服务端返回 `success: true` token. 然后用 sidecar 输入相同的 plain, 比对加密输出.

## 2. 关键发现

### 2.1 greenseer.js 多次轮换混淆种子 ⚠️
```
昨天 10:00:02  79557aa0... (7-arg IIFE)
昨天 19:00:01  e1efb193... (2-arg IIFE) ← 完全不同 obfuscator
今天                 进一步轮换, version 5658 → 5659
```
sidecar 用昨天缓存的 greenseer → **服务端用最新 greenseer 解密 → 字节不匹配 → `error`**.

**修复**: `gen_ua.js` 30min TTL 自动拉新.

### 2.2 `tm` 锚定时机不对 ⚠️
真实流程中, greenseer 在**页面加载时**就 init 并设置 `inst.tm`. 用户从打开页面到滑动通常隔了 ~80 秒.
所以 SA 段里的 `bs4(elapsed)` 真实值 ≈ **80000 ms**, 而不是几百 ms.

抓到的真实第一个 SA: 
- plain `00013c61003f010f`, elapsed = 0x00013c61 = **80993 ms**
- 不是几百毫秒!

**修复**: sidecar 加 `preInitMs` 参数, 让 init 时间 = startTime - 80s.

### 2.3 加密字节 9/9 完美匹配 ✅
喂入相同 plain, sidecar 与真实环境产生**完全一致**的加密字节:

| # | real plain | real encrypted | sidecar encrypted | match |
|---|-----------|----------------|-------------------|-------|
| 0 | `00013c61003f010f` | `39794891390879fc` | `39794891390879fc` | ✓ |
| 1 | `00013c83004101 0f` | `39794819398979fc` | `39794819398979fc` | ✓ |
| 2 | `00013c960047010f` | `397948de390a79fc` | `397948de390a79fc` | ✓ |
| ... | ... | ... | ... | ✓ |
| 8 | `00013d0c005a010f` | `3979883c39cf79fc` | `3979883c39cf79fc` | ✓ |

**结论**: 加密算法 + jsdom 环境 + greenseer 版本三者对齐时, sidecar 字节级正确.

### 2.4 真实 UA 段结构 (今天成功的 trace)

```
dt=0     app(7, 10B)  hover MM (no target)
dt=1198  getDI → app(9, 11B) + app(4, 1B)  
                ↑ getDI 内部生成 TWO 段 (类型 9 + 类型 4)
dt=1469  app(7, 45B)  drag MM (target = "dx_captcha_basic_slider-img-focus_1")
dt=3168  sendSA → app(17, 8B) × 60   ← 60 个 SA
dt=3198  sendTemp → app(13, ~600B)   ← xpath + x + y + isTrusted + 大段 HTML fragment
dt=3200  syncToForm
dt=3201-3211  post-verify reload (TM,BR,LO,CF,DI,EM,JSV,TK,SC 重新生成)
dt=3311  app(7, 10B)  release MM
```

### 2.5 sendTemp 的 plain 内容(关键!)

```
01 48 7b 22 7469746c65 22 3a 22 4458 25 32 30 736c69646572 25 32 30 74657374 ...
```

URL-decoded:
```json
{"title":"DX%20slider%20test","bodyLength":49586,"headLength":100317,
 "xpath":"/html/body/div","x":154,"y":49,"isTrusted":true,
 "fragment":"%0A%3Ch3%3EDingXiang%20slider%20test%3C%2Fh3%3E%0A%3Cdiv%20id%3D%22captcha%22%20class%3D%22dx_captcha%20dx_captcha_loading-style-embed%20dx_captcha_basic%20dx_captcha-type-basic%20dx_capt..."}
```

包含:
- `bodyLength: 49586` — `document.body.innerHTML.length`
- `headLength: 100317` — `document.head.innerHTML.length`  
- `xpath: "/html/body/div"` — 验证元素的 xpath
- `x: 154, y: 49` — 滑块最终位置(必须和 verify_x/y 一致)
- `isTrusted: true` — 真实事件标志
- `fragment` — body HTML 前 N KB 的 URL-encoded 截取

**这部分 sidecar 完全没复刻**, 服务端解出 sendTemp 段 → 看到 bodyLength=100/简单 title → **判定异常 → error**.

## 3. 还需修复

| 问题 | 修复方案 |
|------|---------|
| **sendTemp 内容不匹配** | sidecar 需要传完整 `{xpath, x, y, isTrusted, fragment, bodyLength, headLength}` |
| **段顺序: hover MM → getDI → drag MM → SA → sendTemp** | build_drag_events 按这个顺序生成 |
| **MD 完全不该调** | 真实流程**没有 MD 段**, 只有 MM. 删 md event |
| **post-verify reload** | 真实在 syncToForm 后调用 inst.reload() 再次跑 init. 不确定服务端是否检查这部分 |
| **release MM (dt=3311)** | 用户松手后, 真实多打了一个 final MM |
| **getDI 生成的双段** | 新版 getDI 不止 type=2, 还会生成 type=9 + type=4. 待跟进 |

## 4. 当前状态总结

| 阶段 | 状态 |
|------|------|
| 加密协议外壳 (customBtoa, 段头) | ✅ 完整 |
| greenseer 自动同步 | ✅ 30min TTL |
| 加密字节级正确性 | ✅ 9/9 匹配 (差分对照通过) |
| `tm` 锚定 | ✅ 已修, preInitMs ≈ 80s |
| 段结构(顺序/数量) | ⚠️ 部分对齐, sendTemp 内容不全 |
| /api/v1 通过 | ❌ 仍 `error` (因 sendTemp 内容差) |
| **Playwright 路线** | ✅ 已突破到 `retry`, 卡 ddddocr 精度 |

## 5. 推荐路径

**短期** (得到 token):
- Playwright + 优化 ddddocr (offset/template-match)
- 不依赖 sidecar 模拟

**长期** (纯 Python 解决方案):
- sidecar 补全 sendTemp 的 xpath/fragment/HTML 字段
- 模拟出真实 body HTML 长度 ~50KB
- 最终目标: pure-Python 不依赖浏览器
