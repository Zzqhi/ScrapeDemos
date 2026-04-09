"""
Wrapper: generate sensor_data via patched-env bundle execution.
Called from main.py.
"""
import json
import subprocess
import os

SCRIPT = os.path.join(os.path.dirname(__file__), 'run.js')


def generate_sensor(cookie_str, script_path, page_url, post_url, timeout=15):
    payload = {
        "cookie": cookie_str,
        "script_path": script_path,
        "page_url": page_url,
        "post_url": post_url,
    }
    result = subprocess.run(
        ["node", SCRIPT],
        input=json.dumps(payload),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=timeout,
    )
    if result.stderr:
        # Only show first few lines of stderr
        lines = result.stderr.strip().split('\n')
        for line in lines[:5]:
            print(f"  [patch_env] {line}")
    out = json.loads(result.stdout)
    sensor_data = out.get("sensor_data", "")
    if not sensor_data:
        raise RuntimeError(f"patch_env failed: {out.get('error', 'unknown')}")
    return sensor_data
