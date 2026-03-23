import json
import os
import re
import subprocess
import sys

import jsbeautifier
import requests
from http.cookies import SimpleCookie

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

BASE_URL = "https://www.ihg.com"
PAGE_PATH = "/content/us/en/about/brands"

COMMON_HEADERS = {
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
}


def parse_set_cookies(response):
    """从响应的 Set-Cookie 头中解析出所有 cookie"""
    parsed = {}
    for header in response.raw.headers.getlist("Set-Cookie"):
        cookie = SimpleCookie()
        cookie.load(header)
        for key, morsel in cookie.items():
            parsed[key] = morsel.value
    return parsed


def extract_akamai_js_path(html):
    """从 HTML 末尾的 </body> 前提取 Akamai JS 脚本路径"""
    match = re.search(r'<script[^>]*\bsrc=["\'](/[^"\']+)["\'][^>]*>\s*</script>\s*</body>', html)
    if match:
        return match.group(1)
    scripts = re.findall(r'<script[^>]*\bsrc=["\'](/[^"\']+)["\']', html)
    for src in reversed(scripts):
        if not src.startswith("/etc"):
            return src
    raise RuntimeError("未找到 Akamai JS 路径")


def save_cookies(cookies, filename):
    """保存 cookies 到 JSON 文件"""
    filepath = os.path.join(SCRIPT_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(cookies, f, indent=2, ensure_ascii=False)
    print(f"  cookies 已保存到 {filename}")


# ==================== 模式 1: Puppeteer ====================

def get_cookies_via_browser():
    """使用 headless Chromium 完成 Akamai 验证，返回有效 cookies"""
    print("[Browser] 启动 headless Chromium...")
    tmp_file = os.path.join(SCRIPT_DIR, ".sensor_output.tmp")
    result = subprocess.run(
        ["node", os.path.join(SCRIPT_DIR, "browser_sensor.cjs")],
        capture_output=True, text=True, timeout=60,
    )
    if result.stderr:
        for line in result.stderr.strip().split("\n"):
            print(f"  {line}")
    if result.returncode != 0:
        print("[Browser] 失败:", result.stderr[-200:] if result.stderr else "unknown")
        return None

    with open(tmp_file, "r") as f:
        data = json.load(f)
    os.remove(tmp_file)

    if not data.get("akamaiPassed"):
        print("[Browser] Akamai 验证未通过")
        return None

    print(f"[Browser] 验证通过, _abck: ...~{data['abckTail']}")
    return data["cookies"]


# ==================== 模式 2: env.js 补环境 ====================

def fetch_page():
    """第一次请求：访问页面，拿到初始 Set-Cookie 和 Akamai JS 路径"""
    headers = {
        **COMMON_HEADERS,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "cross-site",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
    }
    response = requests.get(f"{BASE_URL}{PAGE_PATH}", headers=headers, timeout=30)
    cookies = parse_set_cookies(response)
    akamai_js_path = extract_akamai_js_path(response.text)
    print(f"[1/4] 页面请求完成, Akamai JS: {akamai_js_path}")
    return cookies, akamai_js_path


def fetch_akamai_js(cookies, akamai_js_path):
    """第二次请求：带上第一次拿到的 cookie 请求 Akamai JS 脚本"""
    headers = {
        **COMMON_HEADERS,
        "accept": "*/*",
        "referer": f"{BASE_URL}{PAGE_PATH}",
        "sec-fetch-dest": "script",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-origin",
    }
    response = requests.get(
        f"{BASE_URL}{akamai_js_path}", headers=headers, cookies=cookies
    )
    beautified = jsbeautifier.beautify(response.text)
    enc_path = os.path.join(SCRIPT_DIR, "enc.js")
    with open(enc_path, "w", encoding="utf-8") as f:
        f.write(beautified)
    print(f"[2/4] Akamai JS 已保存到 enc.js ({len(beautified)} bytes)")
    return response


def generate_sensor_data(cookies, akamai_js_path):
    """调用 Node.js env.js + enc.js 生成 sensor_data"""
    cookie_str = "; ".join(f"{k}={v}" for k, v in cookies.items())
    akamai_js_url = f"{BASE_URL}{akamai_js_path}"
    wrapper = os.path.join(SCRIPT_DIR, "sensor_wrapper.cjs")
    tmp_file = os.path.join(SCRIPT_DIR, ".sensor_output.tmp")
    result = subprocess.run(
        ["node", wrapper, "--local", cookie_str, akamai_js_url],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode != 0:
        print("[3/4] sensor_wrapper 报错:", result.stderr)
        return None
    if not os.path.exists(tmp_file):
        print("[3/4] sensor 输出文件不存在")
        return None
    with open(tmp_file, "r") as f:
        sensor = f.read().strip()
    os.remove(tmp_file)
    print(f"[3/4] sensor_data 生成完成 (长度: {len(sensor)})")
    return sensor


def post_sensor_data(cookies, sensor_data, akamai_js_path):
    """POST sensor_data 到 Akamai 端点，拿更新后的 _abck"""
    headers = {
        **COMMON_HEADERS,
        "accept": "*/*",
        "content-type": "application/json",
        "origin": BASE_URL,
        "referer": f"{BASE_URL}{PAGE_PATH}",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
    }
    response = requests.post(
        f"{BASE_URL}{akamai_js_path}",
        headers=headers,
        cookies=cookies,
        data=sensor_data,
        timeout=30,
    )
    new_cookies = parse_set_cookies(response)
    print(f"[4/4] POST 完成 (status: {response.status_code})")

    if "_abck" in new_cookies:
        old = cookies.get("_abck", "")
        new = new_cookies["_abck"]
        old_tail = "~".join(old.split("~")[-3:]) if "~" in old else ""
        new_tail = "~".join(new.split("~")[-3:]) if "~" in new else ""
        print(f"  _abck: ...~{old_tail} -> ...~{new_tail}")
        cookies["_abck"] = new
    else:
        print("  未收到新的 _abck")

    return cookies


# ==================== 主流程 ====================

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "browser"

    if mode == "browser":
        cookies = get_cookies_via_browser()
        if cookies:
            save_cookies(cookies, "cookies_browser.json")

    elif mode == "manual":
        cookies, akamai_js_path = fetch_page()
        save_cookies(cookies, "cookies_initial.json")

        fetch_akamai_js(cookies, akamai_js_path)

        sensor = generate_sensor_data(cookies, akamai_js_path)
        if not sensor:
            print("生成 sensor_data 失败")
            exit(1)

        cookies = post_sensor_data(cookies, sensor, akamai_js_path)
        save_cookies(cookies, "cookies_after_post.json")

    else:
        print(f"用法: python main.py [browser|manual]")
        print(f"  browser  - Puppeteer 自动获取 (默认)")
        print(f"  manual   - env.js 补环境手动流程 (调试用)")
        exit(1)
