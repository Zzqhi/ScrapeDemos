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
