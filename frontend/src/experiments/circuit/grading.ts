/**
 * 智能判分与错误定位：把学生电路与目标电路模板比对
 * - 角色匹配：模板角色 → 允许的元件种类；缺角色 / 多余元件
 * - 串联组：同一组角色应处于同一串联支路 → 电流相等（用求解结果验证）
 * - 并联组：同一组角色两端应接在同一对节点上
 * - 通路：要求电源有电流
 * - 故障：error 级故障直接扣分并定位
 */
import type { Circuit, CircuitComponent, ComponentKind, DCSolution, Fault } from './types'
import { pinCount } from './components'
import { solveDC } from './solver/mna'
import { detectFaults } from './faults'

export interface CircuitTemplate {
  name: string
  roles: Record<string, ComponentKind | ComponentKind[]>
  series?: string[][]
  parallel?: string[][]
  requireClosed?: boolean
  forbidExtra?: boolean
}

export interface GradeIssue {
  code: 'missing_role' | 'extra_component' | 'not_series' | 'not_parallel' | 'not_closed' | 'fault'
  roles: string[]
  compIds: string[]
  message: string
}

export interface GradeResult {
  score: number
  max: number
  passed: boolean
  issues: GradeIssue[]
  roleMap: Record<string, string>
  faults: Fault[]
}

const ROLE_NAMES: Record<string, string> = {
  battery: '电池', dc_source: '电源', ac_source: '信号源', resistor: '定值电阻', rheostat: '滑动变阻器', lamp: '小灯泡',
  switch: '开关', spdt_switch: '单刀双掷开关', ammeter: '电流表', voltmeter: '电压表', galvanometer: '电流计',
  capacitor: '电容器', inductor: '电感器', diode: '二极管', photoresistor: '光敏电阻', wire_sample: '待测金属丝',
  multimeter: '多用电表', relay: '继电器', coil: '感应线圈',
}
const kindName = (k: ComponentKind | ComponentKind[]) => (Array.isArray(k) ? k : [k]).map((x) => ROLE_NAMES[x] ?? x).join('/')

function assignRoles(circuit: Circuit, tpl: CircuitTemplate): { roleMap: Record<string, string>; missing: string[]; extra: CircuitComponent[] } {
  const used = new Set<string>()
  const roleMap: Record<string, string> = {}
  const missing: string[] = []
  for (const [role, kinds] of Object.entries(tpl.roles)) {
    const allowed = Array.isArray(kinds) ? kinds : [kinds]
    const c = circuit.components.find((x) => allowed.includes(x.kind) && !used.has(x.id))
    if (c) { roleMap[role] = c.id; used.add(c.id) } else missing.push(role)
  }
  const extra = circuit.components.filter((c) => !used.has(c.id))
  return { roleMap, missing, extra }
}

export function gradeCircuit(circuit: Circuit, tpl: CircuitTemplate, sol: DCSolution = solveDC(circuit),
                             iOverride?: Record<string, number>): GradeResult {
  const issues: GradeIssue[] = []
  const { roleMap, missing, extra } = assignRoles(circuit, tpl)
  let score = 0
  let max = Object.keys(tpl.roles).length
  score += Object.keys(roleMap).length
  for (const r of missing) issues.push({ code: 'missing_role', roles: [r], compIds: [], message: `缺少元件：${kindName(tpl.roles[r])}（${r}）` })
  if (tpl.forbidExtra && extra.length) issues.push({ code: 'extra_component', roles: [], compIds: extra.map((c) => c.id), message: `多余元件 ${extra.length} 个` })

  const nodes = (id: string) => {
    const a = sol.nodeOf({ comp: id, pin: 0 }), b = sol.nodeOf({ comp: id, pin: 1 })
    return a < b ? `${a}-${b}` : `${b}-${a}`
  }
  // 交流实验传入 iOverride（有效值），否则用直流解
  const cur = (id: string) => (iOverride ? Math.abs(iOverride[id] ?? 0) : Math.abs(sol.elements[id]?.i ?? 0))
  // 无电流时的拓扑回退：串联组内每个已接线的节点恰好只挂 2 个引脚（干净的链/环），且每个元件至少接了一个引脚
  const pinsOnNode = new Map<number, number>()
  for (const c of circuit.components) for (let p = 0; p < pinCount(c.kind); p++) {
    const n = sol.nodeOf({ comp: c.id, pin: p }); pinsOnNode.set(n, (pinsOnNode.get(n) ?? 0) + 1)
  }
  const topoSeries = (ids: string[]) => ids.every((id) => {
    const c = circuit.components.find((x) => x.id === id); if (!c) return false
    let wired = 0
    for (let p = 0; p < pinCount(c.kind); p++) {
      const deg = pinsOnNode.get(sol.nodeOf({ comp: id, pin: p })) ?? 0
      if (deg === 1) continue
      if (deg !== 2) return false
      wired++
    }
    return wired >= 2 || (wired >= 1 && pinCount(c.kind) === 2)
  })

  for (const group of tpl.parallel ?? []) {
    max += 2
    const ids = group.map((r) => roleMap[r]).filter(Boolean)
    if (ids.length < group.length) continue
    const ok = ids.every((id) => nodes(id) === nodes(ids[0]))
    if (ok) score += 2
    else issues.push({ code: 'not_parallel', roles: group, compIds: ids, message: `${group.map((r) => kindName(tpl.roles[r])).join(' 与 ')} 应并联（接在同一对节点上）` })
  }
  for (const group of tpl.series ?? []) {
    max += 2
    const ids = group.map((r) => roleMap[r]).filter(Boolean)
    if (ids.length < group.length) continue
    const I0 = cur(ids[0])
    const byCurrent = sol.ok && I0 > 1e-9 && ids.every((id) => Math.abs(cur(id) - I0) <= 0.02 * I0)
    const ok = byCurrent || (I0 <= 1e-9 && sol.ok && topoSeries(ids))
    if (ok) score += 2
    else issues.push({ code: 'not_series', roles: group, compIds: ids,
      message: I0 <= 1e-9 ? `${group.map((r) => kindName(tpl.roles[r])).join('、')} 所在支路没有电流（未接通或被旁路）`
        : `${group.map((r) => kindName(tpl.roles[r])).join('、')} 应串联在同一支路（电流应相等）` })
  }
  if (tpl.requireClosed) {
    max += 2
    // “接通”= 有负载元件通过电流（电压表跨接电源时电源也会有微小电流，不能作为判据）
    const LOADS = new Set(['resistor', 'lamp', 'rheostat', 'wire_sample', 'photoresistor', 'inductor', 'diode', 'capacitor'])
    const loadI = circuit.components.some((c) => LOADS.has(c.kind) && cur(c.id) > 1e-9)
    if (sol.ok && loadI) score += 2
    else issues.push({ code: 'not_closed', roles: [], compIds: [], message: '电路未接通：用电器中没有电流' })
  }
  const faults = detectFaults(circuit, sol)
  // 开关未闭合是操作状态而非接线错误（是否通电由 requireClosed 判定），不扣分
  for (const f of faults) if (f.severity === 'error' && f.code !== 'switch_open') {
    score -= 1
    issues.push({ code: 'fault', roles: [], compIds: f.compIds, message: f.message })
  }
  score = Math.max(0, Math.min(max, score))
  const passed = missing.length === 0 && issues.every((i) => i.code === 'extra_component' && !tpl.forbidExtra)
  return { score, max, passed, issues, roleMap, faults }
}
