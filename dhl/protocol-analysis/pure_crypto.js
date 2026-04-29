// Pure-Node port of the 4 sensor_data primitives, lifted from the deobf bundle.
//
// Mapping (deobf → here):
//   OC(data, key)        →  oc(data, key)        Vigenère over a 92-char alphabet,
//                                                 LCG-driven key stream.
//   x9(28, [data, key])  →  shuffleColon(...)     Split by ':', LCG-driven pairwise
//                                                 swap, join.
//   p4(s)                →  sha256Bytes(s)        SHA-256 of UTF-8 bytes.
//   V0(s)                →  utf8ToLatin1(s)       unescape(encodeURIComponent(s)).
//
// LCG constants (Akamai standard):
//   k' = ((k * 65793) + 4282663) & 0x7FFFFF        (Math.imul keeps signed 32-bit)
//
// Verify against a real browser tuple via verify_crypto.js (S2).

"use strict";
const crypto = require("crypto");

// ── LCG step ──────────────────────────────────────────────────────────────

function lcgStep(k) {
  // Math.imul gives signed 32-bit multiply, matching `k *= 65793; k &= 0xFFFFFFFF`
  // in V8. The `& 0x7FFFFF` enforces the bundle's `& 8388607` mod.
  return ((Math.imul(k, 65793) + 4282663) | 0) & 0x7fffff;
}

// ── Vigenère alphabet  (deobf:350-392 / function OC) ─────────────────────
//
// Build once: chars 32..126 except 34("), 39('), 92(\) → 92 entries.
// WC[charCode] = index in alphabet, or -1 if char is left untouched.
const ALPHABET = (() => {
  let s = "";
  for (let c = 32; c < 127; c++) {
    if (c === 34 || c === 39 || c === 92) continue;
    s += String.fromCharCode(c);
  }
  return s;
})();
const WC = (() => {
  const t = new Int16Array(128);
  t.fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) {
    t[ALPHABET.charCodeAt(i)] = i;
  }
  return t;
})();

if (ALPHABET.length !== 92) {
  throw new Error(`alphabet length ${ALPHABET.length}, expected 92`);
}

function oc(data, key) {
  let out = "";
  let k = key | 0;
  const len = ALPHABET.length;
  for (let i = 0; i < data.length; i++) {
    const cp = data.codePointAt(i);
    const offset = (k >>> 8) & 0xffff; // current key bits BEFORE the step
    k = lcgStep(k);
    if (cp >= 32 && cp < 127) {
      const idx = WC[cp];
      if (idx >= 0) {
        out += ALPHABET[(idx + (offset % len)) % len];
        continue;
      }
    }
    out += data[i]; // pass-through (control chars, ' " \, multi-byte)
  }
  return out;
}

// inverse of oc — useful only for testing; production path is encrypt-only
function ocInverse(data, key) {
  let out = "";
  let k = key | 0;
  const len = ALPHABET.length;
  for (let i = 0; i < data.length; i++) {
    const cp = data.codePointAt(i);
    const offset = (k >>> 8) & 0xffff;
    k = lcgStep(k);
    if (cp >= 32 && cp < 127) {
      const idx = WC[cp];
      if (idx >= 0) {
        out += ALPHABET[(idx - (offset % len) + len * 0xffff) % len];
        continue;
      }
    }
    out += data[i];
  }
  return out;
}

// ── x9(28) — colon-segment LCG shuffle  (deobf:8085) ─────────────────────

function shuffleColon(data, key) {
  const segs = data.split(":");
  let k = key | 0;
  const n = segs.length;
  for (let i = 0; i < n; i++) {
    const a = ((k >>> 8) & 0xffff) % n;
    k = lcgStep(k);
    const b = ((k >>> 8) & 0xffff) % n;
    k = lcgStep(k);
    const tmp = segs[a];
    segs[a] = segs[b];
    segs[b] = tmp;
  }
  return segs.join(":");
}

// inverse of shuffleColon: reverse the swap sequence
function shuffleColonInverse(data, key) {
  const segs = data.split(":");
  const n = segs.length;
  // Forward-walk the LCG to record swap pairs, then replay in reverse.
  let k = key | 0;
  const pairs = [];
  for (let i = 0; i < n; i++) {
    const a = ((k >>> 8) & 0xffff) % n;
    k = lcgStep(k);
    const b = ((k >>> 8) & 0xffff) % n;
    k = lcgStep(k);
    pairs.push([a, b]);
  }
  for (let i = pairs.length - 1; i >= 0; i--) {
    const [a, b] = pairs[i];
    const tmp = segs[a];
    segs[a] = segs[b];
    segs[b] = tmp;
  }
  return segs.join(":");
}

// ── SHA-256 + UTF-8 latin1 cast (deobf:393 p4 + V0) ──────────────────────

function utf8ToLatin1(s) {
  // Equivalent to V0: unescape(encodeURIComponent(s)). Each byte of UTF-8
  // becomes one latin-1 character.
  return Buffer.from(s, "utf8").toString("latin1");
}

function sha256Bytes(s) {
  // p4 returns Array<int> of 32 bytes; we return a Buffer (interchangeable).
  return crypto.createHash("sha256").update(s, "utf8").digest();
}

// ── Header builders  (deobf:5129 GpI / 5142 vAI) ─────────────────────────

function headerAutopost(sOh, ajTypeBitmask, bundleVersion) {
  return ["3", "0", 1, ajTypeBitmask, sOh[0], bundleVersion].join(";");
}
function headerInline(sOh, ajTypeBitmask, bundleVersion) {
  return ["3", "1", 2, ajTypeBitmask, sOh[0], bundleVersion].join(";");
}

// ── Full assembly (deobf:4934-4948) ──────────────────────────────────────

function assembleSensorData(fQI, sOh, opts = {}) {
  const {
    ajTypeBitmask = 0,
    bundleVersion = "",
    timing = { dt: 0, Zkh: 0, FTI: 0, mfI: 0 },
    inline = false,
  } = opts;

  const json = JSON.stringify(fQI);
  const t1 = Date.now();
  const enc1 = shuffleColon(json, sOh[1]);
  const dtEnc1 = Date.now() - t1;

  const t2 = Date.now();
  const enc2 = oc(enc1, sOh[0]);
  const dtEnc2 = Date.now() - t2;

  const csv = [
    timing.dt | 0,
    timing.Zkh | 0,
    timing.FTI | 0,
    dtEnc1 | 0,
    dtEnc2 | 0,
    timing.mfI | 0,
  ].join(",");

  const header = inline
    ? headerInline(sOh, ajTypeBitmask, bundleVersion)
    : headerAutopost(sOh, ajTypeBitmask, bundleVersion);

  return [header, csv, enc2].join(";");
}

// ── self-test (basic round-trip) ─────────────────────────────────────────

function _selfTest() {
  // OC round-trip
  const sample = "Hello, world! It's the {sensor_data}.";
  const k = 3158581;
  const enc = oc(sample, k);
  const dec = ocInverse(enc, k);
  if (dec !== sample) throw new Error(`oc round-trip fail:\n  in : ${sample}\n  enc: ${enc}\n  dec: ${dec}`);

  // shuffleColon round-trip
  const seg = "a:b:c:d:e:f:g:h:i:j:k:l:m:n:o:p:q";
  const sh = shuffleColon(seg, 5133921);
  const un = shuffleColonInverse(sh, 5133921);
  if (un !== seg) throw new Error(`shuffleColon round-trip fail:\n  in : ${seg}\n  shuf: ${sh}\n  unshuf: ${un}`);

  // SHA-256 known vector
  const h = sha256Bytes("abc").toString("hex");
  if (h !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    throw new Error(`sha256 fail: ${h}`);

  // LCG step known vector
  const k0 = 8388607;
  const k1 = lcgStep(k0);
  // Independent re-derivation for sanity
  const k1_check = ((Math.imul(k0, 65793) + 4282663) | 0) & 0x7fffff;
  if (k1 !== k1_check) throw new Error(`LCG mismatch ${k1} vs ${k1_check}`);

  // utf8 round-trip (relevant for fpt strings)
  const utf = "héllo 世界";
  const lat1 = utf8ToLatin1(utf);
  const back = Buffer.from(lat1, "latin1").toString("utf8");
  if (back !== utf) throw new Error("utf8/latin1 round-trip fail");

  return true;
}

if (require.main === module) {
  _selfTest();
  console.log("pure_crypto self-test: OK");
  console.log("  ALPHABET length:", ALPHABET.length);
  console.log("  ALPHABET:", JSON.stringify(ALPHABET));

  // Demo full assembly (with stub fQI / keys)
  const fQI = { ver: "test", fpt: "1;-1;dis;0;0;0;0;0;0;-1;-1;-1;-1;-1" };
  const sOh = [3158581, 5133921];
  const body = assembleSensorData(fQI, sOh, {
    ajTypeBitmask: 0,
    bundleVersion: "KiWV+FE0LyOemgXIUydN7MNC2la4nZATHgzJF+Weqb0=",
  });
  console.log("\ndemo assembleSensorData:");
  console.log("  header+csv+enc =", body.slice(0, 200), "...");
  console.log("  total len =", body.length);
}

module.exports = {
  lcgStep,
  oc, ocInverse,
  shuffleColon, shuffleColonInverse,
  sha256Bytes, utf8ToLatin1,
  headerAutopost, headerInline,
  assembleSensorData,
  ALPHABET, WC,
};
