'use strict';

const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { aesEncryptBytes, genCrc32, stringToBytes: cbStringToBytes } = require('./gen_cb');

const API_SERVERS = [
    'https://ir-sdk.dun.163.com',
    'https://ir-sdk.dun.163yun.com'
];
const UPLOAD_PATH = '/v4/j/up';
const SDK_VERSION = '2.0.13_yanzhengma';
const VERSION_KEY = 'd44593ca';
const OFFLINE_B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function toByte(n) {
    if (n < -128) return toByte(n + 256);
    if (n > 127) return toByte(n - 256);
    return n;
}

function intToBytes(n) {
    return [
        toByte((n >>> 24) & 0xff),
        toByte((n >>> 16) & 0xff),
        toByte((n >>> 8) & 0xff),
        toByte(n & 0xff)
    ];
}

function tail(arr, size) {
    return arr.slice(-size);
}

function stringToBytes(value) {
    const encoded = encodeURIComponent(String(value));
    const bytes = [];

    for (let i = 0; i < encoded.length; i += 1) {
        if (encoded[i] === '%' && i + 2 < encoded.length) {
            bytes.push(toByte(parseInt(encoded.slice(i + 1, i + 3), 16)));
            i += 2;
        } else {
            bytes.push(toByte(encoded.charCodeAt(i)));
        }
    }

    return bytes;
}

function encodeBase64(bytes, alphabet, padding) {
    if (!bytes.length) return '';

    const chars = alphabet.split('');
    const out = [];

    for (let i = 0; i < bytes.length; i += 3) {
        const a = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
        const hasB = i + 1 < bytes.length;
        const hasC = i + 2 < bytes.length;
        const b = hasB ? (bytes[i + 1] < 0 ? bytes[i + 1] + 256 : bytes[i + 1]) : 0;
        const c = hasC ? (bytes[i + 2] < 0 ? bytes[i + 2] + 256 : bytes[i + 2]) : 0;

        out.push(chars[(a >>> 2) & 63]);
        out.push(chars[((a << 4) & 48) | ((b >>> 4) & 15)]);
        out.push(hasB ? chars[((b << 2) & 60) | ((c >>> 6) & 3)] : padding);
        out.push(hasC ? chars[c & 63] : padding);
    }

    return out.join('');
}

function randomHex(size) {
    return crypto.randomBytes(size).toString('hex');
}

function uuid() {
    return crypto.randomUUID().replace(/-/g, '');
}

async function safeInvoke(fn) {
    try {
        return [0, await fn()];
    } catch (error) {
        return [-101, undefined];
    }
}

async function encodeTlv(fn, id, serializer) {
    const [status, value] = await safeInvoke(fn);
    const valueBytes = serializer(status, value).map(toByte);
    return [
        ...tail(intToBytes(id), 2),
        ...tail(intToBytes(valueBytes.length), 2),
        ...valueBytes
    ];
}

function tn(fn, id, size) {
    return encodeTlv(fn, id, (status, value) => {
        const normalized = status === 0 ? Number(value || 0) : status;
        return tail(intToBytes(normalized), size);
    });
}

function un(fn, id, maxLen) {
    return encodeTlv(fn, id, (status, value) => {
        const normalized = status === 0 ? String(value == null ? '' : value) : String(status);
        return tail(stringToBytes(normalized), maxLen);
    });
}

function $(fn, id, size) {
    return encodeTlv(fn, id, (status, value) => {
        const normalized = status === 0 ? (value ? 1 : 2) : status;
        return tail(intToBytes(normalized), size);
    });
}

function cn(fn, id, sizes) {
    return encodeTlv(fn, id, (status, value) => {
        if (status !== 0 || !Array.isArray(value)) {
            return tail(intToBytes(status), sizes.reduce((a, b) => a + b, 0));
        }
        let result = [];
        for (let i = 0; i < sizes.length; i++) {
            const v = i < value.length ? Number(value[i] || 0) : 0;
            result = result.concat(tail(intToBytes(v), sizes[i]));
        }
        return result;
    });
}

function fn(dataFn, id, size) {
    return encodeTlv(dataFn, id, (status, value) => {
        if (status !== 0) return tail(intToBytes(status), size);
        const hex = String(value || '0').padStart(size, '0');
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            bytes.push(toByte(parseInt(hex.substring(i, i + 2), 16)));
        }
        return tail(bytes, size);
    });
}

function flatten(records) {
    return records.reduce((acc, record) => acc.concat(record), []);
}

function shuffle(bytes) {
    const out = bytes.slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
        const j = crypto.randomInt(i + 1);
        const tmp = out[i];
        out[i] = out[j];
        out[j] = tmp;
    }
    return out;
}

class au {
    constructor(productId) {
        this.appId = productId;
        this.sdkVersion = SDK_VERSION;
        this.versionKey = VERSION_KEY;
        this.deviceId = randomHex(32);
        this.trackId = randomHex(16);
        this.sessionId = randomHex(20);
        this.nonce = this.sessionId;
        this.timestamp = String(Date.now());
        this.collectDuration = 0;
        this.visitDuration = 0;
        this.accessInfo = 'nodejs';
        this._onlineTimes = 0;
    }

    startCollect() {
        this._collectStartedAt = Date.now();
        this.timestamp = String(Date.now());
    }

    endCollect() {
        const startedAt = this._collectStartedAt || Date.now();
        this.collectDuration = Date.now() - startedAt;
        this.visitDuration = this.collectDuration;
    }

    getTrackId() {
        return this.trackId;
    }

    setTrackId(trackId) {
        if (trackId) {
            this.trackId = String(trackId);
        }
    }

    getEncryptedDeviceId() {
        return this.deviceId;
    }

    setEncryptedDeviceId(deviceId) {
        if (deviceId) {
            this.deviceId = String(deviceId);
        }
    }

    onlineTimes() {
        return this._onlineTimes;
    }
}

class Gu {
    constructor() {
        this.moveCount = randInt(5, 30);
        this.clickCount = randInt(1, 5);
        this.downCount = randInt(1, 5);
        this.upCount = randInt(1, 5);
        this.motionCount = 0;
        this.orientationCount = 0;
        this.keypressCount = 0;
        this.focusCount = randInt(1, 3);
        this.blurCount = randInt(0, 2);
        this.scrollCount = randInt(0, 5);
        this.popstateCount = 0;
        this.trustedCount = randInt(5, 30);
        this.unTrustedCount = 0;
    }

    startCollect() { }

    endCollect() { }
}

function randInt(min, max) {
    return min + crypto.randomInt(max - min + 1);
}

async function Kr() {
    // 与 gen_fp.js 环境保持一致
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36';
    const now = Date.now();
    const hexNow = now.toString(16).padStart(16, '0');
    const randHex16 = () => crypto.randomBytes(8).toString('hex');

    return Promise.all([
        $(()  => true,                              218, 1),   // hasSessionStorage
        tn(() => 1,                                  225, 1),   // cookieEnabled
        un(() => ua,                                 252, 100), // userAgent
        tn(() => 3,                                  254, 1),   // platform type (3=Win)
        un(() => 'Win32',                            253, 30),  // platform string
        tn(() => 1,                                  261, 1),   // cookieEnabled
        un(() => 'zh-CN',                            262, 30),  // language
        cn(() => [24, 1920, 1080, 1920, 1040, 0, 0, 1], 263, [1,1,1,1,1,1,1,1]), // colorDepth=24, screen 1920x1080
        un(() => '',                                 265, 400), // plugins string
        un(() => '16',                               279, 5),   // hardwareConcurrency
        tn(() => 16,                                 280, 1),   // hardwareConcurrency int
        un(() => '',                                 283, 500), // webGL renderer info
        tn(() => 0,                                  501, 1),   // maxTouchPoints
        un(() => randomHex(16),                      503, 32),  // canvas fingerprint hash
        un(() => '2.0',                              505, 3),   // webGL version
        un(() => '5.0 (Windows NT 10.0; Win64; x64)',509, 30),  // appVersion
        cn(() => [1920, 1080],                       508, [4,4]), // screen resolution
        un(() => '8',                                510, 15),  // deviceMemory
        un(() => randomHex(16),                      511, 32),  // audio fingerprint hash
        $(()  => false,                              512, 1),   // adBlock
        un(() => '',                                 513, 100), // fonts list
        un(() => '',                                 700, 200), // extra info
        cn(() => [1920, 937],                        713, [4,4]), // window innerSize
        un(() => randomHex(4),                       800, 8),   // entropy fragments
        un(() => randomHex(4),                       801, 8),
        un(() => randomHex(4),                       802, 8),
        un(() => randomHex(4),                       803, 8),
        un(() => randomHex(4),                       804, 8),
        fn(() => hexNow,                             902, 16),  // navigation start hex
        fn(() => randHex16(),                        904, 16),  // random timing hex
        un(() => ua,                                 200, 400), // full userAgent
        un(() => 'Win32',                            201, 20),  // navigator.platform
        tn(() => 1,                                  202, 1),   // cookieEnabled
        tn(() => 0,                                  203, 1),   // doNotTrack (null → 0)
        tn(() => 0,                                  206, 1),   // maxTouchPoints
        $(()  => false,                              207, 1),   // hasLiedLanguages
        $(()  => false,                              208, 1),   // hasLiedResolution
        $(()  => false,                              209, 1),   // hasLiedOs
        $(()  => false,                              210, 1),   // hasLiedBrowser
        $(()  => true,                               211, 1),   // indexedDB supported
        un(() => 'zh-CN',                            213, 10),  // navigator.language
        un(() => 'zh-CN,zh,en',                      214, 15),  // navigator.languages
        fn(() => randHex16(),                        216, 16),  // performance timing hash
        fn(() => randHex16(),                        217, 16),  // performance timing hash 2
        $(()  => false,                              223, 1),   // webdriver
        $(()  => true,                               228, 1),   // chrome object exists
        $(()  => false,                              229, 1),   // safari
        un(() => 'Google Inc.',                      233, 400), // navigator.vendor
        un(() => 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)', 234, 64), // webGL renderer
        un(() => '',                                 238, 40),  // document.referrer
        un(() => '',                                 239, 20),  // location.hostname
        cn(() => [1920, 1080, 1920, 1040],           242, [2,2,2,2]), // availWidth/Height
        tn(() => 1,                                  243, 1),   // devicePixelRatio
        $(()  => true,                               250, 1),   // sessionStorage supported
        tn(() => 1,                                  251, 1),   // localStorage supported
        tn(() => 0,                                  258, 1),   // addBehavior (IE only)
        tn(() => 0,                                  260, 4),   // openDatabase
        tn(() => 0,                                  264, 1),   // cpuClass unknown
        tn(() => 0,                                  267, 1),   // webRTC
        fn(() => hexNow,                             273, 16),  // performance.now hex
        un(() => '',                                 901, 200), // extra data
        $(()  => false,                              506, 1),   // automation detected
        cn(() => [0, 0, now >>> 16, now & 0xffff],   502, [1,1,4,4]), // time components
        un(() => 'zh-CN',                            255, 20),  // resolved locale
        un(() => 'Windows',                          257, 20),  // OS name
        fn(() => hexNow,                             900, 16),  // page load timestamp
        un(() => SDK_VERSION,                        500, 100), // IR SDK version
        un(() => '',                                 284, 400), // webGL extensions
        $(()  => false,                              911, 1),   // bot detection flag
        tn(() => 0,                                  912, 4),   // collect error count
        tn(() => 0,                                  913, 4),   // collect warning count
        un(() => '',                                 914, 100), // error details
        un(() => '',                                 922, 100), // session state
        un(() => '',                                 963, 400), // additional telemetry
        tn(() => 0,                                  964, 1),   // overall status
    ]);
}

async function Vr(device, snapshot) {
    return [
        await un(() => device.appId, 2, 32),
        await un(() => device.getTrackId(), 3, 32),
        await un(() => device.sdkVersion, 4, 20),
        await un(() => device.nonce, 5, 32),
        await un(() => device.timestamp, 6, 16),
        await tn(() => device.collectDuration, 515, 4),
        await tn(() => device.visitDuration, 516, 4),
        await un(() => device.accessInfo, 121, 32),
        await un(() => 'nodejs', 910, 400),
        await tn(() => 2, 278, 4),
        await un(() => snapshot.encDeviceId, 3006, 400),
        await un(() => snapshot.sessionId, 3007, 400),
        await tn(() => snapshot.encDeviceStatus, 971, 4),
        await tn(() => snapshot.onlineTimes, 972, 4)
    ];
}

async function Wr(listener) {
    return Promise.all([
        tn(() => listener.moveCount,        110, 2),
        tn(() => listener.clickCount,       111, 2),
        tn(() => listener.downCount,        112, 2),
        tn(() => listener.upCount,          113, 2),
        tn(() => listener.motionCount,      114, 2),
        tn(() => listener.orientationCount, 115, 2),
        tn(() => listener.keypressCount,    116, 2),
        tn(() => listener.focusCount,       117, 2),
        tn(() => listener.blurCount,        118, 2),
        tn(() => listener.scrollCount,      119, 2),
        tn(() => listener.popstateCount,    120, 2),
        tn(() => listener.trustedCount,     967, 2),
        tn(() => listener.unTrustedCount,   968, 2),
    ]);
}

function resolveUrl(base, route) {
    return new URL(route, base).toString();
}

function postJson(url, body, timeout) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const client = target.protocol === 'https:' ? https : http;
        const payload = JSON.stringify(body);

        const req = client.request(
            {
                protocol: target.protocol,
                hostname: target.hostname,
                port: target.port || undefined,
                path: `${target.pathname}${target.search}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'text/plain',
                    'Content-Length': Buffer.byteLength(payload)
                },
                timeout
            },
            (res) => {
                const chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');

                    if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
                        reject(new Error(`HTTP ${res.statusCode}: ${text}`));
                        return;
                    }

                    try {
                        resolve(text ? JSON.parse(text) : {});
                    } catch (error) {
                        reject(new Error(`invalid json response: ${text}`));
                    }
                });
            }
        );

        req.on('timeout', () => req.destroy(new Error('request timeout')));
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

class Guardian {
    constructor(config) {
        if (!config.productId || String(config.productId).length >= 20) {
            throw new Error('productId illegal, not businessId or others');
        }

        this.timeout = config.timeout == null ? 6000 : config.timeout;
        this.fetchServers = Array.isArray(config.apiServer) ? config.apiServer : [config.apiServer];
        this.context = new au(String(config.productId));
        this.listener = new Gu();

        this.context.startCollect();
        this.listener.startCollect();
        this.collectSource = Kr();
        this.context.endCollect();
    }

    async fetcher(route, body) {
        let lastError;

        for (const server of this.fetchServers) {
            try {
                return await postJson(resolveUrl(server, route), body, this.timeout);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError || new Error(`All ${this.fetchServers.length} retries failed`);
    }

    buildBody(encryptedData) {
        return {
            p: this.context.appId,
            v: this.context.sdkVersion,
            vk: this.context.versionKey,
            n: uuid(),
            d: encryptedData
        };
    }

    async send() {
        const krData = await this.collectSource;

        const snapshot = {
            onlineTimes: this.context.onlineTimes(),
            encDeviceStatus: 200,
            encDeviceId: this.context.getEncryptedDeviceId(),
            sessionId: this.context.sessionId
        };

        const [vrData, wrData] = await Promise.all([
            Vr(this.context, snapshot),
            Wr(this.listener)
        ]);

        this.listener.endCollect();

        const shuffledBytes = shuffle(flatten(krData).concat(flatten(vrData)).concat(flatten(wrData)));
        // IR SDK 加密前需要附加 CRC32 校验（与 aesEncrypt 行为一致）
        const crc32Str = genCrc32(shuffledBytes);
        const crc32Bytes = cbStringToBytes(crc32Str);
        const payloadWithCrc = shuffledBytes.concat(crc32Bytes);
        const encryptedData = aesEncryptBytes(payloadWithCrc);
        const body = this.buildBody(encryptedData);

        try {
            const response = await this.fetcher(UPLOAD_PATH, body);
            if (process.env.DEBUG) console.error('[IR] server response:', JSON.stringify(response));
            const rd = response && response.data ? response.data : response;
            if (rd && rd.tk) {
                this.context.setTrackId(rd.td);
                this.context.setEncryptedDeviceId(rd.ed2);
                return { code: 200, token: rd.tk };
            }
            // 服务端未返回 tk，走离线模式
            return {
                code: 201,
                token: encodeBase64(stringToBytes(JSON.stringify(body)), OFFLINE_B64_ALPHABET, '=')
            };
        } catch (error) {
            return {
                code: 201,
                token: encodeBase64(stringToBytes(JSON.stringify(body)), OFFLINE_B64_ALPHABET, '=')
            };
        }
    }

    getToken(callback) {
        const task = this.send();
        if (typeof callback === 'function') {
            task.then(callback);
            return;
        }
        return task;
    }
}

function normalizeConfig(config) {
    const input = config || {};
    return {
        productId: input.productId || input.bid || input.appId || '',
        apiServer: input.apiServer || input.url || API_SERVERS,
        timeout: input.timeout
    };
}

function getToken(config, callback) {
    return new Guardian(normalizeConfig(config)).getToken(callback);
}

module.exports = {
    API_SERVERS,
    Gu,
    Guardian,
    Kr,
    UPLOAD_PATH,
    Vr,
    Wr,
    au,
    getToken,
    intToBytes,
    stringToBytes,
    toByte
};

if (require.main === module) {
    const productId = process.argv[2] || 'test_product';
    getToken({ productId })
        .then((result) => {
            process.stdout.write(JSON.stringify(result));
        })
        .catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
}
