// Solve Akamai challenge using CDP (Chrome DevTools Protocol)
// Requires: Chrome running with --remote-debugging-port=9222
//
// Usage: echo '{"page_url":"...", "script_url":"..."}' | node cdp_solve.js
// Output: {"abck": "...", "cookies": {...}}

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
  const cookies = config.cookies || {};

  // Step 1: Get page WebSocket URL (reuse first available page)
  const pages = await httpGet(`http://localhost:${cdpPort}/json`);
  let page = pages.find(p => p.url.includes('dhl.com')) || pages[0];
  if (!page) throw new Error('No Chrome page available');
  const wsUrl = page.webSocketDebuggerUrl;

  process.stderr.write(`[cdp] Connecting to ${wsUrl}\n`);
  const cdp = new CDPClient(wsUrl);
  await cdp.connect();

  try {
    // Step 2: Set cookies if provided
    if (Object.keys(cookies).length > 0) {
      for (const [name, value] of Object.entries(cookies)) {
        await cdp.send('Network.setCookie', {
          name, value, domain: '.dhl.com', path: '/',
        });
      }
    }

    // Enable necessary domains
    await cdp.send('Network.enable');
    await cdp.send('Page.enable');

    // Step 3: Navigate to blank first (force fresh load), then to target
    process.stderr.write('[cdp] Navigating to about:blank...\n');
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(500);
    process.stderr.write(`[cdp] Navigating to ${pageUrl}\n`);
    await cdp.send('Page.navigate', { url: pageUrl });
    await cdp.waitForEvent('Page.loadEventFired', 15000);
    process.stderr.write('[cdp] Page loaded\n');

    // Step 4: Wait for initial Akamai POSTs
    await sleep(4000);

    // Step 5: Simulate realistic user interaction (trusted events via CDP)
    process.stderr.write('[cdp] Simulating user interaction (round 1)...\n');

    // Phase 1: Natural mouse entrance from edge + movement across page
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(50 + t * 800 + Math.sin(i * 0.3) * 40),
        y: Math.round(200 + t * 300 + Math.cos(i * 0.4) * 50),
        timestamp: Date.now() / 1000,
      });
      await sleep(30 + Math.random() * 50);
    }

    // Phase 2: Mouse click on page body
    const clickX = 400 + Math.floor(Math.random() * 300);
    const clickY = 350 + Math.floor(Math.random() * 150);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: clickX, y: clickY,
      button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
    });
    await sleep(60 + Math.random() * 40);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: clickX, y: clickY,
      button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
    });
    await sleep(200);

    // Phase 3: Keyboard interaction (Tab, then type something)
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyDown', key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
    });
    await sleep(40);
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'keyUp', key: 'Tab', code: 'Tab',
      windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
    });
    await sleep(300);

    // Type a few characters
    for (const ch of ['1', '2', '3']) {
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: ch, code: `Digit${ch}`,
        windowsVirtualKeyCode: ch.charCodeAt(0), nativeVirtualKeyCode: ch.charCodeAt(0),
        text: ch,
      });
      await sleep(50 + Math.random() * 60);
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: ch, code: `Digit${ch}`,
        windowsVirtualKeyCode: ch.charCodeAt(0), nativeVirtualKeyCode: ch.charCodeAt(0),
      });
      await sleep(80 + Math.random() * 80);
    }

    // Phase 4: Scroll down
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 500, y: 400,
      deltaX: 0, deltaY: 120,
      timestamp: Date.now() / 1000,
    });
    await sleep(500);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 500, y: 400,
      deltaX: 0, deltaY: 200,
      timestamp: Date.now() / 1000,
    });
    await sleep(300);

    // Phase 5: More mouse movements (mimic reading/scanning page)
    for (let i = 0; i < 20; i++) {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: Math.round(300 + Math.random() * 500),
        y: Math.round(200 + Math.random() * 400),
        timestamp: Date.now() / 1000,
      });
      await sleep(40 + Math.random() * 60);
    }

    // Phase 6: Another click
    const clickX2 = 350 + Math.floor(Math.random() * 400);
    const clickY2 = 300 + Math.floor(Math.random() * 200);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: clickX2, y: clickY2,
      button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
    });
    await sleep(70);
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: clickX2, y: clickY2,
      button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
    });

    // Step 6: Wait for Akamai to process events and POST
    await sleep(5000);

    // Step 7: Check _abck status
    const cookieResult = await cdp.send('Runtime.evaluate', {
      expression: `(function() {
        var cs = document.cookie.split('; ');
        var result = {};
        cs.forEach(function(c) { var eq = c.indexOf('='); if (eq > 0) result[c.substring(0,eq)] = c.substring(eq+1); });
        return JSON.stringify(result);
      })()`,
    });

    const allCookies = JSON.parse(cookieResult.result.value);
    const abck = allCookies._abck || '';
    const status = abck.split('~')[1] || '?';
    process.stderr.write(`[cdp] _abck status: ${status}\n`);

    if (status !== '0') {
      // Try more rounds of interaction
      for (let round = 1; round <= 3; round++) {
        process.stderr.write(`[cdp] Status not 0, retry round ${round}...\n`);

        // Mouse movements
        for (let i = 0; i < 30; i++) {
          await cdp.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved',
            x: Math.round(100 + Math.random() * 700),
            y: Math.round(100 + Math.random() * 500),
            timestamp: Date.now() / 1000,
          });
          await sleep(30 + Math.random() * 50);
        }

        // Click
        const rx = 300 + Math.floor(Math.random() * 400);
        const ry = 250 + Math.floor(Math.random() * 250);
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mousePressed', x: rx, y: ry,
          button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
        });
        await sleep(60);
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseReleased', x: rx, y: ry,
          button: 'left', clickCount: 1, timestamp: Date.now() / 1000,
        });

        // Scroll
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseWheel', x: 500, y: 400,
          deltaX: 0, deltaY: 150 * round,
          timestamp: Date.now() / 1000,
        });

        await sleep(5000);

        const cookieResult2 = await cdp.send('Runtime.evaluate', {
          expression: `(function() {
            var cs = document.cookie.split('; ');
            var result = {};
            cs.forEach(function(c) { var eq = c.indexOf('='); if (eq > 0) result[c.substring(0,eq)] = c.substring(eq+1); });
            return JSON.stringify(result);
          })()`,
        });
        const allCookies2 = JSON.parse(cookieResult2.result.value);
        const status2 = (allCookies2._abck || '').split('~')[1] || '?';
        process.stderr.write(`[cdp] _abck status (retry ${round}): ${status2}\n`);
        if (status2 === '0') return { status: status2, cookies: allCookies2 };
      }

      // Return last attempt result
      const cookieFinal = await cdp.send('Runtime.evaluate', {
        expression: `(function() {
          var cs = document.cookie.split('; ');
          var result = {};
          cs.forEach(function(c) { var eq = c.indexOf('='); if (eq > 0) result[c.substring(0,eq)] = c.substring(eq+1); });
          return JSON.stringify(result);
        })()`,
      });
      const finalCookies = JSON.parse(cookieFinal.result.value);
      const finalStatus = (finalCookies._abck || '').split('~')[1] || '?';
      return { status: finalStatus, cookies: finalCookies };
    }

    return { status, cookies: allCookies };
  } finally {
    cdp.close();
  }
}

// ─── Helpers ───────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(`Invalid JSON from ${url}: ${data.substring(0, 100)}`)); }
      });
    }).on('error', reject);
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
