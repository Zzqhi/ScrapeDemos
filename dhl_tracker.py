"""
DHL 快递查询 - 基于 Chromium CDP（无 Playwright）
流程：
  1. 启动 Headless Chromium（开启远程调试端口）
  2. CDP 注入反检测脚本，导航到 DHL 查询页
  3. 监听 Akamai 传感器 POST 完成（201 响应）
  4. 监听 UTAPI 响应（200），直接从浏览器提取响应体
  5. 可选：提取最终 cookies 供后续复用
"""

import json
import subprocess
import time
import threading
import urllib.request
import websocket
import sys

# ─── 配置 ────────────────────────────────────────────────────
CHROMIUM_BIN = "chromium"
DEBUG_PORT   = 9222
DHL_TRACKING_BASE = "https://www.dhl.com/cn-zh/home/tracking.html"
SENSOR_ENDPOINT   = "/ar5uX3/"   # Akamai 传感器端点前缀特征
UTAPI_PATH        = "/utapi"
PAGE_TIMEOUT      = 35           # 等待 UTAPI 结果的最大秒数
# ──────────────────────────────────────────────────────────────


class CDP:
    """轻量级 Chrome DevTools Protocol 客户端"""

    def __init__(self, ws_url: str):
        self._id  = 0
        self._pending: dict[int, threading.Event] = {}
        self._results: dict[int, dict] = {}
        self._lock    = threading.Lock()
        self._event_handlers: dict[str, list] = {}

        self.ws = websocket.WebSocketApp(
            ws_url,
            on_message=self._on_message,
            on_error=lambda ws, e: None,
        )
        self._thread = threading.Thread(target=self.ws.run_forever, daemon=True)
        self._thread.start()
        time.sleep(0.5)

    def _on_message(self, ws, raw):
        msg = json.loads(raw)
        mid = msg.get("id")
        if mid is not None:
            with self._lock:
                evt = self._pending.pop(mid, None)
            self._results[mid] = msg
            if evt:
                evt.set()
        else:
            method = msg.get("method", "")
            for handler in self._event_handlers.get(method, []):
                try:
                    handler(msg.get("params", {}))
                except Exception as e:
                    pass

    def on(self, event: str, handler):
        self._event_handlers.setdefault(event, []).append(handler)

    def call(self, method: str, params: dict = None, timeout: int = 15) -> dict:
        with self._lock:
            self._id += 1
            mid = self._id
            evt = threading.Event()
            self._pending[mid] = evt

        payload = json.dumps({"id": mid, "method": method, "params": params or {}})
        self.ws.send(payload)
        if not evt.wait(timeout):
            raise TimeoutError(f"CDP timeout: {method}")
        return self._results.pop(mid, {}).get("result", {})

    def close(self):
        self.ws.close()


def start_chromium(port: int) -> subprocess.Popen:
    args = [
        CHROMIUM_BIN,
        f"--remote-debugging-port={port}",
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/146.0.0.0 Safari/537.36",
        "--window-size=1920,1080",
        "--lang=zh-CN",
        "--enable-webgl",
        "--use-gl=angle",
        "--use-angle=swiftshader",
        f"--remote-allow-origins=http://127.0.0.1:{port}",
    ]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(20):
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/json/version", timeout=1)
            return proc
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Chromium 启动失败")


def get_ws_url(port: int) -> str:
    resp = urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=5)
    tabs = json.loads(resp.read())
    for tab in tabs:
        if tab.get("type") == "page":
            return tab["webSocketDebuggerUrl"]
    raise RuntimeError("没有找到可用的 tab")


def query_dhl(tracking_number: str, country: str = "CN", lang: str = "zh") -> dict:
    """
    主查询函数：启动浏览器 → 触发传感器 → 拦截 UTAPI 响应
    返回: {"utapi": {...}, "cookies": {...}}
    """
    print(f"[*] 启动 Chromium（CDP 模式）...")
    proc = start_chromium(DEBUG_PORT)

    try:
        ws_url = get_ws_url(DEBUG_PORT)
        print(f"[*] CDP 已连接")
        cdp = CDP(ws_url)

        # ── 事件监听 ──────────────────────────────────────────
        utapi_done   = threading.Event()
        sensor_done  = threading.Event()
        utapi_req_id = [None]
        utapi_data   = [None]
        sensor_posts = [0]

        def on_request(params):
            url    = params.get("request", {}).get("url", "")
            method = params.get("request", {}).get("method", "")
            req_id = params.get("requestId", "")
            if UTAPI_PATH in url and "trackingNumber" in url:
                utapi_req_id[0] = req_id
                print(f"  [→] UTAPI GET: {url[40:100]}")
            elif SENSOR_ENDPOINT in url and method == "POST":
                sensor_posts[0] += 1
                print(f"  [→] 传感器 POST #{sensor_posts[0]}")

        def on_response(params):
            url    = params.get("response", {}).get("url", "")
            status = params.get("response", {}).get("status")
            req_id = params.get("requestId", "")
            if UTAPI_PATH in url and status == 200:
                utapi_req_id[0] = req_id
                print(f"  [←] UTAPI 200 OK")
                utapi_done.set()
            elif SENSOR_ENDPOINT in url and status == 201:
                print(f"  [←] 传感器 201 Accepted")
                sensor_done.set()

        cdp.on("Network.requestWillBeSent", on_request)
        cdp.on("Network.responseReceived",  on_response)

        # ── 初始化 ─────────────────────────────────────────────
        cdp.call("Network.enable")
        cdp.call("Page.enable")

        # 注入反检测脚本（在每个文档加载前执行）
        cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": """
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer',
                      description: 'Portable Document Format', length: 1 }
                ]
            });
            Object.defineProperty(navigator, 'languages',
                { get: () => ['zh-CN', 'zh', 'en-US', 'en'] });
            Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
            Object.defineProperty(navigator, 'deviceMemory',        { get: () => 8 });
            // 补全 chrome 对象（headless 模式下缺失）
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {},
                app: {}
            };
        """})

        # 设置请求头
        cdp.call("Network.setExtraHTTPHeaders", {
            "headers": {
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
                "sec-ch-ua-mobile":   "?0",
                "sec-ch-ua-platform": '"Windows"',
            }
        })

        # ── 导航 ───────────────────────────────────────────────
        page_url = (f"{DHL_TRACKING_BASE}"
                    f"?submit=1&tracking-id={tracking_number}")
        print(f"[*] 导航到 DHL 查询页...")
        cdp.call("Page.navigate", {"url": page_url}, timeout=30)

        # 等待页面加载完成
        time.sleep(3)

        # 模拟基本用户交互（帮助 Akamai 收集足够的行为数据）
        print("[*] 模拟用户交互...")
        for x, y in [(300, 200), (500, 300), (700, 400), (960, 540), (400, 600)]:
            cdp.call("Input.dispatchMouseEvent", {
                "type": "mouseMoved", "x": x, "y": y,
                "modifiers": 0, "buttons": 0, "button": "none"
            })
            time.sleep(0.08)
        cdp.call("Input.dispatchMouseEvent", {
            "type": "mouseWheel", "x": 760, "y": 400,
            "deltaX": 0, "deltaY": 200
        })

        # ── 等待 UTAPI 响应 ──────────────────────────────────
        print(f"[*] 等待 UTAPI 响应（最多 {PAGE_TIMEOUT}s）...")
        got_result = utapi_done.wait(timeout=PAGE_TIMEOUT)

        if not got_result:
            print("[!] 超时：UTAPI 未返回，尝试读取已有数据...")

        # 从浏览器中读取 UTAPI 响应体
        if utapi_req_id[0]:
            try:
                body_result = cdp.call("Network.getResponseBody",
                                       {"requestId": utapi_req_id[0]}, timeout=5)
                body = body_result.get("body", "")
                if body:
                    utapi_data[0] = json.loads(body)
            except Exception as e:
                print(f"[!] 读取响应体失败: {e}")

        # ── 提取 cookies ──────────────────────────────────────
        all_cookies = cdp.call("Network.getAllCookies")
        cookies = {}
        for c in all_cookies.get("cookies", []):
            if "dhl.com" in c.get("domain", ""):
                cookies[c["name"]] = c["value"]

        # 打印 _abck 状态
        abck = cookies.get("_abck", "")
        if abck:
            parts = abck.split("~")
            status = parts[1] if len(parts) > 1 else "?"
            print(f"[+] _abck 状态码: {status}  ({'已验证' if status == '0' else '未验证/拦截中'})")

        cdp.close()
        return {"utapi": utapi_data[0], "cookies": cookies}

    finally:
        proc.terminate()
        proc.wait()
        print("[*] Chromium 已关闭")


def main():
    if len(sys.argv) < 2:
        print("用法: python3 dhl_tracker.py <快递单号> [国家代码] [语言]")
        print("示例: python3 dhl_tracker.py 1234567890 CN zh")
        sys.exit(1)

    tracking_number = sys.argv[1]
    country = sys.argv[2] if len(sys.argv) > 2 else "CN"
    lang    = sys.argv[3] if len(sys.argv) > 3 else "zh"

    print(f"[*] 查询单号: {tracking_number}  国家: {country}  语言: {lang}")

    result = query_dhl(tracking_number, country, lang)

    utapi = result.get("utapi")
    if utapi:
        print("\n" + "="*60)
        print("查询结果:")
        print("="*60)
        print(json.dumps(utapi, ensure_ascii=False, indent=2))
    else:
        print("\n[!] 未获取到 UTAPI 数据")
        print("    已提取的 cookies:")
        for k, v in result.get("cookies", {}).items():
            print(f"      {k}: {v[:60]}...")

    # 打印可复用的 cookie 字符串
    cookies = result.get("cookies", {})
    if cookies:
        cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
        print(f"\n[+] 可复用的 Cookie 字符串（{len(cookies)} 个）:")
        print(f"    {cookie_str[:200]}...")


if __name__ == "__main__":
    main()
