// ==================== 补环境 ====================
function P(name, obj = {}) {
    return new Proxy(obj, {
        get(t, p) {
            if (p === Symbol.toPrimitive || p === Symbol.toStringTag || p === 'toJSON') return undefined;
            var v = t[p];
            if (v === undefined && typeof p === 'string') {
                console.log(`[ENV] ${name}.${p} -> undefined`);
            }
            return v;
        },
        set(t, p, v) {
            var disp = typeof v === 'object' ? '[object]' : (typeof v === 'string' && v.length > 120 ? v.substring(0, 120) + '...' : v);
            console.log(`[ENV] ${name}.${p} = ${disp}`);
            t[p] = v;
            return true;
        }
    });
}
function makeDOMEl(tag) {
    var props = {
        tagName: tag.toUpperCase(),
        nodeName: tag.toUpperCase(),
        nodeType: 1,  // ELEMENT_NODE
        ATTRIBUTE_NODE: 2,
        baseURI: 'https://www.ihg.com/content/us/en/about/brands',
        ownerDocument: null,
        parentNode: null,
        childNodes: [], children: [], style: {}, dataset: {},
        classList: { add(){}, remove(){}, contains(){ return false; } },
        className: '',
        id: '',
        innerHTML: '',
        outerHTML: '',
        textContent: '',
        setAttribute(k, v) { this[k] = v; },
        getAttribute(k) { return this[k] || null; },
        hasAttribute(k) { return this[k] !== undefined; },
        removeAttribute(k) { delete this[k]; },
        appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; },
        removeChild(c) { c.parentNode = null; return c; },
        remove() { if (this.parentNode) this.parentNode.removeChild(this); },
        addEventListener(type, fn) {},
        removeEventListener() {},
        getElementsByTagName() { return []; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getBoundingClientRect() { return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 }; },
        cloneNode() { return makeDOMEl(tag); },
        contains() { return false; },
        insertBefore(n, ref) { return n; },
        dispatchEvent() { return true; },
        focus() {},
        blur() {},
    };
    if (tag === 'iframe') {
        props.contentWindow = global.window;
        props.contentDocument = document;
        props.srcdoc = '';
        props.src = '';
    }
    if (tag === 'canvas') {
        props.width = 300; props.height = 150;
        props.toDataURL = function() { return 'data:image/png;base64,iVBORw0KGgo='; };
        props.getContext = function(type) {
            if (type === 'webgl' || type === 'experimental-webgl' || type === 'webgl2') {
                return P('WebGLCtx', {
                    getExtension(name) {
                        if (name === 'WEBGL_debug_renderer_info') {
                            return { UNMASKED_VENDOR_WEBGL: 0x9245, UNMASKED_RENDERER_WEBGL: 0x9246 };
                        }
                        return null;
                    },
                    getParameter(pname) {
                        if (pname === 0x9245) return 'Google Inc. (NVIDIA)';
                        if (pname === 0x9246) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)';
                        if (pname === 0x1F01) return 'WebKit WebGL';
                        if (pname === 0x1F00) return 'WebKit';
                        if (pname === 0x1F02) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
                        if (pname === 0x8B8C) return 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)';
                        return 0;
                    },
                    getSupportedExtensions() { return ['WEBGL_debug_renderer_info']; },
                    getShaderPrecisionFormat() { return { rangeMin: 127, rangeMax: 127, precision: 23 }; },
                    createBuffer() { return {}; },
                    bindBuffer() {},
                    bufferData() {},
                    createProgram() { return {}; },
                    createShader() { return {}; },
                    shaderSource() {},
                    compileShader() {},
                    attachShader() {},
                    linkProgram() {},
                    useProgram() {},
                    drawArrays() {},
                    canvas: { width: 300, height: 150 },
                });
            }
            // 2D context
            return P('Canvas2DCtx', {
                fillStyle:'', font:'', textBaseline:'', strokeStyle:'', globalCompositeOperation:'',
                fillRect(){}, fillText(){}, strokeText(){},
                measureText(){ return {width:0}; },
                beginPath(){}, moveTo(){}, lineTo(){},
                stroke(){}, fill(){}, arc(){}, closePath(){}, rect(){},
                clip(){}, save(){}, restore(){}, translate(){}, rotate(){},
                scale(){}, drawImage(){}, clearRect(){},
                createLinearGradient(){ return {addColorStop(){}}; },
                getImageData(){ return {data:new Uint8ClampedArray(0)}; },
                isPointInPath(){ return false; },
            });
        };
    }
    if (tag === 'input') {
        props.type = '';
        props.capture = '';
    }
    return P(`<${tag}>`, props);
}

var window = global;
global.window = global;
var _eventListeners = {};
function _dispatchEvent(type, evt) {
    evt.type = type;
    if (_eventListeners[type]) {
        _eventListeners[type].forEach(function(fn) { try { fn(evt); } catch(e) {} });
    }
}
var document = P('document', {
    cookie: '',
    URL: 'https://www.ihg.com/content/us/en/about/brands',
    title: 'IHG: Our Brands Homepage',
    referrer: '',
    domain: 'www.ihg.com',
    characterSet: 'UTF-8',
    contentType: 'text/html',
    readyState: 'complete',
    visibilityState: 'visible',
    hidden: false,
    documentMode: undefined, // IE only
    activeElement: P('activeElement', { tagName: 'BODY' }),
    head: P('<head>', {
        childElementCount: 0,
        appendChild(c) { c.parentNode = this; return c; },
        removeChild(c) { c.parentNode = null; return c; },
    }),
    body: P('<body>', {
        innerHTML: '', childElementCount: 0,
        appendChild(c) { c.parentNode = this; return c; },
        removeChild(c) { c.parentNode = null; return c; },
    }),
    documentElement: P('documentElement', {
        nodeType: 1,
        tagName: 'HTML',
        getAttribute(k) { return null; },
        hasAttribute(k) { return false; },
        style: {},
    }),
    createElement(tag) { return makeDOMEl(tag); },
    createTextNode(text) { return { nodeType: 3, textContent: text }; },
    createDocumentFragment() { return { nodeType: 11, childNodes: [], appendChild(c) { this.childNodes.push(c); return c; } }; },
    getElementsByTagName(tag) {
        if (tag === 'head') return [this.head];
        if (tag === 'body') return [this.body];
        if (tag === 'script') return [this.currentScript];
        return [];
    },
    getElementsByClassName() { return []; },
    querySelector(sel) { return null; },
    querySelectorAll(sel) { return []; },
    createEvent(type) {
        return { type: '', initEvent(t, b, c) { this.type = t; } };
    },
    appendChild(c) { return c; },
    removeChild(c) { return c; },
    getElementById(id) { return null; },
    addEventListener(type, fn) {
        if (!_eventListeners[type]) _eventListeners[type] = [];
        _eventListeners[type].push(fn);
    },
    removeEventListener(type, fn) {
        if (_eventListeners[type]) _eventListeners[type] = _eventListeners[type].filter(f => f !== fn);
    },
    attachEvent(type, fn) { this.addEventListener(type.replace('on',''), fn); },
    currentScript: P('<script>', {
        src: '',
        tagName: 'SCRIPT',
        parentNode: null,
        getAttribute(k) { return k === 'src' ? this.src : null; },
    }),
    all: [],
    location: null,
    // Akamai 检测属性 — 返回 undefined 表示不存在
    XPathResult: undefined,
    $chrome_asyncScriptInfo: undefined,
    $cdc_asdjflasutopfhvcZLmcfl_: undefined,
});
var location = P('location', {
    ancestorOrigins: {},
    href: "https://www.ihg.com/content/us/en/about/brands",
    origin: "https://www.ihg.com",
    protocol: "https:",
    host: "www.ihg.com",
    hostname: "www.ihg.com",
    port: "",
    pathname: "/content/us/en/about/brands",
    search: "",
    hash: "",
});

// --- plugins 和 mimeTypes 模拟 ---
var _pluginNames = ['PDF Viewer', 'Chrome PDF Viewer', 'Chromium PDF Viewer', 'Microsoft Edge PDF Viewer', 'WebKit built-in PDF'];
var _mimeTypes = [
    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
    { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
];

function makePluginArray(names) {
    var arr = names.map(function(name) {
        return { name: name, filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2 };
    });
    arr.length = names.length;
    arr.item = function(i) { return arr[i] || null; };
    arr.namedItem = function(n) { return arr.find(function(p){ return p.name === n; }) || null; };
    arr.refresh = function() {};
    return arr;
}

function makeMimeTypeArray(types) {
    var arr = types.map(function(t) { return { type: t.type, suffixes: t.suffixes, description: t.description }; });
    arr.length = types.length;
    arr.item = function(i) { return arr[i] || null; };
    arr.namedItem = function(n) { return arr.find(function(m){ return m.type === n; }) || null; };
    return arr;
}

var navigator = P('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    appVersion: '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    appName: 'Netscape',
    appCodeName: 'Mozilla',
    product: 'Gecko',
    productSub: '20030107',
    vendor: 'Google Inc.',
    vendorSub: '',
    platform: 'Linux x86_64',
    language: 'en-US',
    languages: ['en-US', 'en'],
    webdriver: false,
    hardwareConcurrency: 2,
    maxTouchPoints: 0,
    msMaxTouchPoints: 0,
    deviceMemory: 8,
    cookieEnabled: true,
    onLine: true,
    doNotTrack: null,
    connection: { effectiveType: '3g', rtt: 100, downlink: 1.5, saveData: false, type: undefined },
    oscpu: undefined,
    standalone: undefined,
    plugins: makePluginArray(_pluginNames),
    mimeTypes: makeMimeTypeArray(_mimeTypes),
    // 真实浏览器有这些方法/属性
    javaEnabled: function() { return false; },
    getGamepads: function() { return []; },
    sendBeacon: function() { return true; },
    vibrate: function() { return true; },
    getBattery: function() { return Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1 }); },
    requestMediaKeySystemAccess: function() { return Promise.reject(new Error('not supported')); },
    registerProtocolHandler: function() {},
    // 浏览器对象属性
    credentials: {},
    permissions: { query: function() { return Promise.resolve({ state: 'prompt' }); } },
    mediaDevices: { enumerateDevices: function() { return Promise.resolve([]); }, getUserMedia: function() { return Promise.reject(new Error('not allowed')); } },
    storage: { estimate: function() { return Promise.resolve({ quota: 0, usage: 0 }); }, persist: function() { return Promise.resolve(false); } },
    bluetooth: {},
    serviceWorker: { controller: null, ready: Promise.resolve({}) },
    // 下面这些不存在于 Chrome
    mozAlarms: undefined,
    mozConnection: undefined,
    mozIsLocallyAvailable: undefined,
    mozPhoneNumberService: undefined,
    msManipulationViewsEnabled: undefined,
    requestWakeLock: undefined,
    storeWebWideTrackingException: undefined,
    webkitGetGamepads: undefined,
    webkitTemporaryStorage: undefined,
    brave: undefined,
    getStorageUpdates: undefined,
    appMinorVersion: undefined,
});
Object.defineProperty(globalThis, 'navigator', { value: navigator, writable: true, configurable: true });

var screen = P('screen', {
    width: 800,
    height: 600,
    availWidth: 800,
    availHeight: 600,
    colorDepth: 24,
    pixelDepth: 24,
    orientation: { type: 'landscape-primary', angle: 0 },
});

// --- localStorage: ak_a/ak_ax 由 sensor_wrapper.cjs 动态注入 ---
var _lsData = {};
var localStorage = P('localStorage', {
    _d: _lsData,
    getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
    clear() { this._d = {}; },
    get length() { return Object.keys(this._d).length; },
    key(i) { return Object.keys(this._d)[i] || null; },
});
var sessionStorage = P('sessionStorage', {
    _d: {},
    getItem(k) { return this._d[k] !== undefined ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
    clear() { this._d = {}; },
    get length() { return Object.keys(this._d).length; },
    key(i) { return Object.keys(this._d)[i] || null; },
});

document.location = location;
window.document = document;
window.location = location;
window.navigator = navigator;
window.screen = screen;
window.localStorage = localStorage;
window.sessionStorage = sessionStorage;
window.XMLHttpRequest = class XMLHttpRequest {
    constructor() {
        this.readyState = 0; this.status = 0; this.statusText = '';
        this.responseText = ''; this.response = '';
        this.responseType = ''; this.responseURL = '';
        this.withCredentials = false; this.timeout = 0;
        this._headers = {}; this._url = ''; this._method = '';
        this.onreadystatechange = null; this.onload = null;
        this.onerror = null; this.onabort = null;
        this.ontimeout = null; this.onprogress = null;
        this.upload = { addEventListener() {}, removeEventListener() {} };
        this.UNSENT = 0; this.OPENED = 1; this.HEADERS_RECEIVED = 2;
        this.LOADING = 3; this.DONE = 4;
    }
    open(method, url, async) {
        this._url = url; this._method = method;
        this.readyState = 1;
        if (this.onreadystatechange) this.onreadystatechange();
    }
    setRequestHeader(k, v) { this._headers[k] = v; }
    send(body) {
        // 通知外部 hook (如果设置了)
        if (global._xhrSendHook) {
            global._xhrSendHook(this._method, this._url, body, this._headers);
        }
        const self = this;
        // 模拟异步响应
        setTimeout(function() {
            self.readyState = 2; // HEADERS_RECEIVED
            if (self.onreadystatechange) self.onreadystatechange();

            self.readyState = 4; // DONE
            self.status = 201;
            self.statusText = 'Created';
            // Akamai sensor POST 期望收到 Set-Cookie 响应
            self.responseText = '';
            self.response = '';
            if (self._url && self._url.indexOf('_bm/get_params') !== -1) {
                self.status = 200;
                self.responseText = '{}';
                self.response = '{}';
            }
            if (self.onreadystatechange) self.onreadystatechange();
            if (self.onload) self.onload();
        }, 50);
    }
    abort() { this.readyState = 0; if (this.onabort) this.onabort(); }
    getAllResponseHeaders() { return 'content-type: text/html\r\n'; }
    getResponseHeader(name) {
        if (name.toLowerCase() === 'content-type') return 'text/html';
        return null;
    }
    addEventListener(type, fn) { this['on' + type] = fn; }
    removeEventListener() {}
    dispatchEvent() { return true; }
};
window.browser = undefined;
window.MSStream = undefined;
window.frames = window;
window.self = window;
window.top = window;
window.parent = window;
window.length = 0; // window.frames.length
window.ServiceWorker = undefined;
window.ServiceWorkerContainer = undefined;
window.HTMLIFrameElement = function HTMLIFrameElement() {};
window.HTMLCanvasElement = function HTMLCanvasElement() {};
window.OffscreenCanvas = undefined;
window.matchMedia = function(query) {
    return {
        matches: false,
        media: query,
        onchange: null,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return false; },
    };
};
window.history = P('history', {
    pushState() {},
    replaceState() {},
    back() {},
    forward() {},
    go() {},
    length: 2,
    state: null,
    scrollRestoration: 'auto',
});
window._cf = [];
window.outerWidth = 1920;
window.outerHeight = 1080;
window.innerWidth = 1920;
window.innerHeight = 1080;
window.screenX = 0;
window.screenY = 0;
window.screenLeft = 0;
window.screenTop = 0;
window.pageXOffset = 0;
window.pageYOffset = 0;
window.scrollX = 0;
window.scrollY = 0;
window.devicePixelRatio = 1;
window.performance = global.performance;
window.crypto = {
    getRandomValues(arr) {
        for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        return arr;
    },
    subtle: {},
    randomUUID: function() { return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ Math.floor(Math.random() * 16) >> (c / 4)).toString(16)); },
};
window.Notification = { permission: 'default' };
window.requestAnimationFrame = function(cb) { return setTimeout(cb, 16); };
window.cancelAnimationFrame = function(id) { clearTimeout(id); };
window.getComputedStyle = function(el) {
    return new Proxy({}, {
        get(t, p) {
            if (p === 'getPropertyValue') return function() { return ''; };
            if (p === 'length') return 0;
            return '';
        }
    });
};
window.addEventListener = function(type, fn) {
    if (!_eventListeners[type]) _eventListeners[type] = [];
    _eventListeners[type].push(fn);
};
window.removeEventListener = function(type, fn) {};
window.dispatchEvent = function(evt) { return true; };
window.atob = function(s) { return Buffer.from(s, 'base64').toString('binary'); };
window.btoa = function(s) { return Buffer.from(s, 'binary').toString('base64'); };
window.setTimeout = setTimeout;
window.setInterval = setInterval;
window.clearTimeout = clearTimeout;
window.clearInterval = clearInterval;
window.Date = Date;
window.Math = Math;
window.parseInt = parseInt;
window.parseFloat = parseFloat;
window.isNaN = isNaN;
window.isFinite = isFinite;
window.encodeURIComponent = encodeURIComponent;
window.decodeURIComponent = decodeURIComponent;
window.JSON = JSON;
window.Array = Array;
window.Object = Object;
window.String = String;
window.Number = Number;
window.Boolean = Boolean;
window.RegExp = RegExp;
window.Error = Error;
window.TypeError = TypeError;
window.RangeError = RangeError;
window.Map = Map;
window.Set = Set;
window.WeakMap = WeakMap;
window.WeakSet = WeakSet;
window.Promise = Promise;
window.Symbol = Symbol;
window.Uint8Array = Uint8Array;
window.Uint16Array = Uint16Array;
window.Uint32Array = Uint32Array;
window.Int8Array = Int8Array;
window.Int16Array = Int16Array;
window.Int32Array = Int32Array;
window.Float32Array = Float32Array;
window.Float64Array = Float64Array;
window.ArrayBuffer = ArrayBuffer;
window.DataView = DataView;
window.TextEncoder = TextEncoder;
window.TextDecoder = TextDecoder;
window.Blob = class Blob { constructor(parts, opts) { this.size = 0; this.type = (opts && opts.type) || ''; } };
window.URL = URL;
window.URLSearchParams = URLSearchParams;
window.Event = class Event { constructor(type, opts) { this.type = type; this.bubbles = false; this.cancelable = false; this.defaultPrevented = false; Object.assign(this, opts); } preventDefault(){this.defaultPrevented=true;} stopPropagation(){} };
window.CustomEvent = class CustomEvent extends window.Event { constructor(type, opts) { super(type, opts); this.detail = opts && opts.detail; } };
window.MouseEvent = class MouseEvent extends window.Event { constructor(type, opts) { super(type, opts); } };
window.KeyboardEvent = class KeyboardEvent extends window.Event { constructor(type, opts) { super(type, opts); } };
window.TouchEvent = undefined; // 桌面无 touch
window.PointerEvent = class PointerEvent extends window.Event { constructor(type, opts) { super(type, opts); } };
window.MutationObserver = class MutationObserver { constructor(cb) {} observe() {} disconnect() {} takeRecords() { return []; } };
window.ResizeObserver = class ResizeObserver { constructor(cb) {} observe() {} disconnect() {} };
window.IntersectionObserver = class IntersectionObserver { constructor(cb) {} observe() {} disconnect() {} };
window.Image = function() { return makeDOMEl('img'); };
window.Audio = function() { return {}; };
window.fetch = function() { return Promise.resolve({ ok: true, status: 200, json() { return Promise.resolve({}); }, text() { return Promise.resolve(''); } }); };
window.XPathResult = { ORDERED_NODE_SNAPSHOT_TYPE: 7 };
window.DOMParser = class DOMParser { parseFromString() { return document; } };
window.XMLSerializer = class XMLSerializer { serializeToString() { return ''; } };
window.Worker = undefined;
window.SharedWorker = undefined;
window.WebSocket = function() {};
window.EventSource = function() {};
window.AbortController = class AbortController { constructor() { this.signal = { aborted: false }; } abort() { this.signal.aborted = true; } };
window.queueMicrotask = queueMicrotask;
window.structuredClone = typeof structuredClone !== 'undefined' ? structuredClone : function(v) { return JSON.parse(JSON.stringify(v)); };
// ==================== 补环境结束 ====================
