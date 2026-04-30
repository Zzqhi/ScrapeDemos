"""Quick connectivity + latency test for DX_PROXY.

Usage:
    DX_PROXY=http://user:pass@host:port python test_proxy.py
"""
import os, sys, time, urllib.request, urllib.error, json

PROXY = os.environ.get("DX_PROXY") or os.environ.get("HTTPS_PROXY")
if not PROXY:
    print("ERR: set DX_PROXY first")
    sys.exit(1)

print(f"[proxy] {PROXY}\n")

def _opener():
    h = urllib.request.ProxyHandler({"http": PROXY, "https": PROXY})
    return urllib.request.build_opener(h)

def timed_get(url, timeout=15):
    t0 = time.time()
    try:
        with _opener().open(url, timeout=timeout) as r:
            data = r.read()
        return time.time() - t0, len(data), r.status, None
    except Exception as e:
        return time.time() - t0, 0, None, str(e)

# 1. Public IP / geolocation
print("[1] 当前出口 IP & 地理位置")
for url in ["https://api.ipify.org?format=json", "https://ipinfo.io/json"]:
    t, n, st, err = timed_get(url)
    if err:
        print(f"  {url}: ERR {err} ({t*1000:.0f}ms)")
    else:
        try:
            j = json.loads(_opener().open(url, timeout=10).read())
            print(f"  {url}: {t*1000:.0f}ms  → {j}")
        except Exception:
            print(f"  {url}: {t*1000:.0f}ms  → {n} bytes")

# 2. 顶象 endpoints latency (3 samples each)
print("\n[2] 顶象 API 延迟 (3 次平均)")
for url, name in [
    ("https://cap.dingxiang-inc.com/api/a?w=300&h=150&s=50&ak=12610a3853150e888ccd0c6d4c415626&jsv=1.5.46.2&aid=test&_r=0.1", "/api/a (会话)"),
    ("https://cdn.dingxiang-inc.com/ctu-group/ctu-greenseer/greenseer.js?_t=test", "greenseer.js"),
    ("https://constid.dingxiang-inc.com/udid/c1?_t=test", "constid /udid/c1"),
]:
    times = []
    sizes = []
    errs = 0
    for _ in range(3):
        t, n, st, err = timed_get(url, timeout=20)
        if err:
            errs += 1
        else:
            times.append(t * 1000)
            sizes.append(n)
    if times:
        avg = sum(times) / len(times)
        print(f"  {name:25s} avg={avg:.0f}ms  size~{sum(sizes)//len(sizes)}B  err={errs}/3")
    else:
        print(f"  {name:25s} ALL FAILED")

# 3. Bandwidth (download a known size from dingxiang CDN)
print("\n[3] CDN 带宽 (greenseer.js ~74KB)")
t, n, st, err = timed_get("https://cdn.dingxiang-inc.com/ctu-group/ctu-greenseer/greenseer.js")
if err:
    print(f"  ERR: {err}")
else:
    speed_kbps = (n * 8 / 1024) / t if t > 0 else 0
    print(f"  {n} bytes in {t*1000:.0f}ms = {speed_kbps:.0f} kbps")
