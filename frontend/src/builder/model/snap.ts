/**
 * 锚点吸附（方案 §4.2）：拖动中实时预览、松手提交；阈值 δ=0.35 m（世界单位）
 * 优先级：tangent > translate > proximity；一次只做一处吸附；吸附后可继续拖走
 */
import type { GeoElement, AnchorTemplate, AnchorKind } from '../catalog'
import { byType } from '../catalog'

export interface SnapProposal {
  dragId: string; anchorA: string; targetId: string; anchorB: string
  dx: number; dy: number; dth: number; dist: number; priority: number
}

/** 世界坐标变换：局部锚点 + position + rotation(angle) */
function anchorWorld(e: GeoElement, tmpl: AnchorTemplate): { x: number; y: number; angle: number } {
  const c = Math.cos(e.angle), s = Math.sin(e.angle)
  const lx = tmpl.local.x, ly = tmpl.local.y
  return {
    x: e.position.x + c * lx - s * ly,
    y: e.position.y + s * lx + c * ly,
    angle: e.angle,
  }
}

function compatible(a: AnchorKind, b: AnchorKind, accepts: AnchorKind[]): boolean {
  return accepts.includes(b) || a === b
}

/** 主算法：对拖动元件 A 的每个锚点与所有其他元件 B 的锚点配对，找最佳吸附 */
export function findSnap(dragged: GeoElement, all: GeoElement[], threshold = 0.35): SnapProposal | null {
  const specA = byType.get(dragged.type)
  if (!specA?.anchors?.length) return null
  let best: SnapProposal | null = null

  for (const tmplA of specA.anchors) {
    const wa = anchorWorld(dragged, tmplA)
    for (const other of all) {
      if (other.id === dragged.id) continue
      const specB = byType.get(other.type)
      if (!specB?.anchors) continue
      for (const tmplB of specB.anchors) {
        if (!compatible(tmplA.kind, tmplB.kind, tmplA.accepts)) continue
        const wb = anchorWorld(other, tmplB)
        const dist = Math.hypot(wa.x - wb.x, wa.y - wb.y)
        if (dist > threshold) continue
        let dth = 0
        let tx = wa.x, ty = wa.y
        if (tmplA.align === 'tangent') {
          dth = other.angle - dragged.angle
          // 旋转后再平移使锚点对齐
          const c = Math.cos(dth), s = Math.sin(dth)
          const nlx = tmplA.local.x * c - tmplA.local.y * s
          const nly = tmplA.local.x * s + tmplA.local.y * c
          tx = dragged.position.x + nlx
          ty = dragged.position.y + nly
        }
        const priority = tmplA.align === 'tangent' ? 0 : 1
        if (!best || dist < best.dist || (dist === best.dist && priority < best.priority)) {
          best = {
            dragId: dragged.id, anchorA: tmplA.id, targetId: other.id, anchorB: tmplB.id,
            dx: wb.x - tx, dy: wb.y - ty, dth, dist, priority,
          }
        }
      }
    }
  }
  return best
}

/** 应用吸附：修改 position/angle */
export function applySnap(e: GeoElement, snap: SnapProposal): void {
  e.angle += snap.dth
  e.position.x += snap.dx
  e.position.y += snap.dy
}
