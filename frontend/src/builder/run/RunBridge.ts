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
import { computed, ref } from 'vue'
import { useSimulationSocket, type PhysicsElementInput } from '../../composables/useSimulationSocket'
import { THERMO_DEVICE_TYPES, AC_DEVICE_TYPES } from '../analysis/EngineAnalyzer'
import { CYCLOTRON_TYPES, DC_DEVICE_TYPES, WAVE_DEVICE_TYPES, MISC_DEVICE_TYPES } from '../analysis/EngineAnalyzer'
import { CIRCUIT_BASIC_TYPES, runCircuitBasics } from '../../physics/circuit-basics'
import { CELESTIAL_TYPES, runCelestial } from '../../physics/celestial'
import { workspace } from '../workspace'
import { byType, BELT_RADIUS, type GeoElement } from '../catalog'
import { resolveAnchorById, anchorWorldOf , resolveAnchors} from '../model/anchors'
import type { Analysis } from '../analysis/EngineAnalyzer'

/** P2·耦合接入完成：rail-rod/热学已接入 Java 联合运行——PHASE4 拒绝集合清空 */
const PHASE4 = new Set<string>()
/** TS 本地引擎域（P1·批次 5）：不 POST Java，本地计算后返回帧 */
const TS_ENGINE_TYPES = new Set(['light_source', 'prism', 'optic_screen', 'photo_tube', 'h_atom',
  // 清偿5·P1 11 卡补面：劈尖(56)/双缝(57)/物质波(65)/玻尔碰撞(64)——Runner 公式已有，接 builder 元件
  'wedge', 'double_slit', 'electron_gun', 'bohr_collision',
  // P3 批2：热学静力学装置（决策1：TS 纯函数装置引擎）
  ...THERMO_DEVICE_TYPES,
  // P3 批3：AC 装置（决策2：TS 复数 MNA）
  ...AC_DEVICE_TYPES,
  // 批3 第3步：回旋加速器（时变场专用求解器）
  ...CYCLOTRON_TYPES,
  // 批3 第4步：DC 装置六卡
  ...DC_DEVICE_TYPES,
  // B1 批1（2026-10-07）：电路基础五件（wire 拓扑→MNA，circuit-basics）
  ...CIRCUIT_BASIC_TYPES,
  // 批A（2026-10-10）：天体运动（Verlet，celestial.ts）
  ...CELESTIAL_TYPES,
  // 批4：波3 + 杂项装置
  ...WAVE_DEVICE_TYPES, ...MISC_DEVICE_TYPES])
/** 不建刚体的显示/检测类（静默跳过）；bracket/pole = 理想固定端（无碰撞体，绳/弹簧连接端折算固定悬点） */
// NO_BODY 分类制度（十轮追问2——防第 4 次静默丢弃）：不建刚体的元件必须属于下方三类之一，
// v2 CI 校验 NO_BODY ⊆ 三类并集（新成员未分类即红——被迫做归类决策）
const FIXED_ANCHOR_TYPES = new Set(['bracket', 'pole', 'anchor_point'])   // 固定端：绳/弹簧悬点（rope 分支消费）
const DISPLAY_TYPES = new Set(['trail', 'timeline', 'vector_arrow', 'graph_tag', 'orbit_ring'])  // 纯显示：前端渲染即全部功能
const NO_BODY = new Set([...FIXED_ANCHOR_TYPES, ...DISPLAY_TYPES])
// 检测器（Java SensorElement 消费——发射为无体元件，connectTo=绑定目标，读数走 probes 通道）。
// P5b-3 接线 3 件；photogate/force_sensor/energy_meter 于 2026-10-01（十轮追问3，原列 P6 提前）补齐
const SENSOR_TYPES = new Set(['accel_sensor', 'speed_sensor', 'range_finder', 'photogate', 'force_sensor', 'energy_meter'])

export interface RunPose { x: number; y: number; angle?: number }

const num = (v: number | undefined, fb: number): number => (Number.isFinite(v) ? (v as number) : fb)
const deg2rad = (d: number) => (d * Math.PI) / 180

/** 锚点名 → 局部坐标：按元件实际参数解析（resolveAnchors 统一机制，原静态目录读取已收编） */
function anchorLocalOf(e: GeoElement, anchorId: string): { x: number; y: number } {
  const t = resolveAnchorById(e, anchorId)
  return { x: t.local.x, y: t.local.y }
}

/** 元件自身的锚点世界坐标（含旋转 + 固有倾角） */
function anchorWorldOfSelf(e: GeoElement, anchorId: string): { x: number; y: number } {
  return anchorWorldOf(e, anchorId)
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
    if (SENSOR_TYPES.has(e.type)) {
      // P5b-3 接线：检测器无刚体、connectTo=links[0] 目标（此前在 NO_BODY 被静默丢弃——SensorElement 从未收到数据）
      if (!e.links.length) { notes.push(`检测器「${e.id}」未绑定目标（用连线连接到物体），已跳过`); continue }
      list.push({ id: e.id, type: e.type, position: { x: e.position.x, y: e.position.y }, angle: e.angle,
        properties: {}, params: {}, connectTo: e.links[0].toId })
      continue
    }
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
      case 'rigid_roller':
        asBody({ type: 'rigid_roller', properties: { mass: num(p.m, 1), friction: num(p.mu ?? 0.2, 0.2), restitution: 0 },
          params: { k: num(p.k, 0.5) } })
        break
      case 'sphere':
        asBody({ type: 'sphere', properties: { mass: num(p.m, 1), friction: num(p.mus, 0.05), restitution: num(p.e, 0.8) },
          initialState: v0State(p) })
        break
      case 'particle': {
        const v0 = num(p.v0, 0), ang = deg2rad(num(p.ang, 0))
        asBody({ type: 'sphere', scale: { x: 0.4, y: 0.4 }, properties: { mass: num(p.m, 1) },
          initialState: { velocity: { x: v0 * Math.cos(ang), y: v0 * Math.sin(ang) } } })
        break
      }
      case 'rod_bar': {
        // P2.1·耦合接入：_srcType 标记供 Java orchestrator 检测（实际类型=cube）
        const v0r = num(p.v0, 0)
        asBody({ type: 'cube', properties: { mass: num(p.m, 1), friction: 0 },
          params: { R: num(p.R, 1), F: num(p.F, 0), _srcType: 1 },
          initialState: v0r ? { velocity: { x: v0r, y: 0 } } : undefined })
        break
      }
      case 'rail_pair': {
        // P2·耦合接入：导轨对=固定刚体（wall），B 场由配套 b_region 提供
        asBody({ type: 'wall', scale: { x: 100, y: 0.2 }, fixed: true, properties: { friction: 0 }, params: { railL: num(p.L, 1) } })
        break
      }
      case 'piston': {
        // P2.1·耦合接入：_srcType=2 标记（Java PistonCoupling 检测用）
        asBody({ type: 'cube', properties: { mass: num(p.M, 10), friction: 0 },
          params: { dampingRatio: num(p.dampingRatio, 0.5), _srcType: 2 } })
        break
      }
      case 'cylinder': {
        // P2·耦合接入：汽缸=固定刚体（wall）
        asBody({ type: 'wall', fixed: true, properties: { friction: 0 }, params: { area: num(p.S, 0.01) } })
        break
      }
      case 'gas_cell': {
        // P2.1·耦合接入：_srcType=3 标记（Java GasCell 耦合读 p0/V0/T0/gamma）
        asBody({ type: 'wall', fixed: true, properties: {},
          params: { p0: num(p.p0, 101325), V0: num(p.V0, 0.01), T0: num(p.T0, 300), gamma: num(p.gamma, 1), _srcType: 3 } })
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
          position: { x: e.position.x + (c * L - s * H) / 2, y: e.position.y + (s * L + c * H) / 2 },
          properties: { friction: num(p.mu, 0.2) } })  // 透传 μ（此前漏传致 Java 默认 0）
        break
      }
      case 'ground':
        asBody({ type: 'wall', scale: { x: 100, y: 0.2 }, fixed: true,
          properties: { friction: num(p.mu, 0.2) } })  // fb 0.3→0.2 对齐 catalog MU 默认（v4 抓获）
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
          params: { beltSpeed: num(p.vb, 3), beltLength: num(p.L, 6), beltRadius: BELT_RADIUS } })
        break
      case 'loop_track': {
        // A1 开口环（2026-10-06）：底部入口缺口（gap 参数，默认 40°，0=闭环兼容旧场景）。
        // 弧段 CCW：a0 = 270+gap/2 起，span = 360−gap（缺口中心 270°=底部）。
        const gap = Math.max(0, Math.min(120, num(p.gap, 40)))
        asBody({ type: 'loop_track', fixed: true,
          params: { radius: num(p.radius, 1), arcA0: 270 + gap / 2, arcA1: 270 - gap / 2 + 360, arcSideCode: num(p.side, 0) } })
        break
      }
      case 'rope': case 'spring': {
        // 连接映射：body 端 → connectTo(+anchorA=连体局部锚点)；双 body 端再加 connectTo2/anchorB。
        // 固定端（NO_BODY：bracket/pole/anchor_point）或未连端 → Java 悬点语义：
        //   position=悬点世界坐标（Java 以 rope/spring 自身 position 为固定悬点，connectTo 侧连体）
        const links = e.links
        if (links.length === 0) { notes.push(`${e.type}「${e.id}」未连接，已跳过`); continue }
        const a = links[0]
        const aEl = els.find((x) => x.id === a.toId)
        if (!aEl) { notes.push(`${e.type}「${e.id}」连接对象缺失，已跳过`); continue }
        const b = links.length >= 2 ? links[1] : undefined
        const bEl = b ? els.find((x) => x.id === b.toId) : undefined
        const fixedA = NO_BODY.has(aEl.type)
        const fixedB = bEl ? NO_BODY.has(bEl.type) : false
        if (fixedA && (!bEl || fixedB)) {
          notes.push(`${e.type}「${e.id}」无 body 连体（A端固定${bEl ? '且B端固定' : '且无B端'}），已跳过`); continue
        }
        if (fixedA && b && bEl) {
          // A 端固定 → 悬点=A 锚世界坐标；连体=B（占据 connectTo/anchorA 槽位）
          base.position = anchorWorldOfSelf(aEl, a.anchorB)
          base.connectTo = b.toId
          base.anchorA = anchorLocalOf(bEl, b.anchorB)
        } else {
          base.connectTo = a.toId
          base.anchorA = anchorLocalOf(aEl, a.anchorB)
          if (bEl && b) {
            if (fixedB) {
              // B 端固定 → 悬点=B 锚世界坐标（A 为连体）
              base.position = anchorWorldOfSelf(bEl, b.anchorB)
            } else {
              base.connectTo2 = b.toId
              base.anchorB = anchorLocalOf(bEl, b.anchorB)
            }
          } else {
            // 单端连接（另一端无目标）：未连端局部坐标由 resolveAnchors 按参数解析
            //（spring 右端=(L0,0)、rope 右端=(L,0)，含旋转——原特判已收编）
            const unlinked = resolveAnchorById(e, a.anchorA === '左端' ? '右端' : '左端')
            const c2 = Math.cos(e.angle), s2 = Math.sin(e.angle)
            base.position = { x: e.position.x + c2 * unlinked.local.x - s2 * unlinked.local.y,
              y: e.position.y + s2 * unlinked.local.x + c2 * unlinked.local.y }
          }
        }
        if (e.type === 'rope') base.params = { jointLength: num(p.L, 2), tMax: num(p.Tmax, 40) }  // D5：断裂阈值透传
        else base.params = { jointLength: num(p.L0, 1), stiffness: num(p.k, 100), dampingRatio: num(p.zeta, 0.05) }
        base.type = e.type
        list.push(base)
        break
      }
      case 'pulley': {
        const links = e.links
        if (links.length < 2) { notes.push(`滑轮「${e.id}」需两端跨绳连接，已跳过`); continue }
        const aEl = els.find((x) => x.id === links[0].toId)
        const bEl = els.find((x) => x.id === links[1].toId)
        if (!aEl || !bEl) { notes.push(`滑轮「${e.id}」连接对象缺失，已跳过`); continue }
        const movable = num(p.kind, 0) === 1
        if (!movable && (NO_BODY.has(aEl.type) || NO_BODY.has(bEl.type))) {
          notes.push(`滑轮「${e.id}」两端须为运动物体（固定悬挂=把滑轮吸附到 bracket/pole 的 mount 锚点，勿直接连线），已跳过`)
          continue
        }
        base.type = 'pulley'
        // 动滑轮（决策批准 2026-10-07）：绳端允许固定锚（anchor_point/bracket/pole 的 mount）——
        // 固定端以世界坐标入 params（Java 端静态端）；运动端仍走 connectTo。滑轮本体为动态体（质量 M）
        const anchorWorldOf = (t: GeoElement, anchorId: string) => {
          const a = resolveAnchors(t).find((x) => x.id === anchorId)
          const c2 = Math.cos(t.angle), s2 = Math.sin(t.angle)
          return a
            ? { x: t.position.x + c2 * a.local.x - s2 * a.local.y, y: t.position.y + s2 * a.local.x + c2 * a.local.y }
            : { x: t.position.x, y: t.position.y }
        }
        // kind=动滑轮本体模型开关（Java movable() 判定同源——2026-10-11 修复：此前未发送，
        // Java 端 ratio()==2 开关误劫持教材式 ratio 约束致速度比 1.21）
        const params: Record<string, number> = { ratio: movable ? 2 : 1, kind: movable ? 1 : 0 }
        if (movable) {
          params.M = num(p.M, 1)
          const ends = [aEl, bEl]
          ends.forEach((t, i) => {
            if (NO_BODY.has(t.type)) {
              const anchorId = i === 0 ? links[0].anchorB : links[1].anchorB
              const w = anchorWorldOf(t, anchorId)
              params[`end${i}x`] = +w.x.toFixed(4)
              params[`end${i}y`] = +w.y.toFixed(4)
            }
          })
          base.connectTo = NO_BODY.has(aEl.type) ? undefined : links[0].toId
          base.connectTo2 = NO_BODY.has(bEl.type) ? undefined : links[1].toId
        } else {
          base.connectTo = links[0].toId
          base.connectTo2 = links[1].toId
        }
        base.params = params
        list.push(base)
        break
      }
      case 'e_region':
        asBody({ type: 'e_field', scale: { x: num(p.L, 12), y: num(p.W, 6) }, fixed: true,
          properties: { eFieldX: num(p.Ex, 0), eFieldY: num(p.Ey, 0) } })  // fb 9.8→0 对齐 catalog 默认（空场区；v4 抓获）
        break
      case 'constant_force':
        // P5a 回填：恒力装置——通过 Orchestrator 对目标体施力
        asBody({ type: 'wall', fixed: true, properties: {},
          params: { F: num(p.F, 0), duration: num(p.duration, 2), target: num(p.target, 0), _srcType: 7 } })
        break
      case 'accelerating_platform':
        // P5a 批2 回填：电梯参考系——平台=固定墙（电梯地板），Java 对全部自由体施惯性力 −ma（_srcType=8）
        // P5b-2：frame=1 地面系——Java 平台按 ½at² 运动学平移、无惯性力、发 relY 探针
        asBody({ type: 'wall', scale: { x: num(p.L, 8), y: 0.3 }, fixed: true, properties: { friction: 0 },
          params: { a: num(p.a, 2), frame: num(p.frame, 0), _srcType: 8 } })
        break
      case 'capacitor_r':
        asBody({ type: 'wall', fixed: true, properties: {},
          params: { C: num(p.C, 0.1), V0c: num(p.V0, 0), _srcType: 5 } })
        break
      case 'coil_frame':
        // v3 发现：h 曾入 params 但 Java 不消费——改经 body scale 消费（w/h=框几何，与 cart L 同形式；
        // w 另留 params 供 Java EMF=B·w·v 读）。卡 42 w=h=1 与默认 1×1 等价，行为不变
        asBody({ type: 'cube', scale: { x: num(p.w, 1), y: num(p.h, 1) }, properties: { mass: 1, friction: 0 },
          params: { R: num(p.R, 1), w: num(p.w, 1), _srcType: 6 },
          initialState: v0State(p) })
        break
      case 'b_region':
        asBody({ type: 'b_field', scale: { x: num(p.L, 12), y: num(p.W, 12) }, fixed: true,
          properties: { bField: num(p.B, 1), bDirection: num(p.dir, 0) === 0 ? 'in' : 'out' } })
        break
      case 'point_charge': {
        const m = num(p.m, 1)
        asBody({ type: 'point_charge', properties: { mass: m, charge: num(p.qm, 1) * m, friction: 0, restitution: 0 },
          // grav：0=不计重力（默认，E/B 场教材口径）/1=计（复合场 qE=mg 平衡类）——Java 侧补偿判定
          params: { grav: num(p.grav, 0) },
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
  /** P1·TS 本地引擎播放状态（BuilderView 消费：status/readings/rays/frameIdx） */
  const tsRun = ref<{
    status: 'idle' | 'running' | 'ended'
    t: number
    readings: Record<string, number>
    rays: { x0: number; y0: number; x1: number; y1: number; kind: string }[]
    frames: unknown[]
    /** 批A：TS 帧位姿（天体等运动型 TS 引擎）——BuilderCanvas 据此驱动网格+尾迹 */
    poses: { id: string; x: number; y: number; vx: number; vy: number }[]
  }>({ status: 'idle', t: 0, readings: {}, rays: [], frames: [], poses: [] })
  /** 最近一次 run() 的非阻断提示（连接缺失等）——BuilderView toast 展示，不再静默（2026-09-30 追问3） */
  const lastNotes = ref<string[]>([])
  let tsTimer: ReturnType<typeof setInterval> | null = null

  function stopTs() {
    if (tsTimer) { clearInterval(tsTimer); tsTimer = null }
    tsRun.value = { ...tsRun.value, status: 'ended' }
  }

  /** 批 3·6.5 复位：TS 引擎播放态回 idle（与 socket.reset 配对，"运行前"语义） */
  function resetTs() {
    if (tsTimer) { clearInterval(tsTimer); tsTimer = null }
    tsRun.value = { status: 'idle', t: 0, readings: {}, rays: [], frames: [], poses: [] }
  }

  async function run(els: GeoElement[], analysis: Analysis, maxDuration = 12, gravityY = -9.8, substepsOverride?: number, sceneId?: string): Promise<string | null> {
    lastNotes.value = []  // 每次运行重置（TS 路径不经 toPhysicsElements）
    if (els.length === 0) return '画布为空'
    if (analysis.path === 'none') return '没有可运行的元件（只有显示类元件）'
    // P1·TS 本地引擎：光学/近代元件走 OpticsRunner/ModernRunner，不 POST Java
    if (els.every((e) => TS_ENGINE_TYPES.has(e.type) || NO_BODY.has(e.type))) {
      const isWave = els.some((e) => WAVE_DEVICE_TYPES.has(e.type))
      const isMisc = els.some((e) => MISC_DEVICE_TYPES.has(e.type))
      const isCelestial = els.some((e) => CELESTIAL_TYPES.has(e.type))
      const isCircuit = els.some((e) => CIRCUIT_BASIC_TYPES.has(e.type))
      const isDc = !isCircuit && !isWave && !isMisc && els.some((e) => DC_DEVICE_TYPES.has(e.type))
      const isCyc = !isDc && els.some((e) => CYCLOTRON_TYPES.has(e.type))
      const isAc = !isCyc && els.some((e) => AC_DEVICE_TYPES.has(e.type))
      const isThermo = !isAc && els.some((e) => THERMO_DEVICE_TYPES.has(e.type))
      const isOptics = !isThermo && els.some((e) => ['light_source', 'prism', 'optic_screen', 'wedge', 'double_slit'].includes(e.type))
      const { runOptics } = await import('./OpticsRunner')
      const { runModern } = await import('./ModernRunner')
      const { runThermal } = await import('../../physics/thermal-statics')
      const { runAc } = await import('../../physics/ac-circuit')
      const { runCyclotron } = await import('../../physics/cyclotron')
      const { runDc } = await import('../../physics/dc-devices')
      const { runWave } = await import('../../physics/wave')
      const { runMisc } = await import('../../physics/misc-devices')
      const bodies = els.filter((e) => TS_ENGINE_TYPES.has(e.type)).map((e) => ({
        id: e.id, type: e.type, x: e.position.x, y: e.position.y, angle: e.angle, params: e.params,
      }))
      // 批A：天体需要 x/y 全坐标（含中心天体），frames 含 poses 位姿通道
      const isCelestialRun = isCelestial && !isCircuit && !isWave && !isMisc && !isDc && !isCyc && !isAc && !isThermo && !isOptics
      const celestialBodies = els.filter((e) => CELESTIAL_TYPES.has(e.type)).map((e) => ({
        id: e.id, type: e.type, x: e.position.x, y: e.position.y, angle: e.angle, params: e.params,
      }))
      // timeScale 来源：元件 params.timeScale（卡模板写入首元件）——引擎级时间压缩
      const celestialTimeScale = celestialBodies[0]?.params.timeScale
      // B1：电路基础件需要 links（wire 拓扑），bodies 映射剥离了 links——单独构造
      const frames = isCelestialRun
        ? runCelestial(celestialBodies as Parameters<typeof runCelestial>[0],
            { maxDuration, timeScale: celestialTimeScale })
        : isCircuit
        ? runCircuitBasics(els.filter((e) => CIRCUIT_BASIC_TYPES.has(e.type)).map((e) => ({
            id: e.id, type: e.type, x: e.position.x, y: e.position.y, angle: e.angle,
            params: e.params, links: e.links.map((l) => ({ toId: l.toId, kind: l.kind, anchorA: l.anchorA, anchorB: l.anchorB })),
          })) as Parameters<typeof runCircuitBasics>[0], maxDuration)
        : isWave
        ? runWave(bodies as Parameters<typeof runWave>[0], maxDuration)
        : isMisc
          ? runMisc(bodies as Parameters<typeof runMisc>[0], maxDuration)
          : isDc
            ? runDc(bodies as Parameters<typeof runDc>[0], maxDuration)
        : isCyc
          ? runCyclotron(bodies as Parameters<typeof runCyclotron>[0], maxDuration)
        : isAc
          ? runAc(bodies as Parameters<typeof runAc>[0], maxDuration)
        : isThermo
          ? runThermal(bodies as Parameters<typeof runThermal>[0], maxDuration)
          : isOptics
          ? runOptics(bodies as Parameters<typeof runOptics>[0], maxDuration)
          : runModern(bodies as Parameters<typeof runModern>[0], maxDuration)
      if (frames.length) {
        // P1.1·TS 引擎播放：30fps 逐帧推进（与 Java WS 同节奏），BuilderView 消费 tsRun
        tsRun.value = { status: 'running', t: 0, readings: {}, rays: [], frames, poses: [] }
        const stepMs = 1000 / 30
        let idx = 0
        if (tsTimer) clearInterval(tsTimer)
        tsTimer = setInterval(() => {
          const f = frames[idx] as { t: number; readings?: Record<string, number>; rays?: typeof tsRun.value.rays; transitions?: unknown[]; poses?: typeof tsRun.value.poses }
          tsRun.value = {
            ...tsRun.value,
            t: f.t,
            readings: f.readings ?? {},
            rays: (f as { rays?: typeof tsRun.value.rays }).rays ?? [],
            poses: f.poses ?? tsRun.value.poses,
          }
          // A+B（2026-10-10）：TS 帧位姿写入共享 store——BuilderCanvas runStates 合并消费 + threeScene watch
          workspace.tsPoses = tsRun.value.poses
          idx++
          if (idx >= frames.length) stopTs()
        }, stepMs)
        return null  // 无错误
      }
      return isCircuit ? '电路缺少电源（干电池）或端子连线不完整——用「导线」连接各元件端子成回路' : 'TS 引擎未识别到可运行的光学/近代元件组合'
    }
    if (els.some((e) => TS_ENGINE_TYPES.has(e.type)) && els.some((e) => !TS_ENGINE_TYPES.has(e.type) && !NO_BODY.has(e.type)))
      return '电路/光学/近代元件不能与力学刚体混合运行（需拆为独立场景）'
    // P2·耦合接入：rail-rod / 热学已解除拒绝（Java 联合运行，CouplingOrchestrator 调度）
    const pkg = toPhysicsElements(els)
    lastNotes.value = pkg.notes
    if (pkg.skipped.length) return `暂不支持运行的元件：${[...new Set(pkg.skipped)].join('、')}`
    if (!pkg.list.length) return '没有可映射到求解器的元件'
    const hasBeltOrLoop = els.some((e) => e.type === 'belt' || e.type === 'loop_track')
    // 动滑轮（2026-10-07）：绳约束软度随 h²——substeps 8（实测伸长 0.118→0.044→~0.015）；
    // 此类场景小（双 subject），求解成本可承受
    const hasMovablePulley = els.some((e) => e.type === 'pulley' && (e.params.kind ?? 0) === 1)
    await socket.run(pkg.list, {
      gravity: { x: 0, y: gravityY },
      maxDuration,
      substeps: substepsOverride ?? (hasBeltOrLoop ? 4 : hasMovablePulley ? 8 : 2), // 模板可覆盖（磁场色散敏感场景 8）；SceneValidator：带/圆轨道建议 ≥4
    }, sceneId)   // 2.3 声称的先存后跑——此前漏传致 recordId/回放从未生效（2026-10-11 E2E 拦截实锤）
    return socket.error.value ? String(socket.error.value) : null
  }

  /** 帧姿态（id → 世界位姿）；仅 running/paused 时非空 */
  const runStates = computed<Map<string, RunPose> | null>(() => {
    const m = new Map<string, RunPose>()
    // Java WS 路径
    const st = socket.state
    if (st.status === 'running' || st.status === 'paused') {
      for (const s of st.subjects) m.set(s.id, { x: s.x, y: s.y, angle: s.angle })
    }
    // A（2026-10-10）：TS 路径（天体等）——poses 写入共享 workspace.tsPoses，
    // 此处合并进同一 Map → BuilderCanvas poseOf() 单通道消费，两路帧位姿无分叉
    if (tsRun.value.status === 'running') {
      for (const tse of tsRun.value.poses) {
        if (!m.has(tse.id)) m.set(tse.id, { x: tse.x, y: tse.y, angle: 0 })
      }
    }
    return m.size ? m : null
  })

  return { socket, run, runStates, tsRun, lastNotes, resetTs }
}
