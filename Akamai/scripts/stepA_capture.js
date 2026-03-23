const fs = require('fs');

// ── 1. 静态计算 zPz() 常量 ──────────────────────────────────────────
const zPzResult = (function() {
    var Jb, R6, jO, Lh, L3, Sc, WL, PO, H3, HK, f0;
    Jb = !+[] + !+[] + !+[] + !+[];
    R6 = +!+[];
    jO = +!+[] + !+[] + !+[] + !+[] + !+[];
    Lh = [+!+[]] + [+[]] - +!+[];
    L3 = +[];
    Sc = [+!+[]] + [+[]] - [];
    WL = +!+[] + !+[] + !+[] + !+[] + !+[] + !+[] + !+[];
    PO = [+!+[]] + [+[]] - +!+[] - +!+[];
    H3 = !+[] + !+[];
    HK = +!+[] + !+[] + !+[] + !+[] + !+[] + !+[];
    f0 = +!+[] + !+[] + !+[];
    return { Jb, R6, jO, Lh, L3, Sc, WL, PO, H3, HK, f0 };
})();
console.log('zPz 常量:', zPzResult);

// ── 2. 静态计算基础常量 ──────────────────────────────────────────────
const VZ = 1, Mv = 2, xP = 3, gn = 4;
const QA = VZ * gn + xP - Mv;     // 5
const vA = xP - VZ + gn;           // 6
const GN = vA - Mv + VZ - xP + QA; // 7
const bZ = xP * VZ + QA;           // 8
const baseConstants = { VZ, Mv, xP, gn, QA, vA, GN, bZ };
console.log('基础常量:', baseConstants);

// ── 3. 提取并执行 x7b() / Ugb() ─────────────────────────────────────
const src = fs.readFileSync('/root/scrape/Akamai/source/original/test.js', 'utf8');

// x7b: 从文件中找到数组字面量
const x7bMatch = src.match(/function x7b\(\)\s*\{\s*var cKz = (\[[\s\S]*?\]);/);
const UgbMatch = src.match(/function Ugb\(\)\s*\{\s*var XPz = (\[[\s\S]*?\]);/);

let x7bArray = null, UgbArray = null;
if (x7bMatch) {
    x7bArray = JSON.parse(x7bMatch[1].replace(/'/g, '"'));
    console.log(`x7b() 数组长度: ${x7bArray.length}`);
} else {
    console.error('未找到 x7b() 数组');
}

if (UgbMatch) {
    UgbArray = JSON.parse(UgbMatch[1].replace(/'/g, '"'));
    console.log(`Ugb() 数组长度: ${UgbArray.length}`);
} else {
    console.error('未找到 Ugb() 数组');
}

// ── 4. 计算 tPz() 里所有 switch-case 标签 ───────────────────────────
const { Jb, R6, jO, Lh, L3, Sc, WL, PO, H3, HK, f0 } = zPzResult;
const ctx = { Jb, R6, jO, Lh, L3, Sc, WL, PO, H3, HK, f0 };

const tPzMatch = src.match(/function tPz\(\)\s*\{([\s\S]*?)\n    \}/);
const switchLabels = {};

if (tPzMatch) {
    // 把整个 tPz body 提取成可执行的 JS，变量绑定到 ctx
    const body = tPzMatch[1].trim().replace(/,$/, '');
    const varNames = Object.keys(ctx);
    const varVals = Object.values(ctx);
    try {
        // 执行 tPz body，捕获所有赋值结果
        const resultFn = new Function(...varNames, `
            var result = {};
            var _orig = {};
            // 拦截赋值
            ${body}
            return result;
        `);
        // 这种方式不行，改用逐行解析
    } catch(e) {}

    // 逐行解析
    const lines = tPzMatch[1].split('\n').filter(l => l.trim());
    const localCtx = { ...ctx };

    for (const line of lines) {
        const trimmed = line.trim().replace(/,\s*$/, '');
        // 匹配 "varName = expression"
        const eqIdx = trimmed.indexOf(' = ');
        if (eqIdx === -1) continue;
        const name = trimmed.slice(0, eqIdx).trim();
        const expr = trimmed.slice(eqIdx + 3).trim();

        try {
            const keys = Object.keys(localCtx);
            const vals = Object.values(localCtx);
            const val = new Function(...keys, `return (${expr})`)(... vals);
            switchLabels[name] = val;
            localCtx[name] = val;
        } catch(e) {
            // skip
        }
    }
    console.log(`tPz() 计算出 ${Object.keys(switchLabels).length} 个标签`);
}

// ── 5. 输出结果 ──────────────────────────────────────────────────────
const output = {
    baseConstants,
    zPzConstants: zPzResult,
    switchLabels,
    x7bArray,
    UgbArray,
    accessorFunctions: {
        Er: 'x7b',
        zG: 'x7b',
        d5: 'x7b',
        BX: 'x7b',
        AQb: 'Ugb',
        Scb: 'Ugb',
        Xcb: 'Ugb',
    }
};

fs.writeFileSync('/root/scrape/Akamai/scripts/constants.json', JSON.stringify(output, null, 2));
console.log('\n✓ 写入 scripts/constants.json');

// ── 6. 验证：用已知常量打印 x7b() 关键索引 ──────────────────────────
if (x7bArray) {
    console.log('\nx7b() 关键索引:');
    for (const [name, idx] of Object.entries(baseConstants)) {
        console.log(`  x7b()[${name}=${idx}] = '${x7bArray[idx]}'`);
    }
    // 额外打印 Js/Jp/cp 的位置
    console.log('\nx7b()[0..12]:');
    for (let i = 0; i <= 12; i++) {
        process.stdout.write(`  [${i}]='${x7bArray[i]}'`);
        if ((i + 1) % 4 === 0) console.log();
    }
    console.log();
}
