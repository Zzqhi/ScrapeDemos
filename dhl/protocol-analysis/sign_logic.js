"use strict";

const crypto = require("crypto");
const fs = require("fs");

// 当前 bundle 固定值；key0 需从本次会话 bm_sz 的第 3 段动态读取。
const BUNDLE_SEED = 7863636;
const DEFAULT_SEED = 8888888;
const BUNDLE_VERSION = "/tkt9rmftdIoAoyZGsV9vW+fnEPt4PDXWQBoi0ippAA=";

const ALPHABET = (() => {
  let value = "";
  for (let code = 0; code < 127; code++) {
    if (code >= 32 && code !== 34 && code !== 39 && code !== 92) {
      value += String.fromCharCode(code);
    }
  }
  return value;
})();

const ALPHABET_INDEX = new Int16Array(127).fill(-1);
for (let index = 0; index < ALPHABET.length; index++) {
  ALPHABET_INDEX[ALPHABET.charCodeAt(index)] = index;
}

function lcgStep(key) {
  return ((Math.imul(key, 65793) + 4282663) | 0) & 0x7fffff;
}

// deob: p6。对 92 字符字母表执行 LCG 驱动的逐字符偏移。
function substitute(data, key, decrypt = false) {
  let output = "";
  let state = key | 0;
  for (let index = 0; index < data.length; index++) {
    const char = data[index];
    const offset = (state >>> 8) & 0xffff;
    state = lcgStep(state);
    const codePoint = char.codePointAt(0);
    const alphabetIndex = codePoint < ALPHABET_INDEX.length
      ? ALPHABET_INDEX[codePoint]
      : -1;
    if (alphabetIndex < 0) {
      output += char;
      continue;
    }
    const delta = offset % ALPHABET.length;
    const nextIndex = decrypt
      ? (alphabetIndex - delta + ALPHABET.length) % ALPHABET.length
      : (alphabetIndex + delta) % ALPHABET.length;
    output += ALPHABET[nextIndex];
  }
  return output;
}

// deob: PGF_24。JSON 按冒号切段，再用同一 LCG 生成交换下标。
function shuffleColon(data, key, decrypt = false) {
  const segments = data.split(":");
  const swaps = [];
  let state = key | 0;
  for (let index = 0; index < segments.length; index++) {
    const left = ((state >>> 8) & 0xffff) % segments.length;
    state = lcgStep(state);
    const right = ((state >>> 8) & 0xffff) % segments.length;
    state = lcgStep(state);
    swaps.push([left, right]);
  }
  if (decrypt) swaps.reverse();
  for (const [left, right] of swaps) {
    [segments[left], segments[right]] = [segments[right], segments[left]];
  }
  return segments.join(":");
}

function sha256Bytes(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function parseBmSzSeed(bmSz) {
  const parts = decodeURIComponent(bmSz).split("~");
  const seed = Number.parseInt(parts[2], 10);
  return Number.isNaN(seed) ? DEFAULT_SEED : seed;
}

function buildHeader(key0, ajTypeBitmask = 0, inline = false) {
  return ["3", inline ? "1" : "0", inline ? 2 : 1, ajTypeBitmask, key0, BUNDLE_VERSION].join(";");
}

function assembleSensorData(payload, key0, options = {}) {
  const key1 = options.key1 ?? BUNDLE_SEED;
  const json = JSON.stringify(payload);
  const shuffled = shuffleColon(json, key1);
  const encrypted = substitute(shuffled, key0);
  const timing = options.timing ?? [0, 0, 0, 0, 0, 0];
  return [
    buildHeader(key0, options.ajTypeBitmask ?? 0, options.inline ?? false),
    timing.join(","),
    encrypted,
  ].join(";");
}

function decodeSensorData(requestBody, key1 = BUNDLE_SEED) {
  const sensorData = JSON.parse(requestBody).sensor_data;
  const parts = sensorData.split(";");
  if (parts.length < 8) throw new Error("Invalid sensor_data format");
  const [version, mode, type, ajTypeBitmask, key0Text, bundleVersion, timing, ...rest] = parts;
  const key0 = Number.parseInt(key0Text, 10);
  const substituted = substitute(rest.join(";"), key0, true);
  const json = shuffleColon(substituted, key1, true);
  return {
    header: { version, mode, type, ajTypeBitmask: Number(ajTypeBitmask), key0, bundleVersion, timing },
    payload: JSON.parse(json),
  };
}

if (require.main === module) {
  const requestPath = process.argv[2];
  const key1 = Number.parseInt(process.argv[3] || String(BUNDLE_SEED), 10);
  if (!requestPath) throw new Error("Usage: node sign_logic.js <request-body-file> [bundle-seed]");
  const decoded = decodeSensorData(fs.readFileSync(requestPath, "utf8"), key1);
  console.log(JSON.stringify({
    header: decoded.header,
    payloadKeyCount: Object.keys(decoded.payload).length,
    payloadKeys: Object.keys(decoded.payload),
    payload: decoded.payload,
  }, null, 2));
}

module.exports = {
  ALPHABET,
  BUNDLE_SEED,
  BUNDLE_VERSION,
  DEFAULT_SEED,
  assembleSensorData,
  buildHeader,
  decodeSensorData,
  lcgStep,
  parseBmSzSeed,
  sha256Bytes,
  shuffleColon,
  substitute,
};
