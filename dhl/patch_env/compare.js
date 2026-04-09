// Compare: run bundle with env patch, hook JSON.stringify to capture payload,
// then compare key-by-key with browser reference payload.
//
// Usage: node compare.js
// Requires: dhl/test.js (current bundle)

const fs = require('fs');
const path = require('path');
const { setup } = require('./env.js');

const scriptPath = 'dhl/test.js';
const cookie = 'bm_sz=test~123~3228741~test; _abck=54D77C311BCA8DC029EC57084FB0FCE8~-1~test~test';
const pageUrl = 'https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tacking-id=1232343&tracking-id=1232343';
const postUrl = 'https://www.dhl.com/bWZ4sJnBAW/iywWok/A7Ev/J1QONzmLNwL4kpEQ/ekt7IT0/LjQ/dJCN9MTkB';

const env = setup({ cookie, pageUrl, postUrl });

// Hook JSON.stringify to capture payload before encryption
const capturedPayloads = [];
const _stringify = JSON.stringify;
JSON.stringify = function(obj) {
  const result = _stringify.apply(this, arguments);
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const keys = Object.keys(obj);
    // Detect sensor payload: has 'ajr', 'din', 'mst'
    if (keys.includes('ajr') && (keys.includes('din') || keys.includes('mst'))) {
      capturedPayloads.push({ obj: obj, json: result, keys: keys });
      process.stderr.write(`[HOOK] Captured payload #${capturedPayloads.length}, ${keys.length} keys, json len=${result.length}\n`);
    }
  }
  return result;
};

// Execute bundle
const code = fs.readFileSync(path.resolve(scriptPath), 'utf-8');
try {
  eval(code);
} catch(e) {
  process.stderr.write(`Bundle error: ${e.message}\n${(e.stack||'').split('\n').slice(0,5).join('\n')}\n`);
}

// Wait for async XHR then compare
setTimeout(() => {
  if (capturedPayloads.length === 0) {
    console.log('ERROR: No payload captured. Bundle may have failed to generate sensor_data.');
    process.exit(1);
  }

  const p = capturedPayloads[0]; // first POST (most comparable)
  const nodeKeys = p.keys;
  console.log(`\n=== Node.js Payload: ${nodeKeys.length} keys ===`);
  console.log('Keys:', nodeKeys.join(', '));

  // Browser reference keys (from capture)
  const browserKeys = ['ver','fpt','fpc','ajr','din','eem','ffs','vev','inf','ajt','kev','dme','mev','doe','pur','pev','mst','o9','tev','sde','per','dsi','wsl','hls','pde','oev','if','pus','ffl','sww','te','nte','mte','tcd','pnte','pte','pmte','tab','sws','mis','og','s017','s148','s151','s153','s003','s002','s150','s127','fwd'];

  console.log(`\nBrowser keys: ${browserKeys.length}`);
  console.log(`Node keys: ${nodeKeys.length}`);

  // Missing in node
  const missing = browserKeys.filter(k => !nodeKeys.includes(k));
  console.log(`\n--- Missing in Node (${missing.length}) ---`);
  missing.forEach(k => console.log(`  MISSING: ${k}`));

  // Extra in node
  const extra = nodeKeys.filter(k => !browserKeys.includes(k));
  if (extra.length > 0) {
    console.log(`\n--- Extra in Node (${extra.length}) ---`);
    extra.forEach(k => console.log(`  EXTRA: ${k}`));
  }

  // Compare shared keys
  console.log('\n--- Key-by-key comparison (shared keys) ---');
  const sharedKeys = nodeKeys.filter(k => browserKeys.includes(k));
  for (const k of sharedKeys) {
    const v = p.obj[k];
    const vStr = (v === undefined || v === null) ? String(v) : (typeof v === 'string' ? v : _stringify(v));
    const short = vStr.length > 80 ? vStr.substring(0, 80) + '...' : vStr;

    // Check type
    const typeStr = Array.isArray(v) ? 'array' : typeof v;
    if (k === 'din' || k === 'mst') {
      // These should be stringified arrays in browser
      const isStr = typeof v === 'string';
      console.log(`  ${k}: type=${typeStr}, len=${vStr.length}, is_string=${isStr}`);
    } else if (k === 'per') {
      console.log(`  ${k}: "${short}" (browser: "99999944949322244999")`);
    } else if (k === 'sww') {
      const swwKeys = typeof v === 'object' ? Object.keys(v) : [];
      console.log(`  ${k}: ${swwKeys.length} sub-keys (browser: ~50 sub-keys)`);
      if (swwKeys.length < 10) console.log(`    full: ${_stringify(v)}`);
    } else if (k === 'ajt') {
      console.log(`  ${k}: "${v}" (browser 1st POST should be "0,0")`);
    } else if (k === 'dme' || k === 'doe') {
      console.log(`  ${k}: "${short}" (browser has sensor data)`);
    } else if (k === 'ffs' || k === 'inf') {
      console.log(`  ${k}: "${short}"`);
    } else if (k === 'sde') {
      console.log(`  ${k}: "${v}" (browser: "0,0,0,0,1,0,0")`);
    } else {
      // Just show value
      console.log(`  ${k}: ${short}`);
    }
  }

  // Show dsi/wsl/hls/fwd from node if present
  for (const k of ['dsi', 'wsl', 'hls', 'fwd']) {
    if (p.obj[k] !== undefined) {
      const v = p.obj[k];
      const vStr = typeof v === 'string' ? v : _stringify(v);
      console.log(`  ${k}: ${(vStr||'').substring(0, 120)}`);
    }
  }

  // Check din/mst type — browser has them as strings
  console.log('\n--- din/mst type check ---');
  console.log(`  din type: ${typeof p.obj.din} (should be "string" in browser)`);
  console.log(`  mst type: ${typeof p.obj.mst} (should be "string" in browser)`);

  // 2nd POST comparison
  if (capturedPayloads.length >= 2) {
    const p2 = capturedPayloads[1];
    console.log(`\n=== 2nd POST: ${p2.keys.length} keys ===`);
    const missing2 = browserKeys.filter(k => !p2.keys.includes(k));
    const extra2 = p2.keys.filter(k => !browserKeys.includes(k));
    console.log(`Missing: ${missing2.length > 0 ? missing2.join(', ') : 'none'}`);
    console.log(`Extra: ${extra2.length > 0 ? extra2.join(', ') : 'none'}`);
    console.log(`per: "${p2.obj.per}"`);
    console.log(`sde: "${p2.obj.sde}"`);
    console.log(`din type: ${typeof p2.obj.din}`);
    console.log(`mst type: ${typeof p2.obj.mst}`);
    const sww2 = p2.obj.sww;
    console.log(`sww keys: ${sww2 ? Object.keys(sww2).length : 0}`);
    // Show s0XX from 2nd post
    for (const k of ['s017','s148','s151','s153','s003','s002','s150','s127']) {
      if (p2.obj[k] !== undefined) console.log(`  ${k}: ${_stringify(p2.obj[k])}`);
    }
  }

  console.log('\n=== Done ===');
  process.exit(0);
}, 5000);
