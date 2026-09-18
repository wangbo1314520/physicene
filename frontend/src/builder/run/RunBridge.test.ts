/**
 * 阶段三⑤ RunBridge 映射单测：GeoElement[] → Java PhysicsElement[] 契约（文件头注释）
 */
import { describe, it, expect } from 'vitest'
import { toPhysicsElements } from './RunBridge'
import { byType, type GeoElement } from '../catalog'

const mk = (type: string, id: string, patch: Partial<GeoElement> = {}): GeoElement => {
  const spec = byType.get(type)!
  return {
    id, type, position: { x: 0, y: 0 }, angle: 0,
    params: Object.fromEntries(spec.params.map((p) => [p.key, p.default])),
    isFixed: false, role: spec.role, links: [], ...patch,
  }
}

describe('toPhysicsElements 类型映射', () => {
  it('block → cube（质量/摩擦/恢复0）', () => {
    const { list } = toPhysicsElements([mk('block', 'b1', { params: { m: 2, v0: 0, mu: 0.3 } })])
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe('cube')
    expect(list[0].properties).toMatchObject({ mass: 2, friction: 0.3, restitution: 0 })
  })

  it('slope：角点原点 → 中心原点（L=6 θ=30° → scale(3, 3.464)、position 偏移 (3, 1.732)）', () => {
    const { list } = toPhysicsElements([mk('slope', 's1', { position: { x: 0, y: 0 } })])
    const s = list[0]
    expect(s.type).toBe('slope')
    expect(s.scale!.x).toBeCloseTo(3, 5)
    expect(s.scale!.y).toBeCloseTo(6 * Math.tan(Math.PI / 6), 4)
    expect(s.position.x).toBeCloseTo(3, 4)
    expect(s.position.y).toBeCloseTo(3 * Math.tan(Math.PI / 6), 4)
  })

  it('belt：vb/L/mu/th → beltSpeed/beltLength/friction/angle', () => {
    const { list } = toPhysicsElements([mk('belt', 'bt1', { params: { vb: 2, th: 10, mu: 0.5, L: 5 }, angle: 0.1 })])
    const b = list[0]
    expect(b.type).toBe('belt')
    expect(b.params).toMatchObject({ beltSpeed: 2, beltLength: 5, beltRadius: 0.15 })
    expect(b.properties!.friction).toBe(0.5)
    expect(b.angle).toBeCloseTo(0.1 + (10 * Math.PI) / 180, 6)
  })

  it('loop_track：side → arcSideCode，全圆 0..360', () => {
    const { list } = toPhysicsElements([mk('loop_track', 'lp1', { params: { radius: 1.5, side: 2 } })])
    expect(list[0].params).toMatchObject({ radius: 1.5, arcA0: 0, arcA1: 360, arcSideCode: 2 })
  })

  it('绳双端：connectTo/anchorA 取连体 A 上的锚点局部坐标', () => {
    const rope = mk('rope', 'r1', {
      position: { x: 2, y: 5 },
      params: { L: 2, Tmax: 40 },
      links: [{ toId: 'blk', kind: 'rope', anchorA: '左端', anchorB: '顶' }],
    })
    const block = mk('block', 'blk', { position: { x: 2, y: 3 } })
    const { list } = toPhysicsElements([rope, block])
    const r = list.find((e) => e.id === 'r1')!
    expect(r.type).toBe('rope')
    expect(r.connectTo).toBe('blk')
    expect(r.anchorA).toEqual({ x: 0, y: 0.5 }) // block 顶锚点局部坐标
    expect(r.connectTo2).toBeUndefined()
    expect(r.params!.jointLength).toBe(2)
    // 单端连接：position = 未连接端（右端 (2,0) 局部）世界坐标
    expect(r.position).toEqual({ x: 4, y: 5 })
  })

  it('弹簧双端：connectTo2/anchorB + stiffness/dampingRatio', () => {
    const spring = mk('spring', 'sp1', {
      params: { k: 200, L0: 1.2, zeta: 0.1 },
      links: [
        { toId: 'a', kind: 'spring', anchorA: '左端', anchorB: '右' },
        { toId: 'b', kind: 'spring', anchorA: '右端', anchorB: '左' },
      ],
    })
    const a = mk('block', 'a'), b = mk('block', 'b')
    const { list } = toPhysicsElements([spring, a, b])
    const s = list.find((e) => e.id === 'sp1')!
    expect(s.connectTo).toBe('a')
    expect(s.connectTo2).toBe('b')
    expect(s.anchorA).toEqual({ x: 0.5, y: 0 })
    expect(s.anchorB).toEqual({ x: -0.5, y: 0 })
    expect(s.params).toMatchObject({ jointLength: 1.2, stiffness: 200, dampingRatio: 0.1 })
  })

  it('滑轮：kind 1（动滑轮）→ ratio 2，需两端连接', () => {
    const pulley = mk('pulley', 'p1', { params: { kind: 1 } })
    const alone = toPhysicsElements([pulley])
    expect(alone.list.find((e) => e.id === 'p1')).toBeUndefined()
    expect(alone.notes.some((n) => n.includes('需两端'))).toBe(true)
    pulley.links = [
      { toId: 'a', kind: 'pulley-rope', anchorA: '悬挂点', anchorB: '顶' },
      { toId: 'b', kind: 'pulley-rope', anchorA: '悬挂点', anchorB: '顶' },
    ]
    const { list } = toPhysicsElements([pulley, mk('sphere', 'a'), mk('sphere', 'b')])
    expect(list.find((e) => e.id === 'p1')!.params).toEqual({ ratio: 2 })
  })

  it('point_charge：比荷 qm → charge = qm·mass', () => {
    const { list } = toPhysicsElements([mk('point_charge', 'q1', { params: { qm: 1.5, v0: 0 } })])
    expect(list[0].properties).toMatchObject({ mass: 1, charge: 1.5 })
  })

  it('particle：v0+ang → 初速度分量', () => {
    const { list } = toPhysicsElements([mk('particle', 'p1', { params: { m: 1, v0: 10, ang: 30 } })])
    const v = list[0].initialState!.velocity!
    expect(v.x).toBeCloseTo(10 * Math.cos(Math.PI / 6), 6)
    expect(v.y).toBeCloseTo(10 * Math.sin(Math.PI / 6), 6)
  })

  it('阶段四类型拒绝进 skipped；显示类静默跳过', () => {
    const { list, skipped } = toPhysicsElements([
      mk('gas_cell', 'g1'), mk('rail_pair', 'rr1'), mk('photogate', 'pg1'), mk('trail', 't1'), mk('block', 'b1'),
    ])
    expect(skipped).toEqual(['gas_cell', 'rail_pair'])
    expect(list.map((e) => e.id)).toEqual(['b1'])
  })
})
