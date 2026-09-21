/**
 * vector_arrow 加速度噪声与滞回单测（第三十一轮 追问1/5）：
 * 历史教训（accel_sensor）：两点差分 13-34% 噪声；最小二乘拟合降到 0.3%。
 * 本测验证同法在显示箭头上的量级：恒加速度序列（含帧量化噪声）→ 拟合斜率误差 <2%。
 */
import { describe, it, expect } from 'vitest'
import { accelFromWindow, shouldShowArrow, type VelSample } from './vectorArrow'

describe('accelFromWindow —— 最小二乘加速度（rAF 差分替代）', () => {
  it('恒加速度 a=(2, -9.8)：无噪序列斜率精确', () => {
    const win: VelSample[] = Array.from({ length: 8 }, (_, i) => ({ vx: 2 * (i / 30), vy: -9.8 * (i / 30) }))
    const a = accelFromWindow(win)
    expect(a.ax).toBeCloseTo(2, 6)
    expect(a.ay).toBeCloseTo(-9.8, 6)
  })
  it('含 ±0.02 m/s 帧量化噪声：斜率误差 <2%（两点差分同噪可达 30%）', () => {
    let seed = 42
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed / 2147483647 - 0.5) * 2 }
    const win: VelSample[] = Array.from({ length: 8 }, (_, i) => ({
      vx: 4 * (i / 30) + rnd() * 0.02,
      vy: -9.8 * (i / 30) + rnd() * 0.02,
    }))
    const a = accelFromWindow(win)
    expect(Math.abs(a.ax - 4) / 4).toBeLessThan(0.02)
    expect(Math.abs(a.ay + 9.8) / 9.8).toBeLessThan(0.02)
  })
  it('窗口 <4 采样返回 0（启动期不闪箭头）', () => {
    expect(accelFromWindow([])).toEqual({ ax: 0, ay: 0 })
    expect(accelFromWindow([{ vx: 1, vy: 1 }])).toEqual({ ax: 0, ay: 0 })
  })
})

describe('shouldShowArrow —— 滞回防边界闪烁', () => {
  it('显示态 0.03 保持（>0.02），0.015 隐藏（<0.02）', () => {
    expect(shouldShowArrow(0.03, false)).toBe(true)
    expect(shouldShowArrow(0.015, false)).toBe(false)
  })
  it('隐藏态 0.03 不显示（<0.05），0.06 才恢复——边界抖动被滞回带吸收', () => {
    expect(shouldShowArrow(0.03, true)).toBe(false)
    expect(shouldShowArrow(0.06, true)).toBe(true)
  })
})
