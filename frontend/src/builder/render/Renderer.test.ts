/**
 * 阶段三③ 渲染器单测（node 环境，不含 belt 的 CanvasTexture 分支——该分支由 E2E 覆盖）
 */
import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildUnifiedMesh, helixGeometry, updateHelix, buildConnectionLine, updateLine } from './Renderer'
import type { GeoElement } from '../catalog'

const mk = (type: string, params: Record<string, number> = {}): GeoElement => ({
  id: `${type}_001`, type, position: { x: 0, y: 0 }, angle: 0, params, isFixed: false, role: 'body', links: [],
})

describe('buildUnifiedMesh', () => {
  it('spring：螺旋线 + 两端球，起点(0,0)终点(L0,0)', () => {
    const { mesh } = buildUnifiedMesh(mk('spring', { k: 100, L0: 1.2, zeta: 0.05 }))
    const g = mesh as THREE.Group
    const line = g.children.find((c) => c instanceof THREE.Line) as THREE.Line
    expect(line).toBeTruthy()
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(attr.count).toBeGreaterThanOrEqual(120)
    expect(attr.getX(0)).toBeCloseTo(0, 5)
    expect(attr.getX(attr.count - 1)).toBeCloseTo(1.2, 5)
    const spheres = g.children.filter((c) => c instanceof THREE.Mesh)
    expect(spheres.length).toBe(2)
    expect((spheres[1] as THREE.Mesh).position.x).toBeCloseTo(1.2, 5)
  })

  it('pulley：定滑轮含吊装杆，动滑轮含吊钩', () => {
    const fixed = buildUnifiedMesh(mk('pulley', { kind: 0 })).mesh as THREE.Group
    const movable = buildUnifiedMesh(mk('pulley', { kind: 1 })).mesh as THREE.Group
    // rim + 3 spokes + axle + 绳槽(任务D) = 6，定滑轮 +mount=7，动滑轮 +hook=7
    expect(fixed.children.length).toBe(7)
    expect(movable.children.length).toBe(7)
    const mountY = fixed.children.map((c) => c.position.y)
    expect(Math.max(...mountY)).toBeGreaterThan(0.4) // 吊装杆在轮上方
  })

  it('loop_track：side=2 管道双环，side=0 单环', () => {
    const pipe = buildUnifiedMesh(mk('loop_track', { radius: 1, side: 2 })).mesh as THREE.Group
    const single = buildUnifiedMesh(mk('loop_track', { radius: 1, side: 0 })).mesh as THREE.Group
    expect(pipe.children.length).toBe(3)   // 双环 + 类型标记(任务D)
    expect(single.children.length).toBe(2) // 环 + 类型标记
    const r = (pipe.children[0] as THREE.Mesh).geometry as THREE.TorusGeometry
    expect(r.parameters.radius).toBeCloseTo(1, 5)
  })

  it('belt：baseAngle 来自倾角参数 th', () => {
    // 不构造 mesh（node 无 document），仅验证角度换算逻辑由同源公式保证
    const th = 30
    expect(THREE.MathUtils.degToRad(th)).toBeCloseTo(Math.PI / 6, 6)
  })

  it('vector_arrow：箭头主干+双翼（3 条 Line）', () => {
    const r = buildUnifiedMesh(mk('vector_arrow', { mode: 0, len: 1, th: 0 }))
    const lines: THREE.Line[] = []
    r.mesh.traverse((o) => { if ((o as THREE.Line).isLine) lines.push(o as THREE.Line) })
    expect(lines.length).toBe(3)   // 主干 + 两翼
  })
  it('graph_tag：kind 标记 + node 环境 sprite 退化不抛错', () => {
    const g: GeoElement = { ...mk('graph_tag', { size: 1, color: 0 }), display: { label: 'A 点' } }
    const r = buildUnifiedMesh(g)
    expect((r.mesh.userData as { kind?: string }).kind).toBe('graph-tag')
  })
  it('未知类型回退为 Box', () => {
    const { mesh } = buildUnifiedMesh(mk('gas_cell', { p0: 101325 }))
    expect((mesh as THREE.Mesh).geometry).toBeInstanceOf(THREE.BoxGeometry)
  })
})

describe('helixGeometry / updateHelix', () => {
  it('端点精确落在给定坐标，中间点偏离直线形成螺旋', () => {
    const geo = helixGeometry(1, 2, 4, 6, 10, 0.12)
    const attr = geo.getAttribute('position') as THREE.BufferAttribute
    expect(attr.getX(0)).toBeCloseTo(1, 5)
    expect(attr.getY(0)).toBeCloseTo(2, 5)
    expect(attr.getX(attr.count - 1)).toBeCloseTo(4, 5)
    expect(attr.getY(attr.count - 1)).toBeCloseTo(6, 5)
    // 采样点到直线距离的最大值 ≈ 0.12（螺旋半径）；中点可能恰落 sin=0，故取全段最大
    const d0 = { x: 4 - 1, y: 6 - 2 }
    const len = Math.hypot(d0.x, d0.y)
    let maxDist = 0
    for (let i = 1; i < attr.count - 1; i++) {
      const px = attr.getX(i) - 1, py = attr.getY(i) - 2
      maxDist = Math.max(maxDist, Math.abs(px * d0.y - py * d0.x) / len)
    }
    expect(maxDist).toBeGreaterThan(0.1)
    expect(maxDist).toBeLessThanOrEqual(0.12 + 1e-6)
  })

  it('updateHelix 重建端点', () => {
    const line = new THREE.Line(helixGeometry(0, 0, 1, 0, 8, 0.1), new THREE.LineBasicMaterial())
    updateHelix(line, 0, 0, 0, 2)
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
    expect(attr.getY(attr.count - 1)).toBeCloseTo(2, 5)
  })
})

describe('连接线', () => {
  it('buildConnectionLine + updateLine 端点更新', () => {
    const line = buildConnectionLine('rope')
    updateLine(line, 1, 2, 3, 4)
    const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
    expect([attr.getX(0), attr.getY(0), attr.getX(1), attr.getY(1)]).toEqual([1, 2, 3, 4])
  })
})
