"""Local API server for A/B comparison of browser AC vs sidecar AC.

Receives browser-captured params from debug.html, generates sidecar AC
via gen_ua.js, and optionally submits to /api/v1 for comparison.

Usage:
    python sidecar_api.py          # listens on :8902
"""
from __future__ import annotations

import json
import os
import random
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any, Dict, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from captcha_solver import (
    IDENTITY, VERIFY_URL, _build_opener,
    build_drag_events, generate_drag_points, human_step_dt,
)

GEN_UA_HELPER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scripts", "gen_ua.js")


def mouse_events_to_sidecar_events(mouse_events: List[Dict], x: int, y: int) -> List[Dict]:
    """Convert browser mouse events to sidecar event format."""
    if not mouse_events:
        points = generate_drag_points(start_x=0, target_x=x, y=y)
        return build_drag_events(points, verify_x=x, verify_y=y)

    events = []
    target_full = "dx_captcha_basic_slider-img-focus_1"

    first_move = None
    moves = []
    for ev in mouse_events:
        if ev["type"] == "mousedown":
            first_move = ev
        elif ev["type"] == "mousemove":
            moves.append(ev)

    if first_move:
        events.append({"kind": "mm", "x": first_move["x"], "y": first_move["y"],
                        "targetId": "", "dt": random.randint(800, 1500)})
        events.append({"kind": "mm", "x": first_move["x"], "y": first_move["y"],
                        "targetId": target_full, "dt": random.randint(20, 80)})

    for mv in moves:
        events.append({"kind": "sa", "x": mv["x"], "y": mv["y"], "dt": human_step_dt()})

    events.append({"kind": "sendSA", "dt": random.randint(50, 120)})
    events.append({"kind": "temp", "body": {
        "xpath": "/html/body/div",
        "x": x, "y": y, "isTrusted": True,
    }, "dt": random.randint(10, 40)})

    last_x = moves[-1]["x"] if moves else x
    last_y = moves[-1]["y"] if moves else y
    events.append({"kind": "mm", "x": last_x, "y": last_y, "targetId": "",
                    "dt": random.randint(50, 150)})
    return events


def gen_sidecar_ac(sid: str, events: List[Dict], env: Dict | None = None) -> str:
    """Call gen_ua.js to produce AC string."""
    start_time_ms = int(time.time() * 1000) - random.randint(900, 1800)
    pre_init_ms = random.randint(60_000, 100_000)

    I = IDENTITY
    spec = {
        "token": sid,
        "events": events,
        "startTime": start_time_ms,
        "preInitMs": pre_init_ms,
        "env": {
            "userAgent": env.get("userAgent", I["ua"]) if env else I["ua"],
            "href": env.get("href", I["href"]) if env else I["href"],
            "referrer": env.get("referrer", I["referrer"]) if env else I["referrer"],
            "platform": env.get("platform", I["platform"]) if env else I["platform"],
            "screenW": env.get("screenW", I["screen_w"]) if env else I["screen_w"],
            "screenH": env.get("screenH", I["screen_h"]) if env else I["screen_h"],
            "availW": env.get("availW", I["avail_w"]) if env else I["avail_w"],
            "availH": env.get("availH", I["avail_h"]) if env else I["avail_h"],
            "innerW": env.get("innerW", I["inner_w"]) if env else I["inner_w"],
            "innerH": env.get("innerH", I["inner_h"]) if env else I["inner_h"],
            "outerW": env.get("outerW", I["outer_w"]) if env else I["outer_w"],
            "outerH": env.get("outerH", I["outer_h"]) if env else I["outer_h"],
        },
    }
    result = subprocess.run(
        ["node", GEN_UA_HELPER],
        input=json.dumps(spec).encode("utf-8"),
        capture_output=True, timeout=30,
    )
    if result.returncode != 0:
        raise RuntimeError(f"gen_ua.js failed: {result.stderr.decode('utf-8', 'replace')}")
    payload = json.loads(result.stdout.decode("utf-8"))
    if not payload.get("ok"):
        raise RuntimeError(f"gen_ua.js error: {payload}")
    return payload["ua"]


class SidecarHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        if self.path == "/gen-ac":
            self._handle_gen_ac()
        elif self.path == "/gen-and-verify":
            self._handle_gen_and_verify()
        else:
            self._json_resp(404, {"error": "not found"})

    def _handle_gen_ac(self):
        """Generate sidecar AC from browser params, return AC string only."""
        try:
            data = self._read_json()
            sid = data["sid"]
            x = int(data.get("x", 0))
            y = int(data.get("y", 0))
            mouse_events = data.get("mouseEvents", [])
            env = data.get("env")

            events = mouse_events_to_sidecar_events(mouse_events, x, y)
            ac = gen_sidecar_ac(sid, events, env)

            browser_ac = data.get("browserAC", "")
            print(f"[gen-ac] sid={sid[:16]}... x={x} y={y} mouse_events={len(mouse_events)} "
                  f"sidecar_events={len(events)} ac_len={len(ac)} browser_ac_len={len(browser_ac)}")

            # Auto-save comparison for decode_ac.py analysis
            compare_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "last_ac_compare.json")
            with open(compare_path, "w") as f:
                json.dump({
                    "browserAC": browser_ac,
                    "sidecarAC": ac,
                    "sid": sid, "x": x, "y": y,
                    "mouse_events_count": len(mouse_events),
                    "sidecar_events_count": len(events),
                }, f, ensure_ascii=False, indent=2)
            print(f"[gen-ac] 已保存对比文件: {compare_path}")

            self._json_resp(200, {
                "ac": ac,
                "ac_length": len(ac),
                "browser_ac_length": len(browser_ac),
                "sidecar_events": len(events),
                "mouse_events_used": len(mouse_events),
            })
        except Exception as e:
            print(f"[gen-ac] ERROR: {e}")
            import traceback; traceback.print_exc()
            self._json_resp(500, {"error": str(e)})

    def _handle_gen_and_verify(self):
        """Generate sidecar AC and also submit to /api/v1, return both AC and verify result."""
        try:
            data = self._read_json()
            sid = data["sid"]
            x = int(data.get("x", 0))
            y = int(data.get("y", 0))
            mouse_events = data.get("mouseEvents", [])
            env = data.get("env")

            events = mouse_events_to_sidecar_events(mouse_events, x, y)
            ac = gen_sidecar_ac(sid, events, env)

            post_data = urllib.parse.urlencode({
                "ac": ac,
                "ak": data.get("ak", ""),
                "c": data.get("c", ""),
                "uid": "",
                "jsv": data.get("jsv", "1.5.46.2"),
                "sid": sid,
                "aid": data.get("aid", ""),
                "x": x,
                "y": y,
            }).encode("utf-8")

            I = IDENTITY
            headers = {
                "Content-type": "application/x-www-form-urlencoded",
                "Origin": I["href"].rstrip("/"),
                "Referer": I["referrer"],
                "User-Agent": I["ua"],
            }
            req = urllib.request.Request(VERIFY_URL, data=post_data, headers=headers)
            opener = _build_opener()
            with opener.open(req, timeout=15) as resp:
                verify_result = json.loads(resp.read().decode("utf-8"))

            print(f"[gen-and-verify] sid={sid[:16]}... result={verify_result.get('msg', verify_result.get('success'))}")

            self._json_resp(200, {
                "ac_length": len(ac),
                "verify_result": verify_result,
            })
        except Exception as e:
            print(f"[gen-and-verify] ERROR: {e}")
            import traceback; traceback.print_exc()
            self._json_resp(500, {"error": str(e)})

    def _read_json(self) -> Dict:
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length)
        return json.loads(body.decode("utf-8"))

    def _json_resp(self, code: int, data: Any):
        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode("utf-8"))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, fmt, *args):
        pass  # suppress default access log


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8902
    server = HTTPServer(("0.0.0.0", port), SidecarHandler)
    print(f"Sidecar API listening on http://localhost:{port}")
    print(f"  POST /gen-ac           — 生成 sidecar AC")
    print(f"  POST /gen-and-verify   — 生成 AC + 提交 /api/v1")
    print()
    server.serve_forever()


if __name__ == "__main__":
    main()
