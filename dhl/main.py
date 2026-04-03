import requests
import pyquery as pq
import json
import subprocess

headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=0, i",
    "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
}


def build_cookie_string(cookie_dict):
    return "; ".join(f"{k}={v}" for k, v in cookie_dict.items())


def generate_sensor_data_locally(cookie_str, script_path, page_url, post_url):
    payload = {
        "cookie": cookie_str,
        "page_url": page_url,
        "post_url": post_url,
    }
    result = subprocess.run(
        ["node", "dhl/scripts/gen_sensor_v2.js"],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        timeout=15,
    )
    if result.stderr:
        print(f"[node stderr] {result.stderr.strip()}")
    try:
        node_out = json.loads(result.stdout)
    except Exception as exc:
        raise RuntimeError(f"Node output parse error: {exc}, raw: {result.stdout[:200]}") from exc

    sensor_data = node_out.get("sensor_data", "")
    if not sensor_data:
        raise RuntimeError(f"Local env execution failed: {node_out.get('error', 'unknown')}")
    return sensor_data


url = "https://www.dhl.com/cn-zh/home/tracking.html"
params = {
    "submit": "1",
    "tacking-id": "1232343",
    "tracking-id": "1232343"
}
session = requests.Session()
html = session.get(url, headers=headers, params=params).text
doc = pq.PyQuery(html)
script_src = doc("script[type='text/javascript']").eq(-1).attr("src")
print(script_src)

script_headers = {
    "accept": "*/*",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=2",
    "referer": f"{url}?submit=1&tacking-id=1232343&tracking-id=1232343",
    "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "script",
    "sec-fetch-mode": "no-cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
}
script_url = f"https://www.dhl.com{script_src}"
script_text = session.get(script_url, headers=script_headers).text
print(script_text[:200])

with open("dhl/test.js", "w", encoding="utf-8") as f:
    f.write(script_text)
print(f"JS saved to dhl/test.js ({len(script_text)} chars)")

# 第三次请求：本地补环境执行 Akamai 脚本，生成 sensor_data 后回放到目标端点
referer = f"{url}?submit=1&tacking-id=1232343&tracking-id=1232343"
post_headers = {
    "accept": "*/*",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "content-type": "text/plain;charset=UTF-8",
    "origin": "https://www.dhl.com",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": referer,
    "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
}

cookie_dict = session.cookies.get_dict()
abck_val = cookie_dict.get("_abck", "")
cookie_str = build_cookie_string(cookie_dict)
print(f"Session cookies: {list(cookie_dict.keys())}")
print(f"_abck prefix: {abck_val[:60]}...")

# 用 Node.js 补浏览器环境，直接在本地执行 Akamai 脚本生成 sensor_data
post_url = f"https://www.dhl.com{script_src}"
for i in range(3):
    try:
        sensor_data = generate_sensor_data_locally(
            cookie_str=cookie_str,
            script_path="dhl/test.js",
            page_url=referer,
            post_url=post_url,
        )
    except Exception as exc:
        print(str(exc))
        break

    print(f"sensor_data from Node: length={len(sensor_data)}, prefix={sensor_data[:80]}")

    post_resp = session.post(post_url, headers=post_headers, data=json.dumps({"sensor_data": sensor_data}))
    abck = session.cookies.get("_abck", "")
    status = abck.split("~")[1] if "~" in abck else "unknown"
    print(f"POST #{i+1}: status_code={post_resp.status_code}, response={post_resp.text.strip()}, _abck_status={status}")
    if status == "0":
        print("验证通过！_abck status = 0")
        break

    # 更新 cookie 给下一轮本地补环境执行
    cookie_dict = session.cookies.get_dict()
    cookie_str = build_cookie_string(cookie_dict)
