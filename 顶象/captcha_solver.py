"""Captcha fetch + restore + ddddocr solve + UA simulation."""

from __future__ import annotations

import json
import os
import random
import hashlib
import subprocess
import time
import urllib.parse
import urllib.request
from io import BytesIO
from typing import Any, Dict, List

from captcha_fetcher import (
    DEFAULT_APP_KEY,
    OUTPUT_DIR,
    download_image,
    fetch_captcha_config,
    generate_aid,
    restore_background,
)
from ua_simulator import UASimulator

CONSTID_URL = "https://constid.dingxiang-inc.com/udid/c1"
CONSTID_CACHE_PATH = os.path.join(OUTPUT_DIR, "constid_cache.json")
CONSTID_HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "simulate_constid_c1.js")
GEN_UA_HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", "gen_ua.js")
VERIFY_URL = "https://cap.dingxiang-inc.com/api/v1"


def build_drag_events(points: List[Dict[str, int]], step_ms: int = 16,
                      verify_x: int = 0, verify_y: int = 0) -> List[Dict[str, Any]]:
    """Mirror today's captured real flow:
      [hover MM(no target)] [drag-start MM(full target)]
      ... many recordSA ...
      [sendSA] [sendTemp{xpath,x,y,isTrusted}] [release MM]
    NO MD — basic-Captcha's slider doesn't call getMD.
    """
    if not points:
        return []
    events: List[Dict[str, Any]] = []
    target_full = "dx_captcha_basic_slider-img-focus_1"
    first = points[0]

    # Hover MM (no target) — fires before drag.
    events.append({"kind": "mm", "x": first["x"], "y": first["y"], "targetId": "",
                   "dt": random.randint(800, 1500)})
    # Drag-start MM with full target id.
    events.append({"kind": "mm", "x": first["x"], "y": first["y"], "targetId": target_full,
                   "dt": random.randint(20, 80)})
    # SA samples for the trajectory with HUMAN-LIKE variable timing.
    for pt in points[1:]:
        events.append({"kind": "sa", "x": pt["x"], "y": pt["y"], "dt": human_step_dt()})
    # Flush SAs.
    events.append({"kind": "sendSA", "dt": random.randint(50, 120)})
    # sendTemp — must include xpath/x/y/isTrusted exactly like real flow.
    events.append({"kind": "temp", "body": {
        "xpath": "/html/body/div",
        "x": verify_x or points[-1]["x"],
        "y": verify_y or points[-1]["y"],
        "isTrusted": True,
    }, "dt": random.randint(10, 40)})
    # Release MM after sendTemp (real flow has a final MM at dt~3311).
    last = points[-1]
    events.append({"kind": "mm", "x": last["x"], "y": last["y"], "targetId": "",
                   "dt": random.randint(50, 150)})
    return events


REAL_BODY_PATH = "/tmp/dx_compare/real_body.html"
REAL_HEAD_PATH = "/tmp/dx_compare/real_head.html"


def gen_ua_via_sidecar(token: str, events: List[Dict[str, Any]], start_time_ms: int,
                       pre_init_ms: int = 800) -> str:
    # Load real captcha-ui DOM if cached.
    real_body = real_head = None
    if os.path.exists(REAL_BODY_PATH):
        with open(REAL_BODY_PATH) as f:
            real_body = f.read()
    if os.path.exists(REAL_HEAD_PATH):
        with open(REAL_HEAD_PATH) as f:
            real_head = f.read()

    spec = {
        "token": token,
        "events": events,
        "startTime": start_time_ms,
        "preInitMs": pre_init_ms,
        "realBody": real_body,
        "realHead": real_head,
        "env": {
            "userAgent": (
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
            ),
            "href": "https://cdn.dingxiang-inc.com/",
            "referrer": "https://cdn.dingxiang-inc.com/",
        },
    }
    result = subprocess.run(
        ["node", GEN_UA_HELPER],
        input=json.dumps(spec).encode("utf-8"),
        capture_output=True,
        timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gen_ua.js failed: {result.stderr.decode('utf-8', 'replace')}")
    payload = json.loads(result.stdout.decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"gen_ua.js error: {payload}")
    return payload["ua"]


def image_to_png_bytes(image) -> bytes:
    buf = BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def solve_slider_x(slider_bytes: bytes, bg_restored_bytes: bytes) -> int:
    """Edge-based template match — robust against decoy shapes that ddddocr
    confuses with the real gap. Returns gap X in display (300px) coords."""
    import cv2
    import numpy as np
    from PIL import Image as _Image

    bg_arr = cv2.imdecode(np.frombuffer(bg_restored_bytes, np.uint8), cv2.IMREAD_COLOR)
    bg_w = bg_arr.shape[1]

    sl_pil = _Image.open(BytesIO(slider_bytes)).convert("RGBA")
    bbox = sl_pil.split()[-1].getbbox()
    sl_cropped = sl_pil.crop(bbox) if bbox else sl_pil
    sl_arr = np.array(sl_cropped)
    sl_rgb = cv2.cvtColor(sl_arr[:, :, :3], cv2.COLOR_RGB2BGR)

    bg_edge = cv2.Canny(cv2.cvtColor(bg_arr, cv2.COLOR_BGR2GRAY), 100, 200)
    sl_edge = cv2.Canny(cv2.cvtColor(sl_rgb, cv2.COLOR_BGR2GRAY), 100, 200)

    res = cv2.matchTemplate(bg_edge, sl_edge, cv2.TM_CCOEFF_NORMED)
    _, _, _, max_loc = cv2.minMaxLoc(res)
    gap_native_x = max_loc[0]
    display_x = int(round(gap_native_x * 300.0 / bg_w))
    print(f"[ocr] bg_w={bg_w} gap_native={gap_native_x} display_x={display_x}")
    return display_x


def make_local_id(length: int = 32) -> str:
    chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    return "".join(random.choice(chars) for _ in range(length))


def load_constid_cache() -> Dict[str, str]:
    if not os.path.exists(CONSTID_CACHE_PATH):
        return {}
    try:
        with open(CONSTID_CACHE_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            return {str(k): str(v) for k, v in data.items() if isinstance(v, (str, int))}
    except Exception:
        pass
    return {}


def save_constid_cache(cache: Dict[str, str]) -> None:
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(CONSTID_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)


def build_detect_short_payload(
    *,
    href: str = "https://cdn.dingxiang-inc.com/",
    referrer: str = "https://cdn.dingxiang-inc.com/",
    title: str = "captcha",
    timezone_name: str = "Asia/Shanghai",
    timezone_offset: int = -480,
) -> Dict[str, Any]:
    now_ms = int(time.time() * 1000)
    cpu_count = os.cpu_count() or 8
    unknown_fp_hash = hashlib.md5("unknown".encode("utf-8")).hexdigest()
    high_entropy_values = {
        "architecture": "x86",
        "bitness": "64",
        "model": "",
        "platformVersion": "6.0.0",
        "fullVersionList": [
            {"brand": "Google Chrome", "version": "143.0.0.0"},
            {"brand": "Chromium", "version": "143.0.0.0"},
            {"brand": "Not A(Brand", "version": "24.0.0.0"},
        ],
    }
    user_agent_data = {
        "brands": [
            {"brand": "Google Chrome", "version": "143"},
            {"brand": "Chromium", "version": "143"},
            {"brand": "Not A(Brand", "version": "24"},
        ],
        "mobile": False,
        "platform": "Linux",
    }
    # 按前端 detector 的字段顺序构造，顺序会影响 Param 编码。
    return {
        "can": unknown_fp_hash,
        "cpt": "probably;probably;maybe;;;;probably;probably;maybe;maybe;",
        "web": unknown_fp_hash,
        "gi": (
            "Google Inc. (Google);ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) "
            "(0x0000C0DE)), SwiftShader driver);WebKit WebGL;WebKit;"
            "WebGL 1.0 (OpenGL ES 2.0 Chromium);WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium);16384;"
            "ANGLE_instanced_arrays,EXT_blend_minmax,OES_element_index_uint,WEBGL_debug_renderer_info"
        ),
        "pr": 1,
        "dm": 8,
        "jf": "Arial Unicode MS;Calibri;Century Gothic;Gill Sans;Helvetica Neue;Menlo",
        "cc": "unknown",
        "hc": cpu_count,
        "ua": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
        ),
        "uad": json.dumps(user_agent_data, separators=(",", ":")),
        "hev": json.dumps(high_entropy_values, separators=(",", ":")),
        "np": "Linux x86_64",
        "lug": "zh-CN",
        "ce": 1,
        "netType": "4g",
        "ts": "0;false;false",
        "tz": timezone_name,
        "to": timezone_offset,
        "ls": 1,
        "ss": 1,
        "ind": 1,
        "ab": 0,
        "od": 0,
        "cd": 24,
        "res": "1920;1080",
        "ar": "1920;1032",
        "vs": "1365;947",
        "ws": "1365;1024",
        "rp": "PDF Viewer;Chrome PDF Viewer;Chromium PDF Viewer;Microsoft Edge PDF Viewer;WebKit built-in PDF",
        "adb": False,
        "hl": 6,
        "cl": 1,
        "st": 12,
        "dt": title,
        "url": href,
        "bl": 0,
        "hdl": 0,
        "dr": referrer,
        "xp": "",
        "in": 0,
        "hsl": 4294705152,
        "qu": 12884901888,
        "bt": now_ms,
        "ct": random.randint(3, 12),
        "hlb": False,
        "hll": False,
        "hlo": False,
        "hlr": False,
        "db": 0,
        "sm": 0,
        "pro": 0,
    }


def build_constid_request(
    *,
    stage: str,
    app_id: str,
    lid: str,
    token: str = "",
    scene: str = "",
    detect_payload: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    cmd = [
        "node",
        CONSTID_HELPER,
        "--stage",
        stage,
        "--appId",
        app_id,
        "--lid",
        lid,
    ]
    if token:
        cmd.extend(["--token", token])
    if scene:
        cmd.extend(["--scene", scene])
    if detect_payload:
        cmd.extend(["--detectorJson", json.dumps(detect_payload, ensure_ascii=False, separators=(",", ":"))])

    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def call_constid(request_meta: Dict[str, Any]) -> Dict[str, Any]:
    request_info = request_meta["request"]
    url = request_info["url"]
    if request_info.get("query"):
        url += "?" + urllib.parse.urlencode(request_info["query"])

    body = None
    method = request_info.get("method", "GET").upper()
    if method == "POST" and request_info.get("body"):
        body = urllib.parse.urlencode(request_info["body"]).encode("utf-8")
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            **request_info["headers"],
        }
    else:
        headers = request_info["headers"]

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    opener = _build_opener()
    with opener.open(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def get_constid_token(app_id: str, scene: str = "") -> str:
    cache = load_constid_cache()
    lid = os.environ.get("CONSTID_LID") or cache.get("lid") or f"{int(time.time() * 1000)}{make_local_id()}"
    token = os.environ.get("CONSTID_TOKEN") or cache.get("token") or ""

    if token:
        request_meta = build_constid_request(stage="prequest", app_id=app_id, lid=lid, token=token, scene=scene)
        result = call_constid(request_meta)
        if result.get("status") in (1, 2) and result.get("data"):
            cache.update({"lid": lid, "token": str(result["data"])})
            save_constid_cache(cache)
            return str(result["data"])
        print(f"[constid] 旧 token 校验失败: {result}")

    prequest_meta = build_constid_request(stage="prequest", app_id=app_id, lid=lid, scene=scene)
    result = call_constid(prequest_meta)
    if result.get("status") == -4 and result.get("data"):
        lid = str(result["data"])
        cache["lid"] = lid
        save_constid_cache(cache)
        print(f"[constid] prequest 拿到新 lid: {lid}")
        detect_payload = build_detect_short_payload()
        detect_meta = build_constid_request(
            stage="detect",
            app_id=app_id,
            lid=lid,
            scene=scene,
            detect_payload=detect_payload,
        )
        detect_result = call_constid(detect_meta)
        if detect_result.get("status") in (1, 2) and detect_result.get("data"):
            cache.update({"lid": lid, "token": str(detect_result["data"])})
            save_constid_cache(cache)
            return str(detect_result["data"])
        print(f"[constid] detect 未拿到 token: {detect_result}")
        return ""
    if result.get("status") in (1, 2) and result.get("data"):
        cache.update({"lid": lid, "token": str(result["data"])})
        save_constid_cache(cache)
        return str(result["data"])

    detect_payload = build_detect_short_payload()
    detect_meta = build_constid_request(
        stage="detect",
        app_id=app_id,
        lid=lid,
        scene=scene,
        detect_payload=detect_payload,
    )
    detect_result = call_constid(detect_meta)
    if detect_result.get("status") in (1, 2) and detect_result.get("data"):
        cache.update({"lid": lid, "token": str(detect_result["data"])})
        save_constid_cache(cache)
        return str(detect_result["data"])
    print(f"[constid] c1 返回未命中 token 分支: prequest={result}, detect={detect_result}")
    return ""



def generate_drag_points(
    start_x: int,
    target_x: int,
    y: int,
    min_steps: int = 50,
    max_steps: int = 80,
) -> List[Dict[str, int]]:
    """Generate human-like drag trajectory with overshoot+return.

    Modeled after captured real slides which had:
      * Variable inter-step delay (8-180ms) — speed bursts then pauses
      * Cubic acceleration / cruise / deceleration phases
      * Overshoot past target by 5-15 px
      * Brief pause at peak (50-200ms)
      * Slow return back by 5-15 px to land on target
      * Y jitter ±1-2 px throughout
    """
    distance = max(0, int(target_x) - int(start_x))
    start_x = int(start_x)
    y = int(y)
    if distance <= 0:
        return [{"x": start_x, "y": y}]

    points: List[Dict[str, int]] = [{"x": start_x, "y": y}]

    # === PHASE 1: forward swing past target (overshoot 4-12 px) ===
    overshoot = random.randint(4, 12)
    peak_x = target_x + overshoot

    # cubic ease-in-out for forward phase
    forward_steps = random.randint(35, 55)
    for i in range(1, forward_steps + 1):
        t = i / forward_steps
        # ease-in-out cubic
        eased = 4 * t**3 if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2
        x = start_x + eased * (peak_x - start_x)
        # micro-jitter from neuro-muscular noise
        x += random.uniform(-0.4, 0.4)
        jitter_y = y + random.choice([0, 0, 0, 0, 1, -1, 1, -1, 2, -2])
        points.append({"x": int(round(x)), "y": int(jitter_y)})

    # Make sure peak reached
    if points[-1]["x"] < peak_x:
        points.append({"x": peak_x, "y": y + random.choice([0, 1, -1])})

    # === PHASE 2: brief pause at peak (just no movement, but emit a few duplicated samples) ===
    pause_samples = random.randint(0, 2)
    for _ in range(pause_samples):
        points.append({"x": peak_x, "y": y + random.choice([0, 1, -1])})

    # === PHASE 3: slow return from peak back to target ===
    return_steps = random.randint(4, 10)
    for i in range(1, return_steps + 1):
        t = i / return_steps
        # ease-out for return (slow down as approaching target)
        eased = 1 - (1 - t) ** 2
        x = peak_x - eased * (peak_x - target_x)
        x += random.uniform(-0.3, 0.3)
        jitter_y = y + random.choice([0, 0, 0, 1, -1])
        points.append({"x": int(round(x)), "y": int(jitter_y)})

    # === PHASE 4: settle (1-3 samples at target) ===
    settle = random.randint(1, 3)
    for _ in range(settle):
        points.append({"x": target_x, "y": y + random.choice([0, 0, 1, -1])})

    return points


def human_step_dt() -> int:
    """Sample inter-step dt with realistic distribution.

    Real captures had:
      * Most dt = 10-25 ms (~70% of samples)
      * Occasional 30-80 ms (cruise breath)
      * Rare 100-200 ms pauses (thinking)
    """
    r = random.random()
    if r < 0.70:
        return random.randint(10, 25)
    if r < 0.92:
        return random.randint(28, 70)
    if r < 0.98:
        return random.randint(80, 150)
    return random.randint(150, 220)


def _build_opener():
    proxy = os.environ.get("DX_PROXY") or os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
    if not proxy:
        return urllib.request.build_opener()
    handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    return urllib.request.build_opener(handler)


def verify_captcha(ac, ak, sid, aid, x, y, c="", jsv="1.5.46.2"):
    """提交验证结果到 /api/v1"""
    post_data = urllib.parse.urlencode({
        "ac": ac,
        "ak": ak,
        "c": c,
        "uid": "",
        "jsv": jsv,
        "sid": sid,
        "aid": aid,
        "x": x,
        "y": y,
    }).encode("utf-8")

    headers = {
        "Content-type": "application/x-www-form-urlencoded",
        "Origin": "https://cdn.dingxiang-inc.com",
        "Referer": "https://cdn.dingxiang-inc.com/",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    }

    req = urllib.request.Request(VERIFY_URL, data=post_data, headers=headers)
    opener = _build_opener()
    with opener.open(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body)


def run_once() -> Dict[str, Any]:
    aid = generate_aid()

    print("[1] 获取验证码配置...")
    config = fetch_captcha_config()
    if not config.get("success") or config.get("result") != 1:
        raise RuntimeError(f"获取验证码失败: {config}")

    cid = config["cid"]
    sid = config.get("sid", "")
    print(f"[1] sid={sid}, cid={cid}, y={config.get('y')}")

    print("[2] 下载背景图与滑块图...")
    bg_path, bg_bytes = download_image(config["p1"], f"bg_{cid}.webp")
    slider_path, slider_bytes = download_image(config["p2"], f"slider_{cid}.webp")

    print("[3] 还原背景图...")
    seed = os.path.basename(config["p1"]).split(".")[0]
    restored_img, ranges = restore_background(bg_bytes, seed)
    bg_restored_path = os.path.join(OUTPUT_DIR, f"bg_{cid}_restored.png")
    restored_img.save(bg_restored_path)
    bg_restored_bytes = image_to_png_bytes(restored_img)
    print(f"[3] seed={seed}")
    print(f"[3] ranges={ranges}")
    print(f"[3] restored={bg_restored_path}")

    print("[4] ddddocr 识别滑块 X 坐标...")
    target_x = solve_slider_x(slider_bytes, bg_restored_bytes)
    print(f"[4] slide target x = {target_x}")

    print("[5] 生成自然拖动轨迹并通过 Node sidecar 生成 UA...")
    start_y = int(config.get("y", 0))
    points = generate_drag_points(start_x=0, target_x=target_x, y=start_y)
    step_ms = random.randint(14, 22)
    events = build_drag_events(points, step_ms=step_ms, verify_x=target_x, verify_y=start_y)
    start_time_ms = int(time.time() * 1000) - random.randint(900, 1800)
    # Real flow: greenseer is loaded ~80 seconds before user starts sliding.
    # Sidecar must mirror that elapsed window so encrypted timestamps match
    # what the server expects.
    pre_init_ms = random.randint(60_000, 100_000)
    ua = gen_ua_via_sidecar(token=sid, events=events, start_time_ms=start_time_ms,
                            pre_init_ms=pre_init_ms)
    print(f"[5] 轨迹点数量: {len(points)}, 事件数: {len(events)}")
    print(f"[5] UA 长度: {len(ua)}")

    print("[5.5] 获取 constid token ...")
    constid_token = get_constid_token(app_id=DEFAULT_APP_KEY)
    if constid_token:
        print(f"[5.5] constid token 长度: {len(constid_token)}")
    else:
        print("[5.5] 当前未拿到 constid token，/api/v1 的 c 将为空")

    print("[6] 提交验证 POST /api/v1 ...")
    verify_result = verify_captcha(
        ac=ua,
        ak=DEFAULT_APP_KEY,
        sid=sid,
        aid=aid,
        x=target_x,
        y=config.get("y", 0),
        c=constid_token,
    )
    print(f"[6] 验证响应: {json.dumps(verify_result, indent=2, ensure_ascii=False)}")

    return {
        "sid": sid,
        "cid": cid,
        "aid": aid,
        "target_x": target_x,
        "constid_token": constid_token,
        "ua": ua,
        "verify_result": verify_result,
        "points": points,
        "bg_path": bg_path,
        "bg_restored_path": bg_restored_path,
        "slider_path": slider_path,
    }


def main() -> None:
    result = run_once()
    print("\n[7] 完成")
    print(f"sid: {result['sid']}")
    print(f"cid: {result['cid']}")
    print(f"aid: {result['aid']}")
    print(f"target_x: {result['target_x']}")
    success = result["verify_result"].get("success", False)
    print(f"验证结果: {'通过 ✓' if success else '失败 ✗'}")
    print(f"响应详情: {result['verify_result']}")


if __name__ == "__main__":
    main()
