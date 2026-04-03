# dvc hash 逆向分析笔记 — 2026-04-03

## 概要

dvc 格式: `"{hash},{timeDelta},{plugins}"`  
hash 函数: `Tn(1, d4h, U2h, pph)` — JSVMP 虚拟机 case 1

## 输入参数

- `sOh=1` — dispatcher case number
- `d4h` — ajr 字符串 (完整的 din fingerprint, ~380 chars)
- `U2h` — 迭代计数器 (第一次 POST=0)
- `pph` — 事件计数 (第一次 POST=0, tovl)

## 输出特征

- 20 字符, charset: `12379BQYacdefghijklmopqrsuvwxyz` (31 chars, base31)
- 确定性: 同输入同输出
- 结构:
  - 位置 0: 由 U2h 控制 (U2h=0→'a', 1→'d', 2→'e', ...)
  - 位置 1-14: 纯会话状态 (U2h=0,pph=0 时完全固定)
  - 位置 15-19: xq(input) 与会话状态混合的 5-bit hash
    - 每位二值: e/f, f/w, 2/i, l/s, m/r
    - 恰好 32 种组合
    - 非周期, 非简单模运算
  - pph≥1 时整个 hash 完全改变

## JSVMP 引擎结构

```
NQ (核心 dispatch, 2118 bytes)
├── case ZQ: 初始化 — 创建 Ht class, 注册 VM methods
├── case PD: 属性设置
├── case kJ: 变量查找 (scope chain)  
├── case kO: 字节码加载
├── case KQ: 执行循环 ← 关键
│   while (this[qM][lz.G] < this[cd].length) {
│       var f1 = this[lt]();  // fetch opcode
│       this[f1](this);       // execute
│   }
├── case rH..NJ: opcode 安装 (cT dispatcher, ~40 opcodes)
└── ...

cT (opcode installer, 10+ cases)
├── BM=6: push(dO())  — push instruction pointer
├── YK=9: push(JQ(pop,pop)) — binary op
├── AK=16: push(lx(pop,pop)) — binary op
├── qM=18: function call (apply)
├── Px=21: property set
├── bd=24: push(F1(pop,pop)) — binary op
├── EO=33: push(lt()) — push literal
├── BD=36: push(zM(pop,pop)) — binary op
├── jJ=45: push(undefined)
├── NJ=65: push(xx(pop,pop)) — binary op
└── ...

TK: hash 旋转操作
  this["kH"] = this["kH"] << 13 | this["kH"] >>> 19;
  this.YV = Bj;  // Bj = 混合常量

pz(): 字符串常量表
  ["E", "]_aC6XwR3^m'<ZSq-ojc7PCQ", ...]
```

## VM 寄存器/属性索引

```
sd=243  stack
qM=18   instruction pointer array
tV=234  type conversion
sD=46   scope
CD=200  call context
dO=208  read IP
K=41    step
Mt=252  pop
WV=149  write IP
lt=168  fetch literal
CT=102  property assignment
tQ=122  arg count
```

## plugins 部分

- 字母 a-l (12 个) 的 shuffle, 每个后跟 '+'
- 顺序每次 page load 不同
- 示例: "d+k+i+g+e+f+l+b+", "e+b+a+g+f+c+k+i+l+d+"

## timeDelta 部分

- 小整数 (20-40)
- = fp() - gkh (Date.now() - 某个时间戳)

## 下一步: JSVMP 字节码反编译

1. 在 VM 执行循环设断点, 逐 opcode 追踪 Tn(1, '', 0, 0) 的执行
2. 记录: opcode index → operation → stack effect
3. 从 trace 重建等效 JS 函数
4. 注意: 蜜罐检测 (Error.stack, Function.toString) 和异常分支
