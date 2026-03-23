/**
 * 使用 headless Chromium 生成有效的 Akamai _abck cookie
 *
 * 用法: node browser_sensor.cjs
 * 输出: JSON 到 .sensor_output.tmp，包含 cookies 和 sensor 数据
 */

const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const TARGET_URL = 'https://www.ihg.com/content/us/en/about/brands';
const OUTPUT_FILE = path.join(__dirname, '.sensor_output.tmp');

async function main() {
    const browser = await puppeteer.launch({
        executablePath: '/usr/bin/chromium',
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--window-size=1920,1080',
        ],
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36');
    await page.setViewport({ width: 1920, height: 1080 });

    // 启用 CDP 拦截 sensor POST
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');

    const sensorPosts = [];

    cdp.on('Network.requestWillBeSent', (params) => {
        if (params.request.method === 'POST' && params.request.postData) {
            const body = params.request.postData;
            if (body.includes('sensor_data')) {
                sensorPosts.push({
                    url: params.request.url,
                    body,
                    timestamp: Date.now(),
                });
            }
        }
    });

    console.error('[1/3] 加载页面...');
    try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (e) {
        console.error(`[WARN] ${e.message}`);
    }

    // 等待 Akamai sensor 提交完成
    console.error('[2/3] 等待 Akamai 初始化...');
    await new Promise(r => setTimeout(r, 5000));

    // 收集结果
    console.error('[3/3] 收集结果...');
    const allCookies = await page.cookies();
    const cookieMap = {};
    for (const c of allCookies) {
        cookieMap[c.name] = c.value;
    }

    const abck = cookieMap._abck || '';
    const abckTail = abck.split('~').slice(-3).join('~');
    const passed = !abckTail.startsWith('-1~-1~-1');

    const result = {
        cookies: cookieMap,
        sensorPosts,
        akamaiPassed: passed,
        abckTail,
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8');

    console.error(`    _abck: ...~${abckTail}`);
    console.error(`    验证通过: ${passed}`);
    console.error(`    sensor POST 次数: ${sensorPosts.length}`);
    console.error(`    结果已写入 ${OUTPUT_FILE}`);

    await browser.close();
}

main().catch(err => {
    console.error('[FATAL]', err.message);
    process.exit(1);
});
