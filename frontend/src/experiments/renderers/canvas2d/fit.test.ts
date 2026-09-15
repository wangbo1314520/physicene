import { describe, it, expect } from 'vitest'
import { linearFit, weightedFit, toPaperFit } from './fit'
import type { PaperPoint } from '../../core/processedData'

/** 生成严格落在 y = kx + b 上的点 */
const line = (k: number, b: number, xs: number[]): PaperPoint[] =>
  xs.map((x) => ({ x, y: k * x + b }))

describe('fit —— 最小二乘拟合（B1 冻结）', () => {
  it('完美直线 y=2x+1：k=2、b=1、R²=1、残差全 0', () => {
    const r = linearFit(line(2, 1, [0, 1, 2, 3, 4]))
    expect(r.k).toBeCloseTo(2, 9)
    expect(r.b).toBeCloseTo(1, 9)
    expect(r.r2).toBeCloseTo(1, 9)
    expect(r.n).toBe(5)
    r.residuals.forEach((v) => expect(v).toBeCloseTo(0, 9))
  })

  it('过原点拟合：b≡0，k=Σxy/Σx²', () => {
    const exact = linearFit(line(3, 0, [1, 2, 3, 4]), true)
    expect(exact.k).toBeCloseTo(3, 9)
    expect(exact.b).toBe(0)

    // 数据本身不过原点（y=2x+1）时，强制过原点的斜率应为 Σxy/Σx² = 13/5
    const forced = linearFit([{ x: 1, y: 3 }, { x: 2, y: 5 }], true)
    expect(forced.k).toBeCloseTo(2.6, 9)
    expect(forced.b).toBe(0)
  })

  it('默认剔除 outlier：拟合不受异常点影响，其残差记 null', () => {
    const pts = line(2, 1, [0, 1, 2, 3])
    pts.push({ x: 4, y: 100, outlier: true })
    const r = linearFit(pts)
    expect(r.k).toBeCloseTo(2, 9)
    expect(r.b).toBeCloseTo(1, 9)
    expect(r.n).toBe(4)
    expect(r.residuals).toHaveLength(5)
    expect(r.residuals[4]).toBeNull()
  })

  it('excludeOutliers=false 时异常点参与拟合，斜率被拉偏', () => {
    const pts = line(2, 1, [0, 1, 2, 3])
    pts.push({ x: 4, y: 100, outlier: true })
    const r = linearFit(pts, false, false)
    expect(r.n).toBe(5)
    expect(r.k).toBeGreaterThan(2)
    expect(r.residuals[4]).not.toBeNull()
  })

  it('非有限坐标（NaN / Infinity）被过滤，残差记 null', () => {
    const pts = line(1, 0, [0, 1, 2])
    pts.push({ x: NaN, y: 1 }, { x: 1, y: Infinity })
    const r = linearFit(pts)
    expect(r.n).toBe(3)
    expect(r.k).toBeCloseTo(1, 9)
    expect(r.residuals[3]).toBeNull()
    expect(r.residuals[4]).toBeNull()
  })

  it('空点集：k/b/R² 为 NaN，n=0', () => {
    const r = linearFit([])
    expect(r.n).toBe(0)
    expect(Number.isNaN(r.k)).toBe(true)
    expect(Number.isNaN(r.b)).toBe(true)
    expect(Number.isNaN(r.r2)).toBe(true)
  })

  it('单点：k 为 NaN，b 取该点 y', () => {
    const r = linearFit([{ x: 2, y: 7 }])
    expect(r.n).toBe(1)
    expect(Number.isNaN(r.k)).toBe(true)
    expect(r.b).toBe(7)
  })

  it('所有 x 相同（垂直线）：分母为 0，k 为 NaN', () => {
    const r = linearFit([{ x: 1, y: 1 }, { x: 1, y: 2 }, { x: 1, y: 3 }])
    expect(Number.isNaN(r.k)).toBe(true)
  })

  it('含噪声数据：残差和≈0（OLS 性质），0<R²<1', () => {
    const noise = [0.1, -0.2, 0.15, -0.05, 0.05, -0.05]
    const pts = line(1.5, 0.5, [0, 1, 2, 3, 4, 5]).map((p, i) => ({ ...p, y: p.y + noise[i] }))
    const r = linearFit(pts)
    const sum = r.residuals.reduce<number>((s, v) => s + (v ?? 0), 0)
    expect(sum).toBeCloseTo(0, 9)
    expect(r.r2).toBeGreaterThan(0.9)
    expect(r.r2).toBeLessThan(1)
  })

  it('toPaperFit：保留 seriesId/throughOrigin，数值四舍五入到 1e-6，null 残差保留', () => {
    const r = linearFit(line(2, 1, [0, 1, 2]))
    const pf = toPaperFit('s1', { ...r, residuals: [0.1234567891, null, 0] }, false)
    expect(pf.seriesId).toBe('s1')
    expect(pf.throughOrigin).toBe(false)
    expect(pf.k).toBe(2)
    expect(pf.b).toBe(1)
    expect(pf.residuals[0]).toBe(0.123457)
    expect(pf.residuals[1]).toBeNull()
    expect(pf.n).toBe(3)
  })

  it('weightedFit：等权时与普通 OLS 一致；n<2 返回 NaN', () => {
    const noise = [0.1, -0.1, 0.05, -0.05]
    const pts = line(2, 1, [0, 1, 2, 3]).map((p, i) => ({ ...p, y: p.y + noise[i], sy: 0.5 }))
    const w = weightedFit(pts)
    const o = linearFit(pts)
    expect(w.k).toBeCloseTo(o.k, 9)
    expect(w.b).toBeCloseTo(o.b, 9)
    expect(Number.isNaN(weightedFit([{ x: 1, y: 1 }]).k)).toBe(true)
  })

  it('weightedFit：大 σ 点权重低，拟合贴近小 σ 点', () => {
    const pts: PaperPoint[] = [
      { x: 0, y: 0, sy: 0.01 }, { x: 1, y: 1, sy: 0.01 }, { x: 2, y: 2, sy: 0.01 },
      { x: 3, y: 10, sy: 100 },
    ]
    const w = weightedFit(pts)
    expect(w.k).toBeCloseTo(1, 3)
    expect(w.b).toBeCloseTo(0, 3)
    // 无权 OLS 会被离群点拉到 k=3.1，加权后明显更接近真值 1
    const o = linearFit(pts)
    expect(Math.abs(o.k - 1)).toBeGreaterThan(Math.abs(w.k - 1))
  })
})
