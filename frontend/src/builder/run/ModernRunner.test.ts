import { describe, it, expect } from 'vitest'
import { photoelectricEk, cutoffFrequency, energyLevel, transitionEnergy, transitionWavelength, deBroglieWavelength, bohrResonance, runModern } from './ModernRunner'

describe('ModernRunner 物理核心（P1·批次 5）', () => {
  it('光电效应：ν < ν₀ → Eₖ=0（红线）', () => {
    const nu0 = cutoffFrequency(2.28)  // 钠 ν₀ ≈ 5.51×10¹⁴ Hz
    const ek = photoelectricEk(nu0 * 0.9, 2.28)
    expect(ek).toBe(0)
  })

  it('光电效应：ν = 2ν₀ → Eₖ = W₀（翻倍频率=翻倍功函数）', () => {
    const nu0 = cutoffFrequency(2.28)
    const ek = photoelectricEk(nu0 * 2, 2.28)
    expect(ek).toBeCloseTo(2.28, 3)
  })

  it('氢原子能级：E₁=-13.6 E₂=-3.4 E₃=-1.51', () => {
    expect(energyLevel(1)).toBeCloseTo(-13.6, 2)
    expect(energyLevel(2)).toBeCloseTo(-3.4, 2)
    expect(energyLevel(3)).toBeCloseTo(-1.51, 2)
  })

  it('跃迁 3→2：ΔE≈1.89 eV λ≈656nm（Hα 红光）', () => {
    const dE = transitionEnergy(3, 2)
    expect(dE).toBeCloseTo(1.89, 2)
    const lambda = transitionWavelength(3, 2)
    expect(lambda).toBeCloseTo(656, -1)  // nm（±5nm 容差）
  })

  it('物质波：U=100V → λ≈1.23Å', () => {
    const lambda = deBroglieWavelength(100)
    expect(lambda * 1e10).toBeCloseTo(1.23, 2)  // m→Å
  })

  it('玻尔共振：E=12.09eV → 1→3 跃迁', () => {
    const r = bohrResonance(12.09, 4)
    expect(r).not.toBeNull()
    expect(r!.m).toBe(1)
    expect(r!.n).toBe(3)
  })

  it('runModern：h_atom m=3 n=2 → 帧序列+能级读数', () => {
    const frames = runModern([
      { id: 'a', type: 'h_atom', x: 0, y: 0, angle: 0, params: { m: 3, n: 2 } },
    ])
    expect(frames.length).toBeGreaterThan(0)
    expect(frames[0].readings.E_m).toBeCloseTo(-1.51, 2)
    expect(frames[0].readings.E_n).toBeCloseTo(-3.4, 2)
    expect(frames[0].readings.delta_E).toBeCloseTo(1.89, 2)
    expect(frames[0].transitions).toHaveLength(1)
    expect(frames[0].transitions[0].from).toBe(3)
    expect(frames[0].transitions[0].to).toBe(2)
  })

  it('runModern：photo_tube mat=钠 → 截止频率≈5.51×10¹⁴Hz', () => {
    const frames = runModern([
      { id: 't', type: 'photo_tube', x: 0, y: 0, angle: 0, params: { mat: 0, nu: 6 } },
    ])
    expect(frames.length).toBeGreaterThan(0)
    expect(frames[0].readings.work_function).toBeCloseTo(2.28, 2)
    expect(frames[0].readings.cutoff_freq).toBeCloseTo(5.51, 1)
  })

  // ── 清偿5·卡 64/65 主入口模式 ──
  it('runModern：electron_gun U=100V → 物质波 λ≈12.3pm', () => {
    const frames = runModern([
      { id: 'g', type: 'electron_gun', x: 0, y: 0, angle: 0, params: { U: 100 } },
    ])
    expect(frames.length).toBeGreaterThan(0)
    // λ = h/√(2meU) = 6.626e-34/√(2×9.11e-31×1.602e-19×100) ≈ 1.227e-10 m = 0.1227nm = 122.7pm
    expect(frames[0].readings.lambda_pm).toBeCloseTo(122.7, 0)
  })

  it('runModern：bohr_collision E=12.75eV → 1→∞ 共振（电离阈值）', () => {
    const frames = runModern([
      { id: 'b', type: 'bohr_collision', x: 0, y: 0, angle: 0, params: { E: 12.75, maxN: 4 } },
    ])
    expect(frames.length).toBeGreaterThan(0)
    // 12.75eV=|E₁|：n=1 激发到… bohrResonance 在 maxN 内找 ΔE=E：1↔n 需 ΔE=13.6(1−1/n²)；
    // 12.75=13.6×(1−1/16) → n=4（ΔE(1,4)=12.75）→ resonant=1, res_n=4, res_m=1
    expect(frames[0].readings.resonant).toBe(1)
    expect(frames[0].readings.res_n).toBe(4)
    expect(frames[0].readings.delta_E).toBeCloseTo(12.75, 1)
  })
})
