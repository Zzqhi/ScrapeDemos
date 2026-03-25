// 用 Proxy 递归包装所有环境对象，自动捕获缺失属性并返回合理默认值
const vm = require('vm');
const fs = require('fs');

const abck = process.argv[2] || '';
const pageUrl = process.argv[3] || 'https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tacking-id=1232343&tracking-id=1232343';
const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const startTime = Date.now();
const missingLog = [];
let sensorData = null;
let sensorUrl = null;

// 创建通用 DOM 元素代理
function createElementProxy(tag) {
  const el = {
    tagName: (tag || 'DIV').toUpperCase(),
    nodeType: 1, style: {}, childNodes: [], children: [],
    innerHTML: '', outerHTML: '', textContent: '', className: '', id: '',
    src: '', href: '', type: '', value: '', name: '', width: 300, height: 150,
    parentNode: null, parentElement: null, nextSibling: null, previousSibling: null,
    firstChild: null, lastChild: null, offsetWidth: 100, offsetHeight: 100,
    offsetLeft: 0, offsetTop: 0, scrollWidth: 100, scrollHeight: 100,
    clientWidth: 100, clientHeight: 100,
    classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
    dataset: {},
    setAttribute(k, v) { this[k] = v; },
    getAttribute(k) { return this[k] || null; },
    removeAttribute() {},
    hasAttribute() { return false; },
    appendChild(c) { this.childNodes.push(c); return c; },
    removeChild(c) { return c; },
    insertBefore(n) { return n; },
    replaceChild(n) { return n; },
    cloneNode() { return createElementProxy(tag); },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    getElementsByTagName() { return []; },
    getElementsByClassName() { return []; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    matches() { return false; },
    closest() { return null; },
    contains() { return false; },
    getBoundingClientRect() { return { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100, x: 0, y: 0 }; },
    getClientRects() { return []; },
    focus() {}, blur() {}, click() {},
    toDataURL() { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='; },
    getContext(type) {
      if (type === '2d') return create2DContext();
      if (type === 'webgl' || type === 'experimental-webgl') return createWebGLContext();
      return null;
    },
  };
  return el;
}

function create2DContext() {
  return new Proxy({
    canvas: { toDataURL() { return 'data:image/png;base64,'; }, width: 300, height: 150 },
    font: '10px sans-serif', textBaseline: 'alphabetic', textAlign: 'start',
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', shadowBlur: 0, shadowColor: 'rgba(0,0,0,0)',
    shadowOffsetX: 0, shadowOffsetY: 0, lineCap: 'butt', lineJoin: 'miter',
  }, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      // 大部分 canvas 方法返回 void 或简单值
      if (prop === 'measureText') return (t) => ({ width: (t||'').length * 6 });
      if (prop === 'getImageData') return () => ({ data: new Uint8Array(4), width: 1, height: 1 });
      if (prop === 'createImageData') return () => ({ data: new Uint8Array(4), width: 1, height: 1 });
      if (prop === 'isPointInPath') return () => false;
      return function() { return undefined; };
    }
  });
}

function createWebGLContext() {
  return new Proxy({}, {
    get(obj, prop) {
      if (prop === 'getParameter') return (p) => {
        if (p === 37446) return 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630, OpenGL 4.6)';
        if (p === 37445) return 'Google Inc. (Intel)';
        if (p === 7938) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
        if (p === 7936) return 'WebKit';
        if (p === 7937) return 'WebKit WebGL';
        return 0;
      };
      if (prop === 'getExtension') return (name) => {
        if (name === 'WEBGL_debug_renderer_info') return { UNMASKED_VENDOR_WEBGL: 37445, UNMASKED_RENDERER_WEBGL: 37446 };
        return null;
      };
      if (prop === 'getSupportedExtensions') return () => ['WEBGL_debug_renderer_info', 'EXT_texture_filter_anisotropic'];
      if (prop === 'canvas') return { toDataURL() { return 'data:image/png;base64,'; }, width: 1, height: 1 };
      if (prop === 'getShaderPrecisionFormat') return () => ({ rangeMin: 127, rangeMax: 127, precision: 23 });
      if (prop === 'getProgramParameter') return () => true;
      if (prop === 'getShaderParameter') return () => true;
      if (prop === 'createBuffer') return () => ({});
      if (prop === 'createProgram') return () => ({});
      if (prop === 'createShader') return () => ({});
      if (typeof prop === 'symbol') return undefined;
      return function() {};
    }
  });
}

// 构建 window 对象
const location = {
  href: pageUrl, protocol: 'https:', host: 'www.dhl.com', hostname: 'www.dhl.com',
  port: '', pathname: '/cn-zh/home/tracking.html',
  search: '?submit=1&tacking-id=1232343&tracking-id=1232343', hash: '',
  origin: 'https://www.dhl.com', toString() { return this.href; }, replace() {}, assign() {}, reload() {},
};

const document = {
  cookie: `_abck=${abck}`,
  title: 'DHL Tracking', referrer: '', domain: 'www.dhl.com', URL: pageUrl,
  characterSet: 'UTF-8', charset: 'UTF-8', contentType: 'text/html',
  readyState: 'complete', visibilityState: 'visible', hidden: false,
  compatMode: 'CSS1Compat', designMode: 'off',
  documentElement: createElementProxy('html'),
  body: createElementProxy('body'),
  head: createElementProxy('head'),
  location: location,
  createElement: (tag) => createElementProxy(tag),
  createDocumentFragment: () => createElementProxy('fragment'),
  createEvent: () => ({ initEvent(){}, preventDefault(){}, stopPropagation(){} }),
  createTextNode: (t) => ({ textContent: t, nodeType: 3 }),
  createComment: () => ({ nodeType: 8 }),
  getElementById: () => null,
  getElementsByTagName: (tag) => {
    if (tag === 'head') return [createElementProxy('head')];
    if (tag === 'body') return [createElementProxy('body')];
    if (tag === 'script') return [];
    if (tag === 'iframe') return [];
    if (tag === 'input') return [];
    if (tag === 'form') return [];
    return [];
  },
  getElementsByClassName: () => [],
  getElementsByName: () => [],
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  write: () => {},
  writeln: () => {},
  hasFocus: () => true,
  createRange: () => ({ selectNode(){}, selectNodeContents(){}, collapse(){}, cloneContents(){ return createElementProxy('div'); } }),
  getSelection: () => ({ rangeCount: 0, toString(){ return ''; } }),
  execCommand: () => false,
  evaluate: () => ({ iterateNext(){ return null; } }),
};

// 给 documentElement 和 body 补全属性
document.documentElement.clientWidth = 1920;
document.documentElement.clientHeight = 1080;
document.body.clientWidth = 1920;
document.body.clientHeight = 1080;
document.body.scrollWidth = 1920;
document.body.scrollHeight = 3000;

const nav = {
  userAgent, appVersion: userAgent.replace('Mozilla/', ''),
  platform: 'Win32', language: 'zh-CN', languages: ['zh-CN', 'zh', 'en'],
  cookieEnabled: true, doNotTrack: null, maxTouchPoints: 0,
  hardwareConcurrency: 8, deviceMemory: 8, onLine: true,
  product: 'Gecko', productSub: '20030107', vendor: 'Google Inc.', vendorSub: '',
  appName: 'Netscape', appCodeName: 'Mozilla', webdriver: false,
  connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false },
  plugins: { length: 5, 0: { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: '', length: 2, 0: { type: 'application/pdf' }, 1: { type: 'text/pdf' } }, item(i){ return this[i]; }, namedItem(){ return null; }, refresh(){} },
  mimeTypes: { length: 2, 0: { type: 'application/pdf', suffixes: 'pdf', description: '' }, item(i){ return this[i]; } },
  permissions: { query(){ return Promise.resolve({ state: 'prompt' }); } },
  mediaDevices: { enumerateDevices(){ return Promise.resolve([]); } },
  getGamepads(){ return []; },
  getBattery(){ return Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1 }); },
  javaEnabled(){ return false; }, sendBeacon(){ return true; },
  requestMediaKeySystemAccess(){ return Promise.reject(new Error('not supported')); },
};

const perf = {
  now: () => Date.now() - startTime,
  timing: {
    navigationStart: startTime, fetchStart: startTime + 1,
    domainLookupStart: startTime + 5, domainLookupEnd: startTime + 10,
    connectStart: startTime + 10, connectEnd: startTime + 50,
    requestStart: startTime + 50, responseStart: startTime + 150,
    responseEnd: startTime + 200, domLoading: startTime + 210,
    domInteractive: startTime + 500, domContentLoadedEventStart: startTime + 500,
    domContentLoadedEventEnd: startTime + 510, domComplete: startTime + 800,
    loadEventStart: startTime + 800, loadEventEnd: startTime + 810,
  },
  navigation: { type: 0, redirectCount: 0 },
  getEntriesByType() { return []; }, getEntriesByName() { return []; },
  mark() {}, measure() {}, clearMarks() {}, clearMeasures() {},
};

function XHRConstructor() {
  this.readyState = 0; this.status = 0; this.responseText = '';
  this.withCredentials = false; this.responseType = '';
  this.timeout = 0; this.upload = { addEventListener(){} };
  this._headers = {};
  this.open = function(method, url) { this._method = method; this._url = url; this.readyState = 1; };
  this.send = function(body) {
    if (body && typeof body === 'string') {
      try {
        const parsed = JSON.parse(body);
        if (parsed.sensor_data) {
          sensorData = parsed.sensor_data;
          sensorUrl = this._url;
          process.stderr.write(`[XHR.send] sensor_data captured! length=${sensorData.length}\n`);
        }
      } catch(e) {}
    }
    this.readyState = 4; this.status = 200;
    this.responseText = '{"success":true}';
    if (this.onreadystatechange) this.onreadystatechange();
    if (this.onload) this.onload();
  };
  this.setRequestHeader = function(k, v) { this._headers[k] = v; };
  this.getResponseHeader = function() { return null; };
  this.getAllResponseHeaders = function() { return ''; };
  this.abort = function() {};
  this.addEventListener = function(ev, cb) { if (ev === 'load') this.onload = cb; };
  this.removeEventListener = function() {};
  this.overrideMimeType = function() {};
}

const win = {
  document, navigator: nav, screen: {
    width: 1920, height: 1080, availWidth: 1920, availHeight: 1040,
    colorDepth: 24, pixelDepth: 24,
    orientation: { type: 'landscape-primary', angle: 0, addEventListener(){} },
  },
  location, performance: perf,
  innerWidth: 1920, innerHeight: 1080, outerWidth: 1920, outerHeight: 1080,
  screenX: 0, screenY: 0, screenLeft: 0, screenTop: 0,
  pageXOffset: 0, pageYOffset: 0, scrollX: 0, scrollY: 0,
  devicePixelRatio: 1, visualViewport: { width: 1920, height: 1080 },
  history: { length: 1, pushState(){}, replaceState(){}, back(){}, forward(){}, go(){} },
  localStorage: { getItem(){ return null; }, setItem(){}, removeItem(){}, clear(){}, length: 0, key(){ return null; } },
  sessionStorage: { getItem(){ return null; }, setItem(){}, removeItem(){}, clear(){}, length: 0, key(){ return null; } },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return true; },
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  getComputedStyle: () => new Proxy({}, { get(t, p) { if (typeof p === 'symbol') return undefined; return ''; } }),
  matchMedia: () => ({ matches: false, addListener(){}, removeListener(){}, addEventListener(){} }),
  getSelection: () => ({ rangeCount: 0, toString(){ return ''; } }),
  open: () => null, close(){}, focus(){}, blur(){}, print(){}, stop(){}, alert(){}, confirm(){ return false; }, prompt(){ return null; },
  scroll(){}, scrollTo(){}, scrollBy(){},
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  XMLHttpRequest: XHRConstructor,
  XDomainRequest: undefined,
  ActiveXObject: undefined,
  fetch: () => Promise.resolve({ ok: true, status: 200, json(){ return Promise.resolve({}); }, text(){ return Promise.resolve(''); } }),
  Image: function() { this.src = ''; },
  Audio: function() { this.canPlayType = () => ''; },
  Event: function(type, opts) { this.type = type; this.timeStamp = Date.now(); this.bubbles = false; this.cancelable = false; },
  CustomEvent: function(type) { this.type = type; },
  MouseEvent: function(type) { this.type = type; },
  KeyboardEvent: function(type) { this.type = type; },
  MessageEvent: function(type) { this.type = type; },
  ErrorEvent: function(type) { this.type = type; },
  MutationObserver: function() { this.observe = function(){}; this.disconnect = function(){}; this.takeRecords = function(){ return []; }; },
  IntersectionObserver: function() { this.observe = function(){}; this.disconnect = function(){}; },
  ResizeObserver: function() { this.observe = function(){}; this.disconnect = function(){}; },
  PerformanceObserver: function() { this.observe = function(){}; this.disconnect = function(){}; },
  WebSocket: function() { this.send = function(){}; this.close = function(){}; this.addEventListener = function(){}; },
  Worker: function() { this.postMessage = function(){}; this.terminate = function(){}; this.addEventListener = function(){}; },
  SharedWorker: undefined,
  ServiceWorker: undefined,
  Blob: function(parts, opts) { this.size = 0; this.type = (opts && opts.type) || ''; },
  File: function() {},
  FileReader: function() { this.readAsDataURL = function(){}; this.readAsText = function(){}; this.addEventListener = function(){}; },
  FormData: function() { this.append = function(){}; },
  URLSearchParams: URLSearchParams,
  URL: globalThis.URL || { createObjectURL(){ return 'blob:null'; }, revokeObjectURL(){} },
  AbortController: function() { this.signal = {}; this.abort = function(){}; },
  Headers: function() {},
  Request: function() {},
  Response: function() {},
  crypto: { getRandomValues(arr) { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; }, subtle: {} },
  TextEncoder, TextDecoder,
  Map, Set, WeakMap, WeakSet, WeakRef: globalThis.WeakRef,
  Promise, Proxy, Reflect, Symbol,
  Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
  Float32Array, Float64Array, ArrayBuffer, DataView, SharedArrayBuffer: undefined,
  BigInt: globalThis.BigInt, BigInt64Array: globalThis.BigInt64Array, BigUint64Array: globalThis.BigUint64Array,
  JSON, Math, Date, RegExp, String, Number, Boolean, Array, Object, Function,
  Error, TypeError, RangeError, SyntaxError, URIError, EvalError, ReferenceError,
  AggregateError: globalThis.AggregateError,
  parseInt, parseFloat, isNaN, isFinite, eval: undefined,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
  Infinity, NaN, undefined,
  console: { log(){}, warn(){}, error(){}, info(){}, debug(){}, dir(){}, table(){}, trace(){}, time(){}, timeEnd(){}, group(){}, groupEnd(){} },
  chrome: { runtime: {}, webstore: undefined, csi: function(){}, loadTimes: function(){ return {}; } },
  Notification: function() {},
  SpeechSynthesisUtterance: undefined,
  webkitSpeechRecognition: undefined,
  Intl: globalThis.Intl,
  queueMicrotask: globalThis.queueMicrotask,
  structuredClone: globalThis.structuredClone,
  reportError: function() {},
  __sensor_data: null,
};

// Circular refs
win.self = win; win.top = win; win.parent = win; win.window = win;
win.frames = win; win.globalThis = win;
win.Notification.permission = 'default';

const ctx = vm.createContext(win);
const wrappedCode = `(function(){${fs.readFileSync('dhl/test.js', 'utf-8')}}).call(this);`;

try {
  vm.runInContext(wrappedCode, ctx, { timeout: 15000, filename: 'akamai.js' });
  process.stderr.write('Script completed OK\n');
} catch(e) {
  process.stderr.write(`Script error: ${e.message}\n`);
  const stack = (e.stack || '').split('\n').slice(0, 5).join('\n');
  process.stderr.write(`${stack}\n`);
}

if (sensorData) {
  process.stdout.write(JSON.stringify({ sensor_data: sensorData, url: sensorUrl }));
} else {
  process.stderr.write('No sensor_data captured from XHR\n');
  // Check if bmak exists
  try {
    const check = vm.runInContext(`
      (function(){
        var keys = [];
        for (var k in this) {
          if (this[k] && typeof this[k] === 'object' && this[k].bmak) keys.push(k);
        }
        return JSON.stringify({ hasBmak: !!this.bmak, windowKeys: keys });
      }).call(this)
    `, ctx, { timeout: 3000 });
    process.stderr.write(`bmak check: ${check}\n`);
  } catch(e) {}
  process.stdout.write(JSON.stringify({ error: 'no sensor_data' }));
}
