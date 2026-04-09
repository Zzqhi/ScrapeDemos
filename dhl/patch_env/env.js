// Comprehensive browser environment patch for Akamai bundle execution
// Based on real Chrome 146 + Windows 10 + NVIDIA RTX 4060 captures
//
// Usage: require('./env.js').setup(config)
// Then: eval(bundleCode)

function setup(config) {
  const cfg = config || {};
  const startTime = Date.now();
  const userAgent = cfg.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
  const pageUrl = cfg.pageUrl || 'https://www.dhl.com/cn-zh/home/tracking.html';
  const cookieStr = cfg.cookie || '';
  const postUrl = cfg.postUrl || '';

  // ═══════════════════════════════════════════════════════════
  // Cookie jar
  // ═══════════════════════════════════════════════════════════
  const cookieJar = {};
  if (cookieStr) {
    cookieStr.split('; ').forEach(c => {
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

  // ═══════════════════════════════════════════════════════════
  // DOM Element factory
  // ═══════════════════════════════════════════════════════════
  function mkEl(tag) {
    tag = (tag || 'div').toLowerCase();
    const el = {
      tagName: tag.toUpperCase(),
      nodeName: tag.toUpperCase(),
      nodeType: 1,
      nodeValue: null,
      ATTRIBUTE_NODE: 2,
      baseURI: pageUrl,
      style: new Proxy({}, {
        get(t, p) { return typeof p === 'symbol' ? undefined : (t[p] !== undefined ? t[p] : ''); },
        set(t, p, v) { t[p] = v; return true; },
      }),
      childNodes: [], children: [],
      innerHTML: '', outerHTML: `<${tag}></${tag}>`, textContent: '', className: '', id: '',
      src: '', href: '', type: '', value: '', name: '', rel: '',
      width: tag === 'canvas' ? 300 : 0,
      height: tag === 'canvas' ? 150 : 0,
      parentNode: null, parentElement: null,
      nextSibling: null, previousSibling: null,
      firstChild: null, lastChild: null,
      offsetWidth: 100, offsetHeight: 100, offsetLeft: 0, offsetTop: 0,
      scrollWidth: 100, scrollHeight: 100,
      clientWidth: tag === 'html' ? (cfg.innerWidth || 1036) : 100,
      clientHeight: tag === 'html' ? (cfg.innerHeight || 799) : 100,
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {}, length: 0 },
      dataset: {},
      attributes: [],
      ownerDocument: null, // set later
      setAttribute(k, v) { this[k] = v; },
      getAttribute(k) { return this[k] !== undefined ? String(this[k]) : null; },
      removeAttribute() {},
      hasAttribute(k) { return this[k] !== undefined && this[k] !== ''; },
      appendChild(c) { if (c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; c.parentElement = this; } return c; },
      removeChild(c) { return c; },
      insertBefore(n, ref) { this.childNodes.push(n); return n; },
      replaceChild(n, o) { return n; },
      cloneNode() { return mkEl(tag); },
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
      getElementsByTagName(t) {
        t = t.toLowerCase();
        if (t === 'div') return [mkEl('div')];
        return [];
      },
      getElementsByClassName() { return []; },
      querySelector(sel) { return null; },
      querySelectorAll(sel) { return []; },
      matches() { return false; },
      closest() { return null; },
      contains() { return false; },
      getBoundingClientRect() {
        return { top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100, x: 0, y: 0 };
      },
      getClientRects() { return [{ top: 0, left: 0, bottom: 100, right: 100, width: 100, height: 100 }]; },
      focus() {}, blur() {}, click() {},
      toString() { return `[object HTML${tag.charAt(0).toUpperCase() + tag.slice(1)}Element]`; },
    };

    // Canvas support
    if (tag === 'canvas') {
      el.toDataURL = function(type) {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAASwAAACWCAYAAABkW7XSAAAE';
      };
      el.getContext = function(type) {
        if (type === '2d') return make2dContext(el);
        if (type === 'webgl' || type === 'experimental-webgl') return makeWebGLContext(el);
        if (type === 'webgl2') return makeWebGL2Context(el);
        return null;
      };
    }

    return el;
  }

  function make2dContext(canvas) {
    return {
      canvas: canvas,
      fillRect() {}, clearRect() {}, strokeRect() {},
      fillText() {}, strokeText() {},
      beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
      arc() {}, arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
      rect() {}, fill() {}, stroke() {}, clip() {},
      save() {}, restore() {},
      translate() {}, rotate() {}, scale() {}, transform() {}, setTransform() {}, resetTransform() {},
      drawImage() {}, putImageData() {},
      measureText(t) { return { width: (t || '').length * 6.5 }; },
      getImageData(x, y, w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
      createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; },
      createLinearGradient() { return { addColorStop() {} }; },
      createRadialGradient() { return { addColorStop() {} }; },
      createPattern() { return {}; },
      isPointInPath() { return false; },
      font: '10px sans-serif', textBaseline: 'alphabetic', textAlign: 'start',
      fillStyle: '#000000', strokeStyle: '#000000',
      lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
      globalAlpha: 1, globalCompositeOperation: 'source-over',
      shadowBlur: 0, shadowColor: 'rgba(0, 0, 0, 0)',
      shadowOffsetX: 0, shadowOffsetY: 0,
      imageSmoothingEnabled: true,
    };
  }

  // GPU info from real browser capture
  const GPU_VENDOR = cfg.gpuVendor || 'Google Inc. (NVIDIA)';
  const GPU_RENDERER = cfg.gpuRenderer || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Laptop GPU (0x000028E0) Direct3D11 vs_5_0 ps_5_0, D3D11)';

  function makeWebGLContext(canvas) {
    const UNMASKED_VENDOR = 37445;
    const UNMASKED_RENDERER = 37446;
    const ctx = {
      canvas: canvas,
      drawingBufferWidth: 1, drawingBufferHeight: 1,
      getParameter(p) {
        if (p === UNMASKED_RENDERER) return GPU_RENDERER;
        if (p === UNMASKED_VENDOR) return GPU_VENDOR;
        if (p === 7938) return 'WebGL 1.0 (OpenGL ES 2.0 Chromium)';
        if (p === 7936) return 'WebKit';
        if (p === 7937) return 'WebKit WebGL';
        if (p === 3379) return 16384; // MAX_TEXTURE_SIZE
        if (p === 3386) return new Int32Array([32767, 32767]); // MAX_VIEWPORT_DIMS
        if (p === 34076) return 16384; // MAX_CUBE_MAP_TEXTURE_SIZE
        if (p === 34024) return 16384; // MAX_RENDERBUFFER_SIZE
        if (p === 36349) return 1024; // MAX_VARYING_VECTORS
        if (p === 36347) return 4096; // MAX_VERTEX_UNIFORM_VECTORS
        if (p === 36348) return 1024; // MAX_FRAGMENT_UNIFORM_VECTORS
        return 0;
      },
      getExtension(name) {
        if (name === 'WEBGL_debug_renderer_info') {
          return { UNMASKED_VENDOR_WEBGL: UNMASKED_VENDOR, UNMASKED_RENDERER_WEBGL: UNMASKED_RENDERER };
        }
        if (name === 'EXT_texture_filter_anisotropic') return { MAX_TEXTURE_MAX_ANISOTROPY_EXT: 34047 };
        return {};
      },
      getSupportedExtensions() {
        return ['WEBGL_debug_renderer_info', 'EXT_texture_filter_anisotropic', 'WEBGL_lose_context',
                'WEBGL_compressed_texture_s3tc', 'WEBGL_depth_texture'];
      },
      getShaderPrecisionFormat(shaderType, precisionType) {
        return { rangeMin: 127, rangeMax: 127, precision: 23 };
      },
      createBuffer() { return {}; }, createProgram() { return {}; }, createShader() { return {}; },
      createTexture() { return {}; }, createFramebuffer() { return {}; }, createRenderbuffer() { return {}; },
      getProgramParameter() { return true; }, getShaderParameter() { return true; },
      shaderSource() {}, compileShader() {}, attachShader() {}, linkProgram() {}, useProgram() {},
      bindBuffer() {}, bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {},
      drawArrays() {}, drawElements() {}, viewport() {}, clear() {}, clearColor() {},
      getAttribLocation() { return 0; }, getUniformLocation() { return {}; },
      uniform1f() {}, uniform2f() {}, uniform3f() {}, uniform4f() {},
      uniform1i() {}, uniform2i() {}, uniform3i() {}, uniform4i() {},
      deleteBuffer() {}, deleteProgram() {}, deleteShader() {}, deleteTexture() {},
      bindTexture() {}, texImage2D() {}, texParameteri() {}, pixelStorei() {},
      enable() {}, disable() {}, blendFunc() {}, depthFunc() {}, scissor() {},
      readPixels() {}, getError() { return 0; },
      isContextLost() { return false; },
    };
    return ctx;
  }

  function makeWebGL2Context(canvas) {
    const ctx = makeWebGLContext(canvas);
    ctx.getParameter = function(p) {
      if (p === 37445) return GPU_VENDOR;
      if (p === 37446) return GPU_RENDERER;
      if (p === 7938) return 'WebGL 2.0 (OpenGL ES 3.0 Chromium)';
      return makeWebGLContext(canvas).getParameter(p);
    };
    return ctx;
  }

  // ═══════════════════════════════════════════════════════════
  // XHR — capture sensor_data
  // ═══════════════════════════════════════════════════════════
  let sensorData = null;
  const sensorHistory = [];
  let sensorCount = 0;

  function XMLHttpRequest() {
    this.readyState = 0; this.status = 0; this.responseText = '';
    this.withCredentials = false; this.timeout = 0;
    this.upload = { addEventListener() {} };
    this._headers = {};
    this.open = function(m, u) { this._method = m; this._url = u; this.readyState = 1; };
    this.send = function(body) {
      if (body && typeof body === 'string') {
        try {
          const p = JSON.parse(body);
          if (p.sensor_data) {
            sensorCount++;
            sensorData = p.sensor_data;
            sensorHistory.push(sensorData);
            process.stderr.write(`[XHR #${sensorCount}] sensor len=${sensorData.length}\n`);
          }
        } catch(e) {
          if (body.length > 50) {
            sensorCount++;
            sensorData = body;
            sensorHistory.push(sensorData);
            process.stderr.write(`[XHR #${sensorCount}] raw body len=${body.length}\n`);
          }
        }
      }
      this.readyState = 4; this.status = 200; this.responseText = '{"success":true}';
      if (this.onreadystatechange) this.onreadystatechange();
      if (this.onload) this.onload();
    };
    this.setRequestHeader = function(k, v) { this._headers[k] = v; };
    this.getResponseHeader = function(h) { return null; };
    this.getAllResponseHeaders = function() { return ''; };
    this.abort = function() {};
    this.addEventListener = function(ev, cb) {
      if (ev === 'load') this.onload = cb;
      if (ev === 'readystatechange') this.onreadystatechange = cb;
      if (ev === 'error') this.onerror = cb;
    };
    this.removeEventListener = function() {};
    this.overrideMimeType = function() {};
  }

  // ═══════════════════════════════════════════════════════════
  // URL parsing
  // ═══════════════════════════════════════════════════════════
  const parsedUrl = new URL(pageUrl);

  // ═══════════════════════════════════════════════════════════
  // Document
  // ═══════════════════════════════════════════════════════════
  const docEl = mkEl('html');
  docEl.clientWidth = cfg.innerWidth || 1036;
  docEl.clientHeight = cfg.innerHeight || 799;

  const body = mkEl('body');
  body.clientWidth = cfg.innerWidth || 1036;
  body.clientHeight = cfg.innerHeight || 799;

  const head = mkEl('head');
  const scriptEl = mkEl('script');
  if (postUrl) {
    try { scriptEl.src = new URL(postUrl).pathname; } catch(e) { scriptEl.src = postUrl; }
  }

  // Form elements for ffs/inf
  const formEl = mkEl('form');
  const inputEls = [];
  const formInputs = cfg.formInputs || [
    { id: 'trackingnumber-0', name: 'q', type: 'text' },
    { id: 'search-0', name: 'q', type: 'text' },
    { id: 'trackingnumber-1', name: 'q', type: 'text' },
    { id: 'fromCity', name: 'q', type: 'text' },
  ];
  formInputs.forEach(fi => {
    const inp = mkEl('input');
    inp.id = fi.id || '';
    inp.name = fi.name || '';
    inp.type = fi.type || 'text';
    inp.value = fi.value || '';
    inp.autocomplete = fi.autocomplete || '';
    inputEls.push(inp);
  });

  const document = {
    get cookie() { return getCookie(); },
    set cookie(v) { setCookie(v); },
    title: 'DHL Tracking',
    referrer: '',
    domain: parsedUrl.hostname,
    URL: pageUrl,
    documentURI: pageUrl,
    characterSet: 'UTF-8',
    charset: 'UTF-8',
    inputEncoding: 'UTF-8',
    contentType: 'text/html',
    readyState: 'complete',
    visibilityState: 'visible',
    hidden: false,
    compatMode: 'CSS1Compat',
    documentElement: docEl,
    body: body,
    head: head,
    location: null, // set below
    defaultView: null, // set below
    activeElement: body,
    fullscreenElement: null,
    pointerLockElement: null,
    styleSheets: { length: 0 },
    fonts: { ready: Promise.resolve(), check() { return true; }, forEach() {} },
    createElement: mkEl,
    createElementNS(ns, tag) { return mkEl(tag); },
    createDocumentFragment() { return mkEl('fragment'); },
    createEvent(type) { return { type: '', initEvent() {}, preventDefault() {}, stopPropagation() {} }; },
    createTextNode(t) { return { textContent: t, nodeType: 3, nodeName: '#text' }; },
    createComment(t) { return { textContent: t, nodeType: 8, nodeName: '#comment' }; },
    getElementById(id) {
      for (const inp of inputEls) { if (inp.id === id) return inp; }
      return null;
    },
    getElementsByTagName(tag) {
      tag = tag.toLowerCase();
      if (tag === 'head') return [head];
      if (tag === 'body') return [body];
      if (tag === 'script') return [scriptEl];
      if (tag === 'form') return [formEl];
      if (tag === 'input') return inputEls;
      if (tag === 'html') return [docEl];
      if (tag === 'iframe') return [];
      if (tag === 'div') return [mkEl('div')];
      if (tag === '*') return [docEl, head, body, scriptEl, ...inputEls];
      return [];
    },
    getElementsByClassName() { return []; },
    getElementsByName() { return []; },
    querySelector(sel) {
      if (sel && (sel.includes('script[src') || sel === 'script[type="text/javascript"]')) return scriptEl;
      if (sel === 'html') return docEl;
      if (sel === 'body') return body;
      if (sel === 'head') return head;
      return null;
    },
    querySelectorAll(sel) {
      if (sel && sel.includes('script')) return [scriptEl];
      if (sel && sel.includes('form')) return [formEl];
      if (sel && sel.includes('input')) return inputEls;
      return [];
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    write() {}, writeln() {},
    hasFocus() { return true; },
    createRange() {
      return { selectNode() {}, collapse() {}, cloneContents() { return mkEl('div'); }, getBoundingClientRect() { return { width: 0 }; } };
    },
    getSelection() { return { rangeCount: 0, toString() { return ''; } }; },
    execCommand() { return false; },
    evaluate() { return { iterateNext() { return null; } }; },
    nodeType: 9,
    childNodes: [docEl],
    createTreeWalker() { return { nextNode() { return null; } }; },
    adoptNode(n) { return n; },
    importNode(n) { return n; },
    createNSResolver() { return null; },
    xmlVersion: null,
  };

  // ═══════════════════════════════════════════════════════════
  // Location
  // ═══════════════════════════════════════════════════════════
  const location = {
    href: pageUrl,
    protocol: parsedUrl.protocol,
    host: parsedUrl.host,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || '',
    pathname: parsedUrl.pathname,
    search: parsedUrl.search,
    hash: '',
    origin: parsedUrl.origin,
    ancestorOrigins: { length: 0 },
    toString() { return this.href; },
    replace() {}, assign() {}, reload() {},
  };
  document.location = location;

  // ═══════════════════════════════════════════════════════════
  // Navigator — with userAgentData (critical for sww s0XX fields!)
  // ═══════════════════════════════════════════════════════════
  const uaBrands = [
    { brand: 'Chromium', version: '146' },
    { brand: 'Not-A.Brand', version: '24' },
    { brand: 'Google Chrome', version: '146' },
  ];
  const uaFullBrands = [
    { brand: 'Chromium', version: '146.0.7680.178' },
    { brand: 'Not-A.Brand', version: '24.0.0.0' },
    { brand: 'Google Chrome', version: '146.0.7680.178' },
  ];

  const navigator = {
    userAgent: userAgent,
    appVersion: userAgent.replace('Mozilla/', ''),
    appName: 'Netscape',
    appCodeName: 'Mozilla',
    platform: 'Win32',
    language: 'zh-CN',
    languages: ['zh-CN', 'zh'],
    cookieEnabled: true,
    doNotTrack: null,
    maxTouchPoints: 0,
    hardwareConcurrency: cfg.hardwareConcurrency || 8,
    deviceMemory: cfg.deviceMemory || 8,
    onLine: true,
    product: 'Gecko',
    productSub: '20030107',
    vendor: 'Google Inc.',
    vendorSub: '',
    webdriver: false,
    pdfViewerEnabled: true,
    scheduling: { isInputPending() { return false; } },
    connection: { effectiveType: '4g', rtt: 50, downlink: 10, saveData: false, type: undefined },
    // userAgentData — critical for sww s047/s048 and many s0XX fields
    userAgentData: {
      brands: uaBrands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues(hints) {
        return Promise.resolve({
          brands: uaBrands,
          fullVersionList: uaFullBrands,
          mobile: false,
          model: '',
          platform: 'Windows',
          platformVersion: '19.0.0',
          architecture: 'x86',
          bitness: '64',
          uaFullVersion: '146.0.7680.178',
          wow64: false,
        });
      },
      toJSON() {
        return { brands: uaBrands, mobile: false, platform: 'Windows' };
      },
    },
    plugins: {
      length: 5,
      0: { name: 'PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf', suffixes: 'pdf' }, 1: { type: 'text/pdf', suffixes: 'pdf' } },
      1: { name: 'Chrome PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf' }, 1: { type: 'text/pdf' } },
      2: { name: 'Chromium PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf' }, 1: { type: 'text/pdf' } },
      3: { name: 'Microsoft Edge PDF Viewer', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf' }, 1: { type: 'text/pdf' } },
      4: { name: 'WebKit built-in PDF', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 2, 0: { type: 'application/pdf' }, 1: { type: 'text/pdf' } },
      item(i) { return this[i] || null; },
      namedItem(n) { for (let i = 0; i < this.length; i++) if (this[i] && this[i].name === n) return this[i]; return null; },
      refresh() {},
      [Symbol.iterator]: function*() { for (let i = 0; i < 5; i++) yield this[i]; },
    },
    mimeTypes: {
      length: 2,
      0: { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null },
      1: { type: 'text/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null },
      item(i) { return this[i] || null; },
      namedItem(t) { for (let i = 0; i < this.length; i++) if (this[i] && this[i].type === t) return this[i]; return null; },
    },
    permissions: { query() { return Promise.resolve({ state: 'prompt', addEventListener() {} }); } },
    mediaDevices: { enumerateDevices() { return Promise.resolve([]); }, addEventListener() {} },
    clipboard: { readText() { return Promise.resolve(''); }, writeText() { return Promise.resolve(); } },
    locks: { request() { return Promise.resolve(); }, query() { return Promise.resolve({ held: [], pending: [] }); } },
    storage: { estimate() { return Promise.resolve({ quota: 4294967296, usage: 19749075 }); }, getDirectory() { return Promise.resolve({}); } },
    serviceWorker: { controller: null, ready: Promise.resolve(), register() { return Promise.resolve(); }, addEventListener() {} },
    credentials: { get() { return Promise.resolve(null); }, create() { return Promise.resolve(null); } },
    geolocation: { getCurrentPosition(s, e) { if (e) e({ code: 1, message: 'denied' }); } },
    javaEnabled() { return false; },
    sendBeacon() { return true; },
    getBattery() { return Promise.resolve({ charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1, addEventListener() {} }); },
    getGamepads() { return [null, null, null, null]; },
    vibrate() { return true; },
    share() { return Promise.reject(); },
    canShare() { return false; },
  };

  // ═══════════════════════════════════════════════════════════
  // Screen
  // ═══════════════════════════════════════════════════════════
  const screen = {
    width: cfg.screenWidth || 1536,
    height: cfg.screenHeight || 960,
    availWidth: cfg.availWidth || 1536,
    availHeight: cfg.availHeight || 912,
    colorDepth: cfg.colorDepth || 32,
    pixelDepth: cfg.pixelDepth || 32,
    orientation: {
      type: 'landscape-primary', angle: 0,
      addEventListener() {}, removeEventListener() {},
    },
  };

  // ═══════════════════════════════════════════════════════════
  // Performance
  // ═══════════════════════════════════════════════════════════
  const perfStart = startTime - 2000; // simulate page load ~2s before script
  const performance = {
    now() { return Date.now() - startTime; },
    timeOrigin: perfStart,
    timing: {
      navigationStart: perfStart,
      unloadEventStart: 0, unloadEventEnd: 0,
      redirectStart: 0, redirectEnd: 0,
      fetchStart: perfStart + 1,
      domainLookupStart: perfStart + 5, domainLookupEnd: perfStart + 15,
      connectStart: perfStart + 15, secureConnectionStart: perfStart + 30, connectEnd: perfStart + 80,
      requestStart: perfStart + 85, responseStart: perfStart + 200, responseEnd: perfStart + 250,
      domLoading: perfStart + 260, domInteractive: perfStart + 600,
      domContentLoadedEventStart: perfStart + 600, domContentLoadedEventEnd: perfStart + 615,
      domComplete: perfStart + 900, loadEventStart: perfStart + 900, loadEventEnd: perfStart + 920,
    },
    navigation: { type: 0, redirectCount: 0 },
    getEntriesByType(t) {
      if (t === 'navigation') return [{
        name: pageUrl, entryType: 'navigation', startTime: 0,
        duration: 920, initiatorType: 'navigation',
        nextHopProtocol: 'h2', transferSize: 12000, encodedBodySize: 11000, decodedBodySize: 45000,
        domainLookupStart: 5, domainLookupEnd: 15,
        connectStart: 15, secureConnectionStart: 30, connectEnd: 80,
        requestStart: 85, responseStart: 200, responseEnd: 250,
        domInteractive: 600, domContentLoadedEventStart: 600, domContentLoadedEventEnd: 615,
        domComplete: 900, loadEventStart: 900, loadEventEnd: 920,
        type: 'navigate', redirectCount: 0, unloadEventStart: 0, unloadEventEnd: 0,
        serverTiming: [],
      }];
      if (t === 'resource') return [];
      if (t === 'paint') return [
        { name: 'first-paint', startTime: 350, entryType: 'paint' },
        { name: 'first-contentful-paint', startTime: 350, entryType: 'paint' },
      ];
      return [];
    },
    getEntriesByName() { return []; },
    getEntries() { return []; },
    mark() {}, measure() {}, clearMarks() {}, clearMeasures() {},
  };

  // ═══════════════════════════════════════════════════════════
  // Window / globalThis
  // ═══════════════════════════════════════════════════════════
  const g = globalThis;

  g.document = document;
  g.navigator = navigator;
  g.location = location;
  g.screen = screen;
  g.performance = performance;
  g.XMLHttpRequest = XMLHttpRequest;

  g.window = g;
  g.self = g;
  g.top = g;
  g.parent = g;
  g.frames = g;
  g.length = 0; // frames count

  g.innerWidth = cfg.innerWidth || 1036;
  g.innerHeight = cfg.innerHeight || 799;
  g.outerWidth = cfg.outerWidth || 1051;
  g.outerHeight = cfg.outerHeight || 920;
  g.screenX = 0;
  g.screenY = 0;
  g.screenLeft = 0;
  g.screenTop = 0;
  g.pageXOffset = 0;
  g.pageYOffset = 0;
  g.scrollX = 0;
  g.scrollY = 0;
  g.devicePixelRatio = cfg.devicePixelRatio || 1.25;
  g.isSecureContext = true;
  g.crossOriginIsolated = false;
  g.origin = parsedUrl.origin;
  g.visualViewport = {
    width: cfg.innerWidth || 1036,
    height: cfg.innerHeight || 799,
    offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 0, scale: 1,
    addEventListener() {}, removeEventListener() {},
  };

  document.defaultView = g;

  g.history = { length: 2, state: null, pushState() {}, replaceState() {}, back() {}, forward() {}, go() {} };
  g.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, clear() { this._d = {}; }, get length() { return Object.keys(this._d).length; }, key(i) { return Object.keys(this._d)[i] || null; } };
  g.sessionStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; }, clear() { this._d = {}; }, get length() { return Object.keys(this._d).length; }, key(i) { return Object.keys(this._d)[i] || null; } };

  g.getComputedStyle = function(el) {
    return new Proxy({}, {
      get(t, p) {
        if (typeof p === 'symbol') return undefined;
        if (p === 'getPropertyValue') return function(n) { return ''; };
        if (p === 'length') return 0;
        return '';
      }
    });
  };
  g.matchMedia = function(q) {
    return {
      matches: q.includes('prefers-color-scheme: light') ? true : false,
      media: q,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      onchange: null,
    };
  };

  g.requestAnimationFrame = function(cb) { return setTimeout(cb, 16); };
  g.cancelAnimationFrame = function(id) { clearTimeout(id); };
  g.requestIdleCallback = function(cb) { return setTimeout(() => cb({ didTimeout: false, timeRemaining: () => 50 }), 1); };
  g.cancelIdleCallback = function(id) { clearTimeout(id); };

  g.atob = function(s) { return Buffer.from(s, 'base64').toString('binary'); };
  g.btoa = function(s) { return Buffer.from(s, 'binary').toString('base64'); };

  g.Image = function() { this.src = ''; this.width = 0; this.height = 0; this.addEventListener = function() {}; this.removeEventListener = function() {}; };
  g.Audio = function() { this.canPlayType = function(t) { if (t.includes('mp3') || t.includes('mpeg')) return 'probably'; if (t.includes('ogg') || t.includes('wav') || t.includes('aac')) return 'maybe'; return ''; }; };

  g.Event = function(t, o) { this.type = t; this.timeStamp = Date.now(); this.bubbles = (o && o.bubbles) || false; this.cancelable = (o && o.cancelable) || false; this.preventDefault = function() {}; this.stopPropagation = function() {}; this.stopImmediatePropagation = function() {}; };
  g.CustomEvent = function(t, o) { g.Event.call(this, t, o); this.detail = (o && o.detail) || null; };
  g.MouseEvent = function(t, o) { g.Event.call(this, t, o); this.clientX = 0; this.clientY = 0; this.screenX = 0; this.screenY = 0; this.button = 0; };
  g.KeyboardEvent = function(t, o) { g.Event.call(this, t, o); this.key = ''; this.code = ''; this.keyCode = 0; };
  g.TouchEvent = function(t, o) { g.Event.call(this, t, o); this.touches = []; };
  g.PointerEvent = function(t, o) { g.MouseEvent.call(this, t, o); this.pointerId = 1; this.pointerType = 'mouse'; };
  g.FocusEvent = function(t, o) { g.Event.call(this, t, o); };
  g.WheelEvent = function(t, o) { g.MouseEvent.call(this, t, o); this.deltaX = 0; this.deltaY = 0; this.deltaZ = 0; };
  g.InputEvent = function(t, o) { g.Event.call(this, t, o); this.data = ''; this.inputType = ''; };
  g.ErrorEvent = function(t, o) { g.Event.call(this, t, o); this.message = ''; this.filename = ''; this.lineno = 0; };
  g.MessageEvent = function(t, o) { g.Event.call(this, t, o); this.data = (o && o.data) || null; this.origin = ''; };

  g.MutationObserver = function(cb) { this.observe = function() {}; this.disconnect = function() {}; this.takeRecords = function() { return []; }; };
  g.IntersectionObserver = function(cb, opts) { this.observe = function() {}; this.unobserve = function() {}; this.disconnect = function() {}; };
  g.ResizeObserver = function(cb) { this.observe = function() {}; this.unobserve = function() {}; this.disconnect = function() {}; };
  g.PerformanceObserver = function(cb) { this.observe = function() {}; this.disconnect = function() {}; this.takeRecords = function() { return []; }; };
  g.ReportingObserver = function(cb) { this.observe = function() {}; this.disconnect = function() {}; };

  g.WebSocket = function(url) { this.url = url; this.readyState = 1; this.send = function() {}; this.close = function() {}; this.addEventListener = function() {}; this.removeEventListener = function() {}; };
  g.Worker = function(url) { this.postMessage = function() {}; this.terminate = function() {}; this.addEventListener = function() {}; this.removeEventListener = function() {}; };
  g.SharedWorker = function() { this.port = { start() {}, postMessage() {}, addEventListener() {} }; };
  g.ServiceWorker = function() {};
  g.BroadcastChannel = function() { this.postMessage = function() {}; this.close = function() {}; this.addEventListener = function() {}; };

  g.Blob = function(p, o) { this.size = p ? p.reduce((a, b) => a + (b.length || b.byteLength || 0), 0) : 0; this.type = (o && o.type) || ''; this.slice = function() { return new g.Blob(); }; this.text = function() { return Promise.resolve(''); }; this.arrayBuffer = function() { return Promise.resolve(new ArrayBuffer(0)); }; };
  g.File = function(bits, name, opts) { g.Blob.call(this, bits, opts); this.name = name; this.lastModified = Date.now(); };
  g.FileReader = function() { this.readAsDataURL = function() { setTimeout(() => { this.result = ''; if (this.onload) this.onload(); }, 0); }; this.readAsText = function() { setTimeout(() => { this.result = ''; if (this.onload) this.onload(); }, 0); }; this.readAsArrayBuffer = function() { setTimeout(() => { this.result = new ArrayBuffer(0); if (this.onload) this.onload(); }, 0); }; this.addEventListener = function(e, cb) { if (e === 'load') this.onload = cb; }; };
  g.FormData = function() { this._d = []; this.append = function(k, v) { this._d.push([k, v]); }; this.get = function(k) { for (const e of this._d) if (e[0] === k) return e[1]; return null; }; };

  g.DOMParser = function() {
    this.parseFromString = function(str, type) {
      return { querySelector() { return null; }, querySelectorAll() { return []; }, documentElement: mkEl('html'), body: mkEl('body') };
    };
  };
  g.TextEncoder = TextEncoder;
  g.TextDecoder = TextDecoder;

  g.AbortController = function() { this.signal = { aborted: false, addEventListener() {} }; this.abort = function() { this.signal.aborted = true; }; };
  g.AbortSignal = { timeout(ms) { return { aborted: false, addEventListener() {} }; } };

  g.URL = URL;
  g.URLSearchParams = URLSearchParams;
  g.Headers = function(init) { this._h = {}; if (init) Object.entries(init).forEach(([k,v]) => this._h[k.toLowerCase()] = v); this.get = function(k) { return this._h[k.toLowerCase()] || null; }; this.set = function(k, v) { this._h[k.toLowerCase()] = v; }; this.has = function(k) { return k.toLowerCase() in this._h; }; this.append = function(k, v) { this._h[k.toLowerCase()] = v; }; };

  g.fetch = function(url, opts) {
    return Promise.resolve({
      ok: true, status: 200, statusText: 'OK',
      headers: new g.Headers(),
      json() { return Promise.resolve({}); },
      text() { return Promise.resolve(''); },
      arrayBuffer() { return Promise.resolve(new ArrayBuffer(0)); },
      blob() { return Promise.resolve(new g.Blob()); },
      clone() { return this; },
    });
  };

  g.chrome = { runtime: {}, csi() { return { startE: startTime, onloadT: startTime + 920 }; }, loadTimes() { return { requestTime: startTime / 1000, firstPaintTime: (startTime + 350) / 1000, firstPaintAfterLoadTime: 0, startLoadTime: startTime / 1000, commitLoadTime: startTime / 1000, finishDocumentLoadTime: (startTime + 600) / 1000, finishLoadTime: (startTime + 920) / 1000, navigationType: 'Other' }; } };
  g.Notification = Object.assign(function() {}, { permission: 'default', requestPermission() { return Promise.resolve('default'); } });

  g.crypto = {
    getRandomValues(a) {
      for (let i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
      return a;
    },
    subtle: {
      digest(algo, data) {
        const hash = require('crypto').createHash('sha-256');
        hash.update(Buffer.from(data));
        return Promise.resolve(hash.digest().buffer);
      },
      encrypt() { return Promise.resolve(new ArrayBuffer(0)); },
      decrypt() { return Promise.resolve(new ArrayBuffer(0)); },
      sign() { return Promise.resolve(new ArrayBuffer(0)); },
      verify() { return Promise.resolve(true); },
      generateKey() { return Promise.resolve({}); },
      importKey() { return Promise.resolve({}); },
      exportKey() { return Promise.resolve(new ArrayBuffer(0)); },
    },
    randomUUID() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }); },
  };

  // WebAssembly — for wsl field
  if (typeof WebAssembly === 'undefined') {
    g.WebAssembly = {
      validate() { return true; },
      compile() { return Promise.resolve({}); },
      instantiate() { return Promise.resolve({ instance: { exports: {} }, module: {} }); },
      Module: function() {},
      Instance: function() { this.exports = {}; },
      Memory: function(desc) { this.buffer = new ArrayBuffer(desc.initial * 65536); this.grow = function() { return 0; }; },
      Table: function() { this.length = 0; this.get = function() { return null; }; this.set = function() {}; this.grow = function() { return 0; }; },
      Global: function() { this.value = 0; },
      CompileError: function(m) { this.message = m; },
      LinkError: function(m) { this.message = m; },
      RuntimeError: function(m) { this.message = m; },
    };
  }

  // CSS
  g.CSS = { supports(prop, val) { return true; }, escape(s) { return s; } };
  g.CSSStyleDeclaration = function() {};

  // Intl timezone
  if (typeof Intl !== 'undefined') {
    const origDTF = Intl.DateTimeFormat;
    // Ensure resolvedOptions returns correct timezone
    // (usually already correct in Node.js if system TZ is set)
  }

  g.alert = function() {};
  g.confirm = function() { return false; };
  g.prompt = function() { return null; };
  g.open = function() { return null; };
  g.close = function() {};
  g.focus = function() {};
  g.blur = function() {};
  g.scroll = function() {};
  g.scrollTo = function() {};
  g.scrollBy = function() {};
  g.print = function() {};
  g.stop = function() {};
  g.getSelection = function() { return { rangeCount: 0, toString() { return ''; } }; };
  g.postMessage = function() {};
  g.addEventListener = function() {};
  g.removeEventListener = function() {};
  g.dispatchEvent = function() { return true; };
  g.queueMicrotask = queueMicrotask;
  g.structuredClone = function(v) { return JSON.parse(JSON.stringify(v)); };

  // OffscreenCanvas
  g.OffscreenCanvas = function(w, h) {
    this.width = w; this.height = h;
    this.getContext = function(type) { return make2dContext(this); };
    this.convertToBlob = function() { return Promise.resolve(new g.Blob()); };
    this.transferToImageBitmap = function() { return {}; };
  };

  // DeviceMotionEvent / DeviceOrientationEvent — for dme/doe fields
  g.DeviceMotionEvent = function(t) { this.type = t; };
  g.DeviceOrientationEvent = function(t) { this.type = t; };

  // Symbols and iterators
  g.Symbol = Symbol;

  // ═══════════════════════════════════════════════════════════
  // Bulk Web API constructors — many .prototype checks by Akamai
  // ═══════════════════════════════════════════════════════════
  const dummyCtor = (name) => {
    const F = function() {};
    Object.defineProperty(F, 'name', { value: name });
    return F;
  };

  // HTML element constructors
  const htmlCtors = [
    'HTMLElement', 'HTMLDivElement', 'HTMLSpanElement', 'HTMLInputElement',
    'HTMLFormElement', 'HTMLAnchorElement', 'HTMLImageElement', 'HTMLCanvasElement',
    'HTMLVideoElement', 'HTMLAudioElement', 'HTMLScriptElement', 'HTMLStyleElement',
    'HTMLLinkElement', 'HTMLMetaElement', 'HTMLHeadElement', 'HTMLBodyElement',
    'HTMLButtonElement', 'HTMLSelectElement', 'HTMLOptionElement', 'HTMLTextAreaElement',
    'HTMLTableElement', 'HTMLTableRowElement', 'HTMLTableCellElement',
    'HTMLIFrameElement', 'HTMLObjectElement', 'HTMLEmbedElement',
    'HTMLParagraphElement', 'HTMLBRElement', 'HTMLHRElement',
    'HTMLPreElement', 'HTMLUListElement', 'HTMLOListElement', 'HTMLLIElement',
    'HTMLHeadingElement', 'HTMLLabelElement', 'HTMLFieldSetElement',
    'HTMLTemplateElement', 'HTMLSlotElement', 'HTMLDialogElement',
    'HTMLDetailsElement', 'HTMLSummaryElement', 'HTMLMenuElement',
    'HTMLDataElement', 'HTMLTimeElement', 'HTMLOutputElement',
    'HTMLProgressElement', 'HTMLMeterElement',
    'HTMLMediaElement', 'HTMLSourceElement', 'HTMLTrackElement',
    'HTMLPictureElement', 'HTMLMapElement', 'HTMLAreaElement',
  ];
  // SVG element constructors
  const svgCtors = [
    'SVGElement', 'SVGSVGElement', 'SVGPathElement', 'SVGCircleElement',
    'SVGRectElement', 'SVGLineElement', 'SVGTextElement', 'SVGGElement',
    'SVGAnimateElement', 'SVGClipPathElement', 'SVGDefsElement',
  ];
  // DOM API constructors
  const domCtors = [
    'Node', 'Element', 'Document', 'DocumentFragment', 'DocumentType',
    'Attr', 'CharacterData', 'Text', 'Comment', 'CDATASection',
    'ProcessingInstruction', 'ShadowRoot', 'NodeList', 'HTMLCollection',
    'NamedNodeMap', 'DOMTokenList', 'DOMStringList',
    'DOMRect', 'DOMRectReadOnly', 'DOMPoint', 'DOMPointReadOnly',
    'DOMMatrix', 'DOMMatrixReadOnly', 'DOMQuad',
    'Range', 'Selection', 'StaticRange', 'TreeWalker', 'NodeIterator',
    'NodeFilter', 'XPathResult', 'XPathEvaluator', 'XPathExpression',
    'MutationRecord',
  ];
  // CSS constructors
  const cssCtors = [
    'CSSStyleSheet', 'CSSRule', 'CSSStyleRule', 'CSSMediaRule',
    'CSSKeyframesRule', 'CSSKeyframeRule', 'CSSFontFaceRule',
    'CSSSupportsRule', 'StyleSheet', 'StyleSheetList',
    'MediaList', 'MediaQueryList', 'MediaQueryListEvent',
    'FontFace', 'FontFaceSet',
    'CSSStyleValue', 'CSSNumericValue', 'CSSUnitValue',
    'Highlight', 'HighlightRegistry',
    'CSSAnimation', 'CSSTransition', 'Animation', 'AnimationEffect',
    'KeyframeEffect', 'AnimationTimeline', 'DocumentTimeline',
  ];
  // Event constructors
  const eventCtors = [
    'UIEvent', 'CompositionEvent', 'DragEvent', 'AnimationEvent',
    'TransitionEvent', 'ClipboardEvent', 'BeforeUnloadEvent',
    'HashChangeEvent', 'PageTransitionEvent', 'PopStateEvent',
    'StorageEvent', 'ProgressEvent', 'SecurityPolicyViolationEvent',
    'PromiseRejectionEvent', 'SubmitEvent', 'FormDataEvent',
    'GamepadEvent', 'MediaEncryptedEvent',
    'BlobEvent', 'MediaRecorderEvent',
  ];
  // Other Web API constructors
  const otherCtors = [
    'MediaSource', 'SourceBuffer', 'SourceBufferList',
    'MediaStream', 'MediaStreamTrack',
    'RTCPeerConnection', 'RTCSessionDescription', 'RTCIceCandidate',
    'RTCDataChannel',
    'SpeechRecognition', 'webkitSpeechRecognition', 'SpeechSynthesis',
    'SpeechSynthesisUtterance', 'SpeechSynthesisEvent',
    'PaymentRequest', 'PaymentResponse',
    'Credential', 'PasswordCredential', 'FederatedCredential', 'PublicKeyCredential',
    'PushManager', 'PushSubscription',
    'CacheStorage', 'Cache',
    'Permissions', 'PermissionStatus',
    'BarcodeDetector', 'EyeDropper',
    'FileSystemHandle', 'FileSystemFileHandle', 'FileSystemDirectoryHandle',
    'ClipboardItem',
    'Sanitizer', 'TrustedHTML', 'TrustedScript', 'TrustedScriptURL',
    'Scheduler', 'TaskController', 'TaskSignal', 'TaskPriorityChangeEvent',
    'Lock', 'LockManager',
    'IdleDetector', 'WakeLock', 'WakeLockSentinel',
    'NavigatorUAData', 'NavigationPreloadManager',
    'StorageManager', 'CookieStore', 'CookieChangeEvent',
    'ImageBitmap', 'ImageData', 'ImageBitmapRenderingContext',
    'Path2D', 'CanvasGradient', 'CanvasPattern',
    'WebGLRenderingContext', 'WebGL2RenderingContext',
    'WebGLProgram', 'WebGLShader', 'WebGLBuffer', 'WebGLTexture',
    'WebGLFramebuffer', 'WebGLRenderbuffer', 'WebGLUniformLocation',
    'AudioContext', 'webkitAudioContext', 'OfflineAudioContext',
    'AudioBuffer', 'AudioBufferSourceNode', 'AudioNode',
    'GainNode', 'OscillatorNode', 'AnalyserNode',
    'AudioDestinationNode', 'AudioParam', 'AudioListener',
    'BaseAudioContext', 'ChannelMergerNode', 'ChannelSplitterNode',
    'StereoPannerNode', 'DynamicsCompressorNode', 'ConvolverNode',
    'BiquadFilterNode', 'DelayNode', 'WaveShaperNode',
    'ConstantSourceNode', 'IIRFilterNode', 'MediaElementAudioSourceNode',
    'MediaStreamAudioSourceNode', 'MediaStreamAudioDestinationNode',
    'ScriptProcessorNode', 'AudioWorkletNode',
    'IDBFactory', 'IDBDatabase', 'IDBTransaction', 'IDBObjectStore',
    'IDBIndex', 'IDBCursor', 'IDBKeyRange', 'IDBRequest',
    'IDBOpenDBRequest', 'IDBVersionChangeEvent',
    'Gamepad', 'GamepadButton', 'GamepadHapticActuator',
    'ReadableStream', 'WritableStream', 'TransformStream',
    'ReadableStreamDefaultReader', 'WritableStreamDefaultWriter',
    'ByteLengthQueuingStrategy', 'CountQueuingStrategy',
    'EncodedAudioChunk', 'EncodedVideoChunk',
    'VideoFrame', 'AudioData',
    'VideoDecoder', 'VideoEncoder', 'AudioDecoder', 'AudioEncoder',
    'SharedArrayBuffer',
  ];

  const allCtors = [...htmlCtors, ...svgCtors, ...domCtors, ...cssCtors, ...eventCtors, ...otherCtors];
  for (const name of allCtors) {
    if (g[name] === undefined) {
      g[name] = dummyCtor(name);
    }
  }

  // TrustedTypes polyfill
  if (!g.trustedTypes) {
    g.trustedTypes = {
      createPolicy(name, rules) {
        return {
          createHTML(s) { return s; },
          createScript(s) { return s; },
          createScriptURL(s) { return s; },
        };
      },
      isHTML() { return false; },
      isScript() { return false; },
      isScriptURL() { return false; },
      defaultPolicy: null,
    };
  }

  // indexedDB
  if (!g.indexedDB) {
    g.indexedDB = {
      open() { return { addEventListener() {}, result: null }; },
      deleteDatabase() { return { addEventListener() {} }; },
      databases() { return Promise.resolve([]); },
    };
  }

  // caches (CacheStorage)
  if (!g.caches) {
    g.caches = {
      open() { return Promise.resolve({ match() { return Promise.resolve(undefined); }, put() { return Promise.resolve(); }, add() { return Promise.resolve(); }, addAll() { return Promise.resolve(); }, delete() { return Promise.resolve(true); }, keys() { return Promise.resolve([]); } }); },
      has() { return Promise.resolve(false); },
      delete() { return Promise.resolve(true); },
      keys() { return Promise.resolve([]); },
      match() { return Promise.resolve(undefined); },
    };
  }

  return {
    getSensorData() { return sensorData; },
    getSensorCount() { return sensorCount; },
    getSensorHistory() { return sensorHistory; },
    getCookies() { return cookieJar; },
    waitForSensor(timeoutMs, minCount) {
      timeoutMs = timeoutMs || 5000;
      minCount = minCount || 1;
      return new Promise((resolve, reject) => {
        if (sensorCount >= minCount) return resolve(sensorHistory[minCount - 1]);
        let waited = 0;
        const poll = setInterval(() => {
          waited += 50;
          if (sensorCount >= minCount) { clearInterval(poll); resolve(sensorHistory[minCount - 1]); }
          else if (waited >= timeoutMs) { clearInterval(poll); reject(new Error(`timeout: got ${sensorCount}/${minCount} sensors`)); }
        }, 50);
      });
    },
  };
}

module.exports = { setup };
