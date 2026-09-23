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
