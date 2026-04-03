const fs = require("fs");
const vm = require("vm");

const bundlePath = process.argv[2];

if (!bundlePath) {
    console.error("Usage: node probe_bundle_vm.js <bundle.js>");
    process.exit(1);
}

function noop() {}

function isPlainObjectLike(value) {
    return (
        value &&
        (Array.isArray(value) ||
            Object.prototype.toString.call(value) === "[object Object]")
    );
}

function createMagic(label) {
    const fn = function () {
        return proxy;
    };
    const proxy = new Proxy(fn, {
        get(_target, prop) {
            if (prop === Symbol.toPrimitive) return () => "";
            if (prop === "toString") return () => `[magic ${label}]`;
            if (prop === "valueOf") return () => 0;
            if (prop === "length") return 0;
            if (prop === "name") return label;
            if (prop === "prototype") return {};
            if (prop === "then") return undefined;
            return createMagic(`${label}.${String(prop)}`);
        },
        apply() {
            return proxy;
        },
        construct() {
            return createMagic(`new ${label}`);
        },
        set() {
            return true;
        },
        has() {
            return false;
        },
        ownKeys() {
            return [];
        },
        getOwnPropertyDescriptor() {
            return {
                configurable: true,
                enumerable: true,
                writable: true,
                value: undefined,
            };
        },
    });
    return proxy;
}

function createElement(tag) {
    const element = {
        tagName: String(tag || "div").toUpperCase(),
        style: {},
        children: [],
        childNodes: [],
        innerHTML: "",
        textContent: "",
        value: "",
        width: 0,
        height: 0,
        appendChild: noop,
        removeChild: noop,
        insertBefore: noop,
        setAttribute: noop,
        getAttribute: () => null,
        addEventListener: noop,
        removeEventListener: noop,
        getContext: () => ({}),
        toDataURL: () => "",
        querySelector: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({
            width: 0,
            height: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
        }),
        cloneNode: () => createElement(tag),
    };
    return new Proxy(element, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return createMagic(`element.${String(prop)}`);
        },
        set(target, prop, value) {
            target[prop] = value;
            return true;
        },
    });
}

function proxifyObject(label, object) {
    const cache = new WeakMap();
    function wrap(value, key) {
        if (typeof value === "function") return value;
        if (!isPlainObjectLike(value)) return value;
        if (cache.has(value)) return cache.get(value);
        const wrapped = new Proxy(value, {
            get(target, prop) {
                if (prop in target) {
                    return wrap(
                        target[prop],
                        `${key}.${String(prop)}`
                    );
                }
                return createMagic(`${key}.${String(prop)}`);
            },
            set(target, prop, nextValue) {
                target[prop] = nextValue;
                return true;
            },
        });
        cache.set(value, wrapped);
        return wrapped;
    }
    return new Proxy(object, {
        get(target, prop) {
            if (prop in target) {
                return wrap(target[prop], `${label}.${String(prop)}`);
            }
            return createMagic(`${label}.${String(prop)}`);
        },
        set(target, prop, value) {
            target[prop] = value;
            return true;
        },
    });
}

function makeDocument(scriptUrl, location) {
    const scripts = [{ src: scriptUrl }];
    const document = {
        cookie: "bm_sz=FAKEHASH~dGVzdA==~3289157~2102249",
        referrer: "",
        title: "",
        hidden: false,
        visibilityState: "visible",
        readyState: "complete",
        location,
        documentElement: {
            clientWidth: 1365,
            clientHeight: 937,
            style: {},
        },
        body: createElement("body"),
        head: createElement("head"),
        currentScript: { src: scriptUrl },
        scripts,
        createElement,
        createTextNode: (text) => ({ nodeValue: text }),
        getElementsByTagName: (tag) => (tag === "script" ? scripts : []),
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: noop,
        removeEventListener: noop,
    };
    return new Proxy(document, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return createMagic(`document.${String(prop)}`);
        },
        set(target, prop, value) {
            target[prop] = value;
            return true;
        },
    });
}

function makeSandbox(scriptUrl, bundleSource) {
    const traces = {
        xhrOpen: [],
        xhrSend: [],
        jsonStringify: [],
    };
    const taskQueue = [];
    function pushTask(kind, fn, args) {
        if (typeof fn !== "function") return 0;
        taskQueue.push({
            kind,
            fnName: fn.name || "",
            run: () => fn(...args),
        });
        return taskQueue.length;
    }
    const location = proxifyObject("location", {
        href: "https://www.dhl.com/cn-zh/home/tracking.html?tracking-id=1232343&submit=1",
        protocol: "https:",
        host: "www.dhl.com",
        hostname: "www.dhl.com",
        pathname: "/cn-zh/home/tracking.html",
        search: "?tracking-id=1232343&submit=1",
        hash: "",
        origin: "https://www.dhl.com",
    });
    const document = makeDocument(scriptUrl, location);

    function XMLHttpRequest() {
        this.__id = traces.xhrOpen.length + traces.xhrSend.length + 1;
        this.readyState = 4;
        this.status = 200;
        this.responseText = "";
        this.response = "";
        this.withCredentials = true;
        this.onreadystatechange = null;
        this.onload = null;
    }

    XMLHttpRequest.prototype.open = function (...args) {
        this.__method = args[0];
        this.__url = args[1];
        traces.xhrOpen.push({ id: this.__id, args });
    };
    XMLHttpRequest.prototype.send = function (body) {
        const entry = { id: this.__id, method: this.__method, url: this.__url, body };
        // Parse sensor_data from POST body
        if (this.__method === "POST" && typeof body === "string") {
            try {
                const parsed = JSON.parse(body);
                if (parsed && typeof parsed.sensor_data === "string") {
                    entry.sensor_data = parsed.sensor_data;
                    const parts = parsed.sensor_data.split(";");
                    entry.sensorDataParts = parts.length;
                    entry.sensorDataVer = parts[0];
                }
            } catch (_) {}
        }
        traces.xhrSend.push(entry);
        if (
            this.__method === "GET" &&
            typeof this.__url === "string" &&
            this.__url.indexOf(scriptUrl) === 0
        ) {
            this.responseText = bundleSource;
            this.response = bundleSource;
        }
        if (typeof this.onreadystatechange === "function") {
            this.onreadystatechange();
        }
        if (typeof this.onload === "function") {
            this.onload();
        }
    };
    XMLHttpRequest.prototype.setRequestHeader = noop;
    XMLHttpRequest.prototype.getAllResponseHeaders = () => "";
    XMLHttpRequest.prototype.getResponseHeader = () => null;
    XMLHttpRequest.prototype.addEventListener = noop;
    XMLHttpRequest.prototype.removeEventListener = noop;

    function MutationObserver() {}
    MutationObserver.prototype.observe = noop;
    MutationObserver.prototype.disconnect = noop;

    function Image() {}

    const json = Object.create(JSON);
    json.stringify = function (value, replacer, space) {
        const text = JSON.stringify(value, replacer, space);
        if (value && typeof value === "object") {
            const keys = Object.keys(value);
            const entry = {
                keys,
                ver: value.ver,
                ajt: value.ajt,
                sensor_data: value.sensor_data,
                text,
            };
            traces.jsonStringify.push(entry);
            // Extract ver from sensor_data if present
            if (typeof value.sensor_data === "string") {
                const parts = value.sensor_data.split(";");
                entry.sensorDataParts = parts.length;
                entry.sensorDataVer = parts[0];
            }
        }
        return text;
    };

    const sandbox = {
        console,
        Date,
        Math,
        JSON: json,
        Number,
        String,
        Boolean,
        RegExp,
        Object,
        Array,
        Map,
        Set,
        WeakMap,
        WeakSet,
        Promise,
        Symbol,
        Uint8Array,
        Uint16Array,
        Uint32Array,
        Int8Array,
        Int16Array,
        Int32Array,
        Float32Array,
        Float64Array,
        ArrayBuffer,
        DataView,
        TextEncoder,
        TextDecoder,
        Error,
        TypeError,
        RangeError,
        SyntaxError,
        ReferenceError,
        URIError,
        EvalError,
        Infinity,
        NaN,
        undefined,
        parseInt,
        parseFloat,
        isNaN,
        isFinite,
        encodeURIComponent,
        decodeURIComponent,
        encodeURI,
        decodeURI,
        escape,
        unescape,
        atob: (s) => Buffer.from(s, "base64").toString("binary"),
        btoa: (s) => Buffer.from(s, "binary").toString("base64"),
        setTimeout: (fn, ...args) => {
            return pushTask("setTimeout", fn, args);
        },
        clearTimeout: noop,
        setInterval: (fn, ...args) => {
            return pushTask("setInterval", fn, args);
        },
        clearInterval: noop,
        setImmediate: noop,
        addEventListener: noop,
        removeEventListener: noop,
        navigator: proxifyObject("navigator", {
            userAgent: "Mozilla/5.0",
            language: "zh-CN",
            languages: ["zh-CN", "zh"],
            webdriver: false,
            plugins: [],
            mimeTypes: [],
            hardwareConcurrency: 8,
            platform: "Linux x86_64",
            serviceWorker: createMagic("navigator.serviceWorker"),
        }),
        location,
        history: proxifyObject("history", {
            pushState: noop,
            replaceState: noop,
            state: null,
        }),
        document,
        screen: proxifyObject("screen", {
            width: 1365,
            height: 937,
            availWidth: 1365,
            availHeight: 937,
            colorDepth: 24,
            pixelDepth: 24,
        }),
        requestAnimationFrame: (fn) => {
            return pushTask("requestAnimationFrame", fn, [Date.now()]);
        },
        cancelAnimationFrame: noop,
        matchMedia: (query) => ({
            matches: false,
            media: query || "",
            onchange: null,
            addListener: noop,
            removeListener: noop,
            addEventListener: noop,
            removeEventListener: noop,
            dispatchEvent: () => false,
        }),
        getComputedStyle: () =>
            new Proxy(
                {},
                {
                    get(_, prop) {
                        if (prop === "getPropertyValue") return () => "";
                        if (prop === "length") return 0;
                        return "";
                    },
                }
            ),
        fetch: () =>
            Promise.resolve({
                ok: true,
                status: 200,
                json: () => Promise.resolve({}),
                text: () => Promise.resolve(""),
                arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
            }),
        Response: function Response(body) {
            this.ok = true;
            this.status = 200;
            this.body = body;
            this.json = () => Promise.resolve({});
            this.text = () => Promise.resolve(body || "");
        },
        performance: proxifyObject("performance", {
            now: () => Date.now(),
            timing: {
                navigationStart: Date.now() - 1500,
                unloadEventStart: 0,
                unloadEventEnd: 0,
                redirectStart: 0,
                redirectEnd: 0,
                fetchStart: Date.now() - 1400,
                domainLookupStart: Date.now() - 1350,
                domainLookupEnd: Date.now() - 1300,
                connectStart: Date.now() - 1300,
                connectEnd: Date.now() - 1200,
                secureConnectionStart: Date.now() - 1250,
                requestStart: Date.now() - 1200,
                responseStart: Date.now() - 1000,
                responseEnd: Date.now() - 900,
                domLoading: Date.now() - 800,
                domInteractive: Date.now() - 500,
                domContentLoadedEventStart: Date.now() - 400,
                domContentLoadedEventEnd: Date.now() - 400,
                domComplete: Date.now() - 200,
                loadEventStart: Date.now() - 100,
                loadEventEnd: Date.now() - 50,
            },
            getEntriesByType: () => [],
            getEntriesByName: () => [],
            getEntries: () => [],
        }),
        crypto: proxifyObject("crypto", {
            getRandomValues(array) {
                if (array && typeof array.fill === "function") array.fill(0);
                return array;
            },
        }),
        Image,
        MutationObserver,
        XMLHttpRequest,
    };

    sandbox.frames = {};
    sandbox.__traces = traces;
    sandbox.__taskQueue = taskQueue;

    const sandboxProxy = new Proxy(sandbox, {
        get(target, prop) {
            if (prop in target) return target[prop];
            return createMagic(`global.${String(prop)}`);
        },
        set(target, prop, value) {
            target[prop] = value;
            return true;
        },
        has() {
            return true;
        },
    });

    // Self-references point to the raw sandbox object so that
    // typeof window.X === 'undefined' still works for feature detection
    // (the proxy would return magic proxies for missing properties).
    // Any browser API the bundle accesses through window.X must be
    // explicitly added to the sandbox above.
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.top = sandbox;
    sandbox.parent = sandbox;
    sandbox.globalThis = sandbox;

    return sandboxProxy;
}

const source = fs.readFileSync(bundlePath, "utf8");
const scriptUrl =
    "https://www.dhl.com/lUuI09H8kk2lCTn_ihnlZXLM/J3aE8rSc6GQSLfJO/ZHE1PQ/dlZdB/nwEPFIB";
const sandbox = makeSandbox(scriptUrl, source);

try {
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { timeout: 8000 });
    const taskErrors = [];
    let taskCount = 0;
    for (let i = 0; i < 50 && sandbox.__taskQueue.length; i += 1) {
        const task = sandbox.__taskQueue.shift();
        if (task && typeof task.run === "function") {
            taskCount += 1;
            try {
                task.run();
            } catch (error) {
                const colMatch =
                    error &&
                    error.stack &&
                    error.stack.match(/evalmachine\.<anonymous>:1:(\d+)/);
                const crashCol = colMatch ? parseInt(colMatch[1]) : null;
                taskErrors.push({
                    name: error && error.name,
                    message: error && error.message,
                    crashCol,
                    kind: task.kind,
                    fnName: task.fnName,
                    taskIndex: taskCount,
                });
            }
        }
    }

    // Extract sensor_data from XHR POST sends
    const sensorDataPost = sandbox.__traces.xhrSend.find(
        (s) => s.method === "POST" && s.sensor_data
    );

    console.log(
        JSON.stringify(
            {
                ok: true,
                taskErrors,
                taskCount,
                xhrOpenCount: sandbox.__traces.xhrOpen.length,
                xhrSendCount: sandbox.__traces.xhrSend.length,
                pendingTasks: sandbox.__taskQueue.length,
                sensorDataCaptured: !!sensorDataPost,
                sensorDataVer: sensorDataPost
                    ? sensorDataPost.sensorDataVer
                    : null,
                sensorDataParts: sensorDataPost
                    ? sensorDataPost.sensorDataParts
                    : null,
                sensorData: sensorDataPost
                    ? sensorDataPost.sensor_data
                    : null,
                xhrOpen: sandbox.__traces.xhrOpen,
                xhrSend: sandbox.__traces.xhrSend,
                jsonStringifyAll: sandbox.__traces.jsonStringify,
                lastJsonStringify:
                    sandbox.__traces.jsonStringify.slice(-1)[0] || null,
            },
            null,
            2
        )
    );
} catch (error) {
    console.log(
        JSON.stringify(
            {
                ok: false,
                name: error && error.name,
                message: error && error.message,
                stack: error && error.stack,
            },
            null,
            2
        )
    );
}
