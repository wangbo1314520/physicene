/**
 * 引擎静态分析（方案 §4.1/§5）：元件集合 → 引擎集合 + 耦合链 + 警告 + 运行路径。
 * 耦合链读 engine/engine-rules.json（与 java-backend/src/main/resources 同源，ledger 测试断言 SHA256 一致）。
 * 引擎归属由 catalog 的 domain/role 数据驱动推导，不硬编码类型表。
 */
import type { GeoElement, ElementSpec, Domain } from '../catalog'
import { byType } from '../catalog'
import rules from '../engine/engine-rules.json'

export type EngineKey = 'rigid' | 'field' | 'circuit' | 'thermal' | 'thermoStatic' | 'optics' | 'modern'

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
  optics: { label: '光学·光线追踪', runner: 'ts' },
  modern: { label: '近代物理', runner: 'ts' },
}

/** P3 批2：热学静力学装置走 TS 纯函数引擎（决策1）；其余热学（气体耦合）走 Java */
export const THERMO_DEVICE_TYPES = new Set(['liquid_seal', 'pump_syringe', 'u_tube'])

/** domain/role → 主引擎（util/display 类不产生引擎） */
export function engineOfSpec(spec: ElementSpec): EngineKey | null {
  switch (spec.domain) {
    case 'optics': return 'optics'
    case 'modern': return 'modern'
    case 'heat': return THERMO_DEVICE_TYPES.has(spec.type) ? 'thermoStatic' : 'thermal'
    case 'em':
      if (spec.role === 'field' || spec.role === 'body') return 'field' // point_charge(role body) 由场引擎积分
      if (spec.role === 'circuit') return 'circuit'
      return null
    case 'mech':
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

  const runnerSet = new Set(engines.map((e) => e.runner))
  const path: Analysis['path'] = engines.length === 0 ? 'none' : runnerSet.has('java') ? 'java' : 'ts'
  if (path === 'ts') warnings.push('光学/近代为前端本地引擎（阶段四 Runner 接入）')

  const enginePart = engines.map((e) => e.label).join(' + ') || '无引擎'
  const couplingPart = couplings.length ? `（耦合：${couplings.map((c) => `${c.id}·${c.mode === 'strong' ? '强' : '弱'}`).join('、')}）` : ''
  const title = `${enginePart}${couplingPart}`

  return { engines, couplings, warnings, path, title }
}
