'use strict';

const SBOX_HEX = 'a7be3f3933fa8c5fcf86c4b6908b569ba1e26c1a6d7cfbf60ae4b00e074a194dac4b73e7f898541159a39d08183b76eedee3ed341e6685d2357440158394b1ff03a9004cbbb5ca7dcb7f41489a16e03dcc9c71eb3c9796685b1d01b4d56193a6e1f1a2470445c191ae49c5d82765dc82c350f263387a24a502fcbf442e2dddaad0e936d9ea22b89275307b42518fbc3a626ba806d4ecd6d725f50cc8c72fefa4551ccd6fc9b2b7ab954f815c7264c6e51f4eaf99885a79892b1b60a0b3526e57ba5d178d370958847eb9fd28f9ce0bc023f4148a2adfe632126769057043d3bd8eda0df7872629f3809ef05310e83113216afe202c460fc23e789f77d1addb5e';
const ROUND_KEY = '037606da0296055c';
const SEED_KEY = 'fd6a43ae25f74398b61c03c83be37449';
const BASE64_ALPHABET = 'MB.CfHUzEeJpsuGkgNwhqiSaI4Fd9L6jYKZAxn1/Vml0c5rbXRP+8tD3QTO2vWyo';
const BASE64_PADDING = '7';
const XOR_BASE64_ALPHABET = ['i', '/', 'x', '1', 'X', 'g', 'U', '0', 'z', '7', 'k', '8', 'N', '+', 'l', 'C', 'p', 'O', 'n', 'P', 'r', 'v', '6', '\\', 'q', 'u', '2', 'G', 'j', '9', 'H', 'R', 'c', 'w', 'T', 'Y', 'Z', '4', 'b', 'f', 'S', 'J', 'B', 'h', 'a', 'W', 's', 't', 'A', 'e', 'o', 'M', 'I', 'E', 'Q', '5', 'm', 'D', 'd', 'V', 'F', 'L', 'K', 'y'];
const XOR_BASE64_PADDING = '3';

const CRC32_TABLE = [
    0, 1996959894, 3993919788, 2567524794, 124634137, 1886057615, 3915621685, 2657392035,
    249268274, 2044508324, 3772115230, 2547177864, 162941995, 2125561021, 3887607047, 2428444049,
    498536548, 1789927666, 4089016648, 2227061214, 450548861, 1843258603, 4107580753, 2211677639,
    325883990, 1684777152, 4251122042, 2321926636, 335633487, 1661365465, 4195302755, 2366115317,
    997073096, 1281953886, 3579855332, 2724688242, 1006888145, 1258607687, 3524101629, 2768942443,
    901097722, 1119000684, 3686517206, 2898065728, 853044451, 1172266101, 3705015759, 2882616665,
    651767980, 1373503546, 3369554304, 3218104598, 565507253, 1454621731, 3485111705, 3099436303,
    671266974, 1594198024, 3322730930, 2970347812, 795835527, 1483230225, 3244367275, 3060149565,
    1994146192, 31158534, 2563907772, 4023717930, 1907459465, 112637215, 2680153253, 3904427059,
    2013776290, 251722036, 2517215374, 3775830040, 2137656763, 141376813, 2439277719, 3865271297,
    1802195444, 476864866, 2238001368, 4066508878, 1812370925, 453092731, 2181625025, 4111451223,
    1706088902, 314042704, 2344532202, 4240017532, 1658658271, 366619977, 2362670323, 4224994405,
    1303535960, 984961486, 2747007092, 3569037538, 1256170817, 1037604311, 2765210733, 3554079995,
    1131014506, 879679996, 2909243462, 3663771856, 1141124467, 855842277, 2852801631, 3708648649,
    1342533948, 654459306, 3188396048, 3373015174, 1466479909, 544179635, 3110523913, 3462522015,
    1591671054, 702138776, 2966460450, 3352799412, 1504918807, 783551873, 3082640443, 3233442989,
    3988292384, 2596254646, 62317068, 1957810842, 3939845945, 2647816111, 81470997, 1943803523,
    3814918930, 2489596804, 225274430, 2053790376, 3826175755, 2466906013, 167816743, 2097651377,
    4027552580, 2265490386, 503444072, 1762050814, 4150417245, 2154129355, 426522225, 1852507879,
    4275313526, 2312317920, 282753626, 1742555852, 4189708143, 2394877945, 397917763, 1622183637,
    3604390888, 2714866558, 953729732, 1340076626, 3518719985, 2797360999, 1068828381, 1219638859,
    3624741850, 2936675148, 906185462, 1090812512, 3747672003, 2825379669, 829329135, 1181335161,
    3412177804, 3160834842, 628085408, 1382605366, 3423369109, 3138078467, 570562233, 1426400815,
    3317316542, 2998733608, 733239954, 1555261956, 3268935591, 3050360625, 752459403, 1541320221,
    2607071920, 3965973030, 1969922972, 40735498, 2617837225, 3943577151, 1913087877, 83908371,
    2512341634, 3803740692, 2075208622, 213261112, 2463272603, 3855990285, 2094854071, 198958881,
    2262029012, 4057260610, 1759359992, 534414190, 2176718541, 4139329115, 1873836001, 414664567,
    2282248934, 4279200368, 1711684554, 285281116, 2405801727, 4167216745, 1634467795, 376229701,
    2685067896, 3608007406, 1308918612, 956543938, 2808555105, 3495958263, 1231636301, 1047427035,
    2932959818, 3654703836, 1088359270, 936918000, 2847714899, 3736837829, 1202900863, 817233897,
    3183342108, 3401237130, 1404277552, 615818150, 3134207493, 3453421203, 1423857449, 601450431,
    3009837614, 3294710456, 1567103746, 711928724, 3020668471, 3272380065, 1510334235, 755167117
];

function toByte(n) {
    if (n < -128) return toByte(256 + n);
    if (n > 127) return toByte(n - 256);
    return n;
}

function xor(a, b) {
    return toByte(toByte(a) ^ toByte(b));
}

function xors(a, b) {
    return a.map((v, i) => xor(v, b[i % b.length]));
}

function shift(a, b) {
    return toByte(a + b);
}

function shifts(a, b) {
    return a.map((v, i) => shift(v, b[i % b.length]));
}

function hexToByte(s) {
    s = String(s);
    return toByte((parseInt(s[0], 16) << 4) + parseInt(s[1], 16));
}

function hexsToBytes(s) {
    s = String(s);
    const result = [];
    for (let i = 0; i < s.length / 2; i++) {
        result.push(toByte((parseInt(s[i * 2], 16) << 4) + parseInt(s[i * 2 + 1], 16)));
    }
    return result;
}

function intToBytes(n) {
    return [
        toByte((n >>> 24) & 255),
        toByte((n >>> 16) & 255),
        toByte((n >>> 8) & 255),
        toByte(255 & n)
    ];
}

function copyToBytes(src, srcOffset, dst, dstOffset, len) {
    for (let i = 0; i < len; i++) {
        if (srcOffset + i < src.length) {
            dst[dstOffset + i] = src[srcOffset + i];
        }
    }
    return dst;
}

function paddingArrayZero(n) {
    return new Array(n).fill(0);
}

function stringToBytes(str) {
    const encoded = encodeURIComponent(str);
    const result = [];
    for (let i = 0; i < encoded.length; i++) {
        if (encoded[i] === '%') {
            if (i + 2 < encoded.length) {
                result.push(hexsToBytes(encoded[++i] + encoded[++i])[0]);
            }
        } else {
            result.push(toByte(encoded.charCodeAt(i)));
        }
    }
    return result;
}

function byteToHex(b) {
    const hex = '0123456789abcdef';
    return hex[(b >>> 4) & 15] + hex[15 & b];
}

function bytesToString(bytes) {
    const parts = [];
    for (const b of bytes) {
        parts.push('%');
        parts.push(byteToHex(b));
    }
    return decodeURIComponent(parts.join(''));
}

function genCrc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (const b of bytes) {
        crc = (crc >>> 8) ^ CRC32_TABLE[255 & (crc ^ b)];
    }
    const finalized = (0xFFFFFFFF ^ crc) >>> 0;
    const bs = intToBytes(finalized);
    return bs.map((b) => byteToHex(b)).join('');
}

function padTo64(arr) {
    if (!arr.length) return paddingArrayZero(64);
    if (arr.length >= 64) return arr.slice(0, 64);
    const result = [];
    for (let i = 0; i < 64; i++) result[i] = arr[i % arr.length];
    return result;
}

function padToBlock(arr) {
    if (!arr.length) return paddingArrayZero(64);
    const len = arr.length;
    const padding = (len % 64 <= 60) ? (64 - (len % 64) - 4) : (128 - (len % 64) - 4);
    const result = [];
    copyToBytes(arr, 0, result, 0, len);
    for (let i = 0; i < padding; i++) result[len + i] = 0;
    copyToBytes(intToBytes(len), 0, result, len + padding, 4);
    return result;
}

function splitToBlocks(arr) {
    if (arr.length % 64 !== 0) return [];
    const blocks = [];
    for (let i = 0; i < arr.length / 64; i++) {
        blocks[i] = arr.slice(i * 64, (i + 1) * 64);
    }
    return blocks;
}

function sboxSubstitute(bytes) {
    const sbox = hexsToBytes(SBOX_HEX);
    return bytes.map((b) => sbox[16 * ((b >>> 4) & 15) + (15 & b)]);
}

function genRandom4Bytes() {
    return [0, 1, 2, 3].map(() => toByte(Math.floor(256 * Math.random())));
}

function applyRound(arr) {
    const ops = [
        (a) => a,
        (a, n) => {
            n = toByte(n);
            return a.map((v) => xor(v, n));
        },
        (a, n) => {
            n = toByte(n);
            return a.map((v) => shift(v, n));
        },
        (a, n) => {
            n = toByte(n);
            return a.map((v) => xor(v, n++));
        },
        (a, n) => {
            n = toByte(n);
            return a.map((v) => shift(v, n++));
        },
        (a, n) => {
            n = toByte(n);
            return a.map((v) => xor(v, n--));
        },
        (a, n) => {
            n = toByte(n);
            return a.map((v) => shift(v, n--));
        }
    ];

    let result = arr;
    for (let i = 0; i < ROUND_KEY.length; i += 4) {
        const opIdx = hexToByte(ROUND_KEY.substring(i, i + 2));
        const param = hexToByte(ROUND_KEY.substring(i + 2, i + 4));
        result = ops[opIdx](result, param);
    }
    return result;
}

function genKeyAndIV() {
    const seedBytes = stringToBytes(SEED_KEY);
    const iv = genRandom4Bytes();
    // const iv = [74, 60, 41, 15];
    const paddedSeed = padTo64(seedBytes.slice());
    const paddedIV = padTo64(iv.slice());
    const key64 = padTo64(xors(paddedSeed, paddedIV));
    return [key64, iv];
}

function base64EncodePrivate(bytes) {
    const alphabet = BASE64_ALPHABET.split('');
    const padding = BASE64_PADDING;
    if (!bytes || bytes.length === 0) return '';

    const result = [];
    for (let i = 0; i < bytes.length;) {
        if (i + 3 <= bytes.length) {
            const chunk = bytes.slice(i, i + 3);
            const a = chunk[0];
            const b = chunk[1];
            const c = chunk[2];
            result.push(
                alphabet[(a >>> 2) & 63],
                alphabet[((a << 4) & 48) + ((b >>> 4) & 15)],
                alphabet[((b << 2) & 60) + ((c >>> 6) & 3)],
                alphabet[63 & c]
            );
            i += 3;
        } else {
            const chunk = bytes.slice(i);
            if (chunk.length === 1) {
                const a = chunk[0];
                result.push(alphabet[(a >>> 2) & 63], alphabet[(a << 4) & 48], padding, padding);
            } else {
                const a = chunk[0];
                const b = chunk[1];
                result.push(
                    alphabet[(a >>> 2) & 63],
                    alphabet[((a << 4) & 48) + ((b >>> 4) & 15)],
                    alphabet[(b << 2) & 60],
                    padding
                );
            }
            break;
        }
    }
    return result.join('');
}

function base64Encode(bytes) {
    const alphabet = XOR_BASE64_ALPHABET;
    const padding = XOR_BASE64_PADDING;
    if (!bytes || bytes.length === 0) return '';

    const result = [];
    for (let i = 0; i < bytes.length;) {
        if (i + 3 <= bytes.length) {
            const chunk = bytes.slice(i, i + 3);
            const a = chunk[0];
            const b = chunk[1];
            const c = chunk[2];
            result.push(
                alphabet[(a >>> 2) & 63],
                alphabet[((a << 4) & 48) + ((b >>> 4) & 15)],
                alphabet[((b << 2) & 60) + ((c >>> 6) & 3)],
                alphabet[63 & c]
            );
            i += 3;
        } else {
            const chunk = bytes.slice(i);
            if (chunk.length === 1) {
                const a = chunk[0];
                result.push(alphabet[(a >>> 2) & 63], alphabet[(a << 4) & 48], padding, padding);
            } else {
                const a = chunk[0];
                const b = chunk[1];
                result.push(
                    alphabet[(a >>> 2) & 63],
                    alphabet[((a << 4) & 48) + ((b >>> 4) & 15)],
                    alphabet[(b << 2) & 60],
                    padding
                );
            }
            break;
        }
    }
    return result.join('');
}

function aesEncrypt(plaintext) {
    const textBytes = stringToBytes(plaintext);
    const keyAndIv = genKeyAndIV();
    const key64 = keyAndIv[0];
    const iv4 = keyAndIv[1];

    const crc32Str = genCrc32(textBytes);
    const crc32Bytes = stringToBytes(crc32Str);

    const padded = padToBlock(textBytes.concat(crc32Bytes));
    const blocks = splitToBlocks(padded);

    const output = iv4.slice();
    let feedback = key64;

    for (let i = 0; i < blocks.length; i++) {
        let processed = xors(applyRound(blocks[i]), key64);
        const shifted = shifts(processed, feedback);
        processed = xors(shifted, feedback);
        feedback = sboxSubstitute(sboxSubstitute(processed));
        copyToBytes(feedback, 0, output, 64 * i + 4, 64);
    }

    return base64EncodePrivate(output);
}

function aesEncryptBytes(plainBytes) {
    const keyAndIv = genKeyAndIV();
    const key64 = keyAndIv[0];
    const iv4 = keyAndIv[1];

    const padded = padToBlock(plainBytes);
    const blocks = splitToBlocks(padded);

    const output = iv4.slice();
    let feedback = key64;

    for (let i = 0; i < blocks.length; i++) {
        let processed = xors(applyRound(blocks[i]), key64);
        const shifted = shifts(processed, feedback);
        processed = xors(shifted, feedback);
        feedback = sboxSubstitute(sboxSubstitute(processed));
        copyToBytes(feedback, 0, output, 64 * i + 4, 64);
    }

    return base64EncodePrivate(output);
}

function _0xdda825(_0x156449, _0x40076d) {
    var _0x43c9ba = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"['split']('');
    var _0xbeb0e1 = [];
    var _0x49197a = void 0;
    _0x40076d = _0x40076d || _0x43c9ba['length'];
    if (_0x156449) {
        for (_0x49197a = 0; _0x49197a < _0x156449; _0x49197a++) {
            _0xbeb0e1[_0x49197a] = _0x43c9ba[0 | Math['random']() * _0x40076d];
        }
    } else {
        var _0x5ef589 = void 0;
        _0xbeb0e1[8] = _0xbeb0e1[13] = _0xbeb0e1[18] = _0xbeb0e1[23] = '-';
        _0xbeb0e1[14] = '4';
        for (_0x49197a = 0; _0x49197a < 36; _0x49197a++) {
            _0xbeb0e1[_0x49197a] || (_0x5ef589 = 0 | 16 * Math["random"](), _0xbeb0e1[_0x49197a] = _0x43c9ba[19 === _0x49197a ? 3 & _0x5ef589 | 8 : _0x5ef589]);
        }
    }
    return _0xbeb0e1['join']('');
}


function generateCb() {
    var _0x130db2 = {};
    _0x130db2['suffix'] = "q7nlp1";
    _0x130db2['code'] = '06xd5m';
    _0x130db2["pos"] = [19, 20, 21, 25, 26, 28];
    var _0x1dd9ec = _0x130db2 || {};
    var _0x27ea96 = _0x1dd9ec["code"];
    var _0x4d0018 = _0x1dd9ec["pos"];
    var _0x5681ec = _0xdda825(32);
    if (_0x27ea96 && _0x4d0018 && Array["isArray"](_0x4d0018)) {
        for (var _0x3e172e = _0x5681ec['split'](''), _0x58f679 = 0; _0x58f679 < _0x4d0018['length']; _0x58f679++) {
            _0x3e172e[_0x4d0018[_0x58f679]] = _0x27ea96['charAt'](_0x58f679);
        }
        _0x5681ec = _0x3e172e['join']('');
    }
    return aesEncrypt(_0x5681ec);
}

function xorEncode(key, value) {
    const valueBytes = stringToBytes(String(value));
    const keyBytes = stringToBytes(String(key));
    const xorBytes = xors(valueBytes, keyBytes);
    return base64Encode(xorBytes);
}

function unique2DArray(arr, index) {
    index = index === undefined ? 0 : index;
    if (!Array.isArray(arr)) return arr;
    const seen = {};
    const result = [];
    for (let i = 0; i < arr.length; i++) {
        const key = arr[i][index];
        if (key === null || key === undefined || seen[key]) continue;
        seen[key] = true;
        result.push(arr[i]);
    }
    return result;
}

function toArray(values) {
    return Array.isArray(values) ? values.slice() : Array.from(values);
}

function uniqueValues(values) {
    const result = [];
    for (let i = 0; i < values.length; i++) {
        if (result.indexOf(values[i]) === -1) {
            result.push(values[i]);
        }
    }
    return result;
}

function average(values) {
    let total = 0;
    for (let i = 0; i < values.length; i++) total += values[i];
    return total / values.length;
}

function stddev(values) {
    const mean = average(values);
    const squared = [];
    for (let i = 0; i < values.length; i++) {
        squared.push(Math.pow(values[i] - mean, 2));
    }
    let total = 0;
    for (let i = 0; i < squared.length; i++) {
        if (squared[i]) total += squared[i];
    }
    return Math.sqrt(total / values.length);
}

function round4(value) {
    return parseFloat(value.toFixed(4));
}

function percentile(values, p) {
    const sorted = values.slice().sort((a, b) => a - b);
    if (p <= 0) return sorted[0];
    if (p >= 100) return sorted[sorted.length - 1];
    const rank = (sorted.length - 1) * (p / 100);
    const low = Math.floor(rank);
    const left = sorted[low];
    const right = sorted[low + 1];
    return left + (right - left) * (rank - low);
}

function slope(xs, ys) {
    const dxs = [];
    const dys = [];
    for (let i = 0; i < xs.length - 1; i++) {
        dxs.push(xs[i + 1] - xs[i]);
        dys.push(ys[i + 1] - ys[i]);
    }
    const result = [];
    for (let i = 0; i < dys.length; i++) {
        result.push(dys[i] / dxs[i]);
    }
    return result;
}

function splitColumns(points) {
    const xs = [];
    const ys = [];
    const ts = [];
    if (!Array.isArray(points) || points.length <= 2) return [xs, ys, ts];
    for (let i = 0; i < points.length; i++) {
        xs.push(points[i][0]);
        ys.push(points[i][1]);
        ts.push(points[i][2]);
    }
    return [xs, ys, ts];
}

function speedSeries(xs, ys, ts) {
    const vx = slope(ts, xs);
    const vy = slope(ts, ys);
    const v = [];
    for (let i = 0; i < xs.length; i++) {
        v.push(Math.sqrt(Math.pow(xs[i], 2) + Math.pow(ys[i], 2)));
    }
    return [vx, vy, slope(ts, v)];
}

function accelSeries(vx, vy, vv, ts) {
    const baseTs = ts.slice(0, -1);
    return [slope(baseTs, vx), slope(baseTs, vy), slope(baseTs, vv)];
}

function buildAtomFeatures(atomPoints) {
    if (!Array.isArray(atomPoints) || atomPoints.length <= 2) return [];
    const [xs, ys, ts] = splitColumns(atomPoints);
    const [vx, vy, vv] = speedSeries(xs, ys, ts);
    const [ax, ay, av] = accelSeries(vx, vy, vv, ts);
    return [
        uniqueValues(xs).length,
        uniqueValues(ys).length,
        round4(average(ys)),
        round4(stddev(ys)),
        xs.length,
        round4(Math.min.apply(Math, toArray(vx))),
        round4(Math.max.apply(Math, toArray(vx))),
        round4(average(vx)),
        round4(stddev(vx)),
        uniqueValues(vx).length,
        round4(percentile(vx, 25)),
        round4(percentile(vx, 75)),
        round4(Math.min.apply(Math, toArray(vy))),
        round4(Math.max.apply(Math, toArray(vy))),
        round4(average(vy)),
        round4(stddev(vy)),
        uniqueValues(vy).length,
        round4(percentile(vy, 25)),
        round4(percentile(vy, 75)),
        round4(Math.min.apply(Math, toArray(vv))),
        round4(Math.max.apply(Math, toArray(vv))),
        round4(average(vv)),
        round4(stddev(vv)),
        uniqueValues(vv).length,
        round4(percentile(vv, 25)),
        round4(percentile(vv, 75)),
        round4(Math.min.apply(Math, toArray(ax))),
        round4(Math.max.apply(Math, toArray(ax))),
        round4(average(ax)),
        round4(stddev(ax)),
        uniqueValues(ax).length,
        round4(percentile(ax, 25)),
        round4(percentile(ax, 75)),
        round4(Math.min.apply(Math, toArray(ay))),
        round4(Math.max.apply(Math, toArray(ay))),
        round4(average(ay)),
        round4(stddev(ay)),
        uniqueValues(ay).length,
        round4(percentile(ay, 25)),
        round4(percentile(ay, 75)),
        round4(Math.min.apply(Math, toArray(av))),
        round4(Math.max.apply(Math, toArray(av))),
        round4(average(av)),
        round4(stddev(av)),
        uniqueValues(av).length,
        round4(percentile(av, 25)),
        round4(percentile(av, 75))
    ];
}

function samplePoints(arr, num) {
    if (arr.length <= num) return arr;
    const result = [];
    let pick = 0;
    for (let j = 0; j < arr.length; j++) {
        if (j >= pick * (arr.length - 1) / (num - 1)) {
            result.push(arr[j]);
            pick++;
        }
    }
    return result;
}

function encodeTrackData(token, tracePoints, atomPoints, targetPercent, mouseDownCounts) {
    const encodedPoints = tracePoints.map((point) => xorEncode(token, point.toString()));
    const sampled = samplePoints(encodedPoints, 50);
    const atomFeatures = buildAtomFeatures(unique2DArray(atomPoints, 2));
    const d = aesEncrypt(sampled.join(':'));
    const m = "";
    const p = aesEncrypt(xorEncode(token, String(targetPercent)));
    const f = aesEncrypt(xorEncode(token, atomFeatures.join(',')));
    const ext = aesEncrypt(xorEncode(token, mouseDownCounts + ',' + tracePoints.length));
    return JSON.stringify({ d, m, p, f, ext });
}

module.exports = { aesEncrypt, aesEncryptBytes, generateCb, xorEncode, encodeTrackData, buildAtomFeatures, unique2DArray, genCrc32, stringToBytes };

if (require.main === module) {
    process.stdout.write(generateCb());
}
