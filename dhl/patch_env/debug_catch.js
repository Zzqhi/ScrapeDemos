// Precisely catch the .prototype error in the bundle
const fs = require('fs');
const path = require('path');
const { setup } = require('./env.js');

const env = setup({
  cookie: 'bm_sz=test~123~3228741~test; _abck=54D77C~-1~t~t',
  pageUrl: 'https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tacking-id=1232343&tracking-id=1232343',
  postUrl: 'https://www.dhl.com/bWZ4sJnBAW/iywWok/A7Ev/J1QONzmLNwL4kpEQ/ekt7IT0/LjQ/dJCN9MTkB',
});

// Override the bundle code to inject error catching around .prototype accesses
const code = fs.readFileSync(path.resolve('dhl/test.js'), 'utf-8');

// Instrument: wrap eval to catch errors with character positions
// The bundle catches errors internally for sww. We need to intercept before that.

// Approach: temporarily override the global error handler
let prototypeErrors = [];

// Patch: monitor TypeError occurrences
const origTypeError = TypeError;
globalThis.TypeError = function(...args) {
  const err = new origTypeError(...args);
  const msg = err.message || '';
  if (msg.includes('prototype') || msg.includes('Cannot read properties of undefined')) {
    const stack = err.stack || '';
    // Get the eval line number
    const evalMatch = stack.match(/eval.*?:(\d+):(\d+)/);
    const pos = evalMatch ? `line ${evalMatch[1]}:${evalMatch[2]}` : 'unknown';
    prototypeErrors.push({ message: msg, pos: pos, stack: stack.split('\n').slice(0, 4).join('\n') });
  }
  return err;
};
globalThis.TypeError.prototype = origTypeError.prototype;

try {
  eval(code);
} catch(e) {
  console.error('Bundle error:', e.message);
}

setTimeout(() => {
  console.log(`\n=== Captured ${prototypeErrors.length} prototype-related errors ===`);
  for (const err of prototypeErrors) {
    console.log(`\nError: ${err.message}`);
    console.log(`Position: ${err.pos}`);
    console.log(`Stack:\n${err.stack}`);
  }

  // Also show what character is at those positions in the bundle
  for (const err of prototypeErrors) {
    const m = err.pos.match(/line (\d+):(\d+)/);
    if (m) {
      const line = parseInt(m[1]);
      const col = parseInt(m[2]);
      if (line === 1) {
        const context = code.substring(Math.max(0, col - 100), col + 100);
        console.log(`\nBundle context at col ${col}:`);
        console.log(context);
      }
    }
  }
  process.exit(0);
}, 6000);
