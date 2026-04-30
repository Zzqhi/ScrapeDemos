"""Decode and compare two greenseer AC strings.

Usage:
    python decode_ac.py <browser_ac_file> <sidecar_ac_file>
    python decode_ac.py --json <exported_json_file>
    echo "5658#..." | python decode_ac.py -        # single AC from stdin
"""
from __future__ import annotations

import json
import sys
import os

CUSTOM_B64 = "XmYj3u1PnvisIZUF8ThR/a6DfO+kW4JHrCELycAzSxleoQp02MtwV9Nd57qGgbKB="

TYPE_NAMES = {
    1: "CF", 2: "DI", 3: "SC", 4: "LO", 5: "BR",
    6: "MD", 7: "MM", 8: "EM", 9: "TEMP", 10: "TMV",
    11: "JSV", 12: "TM", 13: "CA", 14: "TK", 15: "FO",
    16: "KD", 17: "SA", 18: "TC",
}


def custom_b64_decode(encoded: str) -> bytes:
    """Decode customBtoa base64."""
    lookup = {}
    for i, c in enumerate(CUSTOM_B64[:64]):
        lookup[c] = i
    pad_char = CUSTOM_B64[64]

    result = []
    buf = []
    for ch in encoded:
        if ch == pad_char:
            break
        if ch not in lookup:
            continue
        buf.append(lookup[ch])
        if len(buf) == 4:
            b0 = (buf[0] << 2) | (buf[1] >> 4)
            b1 = ((buf[1] & 0xF) << 4) | (buf[2] >> 2)
            b2 = ((buf[2] & 0x3) << 6) | buf[3]
            result.extend([b0, b1, b2])
            buf = []
    if len(buf) == 3:
        b0 = (buf[0] << 2) | (buf[1] >> 4)
        b1 = ((buf[1] & 0xF) << 4) | (buf[2] >> 2)
        result.extend([b0, b1])
    elif len(buf) == 2:
        b0 = (buf[0] << 2) | (buf[1] >> 4)
        result.append(b0)
    return bytes(result)


def parse_segments(data: bytes) -> list[dict]:
    """Parse segment headers: [type:1, len_hi:1, len_lo:1, payload:N]."""
    segs = []
    pos = 0
    while pos + 3 <= len(data):
        seg_type = data[pos]
        seg_len = (data[pos + 1] << 8) | data[pos + 2]
        pos += 3
        if pos + seg_len > len(data):
            payload = data[pos:]
            segs.append({"type": seg_type, "declared_len": seg_len,
                         "actual_len": len(payload), "payload": payload,
                         "truncated": True})
            break
        payload = data[pos:pos + seg_len]
        segs.append({"type": seg_type, "len": seg_len, "payload": payload})
        pos += seg_len
    return segs


def decode_ac(ac_str: str) -> dict:
    """Decode a full AC string → {version, segments, raw_bytes}."""
    parts = ac_str.split("#", 1)
    if len(parts) != 2:
        return {"error": "no # separator found", "raw": ac_str[:100]}
    version = parts[0]
    encoded = parts[1]
    raw = custom_b64_decode(encoded)
    segments = parse_segments(raw)
    return {"version": version, "raw_len": len(raw), "segments": segments}


def format_segment(seg: dict, index: int) -> str:
    """Format one segment for display."""
    t = seg["type"]
    name = TYPE_NAMES.get(t, f"?{t}")
    length = seg.get("len", seg.get("declared_len", 0))
    payload = seg["payload"]
    hex_preview = payload[:24].hex(" ")
    if len(payload) > 24:
        hex_preview += " ..."
    trunc = " [TRUNCATED]" if seg.get("truncated") else ""
    return f"  [{index:2d}] type={t:2d} ({name:4s})  len={length:4d}  {hex_preview}{trunc}"


def print_ac_info(label: str, ac_str: str) -> dict:
    """Print decoded AC info and return parsed data."""
    info = decode_ac(ac_str)
    if "error" in info:
        print(f"\n{'=' * 60}")
        print(f"  {label}: ERROR - {info['error']}")
        return info

    segs = info["segments"]
    type_counts = {}
    for s in segs:
        t = s["type"]
        name = TYPE_NAMES.get(t, f"?{t}")
        type_counts[name] = type_counts.get(name, 0) + 1

    print(f"\n{'=' * 60}")
    print(f"  {label}")
    print(f"{'=' * 60}")
    print(f"  version: {info['version']}")
    print(f"  ac 长度: {len(ac_str)} chars")
    print(f"  raw 字节: {info['raw_len']} bytes")
    print(f"  总段数: {len(segs)}")
    print(f"  段类型分布: {dict(sorted(type_counts.items()))}")
    seq_names = []
    for s in segs:
        t = s["type"]
        seq_names.append(TYPE_NAMES.get(t, "?%d" % t))
    print(f"  段序列: {' → '.join(seq_names)}")
    print(f"\n  详细段列表:")
    for i, seg in enumerate(segs):
        print(format_segment(seg, i))

    return info


def compare_acs(label_a: str, ac_a: str, label_b: str, ac_b: str):
    """Decode and compare two ACs side by side."""
    info_a = print_ac_info(label_a, ac_a)
    info_b = print_ac_info(label_b, ac_b)

    if "error" in info_a or "error" in info_b:
        return

    segs_a = info_a["segments"]
    segs_b = info_b["segments"]

    print(f"\n{'=' * 60}")
    print(f"  对比分析")
    print(f"{'=' * 60}")

    # Compare segment counts
    print(f"  段数: {label_a}={len(segs_a)}, {label_b}={len(segs_b)}")

    # Compare type sequences
    seq_a = [s["type"] for s in segs_a]
    seq_b = [s["type"] for s in segs_b]
    if seq_a == seq_b:
        print(f"  段类型序列: 完全一致 ✓")
    else:
        print(f"  段类型序列: 不一致 ✗")
        # Show differences
        max_len = max(len(seq_a), len(seq_b))
        for i in range(max_len):
            ta = seq_a[i] if i < len(seq_a) else None
            tb = seq_b[i] if i < len(seq_b) else None
            na = TYPE_NAMES.get(ta, f"?{ta}") if ta is not None else "---"
            nb = TYPE_NAMES.get(tb, f"?{tb}") if tb is not None else "---"
            la = segs_a[i].get("len", 0) if i < len(segs_a) else 0
            lb = segs_b[i].get("len", 0) if i < len(segs_b) else 0
            match = "✓" if ta == tb and la == lb else ("~" if ta == tb else "✗")
            print(f"    [{i:2d}] {na:4s} len={la:4d}  vs  {nb:4s} len={lb:4d}  {match}")

    # Compare per-type total sizes
    print(f"\n  按类型汇总字节数:")
    all_types = sorted(set(s["type"] for s in segs_a + segs_b))
    for t in all_types:
        name = TYPE_NAMES.get(t, f"?{t}")
        size_a = sum(s.get("len", 0) for s in segs_a if s["type"] == t)
        size_b = sum(s.get("len", 0) for s in segs_b if s["type"] == t)
        count_a = sum(1 for s in segs_a if s["type"] == t)
        count_b = sum(1 for s in segs_b if s["type"] == t)
        match = "✓" if size_a == size_b and count_a == count_b else "✗"
        print(f"    {name:4s}: {label_a} {count_a}x/{size_a:4d}B  vs  {label_b} {count_b}x/{size_b:4d}B  {match}")

    # Byte-level comparison of matching segments
    print(f"\n  同类型段 payload 逐字节对比:")
    for t in all_types:
        name = TYPE_NAMES.get(t, f"?{t}")
        a_payloads = [s["payload"] for s in segs_a if s["type"] == t]
        b_payloads = [s["payload"] for s in segs_b if s["type"] == t]
        for idx in range(min(len(a_payloads), len(b_payloads))):
            pa, pb = a_payloads[idx], b_payloads[idx]
            if pa == pb:
                print(f"    {name}[{idx}]: {len(pa)}B 完全一致 ✓")
            else:
                diffs = []
                for bi in range(min(len(pa), len(pb))):
                    if pa[bi] != pb[bi]:
                        diffs.append(bi)
                extra = ""
                if len(pa) != len(pb):
                    extra = f" (长度差异: {len(pa)} vs {len(pb)})"
                print(f"    {name}[{idx}]: {len(diffs)}/{min(len(pa),len(pb))} 字节不同{extra}")
                if diffs and len(diffs) <= 20:
                    for d in diffs[:10]:
                        print(f"      byte[{d}]: 0x{pa[d]:02x} vs 0x{pb[d]:02x}")


def main():
    if len(sys.argv) == 2 and sys.argv[1] == "-":
        ac = sys.stdin.read().strip()
        print_ac_info("stdin", ac)
    elif len(sys.argv) == 3 and sys.argv[1] == "--json":
        with open(sys.argv[2]) as f:
            data = json.load(f)
        if "browserAC" in data and "sidecarAC" in data:
            compare_acs("Browser", data["browserAC"], "Sidecar", data["sidecarAC"])
        elif "ac" in data:
            print_ac_info("AC", data["ac"])
        else:
            print("JSON 中没有 browserAC/sidecarAC 或 ac 字段")
    elif len(sys.argv) == 3:
        with open(sys.argv[1]) as f:
            ac_a = f.read().strip()
        with open(sys.argv[2]) as f:
            ac_b = f.read().strip()
        compare_acs("File A", ac_a, "File B", ac_b)
    elif len(sys.argv) == 2:
        with open(sys.argv[1]) as f:
            ac = f.read().strip()
        print_ac_info("AC", ac)
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
