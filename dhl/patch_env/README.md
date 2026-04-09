# DHL Akamai CDP 方案

通过 Chrome DevTools Protocol (CDP) 控制真实 Chrome 浏览器，绕过 Akamai Bot Manager 验证，获取 DHL 物流数据。

## 原理概述

### 为什么用 CDP？

Akamai Bot Manager 的核心防护逻辑：
1. 页面加载时注入一个 JS bundle（约 556KB），该脚本收集浏览器指纹 + 用户行为数据
2. 将数据编码为 `sensor_data`，POST 到 Akamai 端点
3. 服务端验证通过后，将 `_abck` cookie 状态设为 `~0~`（有效）
4. 后续 API 请求携带有效的 `_abck` cookie 才能正常访问

CDP 方案的优势：
- **TLS 指纹一致**：cookie 绑定在 Chrome 的 TLS session 上，直接在浏览器内发请求不存在 TLS 不匹配问题
- **真实浏览器环境**：Akamai 的指纹采集在真实 Chrome 中运行，不需要补环境
- **可信事件**：CDP 的 `Input.dispatch*` 生成的事件被浏览器视为可信事件（`isTrusted: true`）

### Akamai 验证流程

```
新建标签页 (PUT /json/new)
  │
  ├─ Page.navigate → 页面开始加载
  │   ├─ Akamai bundle 初始化
  │   └─ POST #1 (~2134 bytes): 设备指纹（页面加载期间自动发出）
  │
  ├─ Page.loadEventFired → 页面加载完成
  │   └─ POST #2 (~5384 bytes): 含指纹 + 部分页面数据（加载后自动发出）
  │       → _abck 仍为无效状态（需要用户交互数据）
  │
  ├─ CDP 注入用户交互事件（鼠标移动/点击/键盘/滚动）
  │   └─ Akamai 收集事件，可能触发后续 POST
  │
  └─ _abck cookie 状态变为 ~0~ → 验证通过
```

### 关键发现：用户交互是必需的

经对照实验验证：
- **有交互注入**：稳定通过（`_abck status: 0`）
- **无交互（仅页面加载）**：3/3 次全部失败（`_abck status: -1`）

Akamai 的 2 次 POST 在页面加载期间就自动发出，但仅靠这 2 次 POST 不足以通过验证。
CDP 注入的鼠标/键盘/滚动事件会被 Akamai bundle 收集，用于后续验证或追加 POST。

## 文件说明

```
dhl/patch_env/
├── main.py          # 入口：调度 CDP 流程，输出物流数据
├── cdp_solve.js     # 核心：CDP 控制 Chrome 完成 Akamai 验证
├── cdp_fetch.js     # 在 Chrome 内发 API 请求（复用 TLS session）
├── env.js           # 浏览器环境补丁（纯算法方案用）
├── run.js           # 补环境方案的入口（纯算法方案用）
├── gen.py           # 补环境方案的 Python 入口
├── compare.js       # sensor_data 对比工具
└── debug_*.js       # 调试辅助脚本
```

## 使用方法

### 前置条件

1. 安装依赖：
```bash
npm install ws
```

2. 启动 Chrome 并开启远程调试端口：
```bash
# Windows
chrome.exe --remote-debugging-port=9222

# Mac
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# 如果 Chrome 已在运行，需要先关闭所有 Chrome 进程再用此命令启动
```

3. 验证 CDP 可用：
```bash
curl http://localhost:9222/json
# 应返回 JSON 数组，包含当前打开的页面信息
```

### 运行

```bash
python dhl/patch_env/main.py <tracking_number>
```

### 输出示例

```
[1] Solving Akamai via CDP (tracking: 1232343)...
  [node] [cdp] New page created, connecting to ws://localhost:9222/devtools/page/...
  [node] [cdp] Navigating to https://www.dhl.com/cn-zh/home/tracking.html?...
  [node] [cdp] POST #1 (2133 bytes)
  [node] [cdp] POST #2 (5357 bytes)
  [node] [cdp] Page loaded
  [node] [cdp] Simulating interaction...
  [node] [cdp] _abck status: 0, POST count: 2
[2] _abck status: 0
[OK] Akamai challenge solved!

[3] Fetching tracking data for 1232343...
  HTTP 200 (1501 chars)
  { "shipments": [ ... ] }
```

## 代码解析

### cdp_solve.js 核心流程

```
solve(config)
  │
  ├─ Step 1: PUT /json/new 创建新标签页
  │
  ├─ Step 2: Page.navigate 导航到目标页
  │   先注册 loadEventFired 监听，再发 navigate（避免事件竞态）
  │
  ├─ Step 3: sleep(4000) 等待 Akamai 自动完成 1st POST
  │
  ├─ Step 4: simulateInteraction() 注入用户交互
  │   - 鼠标曲线移动 (30 步)
  │   - 鼠标点击 (mousePressed + mouseReleased)
  │   - 键盘输入 (Tab + 数字)
  │   - 页面滚动 (mouseWheel)
  │
  ├─ Step 5: sleep(5000) 等待 Akamai 处理事件并完成验证
  │
  └─ Step 6: Runtime.evaluate 读取 _abck cookie
      status === '0' 表示验证通过
      如果未通过，最多重试 3 轮交互
```

### CDPClient 类

最小化的 CDP WebSocket 客户端：

```javascript
class CDPClient {
  connect()                    // 建立 WebSocket 连接
  send(method, params)         // 发送命令并等待响应（10s 超时）
  on(eventName, handler)       // 持续监听事件
  waitForEvent(name, timeout)  // 等待指定事件触发一次
  close()                      // 关闭连接
}
```

CDP 通信协议：
- 请求：`{ id: 1, method: "Page.navigate", params: { url: "..." } }`
- 响应：`{ id: 1, result: { frameId: "..." } }`
- 事件：`{ method: "Page.loadEventFired", params: { timestamp: ... } }`

### cdp_fetch.js

在已通过验证的浏览器标签页内执行 `fetch()` 请求，复用 TLS session 和 cookie。

### main.py

Python 调度层，通过 `subprocess` 调用 Node.js 脚本（stdin 传 JSON 参数，stdout 收 JSON 结果）。

## 关键 CDP 命令参考

| 命令 | 用途 |
|------|------|
| `PUT /json/new` | 创建新标签页（新版 Chrome 要求 PUT） |
| `Page.enable` | 启用 Page 域事件 |
| `Network.enable` | 启用 Network 域事件 |
| `Page.navigate` | 导航到指定 URL |
| `Page.close` | 关闭当前标签页 |
| `Input.dispatchMouseEvent` | 派发鼠标事件（mouseMoved/mousePressed/mouseReleased/mouseWheel） |
| `Input.dispatchKeyEvent` | 派发键盘事件（keyDown/keyUp） |
| `Runtime.evaluate` | 在页面上下文执行 JS 代码 |
| `Network.requestWillBeSent` | 网络请求发出事件（用于监控 POST） |

## 调试踩坑记录

### 1. Page.loadEventFired 竞态

**现象**：导航后超时，页面实际已加载完成

**原因**：先调用 `Page.navigate`，再注册 `waitForEvent`，事件在注册前已触发

**修复**：先注册监听再导航
```javascript
const loadPromise = cdp.waitForEvent('Page.loadEventFired', 30000);
await cdp.send('Page.navigate', { url });
await loadPromise;
```

### 2. 复用已有页面失败

**现象**：复用已有 DHL 页面时 loadEventFired 始终收不到

**修复**：改用 `PUT /json/new` 创建全新标签页

### 3. Chrome 新版 /json/new 需要 PUT

**现象**：`GET /json/new` 报错 "Using unsafe HTTP verb GET"

**修复**：用 `http.request` 指定 `method: 'PUT'`

### 4. 无交互时 cookie 残留导致误判

**现象**：去掉交互注入后偶尔仍然通过验证

**原因**：同一 Chrome 实例中其他标签页的有效 `_abck` cookie 被复用

**验证**：连续 3 次无交互测试，全部 `status: -1`，确认交互是必需的
