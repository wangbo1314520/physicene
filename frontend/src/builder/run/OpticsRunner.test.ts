import { describe, it, expect } from 'vitest'
import { refract, minDeviationAngle, wedgeFringeSpacing, doubleSlitSpacing, runOptics } from './OpticsRunner'

describe('OpticsRunner 物理核心（P1·批次 5）', () => {
  it('Snell 折射：正入射不偏折（θ₁=0 → θ₂=0）', () => {
    const r = refract({ x: 0, y: -1 }, { x: 0, y: 1 }, 1 / 1.5)
    expect(r.tir).toBe(false)
    expect(r.t!.y).toBeCloseTo(-1, 6)
    expect(r.t!.x).toBeCloseTo(0, 6)
  })

  it('Snell 折射：n=1.5，θ₁=arcsin(0.75) → sinθ₂=0.5（θ₂=30°）', () => {
    const th1 = Math.asin(0.75)  // ≈48.6°
    const d = { x: Math.sin(th1), y: -Math.cos(th1) }
    const r = refract(d, { x: 0, y: 1 }, 1 / 1.5)
    expect(r.tir).toBe(false)
    // 验证 sin(θ₂) = n₁sin(θ₁)/n₂ = 0.75/1.5 = 0.5
    const sinT2 = Math.sqrt(r.t!.x * r.t!.x + (1 - r.t!.y * (-1)) * 0)  // 用方向分量验证
    // 更直接：折射角的 sin = 横向分量
    expect(Math.abs(r.t!.x)).toBeCloseTo(0.5, 3)
  })

  it('全反射：glass→air，入射角>临界角 arcsin(1/1.5)=41.8°', () => {
    const crit = Math.asin(1 / 1.5)
    const th = crit + 0.1  // 超临界
    const d = { x: Math.sin(th), y: -Math.cos(th) }
    const r = refract(d, { x: 0, y: 1 }, 1.5)  // glass→air eta=1.5
    expect(r.tir).toBe(true)
    expect(r.t).toBeNull()
  })

  it('棱镜最小偏向角：A=60° n=1.5 → δmin≈37.2°', () => {
    const delta = minDeviationAngle(Math.PI / 3, 1.5)
    expect(delta * 180 / Math.PI).toBeCloseTo(37.18, 1)
  })

  it('劈尖条纹间距：λ=600nm n=1.5 α=0.001rad → Δx=0.2mm', () => {
    const dx = wedgeFringeSpacing(600e-9, 1.5, 0.001)
    expect(dx * 1000).toBeCloseTo(0.2, 4)  // m→mm
  })

  it('双缝间距：λ=600nm d=0.2mm D=1m → Δx=3mm', () => {
    const dx = doubleSlitSpacing(600e-9, 0.2e-3, 1)
    expect(dx * 1000).toBeCloseTo(3, 4)
  })

  it('runOptics：光源+棱镜 → 帧序列+读数（折射角/偏向角）', () => {
    const frames = runOptics([
      { id: 's', type: 'light_source', x: -5, y: 2, angle: 0, params: { th1: 40 } },
      { id: 'p', type: 'prism', x: 0, y: 0, angle: 0, params: { n: 1.5, A: 60 } },
      { id: 'sc', type: 'optic_screen', x: 5, y: 0, angle: 0, params: {} },
    ])
    expect(frames.length).toBeGreaterThan(0)
    expect(frames[0].readings.n).toBeCloseTo(1.5, 6)
    expect(frames[0].readings.theta_1).toBeCloseTo(40, 1)
    expect(frames[0].readings.theta_2).toBeGreaterThan(0)
    expect(frames[0].rays.length).toBeGreaterThanOrEqual(2)  // 入射+折射
  })

  // ── 清偿5·卡 56/57 主入口模式 ──
  it('runOptics：wedge 单元件 → 劈尖条纹间距读数+画布光线', () => {
    const frames = runOptics([
      { id: 'w', type: 'wedge', x: 0, y: 0, angle: 0, params: { lam: 600, n: 1.5, alpha: 0.0573 } },
    ])
    expect(frames.length).toBeGreaterThan(0)
    // ΔL = 600e-9/(2×1.5×tan(0.0573°)) ≈ 0.200mm
    expect(frames[0].readings.fringe_mm).toBeCloseTo(0.200, 2)
    expect(frames[0].rays.length).toBeGreaterThanOrEqual(3)
  })

  it('runOptics：double_slit 单元件 → Δx=Lλ/d 读数', () => {
    const frames = runOptics([
      { id: 'd', type: 'double_slit', x: 0, y: 0, angle: 0, params: { lam: 600, d: 0.2, L: 1 } },
    ])
    expect(frames.length).toBeGreaterThan(0)
    // Δx = 1×600e-9/0.2e-3 = 3mm
    expect(frames[0].readings.dx_mm).toBeCloseTo(3.0, 3)
    expect(frames[0].rays.length).toBeGreaterThanOrEqual(4)
  })
})
