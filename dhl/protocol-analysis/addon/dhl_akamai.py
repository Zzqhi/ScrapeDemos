"""
DHL / Akamai bundle local-swap addon for mitmproxy.

Strategy (v2 — 2026-04-29):
- Do NOT touch the landing HTML. The page's <script src="/-..."> stays as-is
  so cookies (`_abck`/`bm_sz`/`ak_bmsc`) flow through the natural URL chain
  and the bundle's own POST(sensor_data) hits the same `/-...` URL unchanged.
- For each GET to `/-...` on dhl.com, fetch upstream via curl_cffi (Chrome131
  TLS — Akamai blocks mitm's default Python TLS), then if the response body
  looks like the MAIN Akamai bundle, swap the body with the local file at
  `bundle/akamai-local.js`. Headers (incl. Set-Cookie) pass through untouched.
- POST to `/-...` is never modified — sensor_data goes straight to the real
  endpoint with the original cookies. We dump request + response to disk for
  offline inspection.

Run:
    cd protocol-analysis
    mitmdump --listen-host 0.0.0.0 --listen-port 8080 -s addon/dhl_akamai.py
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from mitmproxy import http, ctx
from curl_cffi import requests as cf  # type: ignore


# ── paths ────────────────────────────────────────────────────────────────────

ADDON_DIR  = Path(__file__).resolve().parent
ROOT_DIR   = ADDON_DIR.parent                      # protocol-analysis/
BUNDLE_DIR = ROOT_DIR / "bundle"
SENSOR_DIR = ROOT_DIR / "sensor"

LOCAL_BUNDLE_FILE = BUNDLE_DIR / "akamai-local.js"

SENSOR_DIR.mkdir(parents=True, exist_ok=True)


def _is_dhl(flow: http.HTTPFlow) -> bool:
    return flow.request.pretty_host.endswith("dhl.com")


def _ts() -> str:
    return time.strftime("%Y%m%d-%H%M%S") + f"-{int((time.time() % 1) * 1000):03d}"


# Hop-by-hop headers stripped when copying upstream response into mitm response.
HOP_BY_HOP = {
    "connection", "keep-alive", "proxy-connection", "proxy-authenticate",
    "proxy-authorization", "te", "trailer", "trailers", "transfer-encoding",
    "upgrade",
}
# curl_cffi auto-decompresses; let mitm recalc length.
STRIP_RESP_HEADERS = HOP_BY_HOP | {"content-encoding", "content-length"}


def _cffi_upstream(flow: http.HTTPFlow) -> None:
    """Make the upstream request via curl_cffi (Chrome 131 TLS) and fill
    flow.response with the result so mitm short-circuits its own upstream."""
    method = flow.request.method
    url = flow.request.pretty_url
    in_headers = {
        k: v for k, v in flow.request.headers.items()
        if k.lower() not in HOP_BY_HOP and k.lower() != "host"
    }
    body = flow.request.raw_content or None
    try:
        resp = cf.request(
            method, url,
            headers=in_headers,
            data=body,
            impersonate="chrome131",
            timeout=30,
            allow_redirects=False,
            verify=True,
        )
    except Exception as e:
        ctx.log.warn(f"[cffi] upstream error for {url}: {e!r}")
        flow.response = http.Response.make(
            502,
            f"cffi upstream error: {e}".encode("utf-8", "replace"),
            {"content-type": "text/plain; charset=utf-8"},
        )
        return

    out_headers: list[tuple[bytes, bytes]] = []
    raw_items = None
    if hasattr(resp.headers, "multi_items"):
        try:
            raw_items = list(resp.headers.multi_items())
        except Exception:
            raw_items = None
    if raw_items is None:
        raw_items = list(resp.headers.items())
    for k, v in raw_items:
        if k.lower() in STRIP_RESP_HEADERS:
            continue
        kk = k.encode("latin-1") if isinstance(k, str) else k
        vv = v.encode("latin-1") if isinstance(v, str) else v
        out_headers.append((kk, vv))

    flow.response = http.Response.make(resp.status_code, resp.content, out_headers)
    flow.response.headers["x-mitm-upstream"] = "curl_cffi:chrome131"


# ── request: route dhl.com via curl_cffi; capture sensor POSTs ─────────────

def _is_sensor_post(flow: http.HTTPFlow) -> bool:
    return (
        flow.request.method == "POST"
        and (flow.request.path.startswith("/-") or flow.request.path.startswith("/_sec/verify"))
    )


def request(flow: http.HTTPFlow) -> None:
    if not _is_dhl(flow):
        return

    # Capture sensor_data / sec-cpt verify POST request bodies.
    if _is_sensor_post(flow):
        try:
            ts = _ts()
            slug = "verify" if flow.request.path.startswith("/_sec/verify") else "sensor"
            (SENSOR_DIR / f"{slug}-{ts}.meta.json").write_text(json.dumps({
                "ts": ts,
                "url": flow.request.pretty_url,
                "method": flow.request.method,
                "path": flow.request.path,
                "headers": dict(flow.request.headers.items()),
                "body_size": len(flow.request.raw_content or b""),
                "content_type": flow.request.headers.get("content-type", ""),
            }, indent=2, ensure_ascii=False))
            (SENSOR_DIR / f"{slug}-{ts}.body.bin").write_bytes(flow.request.raw_content or b"")
            ctx.log.info(f"[{slug}-req] POST {flow.request.path} ({len(flow.request.raw_content or b'')} bytes)")
        except Exception as e:
            ctx.log.warn(f"[{slug}-req] dump failed: {e}")

    _cffi_upstream(flow)


# ── response: detect the main bundle and swap the body to local ────────────

# Heuristic: the main Akamai bundle is a JS file delivered at a `/-...` URL,
# multi-hundred-KB, and starts with the polyfill IIFE.
BUNDLE_HEAD_PREFIX = b"(function(){if(typeof Array.prototype.entries"
BUNDLE_MIN_BYTES = 300_000


def _looks_like_bundle(flow: http.HTTPFlow, body: bytes) -> bool:
    if flow.request.method != "GET":
        return False
    if not flow.request.path.startswith("/-"):
        return False
    ct = (flow.response.headers.get("content-type") or "").lower()
    if "javascript" not in ct:
        return False
    if len(body) < BUNDLE_MIN_BYTES:
        return False
    return body[:64].lstrip().startswith(BUNDLE_HEAD_PREFIX)


def response(flow: http.HTTPFlow) -> None:
    if not _is_dhl(flow) or flow.response is None:
        return

    body = flow.response.get_content(strict=False) or b""

    # 1) Bundle body swap.
    if _looks_like_bundle(flow, body):
        if LOCAL_BUNDLE_FILE.exists():
            local = LOCAL_BUNDLE_FILE.read_bytes()
            flow.response.set_content(local)
            flow.response.headers["x-mitm-source"] = "local-bundle-swap"
            flow.response.headers["cache-control"] = "no-cache, no-store, must-revalidate"
            ctx.log.info(
                f"[swap] {flow.request.path} -> local ({len(local)} bytes, "
                f"was {len(body)} bytes)"
            )
        else:
            ctx.log.warn(f"[swap] local bundle missing at {LOCAL_BUNDLE_FILE}; passing through")

    # 2) Capture sensor_data / verify POST RESPONSES (status, body, set-cookies).
    if _is_sensor_post(flow):
        try:
            ts = _ts()
            slug = "verify" if flow.request.path.startswith("/_sec/verify") else "sensor"
            meta = {
                "ts": ts,
                "url": flow.request.pretty_url,
                "request_size": len(flow.request.raw_content or b""),
                "status": flow.response.status_code,
                "headers": dict(flow.response.headers.items()),
                "set_cookie_keys": [
                    v.split("=", 1)[0]
                    for v in flow.response.headers.get_all("set-cookie")
                ],
                "body_size": len(flow.response.raw_content or b""),
                "body_text_head": (flow.response.text or "")[:400],
            }
            (SENSOR_DIR / f"{slug}-resp-{ts}.meta.json").write_text(
                json.dumps(meta, indent=2, ensure_ascii=False)
            )
            if flow.response.raw_content:
                (SENSOR_DIR / f"{slug}-resp-{ts}.body.bin").write_bytes(flow.response.raw_content)

            new_abck = ""
            for sc in flow.response.headers.get_all("set-cookie"):
                if sc.startswith("_abck="):
                    val = sc.split("=", 1)[1].split(";", 1)[0]
                    segs = val.split("~")
                    new_abck = f"_abck status={segs[1] if len(segs) > 1 else '?'}"
                    break
            ctx.log.info(
                f"[{slug}-resp] {flow.request.path} <- {flow.response.status_code} "
                f"({len(flow.response.raw_content or b'')} bytes) {new_abck}"
            )
        except Exception as e:
            ctx.log.warn(f"[{slug}-resp] dump failed: {e}")
