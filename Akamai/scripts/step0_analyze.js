const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const fs = require('fs');

const src = fs.readFileSync('/root/scrape/Akamai/source/original/test.js', 'utf8');
console.log(`文件大小: ${(src.length / 1024).toFixed(1)} KB`);
console.log(`总行数: ${src.split('\n').length}`);

let ast;
try {
    ast = parser.parse(src, { sourceType: 'script', errorRecovery: true });
} catch (e) {
    console.error('解析错误:', e.message);
    process.exit(1);
}

let nodeCount = 0;
let funcDecl = 0, funcExpr = 0, varDecl = 0;
let maxArraySize = 0, maxArrayLine = 0;
let calleeFreq = {};
let whileSwitchCount = 0, switchCaseTotal = 0;
let identPrefixes = {};
let singleCharIdents = 0, totalIdents = 0, totalIdentLen = 0;
let stringLiterals = 0, callExprCount = 0;
let unaryBangCount = 0;
let debuggerCount = 0;
let evalCount = 0;

traverse(ast, {
    enter(path) {
        nodeCount++;
    },
    FunctionDeclaration() { funcDecl++; },
    FunctionExpression() { funcExpr++; },
    VariableDeclaration() { varDecl++; },

    ArrayExpression(path) {
        const len = path.node.elements.length;
        if (len > maxArraySize) {
            maxArraySize = len;
            maxArrayLine = path.node.loc ? path.node.loc.start.line : 0;
        }
    },

    CallExpression(path) {
        callExprCount++;
        const callee = path.node.callee;
        let name = null;
        if (callee.type === 'Identifier') name = callee.name;
        else if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') {
            name = callee.property.name;
        }
        if (name) calleeFreq[name] = (calleeFreq[name] || 0) + 1;

        // eval / Function constructor
        if (callee.type === 'Identifier' && (callee.name === 'eval' || callee.name === 'Function')) evalCount++;
    },

    WhileStatement(path) {
        if (path.node.body && path.node.body.body) {
            const hasSw = path.node.body.body.some(s => s.type === 'SwitchStatement');
            if (hasSw) whileSwitchCount++;
        }
    },

    SwitchStatement(path) {
        switchCaseTotal += path.node.cases.length;
    },

    Identifier(path) {
        const name = path.node.name;
        totalIdents++;
        totalIdentLen += name.length;
        if (name.length === 1) singleCharIdents++;
        // prefix: first 2-3 chars
        const prefix = name.slice(0, 2);
        identPrefixes[prefix] = (identPrefixes[prefix] || 0) + 1;
    },

    StringLiteral() { stringLiterals++; },

    UnaryExpression(path) {
        if (path.node.operator === '!') unaryBangCount++;
    },

    DebuggerStatement() { debuggerCount++; },
});

// Top 5 callees
const top5callees = Object.entries(calleeFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([k, v]) => `  ${k}: ${v}次`)
    .join('\n');

// Top 3 ident prefixes
const top3prefixes = Object.entries(identPrefixes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `  "${k}": ${v} (${(v/totalIdents*100).toFixed(1)}%)`)
    .join('\n');

console.log(`\n=== AST 节点统计 ===`);
console.log(`总节点数: ${nodeCount}`);
console.log(`FunctionDeclaration: ${funcDecl}`);
console.log(`FunctionExpression: ${funcExpr}`);
console.log(`VariableDeclaration: ${varDecl}`);

console.log(`\n=== 字符串数组特征 ===`);
console.log(`最大 ArrayExpression 元素数: ${maxArraySize}  (行 ${maxArrayLine})`);
console.log(`StringLiteral 总数: ${stringLiterals}`);

console.log(`\n=== 控制流特征 ===`);
console.log(`while{switch} 结构数: ${whileSwitchCount}`);
console.log(`SwitchCase 总数: ${switchCaseTotal}`);

console.log(`\n=== 访问器函数候选（CallExpression callee 频次 Top 10）===`);
console.log(top5callees);

console.log(`\n=== 命名模式 ===`);
console.log(`标识符总数: ${totalIdents}`);
console.log(`单字符标识符: ${singleCharIdents} (${(singleCharIdents/totalIdents*100).toFixed(1)}%)`);
console.log(`平均标识符长度: ${(totalIdentLen/totalIdents).toFixed(2)}`);
console.log(`高频前缀 Top 5:\n${top3prefixes}`);

console.log(`\n=== 混淆强度 ===`);
console.log(`StringLiteral: ${stringLiterals}`);
console.log(`CallExpression 总数: ${callExprCount}`);
console.log(`! 运算符数量: ${unaryBangCount}`);
console.log(`debugger 语句: ${debuggerCount}`);
console.log(`eval/Function 调用: ${evalCount}`);
