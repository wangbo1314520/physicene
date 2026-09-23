# AC 电路分析引擎设计（P3 批 3 前置 · 追问 4）

## 1. 定位与归属

- **归属**：`src/physics/ac-circuit.ts`——共享物理模块（决策 1 同款：TS 纯函数，P4 收口同址）。
- **服务卡面**：builder 装置卡（15 变压器输电 / 45 变压器 / 46 输电 / 47 交变四值）。
- **不改动 Java CircuitEngine**（DC MNA 服务耦合场景 rod_bar 每子步求解；AC 相量与刚体无耦合，塞入 Java 子步循环无物理意义）。

## 2. 接口契约

```ts
/** 元件（与 CircuitEngine.Circuit 同风格：components + wires 拓扑） */
export interface AcComp {
  id: string
  kind: 'resistor' | 'inductor' | 'capacitor' | 'ac_source' | 'ideal_transformer'
  // ac_source: { um: 峰值 V, phase: 初相 rad }
  // ideal_transformer: { ratio: n2/n1 }，双绕组各占两个端子（prim/sec 端子对）
  props: Record<string, number>
}
export interface AcCircuit { components: AcComp[]; wires: { a: PinRef; b: PinRef }[] }

/** 求解：角频率 ω 下的正弦稳态相量解（复数 MNA） */
export function solveAC(circuit: AcCircuit, omega: number): AcSolution

export interface AcSolution {
  ok: boolean
  /** 支路电流相量（有效值复数，A）：İ = I∠φ */
  iPhasors: Record<string, { re: number; im: number }>
  /** 元件电压相量（有效值复数，V） */
  uPhasors: Record<string, { re: number; im: number }>
  /** 电源视在/有功/无功与功率因数 */
  sPower: { p: number; q: number; s: number; cosPhi: number }
}

/** 交变四值（卡 47）：峰值/有效值/平均值/瞬时 */
export function fourValues(um: number, omega: number, phase: number): {
  peak: number; rms: number; avg: number; instantAt: (t: number) => number
}

/** 装置主入口（与 runThermal/runOptics 同契约，30fps 帧序列） */
export function runAc(elements: AcBody[], maxDuration?: number): AcFrame[]
```

## 3. 数值方法：复数 MNA

- 节点导纳矩阵 `Y(n×n)`（复数）：电阻 1/R、感抗 1/(jωL)、容抗 jωC。
- 理想变压器建模：电压比约束 `U₂ = (n₂/n₁)·U₁`、电流反映 `I₁ = (n₂/n₁)·I₂`，
  以受控源注入 MNA（修正注-入法）；绕组电阻（实际变压器/输电线损耗）以串联 resistor 表达。
- 复数四则自实现（`{re, im}` 结构 + 高斯消元），不引入依赖。

## 4. 覆盖范围

- **本批覆盖**：纯正弦稳态 AC（4 卡）。
- **不覆盖（申报）**：AC-DC 混合（整流/滤波）——本批无卡面需求；如后续加卡需扩展非线性器件，届时报批。
- **回旋加速器（卡 12）不走本引擎**：时变 E + 粒子动力学，用专用 TS 粒子求解器（半周期反转电场 + 匀强 B；断言 rₙ₊₁/rₙ=√((n+1)/n)、周期与速度无关、出射动能 E=q²B²R²/2m）。

## 5. 单测计划（5 场景，独立来源=教材经典数值；无 Java AC 对照物故不做跨引擎对拍）

| 场景 | 参数（教材经典） | 断言 |
|---|---|---|
| 纯电阻 | R=10Ω，U=220V | I=22A ∠0，P=4840W，cosφ=1 |
| 感性（RL 串联） | R=30Ω，X_L=40Ω，U=220V | \|Z\|=50Ω，I=4.4A，φ=−53.13°（滞后），cosφ=0.6 |
| 容性（RC 串联） | R=30Ω，X_C=40Ω | I 超前 53.13°，cosφ=0.6 |
| 串联谐振 | f=50Hz，L、C 谐振匹配 | I 最大=U/R，cosφ=1，U_L=U_C 相消 |
| 理想变压器 | n₁:n₂=2:1，U₁=220V，负载 11Ω | U₂=110V，I₂=10A，I₁=5A，P₁=P₂=1100W |
| 交变四值 | u=311sin(100πt) V（教材原式） | 有效值 220V、平均值 198V（2Um/π）、瞬时 311@t=0 |

## 6. 卡面断言映射（逐卡，独立来源）

- **15/45 变压器**：U₂/U₁=n₂/n₁、I₁/I₂=n₂/n₁、P₁=P₂（理想）——对照教材理想变压器规律（独立于实现的物理定律表述）
- **46 输电**：I=P/U、P损=(P/U)²·R_line——输电损耗公式（教材口径）+ 数值对照
- **47 交变四值**：Um/√2（有效值）、2Um/π（平均值）——定义式换算 + 311sin(100πt) 教材数值锚

## 7. 实施顺序

1. 引擎 + 单测 6 条（上表）→ 2. 四卡装置模板（registry + runAc 接线）→ 3. 回旋求解器 + 卡 12 →
4. DC 复用 6 卡（33/34/35/48/49/50，走 Java CircuitEngine / point_charge 场路，不新建）→
5. 全量回归 + 测点 2 前的 P3 收口（optics/modern 共享模块收编）。
