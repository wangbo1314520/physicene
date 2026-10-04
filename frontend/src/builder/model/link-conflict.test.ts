import { describe, expect, it } from 'vitest'
import { linkConflict, type AnchorRef } from './link-conflict'
import type { GeoElement } from '../catalog'

const mk = (type: string, links: GeoElement['links']): Pick<GeoElement, 'type' | 'links'> => ({ type, links })
const labelOf = (id: string) => ({ r1: '轻绳', p1: '物块', w1: '斜面', s1: '速度计' }[id] ?? id)
const A = (id: string, anchorId: string): AnchorRef => ({ id, anchorId })

describe('批2·2.11 linkConflict 连接冲突拦截', () => {
  it('干净首连：无冲突', () => {
    expect(linkConflict(A('r1', '左端'), A('p1', '连接点'), mk('rope', []), mk('block', []), labelOf)).toBeNull()
  })

  it('① 完全重复：同 owner 同锚点对再连 → 拦截', () => {
    const rope = mk('rope', [{ toId: 'p1', kind: 'rope', anchorA: '左端', anchorB: '连接点' }])
    const msg = linkConflict(A('r1', '左端'), A('p1', '连接点'), rope, mk('block', []), labelOf)
    expect(msg).toContain('已存在相同连接')
    expect(msg).toContain('轻绳·左端')
  })

  it('② 反向重复：对方元件已连回来 → 拦截（防重复落线一死一活）', () => {
    const block = mk('block', [{ toId: 'r1', kind: 'rope', anchorA: '连接点', anchorB: '左端' }])
    const msg = linkConflict(A('r1', '左端'), A('p1', '连接点'), mk('rope', []), block, labelOf)
    expect(msg).toContain('反向')
  })

  it('③ 同线两端接同一锚点：rope 左端→p1.a 已有，右端→p1.a → 拦截', () => {
    const rope = mk('rope', [{ toId: 'p1', kind: 'rope', anchorA: '左端', anchorB: '连接点' }])
    const msg = linkConflict(A('r1', '右端'), A('p1', '连接点'), rope, mk('block', []), labelOf)
    expect(msg).toContain('两端不能接在同一锚点')
  })

  it('④ 容量-rope 第 3 条：拦截并说明引擎只读前 2 条', () => {
    const rope = mk('rope', [
      { toId: 'p1', kind: 'rope', anchorA: '左端', anchorB: '连接点' },
      { toId: 'w1', kind: 'rope', anchorA: '右端', anchorB: '表面端' },
    ])
    const msg = linkConflict(A('r1', '左端'), A('p2', '连接点'), rope, mk('block', []), labelOf)
    expect(msg).toContain('最多连 两处')
    expect(msg).toContain('只读前 2 条')
  })

  it('④ 容量-检测器第 2 条：拦截（connectTo 只读 links[0]）', () => {
    const sensor = mk('speed_sensor', [{ toId: 'p1', kind: 'wire', anchorA: '探头', anchorB: '连接点' }])
    const msg = linkConflict(A('s1', '探头'), A('p2', '连接点'), sensor, mk('block', []), labelOf)
    expect(msg).toContain('最多连 一个目标')
    expect(msg).toContain('只读前 1 条')
  })

  it('回归-pulley 单锚点两端连不同目标：合法不拦截（悬挂点被两线共用是设计）', () => {
    const pulley = mk('pulley', [{ toId: 'p1', kind: 'pulley-rope', anchorA: '悬挂点', anchorB: '连接点' }])
    expect(linkConflict(A('r0', '悬挂点'), A('p2', '连接点'), pulley, mk('block', []), labelOf)).toBeNull()
  })

  it('回归-普通物体无容量限制：多条连线不拦截（引擎不读 body 侧 links，仅装饰）', () => {
    const block = mk('block', [
      { toId: 'r1', kind: 'rope', anchorA: '连接点', anchorB: '左端' },
      { toId: 'r2', kind: 'spring', anchorA: '连接点', anchorB: '左端' },
    ])
    expect(linkConflict(A('p1', '连接点'), A('r3', '左端'), block, mk('rope', []), labelOf)).toBeNull()
  })

  it('元件缺失（已删除）：不拦截（落线前 find 失败由调用方兜底）', () => {
    expect(linkConflict(A('r1', '左端'), A('p1', '连接点'), undefined, mk('block', []), labelOf)).toBeNull()
  })
})
