/**
 * P2·耦合接入 RunBridge 映射单测：rod_bar/rail_pair/piston/cylinder/gas_cell → Java PhysicsElement
 * （heater 无 Java 路径：诚实跳过+note，见 v3 修复用例）
 */
import { describe, it, expect } from 'vitest'
import { toPhysicsElements } from '../run/RunBridge'
import type { GeoElement } from '../catalog'

const mk = (type: string, params: Record<string, number> = {}): GeoElement => ({
  id: `${type}_001`, type, position: { x: 0, y: 0 }, angle: 0, params,
  isFixed: false, role: 'body', links: [],
})

describe('P2 耦合元件映射', () => {
  it('rod_bar → cube（质量+R 参数）', () => {
    const { list, skipped } = toPhysicsElements([mk('rod_bar', { m: 2, R: 5 })])
    expect(skipped).toHaveLength(0)
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe('cube')
    expect(list[0].properties?.mass).toBe(2)
  })

  it('rail_pair → wall（fixed + L 参数）', () => {
    const g = { ...mk('rail_pair', { L: 2 }) }
    const { list, skipped } = toPhysicsElements([g])
    expect(skipped).toHaveLength(0)
    expect(list).toHaveLength(1)
    expect(list[0].type).toBe('wall')
  })

  it('piston → cube（质量 M + 阻尼）', () => {
    const { list, skipped } = toPhysicsElements([mk('piston', { M: 20, dampingRatio: 0.6 })])
    expect(skipped).toHaveLength(0)
    expect(list[0].type).toBe('cube')
    expect(list[0].properties?.mass).toBe(20)
  })

  it('cylinder → wall（fixed）', () => {
    const { list, skipped } = toPhysicsElements([mk('cylinder', { S: 0.02 })])
    expect(skipped).toHaveLength(0)
    expect(list[0].type).toBe('wall')
  })

  it('gas_cell → wall（fixed，热学参数透传）', () => {
    const { list, skipped } = toPhysicsElements([mk('gas_cell', { p0: 101325, V0: 0.02, T0: 300 })])
    expect(skipped).toHaveLength(0)
    expect(list[0].type).toBe('wall')
    expect(list[0].params?.p0).toBe(101325)
  })

  it('未连接的绳 → 不建体 + note（notes 通道：run() 后经 lastNotes 上屏）', () => {
    const { list, notes } = toPhysicsElements([mk('rope', { L: 2 })])
    expect(list).toHaveLength(0)
    expect(notes.join()).toContain('未连接')
  })

  it('rod_bar + rail_pair + b_region 组合不跳过', () => {
    const rod = mk('rod_bar', { m: 1, R: 1 })
    const rail = mk('rail_pair', { L: 1 })
    const b = { ...mk('b_region', { B: 1, dir: 0 }), role: 'field' as const }
    const { skipped, list } = toPhysicsElements([rod, rail, b])
    expect(skipped).toHaveLength(0)
    expect(list.length).toBeGreaterThanOrEqual(3)
  })
})

  it('检测器三件 → 无体元件 + connectTo（P5b-3 接线：此前被 NO_BODY 静默丢弃）', () => {
    const blk = mk('block', { m: 1 })
    blk.id = 'blk1'
    const sen: GeoElement = { ...mk('speed_sensor'), id: 'spd1', links: [{ toId: 'blk1', kind: 'rope', anchorA: '探头', anchorB: '顶' }] }
    const { list } = toPhysicsElements([blk, sen])
    const s = list.find((e) => e.id === 'spd1')
    expect(s?.type).toBe('speed_sensor')
    expect(s?.connectTo).toBe('blk1')
  })

  it('未绑定目标的检测器 → note（显式提示，不静默）', () => {
    const { list, notes } = toPhysicsElements([mk('speed_sensor')])
    expect(list.find((e) => e.type === 'speed_sensor')).toBeUndefined()
    expect(notes.join()).toContain('未绑定目标')
  })
