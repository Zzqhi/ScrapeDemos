// Debug: log all globalThis property accesses that return undefined
const fs = require('fs');
const path = require('path');
const { setup } = require('./env.js');

const env = setup({
  cookie: 'bm_sz=test~123~3228741~test; _abck=54D77C311BCA8DC029EC57084FB0FCE8~-1~test~test',
  pageUrl: 'https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tacking-id=1232343&tracking-id=1232343',
  postUrl: 'https://www.dhl.com/bWZ4sJnBAW/iywWok/A7Ev/J1QONzmLNwL4kpEQ/ekt7IT0/LjQ/dJCN9MTkB',
});

// Track all undefined global accesses
const undefinedAccesses = new Set();
const accessCounts = {};

// The sww error mentions .prototype on undefined
// Let me find what's being accessed by wrapping the eval in a try-catch
// with more specific error info

// Intercept the error more precisely
const origError = Error;
const errorLocations = [];

// Actually, simpler approach: just add the missing globals that the sww
// computation needs. From the browser capture, sww has ~50 s0XX fields
// related to navigator.userAgentData. Let me check what's failing.

// In the browser:
// sww.s025 = new Date().toString()  -- already works
// sww.s029 = Intl.DateTimeFormat().resolvedOptions().timeZone
// sww.s031 = navigator.language
// sww.s033 = navigator.languages
// sww.s035 = navigator.hardwareConcurrency
// sww.s037 = navigator.deviceMemory * 1024 / 50... no wait
// sww.s039 = [navigator.connection.effectiveType, ...]
// sww.s041 = navigator.userAgent
// sww.s043 = navigator.appVersion
// sww.s045 = navigator.platform
// sww.s047 = navigator.userAgentData.brands
// sww.s049 = navigator.userAgentData.mobile
// sww.s051 = architecture from getHighEntropyValues
// etc.

// The .prototype error might be from something like:
// SharedArrayBuffer.prototype or Set.prototype.intersection or similar

// Let me try: wrap require to intercept errors in sww computation
const _stringify = JSON.stringify;
JSON.stringify = function(obj) {
  const r = _stringify.apply(this, arguments);
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    if (keys.includes('sww')) {
      const sww = obj.sww;
      if (sww && typeof sww === 'object') {
        console.log('sww keys:', Object.keys(sww).join(', '));
        if (sww.error) console.log('sww error:', sww.error);
        console.log('sww full:', _stringify(sww).substring(0, 500));
      }
    }
    if (keys.includes('ajr') && keys.includes('din')) {
      console.log('\npayload keys:', keys.join(', '));
      // Check specific problem fields
      console.log('fpt:', obj.fpt);
      console.log('per:', obj.per);
      console.log('sde:', obj.sde);
      console.log('din type:', typeof obj.din);
      console.log('mst type:', typeof obj.mst);
      if (obj.dsi) console.log('dsi:', _stringify(obj.dsi).substring(0, 200));
      if (obj.wsl) console.log('wsl:', obj.wsl);
      if (obj.hls) console.log('hls:', obj.hls);
      if (obj.fwd) console.log('fwd:', _stringify(obj.fwd));
    }
  }
  return r;
};

const code = fs.readFileSync(path.resolve('dhl/test.js'), 'utf-8');
try {
  eval(code);
} catch(e) {
  console.error('Bundle top-level error:', e.message);
}

setTimeout(() => { process.exit(0); }, 6000);
