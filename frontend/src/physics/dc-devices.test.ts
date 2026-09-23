/** DC 装置单测（P3 批 3 第 4 步）：断言分级标注 */
import { describe, expect, it } from 'vitest'
import { runDc } from './dc-devices'

describe('DC 装置六卡', () => {
  it('卡33 磁流体：EMF=B·D·v（物理独立：qU/d=qvB 洛伦兹平衡）+ 分压定律 vs MNA 两法一致', () => {
    const f = runDc([{ id: 'm', type: 'mhd_generator', x: 0, y: 0, angle: 0, params: { B: 1, D: 0.2, v: 10, r_load: 5, r_in: 1 } }])
    expect(f[0].readings.emf).toBeCloseTo(2, 9)             // 1×0.2×10
    expect(f[0].readings.u_out).toBeCloseTo((2 * 5) / 6, 6) // 分压定律 闭式
    expect(f[0].readings.u_out).toBeCloseTo(f[0].readings.divider, 6) // MNA vs 闭式两法
  })

  it('卡34 流量计：v=Q/A（连续性）→ U=BDv（洛伦兹）→ 反解 v=U/(BD) 同源闭合', () => {
    const f = runDc([{ id: 'f', type: 'flow_meter', x: 0, y: 0, angle: 0, params: { B: 0.5, D: 0.1, Q: 5e-3, A: 2.5e-3 } }])
    expect(f[0].readings.v).toBeCloseTo(2, 9)                    // 5e-3/2.5e-3
    expect(f[0].readings.u_sensor).toBeCloseTo(0.1, 9)           // 0.5×0.1×2
    expect(f[0].readings.v_from_u).toBeCloseTo(f[0].readings.v, 9) // 逆用同源闭合
  })

  it('卡35 霍尔：U_H=IB/(nqd)（教材规律）；比值锚 B×2→U×2、d×2→U×½（规律锚）', () => {
    const base = { I: 1e-3, n: 1e25 }
    const f1 = runDc([{ id: 'h', type: 'hall_slab', x: 0, y: 0, angle: 0, params: { ...base, B: 0.5, d: 1e-3 } }])[0].readings
    const f2 = runDc([{ id: 'h', type: 'hall_slab', x: 0, y: 0, angle: 0, params: { ...base, B: 1.0, d: 1e-3 } }])[0].readings
    const f3 = runDc([{ id: 'h', type: 'hall_slab', x: 0, y: 0, angle: 0, params: { ...base, B: 0.5, d: 2e-3 } }])[0].readings
    expect(f1.u_hall).toBeCloseTo((1e-3 * 0.5) / (1e25 * 1.602e-19 * 1e-3), 6)
    expect(f2.u_hall / f1.u_hall).toBeCloseTo(2, 6)   // ∝B
    expect(f3.u_hall / f1.u_hall).toBeCloseTo(0.5, 6) // ∝1/d
  })

  it('卡48 电表改装（安培计）：MNA 实解表头电流=满偏 ig；Rs=igRg/(I−ig) 闭式两法', () => {
    const f = runDc([{ id: 'c', type: 'meter_conversion', x: 0, y: 0, angle: 0, params: { ig: 100e-6, rg: 1000, target: 1, mode: 0 } }])[0].readings
    expect(f.rs).toBeCloseTo((100e-6 * 1000) / (1 - 100e-6), 0)   // ≈0.1001Ω
    expect(f.i_meter).toBeCloseTo(100e-6, 5)                       // 满偏（MNA 实解）
  })

  it('卡49 伏安法：大内偏大（R测=R+RA）/小外偏小（R测=R·RV/(R+RV)）——MNA vs 化简两法', () => {
    const inner = runDc([{ id: 'a', type: 'voltammetry', x: 0, y: 0, angle: 0, params: { r_x: 10, r_a: 0.1, mode: 0 } }])[0].readings
    const outer = runDc([{ id: 'b', type: 'voltammetry', x: 0, y: 0, angle: 0, params: { r_x: 10, r_v: 3000, mode: 1 } }])[0].readings
    expect(inner.r_meas).toBeCloseTo(10.1, 4)                       // 化简式 R+RA
    expect(outer.r_meas).toBeCloseTo((10 * 3000) / 3010, 4)         // 化简式 并联
    expect(inner.r_meas).toBeGreaterThan(10)                        // 教材规律：大内偏大
    expect(outer.r_meas).toBeLessThan(10)                           // 小外偏小
  })

  it('卡50 黑箱：B→C 正向 0.1Ω/反向 1GΩ（二态开关建模），比值 1e10 判据；R_AB=20Ω 两法', () => {
    const f = runDc([{ id: 'b', type: 'black_box', x: 0, y: 0, angle: 0, params: { r_ab: 20 } }])[0].readings
    expect(f.r_ab).toBeCloseTo(20, 3)                 // MNA 读数 vs 直连欧姆
    expect(f.r_bc_fwd).toBeCloseTo(0.1, 3)
    expect(f.fwd_rev_ratio).toBeCloseTo(1e10, 0)      // 理想二极管正反比判据
  })
})
