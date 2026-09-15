import { describe, it, expect } from 'vitest'
import { TapeSampler } from './TapeSampler'

const PERIOD = 0.02
const T = PERIOD * 5 // 计数点间隔 0.1s

/** 按 x(t) = x₀ + v₀t + ½at² 生成 n 个打点位置（无噪声，可精确校验） */
const kinematic = (x0: number, v0: number, a: number, n: number): number[] =>
  Array.from({ length: n }, (_, i) => {
    const t = i * PERIOD
    return x0 + v0 * t + 0.5 * a * t * t
  })

describe('TapeSampler —— 纸带采样与逐差法（B2 冻结）', () => {
  it('punch/points：索引递增，t = i·period', () => {
    const ts = new TapeSampler()
    ts.punch(0); ts.punch(0.01); ts.punch(0.02)
    const pts = ts.points
    expect(pts.map((p) => p.index)).toEqual([0, 1, 2])
    expect(pts.map((p) => p.x)).toEqual([0, 0.01, 0.02])
    pts.forEach((p, i) => expect(p.t).toBeCloseTo(i * PERIOD, 12))
  })

  it('countingPoints：每 5 个原始点取一个计数点，interval 为相邻计数点位移', () => {
    const ts = TapeSampler.fromPositions(Array.from({ length: 11 }, (_, i) => i * 0.01))
    const cps = ts.countingPoints
    expect(cps).toHaveLength(3)
    expect(cps.map((c) => c.index)).toEqual([0, 1, 2])
    cps.forEach((c, j) => expect(c.t).toBeCloseTo(j * T, 12))
    expect(cps[0].interval).toBe(0)
    expect(cps[1].interval).toBeCloseTo(0.05, 12)
    expect(cps[2].interval).toBeCloseTo(0.05, 12)
  })

  it('匀速运动：加速度≈0，各点瞬时速度与平均速度均等于 v', () => {
    const ts = TapeSampler.generate(0, 0.5, 0, 1, PERIOD, 0)
    const r = ts.analyze()
    expect(r.acceleration).not.toBeNull()
    expect(r.acceleration!).toBeCloseTo(0, 9)
    expect(r.instantaneousVelocities).toHaveLength(9)
    r.instantaneousVelocities.forEach((v) => expect(v).toBeCloseTo(0.5, 9))
    expect(r.averageVelocity).toBeCloseTo(0.5, 9)
  })

  it('匀加速 6 段（偶数）：逐差法 a=[(x₄+x₅+x₆)−(x₁+x₂+x₃)]/9T² 精确还原', () => {
    const a = 2
    const ts = TapeSampler.fromPositions(kinematic(0, 0, a, 31)) // 7 计数点 → 6 段
    const r = ts.analyze()
    expect(r.intervals).toHaveLength(6)
    expect(r.acceleration!).toBeCloseTo(a, 6)
    // v₀=0 时瞬时速度 v_j = a·t_j，t_j = j·T
    r.instantaneousVelocities.forEach((v, i) => expect(v).toBeCloseTo(a * (i + 1) * T, 6))
  })

  it('匀加速 5 段（奇数）：丢中间段，前后各 2 段逐差', () => {
    const a = 3
    const ts = TapeSampler.fromPositions(kinematic(0.1, 0.2, a, 26)) // 6 计数点 → 5 段
    const r = ts.analyze()
    expect(r.intervals).toHaveLength(5)
    expect(r.acceleration!).toBeCloseTo(a, 6)
  })

  it('仅 2～3 段：退化为相邻段差 a=(x₂−x₁)/T²', () => {
    const a = 1.5
    const two = TapeSampler.fromPositions(kinematic(0, 0, a, 11)).analyze() // 3 计数点 → 2 段
    expect(two.intervals).toHaveLength(2)
    expect(two.acceleration!).toBeCloseTo(a, 6)
    const three = TapeSampler.fromPositions(kinematic(0, 0, a, 16)).analyze() // 4 计数点 → 3 段
    expect(three.intervals).toHaveLength(3)
    expect(three.acceleration!).toBeCloseTo(a, 6)
  })

  it('计数点不足 3 个：加速度 null，段位移/速度为空，平均速度 0', () => {
    const r = TapeSampler.fromPositions(kinematic(0, 1, 0, 6)).analyze() // 仅 2 计数点
    expect(r.counting).toHaveLength(2)
    expect(r.acceleration).toBeNull()
    expect(r.intervals).toEqual([])
    expect(r.instantaneousVelocities).toEqual([])
    expect(r.averageVelocity).toBe(0)
    expect(r.raw).toHaveLength(6)
  })

  it('平均速度 = 总位移 / 总时间', () => {
    // a=2、v₀=0，6 段共 0.6s，位移 ½·2·0.6² = 0.36m → 0.6 m/s
    const r = TapeSampler.fromPositions(kinematic(0, 0, 2, 31)).analyze()
    expect(r.averageVelocity).toBeCloseTo(0.6, 6)
  })

  it('generate：点数 = floor(duration/period)+1，noise=0 时严格满足运动学公式', () => {
    const ts = TapeSampler.generate(0.05, 0.3, 1.2, 1, PERIOD, 0)
    const pts = ts.points
    expect(pts).toHaveLength(51)
    expect(ts.period).toBe(PERIOD)
    pts.forEach((p) => expect(p.x).toBeCloseTo(0.05 + 0.3 * p.t + 0.6 * p.t * p.t, 9))

    // 带噪声时每点偏差不超过 noise/2
    const noisy = TapeSampler.generate(0, 0.3, 0, 0.5, PERIOD, 0.001).points
    noisy.forEach((p) => expect(Math.abs(p.x - 0.3 * p.t)).toBeLessThanOrEqual(0.0005 + 1e-12))
  })

  it('serialize/deserialize 往返一致，分析结果相同', () => {
    const src = TapeSampler.fromPositions(kinematic(0, 0.1, 2, 31))
    const data = src.serialize()
    expect(data.period).toBe(PERIOD)
    expect(data.nInterval).toBe(5)
    expect(data.positions).toHaveLength(31)

    const copy = TapeSampler.deserialize(JSON.parse(JSON.stringify(data)))
    expect(copy.points).toEqual(src.points)
    expect(copy.analyze()).toEqual(src.analyze())
  })
})
