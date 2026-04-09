import requests
import json
import subprocess
import time
import sys
import re

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36"

headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "zh-CN,zh;q=0.9",
    "cache-control": "no-cache",
    "pragma": "no-cache",
    "priority": "u=0, i",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    "user-agent": UA,
}


def node_run(script, payload, timeout=30):
    result = subprocess.run(
        ["node", script],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=timeout,
    )
    if result.stderr:
        for line in result.stderr.strip().split("\n")[:5]:
            print(f"  [node] {line}")
    return json.loads(result.stdout)


def solve_via_cdp(page_url):
    """Use CDP to navigate, interact, and solve Akamai challenge in real Chrome."""
    out = node_run("dhl/patch_env/cdp_solve.js", {
        "page_url": page_url,
    }, timeout=120)
    status = out.get("status", "?")
    cookies = out.get("cookies", {})
    if out.get("error"):
        raise RuntimeError(f"CDP solve failed: {out['error']}")
    return status, cookies


# ─── Main flow ──────────────────────────────────────────────

tracking_id = sys.argv[1] if len(sys.argv) > 1 else "1232343"

url = "https://www.dhl.com/cn-zh/home/tracking.html"
params_str = f"submit=1&tacking-id={tracking_id}&tracking-id={tracking_id}"
page_url = f"{url}?{params_str}"

print(f"[1] Solving Akamai via CDP (tracking: {tracking_id})...")
try:
    status, cookies = solve_via_cdp(page_url)
except Exception as exc:
    print(f"  Error: {exc}")
    sys.exit(1)

print(f"[2] _abck status: {status}")
if status != "0":
    print("[FAIL] Could not solve Akamai challenge")
    sys.exit(1)

print("[OK] Akamai challenge solved!")

# ─── Step 3: Make API request directly in Chrome (cookie bound to TLS) ──

print(f"\n[3] Fetching tracking data for {tracking_id}...")
api_result = node_run("dhl/patch_env/cdp_fetch.js", {
    "url": f"https://www.dhl.com/utapi?trackingNumber={tracking_id}&language=zh&requesterCountryCode=CN&source=tt",
    "referer": page_url,
}, timeout=15)

if api_result.get("error"):
    print(f"  Error: {api_result['error']}")
else:
    api_status = api_result.get("status")
    body = api_result.get("body", "")
    print(f"  HTTP {api_status} ({len(body)} chars)")
    try:
        data = json.loads(body)
        print(json.dumps(data, indent=2, ensure_ascii=False)[:2000])
    except:
        print(f"  {body[:500]}")
