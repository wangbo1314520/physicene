import { describe, expect, it } from 'vitest'
import { runCelestial, buildPoints, G_SI, SCALE_M, type CelestialBody } from './celestial'

const star = (id: string, M = 5.97): CelestialBody => ({
  id, type: 'central_star', x: 0, y: 0, angle: 0, params: { M }, 
})
const sat = (id: string, x: number, v0: number, m = 100): CelestialBody => ({
  id, type: 'satellite', x, y: 0, angle: 0, params: { m, v0, ang: 90 }, 
})
const binary = (id: string, M1: number, M2: number, L: number): CelestialBody => ({
  id, type: 'binary_star', x: 0, y: 0, angle: 0, params: { M1, M2, L }, 
})

describe('批A·天体运动引擎（Verlet·闭式对照）', () => {
  it('圆轨道：v=√(μ/r) 周期保持（T=2π√(r³/μ)，1 单位=1e7m）', () => {
    // 地球 μ=3.986e14；r=2 单位=2e7 m → T=2π√(8e21/3.986e14)=2π·4480s≈28150s
    const mu = G_SI * 5.97e24
    const r = 2 * SCALE_M
    const vCirc = Math.sqrt(mu / r)
    const frames = runCelestial([star('c'), sat('s', 2, vCirc)], { maxDuration: 12, timeScale: (28150 * 6) / 12 })
    const rd = frames[frames.length - 1].readings
    const TTheory = 2 * Math.PI * Math.sqrt((r * r * r) / mu)
    expect(rd['T_s']).toBeDefined()
    expect(Math.abs(rd['T_s'] - TTheory) / TTheory).toBeLessThan(0.02)
  })

  it('辛性：能量漂移 <0.01%（timeScale 压缩 10s=多圈）', () => {
    const mu = G_SI * 5.97e24
    const vCirc = Math.sqrt(mu / (2 * SCALE_M))
    const frames = runCelestial([star('c'), sat('s', 2, vCirc)], { maxDuration: 8, timeScale: (28150 * 6) / 8 })
    expect(Math.abs(frames.at(-1)!.readings['E_drift'])).toBeLessThan(1e-4)
  })

  it('双星：共质心不漂（<1e-6 单位）、同周期、r₁/r₂=M₂/M₁', () => {
    const frames = runCelestial([binary('b', 2, 1, 3)], { maxDuration: 8, timeScale: 4000 })
    const rd = frames.at(-1)!.readings
    expect(Math.abs(rd['bary_dx'])).toBeLessThan(1e-6)
    expect(Math.abs(rd['bary_dy'])).toBeLessThan(1e-6)
    // r_A(距质心)=L·M₂/ΣM=1，r_B=2 → 帧位姿直接验证
    const last = frames.at(-1)!.poses
    const A = last.find((q) => q.id === 'b#A')!
    const B = last.find((q) => q.id === 'b#B')!
    const rA0 = 3 * (1 / 3), rB0 = 3 * (2 / 3)
    // 圆轨道：任一时刻距质心距离恒定（±2%）
    const dA = Math.hypot(A.x, A.y), dB = Math.hypot(B.x, B.y)
    expect(Math.abs(dA - rA0) / rA0).toBeLessThan(0.02)
    expect(Math.abs(dB - rB0) / rB0).toBeLessThan(0.02)
    expect(dA / dB).toBeCloseTo(1 / 2, 1)
    // 同周期
    if (rd['T_b#A'] && rd['T_b#B']) expect(Math.abs(rd['T_b#A'] - rd['T_b#B']) / rd['T_b#A']).toBeLessThan(0.03)
  })

  it('逃逸判据：v≥√(2μ/r) → rmax 持续增大（vs 圆轨道 rmax 有界）', () => {
    const mu = G_SI * 5.97e24
    const r = 2 * SCALE_M
    const vEsc = Math.sqrt((2 * mu) / r)
    const circ = runCelestial([star('c'), sat('s', 2, Math.sqrt(mu / r))], { maxDuration: 6, timeScale: 5000 })
    const esc = runCelestial([star('c'), sat('s', 2, vEsc)], { maxDuration: 6, timeScale: 5000 })
    expect(circ.at(-1)!.readings['rmax_s']).toBeLessThan(2.1)
    expect(esc.at(-1)!.readings['rmax_s']).toBeGreaterThan(4)
  })

  it('buildPoints：缺中心天体报错', () => {
    expect(buildPoints([sat('s', 1, 100)]).error).toBeDefined()
  })
})
