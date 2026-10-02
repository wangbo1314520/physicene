/**
 * 引擎静态分析（方案 §4.1/§5）：元件集合 → 引擎集合 + 耦合链 + 警告 + 运行路径。
 * 耦合链读 engine/engine-rules.json（与 java-backend/src/main/resources 同源，ledger 测试断言 SHA256 一致）。
 * 引擎归属由 catalog 的 domain/role 数据驱动推导，不硬编码类型表。
 */
import type { GeoElement, ElementSpec, Domain } from '../catalog'
import { byType } from '../catalog'
import rules from '../engine/engine-rules.json'

export type EngineKey = 'rigid' | 'field' | 'circuit' | 'thermal' | 'thermoStatic' | 'acCircuit' | 'dcCircuit' | 'optics' | 'modern'

export interface EngineDesc {
  key: EngineKey
  label: string
  runner: 'java' | 'ts'
  elements: string[] // 元件 id 列表
}

export interface CouplingDesc {
  id: string
  engines: EngineKey[]
  mode: 'strong' | 'weak'
  found: string[] // 命中的 when.elements
}

export interface Analysis {
  engines: EngineDesc[]
  couplings: CouplingDesc[]
  warnings: string[]
  /** java：走 /simulations/run（含耦合调度）；ts：前端本地 Runner（光学/近代，阶段四接入）；none：无可运行引擎 */
  path: 'java' | 'ts' | 'none'
  title: string
}

const META: Record<EngineKey, { label: string; runner: 'java' | 'ts' }> = {
  rigid: { label: '刚体力学·dyn4j', runner: 'java' },
  field: { label: '电磁场·积分', runner: 'java' },
  circuit: { label: '电路·MNA', runner: 'java' },
  thermal: { label: '热学·气体', runner: 'java' },
  thermoStatic: { label: '热学·静力学装置', runner: 'ts' },  // P3 批2：液封/打气/U形管（决策1）
  acCircuit: { label: '交流·时变场装置（相量 MNA / 回旋）', runner: 'ts' },  // P3 批3（决策2）
  dcCircuit: { label: '直流装置（MNA ω=0 退化）', runner: 'ts' },  // P3 批3 第4步
  optics: { label: '光学·光线追踪', runner: 'ts' },
  modern: { label: '近代物理', runner: 'ts' },
}

/** P3 批2：热学静力学装置走 TS 纯函数引擎（决策1）；其余热学（气体耦合）走 Java */
export const THERMO_DEVICE_TYPES = new Set(['liquid_seal', 'pump_syringe', 'u_tube'])
/** P3 批3：AC 装置走 TS 复数 MNA 引擎（决策2） */
export const AC_DEVICE_TYPES = new Set(['transformer', 'powerline', 'ac_four_values', 'transformer_powerline'])  // P3 批3 第3步：回旋（时变 E 场装置，非 MNA——runCyclotron 专用求解器）
export const CYCLOTRON_TYPES = new Set(['cyclotron'])
/** P3 批3 第4步：DC 装置六卡 */
export const DC_DEVICE_TYPES = new Set(['mhd_generator', 'flow_meter', 'hall_slab', 'meter_conversion', 'voltammetry', 'black_box'])
/** P3 批4：波3（optics 域内 ts 已覆盖）+ 杂项装置（核反应→modern / 微元·电梯→mech 计算面） */
export const WAVE_DEVICE_TYPES = new Set(['wave_multi', 'wave_graphs', 'wave_super'])
export const MISC_DEVICE_TYPES = new Set(['nuclear_react', 'micro_integral', 'elevator_scale'])

/** domain/role → 主引擎（util/display 类不产生引擎） */
export function engineOfSpec(spec: ElementSpec): EngineKey | null {
  switch (spec.domain) {
    case 'optics': return 'optics'
    case 'modern': return 'modern'
    case 'heat': return THERMO_DEVICE_TYPES.has(spec.type) ? 'thermoStatic' : 'thermal'
    case 'em':
      if (AC_DEVICE_TYPES.has(spec.type) || CYCLOTRON_TYPES.has(spec.type)) return 'acCircuit'  // P3 批3 AC/时变场装置
      if (DC_DEVICE_TYPES.has(spec.type)) return 'dcCircuit'  // P3 批3 第4步 DC 装置
      if (spec.role === 'field' || spec.role === 'body') return 'field' // point_charge(role body) 由场引擎积分
      if (spec.role === 'circuit') return 'circuit'
      return null
    case 'mech':
      if (MISC_DEVICE_TYPES.has(spec.type)) return 'rigid' // 占位——实际由 RunBridge TS 装置分支截留（见 run 路由）
      if (spec.role === 'body' || spec.role === 'constraint' || spec.role === 'detector') return 'rigid'
      return null
    case 'util':
      // 通用检测器（光电门/力传感器）挂在刚体的 probes 通道
      return spec.role === 'detector' ? 'rigid' : null
    default: return null
  }
}

/** 次引擎：元件同时参与其他引擎（如活塞是热-力耦合中的刚体） */
const SECONDARY: Record<string, EngineKey[]> = { piston: ['rigid'] }

interface RuleFile { couplings: { id: string; engines: string[]; mode: 'strong' | 'weak'; when: { elements: string[] } }[] }
const COUPLINGS = (rules as RuleFile).couplings

export function analyze(elements: GeoElement[]): Analysis {
  const byEngine = new Map<EngineKey, string[]>()
  const typesPresent = new Set(elements.map((e) => e.type))
  const warnings: string[] = []

  for (const e of elements) {
    const spec = byType.get(e.type)
    if (!spec) { warnings.push(`未知元件类型 ${e.type}（将被忽略）`); continue }
    const engs = new Set<EngineKey>()
    const primary = engineOfSpec(spec)
    if (primary) engs.add(primary)
    for (const s of SECONDARY[e.type] ?? []) engs.add(s)
    if (!engs.size) continue
    for (const eng of engs) {
      const list = byEngine.get(eng) ?? []
      list.push(e.id)
      byEngine.set(eng, list)
    }
  }

  const engines: EngineDesc[] = [...byEngine.entries()]
    .sort((a, b) => Object.keys(META).indexOf(a[0]) - Object.keys(META).indexOf(b[0]))
    .map(([key, els]) => ({ key, ...META[key], elements: els }))

  // 耦合链：when.elements 全部在场即激活（circuitClosed 等运行时条件由服务端 SceneValidator 终判）
  const couplings: CouplingDesc[] = []
  for (const c of COUPLINGS) {
    const found = c.when.elements.filter((t) => typesPresent.has(t))
    if (found.length === c.when.elements.length && found.length > 0) {
      couplings.push({ id: c.id, engines: c.engines as EngineKey[], mode: c.mode, found })
    }
  }

  // ── 结构性警告 ──
  const has = (t: string) => typesPresent.has(t)
  for (const e of elements) {
    if ((e.type === 'spring' || e.type === 'rope') && e.links.length === 0) warnings.push(`${byType.get(e.type)?.label ?? e.type}「${e.id}」未连接：请用连线模式连接两端锚点`)
    if (e.type === 'pulley' && !e.links.some((l) => l.kind === 'pulley-rope')) warnings.push(`滑轮「${e.id}」未绕绳：用「跨轮绳」连接两侧物体`)
  }
  if (has('rail_pair') && !has('rod_bar')) warnings.push('导轨对缺少导体棒（rail-rod 耦合不成立）')
  if (has('gas_cell') && !has('piston')) warnings.push('气室缺少活塞：将按静态/准静态过程求解')
  if ((has('e_region') || has('b_region')) && !has('point_charge')) warnings.push('有场区无带电粒子：场区不会产生运动')
  if (byEngine.get('rigid') && !elements.some((e) => byType.get(e.type)?.role === 'body')) warnings.push('只有约束/轨道没有运动体')
  if (has('rail_pair') && has('rod_bar')) warnings.push('导轨-棒电路闭合性由运行时校验（需形成回路）')
  // 十三轮裁定 b：物块跨导入段端点显式提示（实验定性：端点接触微抖 ~2s 后自止——
  // 有界非死锁，但静默=heater 同类教训："用户不该那样放"不是不提示的理由）
  for (const li of elements) {
    if (li.type !== 'lead_in') continue
    const L = li.params.L ?? 2, c = Math.cos(li.angle), sn = Math.sin(li.angle)
    const ends = [[li.position.x - (L / 2) * c, li.position.y - (L / 2) * sn],
                  [li.position.x + (L / 2) * c, li.position.y + (L / 2) * sn]]
    for (const b of elements) {
      if (byType.get(b.type)?.role !== 'body' || b.type === 'lead_in') continue
      for (const [ex, ey] of ends) {
        if (Math.abs(b.position.x - ex) < 0.45 && Math.abs(b.position.y - ey - 0.5) < 0.35) {
          warnings.push(`物块「${b.id}」跨在导入段「${li.id}」端点上——端点接触会抖动后静止，请整体置于段内`)
        }
      }
    }
  }
  // P5b-2 限制显式告知（八轮追问3：不许静默）——地面系平台不携静置物
  const gfPlat = elements.find((e) => e.type === 'accelerating_platform' && e.params.frame === 1)
  if (gfPlat) {
    const half = (gfPlat.params.L ?? 8) / 2
    const resting = elements.some((e) => byType.get(e.type)?.role === 'body' && e.type !== 'accelerating_platform'
      && !(e.params.v0 > 0) && Math.abs(e.position.x - gfPlat.position.x) < half
      && Math.abs(e.position.y - gfPlat.position.y) < 1.2)
    if (resting) warnings.push('地面系参考下平台上的静置物体不会随平台移动（运动学平移不携物）——辨析场景建议用抛体；如需物体随平台运动请切回电梯系（frame=0）')
  }

  const runnerSet = new Set(engines.map((e) => e.runner))
  const path: Analysis['path'] = engines.length === 0 ? 'none' : runnerSet.has('java') ? 'java' : 'ts'
  if (path === 'ts') warnings.push('光学/近代为前端本地引擎（阶段四 Runner 接入）')

  const enginePart = engines.map((e) => e.label).join(' + ') || '无引擎'
  const couplingPart = couplings.length ? `（耦合：${couplings.map((c) => `${c.id}·${c.mode === 'strong' ? '强' : '弱'}`).join('、')}）` : ''
  const title = `${enginePart}${couplingPart}`

  return { engines, couplings, warnings, path, title }
}
