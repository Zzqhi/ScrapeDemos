// Fetch API data from within Chrome (same TLS session as solved Akamai)
// Usage: echo '{"url":"...", "referer":"..."}' | node cdp_fetch.js
// Output: {"status": 200, "body": "..."}

const WebSocket = require('ws');
const http = require('http');

let inputBuf = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => inputBuf += chunk);
process.stdin.on('end', () => {
  const config = JSON.parse(inputBuf);
  fetchVia(config).then(result => {
    process.stdout.write(JSON.stringify(result));
    process.exit(0);
  }).catch(err => {
    process.stderr.write(`Fatal: ${err.message}\n`);
    process.stdout.write(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
});

async function fetchVia(config) {
  const apiUrl = config.url;
  const referer = config.referer || '';
  const cdpPort = config.cdp_port || 9222;

  // Find the DHL page
  const pages = await httpGet(`http://localhost:${cdpPort}/json`);
  let page = pages.find(p => p.url.includes('dhl.com')) || pages[0];
  if (!page) throw new Error('No Chrome page available');

  const cdp = new CDPClient(page.webSocketDebuggerUrl);
  await cdp.connect();

  try {
    // Execute fetch() inside the browser context
    const result = await cdp.send('Runtime.evaluate', {
      expression: `(async () => {
        try {
          const resp = await fetch(${JSON.stringify(apiUrl)}, {
            method: 'GET',
            credentials: 'include',
            headers: {
              'Accept': 'application/json',
              'Referer': ${JSON.stringify(referer)},
            },
          });
          const text = await resp.text();
          return JSON.stringify({ status: resp.status, body: text });
        } catch(e) {
          return JSON.stringify({ error: e.message });
        }
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'eval error');
    }

    return JSON.parse(result.result.value);
  } finally {
    cdp.close();
  }
}

// ─── Helpers ───────────────────────────────────────────────

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

  close() {
    if (this.ws) this.ws.close();
  }
}
