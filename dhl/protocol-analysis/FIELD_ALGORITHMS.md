# DHL Akamai sensor_data 逐字段生成算法

分析对象：`akamai-current-deob.js`，对应 2026-07-24 捕获的 bundle。

## 1. 分层结构

`sensor_data` 不是每个字段分别加密。实际分为三层：

1. 浏览器 API 和事件生成明文字段。
2. 个别字段内部执行校验和、SHA-256、DJB2-XOR、位图或随机可判别编码。
3. 完整明文对象统一执行：

```text
JSON.stringify(payload)
  -> PGF_24(json, key1)       // 按冒号切段后执行 LCG 交换
  -> p6(shuffled, key0)       // 92 字符表 LCG 偏移
  -> header + timing + encrypted
```

外层参数：

- `key0 = parseInt(decodeURIComponent(bm_sz).split("~")[2], 10)`。
- `key0` 无效时使用 `8888888`。
- 当前 bundle 的 `key1 = 7863636`。
- LCG：`state = (state * 65793 + 4282663) & 0x7fffff`。
- 当前版本串：`/tkt9rmftdIoAoyZGsV9vW+fnEPt4PDXWQBoi0ippAA=`。

证据：`Q7` 位于 695 行，明文对象和两层变换位于 5082-5235 行，LCG 实现位于 239-280、12116-12146 行。

## 2. 顶层字段总表

| 字段 | 输出类型 | 字段内部算法 | 动态依赖 |
|---|---|---|---|
| `ver` | string | bundle 固定版本串 | bundle 轮换 |
| `fpt` | string | 14 项基础能力以 `;` 拼接 | DOM/BOM 环境 |
| `fpc` | string | `fpt` 中 ASCII 字符码求和 | `fpt` |
| `ajr` | string | `SHA256(String(totVel)) + "|" + totVel` | 行为速度、随机回退 |
| `din` | object[] | 23 个设备项，经 VM 函数 `HJ` 重排 | 环境种子 `N2t` |
| `eem` | string | 三个事件构造器存在性拼接 | Device/Touch API |
| `ffs` | string | 当前 input 表单结构记录 | DOM 表单 |
| `vev` | string | visibility/focus 事件记录 | 时间、事件 |
| `inf` | string | 初始化时的 input 表单结构 | DOM 表单 |
| `ajt` | string | `发送原因,发送次数` | 发送状态 |
| `kev` | string | 键盘事件记录 | 键盘行为 |
| `dme` | string | DeviceMotion 事件记录 | 运动传感器 |
| `mev` | string | 鼠标事件记录 | 鼠标行为 |
| `doe` | string | DeviceOrientation 事件记录 | 方向传感器 |
| `pur` | string | URL 删除 `\` 和 `"` | 页面 URL |
| `pev` | string | 非 mouse PointerEvent 记录 | 指针行为 |
| `mst` | object[] | 事件校验和、时间、随机、位图等指标 | 多来源 |
| `o9` | number | 当前版本恒为 `0` | 无 |
| `tev` | string | 触摸事件记录 | 触摸行为 |
| `sde` | string | 7 个 Selenium/WebDriver 标志拼接 | 自动化环境 |
| `per` | string | 9 类 Permission 状态编码 | 异步权限查询 |
| `dsi` | object[] | iframe/top 环境对照和 SHA-256 | iframe/WebGL |
| `wsl` | string | 20 段 runtime/插件/内存检测 | 多来源 |
| `hls` | string | 5 段 Chrome runtime/Private Token 检测 | Chrome API |
| `pde` | string | navigator 自有 descriptor 名称拼接 | navigator |
| `oev` | string | wheel/focus/input 等事件记录 | 表单行为 |
| `if` | string | input 值的长度与字符类别统计 | 表单内容元数据 |
| `pus` | number | `_setPowState` 调用计数 | PoW 状态 |
| `ffl` | string | 当前脚本 URL 倒数第 4 段 | bundle URL |
| `sww` | object | Window/SharedWorker 双环境对照 | 异步 Worker |
| `te` | number | trusted 事件数 | `isTrusted` |
| `nte` | number | untrusted 事件数 | `isTrusted` |
| `mte` | number | 缺少 `isTrusted` 属性的事件数 | 事件对象 |
| `tcd` | object | XPath hash 对应的三类事件计数 | 事件目标 |
| `pnte` | number | 持久 untrusted 事件数 | 多轮事件 |
| `pte` | number | 持久 trusted 事件数 | 多轮事件 |
| `pmte` | number | 持久 missing-trusted 事件数 | 多轮事件 |
| `tab` | number | 四层异步 timer 被取消的位图 | 采集时序 |
| `sws` | number | 是否收到外部 `gsws` 数据 | 自定义事件 |
| `mis` | number | `_abck` 第一段是否发生变化 | Cookie 状态 |
| `og` | string | `_abck` 变化前的第一段或 `sm` | Cookie 状态 |
| `s017` | string | 4 个移动/触摸媒体能力位 | media query |
| `s148` | string | Playwright 标志的随机区间编码 | 自动化环境 |
| `s151` | string | Notification denied 的 1024 整除编码 | 权限状态 |
| `s153` | string | Apple Pay API 的随机区间编码 | Apple Pay API |
| `s003` | string | `document.createElement` descriptor 位图 | 原生性 |
| `s002` | string | plugins/mimeTypes getter 源码特征 | 原生性 |
| `s150` | string | file input capture 的 862 整除编码 | DOM 能力 |
| `s157` | string | 6 个媒体 MIME 支持位和耗时 | codec 能力 |
| `s158` | string | OfflineAudioContext 指纹的 DJB2-XOR | 音频实现 |
| `s127` | string | storage quota 转 GiB、保留两位 | StorageManager |
| `s162` | string | 6 个 WebAuthn/Media API 反向布尔位 | API 存在性 |
| `s163` | string | 无效音频 decode 错误语义探针 | AudioContext |
| `s173` | string | ContentIndex 存在性 | Content Index API |
| `fwd` | object[] | DPR 与 speech voice hash | 显示和语音 |

## 3. 基础设备字段

### 3.1 `fpt`

生成链：`Ds() -> w6() -> replace(/"/g, '\\"')`。

```text
"";
-1;
"dis";
已安装历史插件索引;
sessionStorage 可用;
localStorage 可用;
indexedDB 可用;
timezoneOffset;
WebRTC 可用;
screen.colorDepth;
screen.pixelDepth;
navigator.cookieEnabled;
navigator.javaEnabled();
navigator.doNotTrack
```

前三项是协议固定槽。插件项遍历 27 个历史插件名称，命中的索引以 `,index` 追加。存储项不仅看属性，还执行访问测试。输出为 14 段分号字符串。证据：653-686、11854-11930 行。

### 3.2 `fpc`

```js
sum = 0;
for (const char of fpt) {
  if (char.charCodeAt(0) < 128) sum += char.charCodeAt(0);
}
```

输出 `String(sum)`；输入为空返回 `-1`，异常返回 `-2`。它是弱校验和，不是密码学哈希。证据：61-78、5129 行。

### 3.3 `din`

先构造以下 23 个单键对象，再调用 `HJ(items, N2t)`：

| 键 | 生成算法 |
|---|---|
| `ua` | UA 删除反斜杠和双引号 |
| `xag` | 14 位 Window/API 存在性位图 |
| `nps` | `navigator.productSub`，缺失为 `-` |
| `nal` | `navigator.language`，缺失为 `-` |
| `nap` | `navigator.product`，缺失为 `-` |
| `npl` | `navigator.plugins.length`，缺失为 `-1` |
| `pha` | `window._phantom ? 1 : 0` |
| `wdr` | `window.webdriver ? 1 : 0` |
| `dau` | `window.domAutomation ? 1 : 0` |
| `hz1` | `floor(startTs / 2016^2)` |
| `tsd` | 当前版本全局初值 `0` |
| `asw/ash` | `screen.availWidth/availHeight` |
| `swi/she` | `screen.width/height` |
| `wiw/wih` | `innerWidth/innerHeight`，DOM client 尺寸回退 |
| `wow` | `outerWidth` |
| `adp` | 14 项浏览器能力标签串 |
| `ucs` | UA 的 ASCII 字符码求和 |
| `ran` | `String(r).slice(0,11) + floor(r*500)`，只调用一次随机数 |
| `hal` | `startTs / 2` |
| `ibr` | `navigator.brave.isBrave()` 异步结果 |

`xag` 位定义：

```text
0 addEventListener       7 spawn
1 XMLHttpRequest        8 innerWidth
2 XDomainRequest        9 outerWidth
3 emit                 10 chrome
4 DeviceOrientation   11 Function.bind
5 DeviceMotion        12 固定 0
6 TouchEvent          13 PointerEvent
```

`adp` 格式：

```text
cpen:callPhantom,i1:ActiveXObject,dm:documentMode,cwen:chrome.webstore,
non:navigator.onLine,opc:opera,fc:InstallTrigger,sc:Safari特征,
wrc:RTCPeerConnection,isc:mozInnerScreenY,vib:vibrate,
bat:getBattery,x11:缺少forEach,x12:FileReader
```

`HJ` 来自 `H7t.c(...base64 bytecode...,151)` 注册的 VM 函数。已证明其输入、顺序和环境种子 `N2t`，但当前普通 AST 未还原其字节码指令，所以不能把 `HJ` 猜成标准哈希。浏览器解密样本显示当前输出仍是 23 个单键对象的排列。证据：5905-6013、6882-6889、7269-7275、11085-11118 行。

当前 bundle 的首轮和完整轮实测排列相同：

```text
wdr,ucs,ran,nap,xag,dau,swi,she,wih,nps,pha,tsd,hal,hz1,wiw,
npl,ibr,asw,wow,ash,adp,nal,ua
```

这证明当前会话的 `HJ` 输出排列稳定，但还不能证明 bundle 轮换后仍使用相同排列。

### 3.4 `eem`

```text
DeviceOrientationEvent ? do_en : do_dis,
DeviceMotionEvent      ? dm_en : dm_dis,
TouchEvent             ? t_en  : t_dis
```

三个结果以逗号拼接。只检测构造器存在，不检测权限。证据：5091-5094 行。

### 3.5 `sde`

固定七项，每项为 `0/1`：

1. window/document 上 `$cdc_asdjflasutopfhvcZLmcfl_`。
2. `<html webdriver>` 属性。
3. `navigator.webdriver` 已定义且为真。
4. `window.webdriver` 已定义。
5. `XPathResult` 存在。
6. `<html driver>` 属性。
7. `<html selenium>` 属性。

以逗号拼接。第 5 项不是自动化专属信号，必须作为组合向量解释。证据：151-165 行。

### 3.6 `per`

权限顺序：

```text
speaker, device-info, bluetooth, ambient-light-sensor,
accelerometer, gyroscope, magnetometer, clipboard, accessibility-events
```

状态码：`denied=0`、`prompt=1`、`granted=2`、其他=5、无效权限名=4、其他异常=3。

完成后的格式为固定哨兵 `9` 与 9 个状态码混排。API 缺失为 `6`，同步异常为 `7`，查询尚未完成为 `8`。这是异步状态快照，不是 hash。证据：5838-5888 行。

## 4. 表单和行为字段

所有事件记录均以逗号分字段、分号结束，多条直接连接，不转义也不单独加密。

### 4.1 `ffs` / `inf`

每个 `<input>`：

```text
typeClass,autocompleteClass,valueChanged,required,idAsciiSum,nameAsciiSum,hasDefault;
```

- 文本/search/url/email/tel/number 类型为 `typeClass=0`。
- password 为 `1`，其他为 `2` 并跳过。
- autocomplete：缺失 `-1`、off `0`、on `1`、其他 `2`。
- `valueChanged = value !== defaultValue`。
- id/name 只传 ASCII 字符码和。

`inf` 是初始化快照，`ffs` 是发送时快照。证据：2712-2776、5791 行。

### 4.2 `kev`

```text
index,eventType,relativeTs,keyCode,0,modifierMask,targetIdSum[,0];
```

`modifierMask = shift*8 + ctrl*4 + meta*2 + alt`。普通可打印字符归一为 `-2`，标点为 `-3`，F1-F12 为 `-4`；最后的 `0` 表示 `isTrusted=false`。证据：955-1032 行。

### 4.3 `mev`

mousemove：

```text
index,1,relativeTs,floor(x),floor(y)[,0];
```

click/down/up：

```text
index,eventType,relativeTs,floor(x),floor(y),targetIdSum[,button][,0];
```

事件码 move/click/down/up 为 `1/2/3/4`。证据：890-949 行。

### 4.4 `tev`

```text
index,eventType,relativeTs,floor(x),floor(y),touchSource[,0];
```

move/start/end/cancel 为 `1/2/3/4`；坐标来自 `touches[0]` 时 `touchSource=1`，否则为 0。证据：1038-1103 行。

### 4.5 `pev`

只记录 `pointerType !== "mouse"`：

```text
index,eventType,relativeTs,floor(x),floor(y)[,0];
```

pointerdown/up 为 `3/4`。证据：1105-1149 行。

### 4.6 `dme` / `doe`

DeviceMotion：

```text
index,relativeTs,accX,accY,accZ,gravityX,gravityY,gravityZ,
rotationAlpha,rotationBeta,rotationGamma[,0];
```

DeviceOrientation：

```text
index,relativeTs,alpha,beta,gamma[,0];
```

浮点值统一 `toFixed(2)`，缺失通常为 `-1`。证据：5602-5675、10749-10759 行。

### 4.7 `vev` / `oev` / `if`

`vev`：`eventCode,relativeTs;`，visibility hidden/visible 和 blur/focus 使用 `0..3`。

`oev`：

```text
index,eventType,deltaX,deltaY,deltaZ,deltaMode,relativeTs,targetIdSum;
```

只有 wheel 填 delta，其余槽为空。

`if` 不传原始输入值，只传：

```text
fid,fullId,valueLength,specialCount,letterCount,numberCount,
relativeTs,fullIdInputType;
```

特殊字符 `/[^\w\s]/`，字母 `/[a-z]/i`，数字 `/[0-9]/`。密码类字段不统计字符组成。证据：1155-1277、2617-2632 行。

## 5. `mst` 子字段

`mst` 是单键对象数组。

| 子项 | 精确算法 |
|---|---|
| `kevl` | 键盘校验和 `Jz + 1` |
| `mevl` | 鼠标校验和 `K1 + 32` |
| `tevl` | 触摸校验和 `d4 + 32` |
| `devl` | DeviceOrientation 校验和 `M4t` |
| `dmvl` | DeviceMotion 校验和 `GZt` |
| `pevl` | PointerEvent 校验和 `vS` |
| `tovl` | 六个原始校验和之和，不含 `+1/+32` |
| `delt` | `now - startTs` |
| `it` | 当前版本可见初值 `0` |
| `sts` | `bmak.startTs` |
| `fct` | `fpt` 计算耗时 |
| `dd2` | `floor(floor(startTs / 2016^2) / 23)` |
| `kc/mc/pc/tc` | 键盘/鼠标/pointer/touch 事件数 |
| `ww8` | `floor(dd2 / 6)` |
| `ssts` | 第二次 `now-startTs` |
| `tst` | 所有已接受事件 relativeTs 的累计和 |
| `rval/rcfp` | 当前版本初值字符串 `-1` |
| `nfas` | 25 位 API 存在性位图 |
| `jsrf` | 固定 `PiZtE` |
| `jsrf1` | `[10000,109999]` 随机整数 |
| `jsrf2` | `startTs*jsrf1` 六组数字的三维欧氏距离取 floor |
| `signals` | 自动化全局变量位图，转十进制字符串 |
| `mwd` | `navigator.webdriver`: undefined `-1`、false `0`、其他 `1`、异常 `-2` |
| `hea` | 固定空串 |
| `dvc` | `xF(...) + "," + dvc耗时 + "," + 环境分支串 Fdt` |
| `srd` | stealth Proxy 错误栈探针：`1/0/e/n` |
| `tid` | `sessionStorage.TAB_ID`，来源 `crypto.randomUUID()` |

行为校验和只累计索引、事件码、时间、坐标等整数，不是对事件字符串做 hash。例如：

```text
mouse checksum += index + eventType + relativeTs + floor(x) + floor(y)
touch checksum += index + eventType + relativeTs + floor(x) + floor(y)
orientation checksum += index + relativeTs
motion checksum += index + relativeTs
```

`ajr` 使用 `tovl`：若 `tovl` 为真值，计算 `SHA256(String(tovl))|tovl`；为 0 时先生成 `[10000,109999]` 的随机整数再做同样处理。

`nfas` 位 0-24 依次为 credentials、appMinorVersion、bluetooth、storage、Math.imul、getGamepads、getStorageUpdates、hardwareConcurrency、mediaDevices、mozAlarms、mozConnection、mozIsLocallyAvailable、mozPhoneNumberService、msManipulationViewsEnabled、permissions、registerProtocolHandler、requestMediaKeySystemAccess、requestWakeLock、sendBeacon、serviceWorker、storeWebWideTrackingException、webkitGetGamepads、webkitTemporaryStorage、Number.parseInt、Math.hypot。

`signals` 检查 Nightmare、ChromeDriver `cdc_*`、Selenium、Watir、Phantom、Awesomium、domAutomation 等 35 个全局名。注意 JavaScript 位移只保留低 5 位，源码的 `<<32/33/34` 会与 bit 0/1/2 碰撞，复现时必须保持 JS 32 位语义。

`xF` 和 `HJ` 同属内嵌 VM。当前已完全确定 `xF` 的四个输入和 `dvc` 外层格式，但 `xF` 内部字节码尚未 lifting，不能无证据命名其算法。证据：431-442、5101-5147、11058-11071、12082-12113 行。

当前两轮运行样本：

```text
初始轮: a3YjfjYakkifjggouw2v,78,e+k+a+f+c+l+g+i+b+h+d+j+
完整轮: 33jk9kj3a9aic9al3uyv,22,e+k+a+f+c+l+g+i+b+h+d+j+
```

可以确认：第一段固定 20 字符且随 `ajr/sendCount/totVel` 变化；第二段是 `xF` 调用耗时；第三段是本次页面加载生成的 `a..l` 字母排列并以 `+` 分隔。历史版本分析显示第一段由 JSVMP 自定义 base31 类混合产生，但当前 bundle 尚未完成 opcode 级等价恢复，因此不能直接复用旧版公式。

## 6. `dsi` 子字段

`dsi` 正常是 12 个单键对象：

| 子项 | 算法 |
|---|---|
| `get` | 新 iframe 的 `srcdoc` 初值；栈溢出异常为 `M` |
| `set` | 写入 `floor(random()*1000)` 后比较，一致 `0`，不一致 `1` |
| `ico` | `SHA256(Object.keys(iframe.contentWindow.chrome).join(","))` 的 hex |
| `ift` | bit0=contentWindow getter 像 native；bit1=top 与 iframe window 不同 |
| `xof` | iframe 的 `hardwareConcurrency,plugins.length,chrome,pluginTest,deviceMemory` |
| `xot` | top window 的同一五元组 |
| `wev` | `iframeVendor + ";wev;" + topVendor` |
| `wre` | 当前源码仍拼 vendor：`iframeVendor + ";wre;" + topVendor` |
| `wdr` | iframe webdriver：undefined `-1`、false `0`、其他 `1`、异常 `-2` |
| `iks` | 固定空串 |
| `lds` | iframe loading descriptor：存在 `1`、构造器存在但 descriptor 不存在 `-2`、无构造器 `-1` |
| `sst` | 固定空串 |

SHA-256 使用标准 IV/K、UTF-8 输入和 64 位小写 hex。`ico` 无 Chrome keys 时为 `-2`。证据：1514-1642、11349-11407、11638-11655、11932-11960 行。

## 7. `wsl` 与 `hls`

### 7.1 `wsl` 固定 20 段

```text
1  performance.memory.jsHeapSizeLimit
2  performance.memory.totalJSHeapSize
3  performance.memory.usedJSHeapSize
4  navigator.connection.rtt
5  speechSynthesis.getVoices().length
6  plugins[0][0].enabledPlugin === plugins[0]
7  navigator.plugins.refresh 是否可被覆盖
8  plugins.item(2^32) === plugins[0]
9  File.prototype.path descriptor/native getter 得分 0..2
10 非 crossOriginIsolated 时 SharedArrayBuffer 状态
11-18 固定空槽
19 当前版本正常恒为 1，异常 e
20 当前版本正常恒为 1，异常 e
```

插件测试缺失或异常使用 `-1`。SAB 槽：非隔离且缺失 SAB 为 `1`，非隔离但存在为 `-2`，隔离环境为 `-1`。证据：1645-1679、5159、11435-11610 行。

### 7.2 `hls` 固定 5 段

```text
chromeRuntimeHash,,,privateToken,
```

第 1 段满足条件时枚举 `chrome.runtime` 一级和二级自有 key，对 `JSON.stringify(keys)` 做 SHA-256；条件不满足为 `-1`，结构异常可为 `0`。第 4 段为 `Document.prototype.hasOwnProperty("hasPrivateToken") ? 1 : 0`，异常 `e`。证据：1681-1722、5160、11612-11625 行。

## 8. `sww` Window/SharedWorker 双采样

`s024` 是状态：`-1` 未完成、`0` 成功、`250` 跳过、`260` 无 SharedWorker、`280` 超时、`290` window 异常、`300` worker/总流程异常。

其余字段按 window/worker 交错：

| Window | Worker | 原始值 |
|---|---|---|
| `s025` | `s026` | `new Date().toString()` |
| `s027` | `s028` | `navigator.oscpu` |
| `s029` | `s030` | IANA 时区 |
| `s031` | `s032` | language |
| `s033` | `s034` | languages |
| `s035` | `s036` | deviceMemory |
| `s037` | `s038` | hardwareConcurrency |
| `s039` | `s040` | `[effectiveType,rttCode,type]` |
| `s041` | `s042` | userAgent |
| `s043` | `s044` | appVersion |
| `s045` | `s046` | platform |
| `s047` | `s048` | UA-CH brands |
| `s049` | `s050` | mobile |
| `s051` | `s052` | architecture |
| `s053` | `s054` | bitness |
| `s055` | `s056` | model |
| `s057` | `s058` | platform |
| `s059` | `s060` | platformVersion |
| `s061` | `s062` | uaFullVersion |
| `s063` | `s064` | wow64 |
| `s065` | `s066` | fullVersionList |
| `s067` | `s068` | WebGL1 unmasked vendor |
| `s069` | `s070` | WebGL1 unmasked renderer |
| `s071` | `s072` | WebGL2 unmasked vendor |
| `s073` | `s074` | WebGL2 unmasked renderer |

`rttCode`：rtt 等于 0 为 0，大于 0 为 -1，其他为 -2。WebGL 使用 `OffscreenCanvas(0,0)` 和 `WEBGL_debug_renderer_info`。另有 `ext`、`swrt`、`wrt` 和错误字段。证据：2116-2347、10897-10935 行。

## 9. 编号信号的精确编码

### `s017`

```text
touchCapability,matchMedia(pointer:coarse),matchMedia(max-width:767px),
matchMedia(orientation:portrait)
```

每项 `0/1`，逗号拼接。证据：11627-11636 行。

### `s148`

- `"__playwright__binding__" in window`：随机 `[1001,2999]`。
- 不存在：随机 `[3000,4999]`。
- 异常：`e`。

输出十进制字符串。证据：1724-1738 行。

### `s151`

- `Notification.permission === "denied"`：`1024 * randomInt(1,99)`。
- 否则：从 `[1,10000]` 拒绝采样，直到值不能被 1024 整除。
- 异常：`e`。

服务端可用 `%1024===0` 区分。证据：540-546、1740-1754 行。

### `s153`

- 任一 ApplePay 构造器存在：随机 `[1,499]`。
- 不存在：随机 `[500,999]`。
- 异常：`e`。

证据：1756-1770 行。

### `s003`

对 `Object.getOwnPropertyDescriptor(document,"createElement")` 计分：

```text
bit0 descriptor 存在
bit1 descriptor.value.length === 1
bit2 descriptor.value.name === "createElement"
```

输出十进制字符串 `0..7`，异常 `-1`。证据：11703-11727 行。

### `s002`

分别检查 `Navigator.prototype.plugins` 和 `mimeTypes` getter：

```text
bit0 getter.toString() 缺少 "{ [native code] }"
bit1 getter.toString() 包含 "return"
```

每项为 `0..3`，两项无分隔拼接；descriptor/getter 缺失时单项为 `-1`。证据：11120-11147、11729-11735 行。

### `s150`

- `<input type=file capture=user>.capture !== undefined`：`862 * randomInt(1,99)`。
- 不支持：从 `[1,10000]` 拒绝能被 862 整除的值。
- 异常：`e`。

证据：1772-1789 行。

### `s157`

顺序检查 4 个 audio MIME 和 2 个 video MIME。`canPlayType()` 返回 `probably/maybe` 为 1，否则为 0；最后追加执行耗时：

```text
[a1,a2,a3,a4,v1,v2,elapsed]
```

这是字符串而不是数组。异常为 `[e,e,e,e,e,e,elapsed]`。证据：1928-1970 行。

### `s158`

OfflineAudioContext 参数：单声道、44100 Hz、44100 frames；triangle oscillator 10000 Hz；DynamicsCompressor 参数 `-50,40,12,0,0.25`。

计算 `reduction/sampleSum/freqSum/timeSum`，每项保留 6 位，按固定属性顺序 JSON.stringify，再做：

```js
hash = 5381;
for (const codeUnit of json) hash = hash * 33 ^ codeUnit;
result = (hash >>> 0).toString(16);
```

不补足 8 位，异常为 `e`。证据：1973-2066、12021-12032 行。

### `s127`

`(await navigator.storage.estimate()).quota / 1024^3`，再 `toFixed(2)`。API 不支持为 `-2`，异常为 `e`。证据：1791-1850 行。

### `s162`

顺序检查 PublicKeyCredential、AuthenticatorResponse、AuthenticatorAttestationResponse、AuthenticatorAssertionResponse、MediaMetadata、navigator.mediaSession。

存在编码为 `0`，不存在编码为 `1`，六位直接拼接。异常 `e`。证据：11149-11167 行。

### `s163`

执行 `AudioContext.decodeAudioData(new ArrayBuffer(4))`：

- reject message 严格等于 `Decoding failed` 且无 `window.browser`：`100`。
- 其他正常路径：`000`。
- 外层异常：`e`。

证据：1852-1926 行。

### `s173`

`window.ContentIndex` truthy 为 `1`，否则为 `0`；异常同样为 `0`。证据：11168-11184 行。

## 10. 其他状态字段

- `pur`：`document.URL.replace(/\\|"/g, "")`。
- `ffl`：当前脚本 URL `split("/").slice(-4)[0]`。
- `ajt`：`OEt + "," + FSt`，前者是发送原因，后者是发送计数。
- `te/nte/mte`：按 `event.isTrusted === true/false/undefined` 累计。
- `pte/pnte/pmte`：上述三类的跨轮持久计数。
- `tab`：四层异步采集 timer 被取消的位图，权重 `1/2/4/8`。
- `tcd`：目标 XPath 用 DJB2-XOR 生成 8 位 hex key，值是 `[trusted,untrusted,missing]`；按 `untrusted*100+trusted*10+missing` 选前 5 个。
- `mis/og`：比较当前和上一次 `_abck` 第一段；不同则 `mis=1`、`og=旧值`，否则 `mis=0`、`og=sm`。
- `fwd`：`[{fmh:""},{fmz:String(devicePixelRatio)},{ssh:speechHash}]`。speech hash 输入是按浏览器返回顺序直接连接的 `voiceURI + "_" + lang`，再做 SHA-256；无 speech API 为 `n`，voices 尚为空为 `0`。

## 11. 异步时序

完整 55 字段不是一次纯函数计算，而是全局状态快照：

```text
setTimeout T0: s017/s148/dsi
  setTimeout T1: s002/s151/s153/s150/s157/wsl...
    await s158
    计算 s162
    await s163
    计算 s173
    await s127
      setTimeout T2: s003/hls...
        setTimeout T3: sww SharedWorker
```

`c4t()` 不等待该链。过早发送时字段可能缺失、为空、处于 `s024=-1`，或 `per=8`。纯协议复现必须选择和浏览器相同的采集阶段，不能只复制最终值。

## 12. 当前未完全恢复边界

以下两项必须继续做 VM lifting，不能用猜测补齐：

1. `HJ(items,N2t)`：`din` 的最终整形/排列函数。
2. `xF(deltaTimestamp,ajr,sendCount,totVel)`：`mst.dvc` 第一段 `Hct` 的生成函数。

它们由 `sb.c()` 加载 base64 字节码后导出。当前已经证明输入、调用位置、外围拼接和真实输出，但尚未把 VM opcode 还原成普通 JavaScript。除此之外，本文件可见的 55 个顶层字段及其明文子字段均已列出生成或编码方式。

完成度定义：

- **完全还原**：输入、分支、编码公式和输出格式均由当前 bundle 代码或正反向字节一致验证证明。
- **结构还原**：已知输入、输出和外围格式，但核心仍在 VM 字节码中，目前仅 `HJ/xF` 属于此类。
- **状态快照**：算法已知，但输出依赖异步采集完成时刻，如 `per/sww/s127/s158/s163`。
