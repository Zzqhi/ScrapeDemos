// Debug: find exactly which undefined global gets .prototype accessed
const fs = require('fs');
const path = require('path');
const { setup } = require('./env.js');

const env = setup({
  cookie: 'bm_sz=test~123~3228741~test; _abck=54D77C311BCA8DC029EC57084FB0FCE8~-1~test~test',
  pageUrl: 'https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tacking-id=1232343&tracking-id=1232343',
  postUrl: 'https://www.dhl.com/bWZ4sJnBAW/iywWok/A7Ev/J1QONzmLNwL4kpEQ/ekt7IT0/LjQ/dJCN9MTkB',
});

// Track what globals return undefined
const undefinedGlobals = new Set();

// Wrap globalThis with Proxy to log all undefined property accesses
const handler = {
  get(target, prop, receiver) {
    const val = Reflect.get(target, prop, receiver);
    if (val === undefined && typeof prop === 'string' && !prop.startsWith('_')) {
      undefinedGlobals.add(prop);
    }
    return val;
  }
};

// Can't proxy globalThis directly in node, but we can override specific patterns
// Better approach: search the bundle for ".prototype" and see what objects are involved

const code = fs.readFileSync(path.resolve('dhl/test.js'), 'utf-8');

// Find all patterns like `X.prototype` in the bundle where X could be a global
// In minified code, the pattern would be like: variableName.prototype
// But more useful: let's instrument the code to catch the specific error

// Wrap eval to add a try-catch around the specific function
// First, find IFQ in the code
const ifqIdx = code.indexOf('IFQ');
if (ifqIdx >= 0) {
  // Find function definition context
  let searchStart = Math.max(0, ifqIdx - 2000);
  let searchEnd = Math.min(code.length, ifqIdx + 2000);
  let context = code.substring(searchStart, searchEnd);

  // Look for .prototype near IFQ
  const protoMatches = [];
  let re = /(\w+)\.prototype/g;
  let m;
  while ((m = re.exec(context)) !== null) {
    protoMatches.push(m[1]);
  }
  console.log('Globals near IFQ that have .prototype accessed:', [...new Set(protoMatches)].join(', '));
  console.log('Context around IFQ:');
  // Find the function IFQ definition
  const funcMatch = context.match(/IFQ\s*[=(]/);
  if (funcMatch) {
    const fIdx = context.indexOf(funcMatch[0]);
    console.log(context.substring(Math.max(0, fIdx-100), Math.min(context.length, fIdx+500)));
  }
} else {
  console.log('IFQ not found in bundle code');
  // The error stack says "at IFQ (eval at <anonymous" — so IFQ is defined in the eval'd code
  // Let's search more broadly
  // Find all ".prototype" occurrences and their surrounding identifiers
  const protoAll = [];
  const re2 = /(\w+)\.prototype/g;
  let m2;
  while ((m2 = re2.exec(code)) !== null) {
    protoAll.push(m2[1]);
  }
  const counts = {};
  protoAll.forEach(n => counts[n] = (counts[n]||0) + 1);
  console.log('Top .prototype accesses:', Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>`${k}(${v})`).join(', '));
}

process.exit(0);
