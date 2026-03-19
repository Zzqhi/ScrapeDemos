import requests
import subprocess
import json
import time
import os

# 清除代理环境变量，避免系统代理干扰请求
for _k in ('http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY'):
    os.environ.pop(_k, None)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

# 从浏览器 F12 复制完整 cookie（sessionid 过期时更新此处）
COOKIE_STR = (
    "sessionid=sfc1pr7o3ah5ez7u03rbs1iexnmb7qi8; "
    "Hm_lvt_0d2227abf9548feda3b9cb6fddee26c0=1773810151,1773810402; "
    "HMACCOUNT=19F6CDE53094F092; "
    "Hm_lpvt_0d2227abf9548feda3b9cb6fddee26c0=1773823619"
)


def get_h5(page: int, t: int) -> str:
    result = subprocess.run(
        ['node', os.path.join(SCRIPT_DIR, 'sign_wrapper.cjs'),
         str(page), str(t), COOKIE_STR],
        capture_output=True, text=True, timeout=15
    )
    return result.stdout.strip()


headers = {
    "accept": "application/json, text/javascript, */*; q=0.01",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    "origin": "https://www.mashangpa.com",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://www.mashangpa.com/problem-detail/16/",
    "sec-ch-ua": "\"Chromium\";v=\"146\", \"Not-A.Brand\";v=\"24\", \"Google Chrome\";v=\"146\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "x-requested-with": "XMLHttpRequest"
}
cookies = {k.strip().split("=", 1)[0]: k.strip().split("=", 1)[1]
           for k in COOKIE_STR.split(";")}

page = 1
t = int(time.time() * 1000)
h5 = get_h5(page, t)

url = "https://www.mashangpa.com/api/problem-detail/16/data/"
data = json.dumps({"page": page, "t": t, "h5": h5}, separators=(',', ':'))
response = requests.post(url, headers=headers, cookies=cookies, data=data)

print(response.text)
print(response)
