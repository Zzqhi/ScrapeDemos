'use strict';

const { aesEncrypt, xorEncode } = require('./gen_cb');

/**
 * 鼠标轨迹模拟器
 *
 * 原理：
 * 1. 用三阶贝塞尔曲线生成一条从起点到终点的平滑路径
 *    - 控制点随机偏移，使路径带有自然弧度
 *    - 避免直线轨迹（机器人特征）
 *
 * 2. 时间分布模拟人手的「加速 → 匀速 → 减速」规律
 *    - 参数 t 按 ease-in-out 曲线映射
 *    - 起止阶段密集（速度慢），中间稀疏（速度快）
 *
 * 3. 每个采样点加高斯噪声（±1~2px）
 *    - 模拟人手微颤，不会完美落在曲线上
 *
 * 4. 时间间隔随机波动（8~30ms）
 *    - 浏览器 mousemove 事件受 rAF 和系统调度影响
 *    - 不会是精确等间隔
 *
 * 5. isTrusted = 1
 *    - 真实浏览器事件的标记，程序触发为 0
 *
 * 轨迹点格式：[x, y, elapsed_ms, isTrusted]
 * 编码方式：每条 → toString → xorEncode(token, ...) → 采样50条 → join(':') → aesEncrypt
 */

function gaussianRandom() {
    // Box-Muller 变换，生成标准正态分布随机数
    let u, v;
    do { u = Math.random(); } while (u === 0);
    v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function easeInOut(t) {
    // 三阶 ease-in-out: 起止慢、中间快
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function bezier3(p0, p1, p2, p3, t) {
    // 三阶贝塞尔: B(t) = (1-t)^3*P0 + 3(1-t)^2*t*P1 + 3(1-t)*t^2*P2 + t^3*P3
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function generateTrace(totalMs, pointCount) {
    // 起点和终点在页面合理区域内随机
    const x0 = 100 + Math.floor(Math.random() * 600);  // 起点 x
    const y0 = 200 + Math.floor(Math.random() * 400);  // 起点 y
    const x3 = x0 + Math.floor(Math.random() * 200 - 100); // 终点 x (偏移不大)
    const y3 = y0 + Math.floor(Math.random() * 200 - 100); // 终点 y

    // 控制点随机偏移，产生自然弧度
    const cx1 = x0 + (x3 - x0) * 0.3 + (Math.random() - 0.5) * 80;
    const cy1 = y0 + (y3 - y0) * 0.3 + (Math.random() - 0.5) * 80;
    const cx2 = x0 + (x3 - x0) * 0.7 + (Math.random() - 0.5) * 80;
    const cy2 = y0 + (y3 - y0) * 0.7 + (Math.random() - 0.5) * 80;

    const points = [];
    let elapsed = 0;

    for (let i = 0; i < pointCount; i++) {
        const ratio = i / (pointCount - 1);           // 0 → 1
        const t = easeInOut(ratio);                    // ease-in-out 时间映射

        const x = Math.round(bezier3(x0, cx1, cx2, x3, t) + gaussianRandom() * 1.5);
        const y = Math.round(bezier3(y0, cy1, cy2, y3, t) + gaussianRandom() * 1.5);

        // 时间间隔: 8~30ms 随机波动
        if (i > 0) {
            elapsed += 8 + Math.floor(Math.random() * 22);
        }

        // [x, y, elapsed_ms, isTrusted]
        // isTrusted: 1 = 真实事件
        points.push([x, y, elapsed, 1]);
    }

    return points;
}

function sample(arr, num) {
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

function generateData(token, elapsed) {
    elapsed = elapsed || (800 + Math.floor(Math.random() * 2000));

    // 生成模拟轨迹 (15~30 个点)
    const pointCount = 15 + Math.floor(Math.random() * 16);
    const tracePoints = generateTrace(elapsed, pointCount);

    // 每条轨迹先 xorEncode
    const encodedTraces = tracePoints.map(point =>
        xorEncode(token, point.toString())
    );

    // 采样最多 50 条
    const sampled = sample(encodedTraces, 50);

    const d = '';
    const m = aesEncrypt(sampled.join(':'));
    const p = aesEncrypt(xorEncode(token, '0,0,' + elapsed));
    const ext = aesEncrypt(xorEncode(token, '1,' + tracePoints.length));

    return JSON.stringify({ d, m, p, ext });
}

module.exports = { generateData, generateTrace };

if (require.main === module) {
    const token = process.argv[2] || 'test_token';
    const elapsed = parseInt(process.argv[3] || '0', 10) || undefined;
    process.stdout.write(generateData(token, elapsed));
}
