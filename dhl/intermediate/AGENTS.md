# DHL Akamai 逆向 — Agent 上下文指南

本文档为 Codex / Claude Code agent 提供项目上下文，使其能在无人工引导下接手分析任务。

---

## 1. 项目概况

**目标**: 完整还原 DHL 页面 Akamai Bot Manager 的 `sensor_data` 生成逻辑，实现纯 Node.js 构造合法 sensor_data。

**当前进度**: 加密管线（czG + AhN + header）已完成，payload 结构已解明，约 60% 字段有完整生成逻辑，剩余字段需要逐个追踪。详见 `TODO.md` 中的 P0/P1/P2 优先级列表。

---

## 2. 文件结构与角色

```
dhl/
├── live.js              ← 核心：Akamai bundle 的 prettified 副本，用户已手工重命名部分变量
├── test.js              ← 早期 bundle 版本（变量名不同），用于交叉参考
├── main.js              ← Node.js 入口，实现 HTTP 请求链
├── intermediate/
│   ├── TODO.md           ← 总进度追踪，包含 YTW 变量映射表和还原审计
│   ├── screen_node_xag_live.js  ← 主还原脚本（可运行），包含所有已还原的生成函数
│   ├── extract_seed1.js  ← AST 自动提取 bundle 内嵌常量 seeds[1]
│   ├── screen_node.js    ← fpValStr 14字段 + navigator 位掩码 + qSH 23字段
│   ├── progress_cBH_analysis.md ← 早期分析笔记，变量映射表
│   ├── bmak_dump.json    ← bmak 全局对象运行时快照
│   ├── sensor_callstack.json ← POST 调用栈
│   └── functions/        ← 线上代码片段（按函数拆分）
│       ├── ZwF_gen_sensor.js    ← sensor_data 生成主函数
│       ├── mUF_build_request.js ← 请求构建
│       ├── Hm_dispatcher.js     ← dispatcher/case 分发表
│       └── ...
```

### 关键文件说明

**`live.js`** — 这是分析的主要对象。它是从浏览器拿到的 Akamai bundle，经过 prettier 格式化后，用户手工将部分混淆变量替换为有意义的名称（如字符串键 `'fpt'`, `'fpc'` 等）。**但大部分变量名仍然是混淆的**（如 `OWW`, `bnW`, `mfW`, `ElW` 等）。这些混淆变量名是用户自己起的，**与线上 minified 代码中的变量名完全不同**。

**`screen_node_xag_live.js`** — 已还原的生成逻辑。每个 `xxxLive()` 函数对应一个 sensor_data 字段。可以直接在 Node.js 中运行。`TODO.md` 的审计部分标注了哪些函数是完整的 ✅、哪些有硬编码 ⚠️、哪些是纯透传 ❌。

**`TODO.md`** — **必读**。包含：
- 已完成 / 未完成任务清单
- `YTW 变量映射表`：live.js 变量名 ↔ sensor data 字段名 ↔ 赋值行号 ↔ 含义
- `还原脚本审计`：每个字段的完成度标注
- `攻克优先级`：P0（必须）→ P1（提高通过率）→ P2（有交互时）

---

## 3. 核心概念

### sensor_data 生成流程

```
1. 采集浏览器指纹/事件数据 → payload 对象 (YTW/hn5)
2. JSON.stringify(payload)
3. ahnPermute(json, seeds[1])    ← 按 ":" 拆分 token 后 Fisher-Yates shuffle
4. czG_live(permuted, seeds[0])  ← 多表替换加密 (LCG)
5. header + ";" + timing + ";" + encrypted  ← 最终拼接
```

### 密钥来源

- `seeds[0]` = `bm_sz` cookie 的 `~` 分隔第 3 段，`parseInt` 取整 → 用于 czG 加密
- `seeds[1]` = bundle 内嵌常量，通过 AI 对象编码键名获取 → 用于 AhN shuffle
  - 可用 `extract_seed1.js` 自动从 bundle AST 提取

### YTW 对象（live.js 6535-6676 行）

这是 sensor_data payload 的核心。`YTW = Rx(TS, [...])` 将一个 key-value 交替的数组构建为对象。live.js 中用户已将大部分键名替换为明文字符串（如 `'fpt'`, `'ajr'`），但**值仍然是混淆的变量引用**。

---

## 4. 逆向方法论

### 4.1 静态分析（适合 Codex）

**适用场景**: 变量赋值链简单、可以通过读代码追踪的字段。

**方法**:
1. 在 `TODO.md` 的 YTW 映射表中找到目标变量名和行号
2. 在 `live.js` 中找到该变量的赋值位置（`grep "变量名\s*=" live.js`）
3. 追踪赋值表达式中引用的其他变量/函数
4. 识别模式：
   - `NZ()[dd(xxx)](a, b, c)` — 这类是 dispatcher 调用，解析字符串常量
   - `Hw()[Rp(FA)](a, b, c, d)` — 另一种 dispatcher 模式
   - `Rx(TS, [...])` — 数组转对象（key1, val1, key2, val2...）
   - `hj(a, b)` / `RJ(a, b)` — 字符串拼接
   - `Um(x)` / `sG(x)` — 身份包装（返回 x 本身）

**注意事项**:
- live.js 中的变量名（如 `OWW`, `ElW`）是用户自己取的，仅在 live.js 内部有效
- 线上 minified 代码使用完全不同的变量名（如 `hn5`, `R15`）
- 不要假设 live.js 变量名有语义含义，它们只是去混淆过程中的临时命名

### 4.2 动态分析（需要 js-reverse MCP）

**适用场景**: dispatcher 调用层层嵌套、无法通过读代码确定最终值的表达式。

**可用工具**: `js-reverse` MCP 提供 CDP 调试能力：
- `new_page` / `navigate_page` — 打开/导航页面
- `search_in_sources` — 在线上源码中搜索（**必须设 `excludeMinified: false`**）
- `get_script_source` — 读取源码片段（用 `offset`/`length`，因为是单行 minified）
- `set_breakpoint_on_text` — 在代码文本处设断点
- `evaluate_script` — 在断点暂停时 eval 表达式
- `get_paused_info` — 查看调用栈和作用域变量

**关键经验**:
1. 线上 Akamai 脚本 URL 形如 `https://www.dhl.com/lUuI09H8kk2lCTn_ihnlZXLM/.../nwEPFIB`，用 `urlFilter: "lUuI09H8"` 过滤
2. 断点要设在**赋值完成后**，否则变量还是空的
3. live.js 的函数名和线上 minified 函数名的映射关系：
   - live.js `YTW = Rx(TS, [...])` 对应线上 `hn5 = QB(kO, [...])`
   - 可通过搜索特征字符串（如固定的键名 `"pnte"`, `"pmte"` 等）来定位，但这些字符串在线上可能是动态构建的
   - 更可靠的方法：搜索函数名（如 `Uh5`, `Zc5`）或赋值模式（如 `hn5=QB`）
4. 线上代码有多个函数都包含 `hn5` 变量（`Uh5` 是主函数，`Zc5` 是错误回退），注意区分
5. Akamai 有挑战页面（倒计时），reload 后需要等几秒才能通过

### 4.3 变量名映射（live.js ↔ 线上 minified）

已确认的映射（2026-03-31 会话）：

| live.js | 线上 minified | 说明 |
|---------|--------------|------|
| `YTW` | `hn5` | payload 对象 |
| `Rx(TS, [...])` | `QB(kO, [...])` | 数组转对象 wrapper |
| `Uh5` (线上) | — | 主 sensor 生成函数（包含 `var hn5={}` at offset ~229457） |
| `Zc5` (线上) | — | 错误回退路径（也有 `hn5`，offset ~225364） |

> 注意：每次 bundle 更新，所有变量名都会重新混淆。以上映射仅对 2026-03-31 的 bundle 版本有效。

---

## 5. Codex 可直接接手的任务

### 5.1 静态分析任务（读 live.js 代码即可）

以下任务可以通过阅读 `live.js` 追踪变量赋值链来完成：

- **`ver` 字段提取**: 追踪 `OWW` (live.js:8202) 的赋值表达式，确认 bundle 版本 hash 的来源
- **`ajt` 生成逻辑**: 追踪 `cKW` (live.js:6472) 的赋值
- **`ffl` 提取**: 追踪 `z3W` (live.js:8561) 的赋值，确认如何从 URL 中截取
- **`hls` 字段**: 追踪 `LAW` (live.js:6807/7337/7341) 的多次赋值，确认 5 个子字段含义
- **`sws` / `pmte`**: 追踪 `dDW` 和 `l5[kA]` 的含义

### 5.2 需要运行时分析的任务（需 js-reverse MCP）

- **`dvc.hash` (SY 函数)**: 核心校验码，4 个输入参数的 hash 算法
- **`jsrf1`/`jsrf2`**: 脚本完整性值，每次请求变化
- **`dsi.ico`**: sha256 输入源追踪
- **`sts` / `bRH()`**: startTs 变换逻辑
- **`ssts`**: 实际计算逻辑确认
- **`per`**: 20 个 Permissions API 权限名列表
- **`wsl[5-17]`**: 能力标志位 + WebGL 参数探测逻辑

### 5.3 验证任务

- 用 `js-reverse` MCP 在断点处 eval `NZ()[dd(KMW)](Jt, W0W, K5)` 确认第一个键名是否为 `"ver"`
- 用 `js-reverse` MCP eval live.js:6601 的表达式确认该键名是否为 `"hls"`

---

## 6. 输出规范

分析结果应该落地到以下位置：

1. **生成逻辑** → 在 `screen_node_xag_live.js` 中新增/修改对应的 `xxxLive()` 函数
2. **进度更新** → 更新 `TODO.md` 中对应条目的状态（`[ ]` → `[x]`），附上发现日期
3. **变量映射** → 更新 `TODO.md` 的 `YTW 变量映射表`
4. **运行时观测值** → 以注释形式写入 `screen_node_xag_live.js` 对应函数上方

避免：
- 不要修改 `live.js`（它是手工标注的参考副本）
- 不要创建新的分析文件，优先追加到现有文件
- 不要猜测值，标注 `// TBD` 并说明需要什么手段确认
