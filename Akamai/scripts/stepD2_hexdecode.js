/**
 * Step D2: 删除 StringLiteral 的 extra.raw，让 generator 用已解析值输出
 * 这样 \x6c\x65\x6e\x67\x74\x68 → 'length'
 *
 * 输入:  intermediate/test_stepD.js
 * 输出:  intermediate/test_stepD2.js
 */
const parser   = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t        = require('@babel/types');
const fs       = require('fs');

const src = fs.readFileSync('/root/scrape/Akamai/intermediate/test_stepD.js', 'utf8');
console.log(`解析 AST...`);
const ast = parser.parse(src, { sourceType: 'script', errorRecovery: true });

let count = 0;
traverse(ast, {
    StringLiteral(path) {
        if (path.node.extra) {
            delete path.node.extra;
            count++;
        }
    },
    NumericLiteral(path) {
        if (path.node.extra) {
            delete path.node.extra;
        }
    },
});

console.log(`删除 extra: ${count} 个 StringLiteral`);

const { code } = generate(ast, {
    compact: false,
    concise: false,
    comments: false,
    jsescOption: { minimal: true },
});

fs.writeFileSync('/root/scrape/Akamai/intermediate/test_stepD2.js', code);
const outSize = fs.statSync('/root/scrape/Akamai/intermediate/test_stepD2.js').size;
console.log(`✓ 输出: intermediate/test_stepD2.js (${(outSize/1024).toFixed(1)} KB)`);

// 验证
const sample = code.slice(code.indexOf('IJ = ['), code.indexOf('IJ = [') + 100);
console.log('\n验证 IJ 赋值:', sample);
