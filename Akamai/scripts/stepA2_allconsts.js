/**
 * Step A2: 从源码中提取所有 "varName = arithmetic_expr" 形式的赋值，
 * 迭代求值，构建完整常量映射表。
 */
const fs = require('fs');
const src = fs.readFileSync('/root/scrape/Akamai/source/original/test.js', 'utf8');

// ── 初始已知常量 ─────────────────────────────────────────────────────
const known = {
    // zPz() 常量
    L3: 0, R6: 1, H3: 2, f0: 3, Jb: 4, jO: 5, HK: 6, WL: 7, PO: 8, Lh: 9, Sc: 10,
    // 基础常量
    VZ: 1, Mv: 2, xP: 3, gn: 4, QA: 5, vA: 6, GN: 7, bZ: 8,
    // 扩展常量
    Of: 9, Sj: 33, Oj: 10, Js: 35, Jp: 0, cp: 100, nr: 13, rm: 12, wr: 156,
};

// ── 扫描所有简单赋值 ─────────────────────────────────────────────────
// 匹配: "varName = expr," 或 "varName = expr;" 或 "varName = expr\n"
// expr 只含已知标识符、数字、运算符（+,-,*,/,%）
const assignments = [];
const assignRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*([^=;,{}\n\[\]()'"]+?)\s*[,;\n]/g;

let match;
while ((match = assignRe.exec(src)) !== null) {
    const name = match[1];
    const expr = match[2].trim();
    // 过滤: expr 只含合法符号（标识符、数字、+-*/ 空白）
    if (/^[\w\s\+\-\*\/\.]+$/.test(expr) && !/\bfunction\b/.test(expr)) {
        assignments.push({ name, expr });
    }
}

console.log(`扫描到 ${assignments.length} 个候选赋值`);

// ── 迭代求值 ─────────────────────────────────────────────────────────
let changed = true;
let rounds = 0;
while (changed && rounds < 100) {
    changed = false;
    rounds++;
    for (const { name, expr } of assignments) {
        if (name in known) continue; // 已知，跳过
        // 检查 expr 中所有标识符是否都已知
        const idents = [...expr.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map(m => m[0]);
        if (idents.every(id => id in known || /^\d+$/.test(id))) {
            try {
                const keys = Object.keys(known);
                const vals = Object.values(known);
                const val = new Function(...keys, `return (${expr})`)(...vals);
                if (typeof val === 'number' && isFinite(val)) {
                    known[name] = val;
                    changed = true;
                }
            } catch (e) {}
        }
    }
}

console.log(`迭代 ${rounds} 轮，解析出 ${Object.keys(known).length} 个常量`);

// ── 加载 x7b / Ugb 数组 ──────────────────────────────────────────────
const constants = JSON.parse(fs.readFileSync('/root/scrape/Akamai/scripts/constants.json', 'utf8'));
const x7bArray = constants.x7bArray;
const UgbArray = constants.UgbArray;

// ── 检查 250 个参数变量中能覆盖多少 ──────────────────────────────────
const targetArgs = ["10","18","192","223","31","7","A4","A8z","AS","Ak","Am","B4","BJ","BU","Bcb","Bd","Bqb","Bzb","CI","CN","DB","DS","DU","Df","Dr","Dw","EB","ELb","EN","F2","FS","FV","GC","GN","Gk","H1","H9","HB","HI","HJ","Hk","I7b","IC","IQb","IR","Id","Iv","Ix","J1","J2","Jp","Js","KDb","KU","Kd","Kk","Km","Kw","Kx","L2","L9","LC","LJ","LN","LU","Lm","Lw","M2","MF","MJ","Mv","Mzb","NC","NJ","NS","Nm","Nr","Nv","O5","OF","OU","Obb","Of","Oj","Ok","Ox","PU","Pm","Ptz","QA","QB","QC","QI","QJ","QOb","Qp","Qr","R1","R9","RE","RF","RP","Rd","Rt","Sf","Sgb","Sj","Szb","TA","TC","TLz","TM","Td","Tk","Tw","U2","U3z","U8","UDb","UHb","UNz","US","UTb","UZz","Uv","VI","VJ","VZ","Vt","WB","WF","WI","WQz","WS","WV","Ww","X4","X9","XI","XN","Xm","Xr","Y0b","Y4","YF","YJ","YU","Ym","Z1","ZB","ZF","Zk","Zx","b5","b6b","bC","bE","bI","bU","bZ","bm","c1","cJ","cS","cU","cp","cw","d7b","dC","dLb","dTb","dZ","dbb","dk","fOb","fX","fd","fr","g9","gN","gV","gZ","gn","gv","hF","hw","j0b","jU","jp","jx","km","kzb","l4","lB","m2","mC","mLb","mr","mv","nLb","nV","nbb","nr","p5","pC","pm","pw","q1","qA","qF","qR","qS","qV","qm","rS","rm","rn","rv","s9","t7b","t9","tF","tU","tj","vA","vHb","vI","vk","vl","vm","vt","w5","wB","wJ","wU","wd","wr","ws","xP","xk","xv","zI","zKb","zS","zU","zf","zk","zm","zqb","zt"];

let covered = 0, missing = [];
for (const arg of targetArgs) {
    if (/^\d+$/.test(arg) || arg in known) {
        covered++;
    } else {
        missing.push(arg);
    }
}
console.log(`\n250 个参数变量：覆盖 ${covered}，缺失 ${missing.length}`);
if (missing.length) {
    console.log('缺失:', missing.slice(0, 30).join(', '), missing.length > 30 ? '...' : '');
}

// ── 打印关键映射 ──────────────────────────────────────────────────────
console.log('\n部分变量→属性名映射:');
const sample = ['VZ','Mv','xP','gn','QA','vA','GN','bZ','Of','Sj','Oj','Js','Jp','cp','nr','rm'];
for (const v of sample) {
    if (v in known) {
        const idx = known[v];
        const prop = x7bArray[idx];
        console.log(`  ${v}=${idx} → '${prop}'`);
    }
}

// ── 保存扩展常量 ──────────────────────────────────────────────────────
constants.allConstants = known;
fs.writeFileSync('/root/scrape/Akamai/scripts/constants.json', JSON.stringify(constants, null, 2));
console.log('\n✓ 扩展常量已写入 constants.json');
