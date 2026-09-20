/**
 * resolveAnchors 统一锚点机制单测（任务 E · bracket/pole 批）
 * 覆盖：8 缺陷元件旋转矩阵 / pole·vwall 参数化跟随 / spring·rope 非默认长度 /
 *      belt th 叠加（三层一致）/ bracket 定位 / 前向兼容（ID 引用）/ findSnap 旋转吸附 <1e-6
 */
import { describe, it, expect } from 'vitest'
import { resolveAnchors, resolveAnchorById, resolveTilt, anchorWorldOf } from './anchors'
import { findSnap, applySnap } from './snap'
import type { GeoElement } from '../catalog'
import { BRACKET_ARM, BRACKET_POST } from '../catalog'

const el = (type: string, x: number, y: number, params: Record<string, number> = {}, angle = 0): GeoElement => ({
  id: `t-${type}`, type, position: { x, y }, angle, params,
  isFixed: false, role: 'constraint', links: [],
})
const R = (d: number) => (d * Math.PI) / 180
const closeTo = (a: { x: number; y: number }, x: number, y: number, digits = 3) => {
  expect(a.x).toBeCloseTo(x, digits)
  expect(a.y).toBeCloseTo(y, digits)
}

describe('8 缺陷元件旋转单测（世界 = position + R(angle+tilt)·local）', () => {
  it('cart L=4 angle=30° → 右端 (1.732, 1.000)', () => {
    closeTo(anchorWorldOf(el('cart', 0, 0, { L: 4 }, R(30)), '右端'), 4 / 2 * Math.cos(R(30)), 4 / 2 * Math.sin(R(30)))
    closeTo(anchorWorldOf(el('cart', 0, 0, { L: 4 }, R(30)), '左端'), -1.732, -1.000)
  })
  it('slope θ=30° L=6：angle=0 顶 (0,3.464)/底 (6,0)；angle=90° 顶 (−3.464,0)/底 (0,6)', () => {
    closeTo(anchorWorldOf(el('slope', 0, 0, { L: 6, th: 30 }, 0), '顶端'), 0, 6 * Math.tan(R(30)))
    closeTo(anchorWorldOf(el('slope', 0, 0, { L: 6, th: 30 }, 0), '底端'), 6, 0)
    closeTo(anchorWorldOf(el('slope', 0, 0, { L: 6, th: 30 }, R(90)), '顶端'), -3.464, 0)
    closeTo(anchorWorldOf(el('slope', 0, 0, { L: 6, th: 30 }, R(90)), '底端'), 0, 6)
  })
  it('vwall H=3：angle=0 墙顶 (0,3)/面中 (0,1.5)；angle=90° 墙顶 (−3,0)', () => {
    closeTo(anchorWorldOf(el('vwall', 0, 0, { H: 3 }, 0), '墙顶'), 0, 3)
    closeTo(anchorWorldOf(el('vwall', 0, 0, { H: 3 }, 0), '墙面中点'), 0, 1.5)
    closeTo(anchorWorldOf(el('vwall', 0, 0, { H: 3 }, R(90)), '墙顶'), -3, 0)
  })
  it('lead_in L=3 angle=45° → 首端 (1.061, 1.061)', () => {
    closeTo(anchorWorldOf(el('lead_in', 0, 0, { L: 3 }, R(45)), '首端'), 1.061, 1.061)
  })
  it('belt L=8 th=10° angle=20° → 右端上表面 (3.389, 2.130)——th+angle 复合旋转', () => {
    closeTo(anchorWorldOf(el('belt', 0, 0, { L: 8, th: 10 }, R(20)), '右端上表面'), 3.389, 2.130)
  })
  it('loop_track R=2：angle=0 入口 (0,−2)/顶 (0,2)；angle=90° 入口 (2,0)/顶 (−2,0)', () => {
    closeTo(anchorWorldOf(el('loop_track', 0, 0, { radius: 2 }, 0), '入口切点'), 0, -2)
    closeTo(anchorWorldOf(el('loop_track', 0, 0, { radius: 2 }, 0), '顶点'), 0, 2)
    closeTo(anchorWorldOf(el('loop_track', 0, 0, { radius: 2 }, R(90)), '入口切点'), 2, 0)
    closeTo(anchorWorldOf(el('loop_track', 0, 0, { radius: 2 }, R(90)), '顶点'), -2, 0)
  })
  it('spring L0=2 angle=30° → 右端 (1.732, 1.000)；rope L=3 angle=90° → 右端 (0, 3)', () => {
    closeTo(anchorWorldOf(el('spring', 0, 0, { L0: 2 }, R(30)), '右端'), 1.732, 1.000)
    closeTo(anchorWorldOf(el('rope', 0, 0, { L: 3 }, R(90)), '右端'), 0, 3)
  })
})

describe('参数化锚点跟随', () => {
  it('pole H=1.2 → mount (0,0.6)；H=2.0 → mount (0,1.0)', () => {
    closeTo(anchorWorldOf(el('pole', 0, 0, { H: 1.2 }), 'mount'), 0, 0.6)
    closeTo(anchorWorldOf(el('pole', 0, 0, { H: 2.0 }), 'mount'), 0, 1.0)
  })
  it('vwall H 6→3：墙顶 (0,6)→(0,3)（静态目录写死缺陷已修）', () => {
    closeTo(anchorWorldOf(el('vwall', 0, 0, { H: 6 }), '墙顶'), 0, 6)
    closeTo(anchorWorldOf(el('vwall', 0, 0, { H: 3 }), '墙顶'), 0, 3)
  })
  it('spring/rope 非默认长度：L0=2 右端 local (2,0)；L=3 右端 local (3,0)', () => {
    expect(resolveAnchorById(el('spring', 0, 0, { L0: 2 }), '右端').local).toEqual({ x: 2, y: 0 })
    expect(resolveAnchorById(el('rope', 0, 0, { L: 3 }), '右端').local).toEqual({ x: 3, y: 0 })
  })
  it('bracket：mount 默认 (0.8, 0.4)，与常量一致', () => {
    expect(resolveAnchorById(el('bracket', 0, 0), 'mount').local).toEqual({ x: BRACKET_ARM, y: BRACKET_POST })
  })
  it('belt 带面 y = BELT_RADIUS 不随 L 变；x 随 L（L=8 右端 x=4）', () => {
    const a = resolveAnchors(el('belt', 0, 0, { L: 8 }))
    const right = a.find((t) => t.id === '右端上表面')!
    expect(right.local.x).toBeCloseTo(4, 6)
    expect(right.local.y).toBeCloseTo(0.15, 6)
  })
})

describe('tilt 语义（角度参数叠加排查定案）', () => {
  it('唯一叠加型 = belt.th；slope.th 是几何构形不叠加', () => {
    expect(resolveTilt(el('belt', 0, 0, { th: 10 }))).toBeCloseTo(R(10), 9)
    expect(resolveTilt(el('slope', 0, 0, { th: 30 }))).toBe(0)
    expect(resolveTilt(el('pole', 0, 0, { H: 1.2 }))).toBe(0)
  })
})

describe('前向兼容：锚点 ID 引用（旧场景零迁移）', () => {
  it('vwall H=3 场景中 rope 链「墙顶」→ 解析到真实墙顶 (0,3)，链接不断', () => {
    const wall = el('vwall', 2, -1, { H: 3 })
    wall.id = 'w1'
    const ropeEl = el('rope', 0, 0, { L: 2 })
    ropeEl.id = 'r1'
    ropeEl.links = [{ toId: 'w1', kind: 'rope', anchorA: '右端', anchorB: '墙顶' }]
    // 旧解析（静态目录 (0,6)）会接到 (2,5)；新解析按 H=3 → (2,2)
    closeTo(anchorWorldOf(wall, '墙顶'), 2, 2)
  })
})

describe('吸附行为：旋转斜面 + 块吸附（验证级，非仅数学）', () => {
  it('slope angle=90° 顶端世界 (-3.464,0)：块拖至附近 → findSnap 提案 → apply 后锚点距 <1e-6', () => {
    const slopeEl = el('slope', 0, 0, { L: 6, th: 30 }, R(90))
    slopeEl.id = 's1'
    // 顶端世界 = (0,0) + R(90°)·(0, 3.464) = (-3.464, 0)；块右锚 (0.5,0) 欲贴合 → 块心放 (-3.464-0.5+0.2, 0.2)
    const top = anchorWorldOf(slopeEl, '顶端')
    const block: GeoElement = {
      id: 'b1', type: 'block', position: { x: top.x - 0.5 + 0.2, y: top.y + 0.2 }, angle: 0,
      params: {}, isFixed: false, role: 'body', links: [],
    }
    const snap = findSnap(block, [slopeEl, block])
    expect(snap).not.toBeNull()
    expect(snap!.targetId).toBe('s1')
    applySnap(block, snap!)
    // 吸附后块「右」锚点世界 == 斜面顶端
    const right = anchorWorldOf(block, '右')
    expect(Math.hypot(right.x - top.x, right.y - top.y)).toBeLessThan(1e-6)
  })
})
