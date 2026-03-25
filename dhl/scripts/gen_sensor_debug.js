// 调试版本：找出 Akamai 脚本缺少什么环境
const vm = require('vm');
const fs = require('fs');

const akamaiCode = fs.readFileSync('dhl/test.js', 'utf-8');

// 用 Proxy 来捕获所有属性访问，找出缺什么
const missingProps = new Set();
const accessLog = [];

function createTrackingProxy(target, path = 'window') {
  return new Proxy(target, {
    get(obj, prop) {
      if (typeof prop === 'symbol') return obj[prop];
      const fullPath = `${path}.${String(prop)}`;
      const val = obj[prop];
      if (val === undefined && prop !== 'undefined' && prop !== '__proto__') {
        if (!missingProps.has(fullPath)) {
          missingProps.add(fullPath);
          if (accessLog.length < 50) {
            accessLog.push(fullPath);
          }
        }
      }
      return val;
    },
    set(obj, prop, val) {
      obj[prop] = val;
      return true;
    }
  });
}

// 最小环境
const env = {
  // 全局
  console: { log(){}, warn(){}, error(){}, info(){}, debug(){} },
  setTimeout, clearTimeout, setInterval, clearInterval,
  parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape,
  JSON, Math, Date, RegExp, String, Number, Boolean, Array, Object, Function,
  Error, TypeError, RangeError, SyntaxError, URIError, EvalError, ReferenceError,
  Map, Set, WeakMap, WeakSet, Promise, Proxy, Reflect, Symbol,
  Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
  Float32Array, Float64Array, ArrayBuffer, DataView,
  TextEncoder, TextDecoder,
};

const ctx = vm.createContext(env);

try {
  vm.runInContext(akamaiCode, ctx, { timeout: 5000, filename: 'akamai.js' });
  console.log('Script completed without error');
} catch(e) {
  console.log(`Script error: ${e.message}`);
  // Get the stack to see where it failed
  const stack = e.stack || '';
  const lines = stack.split('\n').slice(0, 5);
  for (const line of lines) {
    console.log(`  ${line}`);
  }
}

console.log(`\nMissing ${missingProps.size} properties (first 50):`);
for (const p of accessLog) {
  console.log(`  ${p}`);
}
