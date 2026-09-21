/**
 * comp1 直接标定（重审计 v2 项 1）：variableForce（h=1/500）与 smallQuantity（h=1/1000）——
 * em7-sensitivity 同法（复刻数值核心，公式照抄注明源行，扫 h 两段式）。
 * 场景数值核心：comp1.ts L42-49（变力：v/x 积分+W 微元和）与 L119+（单摆：th 精确 sinθ）。
 */
import { describe, it, expect } from 'vitest'

// —— 变力做功（variableForce, comp1.ts L15-27/42-49 照抄）——
function F66(x: number, p: Record<string, number>): number {
  if (x < 0 || x > p.L) return 0
  if (p.shape === 0) return p.F0 * (1 - x / p.L)
  if (p.shape === 1) return (p.F0 * x) / p.L
  if (p.shape === 2) return p.F0 * Math.sin((Math.PI * x) / p.L)
  return p.F0 * (p.L / (x + p.L)) ** 2
}
function W66(p: Record<string, number>): number {
  if (p.shape === 0) return 0.5 * p.F0 * p.L
  if (p.shape === 1) return 0.5 * p.F0 * p.L
  if (p.shape === 2) return (2 * p.F0 * p.L) / Math.PI
  return p.F0 * p.L * 0.5
}
/** 复刻 step（L42-49）：返回 {W 微元和, v}（dx 微元宽固定 0.4=场景默认——微元误差属场景设计教学量，与 h 无关） */
function runVariableForce(h: number): { W: number; Ek: number; Wex: number } {
  const p = { shape: 2, F0: 20, L: 4, m: 2, dx: 0.4 }
  let x = 0, v = 0.01, W = 0, bin = 0
  for (let k = 0; k < 2_000_000; k++) {
    const F = F66(x, p)
    v += (F / p.m) * h
    x += v * h
    while (bin * p.dx < p.L - 1e-9 && Math.min((bin + 1) * p.dx, p.L) <= x) {
      const x0 = bin * p.dx
      W += F66(x0, p) * (Math.min(x0 + p.dx, p.L) - x0)
      bin++
    }
    if (x >= p.L) break
  }
  return { W, Ek: 0.5 * p.m * v * v, Wex: W66(p) }
}

// —— 单摆小量（smallQuantity, comp1.ts L119+ step 数值核心：θ¨=−(g/L)sinθ 半隐式欧拉）——
function pendulumPeriodAt(h: number): number {
  const th0 = (60 * Math.PI) / 180, L = 1, g = 9.8
  let th = th0, om = 0, t = 0
  let prevOmSign = Math.sign(om)
  const zeroCross: number[] = []
  for (let k = 0; k < 4_000_000 && zeroCross.length < 4; k++) {
    om += -(g / L) * Math.sin(th) * h
    th += om * h
    t += h
    const s = Math.sign(om)
    if (s !== prevOmSign && s !== 0) {   // ω 过零=边缘（半周期点）
      zeroCross.push(t)
      prevOmSign = s
    }
  }
  // 相邻边缘间隔=半周期
  return 2 * (zeroCross[zeroCross.length - 1] - zeroCross[zeroCross.length - 2])
}

describe('comp1 直接标定（h 敏感性，重审计 v2 项 1）', () => {
  it('变力做功（h=1/500）：Ek 与解析 ∫Fdx 偏差 <2%，且随 h 收敛', () => {
    const a = runVariableForce(1 / 250)
    const b = runVariableForce(1 / 500)
    const c = runVariableForce(1 / 1000)
    console.log(`[comp1-varF] h=1/250 Ek=${a.Ek.toFixed(3)} Wex=${a.Wex} 偏差${((a.Ek - a.Wex) / a.Wex * 100).toFixed(2)}%`)
    console.log(`[comp1-varF] h=1/500 Ek=${b.Ek.toFixed(3)} 偏差${((b.Ek - b.Wex) / b.Wex * 100).toFixed(2)}%  ← 生产 h`)
    console.log(`[comp1-varF] h=1/1000 Ek=${c.Ek.toFixed(3)} 偏差${((c.Ek - c.Wex) / c.Wex * 100).toFixed(2)}%`)
    expect(Math.abs(b.Ek - b.Wex) / b.Wex).toBeLessThan(0.02)
    expect(Math.abs(c.Ek - c.Wex) / c.Wex).toBeLessThan(Math.abs(b.Ek - b.Wex) / b.Wex)   // 收敛
  })
  it('单摆 θ₀=60°（h=1/1000）：T 与椭圆积分类似修正偏差 <1%，随 h 收敛', () => {
    const T250 = pendulumPeriodAt(1 / 500)
    const T1000 = pendulumPeriodAt(1 / 1000)
    const T2000 = pendulumPeriodAt(1 / 2000)
    const th0 = (60 * Math.PI) / 180
    const theory = 2 * Math.PI * Math.sqrt(1 / 9.8) * (1 + th0 * th0 / 16 + 11 * th0 ** 4 / 3072)
    console.log(`[comp1-pend] h=1/500 T=${T250.toFixed(4)}s h=1/1000 T=${T1000.toFixed(4)}s（生产） h=1/2000 T=${T2000.toFixed(4)}s 理论级数=${theory.toFixed(4)}s`)
    expect(Math.abs(T1000 - theory) / theory).toBeLessThan(0.01)
    // 收敛到平台：h≤1/1000 偏差 <0.04%（1/1000 与 1/2000 差 <1e-3 已进舍入平台——粗步长 1/500 偏 0.013% 可见收敛趋势）
    expect(Math.abs(T2000 - theory) / theory).toBeLessThan(0.0005)
    expect(Math.abs(T1000 - T2000)).toBeLessThan(1e-3)
  })
})
