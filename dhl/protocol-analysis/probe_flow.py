"""
Probe the real DHL/Akamai request flow with curl_cffi (Chrome 131 TLS).
No mitmproxy, no browser — straight HTTPS calls.

Goals:
  1) Map the request sequence the page actually performs.
  2) Track every Set-Cookie at each step.
  3) See whether GET(script) and POST(sensor_data) really hit the same URL.
  4) Identify when sec_cpt / _abck / bm_sz / bm_sv flip / appear.

Output: protocol-analysis/probe-trace.json + a short stdout summary.
"""

import json
import os
import re
import sys
import time
from pathlib import Path

from curl_cffi import requests as cf

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)
HOST = "https://www.dhl.com"
LANDING = (
    f"{HOST}/cn-zh/home/tracking.html"
    "?submit=1&tracking-id=1232343"
)
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "probe-trace.json"

# Persistent session so cookies accumulate exactly like a browser.
sess = cf.Session(impersonate="chrome131")

trace = []


def step(label, method, url, *, body=None, headers=None, save_to=None):
    print(f"[step] {label}: {method} {url[:100]}")
    t0 = time.time()
    kwargs = {"headers": headers or {}, "allow_redirects": False, "timeout": 30}
    if body is not None:
        kwargs["data"] = body
    resp = sess.request(method, url, **kwargs)
    dt = round((time.time() - t0) * 1000)

    # Pull every Set-Cookie individually (curl_cffi merges them in headers).
    set_cookies = []
    try:
        # curl_cffi exposes raw response headers via .headers.multi_items() if available.
        for k, v in resp.headers.multi_items():
            if k.lower() == "set-cookie":
                first = v.split(";", 1)[0]
                name = first.split("=", 1)[0].strip()
                set_cookies.append({"name": name, "first_part_len": len(first)})
    except Exception:
        for k, v in resp.headers.items():
            if k.lower() == "set-cookie":
                first = v.split(";", 1)[0]
                name = first.split("=", 1)[0].strip()
                set_cookies.append({"name": name, "first_part_len": len(first)})

    body_bytes = resp.content or b""
    if save_to:
        save_path = ROOT / save_to
        save_path.parent.mkdir(parents=True, exist_ok=True)
        save_path.write_bytes(body_bytes)

    entry = {
        "label": label,
        "method": method,
        "url": url,
        "status": resp.status_code,
        "dt_ms": dt,
        "resp_size": len(body_bytes),
        "content_type": resp.headers.get("content-type", ""),
        "location": resp.headers.get("location"),
        "set_cookies": set_cookies,
        # Snapshot of cookies known on the session AFTER this response.
        "session_cookies_after": sorted({c.name for c in sess.cookies.jar}),
    }
    trace.append(entry)

    # Trim cookies on terminal display.
    setc = [c["name"] for c in set_cookies]
    print(f"   ← {resp.status_code} ({dt}ms, {len(body_bytes)} bytes), Set-Cookie={setc}, jar={entry['session_cookies_after']}")
    return resp


def find_last_script_src(html: str) -> str:
    """Find the LAST <script type='text/javascript' src='...'> — the Akamai bundle."""
    re1 = re.compile(
        rb"<script\b[^>]*\btype=[\"']text/javascript[\"'][^>]*\bsrc=[\"']([^\"']+)[\"']",
        re.IGNORECASE,
    )
    matches = re1.findall(html.encode("utf-8") if isinstance(html, str) else html)
    return matches[-1].decode() if matches else None


def find_async_script_src(html: str) -> str:
    """The 'async defer' Akamai secondary script."""
    src = html.encode("utf-8") if isinstance(html, str) else html
    m = re.search(rb"<script\b[^>]*\bsrc=[\"'](/-[^\"']+)[\"'][^>]*\basync\b", src, re.IGNORECASE)
    return m.group(1).decode() if m else None


def find_async_stylesheet_href(html: str) -> str:
    """The 'rel=stylesheet' Akamai-injected CSS (fingerprint probe)."""
    src = html.encode("utf-8") if isinstance(html, str) else html
    m = re.search(
        rb'<link\b[^>]*\brel=["\']stylesheet["\'][^>]*\bhref=["\'](/-[^"\']+)["\']',
        src, re.IGNORECASE,
    )
    return m.group(1).decode() if m else None


# ── Step 1: Get the landing HTML ───────────────────────────────────────────
r = step(
    "1.GET-HTML", "GET", LANDING,
    headers={
        "user-agent": UA,
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "zh-CN,zh;q=0.9",
        "upgrade-insecure-requests": "1",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
    },
    save_to="probe/01-landing.html",
)
landing_html = r.text

bundle_path = find_last_script_src(landing_html)
async_script = find_async_script_src(landing_html)
async_css = find_async_stylesheet_href(landing_html)
print(f"\n[discover] bundle  src = {bundle_path}")
print(f"[discover] secondary  = {async_script}")
print(f"[discover] css probe  = {async_css}\n")
trace.append({"label": "discovery", "bundle": bundle_path, "secondary_script": async_script, "css_probe": async_css})

if not bundle_path:
    print("ERROR: no Akamai bundle script in HTML — abort"); sys.exit(1)
bundle_url = HOST + bundle_path

# ── Step 2: GET the bundle JS (the same URL POST will hit later) ──────────
r = step(
    "2.GET-BUNDLE", "GET", bundle_url,
    headers={
        "user-agent": UA,
        "accept": "*/*",
        "accept-language": "zh-CN,zh;q=0.9",
        "referer": LANDING,
        "sec-fetch-dest": "script",
        "sec-fetch-mode": "no-cors",
        "sec-fetch-site": "same-origin",
    },
    save_to="probe/02-bundle.js",
)

# ── Step 3: GET secondary (async-defer) Akamai script ─────────────────────
if async_script:
    step(
        "3.GET-SECONDARY", "GET", HOST + async_script,
        headers={
            "user-agent": UA,
            "accept": "*/*",
            "accept-language": "zh-CN,zh;q=0.9",
            "referer": LANDING,
            "sec-fetch-dest": "script",
            "sec-fetch-mode": "no-cors",
            "sec-fetch-site": "same-origin",
        },
        save_to="probe/03-secondary.js",
    )

# ── Step 4: GET the Akamai-injected CSS (fingerprint probe) ───────────────
if async_css:
    step(
        "4.GET-CSS", "GET", HOST + async_css,
        headers={
            "user-agent": UA,
            "accept": "text/css,*/*;q=0.1",
            "accept-language": "zh-CN,zh;q=0.9",
            "referer": LANDING,
            "sec-fetch-dest": "style",
            "sec-fetch-mode": "no-cors",
            "sec-fetch-site": "same-origin",
        },
        save_to="probe/04-css.css",
    )

# ── Step 5: POST a STUB sensor_data to the bundle URL ─────────────────────
# This will fail the cookie validation but tells us:
#   - the endpoint accepts POST at the same URL as GET
#   - what the response shape is
#   - which cookies update on a POST attempt
stub_body = json.dumps(
    {"sensor_data": "3;0;1;0;3158581;stub;0,0,0,0,0,0;stub-payload"}
)
step(
    "5.POST-STUB-SENSOR", "POST", bundle_url,
    headers={
        "user-agent": UA,
        "accept": "*/*",
        "accept-language": "zh-CN,zh;q=0.9",
        "content-type": "text/plain;charset=UTF-8",
        "origin": HOST,
        "referer": LANDING,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
    },
    body=stub_body,
    save_to="probe/05-sensor-resp.json",
)

# ── Save full trace ───────────────────────────────────────────────────────
OUT.write_text(json.dumps(trace, indent=2, ensure_ascii=False))
print(f"\n[saved] {OUT}")

print("\n=== summary ===")
for e in trace:
    if "label" not in e or e.get("label") == "discovery":
        continue
    sc = ",".join(c["name"] for c in e.get("set_cookies", [])) or "-"
    print(f"  {e['label']:<22} {e['method']:<5} {e['status']:>3} ct={e['content_type'][:22]:<22} set={sc}")
