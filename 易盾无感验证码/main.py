import json
import os
import random
import re
import string
import subprocess

import requests

_jsonp_counter = 0


def gen_jsonp_callback(prefix="__JSONP"):
    global _jsonp_counter
    chars = string.digits + string.ascii_lowercase
    f = ''.join(random.choices(chars, k=7))
    name = f"{prefix}_{f}_{_jsonp_counter}"
    _jsonp_counter += 1
    return name


def parse_jsonp(text):
    """从 JSONP 响应中提取 JSON 对象"""
    match = re.search(r'\((\{.*\})\)', text, re.DOTALL)
    if match:
        return json.loads(match.group(1))
    raise ValueError(f"无法解析 JSONP 响应: {text[:200]}")


HEADERS = {
    "Accept": "*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Referer": "https://dun.163.com/",
    "Sec-Fetch-Dest": "script",
    "Sec-Fetch-Mode": "no-cors",
    "Sec-Fetch-Site": "same-site",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
}

COOKIES = {
    "_gid": "GA.7707319836.64819403279418",
    "__root_domain_v": ".163.com",
    "_qddaz": "QD.888573036009410",
    "Hm_lvt_4671c5d502135636b837050ec6d716ce": "1773036004,1773903539",
    "HMACCOUNT": "19F6CDE53094F092",
    "wyy_uid": "a69fdf7a-f4f0-44a3-b80d-c234ee83898c",
    "hb_MA-91DF-2127272A00D5_source": "dun.163.com",
    "locale": "zh_CN",
    "Hm_lpvt_4671c5d502135636b837050ec6d716ce": "1773906790",
}


CAPTCHA_ID = "74b1d03fcaf944b4aa3a862b2a1893e1"
REFERER = "https://dun.163.com/trial/sense"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def run_node(script, *args):
    """调用 Node.js 脚本并返回 stdout"""
    result = subprocess.run(
        ["node", os.path.join(SCRIPT_DIR, script), *args],
        capture_output=True, text=True, timeout=15,
    )
    if result.returncode != 0:
        raise RuntimeError(f"[{script}] 执行失败: {result.stderr.strip()}")
    return result.stdout.strip()


def jsonp_get(url, params):
    """发起 JSONP GET 请求并解析响应"""
    params["callback"] = gen_jsonp_callback()
    resp = requests.get(url, params=params, headers=HEADERS, cookies=COOKIES)
    resp.raise_for_status()
    return parse_jsonp(resp.text)


def getconf():
    """第1步: 获取配置，拿到 dt 和 irToken"""
    result = jsonp_get("https://c.dun.163.com/api/v2/getconf", {
        "referer": REFERER,
        "zoneId": "",
        "id": CAPTCHA_ID,
        "ipv6": "false",
        "runEnv": "10",
        "iv": "5",
        "loadVersion": "2.5.4",
    })
    data = result["data"]
    print(f"[getconf] dt={data['dt']}, zoneId={data['zoneId']}")
    return data


def get_captcha(dt, zone_id, ir_token, fp, cb):
    """第2步: 获取验证码 token
    Args:
        dt: 来自 getconf 响应
        zone_id: 来自 getconf 响应
        ir_token: 来自 getconf data.ir.token 截取前32位
        fp: 设备指纹（Node.js 生成）
        cb: 加密参数（Node.js 生成）
    """
    result = jsonp_get("https://c.dun.163.com/api/v3/get", {
        "referer": REFERER,
        "zoneId": zone_id,
        "dt": dt,
        "id": CAPTCHA_ID,
        "fp": fp,
        "https": "true",
        "type": "",
        "width": "0",
        "sizeType": "10",
        "version": "2.28.5",
        "dpr": "1",
        "dev": "1",
        "cb": cb,
        "ipv6": "false",
        "runEnv": "10",
        "group": "",
        "scene": "",
        "sdkVersion": "",
        "loadVersion": "2.5.4",
        "iv": "4",
        "user": "",
        "irToken": ir_token,
        "smsVersion": "v3",
    })
    data = result["data"]
    print(f"[get] token={data['token']}, type={data['type']}, zoneId={data['zoneId']}")
    return data


def check_captcha(dt, zone_id, token, cb, data_str):
    """第3步: 提交验证
    Args:
        dt: 来自 getconf 响应
        zone_id: 来自 get 响应
        token: 来自 get 响应
        cb: 加密参数（Node.js 生成）
        data_str: 加密后的 JSON 字符串 {"d":"","m":"...","p":"...","ext":"..."}（Node.js 生成）
    """
    result = jsonp_get("https://c.dun.163.com/api/v3/check", {
        "referer": REFERER,
        "zoneId": zone_id,
        "dt": dt,
        "id": CAPTCHA_ID,
        "version": "2.28.5",
        "cb": cb,
        "user": "",
        "extraData": "",
        "bf": "0",
        "runEnv": "10",
        "sdkVersion": "",
        "loadVersion": "2.5.4",
        "iv": "4",
        "token": token,
        "type": "5",
        "width": "240",
        "data": data_str,
    })
    data = result["data"]
    passed = data.get("result", False)
    validate = data.get("validate", "")
    print(f"[check] result={passed}, validate={validate[:60]}...")
    return data


if __name__ == "__main__":
    import time

    # 第1步: getconf → dt, zoneId, ir 配置
    begin_time = int(time.time() * 1000)
    conf = getconf()
    dt = conf["dt"]
    zone_id = conf["zoneId"]
    ir_product_id = conf["ir"]["pn"]

    # 第2步: 生成加密参数（Node.js）
    fp = run_node("gen_fp.js")
    cb = run_node("gen_cb.js")
    ir_result = json.loads(run_node("gen_irToken.js", ir_product_id))
    ir_token = ir_result["token"]
    print(f"[node] fp={fp[:40]}..., cb={cb[:40]}...")
    print(f"[ir] code={ir_result['code']}, irToken={ir_token[:40]}...")

    # 第3步: get → 验证码 token
    get_data = get_captcha(dt, zone_id, ir_token, fp, cb)
    captcha_token = get_data["token"]

    # 模拟用户停留时间（1~2秒）
    time.sleep(1.0 + random.random())

    # 第4步: check → 提交验证
    elapsed = int(time.time() * 1000) - begin_time
    cb2 = run_node("gen_cb.js")
    data_str = run_node("gen_data.js", captcha_token, str(elapsed))
    check_data = check_captcha(dt, zone_id, captcha_token, cb2, data_str)
