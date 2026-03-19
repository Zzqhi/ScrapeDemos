console.log = () => {};

const fs = require('fs');
const path = require('path');

// 读取 PcSign.js，截断末尾硬编码的 sign 调用
const src = fs.readFileSync(path.join(__dirname, 'PcSign.js'), 'utf8');
const code = src.slice(0, src.indexOf('// page, timestamp'));
eval(code);

// argv[2]=page, argv[3]=timestamp, argv[4]=cookie, argv[5]=env_index(可选)
const page = parseInt(process.argv[2]) || 1;
const t = parseInt(process.argv[3]) || Date.now();
const cookie = process.argv[4] || '';
const envIndex = parseInt(process.argv[5]) || 0;

// 注入 cookie
if (cookie) window.document.cookie = cookie;

// 注入浏览器环境配置
const envList = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser_env.json'), 'utf8'));
const env = envList[envIndex % envList.length];

window.navigator.userAgent      = env.userAgent;
window.navigator.appVersion     = env.userAgent.replace(/^Mozilla\/5\.0\s*/, '');
window.navigator.platform       = env.platform;
window.navigator.language       = env.language;
window.navigator.languages      = env.languages;
window.navigator.hardwareConcurrency = env.hardwareConcurrency;
window.screen.width             = env.screen.width;
window.screen.height            = env.screen.height;
window.screen.availWidth        = env.screen.availWidth;
window.screen.availHeight       = env.screen.availHeight;
window.outerWidth               = env.outerWidth;
window.outerHeight              = env.outerHeight;
window.devicePixelRatio         = env.devicePixelRatio;

window.PcSign.sign({ page, t }).then(res => {
    process.stdout.write(res + '\n');
    process.exit(0);
});
