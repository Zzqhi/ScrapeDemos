import requests, time

_t = str(int(time.time() * 1000))[-6:-1]
url = f'https://constid.dingxiang-inc.com/udid/c1?_t={_t}'
resp = requests.get(url)
print(resp.text)