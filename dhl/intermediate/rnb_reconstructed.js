// Reconstructed from live debugging with js-reverse MCP on 2026-03-25.
// This is a readable structural restore of the live `rnb(TXb, jXb)` flow.
// It is not a drop-in executable clone of the original obfuscated script.

function buildPhaseMetrics() {
  return "0,0,0,0,4941,113,0;0,0,0,0,4931,113,0;0,0,0,0,4956,113,0;0,0,0,0,4654,113,0;0,-1,0,0,2108,2108,0;";
}

function collectStaticCounters() {
  return [0, 0, 0, 0];
}

function collectMoreCounters() {
  return [0, 0, 0, 0];
}

function collectEmptySlots() {
  return ["", "", "", "", "", ""];
}

function deriveStartTsTuple(startTs) {
  // Live run observed Yp(window.bmak.startTs) -> [63194, 94].
  // The original function mixes startTs with a random multiplier.
  return [63194, 94, startTs];
}

function collectDinString() {
  return [
    844,
    780,
    887205992445,
    5,
    0,
    12147,
    "cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:1,isc:0,vib:1,bat:1,x11:0,x12:1",
    7396,
    891,
    "Gecko",
    "20030107",
    1718,
    "0.798218641399",
    1718,
    0,
    918,
    836,
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    436589,
    0,
    0,
    0,
    "en-US",
  ].join(",");
}

function collectDinObjects() {
  // Live JSON preview showed `din` as an array of keyed objects before the
  // final internal serializer flattened it.
  return [
    { wow: 844 },
    { wih: 780 },
    { hal: 887205992445 },
    { npl: 5 },
    { tsd: 0 },
    { xag: 12147 },
    { adp: "cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:1,isc:0,vib:1,bat:1,x11:0,x12:1" },
    { ucs: "7396" },
    { ash: 891 },
    { nap: "Gecko" },
    { nps: "20030107" },
    { asw: 1718 },
    { ran: "0.798218641399" },
    { swi: 1718 },
    { pha: 0 },
    { she: 918 },
    { wiw: 836 },
    { ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36" },
    { hz1: 436589 },
    { wdr: 0 },
    { ibr: 0 },
    { dau: 0 },
    { nal: "en-US" },
  ];
}

function firstSerialize(ttb) {
  return JSON.stringify(ttb);
}

function oxTransform(ezb, keyA) {
  // Live observation:
  // - input and output lengths are the same
  // - the result is still string-like, but no longer plain JSON
  // - keyA was TXb[0] = 3158597 in the observed run
  //
  // Decompiled shape from live closure:
  //   1. Extract a substring window from the input using a fixed token.
  //   2. Walk that window in-place.
  //   3. For each position, derive two indexes from the rolling key.
  //   4. Swap the two characters.
  //   5. Advance the rolling key with multiply/mask/add/mask.
  const chars = ezb.split("");
  const start = 0;
  const end = chars.length;
  let rolling = keyA;

  for (let i = start; i < end; i += 1) {
    const left = ((rolling >>> 2) ^ i) % chars.length;
    rolling = (((rolling * 4) & 0xffffffff) + 1) & 0xffff;
    const right = ((rolling >>> 2) ^ i) % chars.length;
    rolling = (((rolling * 4) & 0xffffffff) + 1) & 0xffff;
    const tmp = chars[left];
    chars[left] = chars[right];
    chars[right] = tmp;
  }

  return chars.join("");
}

function zlTransform(ezb, keyB) {
  // Live observation:
  // - input and output lengths are the same
  // - output becomes unreadable character stream
  // - keyB was TXb[1] = 4743686 in the observed run
  //
  // Decompiled shape from live closure:
  //   1. Build a lookup table from an internal alphabet.
  //   2. For each source character, compute a rolling offset from keyB.
  //   3. Map the source char into the alphabet space.
  //   4. Shift it by the rolling offset and emit the replacement char.
  const alphabet = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
  let rolling = keyB;
  let out = "";

  for (let i = 0; i < ezb.length; i += 1) {
    const ch = ezb.charAt(i);
    const pos = alphabet.indexOf(ch);
    const offset = (rolling >>> 2) & 0xff;
    rolling = (((rolling * 4) & 0xffffffff) + 1) & 0xffff;

    if (pos >= 0) {
      out += alphabet[(pos + offset) % alphabet.length];
    } else {
      out += ch;
    }
  }

  return out;
}

function q5Envelope(ezb) {
  // Not the core encryption stage. This is the transport wrapper layer
  // used before the final POST body is assembled.
  return {
    wrapped: ezb,
  };
}

function reconstructRnb(txPair, includeExtraPhase) {
  const now = Date.now();
  const startTs = globalThis?.bmak?.startTs ?? 0;
  const elapsedSinceStart = now - startTs;

  const doEn = "do_en";
  const dmEn = "dm_en";
  const tEn = "t_en";
  const eventMask = [doEn, dmEn, tEn].join(",");

  const ffs = buildPhaseMetrics();
  const inf = ffs
    .split(";")
    .filter(Boolean)
    .slice(0, 4)
    .join(";") + ";";

  const wd = collectStaticCounters();
  const gib = collectMoreCounters();
  const h6b = collectEmptySlots();
  const startTsTuple = deriveStartTsTuple(startTs);
  const dinObjects = collectDinObjects();
  const din = collectDinString();

  const ttb = {
    ver: "eNClFWUtpFEeOwYlc7EJWHijf/2qp4yrQJd4k0WaZXk=",
    fpt: ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1",
    fpc: "4542",
    ajr: "e339abe8f7b12222a521e570cad96e58d416ec304c81e1e69802098239ce3b30d559dd6a6ea18ebc6d79a420f9e29d29ad8673ecdca8ab5242595c89222da6d6",
    din: dinObjects,
    eem: eventMask,
    ffs,
    vev: "",
    inf,
    ajt: "10,2",
    kev: "",
    dme: "0,231122,-1,-1,-1,-1,-1,-1,-1,-1,-1;",
    mev: "",
    doe: "0,231122,-1,-1,-1;",
    pur: globalThis?.location?.href ?? "",
    pev: "",
    mst: "",
    o9: "",
    tev: "",
    sde: "",
    per: "",
    dsi: "",
    wsl: "",
    hls: "",
    pde: "",
    oev: "",
    if: "",
    pus: "",
    ffl: "",
    sww: "",
    te: "",
    nte: "",
    mte: "",
    tcd: "",
    pnte: "",
    pte: "",
    pmte: "",
    tab: "",
    sws: "",
    mis: "",
    og: "",
    s017: "",
    s148: null,
    s151: null,
    s153: "",
    s003: "",
    s002: "",
    s150: "",
    s127: "",
    fwd: "",
  };

  const ezb0 = firstSerialize(ttb);
  const ezb1 = oxTransform(ezb0, txPair[0]);
  const ezb2 = zlTransform(ezb1, txPair[1]);
  const q5Wrapped = q5Envelope(ezb2);

  const fieldSources = {
    ver: "static script/version blob",
    fpt: "platform capability tuple",
    fpc: "fixed platform counter/category",
    ajr: "long-lived hex fingerprint",
    din: "flattened browser/environment profile from Jpb(D9, [nxb()])",
    eem: "enabled event names: do_en, dm_en, t_en",
    ffs: "phase metrics from Qbb()",
    inf: "subset of ffs",
    ajt: "small version/format marker, live value 10,2",
    dme: "device/mouse event aggregate bucket",
    doe: "document event aggregate bucket",
    pur: "page URL",
    pev: "pointer event bucket",
    mev: "mouse event bucket",
    vev: "visibility event bucket",
    kev: "keyboard event bucket",
    mst: "reserved/empty in current sample",
    o9: "reserved/empty in current sample",
    tev: "reserved/empty in current sample",
    sde: "reserved/empty in current sample",
    per: "reserved/empty in current sample",
    dsi: "reserved/empty in current sample",
    wsl: "reserved/empty in current sample",
    hls: "reserved/empty in current sample",
    pde: "reserved/empty in current sample",
    oev: "reserved/empty in current sample",
    if: "reserved/empty in current sample",
    pus: "reserved/empty in current sample",
    ffl: "reserved/empty in current sample",
    sww: "reserved/empty in current sample",
    te: "reserved/empty in current sample",
    nte: "reserved/empty in current sample",
    mte: "reserved/empty in current sample",
    tcd: "reserved/empty in current sample",
    pnte: "reserved/empty in current sample",
    pte: "reserved/empty in current sample",
    pmte: "reserved/empty in current sample",
    tab: "reserved/empty in current sample",
    sws: "reserved/empty in current sample",
    mis: "reserved/empty in current sample",
    og: "reserved/empty in current sample",
    s017: "reserved/empty in current sample",
    s148: "null in current sample",
    s151: "null in current sample",
    s153: "reserved/empty in current sample",
    s003: "reserved/empty in current sample",
    s002: "reserved/empty in current sample",
    s150: "reserved/empty in current sample",
    s127: "reserved/empty in current sample",
    fwd: "reserved/empty in current sample",
  };

  return {
    includeExtraPhase,
    timing: {
      now,
      startTs,
      elapsedSinceStart,
      startTsTuple,
    },
    phaseFlags: {
      doEn,
      dmEn,
      tEn,
      eventMask,
    },
    helpers: {
      wd,
      gib,
      h6b,
      ffs,
      dinObjects,
      din,
    },
    fieldSources,
    ttb,
    ezb0,
    ezb1,
    ezb2,
    q5Wrapped,
  };
}

module.exports = {
  reconstructRnb,
  buildPhaseMetrics,
  collectStaticCounters,
  collectMoreCounters,
  collectEmptySlots,
  deriveStartTsTuple,
  collectDinObjects,
  collectDinString,
  firstSerialize,
  oxTransform,
  zlTransform,
  q5Envelope,
};
