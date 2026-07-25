/**
 * ============================================================================
 *  akamai 混淆还原 —— 单文件整合版 (main.js)
 *
 *  本文件将原 `ast-plugins` 包（utils + 全部插件）与 `main2.js` 驱动逻辑
 *  按依赖顺序整合到一个文件中，便于分发与维护。
 *
 *  相较原版做了两处「输出完全一致」的性能优化（实测 68s -> 44s，约快 35%）：
 *    1. restore-string：把整段程序的 eval(astCode) 从「每个 block/case 退出
 *       时执行」改为「遍历前只执行一次」。原实现对几千个语句块各 eval 一次
 *       约 477KB 的源码，是最大的浪费点（该插件 34s -> 4s）。
 *    2. clear-function-flower-instructions：当某个函数一次内联都没发生时，
 *       AST 未变动，scope.crawl() 是纯空操作，直接跳过，省去无谓的全树作用域重建。
 *
 *  说明：花指令插件中「每内联一个函数 crawl 一次」是保证正确性的必要操作
 *  （延迟到最后统一 crawl 会让后续函数读取到已失效的 referencePaths 而崩溃），
 *  实测已确认，故予以保留。
 *
 *  用法：node main.js [输入文件] [输出文件]
 * ============================================================================
 *
 *  注意：本文件刻意运行在非严格模式（不要添加 'use strict'）。
 *  restore-string / handle-special-control-flows 依赖「直接 eval 会把内部
 *  var/函数声明泄漏到外层作用域」这一非严格模式行为来动态加载解密函数，
 *  开启严格模式会导致 `ReferenceError: xxx is not defined`。
 * ============================================================================
 */

// ============================================================================
//  依赖
// ============================================================================
const fs = require('fs');
const path = require('path');
const types = require('@babel/types');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generator = require('@babel/generator').default;
const template = require('@babel/template').default;

// ============================================================================
//  通用工具 (原 src/utils/common-utils.js)
// ============================================================================

// 判断节点是否纯净（无副作用且可以安全删除）
// 包含：字面量、标识符、this、以及递归的基础一元表达式（如 -1, +1, !0, void 0）
const isPureNode = (node) => {
    if (types.isLiteral(node)) return true;
    if (types.isIdentifier(node)) return true;
    if (types.isThisExpression(node)) return true;

    // 一元表达式：操作符安全且参数纯净时整体纯净（例如 -43, !0, void 0, +1）
    if (types.isUnaryExpression(node)) {
        return ["-", "+", "!", "void", "typeof"].includes(node.operator) &&
            isPureNode(node.argument);
    }
    return false;
};

/**
 * 计算最终保存路径
 * @param {string} inputPath - 输入文件路径
 * @param {string|boolean|undefined} outputConfig - 输出配置（路径/true/undefined）
 * @returns {string} 最终保存路径
 */
function getSavePath(inputPath, outputConfig) {
    const fileName = path.basename(inputPath);
    const inputDir = path.dirname(inputPath);

    if (typeof outputConfig === 'string') {
        return path.resolve(outputConfig);
    } else if (outputConfig === true) {
        return inputPath;
    } else {
        const distDir = path.resolve(inputDir, 'dist');
        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, {recursive: true});
        }
        return path.resolve(distDir, fileName);
    }
}

/**
 * 保存文件（处理写入错误）
 * @param {string} savePath - 保存路径
 * @param {string} content - 要保存的内容
 */
function saveFile(savePath, content) {
    try {
        fs.writeFileSync(savePath, content, 'utf-8');
    } catch (error) {
        throw new Error(`文件保存失败：${error.message}（路径：${savePath}）`);
    }
}

// ============================================================================
//  执行引擎 (原 src/utils/babel-utils.js)
// ============================================================================

// ----------------------------- 日志控制工具 -----------------------------
const Logger = {
    originalLog: console.log,
    config: {
        tool: true,   // 是否打印工具自身的进度日志
        plugin: true  // 是否允许插件内部的 console.log 输出
    },
    init: function (userConfig) {
        this.config = {...this.config, ...userConfig};
        // 不允许插件打印时，劫持全局 console.log
        if (!this.config.plugin) {
            console.log = () => {
            };
        }
    },
    info: function (...args) {
        if (this.config.tool) {
            // 必须调用 originalLog，因为 console.log 可能已被劫持为空函数
            this.originalLog.apply(console, args);
        }
    },
    restore: function () {
        console.log = this.originalLog;
    }
};

/**
 * @typedef {Object} PluginItem
 * @property {string} name
 * @property {Object} visitor
 * @property {boolean} [needReparse]
 */

function runPlugin(ast, plugin, generatorOpts) {
    let currentAst = ast;

    /** @type {PluginItem[]} */
    const visitorQueue = Array.isArray(plugin.visitor)
        ? plugin.visitor
        : [{
            name: plugin.name,
            visitor: plugin.visitor,
            needReparse: plugin.needReparse
        }];

    for (const item of visitorQueue) {
        traverse(currentAst, item.visitor, null, {rootAst: currentAst});

        if (item.needReparse) {
            console.log(`[${item.name}] 触发重解析 AST...`);
            const code = generator(currentAst, generatorOpts).code;
            currentAst = parser.parse(code, generatorOpts);
        }
    }

    return currentAst;
}

/**
 * AST 迭代阶段（支持中间重解析 + 循环终止条件）
 */
function transformAstWithIteration(
    ast,
    pluginGroups,
    parserOpts = {},
    generatorOpts = {},
    terminateCondition
) {
    const defaultTerminate = (prevCode, currentCode) => prevCode === currentCode;
    const shouldTerminate = terminateCondition || defaultTerminate;

    let prevCode = generator(ast, parserOpts).code;
    let currentAst = ast;

    while (true) {
        for (const plugins of pluginGroups) {
            plugins.forEach((plugin) => {
                if (!plugin.name || !plugin.visitor) {
                    throw new Error(`插件格式错误`);
                }
                Logger.info(`[迭代中] 执行插件：${plugin.name}`);
                currentAst = runPlugin(currentAst, plugin, generatorOpts);
            });

            const codeAfterGroup = generator(currentAst, generatorOpts).code;
            currentAst = parser.parse(codeAfterGroup, parserOpts);
        }

        const currentCode = generator(currentAst, generatorOpts).code;
        if (shouldTerminate(prevCode, currentCode)) {
            Logger.info("迭代优化完成：代码长度稳定");
            break;
        }
        Logger.info(`迭代继续：代码长度从 ${prevCode.length} 变为 ${currentCode.length}`);
        prevCode = currentCode;
    }

    return currentAst;
}

/**
 * 接收代码字符串，返回解混淆后的代码
 */
function transformCodeWithStagedExecution(
    code,
    stages = [],
    parserOpts = {},
    generatorOpts = {},
    logConfig = {}
) {
    const finalParserOpts = {sourceType: "module", plugins: [], ...parserOpts};
    const finalGeneratorOpts = {compact: false, comments: false, jsescOption: {minimal: true}, ...generatorOpts};

    let currentAst = parser.parse(code, finalParserOpts);

    Logger.init(logConfig);
    Logger.info(`=== 开始执行插件 ===`);
    Logger.info(`共配置 ${stages.length} 个执行阶段\n`);

    try {
        stages.forEach((stage, stageIndex) => {
            const {type, plugins = [], terminateCondition} = stage;

            Logger.info(`--- 开始执行阶段 ${stageIndex + 1}（类型：${type}）---`);

            plugins.forEach((plugin) => {
                if (!plugin.name || !plugin.visitor) {
                    throw new Error(`插件格式错误`);
                }
            });

            if (type === 'once') {
                plugins.forEach((plugin, index) => {
                    Logger.info(`[${index + 1}/${plugins.length}] 执行插件：${plugin.name}`);
                    const startTime = Date.now();

                    currentAst = runPlugin(currentAst, plugin, finalGeneratorOpts);

                    Logger.info(`[${plugin.name}] 执行完成，耗时：${Date.now() - startTime}ms`);
                });

                const codeAfterStage = generator(currentAst, finalGeneratorOpts).code;
                currentAst = parser.parse(codeAfterStage, finalParserOpts);
                Logger.info(`--- 阶段 ${stageIndex + 1}（单次）执行完成（已重解析 AST）---\n`);
            } else if (type === 'iterate') {
                const pluginGroups = [[...plugins]];
                currentAst = transformAstWithIteration(
                    currentAst,
                    pluginGroups,
                    finalParserOpts,
                    finalGeneratorOpts,
                    terminateCondition
                );
                Logger.info(`--- 阶段 ${stageIndex + 1}（迭代）执行完成 ---`);
            }
        });
    } finally {
        Logger.restore();
    }

    return generator(currentAst, finalGeneratorOpts).code;
}

/**
 * 文件处理：读入 -> 解混淆 -> 保存
 */
function transformFileWithStagedExecution(filePath, stages, parserOpts, generatorOpts, outputPath, logConfig) {
    if (!fs.existsSync(filePath)) throw new Error(`文件不存在：${filePath}`);

    const inputCode = fs.readFileSync(filePath, 'utf-8');
    const finalCode = transformCodeWithStagedExecution(inputCode, stages, parserOpts, generatorOpts, logConfig);

    const savePath = getSavePath(filePath, outputPath);
    saveFile(savePath, finalCode);

    return finalCode;
}

// ============================================================================
//  通用插件 (common)
// ============================================================================

// -------- split-multi-variable：变量定义逗号赋值改单一赋值 --------
const splitMultiVariableDeclaration = {
    name: 'split-multi-variable',
    visitor: {
        VariableDeclaration(path) {
            const {parentPath, node} = path;
            if (parentPath.isFor()) return;
            const {declarations, kind} = node;
            if (declarations.length <= 1) return;

            const newNodes = declarations.map(varNode =>
                types.variableDeclaration(kind, [varNode])
            );
            path.replaceWithMultiple(newNodes);
        }
    }
};

// -------- standardize-statement-block：单行语句补全中括号 --------
const standardizeStatementBlock = {
    name: 'standardize-statement-block',
    visitor: {
        "ForStatement|WhileStatement|ForInStatement|ForOfStatement|DoWhileStatement"({node}) {
            if (!types.isBlockStatement(node.body)) {
                node.body = types.blockStatement([node.body]);
            }
        },
        IfStatement(path) {
            const consequent = path.get("consequent");
            const alternate = path.get("alternate");

            if (!consequent.isBlockStatement()) {
                consequent.replaceWith(types.blockStatement([consequent.node]));
            }
            if (alternate.node !== null && !alternate.isBlockStatement()) {
                alternate.replaceWith(types.blockStatement([alternate.node]));
            }
        }
    }
};

// -------- unify-member-expression：a.b -> a["b"] --------
const unifyMemberExpression = {
    name: 'unify-member-expression',
    visitor: {
        MemberExpression: {
            exit(path) {
                const {node} = path;
                if (types.isIdentifier(node.property) && node.computed === false) {
                    node.computed = true;
                    node.property = types.stringLiteral(node.property.name);
                }
            }
        }
    }
};

// -------- shift-for-init：提取 for 循环 init 节点到循环外 --------
const shiftForInit = {
    name: 'shift-for-init',
    visitor: {
        ForStatement(path) {
            const {node, scope} = path;
            const {init} = node;

            if (!init) {
                return;
            }

            // 场景1：init 是逗号表达式
            if (types.isSequenceExpression(init)) {
                const {expressions} = init;
                for (const expression of expressions) {
                    path.insertBefore(types.expressionStatement(expression));
                }
            }
            // 场景2：init 是变量声明
            else if (types.isVariableDeclaration(init)) {
                const {declarations, kind} = init;

                // 检测并解决命名冲突：把循环内变量重命名到父作用域唯一名
                for (const decl of declarations) {
                    if (types.isIdentifier(decl.id)) {
                        const name = decl.id.name;
                        const newId = scope.parent.generateUidIdentifier(name);
                        scope.rename(name, newId.name);
                    }
                }

                for (const varNode of declarations) {
                    const newDeclarationNode = types.variableDeclaration(kind, [varNode]);
                    path.insertBefore(newDeclarationNode);
                }
            }
            // 场景3：init 是赋值/逻辑/二进制/调用/三元/更新表达式
            else if (
                types.isAssignmentExpression(init) ||
                types.isLogicalExpression(init) ||
                types.isBinaryExpression(init) ||
                types.isCallExpression(init) ||
                types.isConditionalExpression(init) ||
                types.isUpdateExpression(init)
            ) {
                path.insertBefore(types.expressionStatement(init));
            }
            // 场景4：init 是标识符或字面量（无需处理）
            else if (types.isIdentifier(init) || types.isLiteral(init)) {
                // noop
            }
            // 其他未覆盖场景
            else {
                console.log('init还有其他情况:', path.toString());
                return;
            }

            node.init = null;
        }
    }
};

// -------- resolve-sequence-enhanced：逗号表达式拆分/简化 --------

/** 向上查找分裂上下文 */
function getSplitContext(path) {
    let curr = path;
    let parent = curr.parentPath;

    while (parent) {
        // 黑名单拦截（不安全上下文）
        if (parent.isLogicalExpression() && parent.get('right') === curr) return null;
        if (parent.isConditionalExpression() && (parent.get('consequent') === curr || parent.get('alternate') === curr)) return null;
        if (parent.isArrowFunctionExpression() && parent.get('body') === curr) return null;
        if ((parent.isIfStatement() || parent.isWhileStatement() || parent.isDoWhileStatement()) && parent.get('test') === curr) return null;
        if (parent.isForStatement() && parent.get('update') === curr) return null;

        // 白名单目标
        if (parent.isExpressionStatement()) return {statementPath: parent};

        if (parent.isVariableDeclarator() && parent.get('init') === curr) {
            const varDecl = parent.parentPath;
            if (varDecl.isVariableDeclaration() && (varDecl.parentPath.isBlockStatement() || varDecl.parentPath.isProgram())) {
                return {statementPath: varDecl};
            }
            return null;
        }

        if (parent.isReturnStatement() || parent.isThrowStatement()) return {statementPath: parent};

        if (parent.isStatement()) return null;

        curr = parent;
        parent = curr.parentPath;
    }
    return null;
}

const resolveSequenceExpression = {
    name: 'resolve-sequence-enhanced',
    visitor: {
        SequenceExpression: {
            exit(path) {
                const expressions = path.node.expressions;
                if (expressions.length < 2) return;

                // 策略1：纯净表达式直接简化  x = (1, 2, 3) -> x = 3
                const allPure = expressions.slice(0, -1).every(isPureNode);
                if (allPure) {
                    path.replaceWith(expressions[expressions.length - 1]);
                    return;
                }

                // 策略2：向上查找并拆分
                const context = getSplitContext(path);
                if (!context) return;

                const {statementPath} = context;
                const nodesToInsert = [];
                for (let i = 0; i < expressions.length - 1; i++) {
                    nodesToInsert.push(types.expressionStatement(expressions[i]));
                }
                statementPath.insertBefore(nodesToInsert);
                path.replaceWith(expressions[expressions.length - 1]);
            }
        }
    }
};

// -------- clear-function-flower-instructions：函数花指令还原 --------

function isSimplifiableFunction(path) {
    const {node} = path;

    if (!types.isFunctionDeclaration(node) && !types.isFunctionExpression(node) && !types.isArrowFunctionExpression(node)) {
        return false;
    }

    let statements = [];
    if (types.isBlockStatement(node.body)) {
        statements = node.body.body;
    } else if (types.isExpression(node.body)) {
        statements = [types.returnStatement(node.body)];
    } else {
        return false;
    }

    if (containsScopeSensitiveNodes(node.body)) return false;
    if (statements.length !== 1) return false;
    if (containsFunctionDefinition(node.body)) return false;

    const onlyStatement = statements[0];
    let expr = null;

    if (types.isReturnStatement(onlyStatement)) {
        expr = onlyStatement.argument;
    } else if (types.isExpressionStatement(onlyStatement)) {
        expr = onlyStatement.expression;
        if (types.isAssignmentExpression(expr) || types.isUpdateExpression(expr)) {
            return true;
        }
    } else {
        return false;
    }

    if (expr && isExpressionComplex(expr)) return false;
    return true;
}

function containsFunctionDefinition(node) {
    if (Array.isArray(node)) {
        for (const element of node) {
            if (containsFunctionDefinition(element)) return true;
        }
        return false;
    }
    if (typeof node !== 'object' || node === null) return false;
    if (types.isFunctionDeclaration(node) || types.isFunctionExpression(node) || types.isArrowFunctionExpression(node)) {
        return true;
    }
    for (const key in node) {
        if (node.hasOwnProperty(key)) {
            const child = node[key];
            if (typeof child === 'object' && child !== null && containsFunctionDefinition(child)) {
                return true;
            }
        }
    }
    return false;
}

function isExpressionComplex(expr, depth = 0, maxDepth = 2) {
    if (depth > maxDepth) return true;
    if (types.isConditionalExpression(expr)) {
        if (depth > 1) return true;
        return isExpressionComplex(expr.consequent, depth + 1) || isExpressionComplex(expr.alternate, depth + 1);
    }
    if (types.isObjectExpression(expr) && expr.properties.length > 1) return true;

    const complexTypeChecks = [
        types.isBinaryExpression, types.isUnaryExpression, types.isMemberExpression,
        types.isOptionalMemberExpression, types.isCallExpression, types.isNewExpression,
        types.isArrayExpression, types.isObjectExpression, types.isConditionalExpression,
        types.isSequenceExpression, types.isTemplateLiteral
    ];

    for (const checkType of complexTypeChecks) {
        if (checkType(expr)) {
            for (const key in expr) {
                if (expr.hasOwnProperty(key) && typeof expr[key] === 'object' && expr[key] !== null) {
                    if (isExpressionComplex(expr[key], depth + 1)) return true;
                }
            }
        }
    }
    return false;
}

function containsScopeSensitiveNodes(node) {
    if (Array.isArray(node)) {
        for (const element of node) {
            if (containsScopeSensitiveNodes(element)) return true;
        }
        return false;
    }
    if (typeof node !== 'object' || node === null) return false;
    if (types.isThisExpression(node) || types.isSuper(node) || (types.isIdentifier(node) && node.name === 'arguments')) {
        return true;
    }
    for (const key in node) {
        if (node.hasOwnProperty(key)) {
            const child = node[key];
            if (typeof child === 'object' && child !== null && containsScopeSensitiveNodes(child)) {
                return true;
            }
        }
    }
    return false;
}

function zipNodeArrays(arr1, arr2) {
    const array1 = Array.isArray(arr1) ? arr1 : [];
    const array2 = Array.isArray(arr2) ? arr2 : [];
    const maxLength = Math.max(array1.length, array2.length);
    const result = [];
    for (let i = 0; i < maxLength; i++) {
        const nodeFromArr1 = array1[i] || types.identifier('undefined');
        const nodeFromArr2 = array2[i] || types.identifier('undefined');
        result.push([nodeFromArr1, nodeFromArr2]);
    }
    return result;
}

function safeCopyPath(originalPath) {
    const clonedNode = types.cloneNode(originalPath.node, true);
    const tempAst = parser.parse('');
    const tempParent = types.blockStatement([]);
    tempAst.program.body = [tempParent];

    let clonedPath;
    traverse(tempAst, {
        BlockStatement(path) {
            path.pushContainer('body', clonedNode);
            clonedPath = path.get('body')[0];
            path.stop();
        }
    });
    return clonedPath;
}

function inlineFunction(parentPath, funcPath, referLength) {
    const clonedPath = safeCopyPath(funcPath);
    let argumentList = parentPath.node.arguments;
    let {params} = clonedPath.node;
    let body_0 = clonedPath.get('body.body.0');
    let funcBody;

    if (types.isReturnStatement(body_0)) {
        funcBody = body_0.get('argument');
    } else if (types.isExpressionStatement(body_0) && types.isAssignmentExpression(body_0.get('expression'))) {
        funcBody = body_0;
    } else {
        return referLength;
    }

    let referList = [];
    for (let param of params) {
        let tmp = [];
        let paramBinding = funcBody.scope.getBinding(param.name);
        if (!paramBinding || !paramBinding.constant) {
            return referLength;
        }
        for (let refer of paramBinding.referencePaths) {
            tmp.push(refer);
        }
        referList.push(tmp);
    }
    let zipParams = zipNodeArrays(argumentList, referList);
    for (let map of zipParams) {
        for (let refer of map[1]) {
            refer.replaceWith(map[0]);
        }
    }

    parentPath.replaceWith(funcBody);
    return referLength - 1;
}

function processFunctionPath(funcPath) {
    if (!isSimplifiableFunction(funcPath)) return;

    let {node, parentPath} = funcPath;
    let funcName;
    let binding;

    if (funcPath.isFunctionDeclaration()) {
        funcName = node.id?.name;
        parentPath = funcPath;
    } else if (funcPath.isFunctionExpression()) {
        funcName = parentPath.node.id?.name;
        parentPath = parentPath.parentPath;
    }
    binding = funcPath.scope.parent.getBinding(funcName);
    if (!funcName || !binding || !binding.constant) return;

    const {referencePaths} = binding;
    let referLength = referencePaths.length;
    if (referLength === 0) {
        funcPath.remove();
        return;
    }

    // 倒序处理引用（避免修改 AST 后影响后续路径）
    const startLen = referLength;
    for (const refer of [...referencePaths].reverse()) {
        const callExpr = refer.parentPath;
        if (!callExpr.isCallExpression() || callExpr.get('callee').node.name !== funcName) continue;
        referLength = inlineFunction(callExpr, funcPath, referLength);
    }

    // [优化] 没有任何内联发生时 AST 未变动，scope.crawl() 是纯空操作，直接跳过
    if (referLength === startLen) {
        return;
    }

    // 重构作用域，多往外一层（每内联一个函数都 crawl 是保证正确性的必要操作）
    parentPath.parentPath.scope.crawl();
    if (referLength === 0) {
        parentPath.remove();
    }
}

const clearFlowerInstructions = {
    name: 'clear-function-flower-instructions',
    visitor: {
        FunctionDeclaration(path) {
            processFunctionPath(path);
        },
        FunctionExpression(path) {
            if (!path.parentPath.isVariableDeclarator()) return;
            processFunctionPath(path);
        }
    }
};

// -------- remove-dead-code：移除各种无用代码 --------

// 删除执行后无意义的节点
const removeNonExecutableNodes = {
    name: 'remove-non-executable-nodes',
    visitor: {
        "SequenceExpression"(path) {
            let expressionPaths = path.get('expressions');
            for (let expressPath of expressionPaths.slice(0, -1)) {
                if (expressPath.isIdentifier() || expressPath.isLiteral()) {
                    expressPath.remove();
                }
            }
        },
        "ExpressionStatement"(path) {
            let expressPath = path.get('expression');
            if (expressPath.isIdentifier() || expressPath.isLiteral()) {
                expressPath.remove();
            }
        },
        "EmptyStatement|DebuggerStatement"(path) {
            path.remove();
        },
    }
};

// 删除永不执行的代码（return 等之后的代码）
const removeDeadCodeOfEndNode = {
    name: 'remove-deadCode-of-endNode',
    visitor: {
        "ContinueStatement|BreakStatement|ReturnStatement|ThrowStatement"(path) {
            let AllNextSiblings = path.getAllNextSiblings();
            for (let nextSibling of AllNextSiblings) {
                if (nextSibling.isFunctionDeclaration() || nextSibling.isVariableDeclaration({kind: "var"})) {
                    continue; // 变量提升
                }
                nextSibling.remove();
            }
        },
    }
};

// 围绕逻辑表达式的垃圾代码
const removeDeadCodeOfLogicalExpression = {
    name: 'remove-deadCode-of-logicalExpression',
    visitor: {
        "LogicalExpression"(path) {
            let {parentPath, node} = path;
            let {left, operator, right} = node;

            // 1. 处理左侧
            let leftPath = path.get('left');
            const evaluateLeft = leftPath.evaluateTruthy();
            if ((operator === "||" && evaluateLeft === true) ||
                (operator === "&&" && evaluateLeft === false)) {
                path.replaceWith(left);
                return;
            }
            if (types.isLiteral(left)) {
                if (operator === "||" && !left.value) {
                    path.replaceWith(right);
                    return;
                }
                if (operator === "&&" && !left.value) {
                    path.replaceWith(left);
                    return;
                }
            }

            // 2. ExpressionStatement 特殊优化（语句级，不关心返回值）
            if (parentPath.isExpressionStatement({"expression": node})) {
                if (types.isLiteral(right) || types.isIdentifier(right)) {
                    path.replaceWith(left);
                    return;
                }
            }

            // 3. 处理右侧（危险区）
            if (types.isLiteral(right)) {
                if (types.isNullLiteral(right)) {
                    return; // x || null / x && null 保留原样
                }
                if (types.isBooleanLiteral(right)) {
                    if ((operator === "||" && !right.value) ||
                        (operator === "&&" && right.value)) {
                        path.replaceWith(left);
                    }
                }
            }
        },
    },
};

// 变量定义与赋值语句无引用时删除（涉及 scope，需重新解析）
const removeDeadCodeOfIdentifier = {
    name: 'remove-deadCode-of-Identifier',
    visitor: {
        "VariableDeclarator"(path) {
            let {node, scope, parentPath, parent} = path;
            let ancestryPath = parentPath.parentPath;

            if (ancestryPath.isForOfStatement({left: parent}) ||
                ancestryPath.isForInStatement({left: parent})) {
                return;
            }

            let {id, init} = node;
            if (!types.isIdentifier(id) || types.isCallExpression(init) ||
                types.isAssignmentExpression(init)) {
                return;
            }

            let binding = scope.getBinding(id.name);
            if (!binding) return;

            let {referenced, constant, constantViolations} = binding;
            if (referenced || constantViolations.length > 1) {
                return;
            }
            if (constant || constantViolations[0] === path) {
                path.remove();
            }
        },
        AssignmentExpression(path) {
            let {scope, node, parentPath} = path;
            let {left, operator, right} = node;

            if (!types.isIdentifier(left) || operator !== "=") {
                return;
            }
            if (types.isAssignmentExpression(right) || types.isCallExpression(right)) {
                return;
            }

            let binding = scope.getBinding(left.name);
            if (!binding || binding.referenced) {
                return;
            }

            let {constantViolations} = binding;
            if (constantViolations.length === 1 && constantViolations[0] === path) {
                if (parentPath.isExpressionStatement() || parentPath.isSequenceExpression()) {
                    path.remove();
                }
            }
        }
    },
    needReparse: true
};

// 简化 IfStatement 和 ConditionalExpression，消除死代码
const removeDeadCodeOfConditional = {
    name: 'remove-deadCode-of-Conditional',
    visitor: {
        IfStatement(path) {
            const consequent = path.get("consequent");
            const alternate = path.get("alternate");
            const test = path.get("test");
            const evaluateTest = test.evaluateTruthy();

            // 标准化块语句
            if (!consequent.isBlockStatement()) {
                consequent.replaceWith(types.blockStatement([consequent.node]));
            }
            if (alternate.node !== null && !alternate.isBlockStatement()) {
                alternate.replaceWith(types.blockStatement([alternate.node]));
            }

            // 真值分支为空
            if (consequent.node.body.length === 0) {
                if (alternate.node === null) {
                    path.replaceWith(test.node);
                } else {
                    consequent.replaceWith(alternate.node);
                    alternate.remove();
                    path.node.alternate = null;
                    test.replaceWith(types.unaryExpression("!", test.node, true));
                }
                return;
            }

            // 假值分支为空
            if (alternate.isBlockStatement() && alternate.node.body.length === 0) {
                alternate.remove();
                path.node.alternate = null;
            }

            // 布尔条件优化
            if (evaluateTest === true) {
                path.replaceWithMultiple(consequent.node.body);
            } else if (evaluateTest === false) {
                alternate.node === null ? path.remove() : path.replaceWithMultiple(alternate.node.body);
            }
        },
        ConditionalExpression(path) {
            let {test, consequent, alternate} = path.node;
            let testPath = path.get('test');
            let evaluateTest = testPath.evaluateTruthy();

            if (testPath.isAssignmentExpression()) {
                evaluateTest = testPath.get('right').evaluateTruthy();
            }
            if (evaluateTest === undefined) {
                return;
            }
            if (testPath.isIdentifier() || testPath.isLiteral()) {
                if (evaluateTest === true) {
                    path.replaceWith(consequent);
                } else {
                    path.replaceWith(alternate);
                }
                return;
            }

            let SequenceNode = null;
            if (evaluateTest === true) {
                SequenceNode = types.sequenceExpression([test, consequent]);
            } else {
                SequenceNode = types.sequenceExpression([test, alternate]);
            }
            path.replaceWith(SequenceNode);
        }
    },
    needReparse: true
};

// 删除没有被调用的函数定义
const removeDeadFunctionDeclaration = {
    name: 'remove-dead-function-declaration',
    visitor: {
        FunctionDeclaration(path) {
            let {parentPath, node} = path;
            if (parentPath.isProgram()) {
                return; // 全局函数不处理
            }

            let binding = parentPath.scope.getBinding(node.id.name);
            if (!binding) return;

            let isReferenced = false;
            for (let referPath of binding.referencePaths) {
                if (!path.isAncestor(referPath)) {
                    isReferenced = true;
                    break;
                }
            }
            if (!isReferenced) {
                console.log(path.toString());
                path.remove();
            }
        }
    },
    needReparse: true
};

// 死代码移除预设集合
const removeAllDeadCode = {
    name: 'remove-all-dead-code',
    visitor: [
        removeNonExecutableNodes,
        removeDeadCodeOfEndNode,
        removeDeadCodeOfLogicalExpression,
        removeDeadCodeOfIdentifier,
        removeDeadCodeOfConditional,
        removeDeadFunctionDeclaration
    ]
};

// ============================================================================
//  私有插件 (private.akamai)
// ============================================================================

// -------- bypass-format-check：格式化检测绕过 --------
const bypassFormatCheck = {
    name: "bypass-format-check",
    visitor: {
        FunctionExpression(path) {
            let {node, scope} = path;
            let {id} = node;
            if (!id || id.name.length !== 10) return;
            let binding = scope.getBinding(id.name);
            let {constant, referencePaths} = binding;
            if (!constant || referencePaths.length !== 1) {
                throw new Error("函数(id.name.length === 10)引用只能为1!");
            }
            let expressPath = referencePaths[0].getStatementParent();
            // 在引用前插入该函数的 toString 方法
            expressPath.insertBefore(types.expressionStatement(types.assignmentExpression(
                "=",
                types.memberExpression(id, types.identifier("toString"), false),
                types.functionExpression(
                    types.identifier("toString"),
                    [],
                    types.blockStatement([
                        types.returnStatement(
                            types.stringLiteral(generator(node, {compact: true}).code),
                        ),
                    ]),
                ),
            )));
            path.stop();
        }
    }
};

// -------- clear-jsfuck：JSFuck 清理（常量折叠） --------
const clearJsFuck = {
    name: "clear-jsfuck",
    visitor: {
        "BinaryExpression|UnaryExpression|MemberExpression"(path) {
            const {node} = path;

            // 策略1：Babel 自带静态求值
            const {confident, value} = path.evaluate();
            if (confident) {
                if (["number", "string", "boolean"].includes(typeof value) || value === null) {
                    const newNode = types.valueToNode(value);
                    if (newNode) {
                        console.log(`[Clear-JSFuck] Evaluated: ${path.toString()}  ===>  ${value}`);
                        path.replaceWith(newNode);
                        path.skip();
                        return;
                    }
                }
                if (value === undefined) {
                    path.replaceWith(types.identifier("undefined"));
                    path.skip();
                    return;
                }
            }

            // 策略2：手动处理 [][[]] -> undefined
            if (types.isMemberExpression(node)) {
                const {object, property, computed} = node;
                if (
                    computed &&
                    types.isArrayExpression(object) && object.elements.length === 0 &&
                    types.isArrayExpression(property) && property.elements.length === 0
                ) {
                    console.log(`[Clear-JSFuck] Manual replace: [][[]] ===> undefined`);
                    path.replaceWith(types.identifier("undefined"));
                    path.skip();
                }
            }
        }
    }
};

// -------- replace-number-loop：常量计算与传播（循环至稳定） --------
const replaceNumberLoop = {
    name: "replace-number-loop",
    visitor: {
        Program(path) {
            let changed = true;
            let loopCount = 0;
            const MAX_LOOPS = 100;

            while (changed && loopCount < MAX_LOOPS) {
                changed = false;
                loopCount++;

                path.traverse({
                    // 1. 常量计算
                    "BinaryExpression|UnaryExpression|MemberExpression|CallExpression"(subPath) {
                        const {confident, value} = subPath.evaluate();
                        if (confident && typeof value === 'number' && Number.isFinite(value)) {
                            subPath.replaceWith(types.valueToNode(value));
                            subPath.skip();
                            changed = true;
                        }
                    },
                    // 2. 常量传播（a = 1）
                    AssignmentExpression(subPath) {
                        const {node, scope} = subPath;
                        const {left, right, operator} = node;

                        if (operator !== "=" || !types.isIdentifier(left) || !types.isNumericLiteral(right)) {
                            return;
                        }

                        const name = left.name;
                        const binding = scope.getBinding(name);
                        if (!binding) return;

                        const targetValue = right.value;
                        let isSafeToReplace = true;

                        if (binding.path.isVariableDeclarator()) {
                            const init = binding.path.node.init;
                            if (init && (!types.isNumericLiteral(init) || init.value !== targetValue)) {
                                isSafeToReplace = false;
                            }
                        }

                        if (isSafeToReplace && !binding.constant) {
                            for (const violation of binding.constantViolations) {
                                if (!violation.isAssignmentExpression() ||
                                    violation.node.operator !== '=' ||
                                    !types.isNumericLiteral(violation.node.right) ||
                                    violation.node.right.value !== targetValue) {
                                    isSafeToReplace = false;
                                    break;
                                }
                            }
                        }

                        if (isSafeToReplace) {
                            binding.referencePaths.forEach(refPath => {
                                if (!refPath.isNumericLiteral()) {
                                    refPath.replaceWith(types.valueToNode(targetValue));
                                    changed = true;
                                }
                            });

                            if (subPath.parentPath.isExpressionStatement()) {
                                subPath.remove();
                                changed = true;
                            } else {
                                subPath.replaceWith(types.valueToNode(targetValue));
                                changed = true;
                            }
                        }
                    }
                });
            }

            if (loopCount > 1) {
                console.log(`[replace-number] Finished in ${loopCount} loops.`);
            }
        }
    }
};

// -------- remove-brace-in-case：去掉 switch case 中的大括号 --------
const removeBraceInCase = {
    name: "remove-brace-in-case",
    visitor: {
        SwitchCase(path) {
            let {node} = path;
            if (node.consequent.length > 0 && types.isBlockStatement(node.consequent[0])) {
                const blockBody = node.consequent[0].body;
                node.consequent.splice(0, 1, ...blockBody);
            }
        }
    }
};

// -------- flatten-control-flow / handle-special-control-flows：控制流平坦化还原 --------

const flattenControlFlowVisitor = {
    SwitchStatement(path) {
        let {node} = path;
        let {discriminant, cases} = node;
        if (!types.isIdentifier(discriminant)) {
            return;
        }
        let discriminantName = discriminant.name;
        let functionPath = path.getFunctionParent();
        let {id, params} = functionPath.node;
        if (params[0].name !== discriminantName) {
            return;
        }
        let functionName = id.name;
        let varName;
        if (functionPath.parentPath.isVariableDeclarator()) {
            varName = functionPath.parentPath.node.id.name;
        }
        let switchIndexArray = [];
        let caseObj = {};

        for (let curCase of cases) {
            let {test, consequent} = curCase;
            if (!types.isNumericLiteral(test)) {
                return;
            }
            let curValue = test.value;
            let dumpValue = null;
            for (let index in consequent) {
                let _consequent = consequent[index];
                if (!types.isExpressionStatement(_consequent) || !types.isAssignmentExpression(_consequent.expression)) {
                    continue;
                }
                let {left, operator, right} = _consequent.expression;
                if (!types.isIdentifier(left, {name: discriminantName})) {
                    continue;
                }
                if (!types.isNumericLiteral(right)) {
                    console.log('右边不是数字!', generator(_consequent).code);
                    return;
                }
                if (operator === '=') {
                    dumpValue = right.value;
                    consequent.splice(index, 1);
                    break;
                } else if (operator === '+=' || operator === '-=') {
                    dumpValue = eval(`${curValue}
                    ${operator.slice(0, 1)}
                    ${right.value}`);
                    consequent.splice(index, 1);
                    break;
                } else {
                    console.log('还有其他运算符!', generator(_consequent).code);
                    return;
                }
            }
            if (types.isBreakStatement(consequent[consequent.length - 1])) {
                consequent = consequent.slice(0, consequent.length - 1);
            }
            caseObj[curValue] = [consequent, dumpValue];
        }

        function makeNewFunction(referencePath, index, newFunctionName) {
            referencePath.replaceWith(types.identifier(newFunctionName));
            if (switchIndexArray.includes(index)) {
                return;
            }
            switchIndexArray.push(index);
            let newStatements = caseObj[index][0];
            let nextIndex = caseObj[index][1];
            while (nextIndex !== null) {
                if (!caseObj[nextIndex]) {
                    break;
                }
                newStatements.push(...caseObj[nextIndex][0]);
                nextIndex = caseObj[nextIndex][1];
            }
            let functionDeclaration = types.functionDeclaration(types.identifier(newFunctionName), params, types.blockStatement(newStatements));
            if (functionPath.parentPath.isVariableDeclarator()) {
                functionPath.parentPath.parentPath.insertBefore(functionDeclaration);
            } else {
                functionPath.insertBefore(functionDeclaration);
            }
        }

        function getIndex(callName) {
            let binding = functionPath.scope.getBinding(callName);
            if (!binding) {
                return;
            }
            let {referencePaths} = binding;
            for (let referencePath of referencePaths) {
                let parentPath = referencePath.parentPath;
                if (parentPath.type === 'CallExpression') {
                    let {arguments: args} = parentPath.node;
                    if (args.length !== 2 || !types.isNumericLiteral(args[0])) {
                        console.log('调用结构异常!', parentPath.toString());
                        return;
                    }
                    makeNewFunction(referencePath, args[0].value, `${functionName}_${args[0].value}`);
                } else if (parentPath.type === 'MemberExpression') {
                    let propertyName = parentPath.node.property.value;
                    parentPath = parentPath.parentPath;
                    let {arguments: args} = parentPath.node;
                    if (propertyName === 'apply') {
                        if (args.length !== 2 || !types.isArrayExpression(args[1])) {
                            console.log('调用结构异常!', parentPath.toString());
                            return;
                        }
                        let element0 = args[1].elements[0];
                        if (!types.isNumericLiteral(element0)) {
                            console.log('调用结构异常!', parentPath.toString());
                            return;
                        }
                        makeNewFunction(referencePath, element0.value, `${functionName}_${element0.value}`);
                    } else if (propertyName === 'call') {
                        if (args.length < 2 || !types.isNumericLiteral(args[1])) {
                            console.log('调用结构异常!', parentPath.toString());
                            return;
                        }
                        makeNewFunction(referencePath, args[1].value, `${functionName}_${args[1].value}`);
                    } else {
                        console.log('成员表达式还有其他类型!', parentPath.toString());
                        return;
                    }
                }
            }
        }

        getIndex(functionName);
        varName ? getIndex(varName) : 0;
        varName ? functionPath.parentPath.remove() : functionPath.remove();
    }
};

const handleSpecialControlFlowsVisitor = {
    SwitchStatement(path, state) {
        const ast = state.rootAst;
        let {node} = path;
        let {discriminant, cases} = node;
        if (!types.isBinaryExpression(discriminant)) {
            return;
        }
        let {left, operator, right} = discriminant;
        if (operator !== '+') {
            return;
        }
        let leftName = left.name;
        let rightName = right.name;
        let functionPath = path.getFunctionParent();
        let {id, params} = functionPath.node;
        if (params[0].name !== rightName) {
            console.log('rightName不匹配!');
            return;
        }
        let functionName = id.name;
        let varName;
        if (types.isVariableDeclarator(functionPath.parentPath)) {
            varName = functionPath.parentPath.node.id.name;
        }
        let statement = path.parentPath.parentPath;
        if (!types.isForStatement(statement) && !types.isWhileStatement(statement) && !types.isDoWhileStatement(statement)) {
            return;
        }
        let allPrevSiblings = statement.getAllPrevSiblings();
        let old_args = allPrevSiblings[0].node.expression.arguments;
        allPrevSiblings[0].node.expression.arguments = [types.numericLiteral(1)];
        if (allPrevSiblings[1].node.declarations[0].id.name !== leftName) {
            console.log('leftName不匹配!');
        }
        let switch_code = `${allPrevSiblings[2].toString()}\n${allPrevSiblings[1].toString()}`;

        // 主动报错以寻找依赖函数
        let dependencyGuard = 0;
        while (dependencyGuard++ < 100) {
            try {
                new Function(switch_code + `  ${allPrevSiblings[0].toString()}`)();
                break;
            } catch (e) {
                const regex = /ReferenceError: ([$_a-zA-Z0-9]+) is not defined/;
                const match = regex.exec(e.stack);
                if (match && match[1]) {
                    const func_name = match[1];
                    traverse(ast, {
                        FunctionDeclaration(_path) {
                            if (_path.node.id.name === func_name) {
                                _path.traverse({
                                    CallExpression(__path) {
                                        if (__path.toString().includes('push') || __path.toString().includes('pop')) {
                                            __path.remove();
                                        }
                                    }
                                });
                                switch_code = `${_path.toString()}\n` + switch_code;
                            }
                        }
                    });
                } else {
                    return;
                }
            }
        }
        if (dependencyGuard >= 100) return;
        allPrevSiblings[0].node.expression.arguments = old_args;
        let stopNumber = statement.node.test.right.value;
        let switchIndexArray = [];
        let caseObj = {};

        for (let curCase of cases) {
            let {test, consequent} = curCase;
            if (!types.isNumericLiteral(test)) {
                return;
            }
            let curValue = test.value;
            let dumpValue = null;
            for (let index in consequent) {
                let _consequent = consequent[index];
                if (!types.isExpressionStatement(_consequent) || !types.isAssignmentExpression(_consequent.expression)) {
                    continue;
                }
                let {left, operator, right} = _consequent.expression;
                if (!types.isIdentifier(left, {name: rightName})) {
                    continue;
                }
                if (!types.isNumericLiteral(right)) {
                    console.log('右边不是数字!', generator(_consequent).code);
                    return;
                }
                if (operator === '=') {
                    dumpValue = right.value;
                    consequent.splice(index, 1);
                    break;
                } else if (operator === '+=' || operator === '-=') {
                    dumpValue = `${operator.slice(0, 1)}${right.value}`;
                    consequent.splice(index, 1);
                    break;
                } else {
                    console.log('还有其他运算符!', generator(_consequent).code);
                    return;
                }
            }
            if (types.isBreakStatement(consequent[consequent.length - 1])) {
                consequent = consequent.slice(0, consequent.length - 1);
            }
            caseObj[curValue] = [consequent, dumpValue];
        }

        function makeNewFunction(referencePath, index, newFunctionName) {
            referencePath.replaceWith(types.identifier(newFunctionName));
            if (switchIndexArray.includes(index)) {
                return;
            }
            switchIndexArray.push(index);

            let _arguments = allPrevSiblings[0].node.expression.arguments;
            if (_arguments.length !== 1) {
                参数异常;
            }
            if (types.isIdentifier(_arguments[0])) {
                allPrevSiblings[0].node.expression.arguments = [types.numericLiteral(index)];
            } else if (types.isBinaryExpression(_arguments[0])) {
                if (!types.isNumericLiteral(_arguments[0].right)) {
                    BinaryExpression结构异常;
                }
                _arguments[0].left = types.numericLiteral(index);
                allPrevSiblings[0].node.expression.arguments = _arguments;
            }
            eval(switch_code + `  ${allPrevSiblings[0].toString()}`);
            allPrevSiblings[0].node.expression.arguments = _arguments;
            let new_index = index;
            let newStatements;
            let isDoWhileFirst = false;
            while (true) {
                if (types.isDoWhileStatement(statement) && !isDoWhileFirst) {
                    isDoWhileFirst = true;
                } else {
                    let first_cal_result = eval(`${leftName} + ${new_index}`);
                    if (first_cal_result === stopNumber) {
                        break;
                    }
                }
                let second_cal_result = eval(`${leftName} + ${new_index}`);
                if (!caseObj[second_cal_result]) {
                    break;
                }
                newStatements ? newStatements.push(...caseObj[second_cal_result][0]) : newStatements = caseObj[second_cal_result][0];
                let nextCalIndex = caseObj[second_cal_result][1];
                if (nextCalIndex === null) {
                    break;
                }
                new_index = eval(`${new_index}
                ${nextCalIndex}`);
            }
            let functionDeclaration = types.functionDeclaration(types.identifier(newFunctionName), params, types.blockStatement(newStatements));
            if (types.isVariableDeclarator(functionPath.parentPath)) {
                functionPath.parentPath.parentPath.insertBefore(functionDeclaration);
            } else {
                functionPath.insertBefore(functionDeclaration);
            }
        }

        function getIndex(callName) {
            let binding = functionPath.scope.getBinding(callName);
            if (!binding) {
                return;
            }
            for (let referencePath of binding.referencePaths) {
                let parentPath = referencePath.parentPath;
                if (parentPath.type === 'CallExpression') {
                    let {arguments: args} = parentPath.node;
                    if (args.length !== 2 || !types.isNumericLiteral(args[0])) {
                        console.log('调用结构异常!', parentPath.toString());
                        return;
                    }
                    makeNewFunction(referencePath, args[0].value, `${functionName}_${args[0].value}`);
                } else if (parentPath.type === 'MemberExpression') {
                    let propertyName = parentPath.node.property.value;
                    parentPath = parentPath.parentPath;
                    let {arguments: args} = parentPath.node;
                    if (propertyName === 'apply') {
                        if (args.length !== 2 || !types.isArrayExpression(args[1])) {
                            console.log('调用结构异常!', parentPath.toString());
                            return;
                        }
                        let element0 = args[1].elements[0];
                        if (!types.isNumericLiteral(element0)) {
                            console.log('调用结构异常!', parentPath.toString());
                            return;
                        }
                        makeNewFunction(referencePath, element0.value, `${functionName}_${element0.value}`);
                    } else if (propertyName === 'call') {
                        if (args.length < 2 || !types.isNumericLiteral(args[1])) {
                            console.log('调用结构异常!', parentPath.toString());
                            return;
                        }
                        makeNewFunction(referencePath, args[1].value, `${functionName}_${args[1].value}`);
                    } else {
                        console.log('成员表达式还有其他类型!', parentPath.toString());
                        return;
                    }
                }
            }
        }

        getIndex(functionName);
        varName ? getIndex(varName) : 0;
        varName ? functionPath.parentPath.remove() : functionPath.remove();
    }
};

const flattenControlFlow = {
    name: "flatten-control-flow",
    visitor: flattenControlFlowVisitor,
    needReparse: true
};

const handleSpecialControlFlows = {
    name: "handle-special-control-flows",
    visitor: handleSpecialControlFlowsVisitor,
    needReparse: true
};

// -------- restore-string：字符串解密还原 --------
const restoreString = {
    name: "restore-string",
    visitor: {
        Program(path) {
           
            const ast = path.node;
            globalThis.window = globalThis;
            let newlyAddedList = [];

            function findLen10(nextSibling, find_10) {
                nextSibling.traverse({
                    FunctionExpression(_path) {
                        let {node} = _path;
                        let {id} = node;
                        if (id?.name.length === 10) {
                            console.log('找到函数名长度为10的函数 ===> ', id.name);
                            find_10 = true;
                            _path.stop();
                        }
                    }
                });
                return find_10;
            }

            function makeRunFunc(stackName) {
                return types.expressionStatement(types.assignmentExpression("=", types.memberExpression(types.identifier("global"), types.identifier("runFunc"), false), types.functionExpression(null, [
                    types.identifier("code"),
                    types.identifier("num"),
                ], types.blockStatement([
                    types.expressionStatement(
                        types.assignmentExpression(
                            "=",
                            types.identifier(stackName),
                            types.arrayExpression([
                                types.identifier("num"),
                            ])
                        )
                    ),
                    types.returnStatement(
                        types.callExpression(
                            types.identifier("eval"),
                            [
                                types.identifier("code"),
                            ],
                        ),
                    ),
                ]),),));
            }

            function getStaticMemberKey(memberExpression) {
                if (!types.isMemberExpression(memberExpression)) return null;
                let {property, computed} = memberExpression;
                if (types.isStringLiteral(property) || types.isNumericLiteral(property)) return String(property.value);
                if (!computed && types.isIdentifier(property)) return property.name;
                return null;
            }

            function findDynamicStackName(ast) {
                const scoreMap = new Map();

                function score(name, key, value) {
                    if (!name) return;
                    if (!scoreMap.has(name)) scoreMap.set(name, {push: 0, pop: 0, numericPush: 0});
                    scoreMap.get(name)[key] += value;
                }

                traverse(ast, {
                    CallExpression(path) {
                        let {callee, arguments: args} = path.node;
                        if (!types.isMemberExpression(callee) || !types.isIdentifier(callee.object)) return;
                        let methodName = getStaticMemberKey(callee);
                        if (methodName === "push") {
                            score(callee.object.name, "push", 1);
                            if (args.length === 1 && types.isNumericLiteral(args[0])) {
                                score(callee.object.name, "numericPush", 1);
                            }
                        } else if (methodName === "pop") {
                            score(callee.object.name, "pop", 1);
                        }
                    }
                });

                let bestName;
                let bestScore = -1;
                for (let [name, stat] of scoreMap) {
                    let currentScore = stat.numericPush * 4 + stat.push + stat.pop;
                    if (stat.numericPush > 0 && stat.pop > 0 && currentScore > bestScore) {
                        bestScore = currentScore;
                        bestName = name;
                    }
                }
                return bestName;
            }

            function insertRunFuncBeforeRootReturn(ast, stackName) {
                let inserted = false;

                function isBusinessBootstrapStatement(statementPath) {
                    if (!statementPath.isExpressionStatement()) return false;
                    let expression = statementPath.node.expression;
                    if (!types.isAssignmentExpression(expression) || !types.isIdentifier(expression.left)) return false;
                    if (!types.isCallExpression(expression.right) || !types.isFunctionExpression(expression.right.callee)) return false;
                    return expression.right.arguments.some(arg =>
                        types.isArrayExpression(arg)
                        && arg.elements.some(item => types.isFunctionExpression(item) || types.isArrowFunctionExpression(item))
                    );
                }

                traverse(ast, {
                    FunctionDeclaration(path) {
                        if (inserted) return;
                        let bodyPaths = path.get("body.body");
                        for (let bodyPath of bodyPaths) {
                            if (!isBusinessBootstrapStatement(bodyPath)) continue;
                            bodyPath.insertBefore(makeRunFunc(stackName));
                            newlyAddedList.push(bodyPath.getPrevSibling());
                            bodyPath.insertBefore(types.returnStatement());
                            newlyAddedList.push(bodyPath.getPrevSibling());
                            inserted = true;
                            break;
                        }
                        if (inserted) path.stop();
                    }
                });
                if (inserted) return true;

                traverse(ast, {
                    FunctionExpression(path) {
                        if (inserted) return;
                        if (!types.isCallExpression(path.parent) || !types.isExpressionStatement(path.parentPath.parent)) return;
                        let bodyPaths = path.get("body.body");
                        for (let bodyPath of bodyPaths) {
                            if (!bodyPath.isReturnStatement() || !types.isCallExpression(bodyPath.node.argument)) continue;
                            bodyPath.insertBefore(makeRunFunc(stackName));
                            newlyAddedList.push(bodyPath.getPrevSibling());
                            inserted = true;
                            break;
                        }
                        if (inserted) path.stop();
                    }
                });
                return inserted;
            }

            let sjs_se_global_subkey_name;
            let find_10 = false;
            let sjsPath;
            const find_sjs_se_global_subkey = {
                AssignmentExpression(path) {
                    
                    if (!path.toString().includes('sjs_se_global_subkey') || path.toString().includes('toString')) {
                        return;
                    }
                    
                    sjs_se_global_subkey_name = path.node.left.name;
                    console.log('获取sjs_se_global_subkey ===> ', sjs_se_global_subkey_name);

                    sjsPath = path.find(_path => types.isExpressionStatement(_path));
                    let allNextSiblings = sjsPath.getAllNextSiblings();

                    for (let nextSibling of allNextSiblings) {
                        find_10 = findLen10(nextSibling, find_10);
                        if (find_10) {
                            nextSibling.insertAfter(types.returnStatement());
                            newlyAddedList.push(nextSibling.getNextSibling());
                            let runFunc = types.expressionStatement(types.assignmentExpression("=", types.memberExpression(types.identifier("global"), types.identifier("runFunc"), false), types.functionExpression(null, [
                                types.identifier("code"),
                                types.identifier("num"),
                            ], types.blockStatement([
                                types.expressionStatement(
                                    types.assignmentExpression(
                                        "=",
                                        types.identifier(sjs_se_global_subkey_name),
                                        types.arrayExpression([
                                            types.identifier("num"),
                                        ])
                                    )
                                ),
                                types.returnStatement(
                                    types.callExpression(
                                        types.identifier("eval"),
                                        [
                                            types.identifier("code"),
                                        ],
                                    ),
                                ),
                            ]),),));
                            nextSibling.insertAfter(runFunc);
                            newlyAddedList.push(nextSibling.getNextSibling());
                            break;
                        }
                    }
                    if (!find_10) {
                        console.log('未找到函数名长度为10的函数!');
                    }
                    path.stop();
                }
            };

            const findNumberList = {
                "AssignmentExpression": {
                    enter(path) {
                        let {node, parentPath} = path;
                        let {left, right} = node;
                        if (
                            !types.isIdentifier(left)
                            || !types.isCallExpression(right)
                            || right.arguments.length !== 2
                            || !types.isNumericLiteral(right.arguments[0])
                            || !types.isArrayExpression(right.arguments[1])
                            || !types.isArrayExpression(right.arguments[1].elements[0])
                        ) {
                            return;
                        }
                        let nitian = types.expressionStatement(types.assignmentExpression('=', types.memberExpression(types.identifier('global'), types.identifier('nitian' + left.name)), types.identifier(left.name)));
                        parentPath.insertAfter(nitian);
                        newlyAddedList.push(parentPath.getNextSibling());
                    }
                }
            };

            const restoreNumberList = {
                "AssignmentExpression": {
                    enter(path) {
                        let {node, parentPath} = path;
                        let {left, right} = node;
                        if (
                            !types.isIdentifier(left)
                            || !types.isCallExpression(right)
                            || right.arguments.length !== 2
                            || !types.isNumericLiteral(right.arguments[0])
                            || !types.isArrayExpression(right.arguments[1])
                            || !types.isArrayExpression(right.arguments[1].elements[0])
                        ) {
                            return;
                        }
                        let binding = parentPath.scope.getBinding(left.name);
                        if (!binding || binding.constantViolations.length !== 1) {
                            console.log('[restore-string] number-array binding invalid');
                            process.exit();
                        }
                        for (let refer of binding.referencePaths) {
                            let referParent = refer.parentPath;
                            let result = eval("global.nitian" + referParent.toString());
                            console.log(referParent.toString(), ' ===> ', result);
                            referParent.replaceWith(types.valueToNode(result));
                        }
                    }
                }
            };

            function collectDecodeFunc(ast) {
                const decodeFuncList = [];
                traverse(ast, {
                    FunctionDeclaration(path) {
                        let {node, scope} = path;
                        let {id, params, body} = node;
                        let funcName = id.name;
                        body = body.body;
                        if (params.length !== 0 || !types.isVariableDeclaration(body[0]) ||
                            !types.isExpressionStatement(body[1]) || !types.isReturnStatement(body[2])) {
                            return;
                        }
                        if (body[0].declarations[0].id?.name !== body[2].argument?.name) {
                            return;
                        }
                        let declaration = body[0].declarations[0];
                        // 数组则将调用位置还原 dM(1) ==> 'Yb'
                        if (types.isArrayExpression(declaration.init) && declaration.init.elements.length !== 0) {
                            let declaration = body[0].declarations[0];
                            if (!types.isArrayExpression(declaration.init) || declaration.init.elements.length === 0) {
                                return;
                            }
                            let binding = scope.getBinding(funcName);
                            if (binding.constantViolations.length !== 1) {
                                console.log('数组还原存在异常!');
                                return;
                            }
                            let strArray = declaration.init.elements;
                            for (let referencePath of binding.referencePaths) {
                                let referPParent = referencePath.parentPath.parentPath;
                                if (referPParent.type !== 'MemberExpression') {
                                    continue;
                                }
                                let result = strArray[referPParent.node.property.value];
                                referPParent.replaceWith(result);
                            }
                            return;
                        }

                        decodeFuncList.push(funcName);
                        let decodeFunc = types.expressionStatement(types.assignmentExpression("=", types.memberExpression(types.identifier("global"), id, false,), declaration.id,));
                        let bod0yPath = path.get('body.body')[0];
                        bod0yPath.insertAfter(decodeFunc);
                        newlyAddedList.push(bod0yPath.getNextSibling());
                    }
                });
                return decodeFuncList;
            }

            let specialName;
            const handleSpecial = {
                FunctionDeclaration(path) {
                    let {node, scope} = path;
                    let {id, params, body} = node;
                    body = body.body;
                    if (params.length !== 0 || body.length !== 2 || !path.toString().includes('typeof window')) {
                        return;
                    }
                    let objName = body[0].expression.left;
                    if (!types.isIdentifier(objName)) {
                        return;
                    }
                    specialName = objName.name;
                    let decodeObj = types.expressionStatement(types.assignmentExpression("=", types.memberExpression(types.identifier("global"), objName, false,), objName));
                    let bod0yPath = path.get('body.body')[0];
                    bod0yPath.insertAfter(decodeObj);
                    newlyAddedList.push(bod0yPath.getNextSibling());

                    path.traverse({
                        AssignmentExpression(_path) {
                            let {left, right} = _path.node;
                            if (right?.name !== 'window') {
                                return;
                            }
                            let windowName = left.name;
                            let binding = scope.getBinding(windowName);
                            for (let refer of binding.referencePaths) {
                                if (!types.isMemberExpression(refer.parentPath)) {
                                    continue;
                                }
                                if (refer.parentPath.node.property.value === 'window') {
                                    refer.parentPath.replaceWith(types.identifier('window'));
                                } else {
                                    refer.replaceWith(types.identifier('window'));
                                }
                            }
                            path.stop();
                        }
                    });
                }
            };

            const restoreSpecial = {
                CallExpression(path) {
                    let {node} = path;
                    let {callee} = node;
                    if (!types.isMemberExpression(callee)) {
                        return;
                    }
                    let {object, property} = callee;
                    if (!types.isIdentifier(object, {name: specialName}) || !types.isStringLiteral(property)) {
                        return;
                    }
                    let result = eval(path.toString());
                    console.log(path.toString(), ' ===> ', result);
                    path.replaceWith(types.valueToNode(result));
                }
            };

            let directFuncNames = [];
            let needNumberFuncNames = [];
            let directObjectNames = [];

            function haveDecodeFunc(node) {
                if (types.isConditionalExpression(node)) {
                    return containsDecodeFunc(node.consequent) || containsDecodeFunc(node.alternate);
                }
            }

            function containsDecodeFunc(node) {
                if (!node) return false;
                if (types.isIdentifier(node)) {
                    return decodeFuncNames.includes(node.name);
                }
                if (types.isCallExpression(node)) {
                    return containsDecodeFunc(node.callee);
                }
                if (types.isMemberExpression(node)) {
                    return containsDecodeFunc(node.object);
                }
                return false;
            }

            function collectDirectDecoderObjects(ast) {
                const counter = new Map();
                traverse(ast, {
                    AssignmentExpression(path) {
                        let {left, right, operator} = path.node;
                        if (operator !== "=" || !types.isMemberExpression(left) || !types.isIdentifier(left.object)) return;
                        if (!types.isFunctionExpression(right) && !types.isCallExpression(right) && !types.isConditionalExpression(right)) return;
                        let name = left.object.name;
                        counter.set(name, (counter.get(name) || 0) + 1);
                    }
                });
                return [...counter.entries()].filter(([, count]) => count >= 5).map(([name]) => name);
            }

            function isDirectObjectDecodeCall(callee) {
                return types.isMemberExpression(callee)
                    && types.isIdentifier(callee.object)
                    && directObjectNames.includes(callee.object.name)
                    && types.isStringLiteral(callee.property);
            }

            function isDirectObjectDecodeCallApply(callee) {
                if (!types.isMemberExpression(callee) || !types.isStringLiteral(callee.property)) return false;
                if (!["call", "apply"].includes(callee.property.value)) return false;
                let object = callee.object;
                return types.isMemberExpression(object)
                    && types.isIdentifier(object.object)
                    && directObjectNames.includes(object.object.name)
                    && types.isStringLiteral(object.property);
            }

            function replaceWithRunFuncResult(path, num) {
                try {
                    let result = global.runFunc(path.toString(), num);
                    if (["number", "string", "boolean"].includes(typeof result) || result === null) {
                        console.log(path.toString(), ' ===> ', result);
                        path.replaceWith(types.valueToNode(result));
                        return true;
                    }
                } catch (e) {
                }
                return false;
            }

            const diffDecodeFuncName = {
                AssignmentExpression: function (path) {
                    let {node} = path;
                    let {left, operator, right} = node;
                    if (operator !== "=") return;
                    if (!types.isMemberExpression(left) || !types.isCallExpression(left.object)) return;
                    if (!types.isConditionalExpression(right) && !types.isCallExpression(right)) return;
                    if (!containsDecodeFunc(left)) return;
                    if (types.isConditionalExpression(right)) {
                        needNumberFuncNames.push(left.object.callee.name);
                    }
                    if (types.isCallExpression(right)) {
                        directFuncNames.push(left.object.callee.name);
                    }
                }
            };

            const simplifyTypeof = {
                ConditionalExpression: {
                    exit: function (path) {
                        let {node} = path;
                        if (!haveDecodeFunc(node)) return;
                        try {
                            if (global.runFunc(generator(node.test, {compact: false}).code)) {
                                path.replaceWith(node.consequent);
                            } else {
                                path.replaceWith(node.alternate);
                            }
                        } catch (e) {
                        }
                    }
                },
            };

            const restoreInternal = {
                CallExpression: {
                    exit: function (path) {
                        let {node} = path;
                        let {callee} = node;
                        if (!types.isMemberExpression(callee)) return;
                        let {object, property} = callee;
                        if (types.isCallExpression(object) && types.isStringLiteral(property)) {
                            if (!containsDecodeFunc(object)) {
                                return;
                            }
                            let defuncMapName = object.callee.name;
                            if (!directFuncNames.includes(defuncMapName)) return;
                            let result = global.runFunc(path.toString().replaceAll(`${defuncMapName}()`, `global.${defuncMapName}`));
                            console.log(path.toString(), ' ===> ', result);
                            path.replaceWith(types.stringLiteral(result));
                        } else if (types.isMemberExpression(object) && types.isStringLiteral(property) && types.isCallExpression(object.object)) {
                            if (!containsDecodeFunc(object)) return;
                            if (!["call", "apply"].includes(property.value)) debugger;
                            let defuncMapName = object.object.callee.name;
                            if (!directFuncNames.includes(defuncMapName)) return;
                            let result = global.runFunc(path.toString().replaceAll(`${defuncMapName}()`, `global.${defuncMapName}`));
                            console.log(path.toString(), ' ===> ', result);
                            path.replaceWith(types.stringLiteral(result));
                        }
                    }
                }
            };

            const restoreExternal = {
                "BlockStatement|SwitchCase": {
                    exit: function (path) {
                        // [优化] eval(astCode) 已移至遍历前只执行一次（见主流程），
                        // 此处不再对每个 block/case 重复 eval 整段程序。
                        let {node} = path;
                        let body = path.type === 'BlockStatement' ? node.body : node.consequent;
                        let num;

                        body.map(statement => {
                            if (types.isCallExpression(statement.expression)) {
                                let {callee, arguments: args} = statement.expression;
                                if (!types.isMemberExpression(callee) || !types.isIdentifier(callee.object, {name: sjs_se_global_subkey_name}) || !types.isStringLiteral(callee.property, {value: "push"}) || args.length !== 1 || !types.isNumericLiteral(args[0])) {
                                    return;
                                }
                                if (num === undefined) {
                                    num = args[0].value;
                                } else {
                                    throw "no one";
                                }
                            }
                        });

                        if (num === undefined) return;
                        path.traverse({
                            CallExpression: {
                                exit: function (path) {
                                    let {node} = path;
                                    let {callee} = node;
                                    if (!types.isMemberExpression(callee)) return;
                                    if (isDirectObjectDecodeCall(callee) || isDirectObjectDecodeCallApply(callee)) {
                                        if (replaceWithRunFuncResult(path, num)) return;
                                    }
                                    let {object, property} = callee;
                                    if (types.isCallExpression(object) && types.isStringLiteral(property)) {
                                        if (!containsDecodeFunc(object)) return;
                                        let defuncMapName = object.callee.name;
                                        if (!needNumberFuncNames.includes(defuncMapName)) return;
                                        let result = global.runFunc(path.toString().replaceAll(`${defuncMapName}()`, `global.${defuncMapName}`), num);
                                        console.log(path.toString(), ' ===> ', result);
                                        path.replaceWith(types.stringLiteral(result));
                                    } else if (types.isMemberExpression(object) && types.isStringLiteral(property) && types.isCallExpression(object.object)) {
                                        if (!containsDecodeFunc(object)) return;
                                        if (!["call", "apply"].includes(property.value)) debugger;
                                        let defuncMapName = object.object.callee.name;
                                        if (!needNumberFuncNames.includes(defuncMapName)) return;
                                        let result = global.runFunc(path.toString().replaceAll(`${defuncMapName}()`, `global.${defuncMapName}`), num);
                                        console.log(path.toString(), ' ===> ', result);
                                        path.replaceWith(types.stringLiteral(result));
                                    }
                                }
                            }
                        });
                    }
                }
            };

            // ----------------------------- 主流程 -----------------------------
            traverse(ast, find_sjs_se_global_subkey);
            if (!sjs_se_global_subkey_name || !find_10) {
                const dynamicStackName = findDynamicStackName(ast);
                if (dynamicStackName && insertRunFuncBeforeRootReturn(ast, dynamicStackName)) {
                    sjs_se_global_subkey_name = dynamicStackName;
                    find_10 = true;
                    console.log('[restore-string] dynamic stack ===> ', sjs_se_global_subkey_name);
                } else {
                    console.log('[restore-string] unable to locate dynamic stack');
                    process.exit();
                }
            }
            traverse(ast, findNumberList);

            eval(generator(ast).code); // 需要加载一下
            traverse(ast, restoreNumberList);

            let decodeFuncNames = collectDecodeFunc(ast);
            traverse(ast, handleSpecial);

            traverse(ast, diffDecodeFuncName);
            directObjectNames = collectDirectDecoderObjects(ast);

            if (directFuncNames.length + needNumberFuncNames.length !== decodeFuncNames.length) {
                throw "decode func fail";
            }

            traverse(ast, simplifyTypeof);
            eval(generator(ast).code);
            traverse(ast, restoreInternal);
            traverse(ast, restoreSpecial);

            let astCode = generator(ast).code;

            // [优化] 只需加载一次全局解密函数，无需在每个 block/case 退出时重复执行整段程序
            eval(astCode);

            traverse(ast, restoreExternal);

            for (let path of newlyAddedList) {
                path.remove();
            }
        }
    }
};

// ============================================================================
//  驱动逻辑 (原 main2.js)
// ============================================================================

const encodeFile = process.argv.length > 2 ? process.argv[2] : "./encode.js";
const decodeFile = process.argv.length > 3 ? process.argv[3] : encodeFile.replace(".js", "") + "_ok.js";

const generatorOpts = {
    compact: false,
    comments: false,
    jsescOption: {minimal: true}
};

console.time("akamai混淆还原完毕，耗时");

transformFileWithStagedExecution(
    encodeFile,
    [
        {
            type: 'once',
            plugins: [
                bypassFormatCheck,
                splitMultiVariableDeclaration,
                standardizeStatementBlock,
                unifyMemberExpression,
                shiftForInit,
                resolveSequenceExpression,
            ]
        },
        {
            type: 'once',
            plugins: [
                clearJsFuck,
                replaceNumberLoop,
                removeBraceInCase,
                flattenControlFlow,
                clearFlowerInstructions,
                clearJsFuck
            ]
        },
        {
            type: 'once',
            plugins: [
                restoreString,
                handleSpecialControlFlows,
                restoreString,
            ]
        },
        {
            type: 'iterate',
            plugins: [
                removeAllDeadCode,
            ],
            terminateCondition: (prevCode, currentCode) => prevCode === currentCode
        },
    ],
    {
        createParenthesizedExpressions: true,
    },
    generatorOpts,
    decodeFile,
    {tool: true, plugin: false}
);

console.timeEnd("akamai混淆还原完毕，耗时");