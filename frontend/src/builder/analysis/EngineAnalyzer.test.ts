import { describe, it, expect } from 'vitest'
import { analyze } from './EngineAnalyzer'
import type { GeoElement } from '../catalog'

const mk = (type: string, x: number, y: number, angle = 0, params: Record<string, number> = {}): GeoElement => ({
  id: `${type}-t`, type, position: { x, y }, angle, params,
  isFixed: false, role: 'body', links: [],
})

describe('EngineAnalyzer 显式提示（十三轮裁定 b）', () => {
  it('物块跨导入段端点 → 警告', () => {
    // lead_in 中心 (0,1) 角 −30°，L=2 → 上端 (−0.87,1.5)；块压上端（x 差 <0.45、|y−(端点+0.5)|<0.35）
    const li: GeoElement = { ...mk('lead_in', 0, 1, -Math.PI / 6, { L: 2 }), isFixed: true }
    const blk = mk('block', -0.7, 1.95)
    const w = analyze([li, blk]).warnings
    expect(w.join()).toContain('跨在导入段')
  })
  it('物块在段中（安全放置）→ 无该警告', () => {
    const li: GeoElement = { ...mk('lead_in', 0, 1, -Math.PI / 6, { L: 2 }), isFixed: true }
    const blk = mk('block', -0.3, 1.66)
    const w = analyze([li, blk]).warnings
    expect(w.join()).not.toContain('跨在导入段')
  })
})
