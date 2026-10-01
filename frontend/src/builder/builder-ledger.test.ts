/**
 * 统一搭建台账本测试（方案 §5.4/§7）：
 * 1. engine-rules.json 双端同源——Java resources 与前端副本 SHA256 必须一致（漂移即红）
 * 2. EngineAnalyzer：引擎归属 / 耦合链激活 / 警告 / 运行路径
 */
import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { analyze, engineOfSpec } from './analysis/EngineAnalyzer'
import { byType } from './catalog'
import type { GeoElement } from './catalog'

const here = fileURLToPath(new URL('.', import.meta.url))
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('engine-rules.json 双端同源（R8）', () => {
  it('Java 与前端副本 SHA256 一致', () => {
    const javaSide = sha(join(here, '../../../java-backend/src/main/resources/engine-rules.json'))
    const feSide = sha(join(here, 'engine/engine-rules.json'))
    expect(feSide).toBe(javaSide)
  })
})

const mk = (type: string, id?: string, links: GeoElement['links'] = []): GeoElement => {
  const spec = byType.get(type)!
  const params = Object.fromEntries(spec.params.map((p) => [p.key, p.default]))
  return { id: id ?? `${type}-1`, type, position: { x: 0, y: 0 }, angle: 0, params, isFixed: false, role: spec.role, links }
}

describe('engineOfSpec（domain/role 数据驱动）', () => {
  it.each([
    ['block', 'rigid'], ['belt', 'rigid'], ['loop_track', 'rigid'], ['photogate', 'rigid'],
    ['e_region', 'field'], ['b_region', 'field'], ['point_charge', 'field'],
    ['rail_pair', 'circuit'], ['rod_bar', 'circuit'],
    ['gas_cell', 'thermal'], ['piston', 'thermal'],
    ['light_source', 'optics'], ['prism', 'optics'],
    ['photo_tube', 'modern'], ['h_atom', 'modern'],
    ['trail', null], ['energy_meter', 'rigid'],  // 十轮追问3：display→detector（probes 读数）
  ])('%s → %s', (type, want) => {
    const spec = byType.get(type as string)!
    expect(engineOfSpec(spec)).toBe(want)
  })
})

describe('analyze', () => {
  it('空画布：none 路径', () => {
    const a = analyze([])
    expect(a.path).toBe('none')
    expect(a.engines).toHaveLength(0)
  })

  it('斜面+物块：单域 Java 刚体', () => {
    const a = analyze([mk('slope'), mk('block')])
    expect(a.path).toBe('java')
    expect(a.engines.map((e) => e.key)).toEqual(['rigid'])
    expect(a.couplings).toHaveLength(0)
    expect(a.title).toContain('刚体力学')
  })

  it('导轨+导体棒+磁场：rigid+circuit？——rod_bar/rail_pair 属 circuit，b_region 属 field', () => {
    const a = analyze([mk('rail_pair'), mk('rod_bar'), mk('b_region')])
    const keys = a.engines.map((e) => e.key)
    expect(keys).toContain('circuit')
    expect(keys).toContain('field')
    expect(a.couplings.map((c) => c.id)).toContain('rail-rod')
    const rr = a.couplings.find((c) => c.id === 'rail-rod')!
    expect(rr.mode).toBe('strong')
    expect(a.warnings.some((w) => w.includes('闭合性'))).toBe(true)
  })

  it('活塞+气室：强耦合 piston-gas', () => {
    const a = analyze([mk('piston'), mk('gas_cell')])
    expect(a.engines.map((e) => e.key).sort()).toEqual(['rigid', 'thermal'])
    expect(a.couplings.map((c) => c.id)).toContain('piston-gas')
  })

  it('气室无活塞：警告 + 仅 thermal', () => {
    const a = analyze([mk('gas_cell')])
    expect(a.engines.map((e) => e.key)).toEqual(['thermal'])
    expect(a.warnings.some((w) => w.includes('缺少活塞'))).toBe(true)
  })

  it('未连接的弹簧/滑轮产生警告', () => {
    const a = analyze([mk('spring'), mk('pulley'), mk('block')])
    expect(a.warnings.some((w) => w.includes('未连接'))).toBe(true)
    expect(a.warnings.some((w) => w.includes('未绕绳'))).toBe(true)
  })

  it('纯光学：ts 路径 + 阶段四提示', () => {
    const a = analyze([mk('light_source'), mk('prism'), mk('optic_screen')])
    expect(a.path).toBe('ts')
    expect(a.engines.map((e) => e.key)).toEqual(['optics'])
    expect(a.warnings.some((w) => w.includes('阶段四'))).toBe(true)
  })

  it('frame-b 规则：coil_frame 不在几何目录时按 device 出现才激活（本目录暂无 → 不激活）', () => {
    const a = analyze([mk('b_region'), mk('sphere')])
    expect(a.couplings.map((c) => c.id)).not.toContain('frame-b')
  })
})
