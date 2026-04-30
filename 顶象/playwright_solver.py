"""DingXiang slider captcha solver using Playwright + ddddocr.

Drives a real Chromium so greenseer.js runs natively (avoiding the jsdom
state-mismatch problem). Reads the slider images through Playwright,
solves target_x with ddddocr, then simulates a human-like drag.
"""

from __future__ import annotations

import math
import os
import random
import sys
import time
from io import BytesIO
from typing import Dict, List, Optional

from playwright.sync_api import sync_playwright, Page

CHROMIUM_PATH = "/usr/bin/chromium"
APP_KEY = "12610a3853150e888ccd0c6d4c415626"
TEST_PAGE_HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>DX</title></head>
<body style="margin:0;padding:20px;font-family:sans-serif">
<div id="captcha"></div>
<pre id="log"></pre>
<script src="https://cdn.dingxiang-inc.com/ctu-group/captcha-ui/index.js"></script>
<script>
window.__token = null;
window.__verifyResp = null;
const log = (...a) => { document.getElementById('log').textContent += a.join(' ') + '\\n'; };
const _origFetch = window.fetch.bind(window);
const _origOpen = XMLHttpRequest.prototype.open;
const _origSend = XMLHttpRequest.prototype.send;
window.__cap = [];
XMLHttpRequest.prototype.open = function(m, u){ this.__u = u; return _origOpen.apply(this, arguments); };
XMLHttpRequest.prototype.send = function(b){
  const u = this.__u || '';
  if (u.indexOf('/api/') !== -1) {
    const rec = {url: u, body: typeof b === 'string' ? b : ''};
    this.addEventListener('load', () => { rec.resp = this.responseText; window.__cap.push(rec); });
  }
  return _origSend.apply(this, arguments);
};

function init() {
  if (!window._dx || !window._dx.Captcha) { setTimeout(init, 100); return; }
  log('SDK ready');
  window._cap = window._dx.Captcha(document.getElementById('captcha'), {
    appId: %APP_KEY%,
    style: 'embed',
    success: function(t){ window.__token = t; log('SUCCESS', t); },
    fail:    function(e){ window.__verifyResp = e; log('FAIL', JSON.stringify(e)); }
  });
}
init();
</script>
</body></html>
""".replace("%APP_KEY%", repr(APP_KEY))


def solve_target_x(bg_bytes: bytes, slider_bytes: bytes) -> int:
    """Edge-based template match. Avoids decoy-shape confusion that ddddocr
    suffers on 顶象 captchas with two similar shapes."""
    import cv2
    import numpy as np
    from PIL import Image as _Image

    bg_arr = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), cv2.IMREAD_COLOR)
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
    print(f"[edge] bg_w={bg_w} gap_native={gap_native_x} display_x={display_x}")
    return display_x


def _human_trajectory(distance: int) -> List[int]:
    """Same generator as sidecar's generate_drag_points, returning flat
    list of cumulative x offsets (0..distance with overshoot/return/settle)."""
    if distance <= 0:
        return [0]

    pts: List[int] = [0]
    overshoot = random.randint(4, 12)
    peak = distance + overshoot

    forward_steps = random.randint(35, 55)
    for i in range(1, forward_steps + 1):
        t = i / forward_steps
        eased = 4 * t**3 if t < 0.5 else 1 - ((-2 * t + 2) ** 3) / 2
        x = eased * peak + random.uniform(-0.4, 0.4)
        pts.append(int(round(x)))
    if pts[-1] < peak:
        pts.append(peak)

    for _ in range(random.randint(0, 2)):
        pts.append(peak)

    return_steps = random.randint(4, 10)
    for i in range(1, return_steps + 1):
        t = i / return_steps
        eased = 1 - (1 - t) ** 2
        x = peak - eased * (peak - distance) + random.uniform(-0.3, 0.3)
        pts.append(int(round(x)))

    for _ in range(random.randint(1, 3)):
        pts.append(distance)

    cleaned: List[int] = []
    for v in pts:
        if cleaned and v == cleaned[-1]:
            continue
        cleaned.append(max(0, v))
    return cleaned


def _human_step_dt() -> float:
    """Inter-step sleep matching captured real distribution."""
    r = random.random()
    if r < 0.70:
        return random.uniform(0.010, 0.025)
    if r < 0.92:
        return random.uniform(0.028, 0.070)
    if r < 0.98:
        return random.uniform(0.080, 0.150)
    return random.uniform(0.150, 0.220)


def human_drag(page: Page, handle_box: Dict[str, float], distance: int) -> None:
    """Realistic human drag: hover into element first, then mousedown ON the
    slider, then drag with ease-in-out + overshoot + settle."""
    start_x = handle_box["x"] + handle_box["width"] / 2
    start_y = handle_box["y"] + handle_box["height"] / 2

    # Use Playwright Locator API so events are dispatched to the actual element
    # — not just at viewport coordinates that may miss the captcha's listeners.
    handle = page.locator(f'#{handle_box["id"]}').first
    handle.hover(force=True, position={"x": handle_box["width"] / 2, "y": handle_box["height"] / 2})
    time.sleep(random.uniform(0.20, 0.50))

    # Now use raw mouse for fine-grained control after the hover has aligned.
    page.mouse.down()
    time.sleep(random.uniform(0.06, 0.18))

    offsets = _human_trajectory(distance)
    for offset in offsets:
        jx = random.uniform(-0.5, 0.5)
        jy = random.uniform(-1.5, 1.5)
        page.mouse.move(start_x + offset + jx, start_y + jy, steps=1)
        time.sleep(_human_step_dt())

    time.sleep(random.uniform(0.15, 0.40))
    page.mouse.up()


def fetch_slider_geometry(page: Page) -> Dict[str, float]:
    """Locate the slider handle (the visible draggable button on the left of
    the slider track)."""
    handle = page.evaluate(
        """() => {
            // Try the most-visible candidates in order.
            const sels = [
                '[id^="dx_captcha_basic_slider_"]',
                '[id*="slider-img"]',
                '.dx_captcha_basic_slider',
                '.dx-captcha-slider',
            ];
            for (const sel of sels) {
                const el = document.querySelector(sel);
                if (!el) continue;
                const r = el.getBoundingClientRect();
                if (r.width > 5 && r.height > 5) {
                    return {x: r.x, y: r.y, width: r.width, height: r.height, id: el.id};
                }
            }
            return null;
        }"""
    )
    if not handle:
        raise RuntimeError("slider handle not found in DOM")
    return handle


def fetch_bg_and_slider(page: Page) -> Optional[Dict[str, bytes]]:
    """Pull the background and slider piece images via the captcha API state."""
    data = page.evaluate(
        """async () => {
            const bgImg = document.querySelector('[id*="state-img"]');
            const sliderImg = document.querySelector('[id*="slider-img"]');
            // Prefer to read raw URLs from the captcha widget if present.
            const cap = window._cap && window._cap._cpt && window._cap._cpt.container;
            const sd = cap ? cap.serverData : null;
            return {
                bg_url: sd && sd.p1 ? 'https://static4.dingxiang-inc.com/picture' + sd.p1 : null,
                slider_url: sd && sd.p2 ? 'https://static4.dingxiang-inc.com/picture' + sd.p2 : null,
                cid: sd ? sd.cid : null, sid: sd ? sd.sid : null,
            };
        }"""
    )
    if not data or not data.get("bg_url"):
        return None
    import urllib.request
    bg = urllib.request.urlopen(data["bg_url"], timeout=10).read()
    sl = urllib.request.urlopen(data["slider_url"], timeout=10).read()
    return {"bg": bg, "slider": sl, "cid": data.get("cid"), "sid": data.get("sid")}


def restore_background(bg_bytes: bytes, seed: str):
    """Reuse captcha_fetcher's restore_background."""
    from captcha_fetcher import restore_background as _rb
    return _rb(bg_bytes, seed)


def image_to_png_bytes(img) -> bytes:
    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def run_once() -> Dict[str, object]:
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=CHROMIUM_PATH,
            headless=False,
            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
        )
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"
            ),
        )
        page = context.new_page()
        # Use data: URL so we don't depend on filesystem paths.
        import base64 as _b
        data_url = "data:text/html;base64," + _b.b64encode(TEST_PAGE_HTML.encode()).decode()
        page.goto(data_url, wait_until="domcontentloaded")

        # Wait for captcha to either render slider OR auto-pass.
        # Use a more permissive selector + longer timeout.
        try:
            page.wait_for_function(
                """() => {
                    const s = document.querySelector('[id^="dx_captcha_basic_slider_"], [id*="slider-img"]');
                    if (s && s.getBoundingClientRect().width > 5) return true;
                    // auto-pass
                    if (window.__token) return true;
                    // 无感验证成功
                    if (document.querySelector('[class*="success"]')) return true;
                    return false;
                }""",
                timeout=30000,
            )
        except Exception:
            print("[!] wait_for slider/token timed out")

        time.sleep(random.uniform(0.5, 1.2))  # let captcha settle

        # Fetch bg + slider images for ddddocr.
        imgs = fetch_bg_and_slider(page)
        if not imgs:
            print("[!] no slider images — captcha may have auto-passed")
            token = page.evaluate("window.__token")
            return {"token": token, "auto_pass": True}

        seed = imgs["bg_url"].split("/")[-1].split(".")[0] if False else None
        # Restore background by deriving seed from URL filename
        # Get the bg URL fresh
        bg_url = page.evaluate("() => { const sd=window._cap._cpt.container.serverData; return sd ? sd.p1 : null; }")
        seed = os.path.basename(bg_url).split(".")[0]
        restored, _ranges = restore_background(imgs["bg"], seed)
        bg_png = image_to_png_bytes(restored)

        # Save images for inspection
        import os as _os
        _os.makedirs('/tmp/dx_debug', exist_ok=True)
        with open(f'/tmp/dx_debug/bg_{imgs["cid"]}.png', 'wb') as f:
            f.write(bg_png)
        with open(f'/tmp/dx_debug/slider_{imgs["cid"]}.webp', 'wb') as f:
            f.write(imgs["slider"])
        with open(f'/tmp/dx_debug/bg_raw_{imgs["cid"]}.webp', 'wb') as f:
            f.write(imgs["bg"])
        # Inspect captcha geometry for x calibration
        geom = page.evaluate("""() => {
            const out = {};
            ['[id*="state-img"]','[id*="slider-img"]:not([id*="focus"])','[id*="slider-img-focus"]',
             '[id^="dx_captcha_basic_slider_"]','canvas','[id*="bg"]'].forEach(sel => {
                document.querySelectorAll(sel).forEach((el, i) => {
                    const r = el.getBoundingClientRect();
                    out[el.id || sel + ':' + i] = {x:r.x, y:r.y, w:r.width, h:r.height, tag: el.tagName, src: el.src||el.currentSrc||null};
                });
            });
            return out;
        }""")
        print(f"[geom] {geom}")
        target_x_raw = solve_target_x(bg_png, imgs["slider"])
        # Slider piece padding inside the slider image — empirically the piece's
        # visible left edge sits ~3-6 px from the image's left edge, so we drag
        # slightly less than the gap's left.
        slider_piece_offset = int(os.environ.get("DX_SLIDER_OFFSET", "0"))
        target_x = max(0, target_x_raw - slider_piece_offset)
        print(f"[*] sid={imgs['sid']} target_x_raw={target_x_raw} drag={target_x}")

        # Get handle geometry, drag.
        handle = fetch_slider_geometry(page)
        print(f"[*] handle box: {handle}")

        # basic-Captcha SDK adds F=10 for TYPE_BASIC, so we must drag less to
        # compensate. Empirically server expects verify_x = real_gap (no +10).
        drag_distance = target_x - 10
        human_drag(page, handle, drag_distance)

        # Wait for verify to fire.
        try:
            page.wait_for_function(
                "window.__token != null || window.__verifyResp != null",
                timeout=20000,
            )
        except Exception:
            pass  # fall through to read whatever state we have
        token = page.evaluate("window.__token")
        fail = page.evaluate("window.__verifyResp")
        cap = page.evaluate("window.__cap")

        verify = next((c for c in cap if "/api/v1" in c.get("url", "")), None)
        verify_x = None
        if verify:
            from urllib.parse import parse_qs
            params = parse_qs(verify.get("body", ""))
            verify_x = params.get("x", [None])[0]

        result = {
            "sid": imgs["sid"],
            "cid": imgs["cid"],
            "target_x_predicted": target_x,
            "verify_x_actual": verify_x,
            "token": token,
            "fail": fail,
            "verify_resp": verify.get("resp") if verify else None,
        }
        browser.close()
        return result


def main() -> None:
    success_count = 0
    fail_msgs = []
    for attempt in range(4):
        try:
            out = run_once()
        except Exception as e:
            print(f"run {attempt+1}: ERR {e}")
            continue
        pred = out.get("target_x_predicted")
        actual = out.get("verify_x_actual")
        if out.get("token"):
            success_count += 1
            print(f"run {attempt+1}: ✓ SUCCESS  pred={pred} actual={actual}")
        else:
            fail = out.get("fail", {})
            resp = out.get("verify_resp", "") or ""
            # try parse from raw verify_resp first
            msg = "?"
            if resp:
                try:
                    import json as _j
                    j = _j.loads(resp)
                    msg = j.get("msg", "?")
                except Exception:
                    msg = resp[:60]
            elif isinstance(fail, dict):
                msg = fail.get("message", "?")
            fail_msgs.append(msg)
            print(f"run {attempt+1}: ✗ {msg}  pred={pred} actual={actual}")
    print(f"\nSuccess: {success_count}/8")
    print(f"Fail msgs: {fail_msgs}")


if __name__ == "__main__":
    main()
