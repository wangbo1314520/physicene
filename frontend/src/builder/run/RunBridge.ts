/**
 * 统一运行桥（方案 §4.1 ⑤）：GeoElement[] → Java PhysicsElement[] → /simulations/run → WS 帧 → 画布回放。
 * 类型映射与 Java ElementBehavior 契约对齐（阶段一 PhysicsElement.params 注释）：
 *  - belt: beltSpeed/beltLength/beltRadius（builder: vb/L + properties.friction=mu + angle=th）
 *  - loop_track: radius/arcA0/arcA1/arcSideCode（builder: radius/side）
 *  - rope: jointLength；spring: jointLength/stiffness/dampingRatio；pulley: ratio(1|2)
 *  - 关节连接：connectTo/connectTo2 = 两端连体，anchorA/anchorB = 连体上的局部锚点（由锚点名解析目录模板）
 *  - 单端连接：绳/弹簧自身 position 作为固定悬点（取未连接端的锚点世界坐标）
 * 电路/热学/光学/近代引擎在阶段四接入（EngineAnalyzer.path 判定 + 此处拒绝）。
 */
import { computed } from 'vue'
import { useSimulationSocket, type PhysicsElementInput } from '../../composables/useSimulationSocket'
import { byType, type GeoElement } from '../catalog'
import type { Analysis } from '../analysis/EngineAnalyzer'

/** 阶段四才接入联合运行的类型（画布可搭、运行桥暂拒绝） */
const PHASE4 = new Set(['cylinder', 'piston', 'gas_cell', 'heater', 'rail_pair', 'rod_bar',
  'light_source', 'prism', 'optic_screen', 'photo_tube', 'h_atom'])
/** 不建刚体的显示/检测类（静默跳过） */
const NO_BODY = new Set(['photogate', 'force_sensor', 'trail', 'energy_meter', 'timeline', 'anchor_point'])

export interface RunPose { x: number; y: number; angle?: number }

const num = (v: number | undefined, fb: number): number => (Number.isFinite(v) ? (v as number) : fb)
const deg2rad = (d: number) => (d * Math.PI) / 180

/** 锚点名 → 局部坐标（目录模板） */
function anchorLocal(type: string, anchorId: string): { x: number; y: number } {
  const a = byType.get(type)?.anchors?.find((t) => t.id === anchorId)
  return a ? { x: a.local.x, y: a.local.y } : { x: 0, y: 0 }
}

/** 绳/弹簧未连接端的锚点名（目录约定 左端/右端） */
const otherEnd = (endId: string): string => (endId === '左端' ? '右端' : '左端')

/** 元件自身的锚点世界坐标（含旋转） */
function anchorWorldOfSelf(e: GeoElement, anchorId: string): { x: number; y: number } {
  const l = anchorLocal(e.type, anchorId)
  const c = Math.cos(e.angle), s = Math.sin(e.angle)
  return { x: e.position.x + c * l.x - s * l.y, y: e.position.y + s * l.x + c * l.y }
}

/** 透传 Java 侧逐体参数（bullet/fixRot），其余 params 由各 case 显式映射 */
function pickWireParams(e: GeoElement): Record<string, number> {
  const out: Record<string, number> = {}
  if (e.params.bullet !== undefined) out.bullet = e.params.bullet
  if (e.params.fixRot !== undefined) out.fixRot = e.params.fixRot
  return out
}

export interface ScenePackage { list: PhysicsElementInput[]; skipped: string[]; notes: string[] }

/** GeoElement[] → Java PhysicsElement[]（映射契约见文件头） */
export function toPhysicsElements(els: GeoElement[]): ScenePackage {
  const list: PhysicsElementInput[] = []
  const skipped: string[] = []
  const notes: string[] = []

  for (const e of els) {
    if (PHASE4.has(e.type)) { skipped.push(e.type); continue }
    if (NO_BODY.has(e.type)) continue
    const p = e.params
    const base: PhysicsElementInput = {
      id: e.id, type: '', position: { x: e.position.x, y: e.position.y },
      angle: e.angle, properties: {}, params: pickWireParams(e),
    }
    const asBody = (patch: Partial<PhysicsElementInput>) => { Object.assign(base, patch); list.push(base) }

    switch (e.type) {
      case 'block': {
        // v0 沿 ang 方向（默认水平；斜面场景给 −θ 沿面入速）
        const v0 = num(p.v0, 0), ang = deg2rad(num(p.ang, 0))
        asBody({ type: 'cube', properties: { mass: num(p.m, 1), friction: num(p.mu, 0.2), restitution: 0 },
          initialState: v0 ? { velocity: { x: v0 * Math.cos(ang), y: v0 * Math.sin(ang) } } : undefined })
        break
      }
      case 'sphere':
        asBody({ type: 'sphere', properties: { mass: num(p.m, 1), friction: num(p.mus, 0), restitution: num(p.e, 1) },
          initialState: v0State(p) })
        break
      case 'particle': {
        const v0 = num(p.v0, 0), ang = deg2rad(num(p.ang, 0))
        asBody({ type: 'sphere', scale: { x: 0.4, y: 0.4 }, properties: { mass: num(p.m, 1) },
          initialState: { velocity: { x: v0 * Math.cos(ang), y: v0 * Math.sin(ang) } } })
        break
      }
      case 'cart':
        asBody({ type: 'cube', scale: { x: num(p.L, 6), y: 0.3 },
          properties: { mass: num(p.M, 3), friction: num(p.mu2, 0.1), restitution: 0 } })
        break
      case 'slope': {
        const L = num(p.L, 6), th = Math.min(80, Math.max(0, num(p.th, 30)))
        const H = Math.min(20, L * Math.tan(deg2rad(th)))
        // builder 原点=直角角点 → Java 原点=三角形中心（基准 2×1 缩放：底 2·sx 高 sy）
        const c = Math.cos(e.angle), s = Math.sin(e.angle)
        asBody({ type: 'slope', scale: { x: L / 2, y: H },
          position: { x: e.position.x + (c * L - s * H) / 2, y: e.position.y + (s * L + c * H) / 2 } })
        break
      }
      case 'ground':
        asBody({ type: 'wall', scale: { x: 20, y: 0.2 }, fixed: true,
          properties: { friction: num(p.mu, 0.3) } })
        break
      case 'vwall': // 竖直墙面（整改1）：wall 旋转 90°，高度 H
        asBody({ type: 'wall', scale: { x: num(p.H, 6), y: 0.2 }, fixed: true, angle: e.angle + Math.PI / 2,
          properties: { friction: 0 } })
        break
      case 'lead_in': // 切线导入段（整改1）：小 wall 沿段方向
        asBody({ type: 'wall', scale: { x: num(p.L, 2), y: 0.1 }, fixed: true,
          properties: { friction: 0 } })
        break
      case 'projectile_platform':
        asBody({ type: 'wall', scale: { x: 3, y: 0.3 }, fixed: true, properties: { friction: 0 } })
        break
      case 'belt':
        asBody({ type: 'belt', angle: e.angle + deg2rad(num(p.th, 0)), fixed: true,
          properties: { friction: num(p.mu, 0.4) },
          params: { beltSpeed: num(p.vb, 3), beltLength: num(p.L, 6), beltRadius: 0.15 } })
        break
      case 'loop_track':
        asBody({ type: 'loop_track', fixed: true,
          params: { radius: num(p.radius, 1), arcA0: 0, arcA1: 360, arcSideCode: num(p.side, 0) } })
        break
      case 'rope': case 'spring': {
        // 连接映射：links[0] → connectTo/anchorA（连体 A 上锚点），links[1] → connectTo2/anchorB；
        // 单端连接时 position = 未连接端的世界坐标（Java 以元件 position 为固定悬点）
        const links = e.links
        if (links.length === 0) { notes.push(`${e.type}「${e.id}」未连接，已跳过`); continue }
        const a = links[0]
        const aType = els.find((x) => x.id === a.toId)?.type
        if (!aType) { notes.push(`${e.type}「${e.id}」连接对象缺失，已跳过`); continue }
        base.connectTo = a.toId
        base.anchorA = anchorLocal(aType, a.anchorB)
        if (links.length >= 2) {
          const b = links[1]
          const bType = els.find((x) => x.id === b.toId)?.type
          if (bType) {
            base.connectTo2 = b.toId
            base.anchorB = anchorLocal(bType, b.anchorB)
          }
        } else {
          // 单端连接：Java 以元件 position 为固定悬点——未连端局部坐标取参数化长度
          //（spring 左端(0)/右端(L0)，rope 左端(0)/右端(L)；目录静态锚点 (1,0)/(2,0) 仅对默认长度成立）
          const len = e.type === 'spring' ? num(p.L0, 1) : num(p.L, 2)
          if (a.anchorA === '左端') {
            // 未连的右端在局部 +len 处
            const c2 = Math.cos(e.angle), s2 = Math.sin(e.angle)
            base.position = { x: e.position.x + c2 * len, y: e.position.y + s2 * len }
          } else {
            base.position = { x: e.position.x, y: e.position.y } // 未连的左端即元件原点
          }
        }
        if (e.type === 'rope') base.params = { jointLength: num(p.L, 2) }
        else base.params = { jointLength: num(p.L0, 1), stiffness: num(p.k, 100), dampingRatio: num(p.zeta, 0.05) }
        base.type = e.type
        list.push(base)
        break
      }
      case 'pulley': {
        const links = e.links
        if (links.length < 2) { notes.push(`滑轮「${e.id}」需两端跨绳连接，已跳过`); continue }
        const tA = els.find((x) => x.id === links[0].toId)?.type
        const tB = els.find((x) => x.id === links[1].toId)?.type
        if (!tA || !tB) { notes.push(`滑轮「${e.id}」连接对象缺失，已跳过`); continue }
        base.type = 'pulley'
        base.connectTo = links[0].toId
        base.connectTo2 = links[1].toId
        base.params = { ratio: num(p.kind, 0) === 1 ? 2 : 1 }
        list.push(base)
        break
      }
      case 'e_region':
        asBody({ type: 'e_field', scale: { x: 12, y: 6 }, fixed: true,
          properties: { eFieldX: num(p.Ex, 0), eFieldY: num(p.Ey, 9.8) } })
        break
      case 'b_region':
        asBody({ type: 'b_field', scale: { x: 12, y: 12 }, fixed: true,
          properties: { bField: num(p.B, 1), bDirection: num(p.dir, 0) === 0 ? 'in' : 'out' } })
        break
      case 'point_charge': {
        const m = num(p.m, 1)
        asBody({ type: 'point_charge', properties: { mass: m, charge: num(p.qm, 1) * m, friction: 0, restitution: 0 },
          initialState: v0State(p) })
        break
      }
      default:
        skipped.push(e.type)
    }
  }
  return { list, skipped, notes }
}

/** v0 参数 → 初速度（沿 +x；particle 用 ang 已特判） */
function v0State(p: Record<string, number>): { velocity: { x: number; y: number } } | undefined {
  const v0 = num(p.v0, 0)
  return v0 ? { velocity: { x: v0, y: 0 } } : undefined
}

/**
 * 运行桥组合式：socket 状态 + 引擎路由判定 + 画布姿态映射。
 * run() 返回错误信息（null = 已启动）。
 */
export function useRunBridge() {
  const socket = useSimulationSocket()

  async function run(els: GeoElement[], analysis: Analysis, maxDuration = 12, gravityY = -9.8): Promise<string | null> {
    if (els.length === 0) return '画布为空'
    if (analysis.path === 'none') return '没有可运行的元件（只有显示类元件）'
    if (analysis.path === 'ts') return '光学/近代为前端本地引擎，阶段四接入'
    if (analysis.engines.some((e) => e.key === 'circuit' || e.key === 'thermal'))
      return '电路/热学联合运行在阶段四接入；当前支持：力学刚体（斜面/传送带/圆轨道/绳弹簧滑轮）+ 电磁场'
    const pkg = toPhysicsElements(els)
    if (pkg.skipped.length) return `暂不支持运行的元件：${[...new Set(pkg.skipped)].join('、')}`
    if (!pkg.list.length) return '没有可映射到求解器的元件'
    const hasBeltOrLoop = els.some((e) => e.type === 'belt' || e.type === 'loop_track')
    await socket.run(pkg.list, {
      gravity: { x: 0, y: gravityY },
      maxDuration,
      substeps: hasBeltOrLoop ? 4 : 2, // SceneValidator：带/圆轨道建议 substeps≥4
    })
    return socket.error.value ? String(socket.error.value) : null
  }

  /** 帧姿态（id → 世界位姿）；仅 running/paused 时非空 */
  const runStates = computed<Map<string, RunPose> | null>(() => {
    const st = socket.state
    if (st.status !== 'running' && st.status !== 'paused') return null
    const m = new Map<string, RunPose>()
    for (const s of st.subjects) m.set(s.id, { x: s.x, y: s.y, angle: s.angle })
    return m
  })

  return { socket, run, runStates }
}
