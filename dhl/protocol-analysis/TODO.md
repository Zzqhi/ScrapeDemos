# DHL / Akamai sensor_data Protocol Analysis — Progress & TODO

> Goal: long-term batch DHL tracking that gets server-issued **`_abck` with status segment = 0** (valid auth) — not the trivial `-1` rejection.

---

## Architecture (finalized)

```
production runtime
─────────────────────────────────────────────────────────────────
[curl_cffi GET tracking.html]   → bm_sz, bundle URL
[curl_cffi GET <bundle URL>]    → fresh bundle text
[bundle_consts.extractBundleConsts(src)]
        → { sOh1, defaultSeed, plVmBase64 }
[warm-up runner (1× per bundle rotation)]
        → header[5] (VkI bundle version)
[fQI builder]
        → { ver, fpt, fpc, ajr, din, eem, ffs, ... 50+ fields }
[pure_crypto.assembleSensorData(fQI, [bm_sz_seed, sOh1], opts)]
        → 3-segment string: header;csv;encoded_body
[curl_cffi POST same bundle URL]
        → server Set-Cookie: _abck (status segment = 0 if accepted)
[curl_cffi <real DHL API> with _abck]
        → tracking result
```

---

## Status by stage

### S1 — Pure-Node encryption ✅ 完成

| 函数 | 来源 (deobf) | pure_crypto.js |
|---|---|---|
| Vigenère 92-字母表 | `OC` @350 | `oc()` / `ocInverse()` |
| LCG 冒号洗牌 | `x9 case 28` @8085 | `shuffleColon()` / `shuffleColonInverse()` |
| SHA-256 + UTF-8→latin1 | `p4` @393, `V0` | `sha256Bytes()`, `utf8ToLatin1()` |
| Header 拼接 | `GpI/vAI` @5129/5142 | `headerAutopost()`, `headerInline()` |
| 总装配 | @4934-4948 | `assembleSensorData()` |

LCG 常数（Akamai 通用）：`k' = ((k * 65793) + 4282663) & 0x7FFFFF`

**Verifier 状态**：`golden_samples.json` 里 2 个真实浏览器样本，`verify_crypto.js` 解密 → JSON 100% 命中（39 / 50 字段）。

### S2 — Browser capture hook ✅ 完成

`golden_samples.json` 已包含 2 条 `(url, body, body_len, bm_sz, _abck, headers_cookie)` 三元组。**注意**：当前两个 sample 都是 **status=-1 路径** —— Linux VM 环境被 Akamai 标记为 bot。需要从 Win Chrome 抓一份 status=0 路径的 golden。

### S3 — fQI builder 🟡 部分

- **解密**：通了（fixtures/fQI-sample-{1,2}.json 共 50 字段全字段可读）
- **字段血缘表**：完成（见 deobf line 4879）
- **bot tag 识别**：完成 4 个红色字段 (`dsi[].wev/wre`、`mst.dvc`、`sws.gpu*`、`din.ucs`)
- **builder 实现**：未做（卡在 Pl VM）

### S4 — Closed-loop submitter ⏸ 未开始

- bm_sz fetcher：`probe_flow.py` 雏形可改
- Pl VM 节选 + 字节码抓取：未做（最重的一块）
- submitter glue：未做

### Bundle constants extractor ✅ 完成

- `bundle_consts.js`：
  - 静态：`sOh1` via cipher decode（fresh→1557329, old→5133921 已验证）
  - 静态：`defaultSeed` 8888888（Akamai 通用）
  - 运行时：`bundleVersion` (VkI) 必须从一个 sample header[5] 反取
  - 未做：Pl VM bytecode 提取

---

## 当前阻塞与下一步

| 阻塞 | 影响 | 解法 |
|---|---|---|
| 🔴 缺 status=0 的 golden body | 无法量化 fQI 各字段差异 | **Win Chrome 直接打开 DHL，复制一条 POST body** |
| 🔴 Pl VM 没移植 | `mst.dvc / sws.gpu / dsi.ico` 这些字段无法纯算复现 | 节选 deobf 里 `class Pl` 成独立 module |
| 🟡 `bundleVersion` 仍需 warm-up | 每次 bundle 轮换需热身 1 次 | 链路 OK，工程问题 |
| 🟡 fQI builder 框架 | S3 的最后一英里 | 等 golden body 后量化字段差，再写 |

---

## 仓库导航

```
protocol-analysis/
├── addon/
│   └── dhl_akamai.py            ← mitmproxy addon（v2 body-swap）
├── bundle/
│   ├── akamai-local.js          ← fresh 原版（mitm 实际服务的）
│   ├── akamai-deobf.js          ← 反混淆版（用户最新更新）
│   ├── bundle-{ts}.js           ← 抓取时间戳的历史快照
│   └── beautified/              ← 美化版用于 line-number 引用
├── fixtures/
│   ├── fQI-sample-1.json        ← 解密的真实环境对象 (39 字段)
│   └── fQI-sample-2.json        ← (50 字段)
├── pure_crypto.js               ← S1 — 加密原语
├── verify_crypto.js             ← 喂 golden_samples 反向校验 pure_crypto
├── bundle_consts.js             ← 从原版 bundle 提常量
├── probe_flow.py                ← curl_cffi 5 步链路探测
├── golden_samples.json          ← 浏览器抓的真实 (body, cookies) 样本
├── mitm-ca.cer / .pem           ← mitmproxy CA 证书（宿主机装时用）
└── TODO.md                      ← 本文件
```

---

## 重启 / 复现

```bash
cd protocol-analysis

# 1) mitm + curl_cffi 上游
mitmdump --listen-host 0.0.0.0 --listen-port 8080 -s addon/dhl_akamai.py

# 2) Chrome 走代理 + 加载 fresh local bundle (body-swap)
google-chrome-stable \
  --user-data-dir=/tmp/dhl-gcs \
  --proxy-server=http://127.0.0.1:8080 \
  --user-agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36" \
  --disable-blink-features=AutomationControlled \
  https://www.dhl.com/cn-zh/home/tracking.html?submit=1\&tracking-id=1232343

# 3) 验证加密（自带 self-test）
node pure_crypto.js
SOH1=1557329 node verify_crypto.js   # 用 fresh bundle 当下的 sOh1

# 4) 提取常量（任何 bundle 文件）
node bundle_consts.js bundle/akamai-local.js
```

---

## How to capture a `status=0` golden body (for S3 unblocking)

1. 在你的 **Windows 宿主机**，普通 Chrome（不走任何代理、不装任何东西）。
2. 打开 `https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tracking-id=1232343`。
3. F12 → Network → 找到第一条 POST 到 `https://www.dhl.com/-LUt0/...` 的请求。
4. 复制 **Request Body**（应该形如 `{"sensor_data": "3;0;1;0;<seed>;<ver>;<csv>;<encoded>"}`）。
5. 同时 Application → Cookies → www.dhl.com，导出整张 cookie 表（特别是 `bm_sz`、`_abck`）。
6. 把这两份贴到 `golden_samples_win.json`（schema 同 `golden_samples.json` 即可），跑 `node verify_crypto.js`。
7. diff Win 的 fQI vs Linux VM 的 fQI → 锁定真正触发 status=-1 的字段。
