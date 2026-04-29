// Take golden samples captured by the browser (S2) and run pure_crypto
// in REVERSE on them. Decryption succeeds iff the result is valid JSON
// (= the original fQI raw env object). That proves x9(28) and OC are byte-
// identical to the bundle's implementation.
//
// Usage:
//   1) In Chromium: copy(JSON.stringify(window.__cap, null, 2)) and save the
//      JSON to protocol-analysis/golden_samples.json.
//   2) node verify_crypto.js

"use strict";
const fs = require("fs");
const path = require("path");
const { ocInverse, shuffleColonInverse } = require("./pure_crypto");

const SAMPLES = path.join(__dirname, "golden_samples.json");
// Bundle-embedded constant `Ov`. Rotates with bundle versions.
// Extract dynamically: grep 'var Ov = .*concat\((\d+)\)' on the local bundle.
const SECRET_SOH1 = parseInt(process.env.SOH1 || "1557329", 10);

if (!fs.existsSync(SAMPLES)) {
  console.error(`missing ${SAMPLES} — paste window.__cap from browser first`);
  process.exit(1);
}

const cap = JSON.parse(fs.readFileSync(SAMPLES, "utf8"));
console.log(`loaded ${cap.length} samples`);

let pass = 0, fail = 0;
for (const [idx, e] of cap.entries()) {
  console.log(`\n--- sample ${idx + 1} (body_len=${e.body_len}) ---`);
  let json;
  try {
    json = JSON.parse(e.body);
  } catch (x) {
    console.log("  body is not JSON: skip"); fail++; continue;
  }
  const sd = json.sensor_data;
  if (typeof sd !== "string") { console.log("  no sensor_data string"); fail++; continue; }

  const segs = sd.split(";");
  if (segs.length < 8) { console.log("  too few segments"); fail++; continue; }
  const [ver, flag, ajt2, ajtBitmask, sOh0_str, ver_b64, csv, ...rest] = segs;
  const encoded = rest.join(";"); // body may itself contain ';'? unlikely but be safe
  const sOh0 = parseInt(sOh0_str, 10);
  console.log(`  header: ver=${ver}, flag=${flag}, X=${ajt2}, ajtBitmask=${ajtBitmask}`);
  console.log(`  sOh[0]=${sOh0}  csv=${csv}`);
  console.log(`  ver_b64=${ver_b64}`);
  console.log(`  encoded length=${encoded.length}`);
  console.log(`  bm_sz: ${e.bm_sz ? e.bm_sz.slice(0, 80) + '...' : '<none>'}`);
  if (e.bm_sz) {
    const lc = decodeURIComponent(e.bm_sz).split("~");
    if (lc.length >= 4) {
      const fromCookie = parseInt(lc[2], 10);
      console.log(`  bm_sz[2]=${fromCookie}, matches header sOh0? ${fromCookie === sOh0}`);
    }
  }

  // Reverse OC then shuffleColon
  let stage1, stage2;
  try {
    stage1 = ocInverse(encoded, sOh0);
  } catch (x) { console.log("  ocInverse threw:", x.message); fail++; continue; }
  try {
    stage2 = shuffleColonInverse(stage1, SECRET_SOH1);
  } catch (x) { console.log("  shuffleColonInverse threw:", x.message); fail++; continue; }

  console.log(`  after ocInverse:        ${stage1.slice(0, 80)}...`);
  console.log(`  after shuffleInverse:   ${stage2.slice(0, 80)}...`);

  let parsed;
  try {
    parsed = JSON.parse(stage2);
  } catch (x) {
    console.log("  ❌ FINAL parse failed:", x.message);
    console.log("     full payload first 300:", stage2.slice(0, 300));
    fail++;
    continue;
  }
  console.log(`  ✅ decrypted JSON: ${Object.keys(parsed).length} keys`);
  console.log(`     keys: ${Object.keys(parsed).slice(0, 12).join(", ")}, ...`);
  // Dump as fixture for S3
  const fixturePath = path.join(__dirname, "fixtures", `fQI-sample-${idx + 1}.json`);
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify({
    sOh: [sOh0, SECRET_SOH1],
    bundleVersion: ver_b64,
    ajTypeBitmask: parseInt(ajtBitmask, 10),
    csv,
    bm_sz: e.bm_sz,
    fQI: parsed,
  }, null, 2));
  console.log(`     fixture saved → ${path.relative(__dirname, fixturePath)}`);
  pass++;
}

console.log(`\n=== ${pass} pass, ${fail} fail ===`);
process.exit(fail ? 1 : 0);
