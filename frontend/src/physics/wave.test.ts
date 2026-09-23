/** 波动引擎单测（P3 批 4）：方法独立锚（数值 vs 闭式）+ 教材规律 */
import { describe, expect, it } from 'vitest'
import { waveY, waveMultiSolution, firstCrestTime, particleVelDir, pathDiff, runWave } from './wave'

describe('波动引擎（卡 58/59/60）', () => {
  it('规格一致性：输出波形的 λ/T 对输入参数（规格核对，非物理定律独立验证）', () => {
    const A = 1, lambda = 4, T = 2, dir = 1 as const
    // 测 λ：y(x,0) 相邻两极大值的 x 距离
    const xs: number[] = []
    let prev = -9, prev2 = -9
    for (let x = 0; x <= 3 * lambda; x += lambda / 400) {
      const y = waveY(x, 0, A, lambda, T, dir)
      if (prev2 < prev && prev > y && prev > 0.99) xs.push(x)
      prev2 = prev; prev = y
    }
    const lambdaMeas = xs[1] - xs[0]
    // 测 T：y(0,t) 相邻两极大值的时距
    const ts: number[] = []
    prev = -9; prev2 = -9
    for (let t = 0; t <= 2.2 * T; t += T / 400) {
      const y = waveY(0, t, A, lambda, T, dir)
      if (prev2 < prev && prev > y && prev > 0.99) ts.push(t)
      prev2 = prev; prev = y
    }
    const tMeas = ts[1] - ts[0]
    expect(lambdaMeas).toBeCloseTo(lambda, 2)
    expect(tMeas).toBeCloseTo(T, 2)
    expect(lambdaMeas / tMeas).toBeCloseTo(lambda / T, 2)  // 比值断言（近循环，由上两条蕴含——保留作回归哨兵）
  })

  it('首峰时刻 T(1/4+x_P/λ)（方法独立·同一 y 函数：数值扫描首极大 vs 相位闭式——非物理出处独立）', () => {
    const lambda = 4, T = 2, xP = 1
    const closed = firstCrestTime(xP, lambda, T, 1)
    expect(closed).toBeCloseTo(T * (0.25 + xP / lambda), 9)   // 2×0.5=1.0s
    // 数值：细扫 y(x_P,t) 找 t>0 首个局部极大
    let prev = -9, prev2 = -9, tFirst = -1
    for (let t = 0; t <= 2.2; t += 1e-4) {
      const y = waveY(xP, t, 1, lambda, T, 1)
      if (prev2 < prev && prev >= y && prev > 0.999 && tFirst < 0) tFirst = t
      prev2 = prev; prev = y
    }
    expect(tFirst).toBeCloseTo(closed, 2)
  })

  it('同侧法（教学校验：教学图解规则 vs 解析 ∂y/∂t——非物理定律）', () => {
    // t=0 波形 y=sin(−πx/2)（+x 传播）：x=2 沿 +x 波形上升（上坡）→ 质点向下；
    // x=4 沿 +x 波形下降（下坡）→ 质点向上
    expect(particleVelDir(2, 0, 1, 4, 2, 1)).toBe(-1)
    expect(particleVelDir(4, 0, 1, 4, 2, 1)).toBe(1)   // 同侧法：下坡上行
  })

  it('波多解通式（教材例题形态）：λ=4 Δx₀=1 Δt=1 n=1 → +x v=5、−x v=7', () => {
    const p = waveMultiSolution(4, 1, 1, 1, 1)
    const m = waveMultiSolution(4, 1, 1, -1, 1)
    expect(p.dx).toBeCloseTo(5, 9); expect(p.v).toBeCloseTo(5, 9)
    expect(m.dx).toBeCloseTo(7, 9); expect(m.v).toBeCloseTo(7, 9)
    expect(p.T).toBeCloseTo(0.8, 9)   // T=λ/v=4/5
  })

  it('干涉（方法独立）：Δr=kλ 点叠加振幅扫描最大 vs 光程差判据', () => {
    const lambda = 2, T = 0.5
    // P(1,0)，S₁=(−2,0)，S₂=(2,0)：Δr=|3−1|=2=λ → 同相加强
    expect(pathDiff(1, 0, [-2, 0], [2, 0])).toBeCloseTo(2, 9)
    // 数值：加强点两波同相叠加 |y₁+y₂| 最大=2；减弱点=0
    const yAmp = (phase2: number) => {
      let m = 0
      for (let t = 0; t < T; t += T / 100) {
        m = Math.max(m, Math.abs(Math.sin(2 * Math.PI * t / T) + Math.sin(2 * Math.PI * t / T + phase2)))
      }
      return m
    }
    expect(yAmp(0)).toBeCloseTo(2, 6)        // 同相 → 2A
    expect(yAmp(Math.PI)).toBeCloseTo(0, 6)  // 反相 → 0
  })

  it('装置入口：三类型读数', () => {
    const wm = runWave([{ id: 'a', type: 'wave_multi', x: 0, y: 0, angle: 0, params: { lambda: 4, dx0: 1, dt: 1, n: 1 } }])
    expect(wm[0].readings.v_plus).toBeCloseTo(5, 9)
    const wg = runWave([{ id: 'b', type: 'wave_graphs', x: 0, y: 0, angle: 0, params: { a: 1, lambda: 4, T: 2, dir: 1, x_p: 1 } }])
    expect(wg[0].readings.v).toBeCloseTo(2, 9)
    expect(wg[0].readings.t_crest).toBeCloseTo(1.0, 9)
    const ws = runWave([{ id: 'c', type: 'wave_super', x: 0, y: 0, angle: 0, params: { lambda: 2, d: 4, px: 1, py: 0 } }])
    expect(ws[0].readings.delta_r).toBeCloseTo(2, 9)
    expect(ws[0].readings.enhanced).toBe(1)
  })

  it('v=λ/T 方法独立锚：局部窗口追踪单一波峰位移（采样极值——同一 y 函数两测量协议，非物理出处独立）', () => {
    const A = 1, lambda = 4, T = 2, dir = 1 as const
    // t=0：在 [λ, 2λ) 窗口找波峰 x₀；t=Δt：在 [x₀, x₀+λ) 局部窗口找同波峰新位置
    const findPeak = (t: number, x0: number, x1: number) => {
      let best = -9, bx = 0
      for (let x = x0; x < x1; x += lambda / 1000) {
        const y = waveY(x, t, A, lambda, T, dir)
        if (y > best) { best = y; bx = x }
      }
      return bx
    }
    const x0 = findPeak(0, lambda, 2 * lambda)
    const dt = 0.37   // 非整周期采样，避免巧合
    const x1p = findPeak(dt, x0, x0 + lambda)
    const vMeas = (x1p - x0) / dt
    expect(vMeas).toBeCloseTo(lambda / T, 2)   // 传播速度测量值 vs λ/T 闭式（第三量独立）
  })
})
