import { describe, it, expect } from 'vitest'
import { ProcessTimeline, crossing, EnergyMomentumTracker } from './multiProcess'

describe('B9 多过程引擎', () => {
  it('crossing：一步内穿越阈值的插值位置', () => {
    expect(crossing(1, -1)).toBeCloseTo(0.5)
    expect(crossing(2, -2, 0)).toBeCloseTo(0.5)
    expect(crossing(3, 1, 2)).toBeCloseTo(0.5)
    expect(crossing(1, 2)).toBeNull()
    expect(crossing(-1, -3)).toBeNull()
  })
  it('ProcessTimeline：分段、切换记录临界事件、推进', () => {
    const tl = new ProcessTimeline()
    tl.start('平抛', '#4A90D9')
    tl.advance(0.8)
    tl.switchTo('圆周', '#F5C542', 0.8, '切入轨道')
    tl.advance(2.0)
    expect(tl.segments.map((s) => s.name)).toEqual(['平抛', '圆周'])
    expect(tl.segments[0]).toMatchObject({ t0: 0, t1: 0.8 })
    expect(tl.segments[1]).toMatchObject({ t0: 0.8, t1: 2.0 })
    expect(tl.events).toEqual([{ t: 0.8, text: '切入轨道' }])
    expect(tl.duration).toBe(2.0)
  })
  it('EnergyMomentumTracker：动能/势能/动量汇总', () => {
    const tr = new EnergyMomentumTracker(10)
    const tot = tr.totals([{ name: 'a', m: 2, x: 0, y: 1, vx: 3, vy: 0 }, { name: 'b', m: 1, x: 0, y: 0, vx: -2, vy: 0 }], 0, { heat: 5 })
    expect(tot.Ek).toBeCloseTo(0.5 * 2 * 9 + 0.5 * 1 * 4)
    expect(tot.Ep).toBeCloseTo(2 * 10 * 1)
    expect(tot.px).toBeCloseTo(6 - 2)
    expect(tot.E).toBeCloseTo(9 + 2 + 20 + 5)
  })
  it('板块模型理论：共速与相对位移公式自洽（Q = 动能损失）', () => {
    const m = 1, M = 3, mu = 0.2, g = 9.8, v0 = 4
    const vc = (m * v0) / (m + M)
    const ds = (M * v0 * v0) / (2 * mu * g * (m + M))
    const Q = mu * m * g * ds
    const dEk = 0.5 * m * v0 * v0 - 0.5 * (m + M) * vc * vc
    expect(Q).toBeCloseTo(dEk, 9)
  })
})
