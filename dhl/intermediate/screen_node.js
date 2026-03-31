// fpValStr 生成逻辑完整还原
// 对应 test.js: KTH() → Cm()
// 对应 live:   QWN() → D6N()

// ===== 直接采集的浏览器属性 =====
var colorDepth = window.screen.colorDepth ? window.screen.colorDepth : -1       // 24 或 32
var pixelDepth = window.screen.pixelDepth ? window.screen.pixelDepth : -1       // 24 或 32
var cookieEnabled = window.navigator.cookieEnabled ? window.navigator.cookieEnabled : -1  // true
var javaEnabled = window.navigator.javaEnabled ? window.navigator.javaEnabled() : -1      // false
var doNotTrack = window.navigator.doNotTrack ? window.navigator.doNotTrack : -1            // -1

// ===== 通过 dispatcher 调用的特性检测 =====

// case qR / VW (test.js case qR, live case VW=37)
// 检测 navigator.plugins 中存在哪些属性
// 构建 27 个属性名的数组，遍历检测每个是否存在于 navigator.plugins
// navigator.plugins 的 keys: ["0","1","2","3","4","length","item","namedItem","refresh"]
// 其中 index 7 ("namedItem") 匹配 → 返回 ",7"
function checkPluginProps() {
    var propNames = [
        // 27 个属性名（混淆后的字符串，实际是 navigator.plugins 的各种可能属性）
        // 例如: "0","1","2","3","4","length","item","namedItem","refresh" 等
        // 具体属性名被混淆，但逻辑是检测哪些 index 的属性名存在于 navigator.plugins 对象上
    ];
    if (typeof navigator.plugins === 'undefined') return null;
    var result = "";
    for (var i = 0; i < propNames.length; i++) {
        if (navigator.plugins[propNames[i]] !== undefined) {
            result = result + "," + i;  // 拼接匹配的索引
        }
    }
    return result;  // ",7" — 表示第 7 个属性存在
}

// case Zx / Wx (test.js case Zx, live case Wx=356)
// !!window.sessionStorage
function checkSessionStorage() {
    try {
        return !!window.sessionStorage;  // true
    } catch(e) {
        return false;
    }
}

// case fN / VF (test.js case fN, live case VF=169)
// !!window.localStorage
function checkLocalStorage() {
    try {
        return !!window.localStorage;  // true
    } catch(e) {
        return false;
    }
}

// case gt / Db (test.js case gt, live UmN case Db=56)
// !!window.indexedDB
function checkIndexedDB() {
    return !!window.indexedDB;  // true
}

// case Xn / GL (test.js case Xn, live case GL=768)
// new Date().getTimezoneOffset()
function getTimezoneOffset() {
    return new Date().getTimezoneOffset();  // -480 (UTC+8)
}

// case Bw / Ux (test.js case Bw, live case Ux=935)
// typeof window.RTCPeerConnection === 'function' || typeof window[prop2] === 'function' || typeof window[prop3] === 'function'
function checkRTCPeerConnection() {
    return typeof window.RTCPeerConnection === 'function' ||
           typeof window.webkitRTCPeerConnection === 'function' ||  // prop2 可能是这个
           typeof window.mozRTCPeerConnection === 'function';       // prop3 可能是这个
    // 返回 true
}

// ===== 最终组装 =====
var fpValArr = [
    "",                      // [0] 空字符串占位
    -1,                      // [1] 固定 -1 (mZK / HFN / fRH)
    "dis",                   // [2] 固定字符串 "dis"
    checkPluginProps(),      // [3] ",7" — navigator.plugins 属性检测
    checkSessionStorage(),   // [4] true — !!window.sessionStorage
    checkLocalStorage(),     // [5] true — !!window.localStorage
    checkIndexedDB(),        // [6] true — !!window.indexedDB
    getTimezoneOffset(),     // [7] -480 — 时区偏移
    checkRTCPeerConnection(),// [8] true — RTCPeerConnection 存在性
    colorDepth,              // [9] 24 — screen.colorDepth
    pixelDepth,              // [10] 24 — screen.pixelDepth
    cookieEnabled,           // [11] true — navigator.cookieEnabled
    javaEnabled,             // [12] false — navigator.javaEnabled()
    doNotTrack               // [13] -1 — navigator.doNotTrack
];

var fpValStr = fpValArr.join(";");
// 结果: ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1"

console.log(fpValStr);

// ===== KTH / QWN 包装层 =====
// KTH/QWN 还会:
// 1. 记录开始时间 O7H/ALN = Date.now()
// 2. 对 fpValStr 做一次 .replace(regex, "") (可能清理某些字符)
// 3. 记录结束时间 DNH/QON = Date.now()
// 4. 返回 { fpValStr: result, td: timeDelta }
//    td = QON - ALN (计算耗时，单位毫秒，通常 0-2)

// ===== DQN / xq 函数 =====
// 对 fpValStr 做 ASCII charCode 求和 (code < 128 的字符)
function xq(str) {
    if (str == null) return -1;
    var sum = 0;
    for (var i = 0; i < str.length; i++) {
        var code = str.charCodeAt(i);
        if (code < 128) sum += code;
    }
    return sum;
}
// xq(fpValStr) → 4542

// ===== HxH(t8, []) / BX4(PX, []) — Navigator/Math 属性位掩码 =====
// 对应 test.js: HxH() case t8 (line 12968)
// 对应 live:   BX4() case PX
// 对应 cBH 中: var xcH = HxH(t8, []);
// 对应 t84 中: var ADN = BX4(PX, []);
//
// 逻辑: 检测 25 个浏览器属性是否存在，每个属性对应一个 bit 位
// 公式: result = Σ Boolean(obj[prop_i]) << i,  i = 0..24
//
// 返回值: 30261689 (二进制: 1110011011100000110111001)
// 设置的 bit 位: [0, 3, 4, 5, 7, 8, 14, 15, 16, 18, 19, 22, 23, 24]

function getNavigatorBitmask() {
    var props = [
        // idx  object       property                         Chrome实际值    bit
        /* 0  */ { obj: navigator, prop: 'credentials' },                 // true  → 1 << 0  = 1
        /* 1  */ { obj: navigator, prop: 'appMinorVersion' },             // false → 0
        /* 2  */ { obj: navigator, prop: 'bluetooth' },                   // false → 0
        /* 3  */ { obj: navigator, prop: 'storage' },                     // true  → 1 << 3  = 8
        /* 4  */ { obj: Math,      prop: 'imul' },                        // true  → 1 << 4  = 16
        /* 5  */ { obj: navigator, prop: 'getGamepads' },                 // true  → 1 << 5  = 32
        /* 6  */ { obj: navigator, prop: 'getStorageUpdates' },           // false → 0
        /* 7  */ { obj: navigator, prop: 'hardwareConcurrency' },         // true  → 1 << 7  = 128
        /* 8  */ { obj: navigator, prop: 'mediaDevices' },                // true  → 1 << 8  = 256
        /* 9  */ { obj: navigator, prop: 'mozAlarms' },                   // false → 0
        /* 10 */ { obj: navigator, prop: 'mozConnection' },               // false → 0
        /* 11 */ { obj: navigator, prop: 'mozIsLocallyAvailable' },       // false → 0
        /* 12 */ { obj: navigator, prop: 'mozPhoneNumberService' },       // false → 0
        /* 13 */ { obj: navigator, prop: 'msManipulationViewsEnabled' },  // false → 0
        /* 14 */ { obj: navigator, prop: 'permissions' },                 // true  → 1 << 14 = 16384
        /* 15 */ { obj: navigator, prop: 'registerProtocolHandler' },     // true  → 1 << 15 = 32768
        /* 16 */ { obj: navigator, prop: 'requestMediaKeySystemAccess' }, // true  → 1 << 16 = 65536
        /* 17 */ { obj: navigator, prop: 'requestWakeLock' },             // false → 0
        /* 18 */ { obj: navigator, prop: 'sendBeacon' },                  // true  → 1 << 18 = 262144
        /* 19 */ { obj: navigator, prop: 'serviceWorker' },               // true  → 1 << 19 = 524288
        /* 20 */ { obj: navigator, prop: 'storeWebWideTrackingException' }, // false → 0
        /* 21 */ { obj: navigator, prop: 'webkitGetGamepads' },           // false → 0
        /* 22 */ { obj: navigator, prop: 'webkitTemporaryStorage' },      // true  → 1 << 22 = 4194304
        /* 23 */ { obj: window,    prop: 'parseInt' },                    // true  → 1 << 23 = 8388608
        /* 24 */ { obj: Math,      prop: 'hypot' },                      // true  → 1 << 24 = 16777216
    ];

    var result = 0;
    for (var i = 0; i < props.length; i++) {
        result += Boolean(props[i].obj[props[i].prop]) << i;
    }
    return result;
    // Chrome headless 结果: 30261689
    // = 1 + 8 + 16 + 32 + 128 + 256 + 16384 + 32768 + 65536
    //   + 262144 + 524288 + 4194304 + 8388608 + 16777216
}

// 注意:
// 1. 属性 4 (Math.imul) 和 24 (Math.hypot) 检测的是 Math 对象
// 2. 属性 23 (parseInt) 检测的是 window/全局对象 (Number.parseInt === window.parseInt)
// 3. 其余 22 个属性检测的是 navigator 对象
// 4. moz* 属性在 Firefox 中为 true，webkit* 属性在旧版 Chrome 中为 true
// 5. 不同浏览器/环境的结果不同，这是浏览器指纹的一部分

// ===== G0H() / vMN() — 从 _abck cookie 读取 hash =====
// 对应 test.js: G0H() (line 4741)
// 对应 live:   vMN()
// 对应 cBH 中: var dpH = G0H();
// 对应 t84 中: var Hc4 = vMN();
//
// 逻辑: 读取 _abck cookie，提取第一个 "~" 之前的 hash 部分
// 返回值: "A27741CBDDC9103CA90D379DC833A175"

function getCookieHash() {
    var cookieName = "_abck";  // lTH 解密后的值
    var cookieValue = readCookie(cookieName);  // qb(lTH)
    if (!cookieValue) return "";

    // _abck cookie 格式:
    // "A27741CBDDC9103CA90D379DC833A175~-1~YAAQjGPKF...~0~..."
    //  ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    //  第一个 ~ 之前的部分就是 hash
    var parts = decodeURIComponent(cookieValue).split("~");
    return parts[0];  // "A27741CBDDC9103CA90D379DC833A175"
}

// readCookie / qb (line 888) — 通用 cookie 读取函数
function readCookie(name) {
    if (!document.cookie) return false;
    var cookies = document.cookie.split('; ');
    var exactMatch = null;   // name=value 精确匹配
    var suffixMatch = null;  // name_xxx=value 后缀匹配（优先级更高）

    for (var i = 0; i < cookies.length; i++) {
        var c = cookies[i];
        if (c.indexOf(name + "=") === 0) {
            // 精确匹配: _abck=value
            var val = c.substring((name + "=").length);
            if (val.indexOf('~') !== -1 || decodeURIComponent(val).indexOf('~') !== -1) {
                exactMatch = val;
            }
        } else if (c.startsWith(name + "_")) {
            // 后缀匹配: _abck_xxx=value（某些 CDN 会分片 cookie）
            var eqIdx = c.indexOf('=');
            if (eqIdx !== -1) {
                var v = c.substring(eqIdx + 1);
                if (v.indexOf('~') !== -1 || decodeURIComponent(v).indexOf('~') !== -1) {
                    suffixMatch = v;
                }
            }
        }
    }
    // 后缀匹配优先于精确匹配
    if (suffixMatch !== null) return suffixMatch;
    if (exactMatch !== null) return exactMatch;
    return false;
}

// ===== fBH() / Yx4() — cookie hash 变化检测 =====
// 对应 test.js: fBH(R6H) (line 8908)
// 对应 live:   Yx4(hash, firstLoad)
// 对应 cBH 中: var HPH = fBH(dpH, A8H);
// 对应 t84 中: var Em4 = Yx4(Hc4, LZN);
//
// 逻辑: 比较当前 cookie hash 与上次保存的值，检测是否发生变化
// 返回值: { mis: 0, og: "sm" }

function checkCookieHashChange(currentHash, isFirstLoad) {
    // currentHash = G0H() 的返回值
    // isFirstLoad = A8H (firstLoad 标志)

    // 如果 currentHash 不是 string 类型，直接返回默认值
    if (typeof currentHash !== "string") {
        return { mis: 0, og: "sm" };
    }

    var mis = 0;       // mismatch 计数: 0=匹配, -1=不匹配
    var og = "sm";     // original/old hash: "sm"=初始默认值

    // XCH 是闭包中保存的上一次 hash 值（初始为 ""）
    if (isFirstLoad && XCH !== "") {
        // 首次加载且已有旧值 → 比较
        if (currentHash !== XCH) {
            mis = -1;       // hash 不匹配（可能被篡改或过期）
            og = XCH;       // 保存旧 hash
        }
    }

    // 首次加载时保存当前 hash 供下次比较
    if (isFirstLoad) {
        XCH = currentHash;
    }

    return { mis: mis, og: og };
    // 正常首次访问: { mis: 0, og: "sm" }
    // hash 被修改时:  { mis: -1, og: "旧hash值" }
}

// 注意:
// 1. _abck cookie 由 Akamai 服务端在响应中设置
// 2. 首次请求时 _abck 包含初始 hash，后续 sensor_data POST 成功后服务端会更新
// 3. mis=-1 意味着客户端检测到 cookie 被篡改（反调试/反爬机制）
// 4. og 字段记录旧值用于服务端分析异常

// ===== qSH() / cb4() — 浏览器指纹 JSON 数组 =====
// 对应 test.js: qSH() (line 9755)
// 对应 live:   cb4()
// 对应 cBH 中: var r6H = qSH();
// 对应 t84 中: var kb4 = cb4();
//
// 返回值: 23 个 {key: value} 对象组成的数组（顺序经 rL/IF 函数 shuffle）
// shuffle seed 来自闭包变量 QGH/PGN，首次调用时基于 webdriver 检测结果

function getBrowserFingerprint() {
    var startTs = window.bmak.startTs;

    // ---- 直接采集的浏览器属性 ----
    var ua   = navigator.userAgent;
    var nps  = navigator.productSub;              // "20030107"
    var nal  = navigator.language;                 // "en-US"
    var nap  = navigator.product;                  // "Gecko"（不是 appName）
    var npl  = navigator.plugins.length;           // 5
    var asw  = screen.availWidth;                  // 1718
    var ash  = screen.availHeight;                 // 891
    var swi  = screen.width;                       // 1718
    var she  = screen.height;                      // 918
    var wiw  = window.innerWidth;                  // 836
    var wih  = window.innerHeight;                 // 780
    var wow  = window.outerWidth;                  // 844

    // 注: nps/nal/nap/npl 通过 TkN()/SLY() 函数获取:
    // TkN() 返回 [productSub, language, product, plugins.length]
    // 然后用 XPN/PKH 拆分成 4 个变量

    // 注: asw/ash/swi/she/wiw/wih/wow 在 try-catch 中采集
    // 部分通过 screen.orientation 对象间接访问，失败时回退为默认值

    // ---- 计算字段 ----
    var hal  = Math.floor(startTs / 2);            // 887214165746
    var hz1  = parseInt(startTs / (2016 * 2016), 10); // 436593
    //   → 2016*2016 = 4064256 是固定常量（p84 变量的平方）
    //   → hz1 进一步用于计算 vKN = parseInt(hz1 / 23, 10) → 18982 (用于 rpH/E3N)

    var ucs  = String(xq(ua));                     // "7396" — UA 的 ASCII charCode 求和
    var ran  = String(Math.random()).substring(0, 14); // "0.864518264432"
    //   → 实际还会拼接一个基于 Math.random 的 hash 后缀，但通常为空或很短

    // ---- 位掩码 / 特性检测 ----  是不是没还原?
    var xag  = BX4_S9();                           // 12147 — HxH(F0,[]) 另一个特性位掩码
    //   → case F0 (test.js line 12989)，检测 14 个 window/document 特性
    //   → 每个特性返回 0 或 1（部分可能返回 -1），左移后求和
    //   → 12147 二进制 = 10111101110011，set bits: [0,1,4,5,6,8,9,10,11,13]
    //   → 待进一步确认每个 bit 对应的具体特性（需浏览器调试）

    // ---- 高级特性检测字符串 ----
    // adp = GAN()/q9H() 生成的特性检测字符串
    var adp = [
        "cpen:" + (typeof window.callPhantom !== 'undefined' ? 1 : 0),  // PhantomJS 检测
        "i1:"   + (typeof window._phantom !== 'undefined' ? 1 : 0),     // PhantomJS 检测
        "dm:"   + (typeof window.__nightmare !== 'undefined' || typeof window.domAutomation !== 'undefined' ? 1 : 0), // Nightmare/自动化
        "cwen:" + (typeof window.spawn !== 'undefined' ? 1 : 0),        // 进程 spawn 检测
        "non:"  + (typeof Notification !== 'undefined' ? 1 : 0),        // Notification API
        "opc:"  + (typeof window.opera !== 'undefined' ? 1 : 0),        // Opera 浏览器
        "fc:"   + (typeof window.Buffer !== 'undefined' ? 1 : 0),       // Node.js 环境
        "sc:"   + (typeof window.emit !== 'undefined' ? 1 : 0),         // Node.js EventEmitter
        "wrc:"  + (typeof window.RTCPeerConnection === 'function' ? 1 : 0), // WebRTC
        "isc:"  + 0,                                                    // 待确认
        "vib:"  + (typeof navigator.vibrate === 'function' ? 1 : 0),    // Vibration API
        "bat:"  + (typeof navigator.getBattery === 'function' ? 1 : 0), // Battery API
        "x11:"  + (window.innerWidth === 0 && window.innerHeight === 0 ? 1 : 0), // 无头窗口
        "x12:"  + (typeof window.chrome !== 'undefined' ? 1 : 0),       // Chrome 检测
    ].join(",");
    // 结果: "cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:1,isc:0,vib:1,bat:1,x11:0,x12:1"

    // ---- 标志位 ----
    var ibr  = 0;  // is-bot-robot: webdriver/headless 检测，0=正常浏览器
    //   → 检测: navigator.webdriver, window dimensions, chrome.runtime 等
    //   → headless 环境返回 1

    var pha  = 0;  // 某种特性标志（可能是 navigator.vibrate 相关）
    var wdr  = 0;  // 某种特性标志（可能是 navigator.getBattery 相关）
    var dau  = 0;  // 某种特性标志
    var tsd  = 0;  // 触摸屏检测？或某个闭包变量

    // ---- 组装 ----
    var fingerprint = [
        { ua:  ua },
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
        { ibr: ibr },
    ];

    // 最后用 rL/IF 函数 shuffle（基于 PGN seed）后返回
    return shuffle(fingerprint, PGN);
}

// 示例输出（shuffle 后）:
// [{"ibr":0},{"wih":780},{"wiw":836},{"npl":5},{"wow":844},{"ash":891},
//  {"ua":"Mozilla/5.0..."},{"asw":1718},{"hal":887214165746},{"pha":0},
//  {"swi":1718},{"nap":"Gecko"},{"tsd":0},{"she":918},{"xag":12147},
//  {"nps":"20030107"},{"ucs":"7396"},
//  {"adp":"cpen:0,i1:0,dm:0,cwen:0,non:1,opc:0,fc:0,sc:0,wrc:1,isc:0,vib:1,bat:1,x11:0,x12:1"},
//  {"ran":"0.864518264432"},{"wdr":0},{"dau":0},{"nal":"en-US"},{"hz1":436593}]

// ===== LSH / c14 完整对象结构 =====
// 初始对象在第一次调用 cBH/t84 时通过 Object.assign 更新:
// LSH = Object.assign(LSH, KTH(), { fpValCalculated: false })
// 最终 LSH/c14 = {
//   fpValStr: ";-1;dis;,7;true;true;true;-480;true;24;24;true;false;-1",
//   rVal: "-1",       // 初始值
//   rCFP: "-1",       // 初始值
//   td: 2,            // 计算耗时
//   fpValCalculated: true  // 首次计算后设为 true
// }
