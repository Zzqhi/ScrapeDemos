// Solve Akamai challenge using CDP (Chrome DevTools Protocol)
// Requires: Chrome running with --remote-debugging-port=9222
//
// Usage: echo '{"page_url":"..."}' | node cdp_solve.js
// Output: {"status": "0", "cookies": {...}}
//
// Flow: new tab → navigate → wait for 1st POST → inject interaction → wait for 2nd POST → check _abck

const WebSocket = require('ws');
const http = require('http');

let inputBuf = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => inputBuf += chunk);
process.stdin.on('end', () => {
  const config = JSON.parse(inputBuf);
  solve(config).then(result => {
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }).catch(err => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.stdout.write(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
});

async function solve(config) {
  const pageUrl = config.page_url;
  const cdpPort = config.cdp_port || 9222;

  // Step 1: Create a new page (tab)
  const newPage = await httpReq(`http://localhost:${cdpPort}/json/new?about:blank`, 'PUT');
  const wsUrl = newPage.webSocketDebuggerUrl;
  if (!wsUrl) throw new Error('Failed to create new page');

  process.stderr.write(`[cdp] New page created, connecting to ${wsUrl}\n`);
  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  try {
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');

    // Monitor Akamai POST requests
    let postCount = 0;
    cdp.on('Network.requestWillBeSent', (params) => {
      if (params.request.method === 'POST') {
        postCount++;
        const bodyLen = (params.request.postData || '').length;
        process.stderr.write(`[cdp] POST #${postCount} (${bodyLen} bytes)\n`);
      }
    });

    // Step 2: Navigate to target
    process.stderr.write(`[cdp] Navigating to ${pageUrl}\n`);
    const loadPromise = cdp.waitForEvent('Page.loadEventFired', 30000);
    await cdp.send('Page.navigate', { url: pageUrl });
    await loadPromise;
    process.stderr.write('[cdp] Page loaded\n');

    // Step 3: Wait for Akamai 1st POST (auto-fires during/after page load)
    await sleep(4000);

    // Step 4: Simulate user interaction (required for 2nd POST validation)
    process.stderr.write('[cdp] Simulating interaction...\n');
    await simulateInteraction(cdp);

    // Step 5: Wait for Akamai 2nd POST
    await sleep(5000);

    // Step 6: Check _abck status
    const cookies = await getCookies(cdp);
    const abck = cookies._abck || '';
    const status = abck.split('~')[1] || '?';
    process.stderr.write(`[cdp] _abck status: ${status}, POST count: ${postCount}\n`);

    if (status === '0') return { status, cookies };

    // Retry up to 3 rounds if needed
    for (let round = 1; round <= 3; round++) {
      process.stderr.write(`[cdp] Retry round ${round}...\n`);
      await simulateInteraction(cdp);
      await sleep(5000);

      const retryCookies = await getCookies(cdp);
      const retryStatus = (retryCookies._abck || '').split('~')[1] || '?';
      process.stderr.write(`[cdp] _abck status (retry ${round}): ${retryStatus}\n`);
      if (retryStatus === '0') return { status: retryStatus, cookies: retryCookies };
    }

    const finalCookies = await getCookies(cdp);
    const finalStatus = (finalCookies._abck || '').split('~')[1] || '?';
    return { status: finalStatus, cookies: finalCookies };
  } finally {
    try { await cdp.send('Page.close'); } catch(e) {}
    cdp.close();
  }
}

// ─── Interaction simulation ──────────────────────────────

async function simulateInteraction(cdp) {
  // Mouse movement (curved path across page)
  for (let i = 0; i < 30; i++) {
    const t = i / 30;
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: Math.round(50 + t * 800 + Math.sin(i * 0.3) * 40),
      y: Math.round(200 + t * 300 + Math.cos(i * 0.4) * 50),
      timestamp: Date.now() / 1000,
    });
    await sleep(30 + Math.random() * 40);
  }

  // Click
  const cx = 400 + Math.floor(Math.random() * 300);
  const cy = 350 + Math.floor(Math.random() * 150);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: cx, y: cy,
    button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
  });
  await sleep(60 + Math.random() * 40);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: cx, y: cy,
    button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
  });
  await sleep(200);

  // Keyboard (Tab + type a few chars)
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: 'Tab', code: 'Tab',
    windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
  });
  await sleep(40);
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: 'Tab', code: 'Tab',
    windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
  });
  await sleep(200);

  for (const ch of ['1', '2', '3']) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: ch, code: `Digit${ch}`,
      windowsVirtualKeyCode: ch.charCodeAt(0), nativeVirtualKeyCode: ch.charCodeAt(0),
      text: ch,
    });
    await sleep(50 + Math.random() * 50);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: ch, code: `Digit${ch}`,
      windowsVirtualKeyCode: ch.charCodeAt(0), nativeVirtualKeyCode: ch.charCodeAt(0),
    });
    await sleep(60 + Math.random() * 60);
  }

  // Scroll
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseWheel', x: 500, y: 400,
    deltaX: 0, deltaY: 150, timestamp: Date.now() / 1000,
  });
}

// ─── Helpers ───────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getCookies(cdp) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(function() {
      var cs = document.cookie.split('; ');
      var result = {};
      cs.forEach(function(c) { var eq = c.indexOf('='); if (eq > 0) result[c.substring(0,eq)] = c.substring(eq+1); });
      return JSON.stringify(result);
    })()`,
  });
  return JSON.parse(result.result.value);
}

function httpReq(url, method) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: method || 'GET' };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Invalid JSON from ${url}: ${data.substring(0, 100)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
    this.eventHandlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.id && this.callbacks.has(msg.id)) {
          this.callbacks.get(msg.id)(msg);
          this.callbacks.delete(msg.id);
        }
        if (msg.method && this.eventHandlers.has(msg.method)) {
          for (const handler of this.eventHandlers.get(msg.method)) {
            handler(msg.params);
          }
        }
      });
    });
  }

  send(method, params) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, (msg) => {
        if (msg.error) reject(new Error(`CDP ${method}: ${msg.error.message}`));
        else resolve(msg.result || {});
      });
      this.ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
      setTimeout(() => {
        if (this.callbacks.has(msgId)) {
          this.callbacks.delete(msgId);
          reject(new Error(`CDP ${method} timeout`));
        }
      }, 10000);
    });
  }

  on(eventName, handler) {
    if (!this.eventHandlers.has(eventName)) this.eventHandlers.set(eventName, []);
    this.eventHandlers.get(eventName).push(handler);
  }

  waitForEvent(eventName, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeout || 10000);
      if (!this.eventHandlers.has(eventName)) this.eventHandlers.set(eventName, []);
      const handler = (params) => {
        clearTimeout(timer);
        const handlers = this.eventHandlers.get(eventName);
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
        resolve(params);
      };
      this.eventHandlers.get(eventName).push(handler);
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}
