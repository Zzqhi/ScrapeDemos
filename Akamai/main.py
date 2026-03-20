import os
import jsbeautifier
import requests
from http.cookies import SimpleCookie

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

BASE_URL = "https://www.ihg.com"
PAGE_PATH = "/content/us/en/about/brands"
AKAMAI_JS_PATH = "/SO-eswJZvJovtyUS_Q/azD7rQuNOEOGzfp3Oa/BUYyEwh-WAY/NEVTW/BZjb2YB"

COMMON_HEADERS = {
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
}

# 浏览器端生成的固定 cookie，和设备关联性不强
BROWSER_COOKIES = {
    "_pin_unauth": "dWlkPU9ERm1OakJsWVdVdE16a3lPUzAwT1daaUxUazFaakF0T1RGaFptVTJOemN5TVRRMQ",
    "_fbp": "fb.1.1773995799783.243468761131342253",
    "AMCV_8EAD67C25245B1870A490D4C%40AdobeOrg": "179643557%7CMCIDTS%7C20533%7CMCMID%7C59074216069025150876422351116805107992%7CvVersion%7C5.5.0",
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


def fetch_page():
    """第一次请求：访问页面，拿到初始 Set-Cookie"""
    headers = {
        **COMMON_HEADERS,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
        "priority": "u=0, i",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "cross-site",
        "sec-fetch-user": "?1",
        "upgrade-insecure-requests": "1",
    }
    response = requests.get(f"{BASE_URL}{PAGE_PATH}", headers=headers, timeout=30)
    cookies = parse_set_cookies(response)
    cookies.update(BROWSER_COOKIES)
    print("第一次请求 cookies:", cookies)
    return cookies


def fetch_akamai_js(cookies):
    """第二次请求：带上第一次拿到的 cookie 请求 Akamai JS 脚本"""
    headers = {
        **COMMON_HEADERS,
        "accept": "*/*",
        "priority": "u=2",
        "referer": f"{BASE_URL}{PAGE_PATH}",
        "sec-fetch-dest": "script",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-origin",
    }
    response = requests.get(
        f"{BASE_URL}{AKAMAI_JS_PATH}", headers=headers, cookies=cookies
    )
    beautified = jsbeautifier.beautify(response.text)
    enc_path = os.path.join(SCRIPT_DIR, "enc.js")
    with open(enc_path, "w", encoding="utf-8") as f:
        f.write(beautified)
    print(f"Akamai JS 已保存到 {enc_path}")
    return response


if __name__ == "__main__":
    cookies = fetch_page()
    fetch_akamai_js(cookies)
