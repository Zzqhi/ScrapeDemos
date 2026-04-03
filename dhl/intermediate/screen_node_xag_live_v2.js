// sensor_data reconstruction — verified against live bundle 2026-04-03
//
// Bundle URL: /KJFHw7uSf/xGon0wXcw/QuVubGVXrX8hzc/RX44Qw/NUk/XA19bbRgB
// Bundle source: dhl/intermediate/bundle_20260403.js
// Previous version: dhl/intermediate/screen_node_xag_live.js
//
// Bundle variable mapping (2026-04-03):
//   dispatcher fn: Bxb (offset 510175)
//   XHR send fn: CZb (offset 311391)
//   encrypt fn: fXb (offset 454780)
//   seeds[1]: 3262385 (extracted via AST, confirmed in Bxb scope as IUb)
//   sha256Base64: m60VnGafP60H/Mi0YDtpkmi/l1dVcaedlch/8hSWe7k=
//
// Key changes from v1 (2026-03-26 bundle):
//   - URL pattern: /lUuI09H8... → /KJFHw7uSf/...
//   - ver = sha256Base64 (same per-bundle constant used in header)
//   - ajr: no longer sha256(ua)+sha256(ts), now prefix+dinValues.join(",")
//   - din: field order changed (was ua-first, now shuffled)
//   - dsi, wsl, hls: REMOVED from payload
//   - fwd: NEW field [{fmh:""},{fmz:""},{ssh:"0"}]
//   - per: was 20-digit string, now single digit "8"
//   - sww: was large object, now {"s024":-1}
//   - Encryption pipeline (czG + AhN + header): UNCHANGED

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
    return require("crypto").createHash("sha256").update(String(input)).digest("hex");
}

// ═══════════════════════════════════════════════════════════════════════
// §2  Encryption / Permutation  (czG + AhN)
// ═══════════════════════════════════════════════════════════════════════
// [V] verified 2026-04-03: LCG constants confirmed unchanged

function czG_live(input, seed) {
    var charset = " !#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";
    var lookup = [];
    for (var i = 0; i < 127; i++) {
        if (i === 32 || i === 34 || i === 39 || i === 92) lookup[i] = -1;
        else lookup[i] = charset.indexOf(String.fromCharCode(i));
    }
    var output = "";
    for (var j = 0; j < input.length; j++) {
        var ch = input.charAt(j);
        var shift = ((seed >> 8) & 65535) % charset.length;
        seed = (seed * 65793) & 0xffffffff;
        seed = (seed + 4282663) & 8388607;
        var mappedIndex = lookup[input.charCodeAt(j)];
        if (mappedIndex >= 0) ch = charset[(mappedIndex + shift) % charset.length];
        output += ch;
    }
    return output;
}

function ahnPermute(jsonStr, seed) {
    var parts = jsonStr.split(":");
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
    return parts.join(":");
}

function ahnUnpermute(permuted, seed) {
    var parts = permuted.split(":");
    var key = seed;
    var len = parts.length;
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
    for (var j = swaps.length - 1; j >= 0; j--) {
        var tmp = parts[swaps[j][0]];
        parts[swaps[j][0]] = parts[swaps[j][1]];
        parts[swaps[j][1]] = tmp;
    }
    return parts.join(":");
}

// ═══════════════════════════════════════════════════════════════════════
// §3  Seed Extraction  (bm_sz cookie)
// ═══════════════════════════════════════════════════════════════════════
// [V] verified 2026-04-03: same logic, confirmed seeds[0]=4469302

function extractSeeds(cookieStr, bundleSeed1) {
    var defaultSeed1 = 8888888;
    var seed2 = bundleSeed1 || 3262385;
    try {
        var cookies = String(cookieStr || "").split("; ");
        var raw = null;
        for (var i = 0; i < cookies.length; i++) {
            var entry = cookies[i];
            if (entry.indexOf("bm_sz=") === 0) raw = entry.slice("bm_sz=".length);
        }
        if (!raw) return [defaultSeed1, seed2];
        var parts = String(raw).split("~");
        var seed1 = parseInt(parts[2], 10);
        return [Number.isNaN(seed1) ? defaultSeed1 : seed1, seed2];
    } catch (e) {
        return [defaultSeed1, seed2];
    }
}

// ═══════════════════════════════════════════════════════════════════════
// §4  Browser Fingerprint Probes
// ═══════════════════════════════════════════════════════════════════════
// [V] xag value observed: 12147 (from real Chrome on Linux)
// For Node.js spoofing Windows Chrome: use 12243

function computeXag(env) {
    var checks = [
        /* 0  */ !!env.addEventListener,        // window.addEventListener
        /* 1  */ !!env.XMLHttpRequest,           // window.XMLHttpRequest
        /* 2  */ !!env.XDomainRequest,           // window.XDomainRequest
        /* 3  */ !!env.emit,                     // window.emit
        /* 4  */ !!env.DeviceOrientationEvent,   // window.DeviceOrientationEvent
        /* 5  */ !!env.DeviceMotionEvent,        // window.DeviceMotionEvent
        /* 6  */ !!env.TouchEvent,               // window.TouchEvent
        /* 7  */ !!env.spawn,                    // window.spawn
        /* 8  */ !!env.innerWidth,               // window.innerWidth
        /* 9  */ !!env.outerWidth,               // window.outerWidth
        /* 10 */ !!env.chrome,                   // window.chrome
        /* 11 */ !!Function.prototype.bind,      // Function.prototype.bind
        /* 12 */ !!env.Buffer,                   // window.Buffer
        /* 13 */ !!env.PointerEvent              // window.PointerEvent
    ];
    var result = 0;
    for (var i = 0; i < checks.length; i++) {
        result += (checks[i] ? 1 : 0) << i;
    }
    return result;
}

function buildAdp(env) {
    return [
        "cpen:" + (typeof env.callPhantom !== "undefined" ? 1 : 0),
        "i1:" + (typeof env._phantom !== "undefined" ? 1 : 0),
        "dm:" + ((typeof env.__nightmare !== "undefined" || typeof env.domAutomation !== "undefined") ? 1 : 0),
        "cwen:" + (typeof env.spawn !== "undefined" ? 1 : 0),
        "non:" + (typeof env.Notification !== "undefined" ? 1 : 0),
        "opc:" + (typeof env.opera !== "undefined" ? 1 : 0),
        "fc:" + (typeof env.Buffer !== "undefined" ? 1 : 0),
        "sc:" + (typeof env.emit !== "undefined" ? 1 : 0),
        "wrc:" + (typeof env.RTCPeerConnection === "function" ? 1 : 0),
        "isc:0",
        "vib:" + (typeof env.navigator !== "undefined" && typeof env.navigator.vibrate === "function" ? 1 : 0),
        "bat:" + (typeof env.navigator !== "undefined" && typeof env.navigator.getBattery === "function" ? 1 : 0),
        "x11:" + (env.innerWidth === 0 && env.innerHeight === 0 ? 1 : 0),
        "x12:" + (typeof env.chrome !== "undefined" ? 1 : 0)
    ].join(",");
}

// ═══════════════════════════════════════════════════════════════════════
// §5  Browser Fingerprint Assembly (din field)
// ═══════════════════════════════════════════════════════════════════════
// [C] changed 2026-04-03: field ORDER changed from v1
// v1 order: ua,xag,nps,nal,nap,npl,pha,wdr,dau,hz1,tsd,asw,ash,swi,she,wiw,wih,wow,adp,ucs,ran,hal,ibr
// v2 order: nal,asw,wdr,hz1,she,ran,wow,nap,tsd,xag,nps,hal,ucs,dau,pha,wiw,ibr,ua,wih,npl,swi,ash,adp

function buildDin(opts) {
    var o = opts || {};
    var ua = o.userAgent || "";
    var startTs = o.startTs || Date.now();
    return [
        { nal: o.language || "zh-CN" },
        { asw: o.availWidth || 1920 },
        { wdr: o.webdriver ? 1 : 0 },
        { hz1: parseInt(startTs / (2016 * 2016), 10) },
        { she: o.screenHeight || 1080 },
        { ran: String(Math.random()).substring(0, 14) },
        { wow: o.outerWidth || 1920 },
        { nap: o.product || "Gecko" },
        { tsd: 0 },
        { xag: o.xag || 12243 },
        { nps: o.productSub || "20030107" },
        { hal: Math.floor(startTs / 2) },
        { ucs: String(xq(ua)) },
        { dau: 0 },
        { pha: 0 },
        { wiw: o.innerWidth || 1920 },
        { ibr: 0 },
        { ua: ua },
        { wih: o.innerHeight || 1080 },
        { npl: o.pluginsLength != null ? o.pluginsLength : 5 },
        { swi: o.screenWidth || 1920 },
        { ash: o.availHeight || 1040 },
        { adp: o.adp || "cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:0,isc:0,vib:0,bat:0,x11:0,x12:1" }
    ];
}

// ═══════════════════════════════════════════════════════════════════════
// §6  Form Fingerprint (ffs / fpc / inf)
// ═══════════════════════════════════════════════════════════════════════
// [V] verified 2026-04-03: ffs structure same, fpc = xq(fpt)

function buildFfs(inputs) {
    if (!inputs || !inputs.length) return "";
    var result = "";
    for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        var typeCode = 0;
        var autocompleteCode = inp.autocomplete == null ? -1 : (inp.autocomplete === "off" ? 0 : inp.autocomplete === "on" ? 1 : 2);
        var hasValue = (inp.value && inp.value.length) ? 1 : 0;
        var hasDefaultDelta = 0;
        var requiredFlag = inp.required ? 1 : 0;
        result += [typeCode, autocompleteCode, hasDefaultDelta, requiredFlag, xq(inp.id), xq(inp.name), hasValue].join(",") + ";";
    }
    return result;
}

// ═══════════════════════════════════════════════════════════════════════
// §7  ajr (fingerprint summary string)
// ═══════════════════════════════════════════════════════════════════════
// [C] changed 2026-04-03: completely new format
// v1: sha256Hex(ua) + sha256Hex(String(startTimestamp))
// v2: dinJoined.slice(min(t1,t2), max(t1,t2)) + "|" + t1 + "|" + t2 + "|" + dinJoined
//   t1, t2 = two random offsets into dinJoined (0..dinJoined.length-1)
//   prefix = substring of dinJoined between the two offsets
//
// Verified across 4 page loads, 8 POST captures.

function buildAjr(opts) {
    var o = opts || {};
    var din = o.din || [];
    var dinJoined = din.map(function(d) { return String(Object.values(d)[0]); }).join(",");
    var len = dinJoined.length;

    var t1 = o.ajrT1 != null ? o.ajrT1 : Math.floor(Math.random() * len);
    var t2 = o.ajrT2 != null ? o.ajrT2 : Math.floor(Math.random() * len);

    var mn = Math.min(t1, t2);
    var mx = Math.max(t1, t2);
    var prefix = dinJoined.slice(mn, mx);

    return prefix + "|" + t1 + "|" + t2 + "|" + dinJoined;
}

// ═══════════════════════════════════════════════════════════════════════
// §8  MST (Main State Telemetry)
// ═══════════════════════════════════════════════════════════════════════
// [V] verified 2026-04-03: structure same, 31 sub-fields

function genJsrf(startTs) {
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
    return [jsrf1, Math.floor(Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3))];
}

function buildMst(opts) {
    var o = opts || {};
    var startTs = o.startTs || Date.now();
    var delt = o.delt != null ? o.delt : 4;
    var dd2 = parseInt(parseInt(startTs / (2016 * 2016), 10) / 23, 10);
    var jsrfPair = genJsrf(startTs);

    return [
        { kevl: 1 },
        { mevl: 32 },
        { tevl: 32 },
        { devl: 0 },
        { dmvl: 0 },
        { pevl: 0 },
        { tovl: 0 },
        { delt: delt },
        { it: 0 },
        { sts: startTs },
        { fct: o.fct != null ? o.fct : 5 },
        { dd2: dd2 },
        { kc: 0 },
        { mc: 0 },
        { ww8: 0 },
        { pc: 0 },
        { tc: 0 },
        // ssts = independent Date.now()-startTs sample, slightly after delt
        // Observed: delt=5→ssts=13(+8), delt=3→ssts=4(+1), delt=1074→ssts=1074(+0)
        { ssts: o.ssts != null ? o.ssts : delt + Math.floor(Math.random() * 10) },
        { tst: 0 },
        { rval: "-1" },
        { rcfp: "-1" },
        { nfas: 30261689 },          // [V] confirmed unchanged
        { jsrf: "PiZtE" },           // [V] confirmed unchanged
        { jsrf1: jsrfPair[0] },
        { jsrf2: jsrfPair[1] },
        { signals: "0" },
        { mwd: "0" },
        { hea: "" },
        { dvc: o.dvc || "" },         // [T] TBD: hash algorithm needs tracing
        { srd: "0" },
        { tid: "" }
    ];
}

// ═══════════════════════════════════════════════════════════════════════
// §9  Payload Assembly
// ═══════════════════════════════════════════════════════════════════════
// [C] changed 2026-04-03: dsi/wsl/hls removed, fwd added, per/sww simplified

function buildPayload(opts) {
    var o = opts || {};
    var startTs = o.startTs || Date.now();
    var ua = o.userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
    var pageUrl = o.pageUrl || "";
    var scriptUrl = o.scriptUrl || "";

    var fpt = o.fpt || ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1";
    var fpc = String(xq(fpt));

    var din = o.din || buildDin({
        userAgent: ua,
        startTs: startTs,
        language: o.language || "zh-CN",
        availWidth: o.availWidth || 1920,
        availHeight: o.availHeight || 1040,
        screenWidth: o.screenWidth || 1920,
        screenHeight: o.screenHeight || 1080,
        innerWidth: o.innerWidth || 1920,
        innerHeight: o.innerHeight || 1080,
        outerWidth: o.outerWidth || 1920,
        product: o.product || "Gecko",
        productSub: o.productSub || "20030107",
        pluginsLength: o.pluginsLength != null ? o.pluginsLength : 5,
        xag: o.xag || 12243,
        adp: o.adp || "cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:0,isc:0,vib:0,bat:0,x11:0,x12:1"
    });

    var ffs = o.ffs || "";
    var delt = o.delt != null ? o.delt : Math.floor(Math.random() * 30 + 3);

    // ffl: script URL path segment
    var ffl = o.ffl || "";
    if (!ffl && scriptUrl) {
        try {
            var parts = new URL(scriptUrl).pathname.split("/").filter(Boolean);
            ffl = parts[2] || parts[1] || "";  // [C] now 3rd segment
        } catch (e) {}
    }

    var ajr = o.ajr || buildAjr({
        din: din,
        userAgent: ua,
        innerHeight: o.innerHeight || 1080,
        pluginsLength: o.pluginsLength != null ? o.pluginsLength : 5,
        screenWidth: o.screenWidth || 1920,
        per: o.per || "8"
    });

    var mst = o.mst || buildMst({
        startTs: startTs,
        delt: delt,
        fct: o.fct,
        ssts: o.ssts,
        dvc: o.dvc || ""
    });

    return {
        ver: o.ver || o.sha256Base64 || "",   // [S] = sha256Base64 per-bundle constant
        fpt: fpt,
        fpc: fpc,
        ajr: ajr,
        din: din,
        eem: "do_en,dm_en,t_en",               // [V]
        ffs: ffs,
        vev: "",
        inf: ffs,                               // [V] same as ffs
        ajt: "0,0",                             // [V]
        kev: "",
        dme: "",
        mev: "",
        doe: "",
        pur: pageUrl,
        pev: "",
        mst: mst,
        o9: 0,                                  // [V]
        tev: "",
        sde: "0,0,0,0,1,0,0",                  // [V]
        per: o.per || "8",                       // [C] was 20-digit, now "8"
        pde: "",
        oev: "",
        "if": "",
        pus: 0,
        ffl: ffl,
        sww: { s024: -1 },                      // [C] simplified
        te: 0,
        nte: 0,
        mte: 0,
        tcd: {},
        pnte: 0,
        pte: 0,
        pmte: 0,
        tab: 0,
        sws: 0,                                 // [V]
        mis: 0,                                  // [V]
        og: "sm",                                // [V]
        fwd: [{ fmh: "" }, { fmz: "" }, { ssh: "0" }]  // [N] new field
    };
}

// ═══════════════════════════════════════════════════════════════════════
// §10  Encode + Sensor Data Final Assembly
// ═══════════════════════════════════════════════════════════════════════

function buildHeader(opts) {
    var o = opts || {};
    var seeds = o.seeds || [0, 0];
    var isSecondPost = o.isSecondPost || false;
    var sha256Base64 = o.sha256Base64 || "";
    return [
        "3",
        isSecondPost ? "1" : "0",
        isSecondPost ? "2" : "1",
        "0",
        String(seeds[0]),
        sha256Base64
    ].join(";");
}

function buildTimingSegment(opts) {
    var o = opts || {};
    return [
        o.totalElapsed != null ? o.totalElapsed : 25,
        o.fpElapsed != null ? o.fpElapsed : 0,
        0,
        o.encryptElapsed != null ? o.encryptElapsed : 0,
        o.permuteElapsed != null ? o.permuteElapsed : 3,
        o.asyncElapsed != null ? o.asyncElapsed : 0
    ].join(",");
}

function encodeSensorPayload(payload, seeds) {
    var json = JSON.stringify(payload);
    var permuted = ahnPermute(json, seeds[1]);
    return czG_live(permuted, seeds[0]);
}

function buildSensorData(opts) {
    var o = opts || {};
    var seeds = o.seeds || extractSeeds(o.cookieStr, o.bundleSeed1);
    var sha256Base64 = o.sha256Base64 || "m60VnGafP60H/Mi0YDtpkmi/l1dVcaedlch/8hSWe7k=";

    var payload = o.payload || buildPayload({
        startTs: o.startTs || Date.now(),
        userAgent: o.userAgent,
        pageUrl: o.pageUrl,
        scriptUrl: o.scriptUrl,
        sha256Base64: sha256Base64,
        ver: sha256Base64,
        fpt: o.fpt,
        ffs: o.ffs,
        dvc: o.dvc,
        per: o.per,
        ffl: o.ffl,
        fct: o.fct,
        delt: o.delt,
        ssts: o.ssts,
        din: o.din,
        ajr: o.ajr,
        mst: o.mst,
        language: o.language,
        screenWidth: o.screenWidth,
        screenHeight: o.screenHeight,
        availWidth: o.availWidth,
        availHeight: o.availHeight,
        innerWidth: o.innerWidth,
        innerHeight: o.innerHeight,
        outerWidth: o.outerWidth,
        pluginsLength: o.pluginsLength,
        xag: o.xag,
        adp: o.adp
    });

    var t0 = Date.now();
    var encrypted = encodeSensorPayload(payload, seeds);
    var encTime = Date.now() - t0;

    var header = buildHeader({
        seeds: seeds,
        sha256Base64: sha256Base64,
        isSecondPost: o.isSecondPost || false
    });

    var timing = buildTimingSegment({
        totalElapsed: o.totalElapsed != null ? o.totalElapsed : encTime + 20,
        fpElapsed: 0,
        encryptElapsed: Math.max(1, Math.floor(encTime / 2)),
        permuteElapsed: Math.max(1, Math.ceil(encTime / 2)),
        asyncElapsed: 0
    });

    return header + ";" + timing + ";" + encrypted;
}

// ═══════════════════════════════════════════════════════════════════════
// §11  Exports
// ═══════════════════════════════════════════════════════════════════════

module.exports = {
    xq,
    sha256Hex,
    czG_live,
    ahnPermute,
    ahnUnpermute,
    extractSeeds,
    computeXag,
    buildAdp,
    buildDin,
    buildFfs,
    buildAjr,
    genJsrf,
    buildMst,
    buildPayload,
    buildHeader,
    buildTimingSegment,
    encodeSensorPayload,
    buildSensorData
};
