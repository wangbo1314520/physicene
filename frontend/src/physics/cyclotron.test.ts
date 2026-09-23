/** 回旋加速器单测（P3 批 3 第 3 步）：断言分级标注（物理独立/教材结论/方法独立） */
import { describe, expect, it } from 'vitest'
import { cyclotronOrbit } from './cyclotron'

const QM_P = 9.578e7  // 质子比荷（C/kg）

describe('回旋加速器（卡 12）', () => {
  it('相邻半径比 √((n+1)/n)（物理独立：qvB=mv²/r 两步相除推导）', () => {
    const o = cyclotronOrbit(QM_P, 1.0, 1e4, 0.5)
    const n = o.nMax
    expect(o.rRatioLast).toBeCloseTo(Math.sqrt(n / (n - 1)), 6)
  })

  it('半周期 π/(qm·B) 与速度无关（教材结论：选择性必修2 回旋加速器）', () => {
    const o = cyclotronOrbit(QM_P, 1.0, 1e4, 0.5)
    expect(o.halfPeriod).toBeCloseTo(Math.PI / (QM_P * 1.0), 6)
    // 与 U 无关（U 决定每次加能多少，不改变周期）：不同 U 下半周期一致
    const o2 = cyclotronOrbit(QM_P, 1.0, 5e4, 0.5)
    expect(o2.halfPeriod).toBeCloseTo(o.halfPeriod, 9)
  })

  it('出射动能两法交叉（物理独立）：能量记账 n·qU = 圆周闭式 qm·B²R²/2（eV）', () => {
    const o = cyclotronOrbit(QM_P, 1.0, 1e4, 0.5)
    // floor 取整差 ≤1 个加速量子 U（相对 ~1/n_max≈0.01%）
    expect(Math.abs(o.ekCrossEv - o.ekExitEv) / o.ekExitEv).toBeLessThan(1e-3)   // n·U vs qm·B²R²/2
    // 教材量级：1m 直径（R=0.5）1T 质子回旋 ≈12MeV
    expect(o.ekExitEv / 1e6).toBeCloseTo(11.97, -1)
  })

  it('n_max = qm·B²R²/(2U)（方法独立：闭式 vs 引擎 floor 计数）', () => {
    const o = cyclotronOrbit(QM_P, 2.0, 2e4, 0.3)
    expect(o.nMax).toBe(Math.floor((QM_P * 4 * 0.09) / (2 * 2e4)))
  })
})
