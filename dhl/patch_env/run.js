// Run Akamai bundle with patched environment, capture sensor_data
// Usage: echo '{"cookie":"...", "script_path":"...", "page_url":"...", "post_url":"..."}' | node run.js
// Output: {"sensor_data": "..."}

const fs = require('fs');
const path = require('path');
const { setup } = require('./env.js');

let inputBuf = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', chunk => inputBuf += chunk);
process.stdin.on('end', () => {
  const config = JSON.parse(inputBuf);
  run(config).catch(err => {
    process.stderr.write(`Fatal: ${err.message}\n${err.stack}\n`);
    process.stdout.write(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
});

async function run(config) {
  const scriptPath = config.script_path || 'dhl/test.js';
  const env = setup({
    cookie: config.cookie || '',
    pageUrl: config.page_url || 'https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tacking-id=1232343&tracking-id=1232343',
    postUrl: config.post_url || '',
    userAgent: config.user_agent || undefined,
    // Screen dimensions matching real browser
    innerWidth: config.innerWidth || 1036,
    innerHeight: config.innerHeight || 799,
    outerWidth: config.outerWidth || 1051,
    outerHeight: config.outerHeight || 920,
    screenWidth: config.screenWidth || 1536,
    screenHeight: config.screenHeight || 960,
    availWidth: config.availWidth || 1536,
    availHeight: config.availHeight || 912,
    devicePixelRatio: config.devicePixelRatio || 1.25,
    gpuVendor: config.gpuVendor || undefined,
    gpuRenderer: config.gpuRenderer || undefined,
  });

  // Load and execute bundle
  const code = fs.readFileSync(path.resolve(scriptPath), 'utf-8');
  process.stderr.write(`[run] Loading bundle: ${scriptPath} (${code.length} chars)\n`);

  try {
    // Use indirect eval to execute in global scope
    const evalGlobal = eval;
    evalGlobal(code);
    process.stderr.write('[run] Bundle executed OK\n');
  } catch(e) {
    process.stderr.write(`[run] Bundle error: ${e.message}\n`);
    process.stderr.write(`${(e.stack || '').split('\n').slice(0, 8).join('\n')}\n`);
  }

  // Wait for both sensor_data POSTs (bundle sends 2: initial + full)
  try {
    await env.waitForSensor(5000, 2); // wait for 2nd POST
    const history = env.getSensorHistory();
    process.stdout.write(JSON.stringify({
      sensor_data: history[0],    // 1st POST (42 keys, initial)
      sensor_data_2: history[1],  // 2nd POST (50 keys, full)
    }));
    process.exit(0);
  } catch(e) {
    // If only 1st POST arrived, still return it
    const history = env.getSensorHistory();
    if (history.length > 0) {
      process.stderr.write(`[run] Only ${history.length} sensor(s) captured\n`);
      process.stdout.write(JSON.stringify({
        sensor_data: history[0],
        sensor_data_2: history[1] || null,
      }));
      process.exit(0);
    }
    process.stderr.write(`[run] ${e.message}\n`);
    process.stdout.write(JSON.stringify({ error: e.message, sensor_count: env.getSensorCount() }));
    process.exit(1);
  }
}
