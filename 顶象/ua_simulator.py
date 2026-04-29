"""UA simulator translated from ./ua_simulator.js."""

from __future__ import annotations

import json
import re
import time
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.parse import quote

DEFAULT_VERSION = 5658
DEFAULT_JSV = 1
CUSTOM_B64 = "XmYj3u1PnvisIZUF8ThR/a6DfO+kW4JHrCELycAzSxleoQp02MtwV9Nd57qGgbKB="


def _js_from_char_code(*codes: int) -> str:
    return "".join(chr(int(code) & 0xFFFF) for code in codes)


def _char_code_at(text: str, index: int) -> int:
    return ord(text[index])


def bs2(value: int) -> List[int]:
    value = int(value)
    return [(value >> 8) & 0xFF, value & 0xFF]


def bs4(value: int) -> List[int]:
    value = int(value)
    return [*bs2((value >> 16) & 0xFFFF), *bs2(value & 0xFFFF)]


def bs8(value: int) -> List[int]:
    value = int(value)
    hi = value // (2 ** 32)
    lo = value - hi * (2 ** 32)
    return [*bs4(hi), *bs4(lo)]


def bss(text: Any) -> List[int]:
    input_text = str(text or "")
    output: List[int] = []
    for index in range(len(input_text)):
        output.append(_char_code_at(input_text, index))
    return output


def to_str(bytes_: Iterable[int]) -> str:
    return _js_from_char_code(*list(bytes_))


def flatten(input_: Iterable[Any]) -> List[Any]:
    output: List[Any] = []
    for item in input_:
        if isinstance(item, list):
            output.extend(flatten(item))
            continue
        if item is not None:
            output.append(item)
    return output


def process_value(*args: Any) -> str:
    first = args[0] if args else None
    seq: Sequence[Any]
    if len(args) == 1 and isinstance(first, list):
        seq = first
    else:
        seq = args
    return to_str(flatten(seq))


def custom_btoa(input_text: str) -> str:
    if not input_text:
        return ""

    output = ""
    index = 0

    while index < len(input_text):
        c1 = _char_code_at(input_text, index)
        index += 1

        has_c2 = index < len(input_text)
        c2 = _char_code_at(input_text, index) if has_c2 else 0
        index += 1

        has_c3 = index < len(input_text)
        c3 = _char_code_at(input_text, index) if has_c3 else 0
        index += 1

        e1 = c1 >> 2
        e2 = ((c1 & 3) << 4) | (c2 >> 4)
        e3 = ((c2 & 15) << 2) | (c3 >> 6)
        e4 = c3 & 63

        if not has_c2:
            e3 = 64
            e4 = 64
        elif not has_c3:
            e4 = 64

        output += (
            CUSTOM_B64[e1]
            + CUSTOM_B64[e2]
            + CUSTOM_B64[e3]
            + CUSTOM_B64[e4]
        )

    return output


def encrypt_chain(text: str, seed: int) -> str:
    output = ""
    current = int(seed)
    for index in range(len(text)):
        value = _char_code_at(text, index) ^ current
        current = value
        output += _js_from_char_code(value & 0xFF)
    return output


def encrypt_roll_shift(text: str, seed: int, shift_left: int, shift_right: int) -> str:
    output = ""
    current = int(seed)
    for index in range(len(text)):
        current = (((current << shift_left) ^ current) & 240) + (current >> shift_right)
        output += _js_from_char_code((_char_code_at(text, index) ^ current) & 0xFF)
    return output


def encrypt_xor_key(
    text: str,
    key: str,
    start_index: int = 0,
    advance: int = 1,
    mask: int = 0xFF,
) -> str:
    output = ""
    key_index = int(start_index)
    for index in range(len(text)):
        value = _char_code_at(text, index) ^ _char_code_at(key, key_index)
        output += _js_from_char_code(value & mask)
        key_index += advance
        if key_index >= len(key):
            key_index = 0
    return output


def encrypt_tm(text: str) -> str:
    return encrypt_chain(text, 39813)


def encrypt_br(text: str) -> str:
    output = ""
    state = 367
    for index in range(len(text)):
        state = (((state << 2) ^ state) & 240) + (state >> 5)
        output += _js_from_char_code((_char_code_at(text, index) ^ state) & 0xFF)
    return output


def encrypt_sc(text: str) -> str:
    return encrypt_chain(text, 241)


def encrypt_lo(text: str) -> str:
    output = ""
    key = "NS8hJ8mgg68"
    key_index = 10
    for index in range(len(text)):
        value = _char_code_at(text, index) ^ _char_code_at(key, key_index)
        key_index -= 1
        if key_index < 0:
            key_index = 10
        output += _js_from_char_code(value & 0xFF)
    return output


def encrypt_cf(text: str) -> str:
    output = ""
    state = 621
    for index in range(len(text)):
        value = (_char_code_at(text, index) ^ state) & 0xFF
        output += _js_from_char_code(value)
        state = value
    return output


def encrypt_di(text: str) -> str:
    return encrypt_xor_key(text, "Hx6Vcs7S5x")


def encrypt_em(text: str) -> str:
    return encrypt_chain(text, 72439)


def encrypt_jsv(text: str) -> str:
    output = ""
    key = "J6Br59Hf7NgK"
    offset = 44
    for index in range(len(text)):
        offset = (offset + 4) % 12
        value = _char_code_at(text, index) ^ _char_code_at(key, offset)
        output += _js_from_char_code(value & 0xFF)
    return output


def encrypt_tk(text: str) -> str:
    return encrypt_roll_shift(text, 132, 3, 3)


def encrypt_mm(text: str) -> str:
    output = ""
    key = "xnhg3Fk7ngF"
    key_index = 0
    for index in range(len(text)):
        value = _char_code_at(text, index) ^ _char_code_at(key, key_index)
        output += _js_from_char_code(value & 0xFF)
        key_index += 1
        if key_index >= len(key):
            key_index = 0
    return output


def encrypt_md(text: str) -> str:
    output = ""
    for index in range(len(text)):
        source = _char_code_at(text, index)
        mixed = 208 ^ source
        output += _js_from_char_code(((mixed >> 4) ^ source) & 0xFF)
    return output


def encrypt_kd(text: str) -> str:
    output = ""
    state = 143
    for index in range(len(text)):
        value = (_char_code_at(text, index) ^ state) & 0xFF
        output += _js_from_char_code(value)
        state = value
    return output


def encrypt_fo(text: str) -> str:
    output = ""
    key = "dx54gFRTbvc"
    key_index = 0
    for index in range(len(text)):
        value = _char_code_at(text, index) ^ _char_code_at(key, key_index)
        output += _js_from_char_code(value & 0xFF)
        key_index += 1
        if key_index >= len(key):
            key_index = 0
    return output


def encrypt_tc(text: str) -> str:
    return encrypt_roll_shift(text, 891, 4, 7)


def encrypt_tmv(text: str) -> str:
    output = ""
    key = "dv23dK7Sh"
    key_index = 250
    for index in range(len(text)):
        key_index = (key_index + 1) % 9
        value = _char_code_at(text, index) ^ _char_code_at(key, key_index)
        output += _js_from_char_code(value & 0xFF)
    return output


def encrypt_sa(text: str) -> str:
    return encrypt_chain(text, 38295)


def encrypt_ca(text: str) -> str:
    output = ""
    key = "KS6BkH8NsJ"
    key_index = 72
    for index in range(len(text)):
        key_index = (key_index + 1) % 10
        value = _char_code_at(text, index) ^ _char_code_at(key, key_index)
        output += _js_from_char_code(value & 0xFF)
    return output


def encrypt_temp(text: str) -> str:
    return encrypt_chain(text, 67845)


def parse_id(target: Any) -> str:
    target_id = ""
    if isinstance(target, dict):
        target_id = str(target.get("id") or "")
    elif target is not None:
        target_id = str(getattr(target, "id", "") or "")
    if not target_id:
        return ""
    return quote(target_id, safe="-_.!~*'()")


def safe_number(value: Any) -> int:
    raw = value if value else 0
    text = str(raw).lstrip()
    match = re.match(r"^[+-]?\d+", text)
    if not match:
        return 0
    try:
        return int(match.group(0), 10)
    except Exception:
        return 0


class _DocumentElement:
    def __init__(self, attrs: Optional[Dict[str, Any]] = None) -> None:
        self._attrs = attrs or {}

    def getAttribute(self, name: str) -> Any:
        return self._attrs.get(name)


def make_default_env(overrides: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    overrides = overrides or {}
    navigator = {
        "userAgent": overrides.get(
            "userAgent",
            (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
        ),
        "platform": overrides.get("platform", "Win32"),
        "language": overrides.get("language", "zh-CN"),
        "languages": overrides.get("languages", ["zh-CN", "zh"]),
        "cookieEnabled": overrides.get("cookieEnabled", True) is not False,
        "webdriver": bool(overrides.get("webdriver")),
    }

    now_func = overrides.get("now")
    if not callable(now_func):
        now_func = lambda: int(time.time() * 1000)

    return {
        "now": now_func,
        "navigator": navigator,
        "location": {
            "href": overrides.get("href", "https://example.com/captcha"),
        },
        "document": {
            "referrer": overrides.get("referrer", "https://example.com/"),
            "title": overrides.get("title", "captcha"),
            "documentElement": _DocumentElement(overrides.get("documentAttributes")),
            "bodyHtml": overrides.get("bodyHtml", '<div id="captcha"></div>'),
        },
        "window": {
            "outerHeight": overrides.get("outerHeight", 1080),
            "innerHeight": overrides.get("innerHeight", 960),
            "outerWidth": overrides.get("outerWidth", 1920),
            "innerWidth": overrides.get("innerWidth", 1280),
            "top": {} if overrides.get("inIframe") else "self",
            "self": "self",
            "phantom": overrides.get("phantom"),
        },
        "screen": {
            "width": overrides.get("screenWidth", 1920),
            "height": overrides.get("screenHeight", 1080),
            "availWidth": overrides.get("availWidth", 1920),
            "availHeight": overrides.get("availHeight", 1040),
            "colorDepth": overrides.get("colorDepth", 24),
            "screenLeft": overrides.get("screenLeft", 0),
            "screenTop": overrides.get("screenTop", 0),
        },
        "version": overrides.get("version", DEFAULT_VERSION),
        "jsv": overrides.get("jsv", DEFAULT_JSV),
        "token": overrides.get("token", ""),
        "form": overrides.get("form", ""),
        "inputName": overrides.get("inputName", "ua"),
    }


class UASimulator:
    def __init__(self, env: Optional[Dict[str, Any]] = None) -> None:
        self.env = make_default_env(env or {})
        self.option = {
            "token": self.env["token"],
            "form": self.env["form"],
            "inputName": self.env["inputName"],
        }
        self.binded = False
        self.reload(True)
        self.start()

    def _now(self) -> int:
        return int(self.env["now"]())

    def reload(self, skip_restart: bool = True) -> None:
        self.ua = ""
        self._ua = ""
        self._sa: List[str] = []
        self._ca: List[str] = []
        self.tm = self._now()
        self.counters = {
            "sa": 0,
            "mm": 0,
            "md": 0,
            "kd": 0,
            "fo": 0,
            "tc": 0,
            "tmv": 0,
            "mmInterval": 0,
            "tmvInterval": 0,
        }
        if not skip_restart:
            self.start()

    def app(self, type_code: int, payload: str) -> str:
        header = to_str([type_code, *bs2(len(payload))])
        self._ua += header + payload
        self.ua = f"{self.env['version']}#{custom_btoa(self._ua)}"
        return self.ua

    def process(self, *args: Any) -> str:
        return process_value(*args)

    def get_ua(self) -> str:
        return self.ua

    def get_segments(self) -> List[Dict[str, Any]]:
        output: List[Dict[str, Any]] = []
        index = 0
        while index < len(self._ua):
            type_code = _char_code_at(self._ua, index)
            index += 1
            length = (_char_code_at(self._ua, index) << 8) | _char_code_at(self._ua, index + 1)
            index += 2
            payload = self._ua[index:index + length]
            index += length
            output.append({
                "type": type_code,
                "length": length,
                "payloadHex": payload.encode("latin1").hex(),
            })
        return output

    def start(self) -> None:
        self.get_tm()
        self.get_br()
        self.get_lo()
        self.get_cf()
        self.get_di()
        self.get_em()
        self.get_jsv()
        self.get_tk()
        self.get_sc()

    def get_tm(self) -> str:
        payload = encrypt_tm(self.process(bs8(self.tm)))
        return self.app(4, payload)

    def get_br(self) -> str:
        os_code = self.get_os()
        browser_code, browser_version = self.get_browser_and_version()
        payload = encrypt_br(
            self.process(
                os_code,
                browser_code,
                bs2(len(browser_version)),
                bss(browser_version),
            )
        )
        return self.app(13, payload)

    def get_sc(self) -> str:
        screen = self.env["screen"]
        window = self.env["window"]
        info = [
            screen.get("width"),
            screen.get("height"),
            screen.get("availWidth"),
            screen.get("availHeight"),
            abs(screen.get("screenLeft") or 0),
            abs(screen.get("screenTop") or 0),
            window.get("innerWidth"),
            window.get("innerHeight"),
            window.get("outerWidth"),
            window.get("outerHeight"),
        ]
        payload_items = [bs2(value or 0) for value in info]
        return self.app(17, encrypt_sc(self.process(payload_items)))

    def get_lo(self) -> str:
        href = self.env["location"].get("href") or ""
        referrer = self.env["document"].get("referrer") or ""
        payload = encrypt_lo(
            self.process(
                bs2(len(href)),
                bss(href),
                bs2(len(referrer)),
                bss(referrer),
            )
        )
        return self.app(6, payload)

    def get_cf(self) -> str:
        samples = [
            "function Promise() { [native code] }",
            str(self.get_browser_and_version),
            str(self.get_sc),
            str(bss),
        ]
        sample = samples[0]
        offset = max(0, min(3, len(sample) - 2))
        size = min(8, max(2, len(sample) - offset))
        payload = encrypt_cf(
            self.process(
                bs2(offset),
                bs2(size),
                bss(sample[offset:offset + size]),
            )
        )
        return self.app(5, payload)

    def get_di(self) -> str:
        window = self.env["window"]
        in_iframe = window.get("top") != window.get("self")
        value = 1
        if (
            window.get("outerHeight")
            and window.get("innerHeight")
            and window.get("outerHeight") - window.get("innerHeight") > 250
            and not in_iframe
        ):
            value = 8
        if (
            window.get("outerWidth")
            and window.get("innerWidth")
            and window.get("outerWidth") - window.get("innerWidth") > 200
            and not in_iframe
        ):
            value = 8
        return self.app(7, encrypt_di(self.process(value)))

    def get_em(self) -> str:
        navigator = self.env["navigator"]
        document = self.env["document"]
        window = self.env["window"]
        document_element = document.get("documentElement")

        bits = [
            any(bool(window.get(key)) for key in ["phantom", "_phantom", "callPhantom", "webdriver", "_selenium"]),
            any(bool(document.get(key)) for key in ["__driver_evaluate", "__webdriver_script_fn"]),
            any(
                bool(document_element.getAttribute(key))
                for key in ["selenium", "webdriver", "driver"]
            ),
            re.search(r"PhantomJS", navigator.get("userAgent") or "", flags=re.I) is not None,
            (
                re.search(r"Headless", navigator.get("userAgent") or "", flags=re.I) is not None
                or bool(navigator.get("webdriver"))
            ),
            self.low_entropy_probe(),
        ]
        bits_text = "".join("1" if flag else "0" for flag in bits)
        bitset = int(("0" * 32 + bits_text)[-32:], 2)
        return self.app(10, encrypt_em(self.process(bs4(bitset))))

    def get_jsv(self) -> str:
        return self.app(18, encrypt_jsv(self.process(bs4(self.env["jsv"]))))

    def get_tk(self) -> str:
        token = self.option.get("token") or ""
        if not token:
            return self.ua
        return self.app(9, encrypt_tk(self.process(bs2(len(token)), bss(token))))

    def get_mm(self, event: Dict[str, Any]) -> str:
        target_id = parse_id(event.get("target"))
        elapsed = self._now() - self.tm
        payload = encrypt_mm(
            self.process(
                bs4(elapsed),
                bs2(safe_number(event.get("pageX"))),
                bs2(safe_number(event.get("pageY"))),
                bs2(len(target_id)),
                bss(target_id),
            )
        )
        return self.app(11, payload)

    def get_md(self, event: Dict[str, Any]) -> str:
        target_id = parse_id(event.get("target"))
        elapsed = self._now() - self.tm
        payload = encrypt_md(
            self.process(
                bs4(elapsed),
                bs2(safe_number(event.get("pageX"))),
                bs2(safe_number(event.get("pageY"))),
                safe_number(event.get("button")),
                bs2(len(target_id)),
                bss(target_id),
            )
        )
        self.app(15, payload)
        if self.counters["md"] <= 2:
            self.get_di()
        return self.ua

    def get_kd(self, event: Dict[str, Any]) -> str:
        target_id = parse_id(event.get("target"))
        elapsed = self._now() - self.tm
        code = safe_number(event.get("charCode") or event.get("keyCode"))
        key = event.get("key")
        if code == 229 and isinstance(key, str) and re.match(r"^[\d\w]$", key):
            code = _char_code_at(key, 0)
        payload = encrypt_kd(
            self.process(bs4(elapsed), bs2(code), bs2(len(target_id)), bss(target_id))
        )
        self.app(1, payload)
        if self.counters["kd"] <= 2:
            self.get_di()
        return self.ua

    def get_fo(self, event: Dict[str, Any]) -> str:
        target_id = parse_id(event.get("target"))
        elapsed = self._now() - self.tm
        is_focus = 1 if re.search(r"focus", str(event.get("type") or "")) else 0
        return self.app(
            14,
            encrypt_fo(
                self.process(
                    bs4(elapsed),
                    is_focus,
                    bs2(len(target_id)),
                    bss(target_id),
                )
            ),
        )

    def get_tc(self, event: Dict[str, Any]) -> str:
        touches = event.get("touches")
        touch = touches[0] if isinstance(touches, list) and touches else None
        if not touch:
            return self.ua
        target_id = parse_id(event.get("target"))
        elapsed = self._now() - self.tm
        payload = encrypt_tc(
            self.process(
                bs4(elapsed),
                bs2(safe_number(touch.get("pageX"))),
                bs2(safe_number(touch.get("pageY"))),
                bs4(safe_number(touch.get("identifier"))),
                bs2(len(target_id)),
                bss(target_id),
            )
        )
        return self.app(2, payload)

    def get_tmv(self, event: Dict[str, Any]) -> str:
        touches = event.get("touches")
        touch = touches[0] if isinstance(touches, list) and touches else None
        if not touch:
            return self.ua
        target_id = parse_id(event.get("target"))
        elapsed = self._now() - self.tm
        payload = encrypt_tmv(
            self.process(
                bs4(elapsed),
                bs2(safe_number(touch.get("pageX"))),
                bs2(safe_number(touch.get("pageY"))),
                bs4(safe_number(touch.get("identifier"))),
                bs2(len(target_id)),
                bss(target_id),
            )
        )
        return self.app(8, payload)

    def record_sa(self, point: Dict[str, Any]) -> str:
        elapsed = self._now() - self.tm
        payload = encrypt_sa(
            self.process(
                bs4(elapsed),
                bs2(safe_number(point.get("pageX"))),
                bs2(safe_number(point.get("pageY"))),
            )
        )
        self._sa.append(payload)
        return payload

    def send_sa(self) -> str:
        for item in self._sa:
            self.app(3, item)
        return self.ua

    def reload_sa(self) -> None:
        self.counters["sa"] = 0
        self._sa = []

    def record_ca(self, event: Dict[str, Any]) -> Optional[str]:
        target = event.get("target") or {}
        if not re.search(r"captcha_clickword_hits", str(target.get("className") or "")):
            return None
        elapsed = self._now() - self.tm
        payload = encrypt_ca(
            self.process(
                bs4(elapsed),
                bs2(safe_number(event.get("offsetX"))),
                bs2(safe_number(event.get("offsetY"))),
            )
        )
        self._ca.append(payload)
        return payload

    def send_ca(self) -> str:
        for item in self._ca:
            self.app(16, item)
        return self.ua

    def send_temp(self, input_data: Any) -> str:
        if isinstance(input_data, str):
            body = input_data
        else:
            base = {
                "title": quote((self.env["document"].get("title") or "")[:25], safe="-_.!~*'()"),
                "bodyLength": len(self.env["document"].get("bodyHtml", "")),
            }
            if isinstance(input_data, dict):
                base.update(input_data)
            body = json.dumps(base, separators=(",", ":"), ensure_ascii=False)
        return self.app(12, encrypt_temp(self.process(bs2(len(body)), bss(body))))

    def get_os(self) -> int:
        platform = self.env["navigator"].get("platform") or ""
        ua = self.env["navigator"].get("userAgent") or ""
        rules = [
            (7, r"Android"),
            (4, r"iPhone"),
            (5, r"iPod"),
            (6, r"iPad"),
            (2, r"Linux"),
            (3, r"Mac"),
            (1, r"Win"),
        ]
        for code, pattern in rules:
            if re.search(pattern, platform, flags=re.I) or re.search(pattern, ua, flags=re.I):
                return code
        return 0

    def get_browser_and_version(self) -> Tuple[int, str]:
        ua = self.env["navigator"].get("userAgent") or ""
        rules = [
            (7, r"edge?/([\d.]+)"),
            (13, r"micromessenger/([\d.]+)"),
            (2, r"msie\s([\d.]+)"),
            (5, r"opr/([\d.]+)"),
            (10, r"uc?browser/([\d.]+)"),
            (1, r"chrome/([\d.]+)"),
            (4, r"version/([\d.]+).*safari"),
            (3, r"firefox/([\d.]+)"),
        ]
        for code, pattern in rules:
            match = re.search(pattern, ua, flags=re.I)
            if match:
                return code, str(match.group(1) or "0").split(".")[0]
        return 0, "0"

    def low_entropy_probe(self) -> bool:
        navigator = self.env["navigator"]
        screen = self.env["screen"]
        values = [
            navigator.get("webdriver"),
            navigator.get("platform"),
            navigator.get("language"),
            navigator.get("languages"),
            navigator.get("cookieEnabled"),
            screen.get("width"),
            screen.get("height"),
            screen.get("colorDepth"),
        ]
        return any(item is None for item in values)

    def simulate_mouse_drag(
        self,
        points: List[Dict[str, Any]],
        options: Optional[Dict[str, Any]] = None,
    ) -> str:
        if not isinstance(points, list) or not points:
            return self.ua

        options = options or {}
        target_id = options.get("targetId", "slider-handle")
        button = options["button"] if "button" in options else 0
        include_move_segments = options.get("includeMoveSegments", True) is not False
        flush_sa = options.get("flushSA", True) is not False
        step_ms = options["stepMs"] if "stepMs" in options else 16

        first = points[0]
        rest = points[1:]

        self.reload_sa()
        self.is_mouse_down = True
        self.get_md({
            "pageX": safe_number(first.get("x")),
            "pageY": safe_number(first.get("y")),
            "button": button,
            "target": {"id": target_id},
        })

        for point in rest:
            if step_ms > 0:
                current_now = self._now()
                self.env["now"] = (lambda current_now=current_now: current_now + step_ms)

            self.record_sa({
                "pageX": safe_number(point.get("x")),
                "pageY": safe_number(point.get("y")),
            })

            if include_move_segments:
                self.get_mm({
                    "pageX": safe_number(point.get("x")),
                    "pageY": safe_number(point.get("y")),
                    "target": {"id": target_id},
                })

        self.is_mouse_down = False
        if flush_sa:
            self.send_sa()

        return self.ua

    # JS-style aliases
    getUA = get_ua
    getSegments = get_segments
    getTM = get_tm
    getBR = get_br
    getSC = get_sc
    getLO = get_lo
    getCF = get_cf
    getDI = get_di
    getEM = get_em
    getJSV = get_jsv
    getTK = get_tk
    getMM = get_mm
    getMD = get_md
    getKD = get_kd
    getFO = get_fo
    getTC = get_tc
    getTMV = get_tmv
    recordSA = record_sa
    sendSA = send_sa
    reloadSA = reload_sa
    recordCA = record_ca
    sendCA = send_ca
    sendTemp = send_temp
    getOS = get_os
    getBrowserAndVersion = get_browser_and_version
    lowEntropyProbe = low_entropy_probe
    simulateMouseDrag = simulate_mouse_drag


def demo() -> None:
    fake_now = [1710000000000]

    def now_func() -> int:
        return fake_now[0]

    simulator = UASimulator({
        "now": now_func,
        "token": "demo-token-123",
        "href": "https://example.com/captcha?scene=login",
        "referrer": "https://example.com/login",
    })

    fake_now[0] += 120
    simulator.simulate_mouse_drag(
        [
            {"x": 320, "y": 420},
            {"x": 325, "y": 420},
            {"x": 338, "y": 421},
            {"x": 356, "y": 423},
        ],
        {
            "targetId": "slider-handle",
            "stepMs": 16,
            "includeMoveSegments": True,
            "flushSA": True,
        },
    )

    fake_now[0] += 30
    simulator.get_kd({
        "key": "A",
        "keyCode": 65,
        "target": {"id": "captcha-input"},
    })

    fake_now[0] += 20
    simulator.record_ca({
        "offsetX": 44,
        "offsetY": 21,
        "target": {"className": "captcha_clickword_hits"},
    })
    simulator.send_ca()

    print("UA:", simulator.get_ua())
    print("Segments:", json.dumps(simulator.get_segments(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    demo()
