// gen_ua.js - sidecar that loads greenseer.js in jsdom and generates UA strings.
// Reads a JSON spec from stdin describing the event sequence; writes back the resulting UA.

const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const GREENSEER_PATH = path.join(__dirname, 'greenseer_live.js');
const greenseerSrc = fs.readFileSync(GREENSEER_PATH, 'utf8');

function buildEnv(opts) {
  opts = opts || {};
  const href = opts.href || 'https://cdn.dingxiang-inc.com/';
  const referrer = opts.referrer || 'https://cdn.dingxiang-inc.com/';
  const userAgent = opts.userAgent ||
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

  const html = '<!DOCTYPE html><html><head><title>captcha</title></head>' +
    '<body><div id="captcha"></div></body></html>';
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
  Object.defineProperty(win.navigator, 'platform', { value: opts.platform || 'Linux x86_64', configurable: true });
  Object.defineProperty(win.navigator, 'language', { value: 'zh-CN', configurable: true });
  Object.defineProperty(win.navigator, 'languages', { value: ['zh-CN', 'zh'], configurable: true });
  Object.defineProperty(win.navigator, 'cookieEnabled', { value: true, configurable: true });
  Object.defineProperty(win.navigator, 'webdriver', { value: false, configurable: true });

  // Polyfill missing/limited browser APIs that greenseer touches.
  // Match the real browser env captured from a successful slide so SC bytes line up.
  Object.defineProperty(win.screen, 'width', { value: opts.screenW || 1718, configurable: true });
  Object.defineProperty(win.screen, 'height', { value: opts.screenH || 918, configurable: true });
  Object.defineProperty(win.screen, 'availWidth', { value: opts.availW || 1718, configurable: true });
  Object.defineProperty(win.screen, 'availHeight', { value: opts.availH || 891, configurable: true });
  Object.defineProperty(win.screen, 'colorDepth', { value: 24, configurable: true });
  Object.defineProperty(win.screen, 'pixelDepth', { value: 24, configurable: true });
  win.screen.screenLeft = 0;
  win.screen.screenTop = 0;
  Object.defineProperty(win, 'innerWidth', { value: opts.innerW || 836, configurable: true });
  Object.defineProperty(win, 'innerHeight', { value: opts.innerH || 780, configurable: true });
  Object.defineProperty(win, 'outerWidth', { value: opts.outerW || 844, configurable: true });
  Object.defineProperty(win, 'outerHeight', { value: opts.outerH || 871, configurable: true });

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
  const { dom, win, factory } = buildEnv(spec.env || {});
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
