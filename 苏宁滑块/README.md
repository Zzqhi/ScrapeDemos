# 苏宁滑块验证码逆向分析

## 项目目标
纯算还原苏宁登录页滑块验证（iar），能成功发送 validate 请求。

## 请求链路

```
1. POST /ids/iarVerifyCodeTicket        → 获取 ticket
2. GET  /iar-web/init.json?ticket=xxx   → 获取 param, tInfo, js路径, static_server
3. GET  /iar-web/dyjs/mgr.{hash}.js     → 加载 JSVMP 引擎（动态混淆，每次hash/变量名不同）
4. GET  /iar_prd_jigsaw/xxx_bg.jpg      → 背景图
5. GET  /iar_prd_jigsaw/xxx_slide.png   → 拼图碎片
6. GET  /iar-web/validate.json?ticket=&data=&jsCode=  → 验证（JSONP，多次调用）
```

## validate.json 参数

| 参数 | 来源 | 说明 |
|------|------|------|
| `_callback` | 随机生成 | JSONP 回调名 `c` + 10位随机数 |
| `ticket` | iarVerifyCodeTicket 返回 | 固定值 |
| `data` | mgr.js JSVMP 生成 | **URL-safe Base64**（`~`代`+`，`_`代`/`） |
| `jsCode` | 空 | |

- validate **会被多次调用**（每次 mousemove 都触发），data 长度递减（67K→7K→1K→814）
- 返回 `{"resp_code":"0"}` 为成功，`"1"` 为失败

## mgr.js JSVMP 架构

### 结构特征
- **不是** switch-case 派发，而是**函数式 JSVMP**
- opcode 派发表：闭包内对象（变量名每次不同，如 `L_`、`SQ`、`Ys`）
- 解释器入口：`派发表[opcode](opcode, 操作数, VM状态)`
- 字节码：编码字符串，首字符为 opcode
- 反调试：多处 `debugger` 语句
- 全局对象表：`window`, `document`, `navigator`, `Math`, `JSON`, `RegExp`, `performance`, `screen`, `Date`, `console`, `location`, `Function`, `setTimeout`, `clearTimeout`, `parseInt`, `parseFloat`, `encodeURIComponent`, `decodeURIComponent`, `Infinity`
- 特殊变量：`siller`（外部对象），`IAmNotHUMAN`（反bot检测）

### opcode 语义映射（从 mgr.t3Q6i7bEoWQiE2r.js 提取，55种）

见 [analysis/opcode_map.md](analysis/opcode_map.md)

高频 top10:
| Opcode | 频率 | 语义 |
|--------|------|------|
| `.` | 9950 | 标识符引用/变量读取 |
| `a` | 1393 | 属性访问 |
| `ü` | 912 | 顺序执行块 |
| `ś` | 870 | 赋值 |
| `L` | 784 | 变量声明 |
| `\` | 640 | 函数调用 |
| `À` | 616 | 参数列表求值 |
| `b` | 595 | 作用域赋值 |
| `o` | 544 | 字符串字面量 |
| `E` | 455 | 函数调用(变体) |

### mousemove 轨迹处理
每个坐标经过数学变换后存储：
```
取模(ß/%) → 属性访问(Į) → 除法(Ė//) → 减法(ų/-) → 比较(2/>=) → 赋值(b) → 方法调用(*)
```

## SnCaptcha.js 分析

- 1244 行（格式化后），控制流混淆（NrT 21×7 矩阵 + switch-case）
- 字符串混淆：`p4m()`, `DxZ()`, `ZAp()`, `XU3()`, `mLk()` 等 URL-decode 变体函数
- 负责：加载 mgr.js → 绑定 slider 事件 → 调用 mgr 加密 → 发 JSONP validate 请求
- 关键函数：`addJsonp`（发请求）、`addScript`（加载脚本）、`urlsafe_encode`（base64编码）
- 导出 `sncaptchaMgr` 函数供 SnCaptcha.js 调用

## 当前进度

- [x] 请求链路完整抓包
- [x] validate.json 参数格式确认
- [x] mgr.js JSVMP opcode 映射（55种）
- [x] VM trace 采集（20K+ 条，含 mousemove 处理）
- [x] 事件绑定方式确认（pointerdown/pointermove on slider/document）
- [x] SnCaptcha.js 下载 + 格式化
- [ ] **SnCaptcha.js 字符串还原**（NrT矩阵 + p4m等函数）
- [ ] 搞清 SnCaptcha → mgr 调用接口（传什么参数，返回什么）
- [ ] data 参数加密算法还原
- [ ] Node.js 纯算实现
- [ ] 完整验证流程测试

## 卡点

1. **SnCaptcha.js 字符串混淆**：p4m/DxZ/ZAp/XU3/mLk 都在闭包内，需还原才能读懂调用逻辑
2. **mgr.js 动态混淆**：每次请求 hash 和变量名都不同，不能硬编码
3. **data 加密入口不明**：是 SnCaptcha 调 mgr 返回加密结果，还是 mgr 内部直接生成？

## 文件说明

| 文件 | 说明 |
|------|------|
| `main.js` | 初始请求脚本（获取 ticket/init/mgr.js） |
| `mgr.js` | 格式化后的 mgr.js（首次获取） |
| `mgr_live.js` | 浏览器抓取的 mgr.js 原始版本 |
| `fp.js` | 指纹采集脚本 |
| `SnCaptcha.js` | 原始 SnCaptcha.js |
| `SnCaptcha_fmt.js` | 格式化后的 SnCaptcha.js |
| `analysis/opcode_map.md` | opcode 语义映射表 |
| `analysis/trace_analysis.md` | VM trace 分析报告 |
