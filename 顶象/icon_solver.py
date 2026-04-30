"""DingXiang icon-click 二次验证 solver.

Flow when /api/v1 returns msg=='二次验证' with sv.type==3:
  1. Download tp1 background image (5 icons embedded on noisy bg).
  2. Download the 4 reference icons listed in sv.icons (the ones to click in order).
  3. Use OpenCV template-match each reference icon against tp1 → 4 (x, y) centers.
  4. Generate UA via sidecar with `ca` events for each click + `sendCA`.
  5. POST to /api/v3 (icon-click) with the new UA + sv.sid as `sid`.

For type 1 clickword: same flow but tp1 is a sentence image, cw is character
hit-list, POST goes to /api/v2.

Usage:
    from icon_solver import solve_secondary_verification
    result = solve_secondary_verification(sv_resp, ak, original_aid, jsv,
                                          constid, ua_simulator_factory)
"""
from __future__ import annotations

import base64
import json
import os
import random
import subprocess
import time
import urllib.parse
import urllib.request
from io import BytesIO
from typing import Any, Dict, List, Tuple

import numpy as np
from PIL import Image

from captcha_solver import IDENTITY

CDN_BASE = "https://static4.dingxiang-inc.com/picture"
VERIFY_V2_URL = "https://cap.dingxiang-inc.com/api/v2"  # clickword type 1
VERIFY_V3_URL = "https://cap.dingxiang-inc.com/api/v3"  # icon-click type 3
GEN_UA_HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", "gen_ua.js")


def fetch_bytes(url: str) -> bytes:
    proxy = os.environ.get("DX_PROXY") or os.environ.get("HTTPS_PROXY")
    if proxy:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    else:
        opener = urllib.request.build_opener()
    with opener.open(url, timeout=15) as r:
        return r.read()


def find_icon_centers(tp1_bytes: bytes, icon_paths: List[str]) -> List[Tuple[int, int]]:
    """Locate each reference icon's center in the tp1 background, returning a list
    of (offset_x, offset_y) in tp1 display coordinates (likely matching what
    real recordCA fires with — i.e. coords relative to the tp1 image element)."""
    import cv2

    # Decode tp1 (background)
    bg = cv2.imdecode(np.frombuffer(tp1_bytes, np.uint8), cv2.IMREAD_COLOR)
    bg_gray = cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY)
    bg_h, bg_w = bg.shape[:2]
    print(f"[icon] tp1 size: {bg_w}x{bg_h}")

    # bg may need restore similar to slider — but icon-click bg is usually
    # NOT scrambled (no seed-based rearrangement). We treat raw image as-is.

    centers: List[Tuple[int, int]] = []
    for path in icon_paths:
        # icon paths look like /icon/280.png — full URL via CDN_BASE
        if path.startswith("/icon"):
            url = CDN_BASE + path
        elif path.startswith("/"):
            url = CDN_BASE + path
        else:
            url = path
        ic_raw = fetch_bytes(url)
        ic_pil = Image.open(BytesIO(ic_raw)).convert("RGBA")
        # Crop to alpha bbox so we match the visible icon only
        bbox = ic_pil.split()[-1].getbbox()
        if bbox:
            ic_pil = ic_pil.crop(bbox)
        ic_arr = np.array(ic_pil)
        # Icons are BLACK on transparent. The shape is given by the alpha
        # channel — we use that directly as our binary template, since
        # tp1 shows WHITE silhouettes on a noisy background.
        alpha = ic_arr[:, :, 3]
        # Native template = alpha as binary mask
        ic_gray = alpha
        ic_h, ic_w = ic_gray.shape

        # Threshold bg: extract white icon silhouettes from noisy background
        _, bg_bin = cv2.threshold(bg_gray, 200, 255, cv2.THRESH_BINARY)

        best = (-1.0, 0, 0, ic_w, ic_h)
        # Sweep scales; tp1 icons are roughly 30-40 px wide, native icon ~110.
        for scale_pct in range(22, 50, 2):
            scale = scale_pct / 100.0
            new_w = max(10, int(round(ic_w * scale)))
            new_h = max(10, int(round(ic_h * scale)))
            if new_w >= bg_w - 2 or new_h >= bg_h - 2:
                continue
            tpl_alpha = cv2.resize(ic_gray, (new_w, new_h))
            _, tpl_bin = cv2.threshold(tpl_alpha, 128, 255, cv2.THRESH_BINARY)
            # Skip degenerate templates (all zero or near-zero) which match anywhere
            if tpl_bin.sum() < 100:
                continue
            try:
                res = cv2.matchTemplate(bg_bin, tpl_bin, cv2.TM_CCOEFF_NORMED)
            except cv2.error:
                continue
            res = np.where(np.isfinite(res), res, 0)
            _, mx, _, ml = cv2.minMaxLoc(res)
            if mx > best[0]:
                best = (mx, ml[0], ml[1], new_w, new_h)
        score, x, y, w, h = best
        cx, cy = x + w // 2, y + h // 2
        print(f"[icon] {path}: score={score:.3f} top-left=({x},{y}) size={w}x{h} center=({cx},{cy})")
        centers.append((cx, cy))
    return centers


def _preprocess_clickword(tp1_bytes: bytes) -> bytes:
    """Enhance clickword image: isolate characters from colored background."""
    import cv2
    arr = cv2.imdecode(np.frombuffer(tp1_bytes, np.uint8), cv2.IMREAD_COLOR)
    hsv = cv2.cvtColor(arr, cv2.COLOR_BGR2HSV)
    # The background is a uniform color (green/blue/red). Characters are
    # white/yellow/contrasting. Extract non-background pixels.
    # Saturation-based: bg is saturated, chars are light/desaturated
    _, sat_mask = cv2.threshold(hsv[:, :, 1], 80, 255, cv2.THRESH_BINARY_INV)
    # Value-based: chars tend to be bright
    _, val_mask = cv2.threshold(hsv[:, :, 2], 160, 255, cv2.THRESH_BINARY)
    # Combine: pixels that are either desaturated OR very bright
    mask = cv2.bitwise_or(sat_mask, val_mask)
    # Clean up with morphology
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    # Create white-on-black output
    result = np.zeros_like(arr)
    result[mask > 0] = [255, 255, 255]
    _, buf = cv2.imencode('.png', result)
    return buf.tobytes()


def find_clickword_centers(tp1_bytes: bytes, target_chars: List[str]) -> List[Tuple[int, int]]:
    """Locate each target Chinese character in tp1.
    Tries PaddleOCR first (better for Chinese), falls back to ddddocr."""
    char_map: Dict[str, Tuple[int, int]] = {}

    try:
        from paddleocr import PaddleOCR
        ocr = PaddleOCR(lang='ch', use_textline_orientation=True)
        bg = Image.open(BytesIO(tp1_bytes))
        img_arr = np.array(bg.convert("RGB"))
        results = ocr.predict(img_arr)
        for result in results:
            det_count = len(result.get("rec_texts", []))
            print(f"[clickword] PaddleOCR detected {det_count} text regions")
            boxes = result.get("dt_polys", [])
            texts = result.get("rec_texts", [])
            scores = result.get("rec_scores", [])
            for i, (box_pts, text, conf) in enumerate(zip(boxes, texts, scores)):
                xs = [p[0] for p in box_pts]
                ys = [p[1] for p in box_pts]
                cx = int(sum(xs) / len(xs))
                cy = int(sum(ys) / len(ys))
                print(f"  paddle: text={text!r} conf={conf:.2f} center=({cx},{cy})")
                for ch in text:
                    if ch and ch not in char_map:
                        char_map[ch] = (cx, cy)
    except ImportError:
        pass

    # Fallback / supplement with ddddocr
    if not all(c in char_map for c in target_chars):
        import ddddocr
        det = ddddocr.DdddOcr(det=True, show_ad=False)
        boxes = det.detection(tp1_bytes)
        print(f"[clickword] ddddocr detected {len(boxes)} text boxes")
        if boxes:
            ocr_d = ddddocr.DdddOcr(show_ad=False)
            enhanced = _preprocess_clickword(tp1_bytes)
            bg_enhanced = Image.open(BytesIO(enhanced))
            bg_orig = Image.open(BytesIO(tp1_bytes))
            for box in boxes:
                x1, y1, x2, y2 = box
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                # Try both original and enhanced crops
                best_ch = ""
                for src in [bg_orig, bg_enhanced]:
                    crop = src.crop((x1, y1, x2, y2))
                    buf = BytesIO()
                    crop.save(buf, format='PNG')
                    ch = ocr_d.classification(buf.getvalue())
                    if ch and len(ch) == 1:
                        best_ch = ch
                        break
                    if ch and not best_ch:
                        best_ch = ch
                print(f"  ddddocr: box=({x1},{y1},{x2},{y2}) center=({cx},{cy}) char={best_ch!r}")
                if best_ch and best_ch not in char_map:
                    char_map[best_ch] = (cx, cy)

    print(f"[clickword] char_map: {char_map}")
    centers = []
    for c in target_chars:
        if c in char_map:
            centers.append(char_map[c])
        else:
            print(f"  WARN: char {c!r} not found in OCR results")
            # Pick unused box center as fallback
            used = set(centers)
            all_centers = list(char_map.values())
            unused = [p for p in all_centers if p not in used]
            if unused:
                centers.append(unused[0])
            else:
                raise RuntimeError(f"no position found for char {c!r}")
    return centers


def gen_ua_with_clicks(token: str, click_centers: List[Tuple[int, int]],
                       start_time_ms: int, pre_init_ms: int = 80000,
                       hover_x: int = 0, hover_y: int = 0) -> str:
    """Build UA matching real captured v2 structure:
      hover MM → per click (MM + MD + recordCA + TEMP + LO) → sendCA at end.

    Real v2 had: each click produces an 8B MD segment, TEMP/LO between clicks,
    and a single large CA segment (~341B) flushed at the very end."""
    events = [
        {"kind": "mm", "x": hover_x, "y": hover_y, "targetId": "", "dt": random.randint(800, 1500)},
    ]
    for i, (cx, cy) in enumerate(click_centers):
        events.append({"kind": "mm", "x": cx, "y": cy, "targetId": "", "dt": random.randint(300, 800)})
        events.append({"kind": "md", "x": cx, "y": cy, "button": 0, "targetId": "", "dt": random.randint(30, 100)})
        events.append({"kind": "ca", "x": cx, "y": cy, "dt": random.randint(5, 20)})
        events.append({"kind": "temp", "body": {
            "xpath": "/html/body/div",
            "x": cx, "y": cy, "isTrusted": True,
        }, "dt": random.randint(10, 40)})
        if i < len(click_centers) - 1:
            events.append({"kind": "mm", "x": cx + random.randint(-5, 5),
                           "y": cy + random.randint(-3, 3), "targetId": "", "dt": random.randint(50, 200)})
    events.append({"kind": "sendCA", "dt": random.randint(20, 60)})

    I = IDENTITY
    spec = {
        "token": token,
        "events": events,
        "startTime": start_time_ms,
        "preInitMs": pre_init_ms,
        "env": {
            "userAgent": I["ua"],
            "href": I["href"],
            "referrer": I["referrer"],
            "platform": I["platform"],
            "screenW": I["screen_w"],
            "screenH": I["screen_h"],
            "availW": I["avail_w"],
            "availH": I["avail_h"],
            "innerW": I["inner_w"],
            "innerH": I["inner_h"],
            "outerW": I["outer_w"],
            "outerH": I["outer_h"],
        },
    }
    result = subprocess.run(
        ["node", GEN_UA_HELPER],
        input=json.dumps(spec).encode("utf-8"),
        capture_output=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gen_ua.js failed: {result.stderr.decode()}")
    payload = json.loads(result.stdout.decode())
    if not payload.get("ok"):
        raise RuntimeError(f"gen_ua.js error: {payload}")
    return payload["ua"]


def submit_secondary(ac: str, ak: str, c: str, sid: str, aid: str,
                     captcha_type: int, jsv: str = "1.5.46.2") -> Dict[str, Any]:
    """POST to /api/v2 (clickword) or /api/v3 (icon-click)."""
    url = VERIFY_V3_URL if captcha_type == 3 else VERIFY_V2_URL
    body = urllib.parse.urlencode({
        "ac": ac, "ak": ak, "c": c, "uid": "",
        "jsv": jsv, "sid": sid, "aid": aid, "type": captcha_type,
    }).encode("utf-8")
    headers = {
        "Content-type": "application/x-www-form-urlencoded",
        "Origin": IDENTITY["href"].rstrip("/"),
        "Referer": IDENTITY["referrer"],
        "User-Agent": IDENTITY["ua"],
    }
    proxy = os.environ.get("DX_PROXY") or os.environ.get("HTTPS_PROXY")
    if proxy:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
    else:
        opener = urllib.request.build_opener()
    req = urllib.request.Request(url, data=body, headers=headers)
    with opener.open(req, timeout=15) as r:
        return json.loads(r.read().decode())


def solve_secondary_verification(sv: Dict[str, Any], ak: str, constid: str,
                                  original_aid: str | None = None) -> Dict[str, Any]:
    """Main entry point. sv is the `sv` field returned by /api/v1 with msg=='二次验证'.
    original_aid: reuse the aid from the v1 submission for session continuity."""
    captcha_type = sv.get("type")
    sv_sid = sv.get("sid")
    if captcha_type == 3:
        icons_str = sv.get("icons") or ""
        icons = json.loads(icons_str) if icons_str else []
        if not icons:
            raise RuntimeError("type=3 but no icons in sv")
        tp1_url = CDN_BASE + sv["tp1"]
        print(f"[2fa] downloading tp1: {tp1_url}")
        tp1_bytes = fetch_bytes(tp1_url)
        os.makedirs("/tmp/dx_icon", exist_ok=True)
        with open("/tmp/dx_icon/last_tp1.webp", "wb") as f:
            f.write(tp1_bytes)
        centers = find_icon_centers(tp1_bytes, icons)
    elif captcha_type == 1:
        cw = sv.get("cw") or ""
        if not cw:
            raise RuntimeError("type=1 but no cw in sv")
        target_chars = list(cw)
        tp1_url = CDN_BASE + sv["tp1"]
        print(f"[2fa] downloading clickword tp1: {tp1_url}, chars to click in order: {target_chars}")
        tp1_bytes = fetch_bytes(tp1_url)
        os.makedirs("/tmp/dx_icon", exist_ok=True)
        with open("/tmp/dx_icon/last_clickword_tp1.webp", "wb") as f:
            f.write(tp1_bytes)
        centers = find_clickword_centers(tp1_bytes, target_chars)
    else:
        raise NotImplementedError(f"unknown 2fa type {captcha_type}")

    aid = original_aid or f"dx-{int(time.time()*1000)}-{random.randint(1, 99999999)}-2"
    start_ms = int(time.time() * 1000) - random.randint(800, 1500)
    ua = gen_ua_with_clicks(token=sv_sid, click_centers=centers,
                             start_time_ms=start_ms, pre_init_ms=random.randint(60000, 100000))
    print(f"[2fa] UA len: {len(ua)}")

    return submit_secondary(ac=ua, ak=ak, c=constid, sid=sv_sid, aid=aid,
                             captcha_type=captcha_type)


if __name__ == "__main__":
    # Test with cached sv data from earlier 二次验证
    sv = {
        "sid": "61ef117ad8c9b1f2495d31c3c0e38534",
        "type": 3,
        "tp1": "/dx/QzedfuO1tp/icutc/192fb0309a4f4458bba9cf79d8d5f2ac.webp",
        "icons": '["/icon/280.png","/icon/337.png","/icon/394.png","/icon/142.png"]',
    }
    import sys
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from captcha_solver import DEFAULT_APP_KEY, get_constid_token

    constid = get_constid_token(app_id=DEFAULT_APP_KEY)
    try:
        result = solve_secondary_verification(sv, DEFAULT_APP_KEY, constid)
        print("\n[result]", json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"\n[err] {e}")
