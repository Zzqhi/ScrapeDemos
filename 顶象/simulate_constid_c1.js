#!/usr/bin/env node
"use strict";

const DEFAULT_SERVER = "https://constid.dingxiang-inc.com/udid/c1";
const CUSTOM_B64 = "XmYj3u1PnvisIZUF8ThR/a6DfO+kW4JHrCELycAzSxleoQp02MtwV9Nd57qGgbKB=";
const VERSION = 5493;

function makeLocalID(length = 32) {
  const chars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function utf8Encode(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .replace(/[\u0080-\u07ff]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return String.fromCharCode(192 | (code >> 6), 128 | (code & 63));
    })
    .replace(/[\u0800-\uffff]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return String.fromCharCode(
        224 | (code >> 12),
        128 | ((code >> 6) & 63),
        128 | (code & 63)
      );
    });
}

function encodeCustomBase64(input, alphabet = CUSTOM_B64) {
  if (!input) {
    return "";
  }
  let out = "";
  let i = 0;
  while (i < input.length) {
    const a = input.charCodeAt(i++);
    const b = input.charCodeAt(i++);
    const c = input.charCodeAt(i++);
    const n1 = a >> 2;
    const n2 = ((a & 3) << 4) | (b >> 4);
    let n3 = ((b & 15) << 2) | (c >> 6);
    let n4 = c & 63;
    if (Number.isNaN(b)) {
      n3 = 64;
      n4 = 64;
    } else if (Number.isNaN(c)) {
      n4 = 64;
    }
    out += alphabet.charAt(n1);
    out += alphabet.charAt(n2);
    out += alphabet.charAt(n3);
    out += alphabet.charAt(n4);
  }
  return out;
}

function bs2(n) {
  return [(n >> 8) & 255, n & 255];
}

function toStr(values) {
  return values.map((value) => String.fromCharCode(value)).join("");
}

function packField(index, value) {
  return toStr([index].concat(bs2(value.length))) + value;
}

const fns = [
  (r) => {
    let s = "";
    let l = 221;
    for (let j = 0; j < r.length; j += 1) {
      l = (((l << 8) ^ l) & 240) + (l >> 7);
      s += String.fromCharCode((r.charCodeAt(j) ^ l) & 255);
    }
    return s;
  },
  (t) => {
    let r = "";
    let a = 143;
    for (let u = 0; u < t.length; u += 1) {
      const c = (t.charCodeAt(u) ^ a) & 255;
      r += String.fromCharCode(c);
      a = c;
    }
    return r;
  },
  (a) => {
    let u = "";
    let v = 367;
    for (let l = 0; l < a.length; l += 1) {
      v = (((v << 2) ^ v) & 240) + (v >> 5);
      u += String.fromCharCode((a.charCodeAt(l) ^ v) & 255);
    }
    return u;
  },
  (a) => {
    let b = "";
    let s = 0;
    for (let i = 0; i < a.length; i += 1) {
      let g = a.charCodeAt(i);
      g ^= "dx54gFRTbvc".charCodeAt(s);
      s += 1;
      if (s >= 11) {
        s = 0;
      }
      b += String.fromCharCode(g & 255);
    }
    return b;
  },
  (n) => {
    let a = "";
    for (let s = 0; s < n.length; s += 1) {
      const f = (n.charCodeAt(s) - 6) & 255;
      const d = 3;
      const v = ((f >> d) + (f << (8 - d))) & 255;
      a += String.fromCharCode(v);
    }
    return a;
  },
  (a) => {
    let u = "";
    let f = 43521;
    for (let d = 0; d < a.length; d += 1) {
      const v = a.charCodeAt(d) ^ f;
      f = ((f * d) % 256) + 24351;
      u += String.fromCharCode(v & 255);
    }
    return u;
  },
  (a) => {
    let v = "";
    let s = 32;
    for (let f = 0; f < a.length; f += 1) {
      let d = a.charCodeAt(f);
      s = (s + 3) % 12;
      d ^= "NxMLsN8Ng7lA".charCodeAt(s);
      v += String.fromCharCode(d & 255);
    }
    return v;
  },
  (o) => {
    let d = "";
    let h = 167;
    for (let p = 0; p < o.length; p += 1) {
      h = (((h << 3) ^ h) & 240) + (h >> 4);
      d += String.fromCharCode((o.charCodeAt(p) ^ h) & 255);
    }
    return d;
  },
  (a) => {
    let s = "";
    const f = "J6Br59Hf7NgK";
    let d = 44;
    for (let v = 0; v < a.length; v += 1) {
      let l = a.charCodeAt(v);
      d = (d + 4) % f.length;
      l ^= f.charCodeAt(d);
      s += String.fromCharCode(l & 255);
    }
    return s;
  },
  (a) => {
    let v = "";
    let s = 2359;
    for (let f = 0; f < a.length; f += 1) {
      const d = a.charCodeAt(f) ^ s;
      s = d;
      v += String.fromCharCode(d & 255);
    }
    return v;
  },
  (e) => {
    let a = "";
    let u = 56737;
    for (let c = 0; c < e.length; c += 1) {
      const s = e.charCodeAt(c) ^ u;
      u = s;
      a += String.fromCharCode(s & 255);
    }
    return a;
  },
  (a) => {
    let d = "";
    for (let j = 0; j < a.length; j += 1) {
      const h = 115 ^ a.charCodeAt(j);
      d += String.fromCharCode(((h >> 6) ^ a.charCodeAt(j)) & 255);
    }
    return d;
  },
  (a) => {
    let c = "";
    for (let d = 0; d < a.length; d += 1) {
      const v = a.charCodeAt(d);
      const l = ((v >> 3) + (v << 5) + 29111) & 255;
      c += String.fromCharCode(l);
    }
    return c;
  },
  (a) => {
    let s = "";
    for (let v = 0; v < a.length; v += 1) {
      const l = a.charCodeAt(v);
      const j = ((l >> 3) + (l << 5) + 47589) & 255;
      s += String.fromCharCode(j);
    }
    return s;
  },
  (a) => {
    let s = "";
    let d = 36;
    for (let v = 0; v < a.length; v += 1) {
      let l = a.charCodeAt(v);
      d = (d + 1) % 10;
      l ^= "KX8Mkg9GJK".charCodeAt(d);
      s += String.fromCharCode(l & 255);
    }
    return s;
  },
  (e) => {
    let a = "";
    let u = 241;
    for (let c = 0; c < e.length; c += 1) {
      const s = (e.charCodeAt(c) ^ u) & 255;
      a += String.fromCharCode(s);
      u = s;
    }
    return a;
  },
  (t) => {
    let a = "";
    for (let s = 0; s < t.length; s += 1) {
      const f = t.charCodeAt(s);
      const d = ((f >> 2) + (f << 6) + 2105) & 255;
      a += String.fromCharCode(d);
    }
    return a;
  },
  (t) => {
    let o = "";
    let a = 46317;
    for (let u = 0; u < t.length; u += 1) {
      const c = t.charCodeAt(u) ^ a;
      a = c;
      o += String.fromCharCode(c & 255);
    }
    return o;
  },
  (t) => {
    let a = "";
    for (let s = 0; s < t.length; s += 1) {
      const f = 121 ^ t.charCodeAt(s);
      a += String.fromCharCode(((f >> 6) ^ t.charCodeAt(s)) & 255);
    }
    return a;
  },
  (a) => {
    let s = "";
    const f = "Hx6Vcs7S5x";
    let l = 0;
    for (let d = 0; d < a.length; d += 1) {
      let v = a.charCodeAt(d);
      v ^= f.charCodeAt(l);
      l += 1;
      if (l >= f.length) {
        l = 0;
      }
      s += String.fromCharCode(v & 255);
    }
    return s;
  },
  (a) => {
    let j = "";
    let p = 72;
    for (let g = 0; g < a.length; g += 1) {
      let m = a.charCodeAt(g);
      p = (p + 1) % 10;
      m ^= "KS6BkH8NsJ".charCodeAt(p);
      j += String.fromCharCode(m & 255);
    }
    return j;
  },
  (e) => {
    let u = "";
    for (let c = 0; c < e.length; c += 1) {
      const s = e.charCodeAt(c);
      const f = ((s >> 5) + (s << 3)) & 255;
      u += String.fromCharCode(f);
    }
    return u;
  },
  (a) => {
    let f = "";
    for (let d = 0; d < a.length; d += 1) {
      const v = (a.charCodeAt(d) - 2) & 255;
      const l = 5;
      const j = ((v >> l) + (v << (8 - l))) & 255;
      f += String.fromCharCode(j);
    }
    return f;
  },
  (a) => {
    let u = "";
    let c = 67845;
    for (let s = 0; s < a.length; s += 1) {
      const f = a.charCodeAt(s) ^ c;
      c = f;
      u += String.fromCharCode(f & 255);
    }
    return u;
  },
  (a) => {
    let c = "";
    let d = 451;
    for (let v = 0; v < a.length; v += 1) {
      const l = a.charCodeAt(v) ^ d;
      d = ((d * v) % 256) + 2755;
      c += String.fromCharCode(l & 255);
    }
    return c;
  },
  (e) => {
    let a = "";
    let u = 3519;
    for (let c = 0; c < e.length; c += 1) {
      const s = (e.charCodeAt(c) ^ u) & 255;
      a += String.fromCharCode(s);
      u = s;
    }
    return a;
  },
  (n) => {
    let a = "";
    let c = 0;
    for (let s = 0; s < n.length; s += 1) {
      let f = n.charCodeAt(s);
      f ^= "NS7SN5gd5U8ls".charCodeAt(c);
      c += 1;
      if (c >= 13) {
        c = 0;
      }
      a += String.fromCharCode(f & 255);
    }
    return a;
  },
  (n) => {
    let i = "";
    for (let c = 0; c < n.length; c += 1) {
      const s = 237 ^ n.charCodeAt(c);
      i += String.fromCharCode(((s >> 8) ^ n.charCodeAt(c)) & 255);
    }
    return i;
  },
  (n) => {
    let u = "";
    let f = 32563;
    for (let d = 0; d < n.length; d += 1) {
      const v = n.charCodeAt(d) ^ f;
      f = ((f * d) % 256) + 29065;
      u += String.fromCharCode(v & 255);
    }
    return u;
  },
  (n) => {
    let u = "";
    let c = 38295;
    for (let s = 0; s < n.length; s += 1) {
      const f = n.charCodeAt(s) ^ c;
      c = f;
      u += String.fromCharCode(f & 255);
    }
    return u;
  }
];

function encodeParam(payload) {
  let packed = "";
  const keys = Object.keys(payload);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    const fn = fns[i % fns.length];
    const fragment = JSON.stringify({ [key]: payload[key] }).slice(1, -1);
    packed += packField(i + 1, fn(utf8Encode(fragment)));
  }
  return `${VERSION}#${encodeCustomBase64(packed, CUSTOM_B64)}`;
}

function mergeOptions(base, options) {
  const merged = { ...base };
  ["appId", "userId", "scene"].forEach((key) => {
    if (options[key]) {
      merged[key] = encodeURIComponent(options[key]);
    }
  });
  merged.appKey = merged.appId;
  delete merged.appId;
  return merged;
}

function buildStoreData(args) {
  const store = {
    lid: args.lid || `${Date.now()}${makeLocalID()}`,
    lidType: args.lidType || "0"
  };
  if (args.token) {
    store.token = args.token;
  }
  return store;
}

function buildPayload(args) {
  const base = {
    cache: args.cache
  };
  const store = buildStoreData(args);
  let payload = mergeOptions({ ...base, ...store }, args);
  if (args.stage === "detect") {
    const extra = args.detectorJson ? JSON.parse(args.detectorJson) : {};
    payload = mergeOptions({ ...base, ...store, ...extra }, args);
  }
  return payload;
}

function buildRequest(args, payload) {
  const param = encodeParam(payload);
  const longParam = param.length > 2048;
  const headers = {};
  const query = {
    _t: `${Date.now()}`.slice(-6, -1)
  };

  if (args.etag && args.token) {
    headers["If-None-Match"] = args.token;
  }

  let method = "GET";
  let body = null;
  if (!longParam && args.etag) {
    headers.Param = param;
  } else {
    query.Param = param;
    if (longParam) {
      method = "POST";
      body = { Param: param, _t: query._t };
      delete query.Param;
    }
  }

  return {
    url: args.server || DEFAULT_SERVER,
    method,
    query,
    headers,
    body,
    param
  };
}

function parseArgs(argv) {
  const out = {
    stage: "prequest",
    appId: "",
    userId: "",
    scene: "",
    token: "",
    lid: "",
    lidType: "0",
    cache: true,
    etag: true,
    server: DEFAULT_SERVER,
    detectorJson: ""
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (["cache", "etag"].includes(key)) {
      out[key] = next !== "false";
      i += 1;
      continue;
    }
    out[key] = next;
    i += 1;
  }

  if (!out.appId) {
    out.appId = "app-test";
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = buildPayload(args);
  const request = buildRequest(args, payload);

  console.log(JSON.stringify({
    stage: args.stage,
    payload,
    paramLength: request.param.length,
    param: request.param,
    request: {
      method: request.method,
      url: request.url,
      query: request.query,
      headers: request.headers,
      body: request.body
    }
  }, null, 2));
}

main();
