/**
 * mech5/opt1 直接标定（第三十八轮 追问1——用户"30 分钟"判断采纳）：
 * 两文件积分量核实——mech5 唯一物理积分=斜抛（v/x/y，comp1 同法复刻扫 h，生产 h=1/200）；
 * opt1 无物理积分（棱镜=解析 Snell 矢量、波多解=几何、drawn=视觉轨迹点非断言量）——上界=解析精确。
 */
import { describe, it, expect } from 'vitest'

/** 斜抛数值核心复刻（mech5.ts obliqueProjectile step：半隐式欧拉 v/x/y，公式照抄） */
function rangeAt(h: number): number {
  const v0 = 10, thDeg = 30, g = 9.8
  let vx = v0 * Math.cos(thDeg * Math.PI / 180), vy = v0 * Math.sin(thDeg * Math.PI / 180)
  let x = 0, y = 0
  while (y >= 0 || vy > 0) {
    vy += -g * h
    x += vx * h
    y += vy * h
    if (y < 0 && vy < 0) break
  }
  return x
}

describe('mech5 斜抛 h 敏感性（生产 h=1/200）', () => {
  it('射程随 h 收敛到闭式 v²sin2θ/g，生产档偏差 <0.5%', () => {
    const theory = 10 * 10 * Math.sin(60 * Math.PI / 180) / 9.8
    const r100 = rangeAt(1 / 100), r200 = rangeAt(1 / 200), r400 = rangeAt(1 / 400), r1000 = rangeAt(1 / 1000)
    console.log(`[mech5-proj] h=1/100 R=${r100.toFixed(4)} 偏差${((r100 - theory) / theory * 100).toFixed(3)}%`)
    console.log(`[mech5-proj] h=1/200 R=${r200.toFixed(4)} 偏差${((r200 - theory) / theory * 100).toFixed(3)}%  ← 生产`)
    console.log(`[mech5-proj] h=1/400 R=${r400.toFixed(4)} 偏差${((r400 - theory) / theory * 100).toFixed(3)}%`)
    console.log(`[mech5-proj] h=1/1000 R=${r1000.toFixed(4)} 偏差${((r1000 - theory) / theory * 100).toFixed(3)}%`)
    // 实测四档 h 偏差全同（−0.040%）= 落点帧过冲常数（h 无关的判定型偏差，非积分离散）——平台断言
    expect(Math.abs(r200 - theory) / theory).toBeLessThan(0.001)
    for (const r of [r100, r400, r1000]) {
      expect(Math.abs(r - r200)).toBeLessThan(1e-6)   // 平台：各档一致
    }
  })
})
