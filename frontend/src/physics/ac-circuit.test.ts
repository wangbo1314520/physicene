/** AC 引擎单测（P3 批 3 第 1 步）：教材经典数值独立锚定（设计文档 §5 六场景） */
import { describe, expect, it } from 'vitest'
import { solveAC, fourValues, powerlineLoss, cabs, cang } from './ac-circuit'
import type { AcCircuit, AcComp } from './ac-circuit'

const R = (id: string, r: number): AcComp => ({ id, kind: 'resistor', pins: 2, props: { R: r } })
const L = (id: string, l: number): AcComp => ({ id, kind: 'inductor', pins: 2, props: { L: l } })
const C = (id: string, c: number): AcComp => ({ id, kind: 'capacitor', pins: 2, props: { C: c } })
const SRC = (id: string, um: number, phase = 0): AcComp => ({ id, kind: 'ac_source', pins: 2, props: { um, phase } })
const TR = (id: string, ratio: number): AcComp => ({ id, kind: 'ideal_transformer', pins: 4, props: { ratio } })
const W = (a: [string, number], b: [string, number]) => ({ a, b })

describe('AC 复数 MNA（教材经典值）', () => {
  it('纯电阻：R=10Ω U=220V → I=22A∠0，P=4840W，cosφ=1', () => {
    const ct: AcCircuit = { components: [SRC('u', 220 * Math.SQRT2), R('r', 10)], wires: [W(['u', 0], ['r', 0]), W(['u', 1], ['r', 1])] }
    const s = solveAC(ct, 100 * Math.PI)
    expect(s.ok).toBe(true)
    expect(cabs(s.iPhasors['r#I'])).toBeCloseTo(22, 6)
    expect(cang(s.iPhasors['r#I'])).toBeCloseTo(0, 6)
    expect(s.sPower.p).toBeCloseTo(4840, -1)
    expect(s.sPower.cosPhi).toBeCloseTo(1, 6)
  })

  it('感性 RL 串联：R=30Ω X_L=40Ω U=220V → |Z|=50 I=4.4A φ=−53.13° cosφ=0.6', () => {
    const f = 50, w = 2 * Math.PI * f
    const xl = 40
    const ct: AcCircuit = {
      components: [SRC('u', 220 * Math.SQRT2), R('r', 30), L('l', xl / w)],
      wires: [W(['u', 0], ['r', 0]), W(['r', 1], ['l', 0]), W(['l', 1], ['u', 1])],
    }
    const s = solveAC(ct, w)
    const i = s.iPhasors['r#I']
    expect(cabs(i)).toBeCloseTo(4.4, 6)
    expect(cang(i)).toBeCloseTo(-53.13, 1)
    expect(s.sPower.cosPhi).toBeCloseTo(0.6, 3)
  })

  it('容性 RC 串联：R=30Ω X_C=40Ω → I 超前 53.13°，cosφ=0.6', () => {
    const f = 50, w = 2 * Math.PI * f
    const ct: AcCircuit = {
      components: [SRC('u', 220 * Math.SQRT2), R('r', 30), C('c', 1 / (w * 40))],
      wires: [W(['u', 0], ['r', 0]), W(['r', 1], ['c', 0]), W(['c', 1], ['u', 1])],
    }
    const s = solveAC(ct, w)
    expect(cabs(s.iPhasors['r#I'])).toBeCloseTo(4.4, 6)
    expect(cang(s.iPhasors['r#I'])).toBeCloseTo(53.13, 1)
    expect(s.sPower.cosPhi).toBeCloseTo(0.6, 3)
  })

  it('串联谐振：L-C 匹配 → I=U/R 最大，cosφ=1，U_L 与 U_C 相消', () => {
    const f = 50, w = 2 * Math.PI * f
    const ct: AcCircuit = {
      components: [SRC('u', 220 * Math.SQRT2), R('r', 10), L('l', 0.1), C('c', 1 / (w * w * 0.1))],
      wires: [W(['u', 0], ['r', 0]), W(['r', 1], ['l', 0]), W(['l', 1], ['c', 0]), W(['c', 1], ['u', 1])],
    }
    const s = solveAC(ct, w)
    expect(cabs(s.iPhasors['r#I'])).toBeCloseTo(22, 4)  // I=U/R
    expect(s.sPower.cosPhi).toBeCloseTo(1, 4)
    expect(cabs(s.uPhasors['l#U'])).toBeCloseTo(cabs(s.uPhasors['c#U']), 0)  // U_L=U_C
  })

  it('理想变压器：n₁:n₂=2:1 U₁=220V 负载 11Ω → U₂=110 I₂=10 I₁=5 P₁=P₂=1100W', () => {
    const ct: AcCircuit = {
      components: [SRC('u', 220 * Math.SQRT2), TR('t', 0.5), R('r', 11)],
      wires: [
        W(['u', 0], ['t', 0]), W(['u', 1], ['t', 1]),   // 原边
        W(['t', 2], ['r', 0]), W(['t', 3], ['r', 1]),   // 副边接负载
      ],
    }
    const s = solveAC(ct, 100 * Math.PI)
    expect(s.ok).toBe(true)
    expect(cabs(s.uPhasors['r#U'])).toBeCloseTo(110, -2)
    expect(cabs(s.iPhasors['r#I'])).toBeCloseTo(10, -2)
    expect(cabs(s.iPhasors['t#I1'])).toBeCloseTo(5, -2)
    expect(s.sPower.p).toBeCloseTo(1100, -1)
  })
})

describe('交变四值与输电（卡 47/46）', () => {
  it('四值：u=311sin(100πt) → 有效值 220V 平均值 ≈198V 瞬时 311@t=0', () => {
    const fv = fourValues(311, 100 * Math.PI)
    expect(fv.rms).toBeCloseTo(219.9, 0)   // 311/√2
    expect(fv.avg).toBeCloseTo(198.07, 0)  // 2×311/π
    expect(fv.instantAt(0)).toBeCloseTo(0, 6)   // sin 初相 0 → t=0 为 0；峰值在 t=1/200
    expect(fv.instantAt(1 / 200)).toBeCloseTo(311, 6)
  })

  it('输电：P=110kW U=1100V R线=0.5Ω → I=100A P损=5kW（教材口径 (P/U)²R）', () => {
    const r = powerlineLoss(110e3, 1100, 0.5)
    expect(r.i).toBeCloseTo(100, 6)
    expect(r.pLoss).toBeCloseTo(5e3, -1)
    expect(r.pRecv).toBeCloseTo(105e3, -1)
  })
})

// ── 独立来源锚定（清偿追问 4·AC 单测来源核查）──────────────────────────
// 来源分级：
//  · 教材原文：人教选修3-2 第五章§2《描述交变电流的物理量》——我国生活用电
//    有效值 220V、峰值 Um=220√2≈311V、f=50Hz（u=311sin(100πt) 即教材口径）
//  · 定律不变量（与阻抗公式不同的物理原理）：
//    KVL 相量和 ΣU̇=U̇源 · 能量守恒 P源=Σ|I|²R（L/C 不耗能）
//    · 数值方法独立：辛普森积分直接从 u(t) 定义算有效值/平均值（不用闭式）
describe('AC 独立来源锚定（定律不变量 + 数值方法独立）', () => {
  it('KVL 相量和（自洽检查·同一引擎解的后处理——验证 stamp/消元正确，非物理独立锚）', () => {
    const w = 2 * Math.PI * 50
    for (const third of [L('l', 40 / w), C('c', 1 / (w * 40))]) {
      const ct = {
        components: [SRC('u', 220 * Math.SQRT2), R('r', 30), third],
        wires: [W(['u', 0], ['r', 0]), W(['r', 1], [third.id, 0]), W([third.id, 1], ['u', 1])],
      }
      const s = solveAC(ct as never, w)
      const sum = s.uPhasors['r#U'].re + s.uPhasors[`${third.id}#U`].re
      const sumI = s.uPhasors['r#U'].im + s.uPhasors[`${third.id}#U`].im
      expect(sum).toBeCloseTo(s.uPhasors['u#U'].re, -6)
      expect(sumI).toBeCloseTo(s.uPhasors['u#U'].im, -6)
    }
  })

  it('能量记账自洽（自洽检查·P=−U̇İ* 与 I²R 两路后处理一致；变压器 P₁=P₂ 由约束定义=循环，不入锚）', () => {
    const w = 2 * Math.PI * 50
    const ct = {
      components: [SRC('u', 220 * Math.SQRT2), R('r', 30), L('l', 40 / w)],
      wires: [W(['u', 0], ['r', 0]), W(['r', 1], ['l', 0]), W(['l', 1], ['u', 1])],
    }
    const s = solveAC(ct as never, w)
    const iAbs = Math.hypot(s.iPhasors['r#I'].re, s.iPhasors['r#I'].im)
    expect(s.sPower.p).toBeCloseTo(iAbs * iAbs * 30, -1)  // P=I²R 能量守恒
    expect(s.sPower.q).toBeCloseTo(iAbs * iAbs * 40, -1)  // Q=I²X_L
  })

  it('有效值/平均值 辛普森数值积分独立复核（u=311sin(100πt)，教材 220V 原文口径）', () => {
    // 从定义出发数值积分：rms=√(∫u²/T)、avg=∫|u|/(T/2)——不用 2/π、√2 闭式
    const um = 311, w = 100 * Math.PI, T = (2 * Math.PI) / w
    const n = 2000, h = T / n
    let s2 = 0, sa = 0
    for (let i = 0; i <= n; i++) {
      const u = um * Math.sin(w * (i * h))
      const c = i === 0 || i === n ? 1 : i % 2 ? 4 : 2
      s2 += c * u * u
      sa += c * Math.abs(u)
    }
    const rmsNumeric = Math.sqrt((h / 3) * s2 / T)
    const avgNumeric = ((h / 3) * sa) / T  // 全周期 |u| 平均 = 半周期平均（对称）= 2Um/π
    const fv = fourValues(um, w)
    expect(fv.rms).toBeCloseTo(rmsNumeric, 1)   // ≈219.9 ↔ 数值 219.9（教材 220V）
    expect(fv.avg).toBeCloseTo(avgNumeric, 1)   // ≈198.1 ↔ 数值 198.1
    expect(fv.peak).toBe(fv.instantAt(T / 4))   // 峰值 = T/4 时刻瞬时值（独立取点）
  })
})

// ── P3 批3 第2步：装置面守恒不变量（独立定律）──
describe('AC 装置全链守恒', () => {
  it('变压器输电全链（runAc）：P发 = P线损 + P负（能量守恒，经 MNA 全电路）', async () => {
    const { runAc } = await import('./ac-circuit')
    const frames = runAc([{ id: 't', type: 'transformer_powerline', x: 0, y: 0, angle: 0,
      params: { u_gen: 220, up: 10, down: 10, r_line: 0.5, r_load: 11 } }])
    const r = frames[0].readings
    expect(r.p_gen).toBeCloseTo(r.p_line_loss + r.p_load, -2)  // 守恒 ±1%
    expect(r.i_line).toBeCloseTo((220 * 10) / (0.5 + 11 * 100), 4)  // 折算对照 1.9991A
  })
})

// ── 教材规律锚（人教选修3-2《电能的输送》：电压提高到 n 倍，损失功率减为 1/n²）──
describe('输电/变压器 教材规律锚', () => {
  it('规律锚：U×2 → P损/4、U×10 → P损/100（教材缩放结论，非单点公式复刻）', () => {
    const p1 = powerlineLoss(100e3, 1000, 1)
    const p2 = powerlineLoss(100e3, 2000, 1)
    const p10 = powerlineLoss(100e3, 10000, 1)
    expect(p2.pLoss / p1.pLoss).toBeCloseTo(0.25, 6)
    expect(p10.pLoss / p1.pLoss).toBeCloseTo(0.01, 6)
  })
  it('规律锚：负载 R×4 → I₂×¼ 且 U₂ 不随负载变（欧姆+理想变压器性质，教材例题形式）', async () => {
    const { runAc } = await import('./ac-circuit')
    const a = runAc([{ id: 'a', type: 'transformer', x: 0, y: 0, angle: 0, params: { u1: 220, n1: 2, n2: 1, r_load: 11, r_load_end: 11 } }])
    const b = runAc([{ id: 'b', type: 'transformer', x: 0, y: 0, angle: 0, params: { u1: 220, n1: 2, n2: 1, r_load: 44, r_load_end: 44 } }])
    expect(b[0].readings.i2 / a[0].readings.i2).toBeCloseTo(0.25, 6)  // I₂=U₂/R：R×4 → I₂×¼
    expect(a[0].readings.u2).toBeCloseTo(b[0].readings.u2, 4)  // U₂ 与负载无关（理想变压器；GMIN 1e-9 数值余量）
  })
})
