/**
 * Akamai sensor_data 生成脚本
 *
 * 核心改进：
 *   - 从 _abck 提取前缀，动态注入 localStorage ak_a
 *   - hook XMLHttpRequest.send() 拦截 Akamai 内部 POST 的 sensor_data
 *     而非调用 get_telemetry()（两者输出不同）
 *
 * 用法:
 *   node sensor_wrapper.cjs                  # 完整流程：请求 + 生成
 *   node sensor_wrapper.cjs --local <cookie> # 跳过请求，直接用本地 enc.js 生成
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SCRIPT_DIR = __dirname;
const BASE_URL = 'https://www.ihg.com';
const PAGE_PATH = '/content/us/en/about/brands';
const OUTPUT_FILE = path.join(SCRIPT_DIR, '.sensor_output.tmp');

const COMMON_HEADERS = {
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
};

// 5 分钟超时
setTimeout(() => { console.error('[TIMEOUT]'); process.exit(1); }, 5 * 60 * 1000);

// ==================== HTTP 工具 ====================

function httpsGet(urlStr, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const opts = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
            headers: { ...COMMON_HEADERS, ...headers },
        };
        const req = https.request(opts, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        });
        req.on('error', reject);
        req.end();
    });
}

// ==================== 步骤函数 ====================

function extractAkamaiJsPath(html) {
    let match = html.match(/<script[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>\s*<\/body>/);
    if (match) return match[1];
    const scripts = [...html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)].map(m => m[1]);
    for (let i = scripts.length - 1; i >= 0; i--) {
        if (!scripts[i].startsWith('/etc')) return scripts[i];
    }
    throw new Error('未找到 Akamai JS 路径');
}

function parseSetCookies(headers) {
    const cookies = {};
    const raw = headers['set-cookie'];
    if (!raw) return cookies;
    const list = Array.isArray(raw) ? raw : [raw];
    for (const line of list) {
        const parts = line.split(';')[0].split('=');
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        if (key) cookies[key] = val;
    }
    return cookies;
}

async function fetchPage() {
    console.error('[1/3] 请求页面...');
    const res = await httpsGet(`${BASE_URL}${PAGE_PATH}`, {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'cross-site',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
    });
    const cookies = parseSetCookies(res.headers);
    const akamaiJsPath = extractAkamaiJsPath(res.body);
    console.error(`    _abck: ${(cookies._abck || '').substring(0, 60)}...`);
    console.error(`    Akamai JS: ${akamaiJsPath}`);
    return { cookies, akamaiJsPath };
}

async function fetchAkamaiJs(cookies, akamaiJsPath) {
    console.error('[2/3] 请求 Akamai JS...');
    const cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await httpsGet(`${BASE_URL}${akamaiJsPath}`, {
        'accept': '*/*',
        'cookie': cookieStr,
        'referer': `${BASE_URL}${PAGE_PATH}`,
        'sec-fetch-dest': 'script',
        'sec-fetch-mode': 'no-cors',
        'sec-fetch-site': 'same-origin',
    });

    let code = res.body;
    try {
        const beautify = require('js-beautify').js;
        code = beautify(code, { indent_size: 4 });
    } catch (e) {
        console.error('    js-beautify 未安装，保存原始代码');
    }

    const encPath = path.join(SCRIPT_DIR, 'enc.js');
    fs.writeFileSync(encPath, code, 'utf8');
    console.error(`    已保存 enc.js (${code.length} bytes)`);
    return code;
}

function generateSensor(cookieStr, akamaiJsUrl) {
    console.error('[3/3] 生成 sensor_data...');

    // 从 cookie 中提取 _abck 前缀，设置 ak_a
    const abckMatch = cookieStr.match(/_abck=([^~;]+)/);
    const abckPrefix = abckMatch ? abckMatch[1] : '';
    console.error(`    _abck 前缀: ${abckPrefix.substring(0, 40)}...`);

    // 加载 env.js
    const envCode = fs.readFileSync(path.join(SCRIPT_DIR, 'env.js'), 'utf8');
    eval(envCode);

    // 设置 currentScript.src 为 Akamai JS 的完整 URL（关键！Akamai 从此 URL 解析配置参数）
    if (akamaiJsUrl) {
        global.document.currentScript.src = akamaiJsUrl;
        console.error(`    currentScript.src: ${akamaiJsUrl}`);
    }

    // 动态注入 ak_a (必须匹配 _abck 前缀)
    if (abckPrefix) {
        global.localStorage.setItem('ak_a', abckPrefix);
        global.localStorage.setItem('ak_ax', '-1');
        console.error(`    ak_a 已注入: ${abckPrefix.substring(0, 40)}...`);
    }

    // 注入 cookie (必须在 Akamai JS 加载前设置)
    global.document.cookie = cookieStr;

    // 通过 global._xhrSendHook 拦截 Akamai 内部 POST 的 sensor_data
    const capturedSensors = [];
    global._xhrSendHook = function(method, url, body, headers) {
        if (method !== 'POST' || !body) return;
        // Akamai POST body 格式: {"sensor_data":"3;0;1;..."}
        try {
            const parsed = JSON.parse(body);
            if (parsed.sensor_data) {
                capturedSensors.push(parsed.sensor_data);
                console.error(`    [HOOK] 捕获 JSON sensor_data (${parsed.sensor_data.length} bytes)`);
                return;
            }
        } catch(e) {}
        // 也可能是 a=&&&e=...&&&sensor_data=base64 格式
        if (typeof body === 'string' && body.includes('sensor_data=')) {
            const m = body.match(/sensor_data=([A-Za-z0-9+/=]+)/);
            if (m) {
                const decoded = Buffer.from(m[1], 'base64').toString();
                capturedSensors.push(decoded);
                console.error(`    [HOOK] 捕获 base64 sensor_data (${decoded.length} bytes)`);
            }
        }
    };

    // 加载 Akamai JS
    const akamaiCode = fs.readFileSync(path.join(SCRIPT_DIR, 'enc.js'), 'utf8');
    eval(akamaiCode);

    // 触发 DOMContentLoaded 和 load 事件 — Akamai 可能等这些事件才 POST sensor
    setTimeout(() => {
        if (global._dispatchEvent) {
            console.error('    触发 DOMContentLoaded / load 事件...');
            global._dispatchEvent('DOMContentLoaded', { target: global.document });
            global._dispatchEvent('load', { target: global.window });
        }
    }, 500);

    return new Promise((resolve, reject) => {
        // 等待 Akamai 脚本初始化并发送 sensor
        const checkInterval = setInterval(() => {
            if (capturedSensors.length > 0) {
                clearInterval(checkInterval);
                const sensor = capturedSensors[0];
                const segs = sensor.split(';');
                console.error(`    sensor segments: ${segs.length}`);
                console.error(`    前6段: ${segs.slice(0, 6).join(';')}`);

                const postBody = JSON.stringify({ sensor_data: sensor });
                fs.writeFileSync(OUTPUT_FILE, postBody, 'utf8');
                console.error(`    结果已写入 ${OUTPUT_FILE}`);
                resolve(postBody);
            }
        }, 200);

        // 10 秒超时，fallback 到 get_telemetry
        setTimeout(() => {
            clearInterval(checkInterval);
            if (capturedSensors.length > 0) return; // 已经处理了

            console.error('    [WARN] XHR hook 未捕获到 sensor，尝试 get_telemetry...');
            const w = global.window || global;
            if (w.bmak && typeof w.bmak.get_telemetry === 'function') {
                const raw = w.bmak.get_telemetry();
                let sensorStr = raw;
                const m = raw.match(/sensor_data=([A-Za-z0-9+/=]+)/);
                if (m) {
                    sensorStr = Buffer.from(m[1], 'base64').toString();
                }
                const postBody = JSON.stringify({ sensor_data: sensorStr });
                fs.writeFileSync(OUTPUT_FILE, postBody, 'utf8');
                console.error(`    fallback sensor 长度: ${sensorStr.length}`);
                resolve(postBody);
            } else {
                reject(new Error('bmak 未初始化'));
            }
        }, 10000);
    });
}

// ==================== 主流程 ====================

async function main() {
    const args = process.argv.slice(2);

    let cookieStr;
    let akamaiJsUrl;

    if (args[0] === '--local') {
        cookieStr = args[1] || '_abck=test~-1~-1~-1';
        akamaiJsUrl = args[2] || '';  // 可选：传入 Akamai JS URL
        console.error('使用本地 enc.js，跳过网络请求');
    } else {
        const { cookies, akamaiJsPath } = await fetchPage();
        await fetchAkamaiJs(cookies, akamaiJsPath);
        cookieStr = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        akamaiJsUrl = `${BASE_URL}${akamaiJsPath}`;
    }

    await generateSensor(cookieStr, akamaiJsUrl);
    process.exit(0);
}

main().catch(err => {
    console.error('[ERROR]', err.message);
    process.exit(1);
});
