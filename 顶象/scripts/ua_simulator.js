"use strict";

const DEFAULT_VERSION = 5563;
const DEFAULT_JSV = 1;
const CUSTOM_B64 =
  "XmYj3u1PnvisIZUF8ThR/a6DfO+kW4JHrCELycAzSxleoQp02MtwV9Nd57qGgbKB=";

// ua_pipeline.js 里大量把数字拆成 2/4/8 字节，再转成字符串拼段。
function bs2(value) {
  return [(value >> 8) & 0xff, value & 0xff];
}

function bs4(value) {
  return [...bs2((value >> 16) & 0xffff), ...bs2(value & 0xffff)];
}

function bs8(value) {
  const hi = Math.floor(value / 2 ** 32);
  const lo = value - hi * 2 ** 32;
  return [...bs4(hi), ...bs4(lo)];
}

function bss(text) {
  const input = String(text || "");
  const output = [];
  for (let index = 0; index < input.length; index++) {
    output.push(input.charCodeAt(index));
  }
  return output;
}

function toStr(bytes) {
  return String.fromCharCode(...bytes);
}

function flatten(input) {
  const output = [];
  for (const item of input) {
    if (Array.isArray(item)) {
      output.push(...flatten(item));
      continue;
    }
    if (typeof item !== "undefined") {
      output.push(item);
    }
  }
  return output;
}

function processValue(...args) {
  const first = args[0];
  const list = args.length === 1 && Array.isArray(first) ? first : args;
  return toStr(flatten(list));
}

// 最终整条 UA 不是标准 base64，而是换了 alphabet 的自定义 btoa。
function customBtoa(input) {
  if (!input) {
    return "";
  }

  let output = "";
  let index = 0;

  while (index < input.length) {
    const c1 = input.charCodeAt(index++);
    const c2 = input.charCodeAt(index++);
    const c3 = input.charCodeAt(index++);

    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (c2 >> 4);
    let e3 = ((c2 & 15) << 2) | (c3 >> 6);
    let e4 = c3 & 63;

    if (Number.isNaN(c2)) {
      e3 = 64;
      e4 = 64;
    } else if (Number.isNaN(c3)) {
      e4 = 64;
    }

    output +=
      CUSTOM_B64.charAt(e1) +
      CUSTOM_B64.charAt(e2) +
      CUSTOM_B64.charAt(e3) +
      CUSTOM_B64.charAt(e4);
  }

  return output;
}

function encryptChain(str, seed) {
  let output = "";
  let current = seed;
  for (let index = 0; index < str.length; index++) {
    const value = str.charCodeAt(index) ^ current;
    current = value;
    output += String.fromCharCode(value & 0xff);
  }
  return output;
}

// 一部分字段使用“滚动状态 + 位移混淆”的轻量加密。
function encryptRollShift(str, seed, shiftLeft, shiftRight) {
  let output = "";
  let current = seed;
  for (let index = 0; index < str.length; index++) {
    current = (((current << shiftLeft) ^ current) & 240) + (current >> shiftRight);
    output += String.fromCharCode((str.charCodeAt(index) ^ current) & 0xff);
  }
  return output;
}

function encryptXorKey(str, key, startIndex = 0, advance = 1, mask = 0xff) {
  let output = "";
  let keyIndex = startIndex;
  for (let index = 0; index < str.length; index++) {
    const value = str.charCodeAt(index) ^ key.charCodeAt(keyIndex);
    output += String.fromCharCode(value & mask);
    keyIndex += advance;
    if (keyIndex >= key.length) {
      keyIndex = 0;
    }
  }
  return output;
}

// 下面这些 encrypt_* 对应 ua_pipeline.js 里每个 type 段的字段级加密函数。
function encryptTM(str) {
  return encryptChain(str, 39813);
}

function encryptBR(str) {
  let output = "";
  let state = 367;
  for (let index = 0; index < str.length; index++) {
    state = (((state << 2) ^ state) & 240) + (state >> 5);
    output += String.fromCharCode((str.charCodeAt(index) ^ state) & 0xff);
  }
  return output;
}

function encryptSC(str) {
  return encryptChain(str, 241);
}

function encryptLO(str) {
  let output = "";
  const key = "NS8hJ8mgg68";
  let keyIndex = 10;
  for (let index = 0; index < str.length; index++) {
    const value = str.charCodeAt(index) ^ key.charCodeAt(keyIndex);
    keyIndex -= 1;
    if (keyIndex < 0) {
      keyIndex = 10;
    }
    output += String.fromCharCode(value & 0xff);
  }
  return output;
}

function encryptCF(str) {
  let output = "";
  let state = 621;
  for (let index = 0; index < str.length; index++) {
    const value = (str.charCodeAt(index) ^ state) & 0xff;
    output += String.fromCharCode(value);
    state = value;
  }
  return output;
}

function encryptDI(str) {
  return encryptXorKey(str, "Hx6Vcs7S5x");
}

function encryptEM(str) {
  return encryptChain(str, 72439);
}

function encryptJSV(str) {
  let output = "";
  const key = "J6Br59Hf7NgK";
  let offset = 44;
  for (let index = 0; index < str.length; index++) {
    offset = (offset + 4) % 12;
    const value = str.charCodeAt(index) ^ key.charCodeAt(offset);
    output += String.fromCharCode(value & 0xff);
  }
  return output;
}

function encryptTK(str) {
  return encryptRollShift(str, 132, 3, 3);
}

function encryptMM(str) {
  let output = "";
  const key = "xnhg3Fk7ngF";
  let keyIndex = 0;
  for (let index = 0; index < str.length; index++) {
    const value = str.charCodeAt(index) ^ key.charCodeAt(keyIndex);
    output += String.fromCharCode(value & 0xff);
    keyIndex += 1;
    if (keyIndex >= key.length) {
      keyIndex = 0;
    }
  }
  return output;
}

function encryptMD(str) {
  let output = "";
  for (let index = 0; index < str.length; index++) {
    const source = str.charCodeAt(index);
    const mixed = 208 ^ source;
    output += String.fromCharCode(((mixed >> 4) ^ source) & 0xff);
  }
  return output;
}

function encryptKD(str) {
  let output = "";
  let state = 143;
  for (let index = 0; index < str.length; index++) {
    const value = (str.charCodeAt(index) ^ state) & 0xff;
    output += String.fromCharCode(value);
    state = value;
  }
  return output;
}

function encryptFO(str) {
  let output = "";
  const key = "dx54gFRTbvc";
  let keyIndex = 0;
  for (let index = 0; index < str.length; index++) {
    const value = str.charCodeAt(index) ^ key.charCodeAt(keyIndex);
    output += String.fromCharCode(value & 0xff);
    keyIndex += 1;
    if (keyIndex >= key.length) {
      keyIndex = 0;
    }
  }
  return output;
}

function encryptTC(str) {
  return encryptRollShift(str, 891, 4, 7);
}

function encryptTMV(str) {
  let output = "";
  const key = "dv23dK7Sh";
  let keyIndex = 250;
  for (let index = 0; index < str.length; index++) {
    keyIndex = (keyIndex + 1) % 9;
    const value = str.charCodeAt(index) ^ key.charCodeAt(keyIndex);
    output += String.fromCharCode(value & 0xff);
  }
  return output;
}

function encryptSA(str) {
  return encryptChain(str, 38295);
}

function encryptCA(str) {
  let output = "";
  const key = "KS6BkH8NsJ";
  let keyIndex = 72;
  for (let index = 0; index < str.length; index++) {
    keyIndex = (keyIndex + 1) % 10;
    const value = str.charCodeAt(index) ^ key.charCodeAt(keyIndex);
    output += String.fromCharCode(value & 0xff);
  }
  return output;
}

function encryptTemp(str) {
  return encryptChain(str, 67845);
}

function parseId(target) {
  return target && target.id ? encodeURIComponent(target.id) : "";
}

function safeNumber(value) {
  return Number.parseInt(value || 0, 10) || 0;
}

function makeDefaultEnv(overrides = {}) {
  const navigator = {
    userAgent:
      overrides.userAgent ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    platform: overrides.platform || "Win32",
    language: overrides.language || "zh-CN",
    languages: overrides.languages || ["zh-CN", "zh"],
    cookieEnabled: overrides.cookieEnabled !== false,
    webdriver: !!overrides.webdriver,
  };

  return {
    now: overrides.now || (() => Date.now()),
    navigator,
    location: {
      href: overrides.href || "https://example.com/captcha",
    },
    document: {
      referrer: overrides.referrer || "https://example.com/",
      title: overrides.title || "captcha",
      documentElement: {
        getAttribute(name) {
          return overrides.documentAttributes ? overrides.documentAttributes[name] : null;
        },
      },
      bodyHtml: overrides.bodyHtml || "<div id=\"captcha\"></div>",
    },
    window: {
      outerHeight: overrides.outerHeight || 1080,
      innerHeight: overrides.innerHeight || 960,
      outerWidth: overrides.outerWidth || 1920,
      innerWidth: overrides.innerWidth || 1280,
      top: overrides.inIframe ? {} : "self",
      self: "self",
      phantom: overrides.phantom || null,
    },
    screen: {
      width: overrides.screenWidth || 1920,
      height: overrides.screenHeight || 1080,
      availWidth: overrides.availWidth || 1920,
      availHeight: overrides.availHeight || 1040,
      colorDepth: overrides.colorDepth || 24,
      screenLeft: overrides.screenLeft || 0,
      screenTop: overrides.screenTop || 0,
    },
    version: overrides.version || DEFAULT_VERSION,
    jsv: overrides.jsv || DEFAULT_JSV,
    token: overrides.token || "",
    form: overrides.form || "",
    inputName: overrides.inputName || "ua",
  };
}

class UASimulator {
  constructor(env = {}) {
    this.env = makeDefaultEnv(env);
    this.option = {
      token: this.env.token,
      form: this.env.form,
      inputName: this.env.inputName,
    };
    this.binded = false;
    this.reload(true);
    this.start();
  }

  reload(skipRestart = true) {
    this.ua = "";
    this._ua = "";
    this._sa = [];
    this._ca = [];
    this.tm = this.env.now();
    this.counters = {
      sa: 0,
      mm: 0,
      md: 0,
      kd: 0,
      fo: 0,
      tc: 0,
      tmv: 0,
      mmInterval: 0,
      tmvInterval: 0,
    };
    if (!skipRestart) {
      this.start();
    }
  }

  app(type, payload) {
    // 每个段的格式都是: type(1 byte) + payloadLength(2 bytes) + payload。
    const header = toStr([type, ...bs2(payload.length)]);
    this._ua += header + payload;
    this.ua = `${this.env.version}#${customBtoa(this._ua)}`;
    return this.ua;
  }

  process(...args) {
    return processValue(...args);
  }

  getUA() {
    return this.ua;
  }

  getSegments() {
    // 方便调试时反向观察当前 _ua 中已经塞了哪些 type 段。
    const output = [];
    let index = 0;
    while (index < this._ua.length) {
      const type = this._ua.charCodeAt(index++);
      const length = (this._ua.charCodeAt(index++) << 8) | this._ua.charCodeAt(index++);
      const payload = this._ua.slice(index, index + length);
      index += length;
      output.push({ type, length, payloadHex: Buffer.from(payload, "latin1").toString("hex") });
    }
    return output;
  }

  start() {
    // 这里模拟初始化阶段必定会进入 ua 的基础环境段。
    this.getTM();
    this.getBR();
    this.getLO();
    this.getCF();
    this.getDI();
    this.getEM();
    this.getJSV();
    this.getTK();
    this.getSC();
  }

  getTM() {
    const payload = encryptTM(this.process(bs8(this.tm)));
    return this.app(4, payload);
  }

  getBR() {
    const os = this.getOS();
    const [browserCode, browserVersion] = this.getBrowserAndVersion();
    const payload = encryptBR(
      this.process(os, browserCode, bs2(browserVersion.length), bss(browserVersion))
    );
    return this.app(13, payload);
  }

  getSC() {
    const { screen, window } = this.env;
    const info = [
      screen.width,
      screen.height,
      screen.availWidth,
      screen.availHeight,
      Math.abs(screen.screenLeft || 0),
      Math.abs(screen.screenTop || 0),
      window.innerWidth,
      window.innerHeight,
      window.outerWidth,
      window.outerHeight,
    ].map((value) => bs2(value || 0));
    return this.app(17, encryptSC(this.process(info)));
  }

  getLO() {
    const href = this.env.location.href || "";
    const referrer = this.env.document.referrer || "";
    const payload = encryptLO(
      this.process(bs2(href.length), bss(href), bs2(referrer.length), bss(referrer))
    );
    return this.app(6, payload);
  }

  getCF() {
    const samples = [
      "function Promise() { [native code] }",
      this.getBrowserAndVersion.toString(),
      this.getSC.toString(),
      bss.toString(),
    ];
    const sample = samples[0];
    const offset = Math.max(0, Math.min(3, sample.length - 2));
    const size = Math.min(8, Math.max(2, sample.length - offset));
    const payload = encryptCF(this.process(bs2(offset), bs2(size), bss(sample.substr(offset, size))));
    return this.app(5, payload);
  }

  getDI() {
    const { window } = this.env;
    const inIframe = window.top !== window.self;
    let value = 1;
    if (window.outerHeight && window.innerHeight && window.outerHeight - window.innerHeight > 250 && !inIframe) {
      value = 8;
    }
    if (window.outerWidth && window.innerWidth && window.outerWidth - window.innerWidth > 200 && !inIframe) {
      value = 8;
    }
    return this.app(7, encryptDI(this.process(value)));
  }

  getEM() {
    const { navigator, document, window } = this.env;
    const bits = [
      ["phantom", "_phantom", "callPhantom", "webdriver", "_selenium"].some((key) => Boolean(window[key])),
      ["__driver_evaluate", "__webdriver_script_fn"].some((key) => Boolean(document[key])),
      ["selenium", "webdriver", "driver"].some((key) => Boolean(document.documentElement.getAttribute(key))),
      /PhantomJS/i.test(navigator.userAgent),
      /Headless/i.test(navigator.userAgent) || !!navigator.webdriver,
      this.lowEntropyProbe(),
    ].map((flag) => (flag ? "1" : "0"));
    const bitset = Number.parseInt(("0".repeat(32) + bits.join("")).slice(-32), 2);
    return this.app(10, encryptEM(this.process(bs4(bitset))));
  }

  getJSV() {
    return this.app(18, encryptJSV(this.process(bs4(this.env.jsv))));
  }

  getTK() {
    if (!this.option.token) {
      return this.ua;
    }
    return this.app(
      9,
      encryptTK(this.process(bs2(this.option.token.length), bss(this.option.token)))
    );
  }

  getMM(event) {
    const targetId = parseId(event.target);
    const elapsed = this.env.now() - this.tm;
    const payload = encryptMM(
      this.process(bs4(elapsed), bs2(safeNumber(event.pageX)), bs2(safeNumber(event.pageY)), bs2(targetId.length), bss(targetId))
    );
    return this.app(11, payload);
  }

  getMD(event) {
    const targetId = parseId(event.target);
    const elapsed = this.env.now() - this.tm;
    const payload = encryptMD(
      this.process(
        bs4(elapsed),
        bs2(safeNumber(event.pageX)),
        bs2(safeNumber(event.pageY)),
        safeNumber(event.button),
        bs2(targetId.length),
        bss(targetId)
      )
    );
    this.app(15, payload);
    if (this.counters.md <= 2) {
      this.getDI();
    }
    return this.ua;
  }

  getKD(event) {
    const targetId = parseId(event.target);
    const elapsed = this.env.now() - this.tm;
    let code = safeNumber(event.charCode || event.keyCode);
    if (code === 229 && event.key && /^[\d\w]$/.test(event.key)) {
      code = event.key.charCodeAt(0);
    }
    const payload = encryptKD(
      this.process(bs4(elapsed), bs2(code), bs2(targetId.length), bss(targetId))
    );
    this.app(1, payload);
    if (this.counters.kd <= 2) {
      this.getDI();
    }
    return this.ua;
  }

  getFO(event) {
    const targetId = parseId(event.target);
    const elapsed = this.env.now() - this.tm;
    const isFocus = /focus/.test(event.type) ? 1 : 0;
    return this.app(
      14,
      encryptFO(this.process(bs4(elapsed), isFocus, bs2(targetId.length), bss(targetId)))
    );
  }

  getTC(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) {
      return this.ua;
    }
    const targetId = parseId(event.target);
    const elapsed = this.env.now() - this.tm;
    const payload = encryptTC(
      this.process(
        bs4(elapsed),
        bs2(safeNumber(touch.pageX)),
        bs2(safeNumber(touch.pageY)),
        bs4(safeNumber(touch.identifier)),
        bs2(targetId.length),
        bss(targetId)
      )
    );
    return this.app(2, payload);
  }

  getTMV(event) {
    const touch = event.touches && event.touches[0];
    if (!touch) {
      return this.ua;
    }
    const targetId = parseId(event.target);
    const elapsed = this.env.now() - this.tm;
    const payload = encryptTMV(
      this.process(
        bs4(elapsed),
        bs2(safeNumber(touch.pageX)),
        bs2(safeNumber(touch.pageY)),
        bs4(safeNumber(touch.identifier)),
        bs2(targetId.length),
        bss(targetId)
      )
    );
    return this.app(8, payload);
  }

  recordSA(point) {
    // SA 是拖动中的连续轨迹采样，先缓存，不直接写入 ua。
    const elapsed = this.env.now() - this.tm;
    const payload = encryptSA(
      this.process(bs4(elapsed), bs2(safeNumber(point.pageX)), bs2(safeNumber(point.pageY)))
    );
    this._sa.push(payload);
    return payload;
  }

  sendSA() {
    // 只有显式发送时，缓存的 SA 点才会变成 type 3 段进入 ua。
    for (const item of this._sa) {
      this.app(3, item);
    }
    return this.ua;
  }

  reloadSA() {
    this.counters.sa = 0;
    this._sa = [];
  }

  recordCA(event) {
    // CA 是 clickword 类验证码的点击坐标轨迹，逻辑和 SA 类似，也是先缓存。
    const target = event.target || {};
    if (!/captcha_clickword_hits/.test(target.className || "")) {
      return null;
    }
    const elapsed = this.env.now() - this.tm;
    const payload = encryptCA(
      this.process(bs4(elapsed), bs2(safeNumber(event.offsetX)), bs2(safeNumber(event.offsetY)))
    );
    this._ca.push(payload);
    return payload;
  }

  sendCA() {
    for (const item of this._ca) {
      this.app(16, item);
    }
    return this.ua;
  }

  sendTemp(input) {
    const body = typeof input === "string"
      ? input
      : JSON.stringify({
          title: encodeURIComponent((this.env.document.title || "").substr(0, 25)),
          bodyLength: this.env.document.bodyHtml.length,
          ...input,
        });
    return this.app(12, encryptTemp(this.process(bs2(body.length), bss(body))));
  }

  getOS() {
    const platform = this.env.navigator.platform || "";
    const ua = this.env.navigator.userAgent || "";
    const map = [
      [7, /Android/i],
      [4, /iPhone/i],
      [5, /iPod/i],
      [6, /iPad/i],
      [2, /Linux/i],
      [3, /Mac/i],
      [1, /Win/i],
    ];
    for (const [code, pattern] of map) {
      if (pattern.test(platform) || pattern.test(ua)) {
        return code;
      }
    }
    return 0;
  }

  getBrowserAndVersion() {
    const ua = this.env.navigator.userAgent || "";
    const rules = [
      [7, /edge?\/([\d.]+)/i],
      [13, /micromessenger\/([\d.]+)/i],
      [2, /msie\s([\d.]+)/i],
      [5, /opr\/([\d.]+)/i],
      [10, /uc?browser\/([\d.]+)/i],
      [1, /chrome\/([\d.]+)/i],
      [4, /version\/([\d.]+).*safari/i],
      [3, /firefox\/([\d.]+)/i],
    ];
    for (const [code, pattern] of rules) {
      const match = ua.match(pattern);
      if (match) {
        return [code, String(match[1] || "0").split(".")[0]];
      }
    }
    return [0, "0"];
  }

  lowEntropyProbe() {
    const { navigator, screen } = this.env;
    return [
      navigator.webdriver,
      navigator.platform,
      navigator.language,
      navigator.languages,
      navigator.cookieEnabled,
      screen.width,
      screen.height,
      screen.colorDepth,
    ].some((item) => typeof item === "undefined" || item === null);
  }

  simulateMouseDrag(points, options = {}) {
    // 这个辅助函数把外部传入的轨迹数组，映射成源码里的拖动事件链：
    // mousedown -> 多次 mousemove/recordSA -> sendSA
    if (!Array.isArray(points) || points.length === 0) {
      return this.ua;
    }

    const targetId = options.targetId || "slider-handle";
    const button = options.button ?? 0;
    const includeMoveSegments = options.includeMoveSegments !== false;
    const flushSA = options.flushSA !== false;
    const stepMs = options.stepMs ?? 16;

    const [first, ...rest] = points;

    this.reloadSA();
    this.isMouseDown = true;
    // 第一个点视为拖动起点，对应 mousedown。
    this.getMD({
      pageX: safeNumber(first.x),
      pageY: safeNumber(first.y),
      button,
      target: { id: targetId },
    });

    for (const point of rest) {
      if (stepMs > 0) {
        const currentNow = this.env.now();
        this.env.now = () => currentNow + stepMs;
      }

      // 每个中间点既可以产出连续轨迹采样，也可以同步产出离散 mousemove 段。
      this.recordSA({
        pageX: safeNumber(point.x),
        pageY: safeNumber(point.y),
      });

      if (includeMoveSegments) {
        this.getMM({
          pageX: safeNumber(point.x),
          pageY: safeNumber(point.y),
          target: { id: targetId },
        });
      }
    }

    this.isMouseDown = false;
    if (flushSA) {
      this.sendSA();
    }

    return this.ua;
  }
}

function demo() {
  let fakeNow = 1710000000000;
  const simulator = new UASimulator({
    now: () => fakeNow,
    token: "demo-token-123",
    href: "https://example.com/captcha?scene=login",
    referrer: "https://example.com/login",
  });

  fakeNow += 120;
  simulator.simulateMouseDrag(
    [
      { x: 320, y: 420 },
      { x: 325, y: 420 },
      { x: 338, y: 421 },
      { x: 356, y: 423 },
    ],
    {
      targetId: "slider-handle",
      stepMs: 16,
      includeMoveSegments: true,
      flushSA: true,
    }
  );

  fakeNow += 30;
  simulator.getKD({
    key: "A",
    keyCode: 65,
    target: { id: "captcha-input" },
  });

  fakeNow += 20;
  simulator.recordCA({
    offsetX: 44,
    offsetY: 21,
    target: { className: "captcha_clickword_hits" },
  });
  simulator.sendCA();

  console.log("UA:", simulator.getUA());
  console.log("Segments:", JSON.stringify(simulator.getSegments(), null, 2));
}

module.exports = {
  UASimulator,
  makeDefaultEnv,
  customBtoa,
  processValue,
  bs2,
  bs4,
  bs8,
  bss,
  demo,
};

if (require.main === module) {
  demo();
}
