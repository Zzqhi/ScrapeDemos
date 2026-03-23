/**
 * Step B: AST 替换
 *   Er(X) / zG(X) / d5(X) / BX(X)  → x7b()[X] 的字符串字面量
 *   AQb(X) / Scb(X) / Xcb(X)        → Ugb()[X] 的字符串字面量
 *   数字字面量直接作参数时同样处理
 *   同时替换 Hp(x) → !x
 *
 * 输入:  source/original/test.js
 * 输出:  intermediate/test_stepB.js
 */
const parser  = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t        = require('@babel/types');
const fs       = require('fs');

const constants = JSON.parse(fs.readFileSync('/root/scrape/Akamai/scripts/constants.json', 'utf8'));
const allConst  = constants.allConstants;   // varName → number
const x7b       = constants.x7bArray;       // index → 2-char string
const Ugb       = constants.UgbArray;

// 访问器函数名 → 查找表
const X7B_FUNS = new Set(['Er', 'zG', 'd5', 'BX']);
const UGB_FUNS = new Set(['AQb', 'Scb', 'Xcb']);

// 解析参数：Identifier → number（查 allConst），NumericLiteral → number
function resolveArg(node) {
    if (t.isNumericLiteral(node)) return node.value;
    if (t.isIdentifier(node) && node.name in allConst) return allConst[node.name];
    return null;
}

const src = fs.readFileSync('/root/scrape/Akamai/source/original/test.js', 'utf8');
console.log('解析 AST...');
const ast = parser.parse(src, { sourceType: 'script', errorRecovery: true });
console.log('AST 解析完成，开始 traverse...');

let replacedAccessor = 0;
let replacedHp = 0;
let skipped = 0;

traverse(ast, {
    CallExpression(path) {
        const callee = path.node.callee;
        const args   = path.node.arguments;

        // ── 单参数访问器替换 ──────────────────────────────────────────
        if (t.isIdentifier(callee) && args.length === 1) {
            const fname = callee.name;

            if (X7B_FUNS.has(fname)) {
                const idx = resolveArg(args[0]);
                if (idx !== null && idx >= 0 && idx < x7b.length) {
                    path.replaceWith(t.stringLiteral(x7b[idx]));
                    replacedAccessor++;
                    return;
                } else {
                    skipped++;
                }
            }

            if (UGB_FUNS.has(fname)) {
                const idx = resolveArg(args[0]);
                if (idx !== null && idx >= 0 && idx < Ugb.length) {
                    path.replaceWith(t.stringLiteral(Ugb[idx]));
                    replacedAccessor++;
                    return;
                } else {
                    skipped++;
                }
            }

            // ── Hp(x) → !x ──────────────────────────────────────────
            if (fname === 'Hp') {
                const arg = args[0];
                path.replaceWith(t.unaryExpression('!', arg));
                replacedHp++;
                return;
            }
        }
    }
});

console.log(`✓ 访问器替换: ${replacedAccessor} 处`);
console.log(`✓ Hp 替换:    ${replacedHp} 处`);
console.log(`  跳过（参数未知）: ${skipped} 处`);

// ── 生成代码 ──────────────────────────────────────────────────────────
console.log('生成输出代码...');
const { code } = generate(ast, {
    compact: false,
    concise: false,
    comments: false,
    jsescOption: { minimal: true },
});

fs.mkdirSync('/root/scrape/Akamai/intermediate', { recursive: true });
fs.writeFileSync('/root/scrape/Akamai/intermediate/test_stepB.js', code);
const outSize = fs.statSync('/root/scrape/Akamai/intermediate/test_stepB.js').size;
console.log(`\n✓ 输出: intermediate/test_stepB.js (${(outSize/1024).toFixed(1)} KB)`);
