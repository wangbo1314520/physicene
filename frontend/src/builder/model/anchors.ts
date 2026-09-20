/**
 * 参数化锚点解析（统一锚点机制，任务 E · bracket/pole 批）
 *
 * 目录 anchors 是「默认参数下的静态声明」（目录第 54 行约定）；本模块按元件实际 params
 * 重算锚点局部坐标，供 snap.ts（拖拽吸附）与 RunBridge（运行时关节）两处解析层共用。
 *
 * 修复的 8 个「锚点写死于默认参数」缺陷元件：cart/slope/vwall/lead_in/belt/loop_track/spring/rope
 * （belt 另有 th 倾角不进锚点旋转的三层不一致缺陷，此处统一为 angle+th 叠加）。
 */
import type { GeoElement, AnchorTemplate } from '../catalog'
import { byType } from '../catalog'

const num = (v: number | undefined, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const deg2rad = (d: number) => (d * Math.PI) / 180

/** 复制静态模板并替换 local（保留 kind/accepts/align/label 语义） */
const at = (t: AnchorTemplate, x: number, y: number): AnchorTemplate => ({ ...t, local: { x, y } })

/**
 * 元件固有倾角（弧度）——「叠加型角度参数」进锚点旋转，与渲染/物理端同式。
 * 全目录角度类参数排查定案：唯一叠加型 = belt.th（slope.th 是几何构形不叠加；
 * block/particle.ang 是初速方向；light_source.th1/prism.A 属光学 TS 引擎）。
 */
export function resolveTilt(e: GeoElement): number {
  return e.type === 'belt' ? deg2rad(num(e.params.th, 0)) : 0
}

/** 按元件实际参数解析锚点模板（未参数化元件回落目录静态声明） */
export function resolveAnchors(e: GeoElement): AnchorTemplate[] {
  const spec = byType.get(e.type)
  if (!spec?.anchors?.length) return []
  const p = e.params
  switch (e.type) {
    case 'pole': {
      const h = num(p.H, 1.2) / 2
      return spec.anchors.map((t) => at(t, 0, h))
    }
    case 'vwall': {
      const h = num(p.H, 6)
      return spec.anchors.map((t) => (t.id === '墙顶' ? at(t, 0, h) : at(t, 0, h / 2)))
    }
    case 'cart': {
      const w = num(p.L, 6) / 2
      return spec.anchors.map((t) => at(t, t.id === '左端' ? -w : w, 0))
    }
    case 'lead_in': {
      const w = num(p.L, 2) / 2
      return spec.anchors.map((t) => at(t, t.id === '尾端' ? -w : w, 0))
    }
    case 'slope': {
      const L = num(p.L, 6), th = deg2rad(Math.min(80, Math.max(0, num(p.th, 30))))
      return spec.anchors.map((t) => (t.id === '顶端' ? at(t, 0, L * Math.tan(th)) : at(t, L, 0)))
    }
    case 'belt': {
      const L = num(p.L, 6)
      return spec.anchors.map((t) => {
        const y = t.local.y  // BELT_RADIUS（带面上表面），不随 L 变
        if (t.id === '左端上表面') return at(t, -L / 2, y)
        if (t.id === '右端上表面') return at(t, L / 2, y)
        if (t.id === '表面左中') return at(t, -L / 4, y)
        if (t.id === '表面右中') return at(t, L / 4, y)
        return at(t, 0, y)  // 表面中
      })
    }
    case 'loop_track': {
      const R = num(p.radius, 1)
      return spec.anchors.map((t) => at(t, 0, t.id === '顶点' ? R : -R))
    }
    case 'spring': {
      const L0 = num(p.L0, 1)
      return spec.anchors.map((t) => at(t, t.id === '右端' ? L0 : 0, 0))
    }
    case 'rope': {
      const L = num(p.L, 2)
      return spec.anchors.map((t) => at(t, t.id === '右端' ? L : 0, 0))
    }
    default:
      return spec.anchors
  }
}

/** 按锚点 ID 取解析后的模板（无此 ID 回落原点，与旧 anchorLocal 行为一致） */
export function resolveAnchorById(e: GeoElement, anchorId: string): AnchorTemplate {
  const hit = resolveAnchors(e).find((t) => t.id === anchorId)
  if (hit) return hit
  const spec = byType.get(e.type)
  const fallback = spec?.anchors?.find((t) => t.id === anchorId)
  return fallback ?? { id: anchorId, local: { x: 0, y: 0 }, kind: 'attachPoint', accepts: [], align: 'free', label: anchorId }
}

/** 锚点世界坐标：position + R(angle + tilt)·local（tilt=固有倾角，仅 belt） */
export function anchorWorldOf(e: GeoElement, anchorId: string): { x: number; y: number } {
  const t = resolveAnchorById(e, anchorId)
  const a = e.angle + resolveTilt(e)
  const c = Math.cos(a), s = Math.sin(a)
  return { x: e.position.x + c * t.local.x - s * t.local.y, y: e.position.y + s * t.local.x + c * t.local.y }
}
