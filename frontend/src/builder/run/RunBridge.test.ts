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


describe('NO_BODY 固定端（bracket/pole）与单端收编', () => {
  it('rope A端pole+B端block：悬点=pole mount 世界坐标，连体占 connectTo/anchorA 槽位', () => {
    const pole = mk('pole', 'p1', { position: { x: 2, y: 1 }, params: { H: 2.0 } })
    const blk = mk('block', 'b1')
    const rope = mk('rope', 'r1', { params: { L: 1.5 }, links: [
      { toId: 'p1', kind: 'rope', anchorA: '左端', anchorB: 'mount' },
      { toId: 'b1', kind: 'rope', anchorA: '右端', anchorB: '顶' }] })
    const { list } = toPhysicsElements([pole, blk, rope])
    expect(list.filter((x) => x.type !== 'rope')).toHaveLength(1)  // pole 无 body，block 有
    const r = list.find((x) => x.type === 'rope')!
    expect(r.connectTo).toBe('b1')            // 连体=block（Java 悬点语义）
    expect(r.anchorA).toEqual({ x: 0, y: 0.5 })  // block 顶局部锚
    expect(r.connectTo2).toBeUndefined()
    expect(r.position).toEqual({ x: 2, y: 2 })   // mount = (2,1)+(0,H/2=1)
  })
  it('spring B端bracket：悬点 = (0.8, 0.4)+position，连体 A 保持 connectTo', () => {
    const br = mk('bracket', 'br1', { position: { x: 1, y: 0 } })
    const blk = mk('block', 'b1')
    const sp = mk('spring', 's1', { params: { k: 20, L0: 1.2 }, links: [
      { toId: 'b1', kind: 'spring', anchorA: '左端', anchorB: '右' },
      { toId: 'br1', kind: 'spring', anchorA: '右端', anchorB: 'mount' }] })
    const { list } = toPhysicsElements([br, blk, sp])
    const r = list.find((x) => x.type === 'spring')!
    expect(r.connectTo).toBe('b1')
    expect(r.connectTo2).toBeUndefined()
    expect(r.position).toEqual({ x: 1.8, y: 0.4 })  // (1,0)+(0.8,0.4)
  })
  it('单端弹簧（无第二目标）未连端 = resolveAnchors 解析（L0=1.2 非默认）', () => {
    const sp = mk('spring', 's2', { position: { x: 0, y: 0 }, params: { L0: 1.2 }, links: [{ toId: 'b1', kind: 'spring', anchorA: '左端', anchorB: '右' }] })
    const blk = mk('block', 'b1')
    const { list } = toPhysicsElements([sp, blk])
    const r = list.find((x) => x.type === 'spring')!
    expect(r.position!.x).toBeCloseTo(1.2, 6)  // 原点+rot(0)·(L0,0)
    expect(r.connectTo).toBe('b1')
  })
  it('两端均固定端（bracket+pole）→ 无动力学，跳过并提示', () => {
    const br = mk('bracket', 'br2')
    const pole = mk('pole', 'p2')
    const sp = mk('spring', 's3', { links: [
      { toId: 'br2', kind: 'spring', anchorA: '左端', anchorB: 'mount' },
      { toId: 'p2', kind: 'spring', anchorA: '右端', anchorB: 'mount' } ] })
    const { list, notes } = toPhysicsElements([br, pole, sp])
    expect(list.filter((x) => x.type === 'spring')).toHaveLength(0)
    expect(notes.some((n) => n.includes('无 body 连体'))).toBe(true)
  })
})
describe('NO_BODY 连接目标矩阵（历史缺陷排查收口）', () => {
  it('pulley 连 bracket（NO_BODY）：友好跳过并提示悬挂语义，不发 Java', () => {
    const br = mk('bracket', 'br1')
    const blk = mk('block', 'b1')
    const blk2 = mk('block', 'b2')
    const pul = mk('pulley', 'p1', { links: [
      { toId: 'br1', kind: 'pulley-rope', anchorA: '悬挂点', anchorB: 'mount' },
      { toId: 'b1', kind: 'pulley-rope', anchorA: '悬挂点', anchorB: '右' } ] })
    const { list, notes } = toPhysicsElements([br, blk, blk2, pul])
    expect(list.filter((x) => x.type === 'pulley')).toHaveLength(0)
    expect(notes.some((n) => n.includes('固定悬挂'))).toBe(true)
  })
})
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

  it('loop_track：side → arcSideCode；A1 缺口角 → 弧段（中心 270°=底部）；gap=0 闭环', () => {
    const { list } = toPhysicsElements([mk('loop_track', 'lp1', { params: { radius: 1.5, side: 2 } })])
    // A1（2026-10-06）：默认 gap=40°——arcA0=270+20、arcA1=270−20+360（span=320，底部缺口）
    expect(list[0].params).toMatchObject({ radius: 1.5, arcA0: 290, arcA1: 610, arcSideCode: 2 })
    const { list: l0 } = toPhysicsElements([mk('loop_track', 'lp0', { params: { radius: 1.5, side: 0, gap: 0 } })])
    // gap=0：span=360 闭环（Java inArc 走全圆分支，模板回归用）
    expect(l0[0].params).toMatchObject({ arcA0: 270, arcA1: 630, arcSideCode: 0 })
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
    // 动滑轮新契约（2026-10-07）：+M 载重（两端均为运动体时无静态端坐标）
    expect(list.find((e) => e.id === 'p1')!.params).toEqual({ ratio: 2, kind: 1, M: 1 })
  })

  it('动滑轮：绳端可为固定锚——锚世界坐标入 params（end0x/end0y）', () => {
    const anchor = mk('anchor_point', 'ap', { position: { x: 3, y: 5 } })
    const pulley = mk('pulley', 'p2', { params: { kind: 1, M: 3 } })
    pulley.links = [
      { toId: 'ap', kind: 'pulley-rope', anchorA: '悬挂点', anchorB: '锚点' },
      { toId: 'b', kind: 'pulley-rope', anchorA: '悬挂点', anchorB: '顶' },
    ]
    const { list } = toPhysicsElements([anchor, pulley, mk('sphere', 'b')])
    const el = list.find((e) => e.id === 'p2')!
    expect(el.params).toMatchObject({ ratio: 2, M: 3, end0x: 3, end0y: 5 })
    expect(el.connectTo).toBeUndefined()
    expect(el.connectTo2).toBe('b')
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

  it('P2 后阶段四拒绝集已清空：耦合类型不再 skip；显示类静默跳过', () => {
    const { list, skipped } = toPhysicsElements([
      mk('gas_cell', 'g1'), mk('rail_pair', 'rr1'), mk('photogate', 'pg1'), mk('trail', 't1'), mk('block', 'b1'),
    ])
    expect(skipped).toEqual([])  // P2·耦合接入后 PHASE4 为空
    expect(list.map((e) => e.id)).toEqual(['g1', 'rr1', 'b1'])  // gas_cell/rail_pair 映射为 wall
  })
})
