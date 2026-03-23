/**
 * Step D: 常量折叠 + 方括号→点号 + 死代码清理
 * 循环直到收敛
 *
 * 输入:  intermediate/test_stepB.js
 * 输出:  intermediate/test_stepD.js
 */
const parser   = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t        = require('@babel/types');
const fs       = require('fs');

// ── 加载常量映射 ──────────────────────────────────────────────────────
const constants = JSON.parse(fs.readFileSync('/root/scrape/Akamai/scripts/constants.json', 'utf8'));
const allConst  = constants.allConstants;

const src = fs.readFileSync('/root/scrape/Akamai/intermediate/test_stepB.js', 'utf8');
console.log(`输入: ${(src.length/1024).toFixed(1)} KB`);

console.log('解析 AST...');
let ast = parser.parse(src, { sourceType: 'script', errorRecovery: true });

// ── 判断节点是否有副作用 ──────────────────────────────────────────────
function hasSideEffects(node) {
    if (!node) return false;
    const safeTypes = ['Literal', 'StringLiteral', 'NumericLiteral', 'BooleanLiteral',
                       'NullLiteral', 'Identifier', 'MemberExpression', 'ArrayExpression',
                       'ObjectExpression', 'UnaryExpression', 'BinaryExpression',
                       'LogicalExpression', 'ConditionalExpression', 'TemplateLiteral'];
    return !safeTypes.includes(node.type);
}

// ── 合法标识符检查（方括号→点号用）─────────────────────────────────
const RESERVED = new Set(['break','case','catch','continue','debugger','default','delete',
    'do','else','finally','for','function','if','in','instanceof','new','return','switch',
    'this','throw','try','typeof','var','void','while','with','class','enum','export',
    'extends','import','super','implements','interface','let','package','private',
    'protected','public','static','yield']);
function isValidIdentifier(s) {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) && !RESERVED.has(s);
}

let totalChanged = 0;

function runPass(ast) {
    let passChanged = 0;

    traverse(ast, {
        // ── 1. 常量折叠 ───────────────────────────────────────────────
        'BinaryExpression|UnaryExpression|LogicalExpression|ConditionalExpression'(path) {
            // 跳过已是字面量的节点
            if (t.isLiteral(path.node)) return;
            try {
                const res = path.evaluate();
                if (res.confident) {
                    const val = res.value;
                    let newNode;
                    if (typeof val === 'boolean') newNode = t.booleanLiteral(val);
                    else if (typeof val === 'number' && isFinite(val)) newNode = t.numericLiteral(val);
                    else if (typeof val === 'string') newNode = t.stringLiteral(val);
                    else return;
                    path.replaceWith(newNode);
                    passChanged++;
                }
            } catch(e) {}
        },

        // ── 2. 已知变量内联（数字常量）──────────────────────────────
        Identifier(path) {
            // 只内联纯数字常量，且不在赋值左侧/声明中
            if (path.isLVal()) return;
            if (path.parentPath && (
                t.isVariableDeclarator(path.parent) && path.parent.id === path.node ||
                t.isFunctionDeclaration(path.parent) ||
                t.isFunctionExpression(path.parent) ||
                t.isObjectProperty(path.parent) && path.parent.key === path.node && !path.parent.computed ||
                t.isMemberExpression(path.parent) && path.parent.property === path.node && !path.parent.computed
            )) return;

            const name = path.node.name;
            if (name in allConst) {
                const val = allConst[name];
                if (typeof val === 'number' && isFinite(val) && Number.isInteger(val)) {
                    // 只内联在 BinaryExpression / UnaryExpression 的子节点里
                    // 或在 MemberExpression computed property 里
                    const parent = path.parent;
                    if (t.isBinaryExpression(parent) || t.isUnaryExpression(parent) ||
                        (t.isMemberExpression(parent) && parent.computed && parent.property === path.node)) {
                        path.replaceWith(t.numericLiteral(val));
                        passChanged++;
                    }
                }
            }
        },

        // ── 3. 方括号→点号 ────────────────────────────────────────────
        MemberExpression(path) {
            if (!path.node.computed) return;
            const prop = path.node.property;
            if (!t.isStringLiteral(prop)) return;
            const key = prop.value;
            if (isValidIdentifier(key)) {
                path.node.property = t.identifier(key);
                path.node.computed = false;
                passChanged++;
            }
        },

        // ── 4. 死代码：不可达 if 分支 ─────────────────────────────────
        IfStatement(path) {
            try {
                const res = path.get('test').evaluate();
                if (!res.confident) return;
                if (res.value) {
                    // 条件为真，保留 consequent
                    const cons = path.node.consequent;
                    if (t.isBlockStatement(cons)) {
                        path.replaceWithMultiple(cons.body);
                    } else {
                        path.replaceWith(cons);
                    }
                    passChanged++;
                } else {
                    // 条件为假，保留 alternate 或删除
                    const alt = path.node.alternate;
                    if (alt) {
                        if (t.isBlockStatement(alt)) {
                            path.replaceWithMultiple(alt.body);
                        } else {
                            path.replaceWith(alt);
                        }
                    } else {
                        path.remove();
                    }
                    passChanged++;
                }
            } catch(e) {}
        },

        // ── 5. 死代码：不可达三目 ─────────────────────────────────────
        ConditionalExpression(path) {
            try {
                const res = path.get('test').evaluate();
                if (!res.confident) return;
                path.replaceWith(res.value ? path.node.consequent : path.node.alternate);
                passChanged++;
            } catch(e) {}
        },

        // ── 6. 无用变量（引用数为0且无副作用）──────────────────────────
        VariableDeclarator(path) {
            const id = path.node.id;
            if (!t.isIdentifier(id)) return;
            const binding = path.scope.getBinding(id.name);
            if (!binding) return;
            if (binding.referenced) return;
            if (binding.constantViolations.length > 0) return;
            const init = path.node.init;
            if (init && hasSideEffects(init)) return;
            // 如果是唯一声明符，删整个声明；否则只删这个声明符
            const decl = path.parentPath;
            if (decl.node.declarations.length === 1) {
                decl.remove();
            } else {
                path.remove();
            }
            passChanged++;
        },

        // ── 7. 空语句清理 ─────────────────────────────────────────────
        EmptyStatement(path) {
            path.remove();
            passChanged++;
        },
    });

    return passChanged;
}

// ── 循环执行直到收敛 ──────────────────────────────────────────────────
let round = 0;
let changed = 1;
while (changed > 0 && round < 30) {
    round++;
    changed = runPass(ast);
    totalChanged += changed;
    console.log(`  第 ${round} 轮: ${changed} 处变更`);
    if (changed > 0) {
        // scope 刷新
        traverse(ast, { Program(path) { path.scope.crawl(); } });
    }
}

console.log(`\n总计 ${totalChanged} 处变更，共 ${round} 轮`);

// ── 输出 ──────────────────────────────────────────────────────────────
const { code } = generate(ast, {
    compact: false,
    concise: false,
    comments: false,
    jsescOption: { minimal: true },
});

fs.writeFileSync('/root/scrape/Akamai/intermediate/test_stepD.js', code);
const outSize = fs.statSync('/root/scrape/Akamai/intermediate/test_stepD.js').size;
const inSize  = src.length;
console.log(`\n✓ 输出: intermediate/test_stepD.js`);
console.log(`  输入: ${(inSize/1024).toFixed(1)} KB → 输出: ${(outSize/1024).toFixed(1)} KB (${((1-outSize/inSize)*100).toFixed(1)}% 缩减)`);
