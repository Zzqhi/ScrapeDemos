"""诊断: 哪些字段/条件触发二次验证.

控制变量实验:
  1. 基线: 正常跑一次 captcha_solver 流程, 记录是否触发二次验证
  2. 逐个变量: 分别去掉/替换 constid(c), 改 ac 长度, 改 x 偏移等
  3. 统计哪个变量影响二次验证触发率
"""
from __future__ import annotations

import json
import os
import sys
import time
import random
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from captcha_fetcher import (
    DEFAULT_APP_KEY, OUTPUT_DIR, download_image,
    fetch_captcha_config, generate_aid, restore_background,
)
from captcha_solver import (
    IDENTITY, VERIFY_URL, build_drag_events, gen_ua_via_sidecar,
    generate_drag_points, get_constid_token, image_to_png_bytes,
    solve_slider_x, _build_opener,
)


def verify_with_params(*, ac, ak, sid, aid, x, y, c="", jsv="1.5.46.2"):
    post_data = urllib.parse.urlencode({
        "ac": ac, "ak": ak, "c": c, "uid": "",
        "jsv": jsv, "sid": sid, "aid": aid, "x": x, "y": y,
    }).encode("utf-8")
    headers = {
        "Content-type": "application/x-www-form-urlencoded",
        "Origin": IDENTITY["href"].rstrip("/"),
        "Referer": IDENTITY["referrer"],
        "User-Agent": IDENTITY["ua"],
    }
    req = urllib.request.Request(VERIFY_URL, data=post_data, headers=headers)
    opener = _build_opener()
    with opener.open(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def prepare_slide():
    """获取验证码 + 识别 gap_x + 生成 UA, 返回所有提交参数."""
    aid = generate_aid()
    config = fetch_captcha_config(aid=aid)
    if not config.get("success"):
        raise RuntimeError(f"fetch failed: {config}")

    sid = config.get("sid", "")
    _, bg_bytes = download_image(config["p1"], f"bg_{config['cid']}.webp")
    _, slider_bytes = download_image(config["p2"], f"slider_{config['cid']}.webp")

    seed = os.path.basename(config["p1"]).split(".")[0]
    restored_img, _ = restore_background(bg_bytes, seed)
    bg_restored_bytes = image_to_png_bytes(restored_img)
    target_x = solve_slider_x(slider_bytes, bg_restored_bytes)

    start_y = int(config.get("y", 0))
    points = generate_drag_points(start_x=0, target_x=target_x, y=start_y)
    events = build_drag_events(points, verify_x=target_x, verify_y=start_y)
    start_time_ms = int(time.time() * 1000) - random.randint(900, 1800)
    pre_init_ms = random.randint(60_000, 100_000)
    ua = gen_ua_via_sidecar(token=sid, events=events,
                            start_time_ms=start_time_ms, pre_init_ms=pre_init_ms)

    constid = get_constid_token(app_id=DEFAULT_APP_KEY)

    return {
        "sid": sid,
        "aid": aid,
        "x": target_x,
        "y": config.get("y", 0),
        "ac": ua,
        "c": constid,
        "ak": DEFAULT_APP_KEY,
    }


def classify_result(resp):
    if resp.get("success"):
        return "pass"
    if resp.get("msg") == "二次验证":
        sv = resp.get("sv", {})
        return f"2fa(type={sv.get('type')})"
    if resp.get("msg") == "error":
        return "error"
    return f"other({resp.get('msg', 'unknown')})"


def run_experiments():
    results = []

    print("=" * 60)
    print("实验 1: 基线 (正常全参数提交)")
    print("=" * 60)
    params = prepare_slide()
    resp = verify_with_params(**params)
    r = classify_result(resp)
    print(f"  结果: {r}")
    print(f"  响应: {json.dumps(resp, ensure_ascii=False)[:200]}")
    results.append(("baseline", r))
    time.sleep(1)

    print("\n" + "=" * 60)
    print("实验 2: 不传 constid (c=空)")
    print("=" * 60)
    params = prepare_slide()
    resp = verify_with_params(**{**params, "c": ""})
    r = classify_result(resp)
    print(f"  结果: {r}")
    print(f"  响应: {json.dumps(resp, ensure_ascii=False)[:200]}")
    results.append(("no_constid", r))
    time.sleep(1)

    print("\n" + "=" * 60)
    print("实验 3: 故意 x 偏移 +5px")
    print("=" * 60)
    params = prepare_slide()
    resp = verify_with_params(**{**params, "x": params["x"] + 5})
    r = classify_result(resp)
    print(f"  结果: {r}")
    print(f"  响应: {json.dumps(resp, ensure_ascii=False)[:200]}")
    results.append(("x_offset_+5", r))
    time.sleep(1)

    print("\n" + "=" * 60)
    print("实验 4: 故意 x 偏移 -5px")
    print("=" * 60)
    params = prepare_slide()
    resp = verify_with_params(**{**params, "x": params["x"] - 5})
    r = classify_result(resp)
    print(f"  结果: {r}")
    print(f"  响应: {json.dumps(resp, ensure_ascii=False)[:200]}")
    results.append(("x_offset_-5", r))
    time.sleep(1)

    print("\n" + "=" * 60)
    print("实验 5: 改 jsv 为旧版本 5.1.53")
    print("=" * 60)
    params = prepare_slide()
    resp = verify_with_params(**{**params, "jsv": "5.1.53"})
    r = classify_result(resp)
    print(f"  结果: {r}")
    print(f"  响应: {json.dumps(resp, ensure_ascii=False)[:200]}")
    results.append(("old_jsv", r))
    time.sleep(1)

    print("\n" + "=" * 60)
    print("实验 6: ac 传空 (不传行为数据)")
    print("=" * 60)
    params = prepare_slide()
    resp = verify_with_params(**{**params, "ac": ""})
    r = classify_result(resp)
    print(f"  结果: {r}")
    print(f"  响应: {json.dumps(resp, ensure_ascii=False)[:200]}")
    results.append(("no_ac", r))
    time.sleep(1)

    print("\n" + "=" * 60)
    print("实验 7: ac 传随机垃圾数据")
    print("=" * 60)
    params = prepare_slide()
    fake_ac = "5658#" + "A" * 500
    resp = verify_with_params(**{**params, "ac": fake_ac})
    r = classify_result(resp)
    print(f"  结果: {r}")
    print(f"  响应: {json.dumps(resp, ensure_ascii=False)[:200]}")
    results.append(("garbage_ac", r))

    print("\n\n" + "=" * 60)
    print("汇总")
    print("=" * 60)
    for name, result in results:
        flag = "✓" if result == "pass" else "⚠" if "2fa" in result else "✗"
        print(f"  {flag} {name:20s} → {result}")


if __name__ == "__main__":
    run_experiments()
