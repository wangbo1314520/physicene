/** 热学静力学装置单测（P3 批 2）：教材经典值硬断言 + 不变量自洽 */
import { describe, expect, it } from 'vitest'
import {
  liquidSealPressure, pumpPressureRatio, uTubeSolveX, uTubeFinal, runThermal,
} from './thermal-statics'

describe('热学静力学共享模块', () => {
  it('液封（卡51）：p₀=76 h=10 → 向上 86 / 向下 66 / 水平 76 cmHg', () => {
    expect(liquidSealPressure(76, 10, 0)).toBeCloseTo(86, 9)
    expect(liquidSealPressure(76, 10, Math.PI)).toBeCloseTo(66, 9)
    expect(liquidSealPressure(76, 10, Math.PI / 2)).toBeCloseTo(76, 9)
  })

  it('打气（卡53）：V=5L V₀=0.25L n=10 → p=1.5·p₀（等效总体积法线性）', () => {
    expect(pumpPressureRatio(10, 0.25, 5, 0)).toBeCloseTo(1.5, 9)
  })

  it('抽气（卡53）：V=5L V₀=0.25L n=2 → p=(5/5.25)²·p₀≈0.9070', () => {
    expect(pumpPressureRatio(2, 0.25, 5, 1)).toBeCloseTo((5 / 5.25) ** 2, 9)
  })

  it('U 形管（卡54）升温：解 x 满足 (p₁+2x)(L₁+x)=p₁L₁T₂/T₁（不变量 ±1e-9）', () => {
    const p0 = 76, dh0 = 4, l1 = 20, t1 = 300, t2 = 360
    const x = uTubeSolveX(p0, dh0, l1, t1, t2, 0, 0)
    const p1 = p0 + dh0
    expect((p1 + 2 * x) * (l1 + x)).toBeCloseTo((p1 * l1 * t2) / t1, 9)
    expect(x).toBeGreaterThan(0)
  })

  it('U 形管（卡54）注汞：解 x 满足 (p₁+2x+Δ)(L₁−x)=p₁L₁（不变量 ±1e-9）', () => {
    const p0 = 76, dh0 = 4, l1 = 20, dAdd = 10
    const x = uTubeSolveX(p0, dh0, l1, 300, 360, dAdd, 1)
    const p1 = p0 + dh0
    expect((p1 + 2 * x + dAdd) * (l1 - x)).toBeCloseTo(p1 * l1, 9)
    expect(x).toBeGreaterThan(0)
  })

  it('uTubeFinal：末态 p₂L₂/T₂ = 初态 p₁L₁/T₁（气体定律自洽）', () => {
    const f = uTubeFinal(76, 4, 20, 300, 360, 10, 0)
    expect((f.p2 * f.l2) / f.t2v).toBeCloseTo(((76 + 4) * 20) / 300, 8)
  })

  it('runThermal：三装置主入口帧序列+读数', () => {
    const seal = runThermal([{ id: 's', type: 'liquid_seal', x: 0, y: 0, angle: 0, params: { p0: 76, h: 10, mode: 0 } }])
    expect(seal.length).toBeGreaterThan(0)
    expect(seal[0].readings.p_cmhg).toBeCloseTo(86, 9)

    const pump = runThermal([{ id: 'p', type: 'pump_syringe', x: 0, y: 0, angle: 0, params: { V: 5, V0: 0.25, n: 10, mode: 0 } }])
    expect(pump[0].readings.p_ratio).toBeCloseTo(1.5, 9)

    const tube = runThermal([{ id: 'u', type: 'u_tube', x: 0, y: 0, angle: 0, params: { L1: 20, dh0: 4, mode: 0, T1: 300, T2: 360, dAdd: 10 } }])
    expect(tube[0].readings.plT2).toBeCloseTo(tube[0].readings.plT1, 8)
    expect(tube[0].readings.x_cm).toBeGreaterThan(0)
  })
})
