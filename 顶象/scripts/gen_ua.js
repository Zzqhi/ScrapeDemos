// gen_ua.js - sidecar that loads greenseer.js in jsdom and generates UA strings.
// Reads a JSON spec from stdin describing the event sequence; writes back the resulting UA.

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const GREENSEER_PATH = path.join(__dirname, 'greenseer_live.js');
const GREENSEER_URL = 'https://cdn.dingxiang-inc.com/ctu-group/ctu-greenseer/greenseer.js';
const CACHE_TTL_MS = 30 * 60 * 1000; // refresh cache every 30 min

function loadGreenseer() {
  // Fetch latest if cache stale (greenseer rotates obfuscation seeds frequently).
  let needFetch = true;
  try {
    const stat = fs.statSync(GREENSEER_PATH);
    if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) needFetch = false;
  } catch (_) { /* missing: fetch */ }
  if (needFetch) {
    try {
      const https = require('https');
      const url = `${GREENSEER_URL}?_t=${Date.now()}`;
      const data = require('child_process').execSync(`curl -sL '${url}'`, {timeout: 10000});
      if (data && data.length > 30000) {
        fs.writeFileSync(GREENSEER_PATH, data);
      }
    } catch (e) {
      // Fall back to cache if fetch fails.
    }
  }
  return fs.readFileSync(GREENSEER_PATH, 'utf8');
}

const greenseerSrc = loadGreenseer();

function buildEnv(opts) {
  opts = opts || {};
  const href = opts.href || 'https://cdn.dingxiang-inc.com/';
  const referrer = opts.referrer || 'https://cdn.dingxiang-inc.com/';
  const userAgent = opts.userAgent ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36';

  // sendTemp captures document.body.innerHTML.substr(0, ~300) as 'fragment'
  // and reports bodyLength/headLength. The host DOM must look like a real
  // page that embeds the captcha widget — otherwise server rejects.
  // Caller can override via opts.html with a full HTML string.
  const defaultBody =
    '<h3>DingXiang slider</h3>' +
    '<div id="captcha" class="dx_captcha dx_captcha_loading-style-embed ' +
    'dx_captcha_basic dx_captcha-type-basic dx_captcha_basic-style-embed" ' +
    'style="width: 300px; height: 200px;" data-dx-idx="1">' +
    '<div id="dx_captcha_basic_wrapper_1" class="dx_captcha_basic_wrapper">' +
    '<!-- captcha placeholder content padded to plausible length -->' +
    '<div class="dx_captcha_basic_state-box"></div>' +
    '<div class="dx_captcha_basic_bg"></div>' +
    '<div class="dx_captcha_basic_inform"></div>' +
    '</div></div>' +
    // pad to typical real-page body size (~50KB)
    '<div style="display:none">' + 'x'.repeat(48000) + '</div>';
  const defaultHead = '<title>captcha</title>' +
    '<style>' + 'a'.repeat(5000) + '</style>' +
    // pad head to typical size (~100KB)
    '<script>/*' + 'h'.repeat(95000) + '*/</script>';
  const headContent = opts.realHead || defaultHead;
  const bodyContent = opts.realBody || defaultBody;
  const html = opts.html ||
    '<!DOCTYPE html><html><head>' + headContent + '</head>' +
    '<body>' + bodyContent + '</body></html>';
  const virtualConsole = new VirtualConsole();
  // suppress jsdom's noisy logs
  virtualConsole.on('jsdomError', () => {});

  const dom = new JSDOM(html, {
    url: href,
    referrer,
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    virtualConsole,
  });
  const win = dom.window;

  // Force a Chrome-like navigator (jsdom's default UA is 'jsdom/x.y.z' which
  // greenseer's getBrowserAndVersion regex won't recognize as Chrome).
  Object.defineProperty(win.navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(win.navigator, 'platform', { value: opts.platform || 'Win32', configurable: true });
  Object.defineProperty(win.navigator, 'language', { value: 'zh-CN', configurable: true });
  Object.defineProperty(win.navigator, 'languages', { value: ['zh-CN', 'zh'], configurable: true });
  Object.defineProperty(win.navigator, 'cookieEnabled', { value: true, configurable: true });
  Object.defineProperty(win.navigator, 'webdriver', { value: false, configurable: true });

  // Polyfill missing/limited browser APIs that greenseer touches.
  // Match the real browser env captured from a successful slide so SC bytes line up.
  Object.defineProperty(win.screen, 'width', { value: opts.screenW || 1920, configurable: true });
  Object.defineProperty(win.screen, 'height', { value: opts.screenH || 1080, configurable: true });
  Object.defineProperty(win.screen, 'availWidth', { value: opts.availW || 1920, configurable: true });
  Object.defineProperty(win.screen, 'availHeight', { value: opts.availH || 1032, configurable: true });
  Object.defineProperty(win.screen, 'colorDepth', { value: 24, configurable: true });
  Object.defineProperty(win.screen, 'pixelDepth', { value: 24, configurable: true });
  win.screen.screenLeft = 0;
  win.screen.screenTop = 0;
  Object.defineProperty(win, 'innerWidth', { value: opts.innerW || 1365, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: opts.innerH || 947, configurable: true });
  Object.defineProperty(win, 'outerWidth', { value: opts.outerW || 1382, configurable: true });
  Object.defineProperty(win, 'outerHeight', { value: opts.outerH || 1024, configurable: true });

  // Allow Date.now overriding via win.__nowOverride
  const realDateNow = win.Date.now.bind(win.Date);
  win.__nowOverride = null;
  win.Date.now = function () {
    return win.__nowOverride !== null ? win.__nowOverride : realDateNow();
  };

  // Inject greenseer source
  win.eval(greenseerSrc);

  // Greenseer registers as window._dx.UA.init.
  if (!win._dx || !win._dx.UA || typeof win._dx.UA.init !== 'function') {
    throw new Error('greenseer factory not found at window._dx.UA');
  }
  return { dom, win, factory: win._dx.UA };
}

async function generate(spec) {
  const env = Object.assign({}, spec.env || {});
  if (spec.realBody) env.realBody = spec.realBody;
  if (spec.realHead) env.realHead = spec.realHead;
  const { dom, win, factory } = buildEnv(env);
  // Anchor the simulator clock at spec.startTime so that elapsed timestamps
  // baked into segments resemble what a real user produces (init -> several
  // hundred ms before first mousedown).
  const initStart = (spec.startTime || Date.now()) - (spec.preInitMs || 800);
  win.__nowOverride = initStart;

  const init = factory.init({
    token: spec.token || '',
    form: spec.form || '',
    inputName: spec.inputName || 'ua',
  });

  // greenseer's start() schedules the last 2 segments (getSC + one more) via
  // a microtask. We must let the queue drain so jsdom's _ua matches what a
  // real browser produces after init returns.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setTimeout(r, 0));

  // Now advance to user-interaction start.
  const events = spec.events || [];
  let nowMs = spec.startTime || Date.now();
  win.__nowOverride = nowMs;

  for (const ev of events) {
    const advance = ev.dt != null ? ev.dt : 16;
    nowMs += advance;
    win.__nowOverride = nowMs;

    switch (ev.kind) {
      case 'md':
        init.getMD({
          pageX: ev.x, pageY: ev.y, button: ev.button || 0,
          target: { id: ev.targetId || '' },
        });
        break;
      case 'mm':
        init.getMM({
          pageX: ev.x, pageY: ev.y,
          target: { id: ev.targetId || '' },
        });
        break;
      case 'mu':
        // No mouseup type in this lib — keep for trace symmetry.
        init.isMouseDown = false;
        break;
      case 'sa':
        init.recordSA({ pageX: ev.x, pageY: ev.y });
        break;
      case 'kd':
        init.getKD({
          key: ev.key || '', keyCode: ev.code || 0,
          target: { id: ev.targetId || '' },
        });
        break;
      case 'fo':
        init.getFO({ type: ev.type || 'focus', target: { id: ev.targetId || '' } });
        break;
      case 'tc':
        init.getTC({
          touches: [{ pageX: ev.x, pageY: ev.y, identifier: ev.id || 0 }],
          target: { id: ev.targetId || '' },
        });
        break;
      case 'tmv':
        init.getTMV({
          touches: [{ pageX: ev.x, pageY: ev.y, identifier: ev.id || 0 }],
          target: { id: ev.targetId || '' },
        });
        break;
      case 'temp':
        init.sendTemp(ev.body || '');
        break;
      case 'sendSA':
        init.sendSA();
        break;
      case 'ca':
        // Click area sample for clickword/icon-click captcha. Each click of
        // a target icon is recorded; sendCA is called once after all clicks.
        init.recordCA({
          offsetX: ev.x,
          offsetY: ev.y,
          target: { className: 'captcha_clickword_hits' },
        });
        break;
      case 'sendCA':
        init.sendCA();
        break;
      case 'raw_app': {
        // ev.type: int segment type, ev.hex: encrypted payload as hex string.
        // Bytes go directly into _ua via inst.app(type, payload_string).
        const bytes = ev.hex.match(/.{2}/g) || [];
        const payload = String.fromCharCode(...bytes.map((b) => parseInt(b, 16)));
        init.app(ev.type, payload);
        break;
      }
      default:
        throw new Error('unknown event kind: ' + ev.kind);
    }
  }

  if (spec.flushSA === true) {
    init.sendSA();
  }

  const ua = init.getUA();
  dom.window.close();
  return { ua, segments: undefined };
}

async function main() {
  let stdin = '';
  for await (const chunk of process.stdin) stdin += chunk;
  const spec = JSON.parse(stdin || '{}');
  try {
    const out = await generate(spec);
    process.stdout.write(JSON.stringify({ ok: true, ua: out.ua }));
  } catch (e) {
    process.stdout.write(JSON.stringify({ ok: false, error: String(e && e.message || e), stack: String(e && e.stack) }));
    process.exit(1);
  }
}

main();
