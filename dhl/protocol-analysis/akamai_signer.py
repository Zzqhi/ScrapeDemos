#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import argparse
import hashlib
import json
import math
import random
import re
import sys
from collections import OrderedDict
from pathlib import Path

ALPHABET = "".join(
    chr(code)
    for code in range(32, 127)
    if code not in (34, 39, 92)
)
ALPHABET_INDEX = {ord(char): index for index, char in enumerate(ALPHABET)}
PERMISSION_ORDER = [
    "speaker",
    "device-info",
    "bluetooth",
    "ambient-light-sensor",
    "accelerometer",
    "gyroscope",
    "magnetometer",
    "clipboard",
    "accessibility-events",
]
PLUGIN_PROBES = [
    "Flash", "Widevine Content Decryption Module", "Shockwave Flash",
    "Adobe Acrobat", "Microsoft Office", "Silverlight", "Java Deployment Toolkit",
    "Java Plug-in", "Google Talk", "Windows Media Player", "QuickTime",
    "VLC", "PDF Viewer", "Chrome PDF Viewer", "Chromium PDF Viewer",
    "Microsoft Edge PDF Viewer", "WebKit built-in PDF", "Native Client",
    "Unity Player", "RealPlayer", "Skype", "Adblock", "uBlock Origin",
    "AdGuard", "NoScript", "Privacy Badger", "Ghostery",
]


def load_json(path):
    with Path(path).open("r", encoding="utf-8") as file:
        return json.load(file, object_pairs_hook=OrderedDict)


def to_number(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default


def ascii_sum(value):
    if value is None:
        return -1
    try:
        return sum(ord(char) for char in str(value) if ord(char) < 128)
    except Exception:
        return -2


def js_string(value):
    return "" if value is None else str(value)


def join_values(*values, separator=","):
    return separator.join(js_string(value) for value in values)


def sha256_hex(value):
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def random_int(low, high):
    return random.randint(low, high)


def lcg_step(state):
    state = (state * 65793) & 0xFFFFFFFF
    return (state + 4282663) & 0x7FFFFF


def shuffle_colon(data, key):
    parts = str(data).split(":")
    state = key
    for _ in range(len(parts)):
        left = ((state >> 8) & 0xFFFF) % len(parts)
        state = lcg_step(state)
        right = ((state >> 8) & 0xFFFF) % len(parts)
        state = lcg_step(state)
        parts[left], parts[right] = parts[right], parts[left]
    return ":".join(parts)


def unshuffle_colon(data, key):
    parts = str(data).split(":")
    state = key
    swaps = []
    for _ in range(len(parts)):
        left = ((state >> 8) & 0xFFFF) % len(parts)
        state = lcg_step(state)
        right = ((state >> 8) & 0xFFFF) % len(parts)
        state = lcg_step(state)
        swaps.append((left, right))
    for left, right in reversed(swaps):
        parts[left], parts[right] = parts[right], parts[left]
    return ":".join(parts)


def substitute(data, key, decrypt=False):
    output = []
    state = key
    for char in str(data):
        offset = (state >> 8) & 0xFFFF
        state = lcg_step(state)
        alphabet_index = ALPHABET_INDEX.get(ord(char), -1)
        if alphabet_index < 0:
            output.append(char)
            continue
        delta = offset % len(ALPHABET)
        if decrypt:
            alphabet_index = (alphabet_index - delta) % len(ALPHABET)
        else:
            alphabet_index = (alphabet_index + delta) % len(ALPHABET)
        output.append(ALPHABET[alphabet_index])
    return "".join(output)


def parse_bm_sz_seed(bm_sz, default_seed):
    try:
        parts = str(bm_sz).split("~")
        seed = int(parts[2], 10)
        return seed
    except (IndexError, TypeError, ValueError):
        return default_seed


def js_json_dumps(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def build_header(key0, aj_type_bitmask=0, inline=False):
    version = PROFILE["bundle"]["version"]
    return ";".join([
        "3",
        "1" if inline else "0",
        "2" if inline else "1",
        str(aj_type_bitmask),
        str(key0),
        version,
    ])


def compute_event_timestamps(events, tracking_start_ts):
    result = []
    for index, event in enumerate(events):
        item = OrderedDict(event)
        item.setdefault("index", index)
        item.setdefault("relative_ts", max(0, to_number(item.get("ts"), tracking_start_ts) - tracking_start_ts))
        item.setdefault("trusted", True)
        result.append(item)
    return result


def event_checksum(records, include_xy=True):
    total = 0
    for item in records:
        total += to_number(item.get("index")) + to_number(item.get("type"))
        total += to_number(item.get("relative_ts"))
        if include_xy:
            total += to_number(item.get("x")) + to_number(item.get("y"))
    return total


def build_keyboard(events, tracking_start_ts):
    records = compute_event_timestamps(events, tracking_start_ts)
    output = []
    checksum = 0
    for item in records:
        key = item.get("key", "")
        code = item.get("key_code")
        if code is None:
            if len(str(key)) == 1 and 32 <= ord(str(key)) <= 126:
                code = -3 if 33 <= ord(str(key)) <= 47 else -2
            else:
                code = -1
        modifier = sum([
            8 if item.get("shift") else 0,
            4 if item.get("ctrl") else 0,
            2 if item.get("meta") else 0,
            1 if item.get("alt") else 0,
        ])
        target = ascii_sum(item.get("target", ""))
        output.append(join_values(
            item["index"], item.get("type", 0), item["relative_ts"],
            code, 0, modifier, target
        ) + (",0" if not item["trusted"] else "") + ";")
        checksum += item["index"] + to_number(item.get("type")) + item["relative_ts"] + code + modifier + target
    return "".join(output), checksum, len(records)


def build_pointer_like(events, tracking_start_ts, kind):
    records = compute_event_timestamps(events, tracking_start_ts)
    output = []
    checksum = 0
    for item in records:
        x = math.floor(to_number(item.get("x"), -1))
        y = math.floor(to_number(item.get("y"), -1))
        event_type = to_number(item.get("type"))
        if kind == "mouse":
            if event_type == 1:
                line = join_values(item["index"], 1, item["relative_ts"], x, y)
            else:
                line = join_values(item["index"], event_type, item["relative_ts"], x, y, ascii_sum(item.get("target", "")))
                if "button" in item:
                    line += "," + js_string(item["button"])
        elif kind == "touch":
            line = join_values(item["index"], event_type, item["relative_ts"], x, y, 1 if item.get("from_touches", True) else 0)
        else:
            line = join_values(item["index"], event_type, item["relative_ts"], x, y)
        if not item["trusted"]:
            line += ",0"
        output.append(line + ";")
        checksum += item["index"] + event_type + item["relative_ts"] + x + y
    return "".join(output), checksum, len(records)


def build_sensor_motion(events, tracking_start_ts, motion=True):
    records = compute_event_timestamps(events, tracking_start_ts)
    output = []
    checksum = 0
    for item in records:
        def formatted(name, default=-1):
            value = item.get(name, default)
            if value is None:
                value = default
            if isinstance(value, (int, float)) and value == int(value):
                return str(int(value))
            return f"{float(value):.2f}"
        if motion:
            fields = [
                item["index"], item["relative_ts"],
                formatted("acc_x"), formatted("acc_y"), formatted("acc_z"),
                formatted("gravity_x"), formatted("gravity_y"), formatted("gravity_z"),
                formatted("alpha"), formatted("beta"), formatted("gamma", 1),
            ]
        else:
            fields = [
                item["index"], item["relative_ts"],
                formatted("alpha"), formatted("beta"), formatted("gamma"),
            ]
        line = join_values(*fields)
        if not item["trusted"]:
            line += ",0"
        output.append(line + ";")
        checksum += item["index"] + item["relative_ts"]
    return "".join(output), checksum


def build_form_records(forms):
    output = []
    for form in forms:
        field_type = str(form.get("type", "")).lower()
        if field_type in ("text", "search", "url", "email", "tel", "number"):
            type_class = 0
        elif field_type == "password":
            type_class = 1
        else:
            continue
        autocomplete = form.get("autocomplete")
        if autocomplete is None or autocomplete == "":
            autocomplete_class = -1
        elif autocomplete == "off":
            autocomplete_class = 0
        elif autocomplete == "on":
            autocomplete_class = 1
        else:
            autocomplete_class = 2
        value = form.get("value", "")
        default = form.get("default_value", "")
        changed = 1 if value != default else 0
        required = 1 if form.get("required") else 0
        has_default = 1 if default != "" else 0
        output.append(join_values(
            type_class, autocomplete_class, changed, required,
            ascii_sum(form.get("id", "")), ascii_sum(form.get("name", "")), has_default
        ) + ";")
    return "".join(output)


def build_input_metadata(forms, tracking_start_ts):
    output = []
    for index, form in enumerate(forms):
        value = str(form.get("value", ""))
        if not value:
            continue
        name_or_id = form.get("name") or form.get("id") or ""
        full_id = form.get("full_id") or name_or_id
        input_type = str(form.get("type", "")).lower()
        if input_type in ("password", "confirm-password"):
            special = letters = numbers = 0
        else:
            special = len(re.findall(r"[^\w\s]", value, flags=re.UNICODE))
            letters = len(re.findall(r"[a-zA-Z]", value))
            numbers = len(re.findall(r"[0-9]", value))
        ts = to_number(form.get("ts"), tracking_start_ts) - tracking_start_ts
        output.append(join_values(
            ascii_sum(name_or_id), full_id, len(value), special, letters,
            numbers, max(0, ts), f"{full_id}{input_type}"
        ) + ";")
    return "".join(output)


def compute_xag(capabilities):
    values = [
        bool(capabilities.get("add_event_listener", True)),
        bool(capabilities.get("xml_http_request", True)),
        bool(capabilities.get("x_domain_request", False)),
        bool(capabilities.get("emit", False)),
        bool(capabilities.get("device_orientation", True)),
        bool(capabilities.get("device_motion", True)),
        bool(capabilities.get("touch_event", True)),
        bool(capabilities.get("spawn", False)),
        True,
        True,
        bool(capabilities.get("chrome", True)),
        True,
        False,
        bool(capabilities.get("pointer_event", True)),
    ]
    return sum(1 << index for index, enabled in enumerate(values) if enabled)


def compute_nfas(capabilities):
    names = [
        "credentials", "app_minor_version", "bluetooth", "storage", "math_imul",
        "get_gamepads", "get_storage_updates", "hardware_concurrency", "media_devices",
        "moz_alarms", "moz_connection", "moz_is_locally_available",
        "moz_phone_number_service", "ms_manipulation_views_enabled", "permissions",
        "register_protocol_handler", "request_media_key_system_access",
        "request_wake_lock", "send_beacon", "service_worker",
        "store_web_wide_tracking_exception", "webkit_get_gamepads",
        "webkit_temporary_storage", "number_parse_int", "math_hypot",
    ]
    return sum(1 << index for index, name in enumerate(names) if capabilities.get(name, name in ("math_imul", "number_parse_int", "math_hypot")))


def compute_signals(automation):
    flags = automation.get("global_flags", {})
    ordered = [
        "__nightmare", "cdc_Array", "cdc_Promise", "cdc_Symbol", "OSMJIF",
        "_Selenium_IDE_Recorder", "__$webdriverAsyncExecutor", "__driver_evaluate",
        "__driver_unwrapped", "__fxdriver_evaluate", "__fxdriver_unwrapped",
        "__lastWatirAlert", "__lastWatirConfirm", "__lastWatirPrompt",
        "__phantomas", "__selenium_evaluate", "__selenium_unwrapped",
        "__webdriverFuncgeb", "__webdriver__chr", "__webdriver_evaluate",
        "__webdriver_script_fn", "__webdriver_script_func", "__webdriver_script_function",
        "__webdriver_unwrapped", "awesomium", "callSelenium", "calledPhantom",
        "calledSelenium", "domAutomationController", "watinExpressionError",
        "watinExpressionResult", "spynner_additional_js_loaded",
        "document.$chrome_asyncScriptInfo", "fmget_targets", "geb",
    ]
    value = 0
    for index, name in enumerate(ordered):
        if flags.get(name):
            value += 1 << index
    return value


def build_adp(env):
    caps = env.get("capabilities", {})
    values = [
        ("cpen", env.get("automation", {}).get("phantom", False)),
        ("i1", caps.get("active_x_object", False)),
        ("dm", caps.get("document_mode", False)),
        ("cwen", caps.get("chrome_webstore", False)),
        ("non", caps.get("online", True)),
        ("opc", caps.get("opera", False)),
        ("fc", caps.get("install_trigger", False)),
        ("sc", caps.get("safari_constructor", False)),
        ("wrc", caps.get("webrtc", False)),
        ("isc", caps.get("moz_inner_screen_y", False)),
        ("vib", caps.get("vibrate", True)),
        ("bat", caps.get("get_battery", True)),
        ("x11", caps.get("array_for_each_missing", False)),
        ("x12", caps.get("file_reader", True)),
    ]
    return ",".join(f"{name}:{1 if enabled else 0}" for name, enabled in values)


def build_fp_val_str(env):
    caps = env.get("capabilities", {})
    screen = env["screen"]
    timezone = env["timezone"]
    plugin_names = [str(item) for item in env.get("plugins", [])]
    plugin_indexes = []
    install_index = env.get("derived", {}).get("plugins_install_index")
    if install_index is not None:
        plugin_indexes.append(str(install_index))
    else:
        for index, probe in enumerate(PLUGIN_PROBES):
            if probe in plugin_names:
                plugin_indexes.append(str(index))
    fields = [
        "", -1, "dis", "," + ",".join(plugin_indexes) if plugin_indexes else "",
        bool(caps.get("session_storage", True)),
        bool(caps.get("local_storage", True)),
        bool(caps.get("indexed_db", True)),
        to_number(timezone.get("offset_minutes"), 0),
        bool(caps.get("webrtc", False)),
        to_number(screen.get("color_depth"), -1),
        to_number(screen.get("pixel_depth"), -1),
        bool(env.get("cookie_enabled", True)),
        bool(env.get("java_enabled", False)),
        env.get("do_not_track") if env.get("do_not_track") is not None else -1,
    ]
    return ";".join("true" if value is True else "false" if value is False else str(value) for value in fields)


def build_din_items(env, tracking_start_ts):
    automation = env.get("automation", {})
    screen = env["screen"]
    window = env["window"]
    caps = env.get("capabilities", {})
    random_value = float(env.get("random", random.random()))
    random_text = str(random_value)[:11] + str(int(random_value * 500))
    items = {
        "ua": re.sub(r'[\\"]', "", env["user_agent"]),
        "xag": compute_xag(caps),
        "nps": env.get("product_sub") or "-",
        "nal": env.get("language") or "-",
        "nap": env.get("product") or "-",
        "npl": to_number(env.get("plugins_length"), -1),
        "pha": 1 if automation.get("phantom") else 0,
        "wdr": 1 if automation.get("window_webdriver") else 0,
        "dau": 1 if automation.get("dom_automation") else 0,
        "hz1": int(tracking_start_ts / (2016 * 2016)),
        "tsd": to_number(env.get("tsd"), 0),
        "asw": to_number(screen.get("avail_width"), -1),
        "ash": to_number(screen.get("avail_height"), -1),
        "swi": to_number(screen.get("width"), -1),
        "she": to_number(screen.get("height"), -1),
        "wiw": to_number(window.get("inner_width"), -1),
        "wih": to_number(window.get("inner_height"), -1),
        "wow": to_number(window.get("outer_width"), -1),
        "adp": build_adp(env),
        "ucs": str(ascii_sum(env["user_agent"])),
        "ran": random_text,
        "hal": int(tracking_start_ts / 2),
        "ibr": to_number(env.get("brave"), 0),
    }
    return items


def order_din(items, vm_state):
    order = vm_state.get("din_order") or list(items.keys())
    return [OrderedDict([(name, items[name])]) for name in order if name in items]


def build_ajr(tot_vel):
    value = tot_vel if tot_vel else random_int(10000, 109999)
    return f"{sha256_hex(str(value))}|{value}", value


def build_sde(env):
    automation = env.get("automation", {})
    caps = env.get("capabilities", {})
    checks = [
        automation.get("cdc", False),
        automation.get("html_webdriver_attr", False),
        bool(env.get("webdriver")),
        automation.get("window_webdriver", False),
        caps.get("xpath_result", True),
        automation.get("html_driver_attr", False),
        automation.get("html_selenium_attr", False),
    ]
    return ",".join("1" if check else "0" for check in checks)


def permission_code(status):
    return {
        "denied": "0",
        "prompt": "1",
        "granted": "2",
    }.get(status, "5")


def build_permissions(env, permission_completed):
    if not permission_completed:
        return "8"
    permissions = env.get("permissions", {})
    codes = [permission_code(permissions.get(name, "default")) for name in PERMISSION_ORDER]
    return "999999" + "".join(codes[:2]) + "9" + codes[2] + "9" + "".join(codes[3:]) + "999"


def build_dsi(env):
    iframe = env.get("iframe", {})
    webgl = env.get("webgl", {})
    chrome_keys = [str(item) for item in iframe.get("chrome_keys", [])]
    top_items = [
        to_number(env.get("hardware_concurrency"), -1),
        to_number(env.get("plugins_length"), -1),
        1 if env.get("capabilities", {}).get("chrome", True) else 0,
        1 if env.get("plugins_length", 0) else 0,
        to_number(env.get("device_memory"), -1),
    ]
    iframe_items = [
        to_number(iframe.get("hardware_concurrency"), -1),
        to_number(iframe.get("plugins_length"), -1),
        1 if iframe.get("chrome_object", bool(chrome_keys)) else 0,
        1 if iframe.get("plugins_length", 0) else 0,
        to_number(iframe.get("device_memory"), -1),
    ]
    chrome_keys = [str(item) for item in iframe.get("chrome_keys", [])]
    ico = iframe.get("ico_hash_override") or (sha256_hex(",".join(chrome_keys)) if chrome_keys else "-2")
    webdriver = iframe.get("webdriver")
    if webdriver is None:
        wdr = "-1"
    elif webdriver is False:
        wdr = "0"
    else:
        wdr = "1"
    iframe_vendor = iframe.get("webgl_vendor", "NA")
    top_vendor = webgl.get("vendor", "NA")
    return [
        OrderedDict([("get", "")]),
        OrderedDict([("set", "0")]),
        OrderedDict([("ico", ico)]),
        OrderedDict([("ift", "3")]),
        OrderedDict([("xof", ",".join(map(str, iframe_items)))]),
        OrderedDict([("xot", ",".join(map(str, top_items)))]),
        OrderedDict([("wev", f"{iframe_vendor};wev;{top_vendor}")]),
        OrderedDict([("wre", f"{iframe_vendor};wre;{top_vendor}")]),
        OrderedDict([("wdr", wdr)]),
        OrderedDict([("iks", "")]),
        OrderedDict([("lds", "1")]),
        OrderedDict([("sst", "")]),
    ]


def build_wsl(env, ready):
    if not ready:
        return ",,,,,,,,,,,,,,,,,,,"
    memory = env.get("performance_memory", {})
    connection = env.get("connection", {})
    caps = env.get("capabilities", {})
    voices = env.get("speech_voices", [])
    plugin_probe = 1 if env.get("plugins_length", 0) else -1
    file_path_score = 0 if not caps.get("file_path_descriptor", False) else (2 if caps.get("file_path_native", False) else 1)
    if caps.get("cross_origin_isolated", False):
        sab = "-1"
    else:
        sab = "-2" if caps.get("shared_array_buffer", False) else "1"
    values = [
        to_number(memory.get("js_heap_size_limit"), -1),
        to_number(memory.get("total_js_heap_size"), -1),
        to_number(memory.get("used_js_heap_size"), -1),
        to_number(connection.get("rtt"), -1),
        len(voices),
        plugin_probe,
        1 if caps.get("plugins_native_getter", True) else 0,
        1 if caps.get("plugin_item_overflow", True) else 0,
        file_path_score,
        sab,
        "", "", "", "", "", "", "", "",
        "1", "1",
    ]
    return ",".join(map(str, values))


def build_hls(env, ready):
    if not ready:
        return ",,,,"
    derived = env.get("derived", {})
    private_token = "1" if derived.get("private_token_supported", False) else "0"
    return f"{derived.get('chrome_runtime_hash', '-1')},,,{private_token},"


def build_pde(env, ready):
    if not ready:
        return ""
    return ",".join(env.get("navigator_own_properties", []))


def build_sww(env, completed):
    if not completed:
        return OrderedDict([("s024", -1)])
    derived = env.get("derived", {})
    ua_ch = env.get("ua_client_hints", {})
    webgl = env.get("webgl", {})
    window = env["window"]
    timezone = env["timezone"]
    connection = env.get("connection", {})
    language = env.get("language")
    languages = env.get("languages", [])
    date_string = derived.get("date_string", "")
    oscpu = derived.get("worker_oscpu")
    rtt = connection.get("rtt")
    rtt_code = connection.get("rtt_code_override", 0 if rtt == 0 else -1 if isinstance(rtt, (int, float)) and rtt > 0 else -2)
    connection_value = [connection.get("effective_type"), rtt_code, connection.get("type") or "null"]
    pairs = [
        ("s025", date_string), ("s026", date_string),
        ("s027", oscpu), ("s028", oscpu),
        ("s029", timezone.get("name")), ("s030", timezone.get("name")),
        ("s031", language), ("s032", language),
        ("s033", languages), ("s034", languages),
        ("s035", env.get("device_memory")), ("s036", env.get("device_memory")),
        ("s037", env.get("hardware_concurrency")), ("s038", env.get("hardware_concurrency")),
        ("s039", connection_value), ("s040", connection_value),
        ("s041", env["user_agent"]), ("s042", env["user_agent"]),
        ("s043", env.get("app_version")), ("s044", env.get("app_version")),
        ("s045", env.get("platform")), ("s046", env.get("platform")),
    ]
    hint_fields = [
        ("brands", "window_brands", "worker_brands"),
        ("mobile", "mobile", "mobile"),
        ("architecture", "window_architecture", "worker_architecture"),
        ("bitness", "window_bitness", "worker_bitness"),
        ("model", "model", "model"),
        ("platform", "window_platform", "worker_platform"),
        ("platform_version", "window_platform_version", "worker_platform_version"),
        ("ua_full_version", "window_ua_full_version", "worker_ua_full_version"),
        ("wow64", "wow64", "wow64"),
        ("full_version_list", "window_full_version_list", "worker_full_version_list"),
    ]
    for offset, (_, window_key, worker_key) in enumerate(hint_fields):
        pairs.append((f"s{47 + offset * 2:03d}", ua_ch.get(window_key, ua_ch.get(_))))
        pairs.append((f"s{48 + offset * 2:03d}", ua_ch.get(worker_key, ua_ch.get(_))))
    pairs.extend([
        ("s067", webgl.get("vendor")), ("s068", webgl.get("vendor")),
        ("s069", webgl.get("renderer")), ("s070", webgl.get("renderer")),
        ("s071", webgl.get("vendor2")), ("s072", webgl.get("vendor2")),
        ("s073", webgl.get("renderer2")), ("s074", webgl.get("renderer2")),
    ])
    result = OrderedDict([
        ("s024", 0),
        ("ext", derived.get("sww_ext")),
        ("swrt", derived.get("sww_shared_worker_runtime_ms")),
        ("wrt", derived.get("sww_window_runtime_ms")),
    ])
    result.update(OrderedDict(pairs))
    return result


def build_numbered_signals(env, readiness):
    caps = env.get("capabilities", {})
    derived = env.get("derived", {})
    automation = env.get("automation", {})
    random_value = float(env.get("random", random.random()))
    values = {}
    if readiness.get("T0", False):
        touch = bool(env.get("max_touch_points", 0) > 0 or caps.get("touch_event", False))
        values["s017"] = derived.get("s017") or ",".join([
            "1" if touch else "0",
            "1" if caps.get("pointer_coarse", False) else "0",
            "1" if caps.get("narrow_screen", False) else "0",
            "1" if caps.get("portrait", False) else "0",
        ])
        values["s148"] = str(random_int(1001, 2999) if automation.get("playwright_binding") else random_int(3000, 4999))
    if readiness.get("T1", False):
        plugins = "0" if caps.get("plugins_native_getter", True) else "1"
        mimes = "0" if caps.get("mime_types_native_getter", True) else "1"
        values["s002"] = plugins + mimes
        notification_denied = caps.get("notification_permission") == "denied"
        values["s151"] = str(1024 * random_int(1, 99) if notification_denied else random_int(1, 10000) * 2 + 1)
        values["s153"] = str(random_int(1, 499) if caps.get("apple_pay") else random_int(500, 999))
        values["s150"] = str(862 * random_int(1, 99) if caps.get("file_capture") else random_int(1, 10000) * 2 + 1)
        media = env.get("media_support", {})
        media_bits = [
            media.get("audio_mpeg"), media.get("audio_mp4"), media.get("audio_ogg"),
            media.get("audio_webm"), media.get("video_mp4"), media.get("video_webm"),
        ]
        values["s157"] = "[" + ",".join("1" if item else "0" for item in media_bits) + f",{to_number(media.get('elapsed_ms'), 0)}]"
    if readiness.get("S158", False):
        values["s158"] = str(env.get("audio_fingerprint", {}).get("value", "e"))
    if readiness.get("S162", False):
        values["s162"] = "000000" if all([
            caps.get("public_key_credential"), caps.get("authenticator_response", True),
            caps.get("authenticator_attestation_response", True),
            caps.get("authenticator_assertion_response", True),
            caps.get("media_metadata"), caps.get("media_session"),
        ]) else "111111"
    if readiness.get("S163", False):
        values["s163"] = str(env.get("audio_fingerprint", {}).get("decode_probe", "e"))
    if readiness.get("S173", False):
        values["s173"] = "1" if caps.get("content_index") else "0"
    if readiness.get("S127", False):
        quota = env.get("storage_quota_bytes")
        values["s127"] = "-2" if quota is None else f"{float(quota) / (1024 ** 3):.2f}"
    if readiness.get("T2", False):
        score = 0
        if caps.get("document_create_element_own_descriptor", True):
            score += 1
            if to_number(caps.get("create_element_length"), 0) == 1:
                score += 2
            if caps.get("create_element_name") == "createElement":
                score += 4
        values["s003"] = str(score)
    return values


def task_readiness(profile):
    timeline = profile.get("timeline", {})
    capture_ts = to_number(timeline.get("sensor_start_ts"), 0) + to_number(timeline.get("capture_offset_ms"), 0)
    readiness = {}
    cancelled_mask = 0
    for index, stage in enumerate(timeline.get("stages", [])):
        completed_at = to_number(stage.get("completed_at"), 0)
        ready = bool(stage.get("completed", completed_at <= capture_ts))
        readiness[stage["name"]] = ready
        if not ready:
            cancelled_mask |= 1 << index
    return readiness, cancelled_mask


def build_visibility_events(events, tracking_start_ts):
    output = []
    for index, item in enumerate(compute_event_timestamps(events, tracking_start_ts)):
        output.append(join_values(item.get("type", index), item["relative_ts"]) + ";")
    return "".join(output)


def build_target_counts(target_counts):
    result = OrderedDict()
    ranked = []
    for key, counts in target_counts.items():
        trusted = to_number(counts.get("trusted"), 0)
        untrusted = to_number(counts.get("untrusted"), 0)
        missing = to_number(counts.get("missing"), 0)
        score = untrusted * 100 + trusted * 10 + missing
        ranked.append((score, key, [trusted, untrusted, missing]))
    for _, key, values in sorted(ranked, reverse=True)[:5]:
        result[key] = values
    return result


def build_payload(profile):
    env = profile["environment"]
    events = env.get("events", {})
    state = profile.get("state", {})
    vm_state = profile.get("vm_state", {})
    tracking_start_ts = to_number(events.get("start_ts"), to_number(profile.get("timeline", {}).get("tracking_start_ts")))
    capture_offset = to_number(events.get("capture_offset_ms"), to_number(profile.get("timeline", {}).get("capture_offset_ms")))
    capture_ts = tracking_start_ts + capture_offset
    readiness, cancelled_mask = task_readiness(profile)
    permission_completed = readiness.get("T1", False)

    fpt = env.get("fpt") or build_fp_val_str(env)
    mouse, mouse_checksum, mouse_count = build_pointer_like(events.get("mouse", []), tracking_start_ts, "mouse")
    keyboard, keyboard_checksum, keyboard_count = build_keyboard(events.get("keyboard", []), tracking_start_ts)
    touch, touch_checksum, touch_count = build_pointer_like(events.get("touch", []), tracking_start_ts, "touch")
    pointer, pointer_checksum, pointer_count = build_pointer_like(events.get("pointer", []), tracking_start_ts, "pointer")
    motion, motion_checksum = build_sensor_motion(events.get("device_motion", []), tracking_start_ts, True)
    orientation, orientation_checksum = build_sensor_motion(events.get("device_orientation", []), tracking_start_ts, False)
    tot_vel = keyboard_checksum + mouse_checksum + motion_checksum + orientation_checksum + touch_checksum + pointer_checksum
    ajr, ajr_value = build_ajr(tot_vel if tot_vel else to_number(state.get("ajr_fallback_value"), random_int(10000, 109999)))
    event_ts_sum = sum(
        to_number(item.get("ts"), tracking_start_ts) - tracking_start_ts
        for name in ("mouse", "keyboard", "touch", "pointer", "device_motion", "device_orientation")
        for item in events.get(name, [])
    )
    din_items = build_din_items(env, tracking_start_ts)
    din = order_din(din_items, vm_state)
    speech_voices = env.get("speech_voices", [])
    speech_input = "".join(f"{voice.get('voiceURI','')}_{voice.get('lang','')}" for voice in speech_voices)
    speech_hash = env.get("speech_hash_override") or ("0" if not speech_voices else sha256_hex(speech_input))
    numbered = build_numbered_signals(env, readiness)
    dd2 = int(int(tracking_start_ts / (2016 * 2016)) / 23)
    jsrf1 = to_number(state.get("jsrf1"), random_int(10000, 109999))
    jsrf2 = state.get("jsrf2")
    if jsrf2 is None:
        digits = str(tracking_start_ts * jsrf1)
        step = 3 if len(digits) >= 18 else 2
        parts = [to_number(digits[i:i + 2], 0) for i in range(0, min(len(digits), step * 6), step)][:6]
        while len(parts) < 6:
            parts.append(0)
        jsrf2 = int(math.sqrt((parts[0] - parts[1]) ** 2 + (parts[2] - parts[3]) ** 2 + (parts[4] - parts[5]) ** 2))
    mst = [
        OrderedDict([("kevl", keyboard_checksum + 1)]),
        OrderedDict([("mevl", mouse_checksum + 32)]),
        OrderedDict([("tevl", touch_checksum + 32)]),
        OrderedDict([("devl", orientation_checksum)]),
        OrderedDict([("dmvl", motion_checksum)]),
        OrderedDict([("pevl", pointer_checksum)]),
        OrderedDict([("tovl", to_number(events.get("tot_vel_override"), tot_vel))]),
        OrderedDict([("delt", to_number(events.get("delt_override"), capture_offset))]),
        OrderedDict([("it", to_number(events.get("it"), 0))]),
        OrderedDict([("sts", tracking_start_ts)]),
        OrderedDict([("fct", to_number(events.get("fingerprint_elapsed_ms"), 0))]),
        OrderedDict([("dd2", dd2)]),
        OrderedDict([("kc", keyboard_count)]),
        OrderedDict([("mc", mouse_count)]),
        OrderedDict([("ww8", int(dd2 / 6))]),
        OrderedDict([("pc", pointer_count)]),
        OrderedDict([("tc", touch_count)]),
        OrderedDict([("ssts", to_number(events.get("ssts_override"), to_number(events.get("second_capture_offset_ms"), capture_offset)))]),
        OrderedDict([("tst", to_number(events.get("tst_override"), max(0, event_ts_sum)))]),
        OrderedDict([("rval", "-1")]),
        OrderedDict([("rcfp", "-1")]),
        OrderedDict([("nfas", state.get("n_fas_override", compute_nfas(env.get("capabilities", {}))))]),
        OrderedDict([("jsrf", "PiZtE")]),
        OrderedDict([("jsrf1", jsrf1)]),
        OrderedDict([("jsrf2", jsrf2)]),
        OrderedDict([("signals", str(compute_signals(env.get("automation", {}))))]),
        OrderedDict([("mwd", "1" if env.get("webdriver") else "0")]),
        OrderedDict([("hea", "")]),
        OrderedDict([("dvc", ",".join([
            str(vm_state.get("dvc_hash", "")),
            str(vm_state.get("dvc_hash_elapsed_ms", 0)),
            str(vm_state.get("dvc_plugins", "")),
        ]))]),
        OrderedDict([("srd", str(env.get("derived", {}).get("srd", "0")))]),
        OrderedDict([("tid", str(env.get("tab_id", "")))]),
    ]
    ffs = env.get("form_records_override") or build_form_records(env.get("forms", []))
    input_metadata = build_input_metadata(env.get("forms", []), tracking_start_ts)
    payload = OrderedDict([
        ("ver", profile["bundle"]["version"]),
        ("fpt", fpt),
        ("fpc", str(ascii_sum(fpt))),
        ("ajr", ajr),
        ("din", din),
        ("eem", ",".join([
            "do_en" if env.get("capabilities", {}).get("device_orientation", True) else "do_dis",
            "dm_en" if env.get("capabilities", {}).get("device_motion", True) else "dm_dis",
            "t_en" if env.get("capabilities", {}).get("touch_event", True) else "t_dis",
        ])),
        ("ffs", ffs),
        ("vev", build_visibility_events(events.get("visibility", []), tracking_start_ts)),
        ("inf", env.get("initial_form_records") or ffs),
        ("ajt", f"{to_number(state.get('send_reason'), 0)},{to_number(state.get('send_count'), 0)}"),
        ("kev", keyboard),
        ("dme", motion),
        ("mev", mouse),
        ("doe", orientation),
        ("pur", re.sub(r'[\\"]', "", profile["request"]["page_url"])),
        ("pev", pointer),
        ("mst", mst),
        ("o9", 0),
        ("tev", touch),
        ("sde", build_sde(env)),
        ("per", env.get("permissions", {}).get("per_override") or build_permissions(env, permission_completed)),
        ("mst_placeholder", None),
    ])
    payload.pop("mst_placeholder")
    if readiness.get("T0", False):
        payload["dsi"] = build_dsi(env)
    if readiness.get("T1", False):
        payload["wsl"] = build_wsl(env, True)
        payload["hls"] = build_hls(env, True)
    payload["pde"] = build_pde(env, readiness.get("T1", False))
    payload.update(OrderedDict([
        ("oev", build_visibility_events(events.get("wheel", []), tracking_start_ts)),
        ("if", input_metadata),
        ("pus", to_number(state.get("pow_state_count"), 0)),
        ("ffl", profile["bundle"]["ffl"]),
        ("sww", build_sww(env, readiness.get("T3", False))),
        ("te", to_number(events.get("trusted_count"), 0)),
        ("nte", to_number(events.get("untrusted_count"), 0)),
        ("mte", to_number(events.get("missing_trusted_count"), 0)),
        ("tcd", build_target_counts(events.get("target_counts", {}))),
        ("pnte", to_number(events.get("persistent", {}).get("untrusted"), 0)),
        ("pte", to_number(events.get("persistent", {}).get("trusted"), 0)),
        ("pmte", to_number(events.get("persistent", {}).get("missing"), 0)),
        ("tab", cancelled_mask),
        ("sws", 0),
        ("mis", 1 if state.get("abck_previous_first_segment") and state.get("abck_previous_first_segment") != profile.get("cookies", {}).get("_abck", "").split("~")[0] else 0),
        ("og", state.get("abck_previous_first_segment") or "sm"),
    ]))
    # 浏览器实际顺序：s017,s148,s151,s153,s003,s002,s150,s157,s158,s127,s162,s163,s173
    signal_order = ["s017", "s148", "s151", "s153", "s003", "s002", "s150", "s157", "s158", "s127", "s162", "s163", "s173"]
    for name in signal_order:
        if name in numbered:
            payload[name] = numbered[name]
    payload["fwd"] = [
        OrderedDict([("fmh", "")]),
        OrderedDict([("fmz", str(env["window"].get("device_pixel_ratio", "")))]),
        OrderedDict([("ssh", speech_hash)]),
    ]
    for key, value in profile.get("overrides", {}).get("payload", {}).items():
        payload[key] = value
    for index, item in enumerate(payload.get("mst", [])):
        name = next(iter(item.keys()))
        if name in profile.get("overrides", {}).get("mst", {}):
            item[name] = profile["overrides"]["mst"][name]
    if "sww" in payload:
        payload["sww"].update(profile.get("overrides", {}).get("sww", {}))
    return payload, readiness, ajr_value


def assemble_sensor_data(profile):
    payload, readiness, _ = build_payload(profile)
    cookies = profile.get("cookies", {})
    default_seed = to_number(profile["bundle"].get("default_seed"), 8888888)
    key0 = profile.get("state", {}).get("cookie_seed_override")
    if key0 is None:
        key0 = parse_bm_sz_seed(cookies.get("bm_sz", ""), default_seed)
    key1 = to_number(profile["bundle"].get("seed1"), 0)
    plain = js_json_dumps(payload)
    shuffled = shuffle_colon(plain, key1)
    encrypted = substitute(shuffled, key0)
    timing = profile.get("state", {}).get("timing", [0, 0, 0, 0, 0, 0])
    header = build_header(key0, to_number(profile.get("state", {}).get("aj_type_bitmask"), 0), False)
    return {
        "header": header,
        "timing": ",".join(map(str, timing)),
        "plain": plain,
        "sensor_data": ";".join([header, ",".join(map(str, timing)), encrypted]),
        "payload": payload,
        "readiness": readiness,
    }


def decode_sensor_body(body, key1):
    sensor_data = json.loads(body)["sensor_data"]
    parts = sensor_data.split(";")
    key0 = int(parts[4], 10)
    encrypted = ";".join(parts[7:])
    shuffled = substitute(encrypted, key0, decrypt=True)
    plain = unshuffle_colon(shuffled, key1)
    return {
        "header": parts[:6],
        "timing": parts[6],
        "plain": plain,
        "payload": json.loads(plain, object_pairs_hook=OrderedDict),
    }


def main():
    parser = argparse.ArgumentParser(description="DHL Akamai sensor_data 生成与验证")
    parser.add_argument("profile", help="环境 profile JSON")
    parser.add_argument("--output", "-o", help="输出 JSON 文件")
    parser.add_argument("--body", help="浏览器请求 body 文件，用于解密验证")
    parser.add_argument("--verify", action="store_true", help="与 --body 对比字段和加密串")
    args = parser.parse_args()

    profile = load_json(args.profile)
    global PROFILE
    PROFILE = profile
    result = assemble_sensor_data(profile)
    output = OrderedDict([
        ("header", result["header"]),
        ("timing", result["timing"]),
        ("readiness", result["readiness"]),
        ("payload_keys", list(result["payload"].keys())),
        ("payload", result["payload"]),
        ("sensor_data", result["sensor_data"]),
        ("body", {"sensor_data": result["sensor_data"]}),
    ])
    if args.body:
        browser = decode_sensor_body(Path(args.body).read_text(encoding="utf-8"), to_number(profile["bundle"]["seed1"], 0))
        output["browser_payload_keys"] = list(browser["payload"].keys())
        output["browser_payload"] = browser["payload"]
    if args.verify:
        if not args.body:
            raise SystemExit("--verify 需要同时提供 --body")
        browser_body = json.loads(Path(args.body).read_text(encoding="utf-8"))
        browser_sensor = browser_body["sensor_data"]
        differing = []
        for key in browser["payload"]:
            if result["payload"].get(key) != browser["payload"].get(key):
                differing.append(key)
        output["verification"] = OrderedDict([
            ("sensor_equal", result["sensor_data"] == browser_sensor),
            ("key_count_equal", len(result["payload"]) == len(browser["payload"])),
            ("missing_keys", [key for key in browser["payload"] if key not in result["payload"]]),
            ("extra_keys", [key for key in result["payload"] if key not in browser["payload"]]),
            ("differing_keys", differing),
        ])
    text = json.dumps(output, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(text + "\n", encoding="utf-8")
    else:
        print(text)


if __name__ == "__main__":
    main()
