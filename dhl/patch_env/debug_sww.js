// Debug: find what .prototype access causes the sww error
const fs = require('fs');
const path = require('path');
const { setup } = require('./env.js');

const env = setup({
  cookie: 'bm_sz=test~123~3228741~test; _abck=54D77C311BCA8DC029EC57084FB0FCE8~-1~test~test',
  pageUrl: 'https://www.dhl.com/cn-zh/home/tracking.html?submit=1&tacking-id=1232343&tracking-id=1232343',
  postUrl: 'https://www.dhl.com/bWZ4sJnBAW/iywWok/A7Ev/J1QONzmLNwL4kpEQ/ekt7IT0/LjQ/dJCN9MTkB',
});

// Patch: add verbose prototype access logging via Proxy on globalThis
// We want to find which global is undefined when .prototype is accessed
const suspectGlobals = [
  'SharedArrayBuffer', 'Atomics', 'WeakRef', 'FinalizationRegistry',
  'ShadowRoot', 'HTMLElement', 'SVGElement', 'XPathResult',
  'DOMRect', 'DOMRectReadOnly', 'DOMPoint', 'DOMMatrix',
  'MediaSource', 'SourceBuffer', 'MediaStream', 'RTCPeerConnection',
  'SpeechRecognition', 'webkitSpeechRecognition',
  'PaymentRequest', 'Credential', 'PublicKeyCredential',
  'PushManager', 'BackgroundFetchManager',
  'Permissions', 'BarcodeDetector',
  'EyeDropper', 'FileSystemHandle',
  'ClipboardItem', 'Highlight', 'Selection',
  'Range', 'TreeWalker', 'NodeIterator',
  'FontFace', 'FontFaceSet',
  'Sanitizer', 'TrustedTypes',
  'scheduler',
];

// Provide common missing globals with prototype
for (const name of suspectGlobals) {
  if (globalThis[name] === undefined) {
    globalThis[name] = function() {};
  }
}

// Also patch Date.prototype.toLocaleString to handle timezone
// And ensure Intl works

// Execute bundle with error collection
const code = fs.readFileSync(path.resolve('dhl/test.js'), 'utf-8');
try {
  eval(code);
} catch(e) {
  process.stderr.write(`Bundle error: ${e.message}\n`);
}

// Wait and check
setTimeout(() => {
  // Hook JSON.stringify for next comparison
  const _s = JSON.stringify;
  let captured = null;
  JSON.stringify = function(obj) {
    const r = _s.apply(this, arguments);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      const keys = Object.keys(obj);
      if (keys.includes('ajr') && keys.includes('sww')) {
        captured = obj;
      }
    }
    return r;
  };

  // Force re-eval won't work. Just check what we got from first run.
  // The sensor was already sent. Let's decode the sww from the capture.
  console.log('sensor count:', env.getSensorCount());
  console.log('sensor available:', !!env.getSensorData());
  if (env.getSensorData()) {
    console.log('sensor len:', env.getSensorData().length);
  }
  process.exit(0);
}, 5000);
