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
import { byType, BELT_RADIUS, type GeoElement } from '../catalog'
import { resolveAnchorById, anchorWorldOf } from '../model/anchors'
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
  // 批4：波3 + 杂项装置
  ...WAVE_DEVICE_TYPES, ...MISC_DEVICE_TYPES])
/** 不建刚体的显示/检测类（静默跳过）；bracket/pole = 理想固定端（无碰撞体，绳/弹簧连接端折算固定悬点） */
const NO_BODY = new Set(['photogate', 'force_sensor', 'trail', 'energy_meter', 'timeline', 'anchor_point', 'vector_arrow', 'graph_tag',
  'accel_sensor', 'speed_sensor', 'range_finder', 'bracket', 'pole'])

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
        asBody({ type: 'sphere', properties: { mass: num(p.m, 1), friction: num(p.mus, 0), restitution: num(p.e, 1) },
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
      case 'heater':
        // v3 发现（2026-09-29）：heater 曾并入 gas_cell 合并 case → 幽灵气室（gasEls.get(0) 可能取到
        // heater 的默认参数）+ T2 无 Java 消费静默丢失。Java 无 _srcType=4 加热路径，
        // 升温卡由 TS 热学装置引擎承载（u_tube 自带 T1/T2）——诚实跳过并告知
        notes.push(`温度源「${e.id}」暂不参与刚体模拟（加热类卡片由热学装置引擎承载）`)
        continue
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
          params: { beltSpeed: num(p.vb, 3), beltLength: num(p.L, 6), beltRadius: BELT_RADIUS } })
        break
      case 'loop_track':
        asBody({ type: 'loop_track', fixed: true,
          params: { radius: num(p.radius, 1), arcA0: 0, arcA1: 360, arcSideCode: num(p.side, 0) } })
        break
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
        // NO_BODY 固定端不可作绳端（Java PulleyElement 要求两端 body；支架悬挂由滑轮位置表达——吸附 bracket.mount 即可）
        if (NO_BODY.has(aEl.type) || NO_BODY.has(bEl.type)) {
          notes.push(`滑轮「${e.id}」两端须为运动物体（固定悬挂=把滑轮吸附到 bracket/pole 的 mount 锚点，勿直接连线），已跳过`)
          continue
        }
        base.type = 'pulley'
        base.connectTo = links[0].toId
        base.connectTo2 = links[1].toId
        base.params = { ratio: num(p.kind, 0) === 1 ? 2 : 1 }
        list.push(base)
        break
      }
      case 'e_region':
        asBody({ type: 'e_field', scale: { x: num(p.L, 12), y: num(p.W, 6) }, fixed: true,
          properties: { eFieldX: num(p.Ex, 0), eFieldY: num(p.Ey, 9.8) } })
        break
      case 'constant_force':
        // P5a 回填：恒力装置——通过 Orchestrator 对目标体施力
        asBody({ type: 'wall', fixed: true, properties: {},
          params: { F: num(p.F, 4), duration: num(p.duration, 2), target: num(p.target, 0), _srcType: 7 } })
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
  }>({ status: 'idle', t: 0, readings: {}, rays: [], frames: [] })
  let tsTimer: ReturnType<typeof setInterval> | null = null

  function stopTs() {
    if (tsTimer) { clearInterval(tsTimer); tsTimer = null }
    tsRun.value = { ...tsRun.value, status: 'ended' }
  }

  async function run(els: GeoElement[], analysis: Analysis, maxDuration = 12, gravityY = -9.8, substepsOverride?: number): Promise<string | null> {
    if (els.length === 0) return '画布为空'
    if (analysis.path === 'none') return '没有可运行的元件（只有显示类元件）'
    // P1·TS 本地引擎：光学/近代元件走 OpticsRunner/ModernRunner，不 POST Java
    if (els.every((e) => TS_ENGINE_TYPES.has(e.type) || NO_BODY.has(e.type))) {
      const isWave = els.some((e) => WAVE_DEVICE_TYPES.has(e.type))
      const isMisc = els.some((e) => MISC_DEVICE_TYPES.has(e.type))
      const isDc = !isWave && !isMisc && els.some((e) => DC_DEVICE_TYPES.has(e.type))
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
      const frames = isWave
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
        tsRun.value = { status: 'running', t: 0, readings: {}, rays: [], frames }
        const stepMs = 1000 / 30
        let idx = 0
        if (tsTimer) clearInterval(tsTimer)
        tsTimer = setInterval(() => {
          const f = frames[idx] as { t: number; readings?: Record<string, number>; rays?: typeof tsRun.value.rays; transitions?: unknown[] }
          tsRun.value = {
            ...tsRun.value,
            t: f.t,
            readings: f.readings ?? {},
            rays: (f as { rays?: typeof tsRun.value.rays }).rays ?? [],
          }
          idx++
          if (idx >= frames.length) stopTs()
        }, stepMs)
        return null  // 无错误
      }
      return 'TS 引擎未识别到可运行的光学/近代元件组合'
    }
    if (els.some((e) => TS_ENGINE_TYPES.has(e.type)) && els.some((e) => !TS_ENGINE_TYPES.has(e.type) && !NO_BODY.has(e.type)))
      return '光学/近代元件不能与力学刚体混合运行（需拆为独立场景）'
    // P2·耦合接入：rail-rod / 热学已解除拒绝（Java 联合运行，CouplingOrchestrator 调度）
    const pkg = toPhysicsElements(els)
    if (pkg.skipped.length) return `暂不支持运行的元件：${[...new Set(pkg.skipped)].join('、')}`
    if (!pkg.list.length) return '没有可映射到求解器的元件'
    const hasBeltOrLoop = els.some((e) => e.type === 'belt' || e.type === 'loop_track')
    await socket.run(pkg.list, {
      gravity: { x: 0, y: gravityY },
      maxDuration,
      substeps: substepsOverride ?? (hasBeltOrLoop ? 4 : 2), // 模板可覆盖（磁场色散敏感场景 8）；SceneValidator：带/圆轨道建议 ≥4
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

  return { socket, run, runStates, tsRun }
}
