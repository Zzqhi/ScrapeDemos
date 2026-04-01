// Runtime notes for the live bundle counterpart of:
//   test.js -> qSH() -> xag / HxH(F0, [])
//
// Source of truth:
//   browser runtime debugging via js-reverse on 2026-03-26
//
// Original reconstruction file intentionally left untouched:
//   dhl/intermediate/screen_node.js
//
// Live bundle mapping:
//   Epf === KWD
//   Epf(FA, []) === KWD(20, [])
//   FA === 20
//   Ejf() builds the browser fingerprint array and includes:
//     Wr(Lv, ["xag", Epf(FA, [])])

// ═══════════════════════════════════════════════════════════════════════
// §1  Utilities
// ═══════════════════════════════════════════════════════════════════════

function xq(str) {
    if (str == null) return -1;

    var sum = 0;
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) sum += code;
    }

    return sum;
}

function sha256Hex(input) {
    try {
        return require("crypto").createHash("sha256").update(String(input)).digest("hex");
    } catch (e) {
        throw new Error("sha256Hex requires Node.js crypto in this reconstruction file");
    }
}

function shuffleFingerprint(arr, seed) {
    if (typeof shuffle === "function") {
        return shuffle(arr, seed);
    }

    return arr;
}

// ═══════════════════════════════════════════════════════════════════════
// §2  Encryption / Permutation  (AhN + czG)
// ═══════════════════════════════════════════════════════════════════════

// AhN character permutation — runtime-verified 2026-03-26
//
// Dispatcher case 29 (Dg) in the live bundle.
// NOT a character-level shuffle: splits the JSON string on ":" into tokens,
// then applies Fisher-Yates shuffle on the token array, then joins with ":".
//
// LCG constants are identical to czG (vrH):
//   multiply: 65793, AND_full: 0xFFFFFFFF, add: 4282663, AND_final: 0x7FFFFF
//   shift: 8, mask: 0xFFFF
//
// Key source: seeds[1] — bundle-embedded constant (e.g. 4257762, 8735511, 9882545),
//   retrieved via AI[encodedKey]() → closure var.
//   Changes per bundle version, NOT per session.
//
// AI object key encoding (digit substitution cipher):
//   N=0, U=1, X=2, D=3, 5=4, 7=5, G=6, Z=7, f=8, g=9
//   Prefix varies per load (e.g. "cG", "Hk"), trailing "xNNNNNN" is padding.
//   Example: "cGgffX757" → 9882545, "HkAhJ$$II" → 8735511
//   seeds[1] can be extracted by finding the AI key whose decoded value
//   is not a well-known constant (65793, 4282663, 8388607, etc.).
//
// Verified: iteration 0 with key=4257762, len=216 → idx1=215, idx2=59 ✓
//           iteration 1 → idx1=37, idx2=198, key_after=1494654 ✓
function ahnPermute(jsonStr, seed) {
    var SEPARATOR = ":";
    var parts = jsonStr.split(SEPARATOR);
    var key = seed;
    var len = parts.length;

    for (var i = 0; i < len; i++) {
        var idx1 = ((key >> 8) & 65535) % len;
        key = (key * 65793) & 0xFFFFFFFF;
        key = (key + 4282663) & 8388607;

        var idx2 = ((key >> 8) & 65535) % len;
        key = (key * 65793) & 0xFFFFFFFF;
        key = (key + 4282663) & 8388607;

        var tmp = parts[idx1];
        parts[idx1] = parts[idx2];
        parts[idx2] = tmp;
    }

    return parts.join(SEPARATOR);
}

// Inverse of ahnPermute — replay swaps in reverse order to restore original JSON.
function ahnUnpermute(permuted, seed) {
    var SEPARATOR = ":";
    var parts = permuted.split(SEPARATOR);
    var key = seed;
    var len = parts.length;

    // Pre-compute all (idx1, idx2) pairs
    var swaps = [];
    for (var i = 0; i < len; i++) {
        var idx1 = ((key >> 8) & 65535) % len;
        key = (key * 65793) & 0xFFFFFFFF;
        key = (key + 4282663) & 8388607;

        var idx2 = ((key >> 8) & 65535) % len;
        key = (key * 65793) & 0xFFFFFFFF;
        key = (key + 4282663) & 8388607;

        swaps.push([idx1, idx2]);
    }

    // Apply swaps in reverse
    for (var j = swaps.length - 1; j >= 0; j--) {
        var tmp = parts[swaps[j][0]];
        parts[swaps[j][0]] = parts[swaps[j][1]];
        parts[swaps[j][1]] = tmp;
    }

    return parts.join(SEPARATOR);
}

function czG_live(input, seed) {
    var charset = " !#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";
    var lookup = [];
    var output = "";

    for (var i = 0; i < 127; i++) {
        if (i === 32 || i === 34 || i === 39 || i === 92) {
            lookup[i] = -1;
        } else {
            lookup[i] = charset.indexOf(String.fromCharCode(i));
        }
    }

    for (var j = 0; j < input.length; j++) {
        var ch = input.charAt(j);
        var shift = ((seed >> 8) & 65535) % charset.length;

        seed = (seed * 65793) & 0xffffffff;
        seed = (seed + 4282663) & 8388607;

        var mappedIndex = lookup[input.charCodeAt(j)];
        if (mappedIndex >= 0) {
            ch = charset[(mappedIndex + shift) % charset.length];
        }

        output += ch;
    }

    return output;
}

// ═══════════════════════════════════════════════════════════════════════
// §3  Seed Extraction  (bm_sz cookie + bundle constant)
// ═══════════════════════════════════════════════════════════════════════

// seeds[1] is a per-bundle constant embedded in the AI object.
// Use extract_seed1.js (AST-based) to extract it from a fresh bundle.
// Current live bundle validation on 2026-03-31:
//   node extract_seed1.js current_live_bundle_20260331c.js -> 2102249
//   runtime Jd9() -> [3425335, 2102249]
function H4G_live() {
    var defaultSeed1 = 8888888;
    var seed2 = 2102249;  // ← extract via: node extract_seed1.js <bundle.js>

    try {
        var cookies = String(document.cookie || "").split("; ");
        var raw = null;

        for (var i = 0; i < cookies.length; i++) {
            var entry = cookies[i];

            if (entry.indexOf("bm_sz_") === 0) {
                raw = entry.slice(entry.indexOf("=") + 1);
            } else if (raw == null && entry.indexOf("bm_sz=") === 0) {
                raw = entry.slice("bm_sz=".length);
            }
        }

        if (!raw) {
            return [defaultSeed1, seed2];
        }

        var parts = String(raw).split("~");
        var seed1 = parseInt(parts[2], 10);

        return [Number.isNaN(seed1) ? defaultSeed1 : seed1, seed2];
    } catch (e) {
        return [defaultSeed1, seed2];
    }
}

// ═══════════════════════════════════════════════════════════════════════
// §4  Browser Feature / Bot Detection Probes
// ═══════════════════════════════════════════════════════════════════════

function BX4_S9_live() {
    var checks = [
        /* 0  */ { obj: window,   prop: "addEventListener" },
        /* 1  */ { obj: window,   prop: "XMLHttpRequest" },
        /* 2  */ { obj: window,   prop: "XDomainRequest" },
        /* 3  */ { obj: window,   prop: "emit" },
        /* 4  */ { obj: window,   prop: "DeviceOrientationEvent" },
        /* 5  */ { obj: window,   prop: "DeviceMotionEvent" },
        /* 6  */ { obj: window,   prop: "TouchEvent" },
        /* 7  */ { obj: window,   prop: "spawn" },
        /* 8  */ { obj: window,   prop: "innerWidth" },
        /* 9  */ { obj: window,   prop: "outerWidth" },
        /* 10 */ { obj: window,   prop: "chrome" },
        /* 11 */ { getter: function () { return Function.prototype.bind; } },
        /* 12 */ { obj: window,   prop: "Buffer" },
        /* 13 */ { obj: window,   prop: "PointerEvent" }
    ];

    var result = 0;

    for (var i = 0; i < checks.length; i++) {
        var value;

        try {
            value = checks[i].getter ? checks[i].getter() : checks[i].obj[checks[i].prop];
        } catch (e) {
            value = undefined;
        }

        result += (value ? 1 : 0) << i;
    }

    return result;
}

function getPhaLive() {
    try {
        return window._phantom ? 1 : 0;
    } catch (e) {
        return 0;
    }
}

function getWdrLive() {
    try {
        return window.webdriver ? 1 : 0;
    } catch (e) {
        return 0;
    }
}

function getDauLive() {
    try {
        return window.domAutomation ? 1 : 0;
    } catch (e) {
        return 0;
    }
}

function getTsdLive() {
    // tsd is emitted as ["tsd", VRf].
    //
    // For the current live bundle snapshot:
    //   1. VRf is declared as `var VRf = 0;`
    //   2. the only other reference is the URf/Ejf output entry ["tsd", VRf]
    //
    // No other explicit write/reference to VRf was found in the bundle source,
    // and runtime inspection of the paused Ejf frame also shows tsd === 0.
    //
    // So for this bundle/path, tsd behaves as a fixed 0 rather than a separate
    // feature probe.
    return 0;
}

function getAdpLive() {
    return [
        "cpen:" + (typeof window.callPhantom !== "undefined" ? 1 : 0),
        "i1:"   + (typeof window._phantom !== "undefined" ? 1 : 0),
        "dm:"   + ((typeof window.__nightmare !== "undefined" || typeof window.domAutomation !== "undefined") ? 1 : 0),
        "cwen:" + (typeof window.spawn !== "undefined" ? 1 : 0),
        "non:"  + (typeof Notification !== "undefined" ? 1 : 0),
        "opc:"  + (typeof window.opera !== "undefined" ? 1 : 0),
        "fc:"   + (typeof window.Buffer !== "undefined" ? 1 : 0),
        "sc:"   + (typeof window.emit !== "undefined" ? 1 : 0),
        "wrc:"  + (typeof window.RTCPeerConnection === "function" ? 1 : 0),
        "isc:"  + 0,
        "vib:"  + (typeof navigator.vibrate === "function" ? 1 : 0),
        "bat:"  + (typeof navigator.getBattery === "function" ? 1 : 0),
        "x11:"  + (window.innerWidth === 0 && window.innerHeight === 0 ? 1 : 0),
        "x12:"  + (typeof window.chrome !== "undefined" ? 1 : 0)
    ].join(",");
}

function getIbrLive() {
    // Live evidence does not support "is-bot-robot".
    //
    // The actual assignment target is QGf, and QGf is written by GGf():
    //   if (navigator.brave) {
    //       navigator.brave[...method...]()
    //           .then(function (x) { QGf = x ? 1 : 0; })
    //           .catch(function () { QGf = -1; });
    //   }
    //
    // So ibr is much more likely "is Brave" than a bot/headless flag.
    // On the current non-Brave runtime path:
    //   navigator.brave === undefined
    //   QGf stays at its initial value 0
    //
    // Method name on navigator.brave is still not cleanly decoded here, but the
    // object and then/catch assignment chain are runtime-confirmed.
    return 0;
}

// ═══════════════════════════════════════════════════════════════════════
// §5  Browser Fingerprint Assembly  (din field)
// ═══════════════════════════════════════════════════════════════════════

function getBrowserFingerprint() {
    var startTs = window.bmak && window.bmak.startTs ? window.bmak.startTs : Date.now();

    var ua = navigator.userAgent;
    var nps = navigator.productSub;
    var nal = navigator.language;
    var nap = navigator.product;
    var npl = navigator.plugins ? navigator.plugins.length : 0;
    var asw = screen.availWidth;
    var ash = screen.availHeight;
    var swi = screen.width;
    var she = screen.height;
    var wiw = window.innerWidth;
    var wih = window.innerHeight;
    var wow = window.outerWidth;

    var hal = Math.floor(startTs / 2);
    var hz1 = parseInt(startTs / (2016 * 2016), 10);
    var ucs = String(xq(ua));
    var ran = String(Math.random()).substring(0, 14);

    var xag = BX4_S9_live();
    var adp = getAdpLive();
    var ibr = getIbrLive();
    var pha = getPhaLive();
    var wdr = getWdrLive();
    var dau = getDauLive();
    var tsd = getTsdLive();

    // Runtime-observed order after UY(URf, bQf) on the live bundle:
    // ["ash","hal","xag","asw","nps","nap","she","dau","wdr","tsd","wow",
    //  "ibr","ua","wiw","ucs","nal","adp","wih","ran","hz1","npl","swi","pha"]
    // Runtime-verified order on 2026-03-30 live bundle (HpK function):
    return [
        { ua: ua },
        { xag: xag },
        { nps: nps },
        { nal: nal },
        { nap: nap },
        { npl: npl },
        { pha: pha },
        { wdr: wdr },
        { dau: dau },
        { hz1: hz1 },
        { tsd: tsd },
        { asw: asw },
        { ash: ash },
        { swi: swi },
        { she: she },
        { wiw: wiw },
        { wih: wih },
        { wow: wow },
        { adp: adp },
        { ucs: ucs },
        { ran: ran },
        { hal: hal },
        { ibr: ibr }
    ];
}

// Runtime-verified values on the paused DHL page:
//   bit0  addEventListener         => 1
//   bit1  XMLHttpRequest          => 1
//   bit2  XDomainRequest          => 0
//   bit3  emit                    => 0
//   bit4  DeviceOrientationEvent  => 1
//   bit5  DeviceMotionEvent       => 1
//   bit6  TouchEvent              => 1
//   bit7  spawn                   => 0
//   bit8  innerWidth              => 1
//   bit9  outerWidth              => 1
//   bit10 chrome                  => 1
//   bit11 Function.prototype.bind => 1
//   bit12 Buffer                  => 0
//   bit13 PointerEvent            => 1
//
// Therefore:
//   BX4_S9_live() === 12147
//   set bits = [0, 1, 4, 5, 6, 8, 9, 10, 11, 13]

// Additional Ejf()/qSH() field mapping verified in the same paused runtime:
//
//   pha -> window._phantom ? 1 : 0
//     current runtime value: 0
//     meaning: PhantomJS marker
//
//   wdr -> window.webdriver ? 1 : 0
//     current runtime value: 0
//     note: this checks window.webdriver, not navigator.webdriver
//
//   dau -> window.domAutomation ? 1 : 0
//     current runtime value: 0
//     meaning: DOM automation marker
//
//   tsd -> VRf
//     current runtime value: 0
//     in this live bundle, VRf appears only twice:
//       1. var VRf = 0;
//       2. URf entry ["tsd", VRf]
//     runtime and static inspection agree that tsd behaves like a fixed 0 on
//     this bundle/path rather than a separately computed touch capability probe.

// ═══════════════════════════════════════════════════════════════════════
// §6  Form Fingerprint  (ffs / fpc fields)
// ═══════════════════════════════════════════════════════════════════════

function getFfsTypeCodeLive(type) {
    var textLike = ["text", "search", "url", "email", "tel", "number"];
    var normalized = String(type).toLowerCase();

    if (textLike.indexOf(normalized) !== -1) return 0;
    if (normalized === "password") return 1;
    return 2;
}

function getFfsAutocompleteCodeLive(autocomplete) {
    if (autocomplete == null) return -1;

    var normalized = String(autocomplete).toLowerCase();
    if (normalized === "off") return 0;
    if (normalized === "on") return 1;
    return 2;
}

function shouldIncludeFfsInputLive(input) {
    return input && input.id !== "c-tracking--input";
}

function normalizeFfsInputLive(input) {
    if (!input) return null;

    var typeCode = input.type == null ? -1 : getFfsTypeCodeLive(input.type);
    if (typeCode === -1) return null;

    var autocompleteCode = getFfsAutocompleteCodeLive(input.autocomplete);
    var value = input.value == null ? "" : String(input.value);
    var defaultValue = input.defaultValue == null ? "" : String(input.defaultValue);
    var hasValue = value.length !== 0 ? 1 : 0;
    var hasDefaultDelta = defaultValue.length !== 0 && (hasValue === 1 || defaultValue !== value) ? 1 : 0;

    // qbb_node.js has the right tuple structure, but browser validation shows
    // the 4th field tracks the boolean required state rather than `!= null`.
    var requiredFlag = input.required ? 1 : 0;

    return [
        typeCode,
        autocompleteCode,
        hasDefaultDelta,
        requiredFlag,
        xq(input.id),
        xq(input.name),
        hasValue
    ].join(",") + ";";
}

function buildFfsLive(inputs) {
    var source = inputs;

    if (!source) {
        if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") {
            return "";
        }
        source = document.querySelectorAll("input");
    }

    var result = "";
    for (var i = 0; i < source.length; i++) {
        var input = source[i];
        if (!shouldIncludeFfsInputLive(input)) continue;

        var tuple = normalizeFfsInputLive(input);
        if (tuple != null) result += tuple;
    }

    return result;
}

function buildFpcLive(fpValStr) {
    return String(xq(fpValStr));
}

// ═══════════════════════════════════════════════════════════════════════
// §7  MST (Main State Telemetry)
// ═══════════════════════════════════════════════════════════════════════

function buildMstEventStateLive(options) {
    var opts = options || {};

    var devl = opts.devl == null ? 0 : opts.devl;
    var dmvl = opts.dmvl == null ? 0 : opts.dmvl;
    var pevl = opts.pevl == null ? 0 : opts.pevl;
    var delt = opts.delt == null ? null : opts.delt;
    var it = opts.it == null ? 0 : opts.it;

    // Runtime-confirmed relationships:
    //   devl -> document-event aggregate primary count
    //   dmvl -> device/mouse-event aggregate primary count
    //   tovl -> devl + dmvl
    //   delt -> Date.now() - bmak.startTs
    //   it   -> NhH (current path usually 0, semantics still pending)
    return {
        devl: devl,
        dmvl: dmvl,
        pevl: pevl,
        tovl: opts.tovl == null ? devl + dmvl : opts.tovl,
        delt: delt,
        it: it
    };
}

function computeMstDd2Live(startTs) {
    if (startTs == null) return null;
    return parseInt(parseInt(startTs / (2016 * 2016), 10) / 23, 10);
}

function computeMstWw8Live(dd2, options) {
    var opts = options || {};

    // Older runtime notes suggested ww8 might derive from dd2 / 6.
    // Current live payload captures on 2026-03-30 consistently emit ww8 = 0
    // on the no-interaction DHL tracking path, even when dd2 is non-zero.
    //
    // Keep the legacy derivation behind an explicit opt-in so we do not
    // overwrite live evidence with an outdated assumption.
    if (opts.useLegacyFormula) {
        if (dd2 == null) return 0;
        return parseInt(dd2 / 6, 10);
    }

    return 0;
}

function computeMstDvcLive(options) {
    var opts = options || {};
    var hash = opts.hash;
    var delta = opts.delta;
    var plugins = opts.plugins;

    if (hash == null && opts.parts) hash = opts.parts[0];
    if (delta == null && opts.parts) delta = opts.parts[1];
    if (plugins == null && opts.parts) plugins = opts.parts[2];

    if (hash == null && delta == null && plugins == null) {
        return "";
    }

    return [
        hash == null ? "" : String(hash),
        delta == null ? "" : String(delta),
        plugins == null ? "" : String(plugins)
    ].join(",");
}

function buildMstLive(options) {
    var opts = options || {};
    var fpState = opts.fpState || {};
    var mstEventState = buildMstEventStateLive(opts.mstEventState);
    var startTs = opts.startTimestamp == null ? null : opts.startTimestamp;
    var dd2 = computeMstDd2Live(startTs);
    var dvc = opts.dvc;

    // Auto-generate jsrf1/jsrf2 from startTs when not explicitly provided.
    // genJsrfLive(startTs) → [jsrf1, jsrf2] using the tml algorithm.
    var jsrfPair = (opts.jsrf1 == null && opts.jsrf2 == null && startTs != null)
        ? genJsrfLive(startTs)
        : [null, null];

    if (dvc == null) {
        dvc = computeMstDvcLive({
            hash: opts.dvcHash,
            delta: opts.dvcDelta,
            plugins: opts.dvcPlugins,
            parts: opts.dvcParts
        });
    }

    return opts.mst || [
        { kevl: (opts.kevl || 0) | 1 },
        { mevl: (opts.mevl || 0) | 32 },
        { tevl: (opts.tevl || 0) | 32 },
        { devl: mstEventState.devl },
        { dmvl: mstEventState.dmvl },
        { pevl: mstEventState.pevl },
        { tovl: mstEventState.tovl },
        { delt: mstEventState.delt },
        { it: mstEventState.it },
        { sts: startTs },
        { fct: opts.fct == null ? (fpState.td == null ? null : fpState.td) : opts.fct },
        { dd2: dd2 },
        { kc: opts.kc == null ? 0 : opts.kc },
        { mc: opts.mc == null ? 0 : opts.mc },
        { ww8: opts.ww8 == null ? computeMstWw8Live(dd2, opts) : opts.ww8 },
        { pc: opts.pc == null ? 0 : opts.pc },
        { tc: opts.tc == null ? 0 : opts.tc },
        // Live captures show ssts is not simply delt + 1 on the current bundle.
        // Leave it caller-controlled when available; otherwise keep the older
        // fallback for backwards comparison.
        { ssts: opts.ssts == null ? (mstEventState.delt == null ? null : mstEventState.delt + 1) : opts.ssts },
        { tst: opts.tst == null ? mstEventState.tovl : opts.tst },
        { rval: fpState.rVal || "-1" },
        { rcfp: fpState.rCFP || "-1" },
        { nfas: opts.nfas == null ? 30261689 : opts.nfas },
        { jsrf: opts.jsrf == null ? "PiZtE" : opts.jsrf },
        { jsrf1: opts.jsrf1 == null ? jsrfPair[0] : opts.jsrf1 },
        { jsrf2: opts.jsrf2 == null ? jsrfPair[1] : opts.jsrf2 },
        { signals: opts.signals == null ? "0" : String(opts.signals) },
        { mwd: opts.mwd == null ? "0" : String(opts.mwd) },
        { hea: opts.hea == null ? "" : String(opts.hea) },
        { dvc: dvc },
        { srd: opts.srd == null ? "0" : String(opts.srd) },
        { tid: opts.tid == null ? "" : String(opts.tid) }
    ];
}

// jsrf1/jsrf2 generation — runtime-verified 2026-04-01 (g-bundle: tml function)
//
// g-bundle variable mapping: tml → genJsrfLive, X9l → euclidean3d
//   UAl = tml(bmak.startTs)  →  [jsrf1, jsrf2]
//
// Algorithm:
//   1. jsrf1 = floor(random()*100000 + 10000)   — 5-6 digit random int
//   2. hWl   = String(startTs * jsrf1)           — large number string
//   3. Slice 6 two-digit numbers from hWl:
//      - if hWl.length >= 18: step by 3 chars (skip every 3rd char)
//      - else: step by 2 chars (contiguous pairs)
//   4. jsrf2 = floor(sqrt((p0-p1)^2 + (p2-p3)^2 + (p4-p5)^2))
//      — 3D Euclidean distance of three pair-differences
function genJsrfLive(startTs) {
    var jsrf1 = Math.floor(Math.random() * 100000 + 10000);
    var hWl = String(Number(startTs) * jsrf1);

    var idx = 0;
    var parts = [];
    var step3 = hWl.length >= 18;

    while (parts.length < 6) {
        parts.push(parseInt(hWl.slice(idx, idx + 2), 10));
        idx += step3 ? 3 : 2;
    }

    var d1 = parts[0] - parts[1];
    var d2 = parts[2] - parts[3];
    var d3 = parts[4] - parts[5];
    var jsrf2 = Math.floor(Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3));

    return [jsrf1, jsrf2];
}

function buildMstObjectMapLive(mst) {
    var arr = mst || [];
    var out = {};

    for (var i = 0; i < arr.length; i++) {
        var item = arr[i];
        if (!item || typeof item !== "object") continue;

        var keys = Object.keys(item);
        if (keys.length !== 1) continue;

        out[keys[0]] = item[keys[0]];
    }

    return out;
}

// ═══════════════════════════════════════════════════════════════════════
// §8  Misc Payload Field Builders  (ajr, ajt, ffl, hls, ver, per, dsi, wsl, sww)
// ═══════════════════════════════════════════════════════════════════════

function buildAjrLive(userAgent, startTimestamp) {
    // Runtime-verified via Proxy on P9G()(payload):
    // the live code accesses payload.startTimestamp.
    //
    // On the current bundle/path, that field is presently undefined, so the
    // second half is sha256("undefined"). Earlier bundle versions passed an
    // actual timestamp here.
    return sha256Hex(userAgent) + sha256Hex(String(startTimestamp));
}

function buildAjtLive(options) {
    var opts = options || {};
    var lpw = opts.ajtState;
    var counter = opts.ajtCount;

    if (lpw == null && opts.LPW != null) lpw = opts.LPW;
    if (counter == null && opts.v3W != null) counter = opts.v3W;

    // Static trace in live.js:
    //   cKW = LPW + "," + v3W
    // LPW is a small state code written by multiple interaction branches,
    // while v3W is incremented as those branches pass through UAW()/fcW().
    // Current no-interaction live captures on 2026-03-31 show "0,0".
    return [
        lpw == null ? 0 : lpw,
        counter == null ? 0 : counter
    ].join(",");
}

function getAkamaiScriptUrlLive() {
    if (typeof document === "undefined") return "";

    var scripts = document.scripts || [];
    for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i] && scripts[i].src;
        if (!src) continue;
        if (src.indexOf("/lUuI09H8") === -1) continue;
        if (src.indexOf("/nwEPFIB") === -1) continue;
        return src;
    }

    return "";
}

function buildFflLive(options) {
    var opts = options || {};
    var src = opts.akamaiScriptUrl || getAkamaiScriptUrlLive();
    if (!src) return "";

    try {
        var url = new URL(src, typeof location !== "undefined" ? location.href : "https://www.dhl.com");
        var parts = url.pathname.split("/").filter(Boolean);

        // Runtime evidence on 2026-03-31:
        //   script URL = /lUuI09H8kk2lCTn_ihnlZXLM/J3aE8rSc6GQSLfJO/ZHE1PQ/dlZdB/nwEPFIB
        //   captured ffl = "J3aE8rSc6GQSLfJO"
        // Therefore current bundle/path maps ffl to pathname segment[1].
        return parts[1] || "";
    } catch (e) {
        return "";
    }
}

function buildHlsLive(options) {
    var opts = options || {};
    if (Object.prototype.hasOwnProperty.call(opts, "hls")) {
        return opts.hls;
    }

    // Runtime evidence on 2026-03-31 (current DHL no-interaction path) showed
    // hls may stay undefined until serialization time, but keep the older
    // static fallback here so the reconstruction emits a stable value unless
    // the caller provides a bundle-specific override.
    return "-1,,,1,";
}

function buildVerLive(options) {
    var opts = options || {};
    if (opts.ver) return opts.ver;

    // `ver` rotates with the live bundle even when the script path stays the same.
    // Static traces on 2026-03-31 confirmed it is a bundle-initialized decoded
    // constant, not a request-time hash, so keeping an old hardcoded value here is
    // actively misleading. Callers should inject a fresh value, e.g. from a helper
    // such as `extract_ver.js`, before constructing the payload.
    return "";
}

// ─── per: Permissions API probe (20 permission names) ───
// Runtime-verified 2026-03-30: "99999944949322244999"
// Each digit = permission state: 9=not_supported/error, 4=denied, 3=prompt, 2=granted
// Queries 20 permissions in fixed order; result is browser+profile dependent.
// For Node.js (no Permissions API), return a plausible desktop Chrome default.
function buildPerLive() {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
        return "99999944949322244999";
    }
    // In browser context, would query each permission asynchronously.
    // The 20 permissions (in order, TBD exact list):
    // geolocation, notifications, push, midi, camera, microphone, ...
    // For now return observed desktop Chrome default.
    return "99999944949322244999";
}

// ─── dsi: DOM/Script Integrity checks (12 fields) ───
// Runtime-verified 2026-03-30
//   get:  getter override detection (empty = none detected)
//   set:  setter override detection ("0" = count)
//   ico:  sha256hex of some DOM/script integrity input (64-char hex)
//   ift:  iframe/frame type count (observed "3" on DHL page)
//   xof:  cross-origin frame stats (5 comma-separated numbers)
//   xot:  same as xof (captured twice, anti-spoofing)
//   wev:  window.eval detection ("NA;wev;NA" = normal)
//   wre:  window.RegExp detection ("NA;wre;NA" = normal)
//   wdr:  navigator.webdriver as string ("0" = false)
//   iks:  injected keys detection (empty = none)
//   lds:  document.readyState flag ("1" = complete)
//   sst:  sessionStorage test (empty = normal)
function buildDsiLive() {
    var wdr = "0";
    if (typeof navigator !== 'undefined' && navigator.webdriver) {
        wdr = "1";
    }
    return [
        { get: "" },
        { set: "0" },
        { ico: "" },    // sha256hex — requires tracing ico input source
        { ift: "3" },   // page-dependent: iframe/frame count metric
        { xof: "2,5,1,1,8" }, // page-dependent: cross-origin frame info
        { xot: "2,5,1,1,8" }, // same as xof (consistency check)
        { wev: "NA;wev;NA" },
        { wre: "NA;wre;NA" },
        { wdr: wdr },
        { iks: "" },
        { lds: "1" },
        { sst: "" }
    ];
}

// ─── wsl: performance.memory + page metrics (20-field CSV) ───
// Runtime-verified 2026-03-30
//   [0]  = performance.memory.jsHeapSizeLimit     (Chrome-only, e.g. 3760000000)
//   [1]  = performance.memory.totalJSHeapSize      (e.g. 35100000, snapshot at capture time)
//   [2]  = performance.memory.usedJSHeapSize       (e.g. 20500000, snapshot at capture time)
//   [3]  = -1 (AudioContext sampleRate or unavailable marker)
//   [4]  = document.querySelectorAll('meta').length (e.g. 19)
//   [5-9]  = capability flags (1,1,1,0,1)
//   [10-17] = empty (WebGL params when available)
//   [18-19] = flags (1,1)
function buildWslLive() {
    var mem = (typeof performance !== 'undefined' && performance.memory) || {};
    var heapLimit = mem.jsHeapSizeLimit || 0;
    var totalHeap = mem.totalJSHeapSize || 0;
    var usedHeap = mem.usedJSHeapSize || 0;
    var metaCount = 0;
    if (typeof document !== 'undefined') {
        metaCount = document.querySelectorAll('meta').length;
    }
    var fields = [
        heapLimit, totalHeap, usedHeap,
        -1, metaCount,
        1, 1, 1, 0, 1,
        '', '', '', '', '', '', '', '',
        1, 1
    ];
    return fields.join(',');
}

// ─── sww: Client Hints double-sample (anti-spoofing) ───
// Runtime-verified 2026-03-30
// Each navigator/UA-CH API is sampled twice (odd=first, even=second).
// If values differ between samples, Akamai flags as tampered.
//   s024: timing flag (0)
//   swrt: script runtime metric (small int, e.g. 7)
//   wrt:  window runtime metric (small int, e.g. 20)
//   s025/s026: new Date().toString()
//   s029/s030: Intl.DateTimeFormat().resolvedOptions().timeZone
//   s031/s032: navigator.language
//   s033/s034: Array.from(navigator.languages)
//   s035/s036: -(new Date().getTimezoneOffset() / 60)
//   s037/s038: navigator.hardwareConcurrency
//   s039/s040: [connection.effectiveType, connection.downlink, connection.rtt]
//   s041/s042: navigator.userAgent
//   s043/s044: navigator.appVersion
//   s045/s046: navigator.platform
//   s047/s048: navigator.userAgentData.brands
//   s049/s050: navigator.userAgentData.mobile
//   s051/s052: architecture (from getHighEntropyValues)
//   s053/s054: bitness
//   s055/s056: model (empty on desktop)
//   s057/s058: navigator.userAgentData.platform
//   s059/s060: platformVersion (empty if not available)
//   s061/s062: fullVersion from getHighEntropyValues
//   s063/s064: mobile (from high entropy)
//   s065/s066: fullVersionList brands
//   s067-s074: null (wow64, formFactor, etc. — not available in current Chrome)
function buildSwwLive(opts) {
    var o = opts || {};
    var ua = o.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : '');
    var appVersion = o.appVersion || (typeof navigator !== 'undefined' ? navigator.appVersion : '');
    var platform = o.platform || (typeof navigator !== 'undefined' ? navigator.platform : '');
    var language = o.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
    var languages = o.languages || (typeof navigator !== 'undefined' ? Array.from(navigator.languages) : ['en-US']);
    var hardwareConcurrency = o.hardwareConcurrency || (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 2);
    var timezone = o.timezone || 'Asia/Shanghai';
    var tzOffsetHours = o.tzOffsetHours != null ? o.tzOffsetHours : 8;
    var dateString = o.dateString || new Date().toString();

    // UA-CH (Client Hints) — only available in Chromium
    var uaData = o.uaData || (typeof navigator !== 'undefined' && navigator.userAgentData ? navigator.userAgentData : null);
    var brands = uaData ? uaData.brands.map(function(b) { return { brand: b.brand, version: b.version }; }) : [];
    var mobile = uaData ? uaData.mobile : false;
    var uaPlatform = uaData ? uaData.platform : '';

    // High entropy values (must be pre-resolved via getHighEntropyValues)
    var he = o.highEntropy || {};
    var architecture = he.architecture || '';
    var bitness = he.bitness || '';
    var model = he.model || '';
    var platformVersion = he.platformVersion || '';
    var fullVersion = he.uaFullVersion || '';
    var fullVersionList = he.fullVersionList || [];

    // Connection info
    var conn = o.connection || (typeof navigator !== 'undefined' && navigator.connection ? navigator.connection : null);
    var connInfo = conn ? [conn.effectiveType || '4g', conn.downlink || 0, String(conn.rtt || 'null')] : ['4g', 0, 'null'];

    return {
        s024: 0, swrt: o.swrt || 7, wrt: o.wrt || 20,
        s025: dateString, s026: dateString,
        s027: null, s028: null,
        s029: timezone, s030: timezone,
        s031: language, s032: language,
        s033: languages, s034: languages,
        s035: tzOffsetHours, s036: tzOffsetHours,
        s037: hardwareConcurrency, s038: hardwareConcurrency,
        s039: connInfo, s040: connInfo,
        s041: ua, s042: ua,
        s043: appVersion, s044: appVersion,
        s045: platform, s046: platform,
        s047: brands, s048: brands,
        s049: mobile, s050: mobile,
        s051: architecture, s052: architecture,
        s053: bitness, s054: bitness,
        s055: model, s056: model,
        s057: uaPlatform, s058: uaPlatform,
        s059: platformVersion, s060: platformVersion,
        s061: fullVersion, s062: fullVersion,
        s063: mobile, s064: mobile,
        s065: fullVersionList, s066: fullVersionList,
        s067: null, s068: null, s069: null, s070: null,
        s071: null, s072: null, s073: null, s074: null,
    };
}

// ═══════════════════════════════════════════════════════════════════════
// §9  9013 Payload Assembly
// ═══════════════════════════════════════════════════════════════════════

function build9013PayloadLive(options) {
    var opts = options || {};
    var locationHref = typeof location !== "undefined" ? location.href : "";
    var fpState = opts.fpState || {};
    var mstEventState = buildMstEventStateLive(opts.mstEventState);
    var ffs = opts.ffs || buildFfsLive(opts.inputs);
    var startTs = opts.startTimestamp == null ? null : opts.startTimestamp;

    // mst field generation — runtime-traced 2026-03-30 (HmK function, gpK array)
    //
    // Variable mapping (live bundle → field):
    //   C2K → kevl    qPK → mevl    sDK → tevl
    //   mPK → devl    CTK → dmvl    vEK → pevl
    //   FzK → tovl    GNK → delt    qrK → it
    //   PEK → sts     HzK → fct     bLK → dd2
    //   mEK → kc      OtK → mc      U2K → ww8
    //   BDK → pc      qtK → tc      hsK → ssts
    //   qCK → tst     htK → nfas    NrK → jsrf
    //   VPK → jsrf1/jsrf2    n6K → signals
    //   MrK+brK+j0K → dvc
    //
    // Field computation rules:
    //   kevl = C2K | 1      (bitwise OR with default 1)
    //   mevl = qPK | 32     (bitwise OR with default 32)
    //   tevl = sDK | 32     (bitwise OR with default 32)
    //   devl = second field of doe string (doc event timestamp delta)
    //   dmvl = second field of dme string (device motion timestamp delta)
    //   pevl = pointer event aggregate (0 on no-interaction path)
    //   tovl = devl + dmvl
    //   delt = Date.now() - bmak.startTs (captured at function entry)
    //   it   = 0 on current path
    //   sts  = bmak.startTs
    //   fct  = fpState.td (fingerprint timing delta)
    //   dd2  = parseInt(parseInt(startTs / (2016*2016), 10) / 23, 10)
    //   ww8  = parseInt(dd2 / 6, 10)
    //   ssts = delt + 1  (captured 1ms after delt)
    //   tst  = tovl      (same value)
    //   rval = fpState.rVal (default "-1")
    //   rcfp = fpState.rCFP (default "-1")
    //   nfas = 30261689  (dispatcher case 62, bundle constant)
    //   jsrf = "PiZtE"   (fixed)
    //   jsrf1/jsrf2 = VPK[0]/VPK[1] (script integrity values)
    //   dvc  = MrK + "," + brK + "," + j0K
    //          MrK = SY(delt, ajr, fct, tovl) — canvas/webgl fingerprint hash
    //          brK = lkK() - AnK (small time delta, ~8ms)
    //          j0K = plugin enumeration string (e.g. "j+k+d+l+i+e+g+h+c+a+")

    var mst = buildMstLive({
        mst: opts.mst,
        mstEventState: mstEventState,
        startTimestamp: startTs,
        fpState: fpState,
        fct: opts.fct,
        kevl: opts.kevl,
        mevl: opts.mevl,
        tevl: opts.tevl,
        kc: opts.kc,
        mc: opts.mc,
        pc: opts.pc,
        tc: opts.tc,
        ww8: opts.ww8,
        ssts: opts.ssts,
        tst: opts.tst,
        nfas: opts.nfas,
        jsrf: opts.jsrf,
        jsrf1: opts.jsrf1,
        jsrf2: opts.jsrf2,
        signals: opts.signals,
        mwd: opts.mwd,
        hea: opts.hea,
        dvc: opts.dvc,
        dvcHash: opts.dvcHash,
        dvcDelta: opts.dvcDelta,
        dvcPlugins: opts.dvcPlugins,
        dvcParts: opts.dvcParts,
        srd: opts.srd,
        tid: opts.tid
    });

    return {
        ver: buildVerLive(opts),
        fpt: opts.fpt || fpState.fpValStr || ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1",
        fpc: opts.fpc || buildFpcLive(opts.fpt || fpState.fpValStr || ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1"),
        ajr: opts.ajr || buildAjrLive(opts.userAgent || navigator.userAgent, opts.startTimestamp),
        din: opts.din || (typeof window !== "undefined" ? getBrowserFingerprint() : []),
        eem: opts.eem || "do_en,dm_en,t_en",
        ffs: ffs,
        vev: opts.vev || "",
        inf: opts.inf || ffs,
        ajt: opts.ajt || buildAjtLive(opts),
        kev: opts.kev || "",
        dme: opts.dme || "",
        mev: opts.mev || "",
        doe: opts.doe || "",
        pur: opts.pur || locationHref,
        pev: opts.pev || "",
        mst: mst,
        o9: opts.o9 == null ? 0 : opts.o9,
        tev: opts.tev || "",
        sde: opts.sde || "0,0,0,0,1,0,0",
        // per: 20-char string, each digit = Permissions API query result
        //   digits: 9=not_supported/error, 4=denied, 3=prompt, 2=granted
        //   queries 20 permission names in fixed order (browser-dependent)
        per: opts.per || buildPerLive(),
        // dsi: 12-field array — DOM/script integrity checks
        dsi: opts.dsi || buildDsiLive(),
        // wsl: 20-field CSV — performance.memory + meta count + flags
        //   [0]=jsHeapSizeLimit, [1]=totalJSHeapSize, [2]=usedJSHeapSize,
        //   [3]=-1(AudioContext?), [4]=meta_tags_count,
        //   [5-9]=capability_flags, [10-17]=empty(WebGL unavailable), [18-19]=flags
        wsl: opts.wsl || buildWslLive(),
        // hls: 5-field CSV / async probe result.
        // Current no-interaction live path keeps the key enumerable but leaves
        // the value undefined before JSON.stringify, so it is omitted from the
        // serialized payload. Callers can still force a value via opts.hls.
        hls: buildHlsLive(opts),
        pde: opts.pde || "",
        oev: opts.oev || "",
        if: opts.ifField || "",
        pus: opts.pus == null ? 0 : opts.pus,
        // ffl: script identifier derived from the Akamai script URL path.
        // Runtime capture on 2026-03-31:
        //   URL  = /lUuI09H8kk2lCTn_ihnlZXLM/J3aE8rSc6GQSLfJO/ZHE1PQ/dlZdB/nwEPFIB
        //   ffl  = "J3aE8rSc6GQSLfJO"
        // so current bundle/path uses the second pathname segment.
        ffl: opts.ffl || buildFflLive(opts),
        // sww: Client Hints consistency check — each API sampled twice
        //   odd=initial, even=re-check (anti-spoofing)
        sww: opts.sww || buildSwwLive(),
        te: opts.te == null ? 0 : opts.te,
        nte: opts.nte == null ? 0 : opts.nte,
        mte: opts.mte == null ? 0 : opts.mte,
        tcd: opts.tcd || {},
        pnte: opts.pnte == null ? 0 : opts.pnte,
        pte: opts.pte == null ? 0 : opts.pte,
        pmte: opts.pmte == null ? 0 : opts.pmte,
        tab: opts.tab == null ? 0 : opts.tab,
        // sws: service-worker state bit.
        // Static trace:
        //   payload emits `dDW ? 1 : 0`
        //   dDW is seeded false on the current path, then flipped through the
        //   M3W() branch that depends on serviceWorker-related capability checks.
        sws: opts.sws == null ? 0 : opts.sws,
        mis: opts.mis == null ? 0 : opts.mis,
        og: opts.og || "sm"
    };
}

// ═══════════════════════════════════════════════════════════════════════
// §10  Encode + Sensor Data Final Assembly
// ═══════════════════════════════════════════════════════════════════════

// Header generation — runtime-verified 2026-04-01 (g-bundle: P2l/Gtl functions)
//
// g-bundle variable mapping:
//   P2l → buildHeaderLive (first POST)
//   Gtl → buildHeaderLive with isSecondPost=true (second POST)
//   bXl → sha256Base64 (per-bundle constant, statically extractable)
//
// Header format: "{version};{flag1};{flag2};{flag3};{timeDiff};{sha256Base64}"
//   First POST:  "3;0;1;0;{T3l[0]};{bXl}"
//   Second POST: "3;1;2;0;{T3l[0]};{bXl}"
//
// T3l[0] is the first element of the seeds array (bm_sz cookie seed).
// bXl is a per-bundle decoded constant (like ver/seeds[1]) — must be
// extracted from each new bundle; cannot be hardcoded long-term.
function buildHeaderLive(options) {
    var opts = options || {};
    var seeds = opts.seeds || [0, 0];
    var isSecondPost = opts.isSecondPost || false;
    var sha256Base64 = opts.sha256Base64 || "";

    var version = "3";
    var flag1 = isSecondPost ? "1" : "0";
    var flag2 = isSecondPost ? "2" : "1";
    var flag3 = "0";
    var timeDiff = String(seeds[0]);

    return [version, flag1, flag2, flag3, timeDiff, sha256Base64].join(";");
}

// Encode pipeline — runtime-verified 2026-03-26
//
// Live bundle flow (bSs function):
//   1. DzB = JSON.stringify(payload)
//   2. DzB = BVB(29, [DzB, seeds[1]])   → ahnPermute (token shuffle on ":")
//   3. DzB = nTB(DzB, seeds[0])          → czG encryption + header assembly
//
// seeds[0] = bm_sz cookie ~part[2]  (per-session, e.g. 3686709)
// seeds[1] = bundle constant via AI  (per-bundle, e.g. 4257762)
//
// Previous implementation was wrong: used pair[1] for czG and skipped AhN.
// Correct order: AhN with seeds[1], then czG with seeds[0].
function encode9013PayloadLive(payload, seeds) {
    var pair = seeds || H4G_live();
    var json = JSON.stringify(payload);
    var permuted = ahnPermute(json, pair[1]);
    return czG_live(permuted, pair[0]);
}

// Timing segment — runtime-verified 2026-04-01 (g-bundle: tTl construction)
//
// g-bundle variable mapping (6 comma-separated values):
//   [0] qr(tZl(), CJl)  = total sensor generation elapsed (Date.now() - captureStart)
//   [1] p0l = EF8() elapsed (fingerprint computation time)
//   [2] BSl = fixed 0
//   [3] Fzl = rX(...) elapsed (encryption step time)
//   [4] VRl = X4l(...) elapsed (permutation step time)
//   [5] JRl = async chain elapsed (tZl() - COl)
//
// Example: "25,0,0,2,3,0"
function buildTimingSegmentLive(fields) {
    var input = fields || {};

    return [
        input.elapsedSinceStart != null ? input.elapsedSinceStart : 0,
        input.fpElapsed != null ? input.fpElapsed : (input.j0H != null ? input.j0H : 0),
        input.fixed0 != null ? input.fixed0 : (input.E0Y != null ? input.E0Y : 0),
        input.encryptElapsed != null ? input.encryptElapsed : (input.jgH != null ? input.jgH : 0),
        input.permuteElapsed != null ? input.permuteElapsed : (input.p0Y != null ? input.p0Y : 0),
        input.asyncElapsed != null ? input.asyncElapsed : (input.k7Y != null ? input.k7Y : 0)
    ].join(",");
}

function concatSensorDataSegmentsLive(header, timingSegment, encryptedPayload) {
    // test.js 9094:
    //   SUH = MTY + ";" + nNY + ";" + SUH;
    return String(header) + ";" + String(timingSegment) + ";" + String(encryptedPayload);
}

function buildSensorDataFromBrowserPayloadLive(options) {
    var opts = options || {};
    var payloadJson = opts.payloadJson;

    if (payloadJson == null) {
        if (opts.payload == null) {
            throw new Error("buildSensorDataFromBrowserPayloadLive requires payloadJson or payload");
        }
        payloadJson = JSON.stringify(opts.payload);
    }

    var encryptedPayload = opts.encryptedPayload;
    if (encryptedPayload == null) {
        var pair = opts.seeds || H4G_live();
        encryptedPayload = czG_live(payloadJson, pair[1]);
    }

    var header = opts.header;
    if (header == null) {
        if (opts.sha256Base64 == null) {
            throw new Error("buildSensorDataFromBrowserPayloadLive requires header or sha256Base64");
        }
        header = buildHeaderLive({
            seeds: pair,
            isSecondPost: opts.isSecondPost,
            sha256Base64: opts.sha256Base64
        });
    }

    var timingSegment = opts.timingSegment;
    if (timingSegment == null) {
        if (opts.timingFields == null) {
            throw new Error("buildSensorDataFromBrowserPayloadLive requires timingSegment or timingFields");
        }
        timingSegment = buildTimingSegmentLive(opts.timingFields);
    }

    return concatSensorDataSegmentsLive(header, timingSegment, encryptedPayload);
}

// ═══════════════════════════════════════════════════════════════════════
// §11  Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
    // §1 Utilities
    xq,
    shuffleFingerprint,

    // §2 Encryption / Permutation
    ahnPermute,
    ahnUnpermute,
    czG_live,

    // §3 Seed Extraction
    H4G_live,

    // §4 Browser Feature / Bot Detection Probes
    BX4_S9_live,
    getPhaLive,
    getWdrLive,
    getDauLive,
    getTsdLive,
    getAdpLive,
    getIbrLive,

    // §5 Browser Fingerprint Assembly
    getBrowserFingerprint,

    // §6 Form Fingerprint
    getFfsTypeCodeLive,
    getFfsAutocompleteCodeLive,
    shouldIncludeFfsInputLive,
    normalizeFfsInputLive,
    buildFfsLive,
    buildFpcLive,

    // §7 MST
    buildMstEventStateLive,
    computeMstDd2Live,
    computeMstWw8Live,
    computeMstDvcLive,
    genJsrfLive,
    buildMstLive,
    buildMstObjectMapLive,

    // §8 Misc Payload Field Builders
    buildAjrLive,
    buildAjtLive,
    buildFflLive,
    buildHlsLive,
    buildVerLive,
    buildPerLive,
    buildDsiLive,
    buildWslLive,
    buildSwwLive,

    // §9 Payload Assembly
    build9013PayloadLive,

    // §10 Encode + Sensor Data
    buildHeaderLive,
    encode9013PayloadLive,
    buildTimingSegmentLive,
    concatSensorDataSegmentsLive,
    buildSensorDataFromBrowserPayloadLive,
};
