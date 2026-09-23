/** 批 4 三装置单测：教材经典值 + 两法互证 */
import { describe, expect, it } from 'vitest'
import { dtFusion, nuclearReaction, springWork, simpsonWork, elevatorSchedule, scaleReading, runMisc } from './misc-devices'

describe('卡 63 核反应', () => {
  it('D+T→He4+n：A/Z 守恒 ✓；ΔE=17.6MeV（教材经典聚变值，Δm≈0.0189u×931.5）', () => {
    const r = dtFusion()
    expect(r.aOk).toBe(true)   // 2+3=4+1
    expect(r.zOk).toBe(true)   // 1+1=2+0
    expect(r.dMassU).toBeCloseTo(0.0189, 3)
    expect(r.energyMeV).toBeCloseTo(17.6, 1)
  })
  it('守恒破坏检测（自洽检查）：质子数不守恒应报 zOk=false', () => {
    const bad = nuclearReaction([{ sp: 'n', a: 1, z: 0 }], [{ sp: 'p', a: 1, z: 1 }])
    expect(bad.aOk).toBe(true)
    expect(bad.zOk).toBe(false)
  })
})

describe('卡 66 微元积分', () => {
  it('弹簧功 W=½kx²（教材闭式）vs 辛普森数值积分（方法独立两法，±1e-9）', () => {
    const k = 100, x = 0.5
    expect(simpsonWork((xx) => k * xx, x)).toBeCloseTo(springWork(k, x), 9)  // 12.5 J
    expect(springWork(k, x)).toBeCloseTo(12.5, 9)
  })
  it('线性力 F=const（方法独立：矩形面积 Fx vs 辛普森）', () => {
    expect(simpsonWork(() => 10, 3)).toBeCloseTo(30, 9)
  })
})

describe('卡 24 超重失重', () => {
  it('N=m(g±a)（牛顿第二定律闭式）：超重 60×11.8=708N / 匀速 588N / 失重 468N', () => {
    expect(scaleReading(60, 2)).toBeCloseTo(708, 9)
    expect(scaleReading(60, 0)).toBeCloseTo(588, 9)
    expect(scaleReading(60, -2)).toBeCloseTo(468, 9)
  })
  it('完全失重边界（教材规律锚）：a=−g → N=0', () => {
    expect(scaleReading(60, -9.8)).toBeCloseTo(0, 9)
  })
  it('装置入口三阶段读数曲线（runMisc）', () => {
    const f = runMisc([{ id: 'e', type: 'elevator_scale', x: 0, y: 0, angle: 0, params: { m: 60, a: 2, t_acc: 2, t_const: 2 } }])
    expect(f[0].readings.N).toBeCloseTo(708, 6)      // 加速段超重
    expect(f[30].readings.N).toBeCloseTo(588, 6)     // 中段匀速
    expect(f[60].readings.N).toBeCloseTo(468, 6)     // 减速段失重
  })
})
