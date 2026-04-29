const parser = require('@babel/parser')
const traverse = require('@babel/traverse').default
const types = require('@babel/types')
const generator = require('@babel/generator').default
const fs = require('fs')
const { escape } = require('querystring')

const code = fs.readFileSync(__dirname + '/test.js', { encoding: 'utf-8' })
const ast = parser.parse(code)

traverse(ast, {
    SequenceExpression(path) {
        if (path.findParent(p => p.isLogicalExpression() || p.isConditionalExpression())) {
            return; // 这里的逗号表达式不能随便提出来
        }
        // 检查当前逗号表达式是否处于可以展开的位置（比如 ExpressionStatement）
        // 如果是在 if (a, b) 这种地方，展开逻辑会更复杂

        const expressions = path.node.expressions;
        const lastExpression = expressions[expressions.length - 1];
        const leadingExpressions = expressions.slice(0, -1);

        // 将前面的表达式依次提升到当前语句之前
        leadingExpressions.forEach(expr => {
            // 使用 getStatementParent 找到最近的语句节点，确保插入位置合法
            path.getStatementParent().insertBefore(types.expressionStatement(expr));
        });

        // 替换为最后一个
        path.replaceWith(lastExpression);
    }
});

// 变量声明格式化
traverse(ast, {
    VariableDeclaration(path) {
        let { node, scope } = path
        // 只处理多个声明项的情况
        if (node.declarations.length <= 1) return;

        const newDeclarations = node.declarations.map(declarator =>
            types.variableDeclaration(node.kind, [declarator])
        );

        path.replaceWithMultiple(newDeclarations);
    }
})

// 需要先进行控制流平坦化

/**
 * 深拷贝一个 AST 节点
 *
 * 用途：
 * 1. 做 replaceWith 时避免节点复用
 * 2. case 展开、常量替换时都需要复制节点
 */
function clone(node) {
    return types.cloneNode(node, true);
}

/**
 * 判断一个节点是否可以视作“常量表达式”
 *
 * 当前支持：
 * - 字面量：string / number / boolean / null / regexp
 * - undefined
 * - 无插值模板字符串
 * - 简单一元表达式：+ - ! ~ void
 * - 数组字面量（元素也必须是常量）
 * - 对象字面量（属性值也必须是常量，且不允许 computed）
 *
 * 用途：
 * - IIFE 常量参数下放
 * - 后续常量折叠的前置判断
 */
function isTrueLike(node) {
    if (types.isBooleanLiteral(node, { value: true })) return true;
    if (types.isNumericLiteral(node, { value: 1 })) return true;

    // !![]
    if (
        types.isUnaryExpression(node, { operator: "!" }) &&
        types.isUnaryExpression(node.argument, { operator: "!" }) &&
        types.isArrayExpression(node.argument.argument)
    ) {
        return true;
    }

    return false;
}

/**
 * 从初始化表达式中提取“调度数组”
 *
 * 当前支持两种形式：
 * 1. "1|0|2".split("|")
 * 2. [1, 0, 2]
 *
 * 返回：
 * - 成功：返回真实顺序数组
 * - 失败：返回 null
 *
 * 用途：
 * - 控制流平坦化还原
 */
function extractDispatchArray(init) {
    // "1|0|2".split("|")
    if (
        types.isCallExpression(init) &&
        types.isMemberExpression(init.callee) &&
        types.isStringLiteral(init.callee.object) &&
        types.isIdentifier(init.callee.property, { name: "split" }) &&
        init.arguments.length === 1 &&
        types.isStringLiteral(init.arguments[0])
    ) {
        return init.callee.object.value.split(init.arguments[0].value);
    }

    // [1,0,2]
    if (
        types.isArrayExpression(init) &&
        init.elements.every(
            (el) => types.isNumericLiteral(el) || types.isStringLiteral(el)
        )
    ) {
        return init.elements.map((el) => el.value);
    }

    return null;
}

/**
 * 从循环体中找到顶层 switch 和顶层 break
 *
 * 典型模式：
 * {
 *   switch (...) { ... }
 *   break;
 * }
 *
 * 返回：
 * - { switchNode, breakNode }
 * - 或 null
 *
 * 用途：
 * - while / for 控制流平坦化统一入口
 */
function getSwitchAndBreak(body) {
    if (!types.isBlockStatement(body)) return null;

    let switchNode = null;
    let breakNode = null;

    for (const stmt of body.body) {
        if (types.isSwitchStatement(stmt) && !switchNode) {
            switchNode = stmt;
            continue;
        }
        if (types.isBreakStatement(stmt)) {
            breakNode = stmt;
        }
    }

    if (!switchNode) return null;
    return { switchNode, breakNode };
}

/**
 * 解析 switch 的 discriminant
 *
 * 当前支持：
 * - arr[idx++]
 * - arr[idx]
 *
 * 返回：
 * {
 *   arrName: 调度数组变量名,
 *   indexName: 索引变量名,
 *   mode: "post++" | "pre++" | "plain"
 * }
 *
 * 用途：
 * - 建立 switch 与调度数组之间的关联
 */
function extractDiscriminantMeta(discriminant) {
    if (!types.isMemberExpression(discriminant) || !discriminant.computed) {
        return null;
    }

    if (!types.isIdentifier(discriminant.object)) return null;

    const arrName = discriminant.object.name;
    const prop = discriminant.property;

    if (
        types.isUpdateExpression(prop) &&
        prop.operator === "++" &&
        types.isIdentifier(prop.argument)
    ) {
        return {
            arrName,
            indexName: prop.argument.name,
            mode: prop.prefix ? "pre++" : "post++",
        };
    }

    if (types.isIdentifier(prop)) {
        return {
            arrName,
            indexName: prop.name,
            mode: "plain",
        };
    }

    return null;
}

/**
 * 将 switch.cases 构造成 Map
 *
 * 例如：
 * case 0: ... -> map.set(0, consequent)
 * case "1": ... -> map.set("1", consequent)
 *
 * 注意：
 * - default 暂时忽略
 * - 只处理 number/string 的 case test
 *
 * 用途：
 * - 根据调度数组顺序重组 case 代码
 */
function buildCaseMap(cases) {
    const map = new Map();

    for (const caseNode of cases) {
        if (!caseNode.test) continue;

        let key = null;
        if (types.isNumericLiteral(caseNode.test)) key = caseNode.test.value;
        else if (types.isStringLiteral(caseNode.test)) key = caseNode.test.value;
        else continue;

        map.set(key, caseNode.consequent.slice());
    }

    return map;
}

/**
 * 清理 case 末尾仅用于调度的 continue / break
 *
 * 这里只清理顶层 consequent 最后连续出现的 continue / break，
 * 不递归处理内部语句，避免误删内层循环的控制语句。
 *
 * 用途：
 * - 控制流平坦化还原后的 case 清洗
 */
function normalizeCaseBody(body) {
    const out = body.map((x) => clone(x));

    while (out.length > 0) {
        const last = out[out.length - 1];
        if (types.isContinueStatement(last) || types.isBreakStatement(last)) {
            out.pop();
            continue;
        }
        break;
    }

    return out;
}

/**
 * 根据调度数组顺序，将 caseMap 中的代码块按顺序展开
 *
 * 例如：
 * dispatchArray = [1, 0]
 * caseMap = { 0: [...], 1: [...] }
 *
 * 最终返回：
 * [...case1Body, ...case0Body]
 *
 * 用途：
 * - while/for switch 平坦化的核心重排逻辑
 */
function flattenCasesByDispatch(dispatchArray, caseMap) {
    let retBody = [];

    for (const step of dispatchArray) {
        if (!caseMap.has(step)) return null;
        const body = normalizeCaseBody(caseMap.get(step));
        retBody = retBody.concat(body);
    }

    return retBody;
}

/**
 * 从当前 scope 中找到调度数组变量的 binding，并提取初始化值
 *
 * 适用于：
 * - switch 里拿到的是 arr[idx++]
 * - arr 的定义不在 for.init 里，而是在外层作用域中
 *
 * 返回：
 * {
 *   dispatchArray,
 *   binding
 * }
 *
 * 用途：
 * - 控制流平坦化还原时兜底查找调度数组
 */
function resolveDispatchArray(scope, arrName) {
    const binding = scope.getBinding(arrName);
    if (!binding || !binding.path || !binding.path.isVariableDeclarator()) return null;

    const init = binding.path.node.init;
    const dispatchArray = extractDispatchArray(init);
    if (!dispatchArray) return null;

    return { dispatchArray, binding };
}
traverse(ast, {
    WhileStatement(path) {
        const { node, scope } = path;
        const { test, body } = node;

        if (!isTrueLike(test)) return;

        const result = getSwitchAndBreak(body);
        if (!result) return;

        const { switchNode } = result;
        const discrMeta = extractDiscriminantMeta(switchNode.discriminant);
        if (!discrMeta) return;

        const { arrName, indexName } = discrMeta;
        const resolved = resolveDispatchArray(scope, arrName);
        if (!resolved) return;

        const { dispatchArray } = resolved;
        const caseMap = buildCaseMap(switchNode.cases);
        if (!caseMap || caseMap.size === 0) return;

        const retBody = flattenCasesByDispatch(dispatchArray, caseMap);
        if (!retBody) return;

        path.replaceWithMultiple(retBody);
        // removeBindingIfSafe(scope, arrName);
        // removeBindingIfSafe(scope, indexName);
    },

    ForStatement(path) {
        const { node, scope } = path;
        const { init, body } = node;

        const result = getSwitchAndBreak(body);
        if (!result) return;

        const { switchNode } = result;
        const discrMeta = extractDiscriminantMeta(switchNode.discriminant);
        if (!discrMeta) return;

        const { arrName, indexName } = discrMeta;

        let dispatchArray = null;

        // 优先从 for.init 中提取调度数组
        if (types.isVariableDeclaration(init)) {
            for (const decl of init.declarations) {
                if (!types.isIdentifier(decl.id)) continue;
                if (decl.id.name === arrName) {
                    dispatchArray = extractDispatchArray(decl.init);
                    break;
                }
            }
        }

        // 如果 for.init 中没有，再从 binding 中找
        if (!dispatchArray) {
            const resolved = resolveDispatchArray(scope, arrName);
            if (!resolved) return;
            dispatchArray = resolved.dispatchArray;
        }

        if (!dispatchArray) return;

        const caseMap = buildCaseMap(switchNode.cases);
        if (!caseMap || caseMap.size === 0) return;

        const retBody = flattenCasesByDispatch(dispatchArray, caseMap);
        if (!retBody) return;

        path.replaceWithMultiple(retBody);
        // removeBindingIfSafe(scope, arrName);
        // removeBindingIfSafe(scope, indexName);
    },
})


// 声明常量替换
function isSimpleConstant(node) {
    if (
        types.isStringLiteral(node) ||
        types.isNumericLiteral(node) ||
        types.isBooleanLiteral(node) ||
        types.isNullLiteral(node)
    ) {
        return true;
    }

    if (types.isIdentifier(node, { name: "undefined" })) {
        return true;
    }

    if (types.isUnaryExpression(node)) {
        return ["+", "-", "!", "~", "void"].includes(node.operator) &&
            isSimpleConstant(node.argument);
    }

    return false;
}
traverse(ast, {
    VariableDeclarator(path) {
        const { id, init } = path.node;

        if (!types.isIdentifier(id)) return;
        if (!init) return;

        const binding = path.scope.getBinding(id.name);
        if (!binding || !binding.constant) return;

        // 这里只处理可直接内联的字面量
        if (!types.isLiteral(init)) return;

        const refs = [...binding.referencePaths];

        refs.forEach(ref => {
            if (ref.removed) return;
            if (!ref.parentPath) return;

            // 某些位置不能直接替换
            if (
                ref.parentPath.isObjectProperty({ key: ref.node }) && !ref.parent.computed
            ) {
                return;
            }

            ref.replaceWith(types.cloneNode(init));
        });
    }
})
traverse(ast, {
    AssignmentExpression(path) {
        let { node, scope } = path
        if (node.operator !== "=") return;
        if (!types.isIdentifier(node.left)) return;

        const name = node.left.name;
        const binding = scope.getBinding(name);
        if (!binding) return;

        let constantNode;
        if (binding.constant) {
            constantNode = types.cloneNode(node.right, true);
        } else {
            const decl = binding.path;
            if (!decl.isVariableDeclarator() || decl.node.init !== null) return;

            const violations = binding.constantViolations;
            if (violations.length !== 1) return;
            if (violations[0].node !== node) return;

            const right = path.get("right");
            if (!right.isStringLiteral() && !right.isNumericLiteral() && !right.isBooleanLiteral()) return;

            constantNode = types.cloneNode(node.right, true);
        }

        for (const refPath of binding.referencePaths.slice()) {
            if (!refPath.isReferencedIdentifier()) continue;
            if (refPath.removed) continue;
            refPath.replaceWith(types.cloneNode(constantNode, true));
        }
    }
});


//处理join调用

/**
 * 判断一个节点是否可以安全转成 join 用的字符串值
 *
 * 当前支持：
 * - StringLiteral
 * - NumericLiteral
 * - BooleanLiteral
 * - NullLiteral
 *
 * 注意：
 * - undefined / 空洞 在 join 里语义比较特殊，这里先不碰
 * - 复杂表达式一律不处理，避免误伤
 */
function getJoinableValue(node) {
    if (types.isStringLiteral(node)) return node.value;
    if (types.isNumericLiteral(node)) return String(node.value);
    if (types.isBooleanLiteral(node)) return String(node.value);
    if (types.isNullLiteral(node)) return "null";
    return null;
}

/**
 * 判断一个 MemberExpression 是否表示 .join 调用
 *
 * 支持：
 * - arr.join(...)
 * - arr["join"](...)
 */
function isJoinMemberExpression(node) {
    if (!types.isMemberExpression(node)) return false;

    // arr.join
    if (!node.computed && types.isIdentifier(node.property, { name: "join" })) {
        return true;
    }

    // arr["join"]
    if (node.computed && types.isStringLiteral(node.property, { value: "join" })) {
        return true;
    }

    return false;
}

/**
 * Pass:
 * 将常量数组上的 join 调用折叠成字符串字面量
 *
 * 例如：
 * ["a", "b"]["join"]("")   -> "ab"
 * ["a", "b"].join("-")     -> "a-b"
 *
 * 当前只处理：
 * - object 是 ArrayExpression
 * - 元素全是简单常量
 * - join 参数最多一个，且分隔符必须是简单常量字符串
 */
function foldConstantArrayJoin(ast) {
    traverse(ast, {
        CallExpression(path) {
            const { node } = path;
            const { callee, arguments: args } = node;

            if (!isJoinMemberExpression(callee)) return;
            if (!types.isArrayExpression(callee.object)) return;

            const arrNode = callee.object;

            // 只处理 0 或 1 个参数
            if (args.length > 1) return;

            let separator = ","; // join 默认分隔符
            if (args.length === 1) {
                const sep = args[0];

                if (types.isStringLiteral(sep)) {
                    separator = sep.value;
                } else if (types.isNumericLiteral(sep)) {
                    separator = String(sep.value);
                } else if (types.isBooleanLiteral(sep)) {
                    separator = String(sep.value);
                } else if (types.isNullLiteral(sep)) {
                    separator = "null";
                } else {
                    return;
                }
            }

            const parts = [];
            for (const el of arrNode.elements) {
                // 遇到空洞或者 spread，先不处理
                if (!el || types.isSpreadElement(el)) return;

                const value = getJoinableValue(el);
                if (value === null) return;

                parts.push(value);
            }

            const result = parts.join(separator);
            path.replaceWith(types.stringLiteral(result));
        }
    });
}

foldConstantArrayJoin(ast);

// traverse(ast, visitor)
const output = generator(ast, {
    jsescOption: { minimal: true }
}).code

fs.writeFileSync(__dirname + '/test.deob.js', output)