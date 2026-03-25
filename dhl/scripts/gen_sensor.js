// 补环境 + 直接执行 Akamai 脚本，不用 vm
// 从 stdin 读取 JSON: { cookie, script_path, page_url, post_url }

let inputBuf = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => inputBuf += chunk);
process.stdin.on('end', () => {
  const config = JSON.parse(inputBuf);
  run(config);
});

function run(config) {
  const { cookie, script_path, page_url, post_url } = config;
  const startTime = Date.now();
  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
  let sensorData = null;
  const proxyDebug = !!config.proxy_debug;
  const proxyTargets = new Set(config.proxy_targets || ['window', 'document', 'navigator', 'location', 'screen', 'element']);
  const proxyLogLimit = Number.isFinite(config.proxy_log_limit) ? config.proxy_log_limit : 400;
  let proxyLogCount = 0;
  const proxyCache = new WeakMap();

  function debugLog(msg) {
    if (!proxyDebug) return;
    if (proxyLogCount >= proxyLogLimit) return;
    proxyLogCount += 1;
    process.stderr.write(`[proxy] ${msg}\n`);
  }

  function fmtProp(prop) {
    return typeof prop === 'symbol' ? prop.toString() : String(prop);
  }

  function fmtValue(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    const t = typeof value;
    if (t === 'string') return JSON.stringify(value.length > 80 ? `${value.slice(0, 80)}...` : value);
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(value);
    if (t === 'function') return `[Function ${value.name || 'anonymous'}]`;
    if (Array.isArray(value)) return `[Array(${value.length})]`;
    const ctor = value && value.constructor && value.constructor.name;
    return `[${ctor || 'Object'}]`;
  }

  function shouldWrap(value, label) {
    if (!proxyDebug) return false;
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return false;
    if (!label) return false;
    return proxyTargets.has(label) || label.startsWith('element:');
  }

  function wrapWithDebugProxy(value, label) {
    if (!shouldWrap(value, label)) return value;
    if (proxyCache.has(value)) return proxyCache.get(value);
    const proxy = new Proxy(value, {
      get(target, prop, receiver) {
        const result = Reflect.get(target, prop, receiver);
        debugLog(`${label}.get ${fmtProp(prop)} -> ${fmtValue(result)}`);
        if (label === 'window' && prop === 'bmak' && result) {
          const keys = Object.keys(result).sort();
          debugLog(`window.bmak keys=${keys.join(',')}`);
        }
        return result;
      },
      set(target, prop, val, receiver) {
        debugLog(`${label}.set ${fmtProp(prop)} = ${fmtValue(val)}`);
        return Reflect.set(target, prop, val, receiver);
      },
      has(target, prop) {
        const result = Reflect.has(target, prop);
        debugLog(`${label}.has ${fmtProp(prop)} -> ${result}`);
        return result;
      },
      ownKeys(target) {
        const keys = Reflect.ownKeys(target);
        debugLog(`${label}.ownKeys -> ${keys.slice(0, 20).map(fmtProp).join(',')}`);
        return keys;
      },
      getOwnPropertyDescriptor(target, prop) {
        const desc = Reflect.getOwnPropertyDescriptor(target, prop);
        debugLog(`${label}.getOwnPropertyDescriptor ${fmtProp(prop)} -> ${desc ? 'found' : 'missing'}`);
        return desc;
      },
      defineProperty(target, prop, descriptor) {
        debugLog(`${label}.defineProperty ${fmtProp(prop)}`);
        return Reflect.defineProperty(target, prop, descriptor);
      },
    });
    proxyCache.set(value, proxy);
    return proxy;
  }

  // ========== cookie 读写 ==========
  const cookieJar = {};
  if (cookie) {
    cookie.split('; ').forEach(c => {
      const eq = c.indexOf('=');
      if (eq > 0) cookieJar[c.substring(0, eq)] = c.substring(eq + 1);
    });
  }
  function getCookie() {
    return Object.entries(cookieJar).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  function setCookie(val) {
    const parts = val.split(';');
    const kv = parts[0].trim();
    const eq = kv.indexOf('=');
    if (eq > 0) cookieJar[kv.substring(0, eq)] = kv.substring(eq + 1);
  }

  // ========== DOM 元素 ==========
  function mkEl(tag) {
    const el = {
      tagName: (tag || 'DIV').toUpperCase(), nodeType: 1,
      style: {}, childNodes: [], children: [],
      innerHTML: '', outerHTML: '', textContent: '', className: '', id: '',
      src: '', href: '', type: '', value: '', name: '',
      width: 300, height: 150,
      parentNode: null, parentElement: null, nextSibling: null, previousSibling: null,
      firstChild: null, lastChild: null,
      offsetWidth: 100, offsetHeight: 100, offsetLeft: 0, offsetTop: 0,
      scrollWidth: 100, scrollHeight: 100, clientWidth: 100, clientHeight: 100,
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      dataset: {},
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] !== undefined ? String(this[k]) : null; },
      removeAttribute() {}, hasAttribute() { return false; },
      appendChild(c) { this.childNodes.push(c); return c; },
      removeChild(c) { return c; }, insertBefore(n) { return n; }, replaceChild(n) { return n; },
      cloneNode() { return mkEl(tag); },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      getElementsByTagName() { return []; }, getElementsByClassName() { return []; },
      querySelector() { return null; }, querySelectorAll() { return []; },
      matches() { return false; }, closest() { return null; }, contains() { return false; },
      getBoundingClientRect() { return { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100, x: 0, y: 0 }; },
      getClientRects() { return []; },
      focus() {}, blur() {}, click() {},
      toDataURL() { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='; },
      getContext(type) {
        if (type === '2d') return {
          canvas: { toDataURL() { return 'data:image/png;base64,'; }, width: 300, height: 150 },
          fillRect() {}, clearRect() {}, strokeRect() {}, fillText() {}, strokeText() {},
          beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, arcTo() {},
          quadraticCurveTo() {}, bezierCurveTo() {}, rect() {}, fill() {}, stroke() {}, clip() {},
          save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {},
          drawImage() {}, putImageData() {},
          measureText: (t) => ({ width: (t || '').length * 6 }),
          getImageData: (x, y, w, h) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
          createImageData: (w, h) => ({ data: new Uint8Array(w * h * 4), width: w, height: h }),
          createLinearGradient: () => ({ addColorStop() {} }),
          createRadialGradient: () => ({ addColorStop() {} }),
          createPattern: () => ({}),
          isPointInPath() { return false; },
          font: '10px sans-serif', textBaseline: 'alphabetic', textAlign: 'start',
          fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
          globalCompositeOperation: 'source-over',
        };
        if (type === 'webgl' || type === 'experimental-webgl') return {
          getParameter(x) { if (x === 37446) return 'ANGLE (Intel)'; if (x === 37445) return 'Google Inc.'; if (x === 7938) return 'WebGL 1.0'; return 0; },
          getExtension(n) { return n === 'WEBGL_debug_renderer_info' ? { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 } : null; },
          getSupportedExtensions() { return ['WEBGL_debug_renderer_info']; },
          getShaderPrecisionFormat() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
          canvas: { toDataURL() { return ''; }, width: 1, height: 1 },
          createBuffer() { return {}; }, createProgram() { return {}; }, createShader() { return {}; },
          getProgramParameter() { return true; }, getShaderParameter() { return true; },
          shaderSource() {}, compileShader() {}, attachShader() {}, linkProgram() {}, useProgram() {},
          bindBuffer() {}, bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
          drawArrays() {}, drawElements() {}, viewport() {}, clear() {}, clearColor() {},
          getAttribLocation() { return 0; }, getUniformLocation() { return {}; },
          uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
        };
        return null;
      },
    };
    return wrapWithDebugProxy(el, `element:${el.tagName.toLowerCase()}`);
  }

  // ========== XHR ==========
  function XMLHttpRequest() {
    this.readyState = 0; this.status = 0; this.responseText = '';
    this.withCredentials = false; this.timeout = 0;
    this.upload = { addEventListener() {} }; this._headers = {};
    this.open = function (m, u) { this._method = m; this._url = u; this.readyState = 1; };
    this.send = function (body) {
      if (body && typeof body === 'string') {
        try {
          const p = JSON.parse(body);
          if (p.sensor_data) { sensorData = p.sensor_data; process.stderr.write(`[XHR] sensor len=${sensorData.length}\n`); }
        } catch (e) {
          if (body.length > 50) { sensorData = body; process.stderr.write(`[XHR] raw body len=${body.length}\n`); }
        }
      }
      this.readyState = 4; this.status = 200; this.responseText = '{"success":true}';
      if (this.onreadystatechange) this.onreadystatechange();
      if (this.onload) this.onload();
    };
    this.setRequestHeader = function () {};
    this.getResponseHeader = function () { return null; };
    this.getAllResponseHeaders = function () { return ''; };
    this.abort = function () {};
    this.addEventListener = function (ev, cb) { if (ev === 'load') this.onload = cb; if (ev === 'readystatechange') this.onreadystatechange = cb; };
    this.removeEventListener = function () {};
    this.overrideMimeType = function () {};
  }

  // ========== 构建全局对象 ==========
  const parsedUrl = new URL(page_url);
  const location = {
    href: page_url, protocol: parsedUrl.protocol, host: parsedUrl.host,
    hostname: parsedUrl.hostname, port: '', pathname: parsedUrl.pathname,
    search: parsedUrl.search, hash: '', origin: parsedUrl.origin,
    toString() { return this.href; }, replace() {}, assign() {}, reload() {},
  };

  const docEl = mkEl('html'); docEl.clientWidth = 1920; docEl.clientHeight = 1080;
  const body = mkEl('body'); body.clientWidth = 1920; body.clientHeight = 1080;
  const head = mkEl('head');
  const scriptEl = mkEl('script');
  if (post_url) scriptEl.src = new URL(post_url).pathname;

  const document = {
    get cookie() { return getCookie(); },
    set cookie(v) { setCookie(v); },
    title: 'DHL Tracking', referrer: '', domain: parsedUrl.hostname,
    URL: page_url, characterSet: 'UTF-8', readyState: 'complete',
    visibilityState: 'visible', hidden: false, compatMode: 'CSS1Compat',
    documentElement: docEl, body, head, location,
    createElement: mkEl, createDocumentFragment: () => mkEl('fragment'),
    createEvent: () => ({ initEvent() {}, preventDefault() {}, stopPropagation() {} }),
    createTextNode: (t) => ({ textContent: t, nodeType: 3 }),
    getElementById: () => null,
    getElementsByTagName: (tag) => { if (tag === 'head') return [head]; if (tag === 'body') return [body]; if (tag === 'script') return [scriptEl]; return []; },
    getElementsByClassName: () => [], getElementsByName: () => [],
    querySelector: (sel) => { if (sel && sel.includes('script')) return scriptEl; return null; },
    querySelectorAll: (sel) => { if (sel && sel.includes('script')) return [scriptEl]; return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    write() {}, writeln() {}, hasFocus() { return true; },
    createRange: () => ({ selectNode() {}, collapse() {}, cloneContents() { return mkEl('div'); } }),
    getSelection: () => ({ rangeCount: 0, toString() { return ''; } }),
    execCommand() { return false; },
    evaluate() { return { iterateNext() { return null; } }; },
    nodeType: 9, childNodes: [docEl],
    createTreeWalker() { return { nextNode() { return null; } }; },
  };

  const navigator = {
    userAgent, appVersion: userAgent.replace('Mozilla/', ''),
    platform: 'Win32', language: 'zh-CN', languages: ['zh-CN', 'zh', 'en'],
    cookieEnabled: true, doNotTrack: null, maxTouchPoints: 0,
    hardwareConcurrency: 8, deviceMemory: 8, onLine: true,
    product: 'Gecko', productSub: '20030107', vendor: 'Google Inc.', vendorSub: '',
    appName: 'Netscape', appCodeName: 'Mozilla', webdriver: false,
    connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false },
    plugins: { length: 5, 0: { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: '', length: 2, 0: { type: 'application/pdf' }, 1: { type: 'text/pdf' } }, item(i) { return this[i]; }, namedItem() { return null; }, refresh() {} },
    mimeTypes: { length: 2, 0: { type: 'application/pdf', suffixes: 'pdf', description: '' }, item(i) { return this[i]; } },
    permissions: { query() { return Promise.resolve({ state: 'prompt' }); } },
    javaEnabled() { return false; }, sendBeacon() { return true; },
    getBattery() { return Promise.resolve({ charging: true, level: 1 }); },
    getGamepads() { return []; },
  };

  const screen = {
    width: 1920, height: 1080, availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24,
    orientation: { type: 'landscape-primary', angle: 0, addEventListener() {} },
  };

  const performance = {
    now: () => Date.now() - startTime,
    timing: {
      navigationStart: startTime, fetchStart: startTime + 1,
      domainLookupStart: startTime + 5, domainLookupEnd: startTime + 15,
      connectStart: startTime + 15, connectEnd: startTime + 80,
      requestStart: startTime + 85, responseStart: startTime + 200,
      responseEnd: startTime + 250, domLoading: startTime + 260,
      domInteractive: startTime + 600, domContentLoadedEventStart: startTime + 600,
      domContentLoadedEventEnd: startTime + 615, domComplete: startTime + 900,
      loadEventStart: startTime + 900, loadEventEnd: startTime + 920,
    },
    navigation: { type: 0, redirectCount: 0 },
    getEntriesByType() { return []; }, getEntriesByName() { return []; },
    mark() {}, measure() {},
  };

  const wrappedLocation = wrapWithDebugProxy(location, 'location');
  const wrappedDocument = wrapWithDebugProxy(document, 'document');
  const wrappedNavigator = wrapWithDebugProxy(navigator, 'navigator');
  const wrappedScreen = wrapWithDebugProxy(screen, 'screen');
  const wrappedPerformance = wrapWithDebugProxy(performance, 'performance');

  // ========== 挂到 globalThis ==========
  globalThis.window = globalThis;
  globalThis.self = globalThis;
  globalThis.top = globalThis;
  globalThis.parent = globalThis;
  globalThis.frames = globalThis;
  globalThis.document = wrappedDocument;
  globalThis.navigator = wrappedNavigator;
  globalThis.location = wrappedLocation;
  globalThis.screen = wrappedScreen;
  globalThis.performance = wrappedPerformance;
  globalThis.XMLHttpRequest = XMLHttpRequest;
  globalThis.innerWidth = 1920;
  globalThis.innerHeight = 1080;
  globalThis.outerWidth = 1920;
  globalThis.outerHeight = 1080;
  globalThis.screenX = 0;
  globalThis.screenY = 0;
  globalThis.screenLeft = 0;
  globalThis.screenTop = 0;
  globalThis.pageXOffset = 0;
  globalThis.pageYOffset = 0;
  globalThis.scrollX = 0;
  globalThis.scrollY = 0;
  globalThis.devicePixelRatio = 1;
  globalThis.history = { length: 1, pushState() {}, replaceState() {} };
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {}, length: 0 };
  globalThis.sessionStorage = { getItem() { return null; }, setItem() {}, removeItem() {}, clear() {}, length: 0 };
  globalThis.getComputedStyle = () => new Proxy({}, { get(t, p) { return typeof p === 'symbol' ? undefined : ''; } });
  globalThis.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {} });
  globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  globalThis.atob = (s) => Buffer.from(s, 'base64').toString('binary');
  globalThis.btoa = (s) => Buffer.from(s, 'binary').toString('base64');
  globalThis.Image = function () { this.src = ''; this.addEventListener = function () {}; };
  globalThis.Audio = function () { this.canPlayType = () => ''; };
  globalThis.Event = function (t) { this.type = t; this.timeStamp = Date.now(); this.preventDefault = function () {}; this.stopPropagation = function () {}; };
  globalThis.CustomEvent = function (t) { this.type = t; };
  globalThis.MouseEvent = function (t) { this.type = t; };
  globalThis.KeyboardEvent = function (t) { this.type = t; };
  globalThis.MutationObserver = function () { this.observe = function () {}; this.disconnect = function () {}; this.takeRecords = function () { return []; }; };
  globalThis.IntersectionObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
  globalThis.ResizeObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
  globalThis.PerformanceObserver = function () { this.observe = function () {}; this.disconnect = function () {}; };
  globalThis.WebSocket = function () { this.send = function () {}; this.close = function () {}; this.addEventListener = function () {}; };
  globalThis.Worker = function () { this.postMessage = function () {}; this.terminate = function () {}; this.addEventListener = function () {}; };
  globalThis.Blob = function (p, o) { this.size = 0; this.type = (o && o.type) || ''; };
  globalThis.FormData = function () { this.append = function () {}; };
  globalThis.DOMParser = function () { this.parseFromString = function () { return { querySelector() { return null; }, querySelectorAll() { return []; } }; }; };
  globalThis.chrome = { runtime: {} };
  globalThis.Notification = Object.assign(function () {}, { permission: 'default' });
  globalThis.crypto = { getRandomValues(a) { for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; }, subtle: {} };
  globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json() { return Promise.resolve({}); }, text() { return Promise.resolve(''); } });
  globalThis.alert = function () {};
  globalThis.confirm = function () { return false; };
  globalThis.prompt = function () { return null; };
  globalThis.open = function () { return null; };
  globalThis.close = function () {};
  globalThis.focus = function () {};
  globalThis.blur = function () {};
  globalThis.scroll = function () {};
  globalThis.scrollTo = function () {};
  globalThis.scrollBy = function () {};
  globalThis.print = function () {};
  globalThis.stop = function () {};
  globalThis.getSelection = () => ({ rangeCount: 0, toString() { return ''; } });
  globalThis.visualViewport = { width: 1920, height: 1080 };
  globalThis.requestIdleCallback = (cb) => setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1);
  globalThis.cancelIdleCallback = (id) => clearTimeout(id);
  globalThis.postMessage = function () {};
  const wrappedWindow = wrapWithDebugProxy(globalThis, 'window');
  globalThis.window = wrappedWindow;
  globalThis.self = wrappedWindow;
  globalThis.top = wrappedWindow;
  globalThis.parent = wrappedWindow;
  globalThis.frames = wrappedWindow;

  // ========== 加载执行 ==========
  try {
    require(require('path').resolve(script_path || 'dhl/test.js'));
  } catch (e) {
    // require 不支持非模块JS, 用 eval 执行
    const fs = require('fs');
    const code = fs.readFileSync(script_path || 'dhl/test.js', 'utf-8');
    try {
      eval(code);
      process.stderr.write('Script executed OK\n');
    } catch (e2) {
      process.stderr.write(`Script error: ${e2.message}\n`);
      process.stderr.write(`${(e2.stack || '').split('\n').slice(0, 5).join('\n')}\n`);
    }
  }

  // ========== 输出 ==========
  if (sensorData) {
    process.stdout.write(JSON.stringify({ sensor_data: sensorData }));
  } else {
    process.stderr.write('No sensor_data captured\n');
    process.stderr.write(`Cookies: ${getCookie()}\n`);
    process.stdout.write(JSON.stringify({ error: 'no sensor_data' }));
  }
}
