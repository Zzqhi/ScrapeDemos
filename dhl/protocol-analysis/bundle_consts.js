// Extract per-bundle literals from a fresh (obfuscated) Akamai bundle.
// These rotate every time the bundle URL changes, so production code
// must call `extractBundleConsts(src)` after every GET of `/-...` and
// feed the result into `pure_crypto.assembleSensorData(...)`.
//
// Verified against:
//   bundle/akamai-local.js (fresh, 553026 bytes)              → sOh1=1557329, ver="NnKzk..."
//   bundle/bundle-2026-04-29T05-00-11-468Z.js (rotated, 559390) → sOh1=5133921, ver="KiWV+..."

"use strict";
const fs = require("fs");
const path = require("path");
const { extractSeed1 } = require("../intermediate/extract_seed1");

// ── sOh[1] / Ov via the bundle's own cipher (delegates to extract_seed1) ──

function extractSOh1(src) {
  const r = extractSeed1(src);
  if (r.error) {
    throw new Error(`extractSeed1 failed: ${r.error}`);
  }
  if (r.seed1 == null) {
    // Multiple candidates returned; pick the one not in the standard
    // exclude set. r.candidates is the de-duplicated list.
    const candidates = r.candidates.map((c) => c.value);
    throw new Error(`ambiguous seed1: ${candidates.join(", ")}`);
  }
  return r.seed1;
}

// ── bundle version (VkI / HMh) ────────────────────────────────────────────
//
// CANNOT be extracted statically — the obfuscated bundle constructs the
// 44-char base64 string at runtime via Pl VM bytecode + char-by-char
// concatenation. There is no plain literal containing "NnKzk..." in the
// raw bundle.
//
// Production workflow: fetch fresh bundle → drive ONE warm-up sensor_data
// POST (real browser or Node sandbox) → parse the header[5] of the body
// → cache (bundleHash → VkI) until next bundle rotation.

function extractBundleVersionFromSensorBody(body) {
  // body is the JSON-stringified payload sent to the POST endpoint:
  //   {"sensor_data":"3;0;1;<flags>;<sOh0>;<VkI>;<csv>;<encoded>"}
  let sd;
  try {
    sd = JSON.parse(body).sensor_data;
  } catch (e) { return null; }
  if (typeof sd !== "string") return null;
  const segs = sd.split(";");
  if (segs.length < 6) return null;
  return segs[5];
}

// ── default seed (lT / phh) ───────────────────────────────────────────────
//
// 8888888 is the canonical Akamai default. It's typically present as a
// literal once. If it ever moves, fall back to the encoded constant pool.

function extractDefaultSeed(src) {
  if (src.includes("8888888")) return 8888888;
  // Could also live inside the encoded seed list — return null and warn.
  return null;
}

// ── Pl VM bytecode (long base64 starting "vwAA") ──────────────────────────

function extractPlVmBytecode(src) {
  const re = /["'](vwAA[A-Za-z0-9+/]+={0,2})["']/g;
  const matches = [];
  let m;
  while ((m = re.exec(src)) !== null) matches.push(m[1]);
  matches.sort((a, b) => b.length - a.length);
  return matches[0] || null;
}

// ── public API ────────────────────────────────────────────────────────────

function extractBundleConsts(src) {
  return {
    sOh1: extractSOh1(src),
    bundleVersion: null, // requires runtime — see extractBundleVersionFromSensorBody
    defaultSeed: extractDefaultSeed(src),
    plVmBase64: extractPlVmBytecode(src),
  };
}

if (require.main === module) {
  const filepath = process.argv[2];
  if (!filepath) {
    console.error("Usage: node bundle_consts.js <bundle.js>");
    process.exit(1);
  }
  const src = fs.readFileSync(filepath, "utf8");
  const out = extractBundleConsts(src);
  console.log("file       :", filepath, `(${src.length} bytes)`);
  console.log("sOh1 (Ov)  :", out.sOh1);
  console.log("bundleVer  :", out.bundleVersion);
  console.log("defaultSeed:", out.defaultSeed);
  console.log("plVm bytes :", out.plVmBase64 ? out.plVmBase64.length + " (base64 chars)" : "<none>");
}

module.exports = {
  extractBundleConsts,
  extractSOh1,
  extractBundleVersionFromSensorBody,
  extractDefaultSeed,
  extractPlVmBytecode,
};
