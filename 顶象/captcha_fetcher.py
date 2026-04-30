"""顶象验证码图片获取 + 背景图还原"""

import json
import math
import os
import random
import sys
import time
import urllib.request
import urllib.parse
from io import BytesIO

from PIL import Image

API_BASE = "https://cap.dingxiang-inc.com/api/a"
CDN_BASE = "https://static4.dingxiang-inc.com/picture"
DEFAULT_APP_KEY = "12610a3853150e888ccd0c6d4c415626"
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "captcha_output")


def _build_opener():
    """Build a urlopen opener that respects DX_PROXY env var
    (e.g. http://user:pass@host:port or socks5h://host:port)."""
    proxy = os.environ.get("DX_PROXY") or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
    if not proxy:
        return urllib.request.build_opener()
    handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    return urllib.request.build_opener(handler)


_OPENER = _build_opener()


def https_get(url, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with _OPENER.open(req, timeout=15) as resp:
        return resp.status, resp.read()


def generate_aid():
    ts = int(time.time() * 1000)
    rand = random.randint(0, 99999999)
    return f"dx-{ts}-{rand}-1"


def fetch_captcha_config(width=300, height=165, slider_size=50,
                         app_key=DEFAULT_APP_KEY, jsv="5.1.53"):
    """调用顶象验证码 API，获取验证码配置"""
    params = urllib.parse.urlencode({
        "w": width, "h": height, "s": slider_size,
        "ak": app_key, "c": "", "jsv": jsv,
        "aid": generate_aid(), "wp": 1, "de": 0,
        "uid": "", "lf": 0, "tpc": "",
        "_r": str(random.random()),
    })
    url = f"{API_BASE}?{params}"
    print(f"[1] 请求验证码配置...\n    URL: {url}")

    _, body = https_get(url, {
        "Referer": "https://cdn.dingxiang-inc.com/",
        "Origin": "https://cdn.dingxiang-inc.com",
    })
    data = json.loads(body)
    print(f"[1] 响应: {json.dumps(data, indent=2, ensure_ascii=False)}")
    return data


def download_image(img_path, save_name):
    """从 CDN 下载图片并保存到本地"""
    url = f"{CDN_BASE}{img_path}"
    print(f"    下载: {url}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    _, body = https_get(url, {
        "Referer": "https://cdn.dingxiang-inc.com/",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    })

    out_path = os.path.join(OUTPUT_DIR, save_name)
    with open(out_path, "wb") as f:
        f.write(body)
    print(f"    已保存: {out_path} ({len(body)} bytes)")
    return out_path, body


def derive_ranges_from_seed(seed):
    """从 seed（文件名）推导切片重排顺序"""
    output = []
    for i, ch in enumerate(seed):
        if i == 32:
            break
        value = ord(ch)
        while (value % 32) in output:
            value += 1
        output.append(value % 32)
    return output


def restore_background(img_bytes, seed):
    """还原打乱的背景图切片"""
    ranges = derive_ranges_from_seed(seed)
    img = Image.open(BytesIO(img_bytes))
    width, height = img.size
    piece_width = width // len(ranges)

    restored = img.copy()
    for i, src_idx in enumerate(ranges):
        left = src_idx * piece_width
        fragment = img.crop((left, 0, left + piece_width, height))
        restored.paste(fragment, (i * piece_width, 0))

    return restored, ranges


def main():
    config = fetch_captcha_config()

    if not config.get("success") or config.get("result") != 1:
        print(f"获取验证码失败: {config.get('msg', 'unknown error')}")
        sys.exit(1)

    print(f"\n[2] 解析验证码配置:")
    print(f"    sid: {config['sid']}")
    print(f"    cid: {config['cid']}")
    print(f"    滑块 Y 坐标: {config['y']}")
    print(f"    背景图路径 (p1): {config['p1']}")
    print(f"    滑块图路径 (p2): {config['p2']}")
    print(f"    验证码类型: {config['type']}")

    print(f"\n[3] 下载验证码图片...")
    bg_path, bg_bytes = download_image(config["p1"], f"bg_{config['cid']}.webp")
    slider_path, _ = download_image(config["p2"], f"slider_{config['cid']}.webp")

    print(f"\n[4] 还原背景图切片...")
    seed = os.path.basename(config["p1"]).split(".")[0]
    restored_img, ranges = restore_background(bg_bytes, seed)
    print(f"    seed: {seed}")
    print(f"    ranges: {ranges}")

    restored_path = os.path.join(OUTPUT_DIR, f"bg_{config['cid']}_restored.png")
    restored_img.save(restored_path)
    print(f"    还原后背景图: {restored_path}")

    print(f"\n[5] 完成！")
    print(f"    会话ID (sid): {config['sid']}")
    print(f"    验证码ID (cid): {config['cid']}")
    print(f"    滑块Y坐标: {config['y']}")
    print(f"    背景图(乱序): {bg_path}")
    print(f"    背景图(还原): {restored_path}")
    print(f"    滑块图: {slider_path}")
    print(f"\n    下一步: 需要计算滑块X坐标，然后提交验证。")

    return config, bg_path, restored_path, slider_path


if __name__ == "__main__":
    main()
