/**
 * registry theory 常数符号一致性单测（处理 1 · E1 符号 bug 教训）。
 * E1 符号 bug：共享源 E1=−13.6（带符号），registry 本地 E1_EV=13.6（正值）——import 后
 * theory 悄悄变负，vitest 不红（vitest 测 Runner 函数），只有 builder-check E2E 才抓到。
 * 本测试在 vitest 层就把这层盲区堵住：逐个断言 registry 使用的共享常数与 src/physics
 * 单源值的符号和量级一致。
 */
import { describe, expect, it } from 'vitest'
import { H_EV, C, E1, HC_EV_NM, H_SI, M_E, Q_E } from '../../physics/modern-physics'

describe('registry theory 常数与共享源符号一致性', () => {
  it('E1：共享源为负（氢基态束缚能），registry theory 推导须取 abs（正 13.6）', () => {
    expect(E1).toBeLessThan(0)           // 共享源：−13.6（束缚态约定）
    expect(Math.abs(E1)).toBeCloseTo(13.6, 1)  // registry theory 用 abs
  })

  it('H_EV / C / HC_EV_NM / H_SI / M_E / Q_E：全部为正、量级正确', () => {
    expect(H_EV).toBeGreaterThan(0)
    expect(H_EV).toBeLessThan(1e-14)     // 4.1357e-15
    expect(C).toBeCloseTo(3e8, -7)
    expect(HC_EV_NM).toBe(1240)           // 统一口径（不是 1240.71）
    expect(H_SI).toBeCloseTo(6.626e-34, -36)
    expect(M_E).toBeCloseTo(9.11e-31, -33)
    expect(Q_E).toBeCloseTo(1.602e-19, -21)
  })

  it('跨源一致性：registry theory 用 H_EV 算 ν₀ 与 ModernRunner.cutoffFrequency 同源', async () => {
    const { cutoffFrequency } = await import('../../physics/modern-physics')
    const W = 2.28  // 钠表值
    expect(W / H_EV / 1e14).toBeCloseTo(cutoffFrequency(W) / 1e14, 6)  // 同公式同源
  })
})
