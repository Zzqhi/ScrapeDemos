// JSRPC server: connects to headed Chrome via CDP,
// exposes bmak.get_telemetry() as HTTP API for Python to call
const WebSocket = require('ws');
const http = require('http');

async function getWsUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9333/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const pages = JSON.parse(data);
        const dhl = pages.find(p => p.url.includes('dhl.com') && p.type === 'page');
        if (dhl) resolve(dhl.webSocketDebuggerUrl);
        else reject('No DHL page found');
      });
    }).on('error', reject);
  });
}

let msgId = 1;
function sendCDP(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const timeout = setTimeout(() => reject(new Error('CDP timeout')), 10000);
    const handler = (msg) => {
      const data = JSON.parse(msg);
      if (data.id === id) {
        clearTimeout(timeout);
        ws.removeListener('message', handler);
        resolve(data.result || data.error);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  const wsUrl = await getWsUrl();
  console.log('CDP connecting:', wsUrl);
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  await sendCDP(ws, 'Runtime.enable');
  console.log('CDP connected');

  // HTTP server for Python to call
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/get_sensor') {
      try {
        const result = await sendCDP(ws, 'Runtime.evaluate', {
          expression: `
            (function() {
              try {
                const sd = window.bmak.get_telemetry();
                return JSON.stringify({ sensor_data: sd });
              } catch(e) {
                return JSON.stringify({ error: e.message, stack: e.stack });
              }
            })()
          `,
          returnByValue: true
        });
        const data = JSON.parse(result.result.value);
        console.log(`[${new Date().toISOString()}] sensor_data generated, length=${data.sensor_data?.length || 0}`);
        res.end(JSON.stringify(data));
      } catch(e) {
        res.end(JSON.stringify({ error: e.message }));
      }
    } else if (req.url === '/get_cookies') {
      try {
        const result = await sendCDP(ws, 'Runtime.evaluate', {
          expression: `document.cookie`,
          returnByValue: true
        });
        res.end(JSON.stringify({ cookies: result.result.value }));
      } catch(e) {
        res.end(JSON.stringify({ error: e.message }));
      }
    } else if (req.url === '/get_abck') {
      try {
        const result = await sendCDP(ws, 'Runtime.evaluate', {
          expression: `
            (function() {
              const c = document.cookie.split('; ').find(c => c.startsWith('_abck='));
              if (!c) return JSON.stringify({ status: 'none' });
              const val = decodeURIComponent(c.split('=').slice(1).join('='));
              const parts = val.split('~');
              return JSON.stringify({ status: parts[1], cookie: c });
            })()
          `,
          returnByValue: true
        });
        res.end(result.result.value);
      } catch(e) {
        res.end(JSON.stringify({ error: e.message }));
      }
    } else {
      res.end(JSON.stringify({
        endpoints: ['/get_sensor', '/get_cookies', '/get_abck']
      }));
    }
  });

  server.listen(5000, () => {
    console.log('JSRPC server running on http://localhost:5000');
    console.log('Endpoints:');
    console.log('  GET /get_sensor  - Generate sensor_data via bmak.get_telemetry()');
    console.log('  GET /get_cookies - Get all cookies from browser');
    console.log('  GET /get_abck   - Get _abck cookie status');
  });
}

main().catch(console.error);
