/**
 * q 离散误差的 h 敏感性扫描（第二十九轮追问4 的完全验证，第三十轮闭合）：
 * EMScene.vue:42 `substep(dt·timeScale, def.h ?? 1/2000, d => step(...))`——
 * 场景物理步长 = def.h（em7 未定义 → 1/2000=0.5ms），**不是播放帧 1/60**。
 * 本测试以正确 h 语义复刻 em7.ts L129-141 数值核心，扫 h 验证 q 收敛性。
 */
import { describe, it, expect } from 'vitest'

function qAt(h: number): number {
  const p = { v0: 4, B: 1, L: 1, a: 1, d: 2.5, m: 1, R: 1 }
  const X0 = -2.5, X1 = X0 + p.d * 2
  let x = -8, v = p.v0, ph = 0, q = 0
  const BL = p.B * p.L
  for (let k = 0; k < 8_000_000; k++) {
    const front = x + p.a, back = x - p.a
    const cutting = (front > X0 && front < X1) !== (back > X0 && back < X1)
    const sign = front > X0 && front < X1 ? 1 : -1
    const i = cutting ? (sign * BL * v) / p.R : 0
    const F = cutting ? -(BL * BL * v) / p.R : 0
    v = Math.max(0, v + (F / p.m) * h)
    x += v * 2 * h
    q += Math.abs(i) * h
    if (ph === 1 && back >= X0) { ph = 2; break }
    if (ph === 0 && front >= X0) ph = 1
  }
  return q
}

describe('q=BLa/R 的 h 敏感性（真实步长 def.h=1/2000 语义）', () => {
  it('粗步长区收敛 + 生产步长偏差 <0.05%（与 E2E 显示 0.999 闭合）', () => {
    const q1 = qAt(1 / 1000)
    const q2 = qAt(1 / 2000)
    const q4 = qAt(1 / 4000)
    const theory = 1.000
    console.log(`[q-scan h=1/1000] q=${q1.toFixed(5)} 偏差 ${((q1 - theory) / theory * 100).toFixed(4)}%`)
    console.log(`[q-scan h=1/2000] q=${q2.toFixed(5)} 偏差 ${((q2 - theory) / theory * 100).toFixed(4)}%  ← 生产步长`)
    console.log(`[q-scan h=1/4000] q=${q4.toFixed(5)} 偏差 ${((q4 - theory) / theory * 100).toFixed(4)}%`)
    // 两段式：①粗→生产单调收敛（离散误差主导区）②h≤1/2000 进入 <0.05% 平台
    //（极限区残留 −0.03~−0.04% = 阶段判定过冲 + 浮点累积，量级 3e-4 且符号稳定——非引擎错误）
    expect(Math.abs(q2 - theory)).toBeLessThan(Math.abs(q1 - theory))
    expect(Math.abs(q2 - theory) / theory).toBeLessThan(0.0005)
    expect(Math.abs(q4 - theory) / theory).toBeLessThan(0.0005)
  })
})
