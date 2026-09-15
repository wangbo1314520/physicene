/**
 * 故障检测与电表读数
 */
import type { Circuit, CircuitComponent, DCSolution, Fault, MeterReading } from './types'
import { buildNetlist } from './netlist'
import { meterSpec, num, pinCount, twoTerminalResistance } from './components'

const isSource = (c: CircuitComponent) => c.kind === 'battery' || c.kind === 'dc_source' || c.kind === 'ac_source'
type MeterComp = CircuitComponent & { kind: 'ammeter' | 'voltmeter' | 'galvanometer' }
const isMeter = (c: CircuitComponent): c is MeterComp => c.kind === 'ammeter' || c.kind === 'voltmeter' || c.kind === 'galvanometer'
const isLoad = (c: CircuitComponent) =>
  c.kind === 'resistor' || c.kind === 'lamp' || c.kind === 'wire_sample' || c.kind === 'rheostat' ||
  c.kind === 'photoresistor' || c.kind === 'inductor' || c.kind === 'diode'

export function meterReadings(circuit: Circuit, sol: DCSolution): MeterReading[] {
  const out: MeterReading[] = []
  for (const c of circuit.components) {
    if (!isMeter(c) || !sol.elements[c.id]) continue
    const { range } = meterSpec(c)
    const r = sol.elements[c.id]
    const value = c.kind === 'voltmeter' ? r.v : r.i
    out.push({
      compId: c.id, kind: c.kind, value, range, deflection: value / range,
      reversed: value < -0.02 * range, overRange: Math.abs(value) > range * 1.001,
    })
  }
  return out
}

function nodePair(sol: DCSolution, c: CircuitComponent): string {
  const a = sol.nodeOf({ comp: c.id, pin: 0 }), b = sol.nodeOf({ comp: c.id, pin: 1 })
  return a < b ? `${a}-${b}` : `${b}-${a}`
}

export function detectFaults(circuit: Circuit, sol: DCSolution): Fault[] {
  const faults: Fault[] = []
  const comps = circuit.components
  const sources = comps.filter(isSource)
  if (sources.length === 0) {
    faults.push({ code: 'no_source', severity: 'error', compIds: [], message: '电路中没有电源' })
    return faults
  }
  if (!sol.ok) return faults
  const net = buildNetlist(circuit)

  // 虚接导线
  const loose = circuit.wires.filter((w) => w.loose)
  if (loose.length) faults.push({ code: 'loose_contact', severity: 'warning', compIds: [], wireIds: loose.map((w) => w.id),
    message: `有 ${loose.length} 根导线接触不良（虚接），电路时通时断` })

  // 悬空引脚（未接任何导线）
  const dangling: string[] = []
  for (const c of comps) {
    for (let p = 0; p < pinCount(c.kind); p++) {
      if (c.kind === 'rheostat' && p === 1) continue // 限流接法只用 A、C，两端之一悬空是正常的
      if (c.kind === 'spdt_switch' && p !== 0) continue
      if (net.wireDegree[net.nodeOf({ comp: c.id, pin: p })] === 0) { dangling.push(c.id); break }
    }
  }
  const openSwitches = comps.filter((c) => (c.kind === 'switch' && c.props.closed !== true) || (c.kind === 'spdt_switch' && num(c, 'pos', 0) === 0))

  for (const s of sources) {
    const src = sol.sources[s.id]
    if (!src) continue
    // 短路：电源看到的外电阻极小
    if (Number.isFinite(src.rExt) && src.rExt < 0.3 && Math.abs(src.iOut) > 1e-6) {
      const path = comps.filter((c) => c.id !== s.id && sol.elements[c.id] && Math.abs(sol.elements[c.id].i) > 0.9 * Math.abs(src.iOut))
        .filter((c) => { const R = twoTerminalResistance(c); return R === null || R < 1 })
      faults.push({ code: 'short', severity: 'error', compIds: [s.id, ...path.map((c) => c.id)],
        message: `电源被短路：外电路电阻仅 ${src.rExt.toFixed(3)} Ω，电流 ${Math.abs(src.iOut).toFixed(2)} A` })
    }
    // 断路：没有电流但存在负载
    const hasLoad = comps.some(isLoad)
    const hasCap = comps.some((c) => c.kind === 'capacitor')
    if (Math.abs(src.iOut) < 1e-9 && hasLoad) {
      if (openSwitches.length) faults.push({ code: 'switch_open', severity: 'error', compIds: openSwitches.map((c) => c.id), message: '开关未闭合，电路断路' })
      if (dangling.length) faults.push({ code: 'dangling_pin', severity: 'error', compIds: dangling, message: '有元件引脚未接导线，电路断路' })
      if (!openSwitches.length && !dangling.length && !hasCap && !loose.length)
        faults.push({ code: 'open', severity: 'error', compIds: [], message: '电路不构成回路（断路）' })
    } else if (dangling.length) {
      faults.push({ code: 'dangling_pin', severity: 'warning', compIds: dangling, message: '有元件引脚未接导线' })
    }
  }

  // 电表错接
  const loadPairs = new Map<string, string>()
  for (const c of comps) if (isLoad(c) || isSource(c)) loadPairs.set(nodePair(sol, c), c.id)
  const totalI = Math.max(...sources.map((s) => Math.abs(sol.sources[s.id]?.iOut ?? 0)))
  for (const c of comps) {
    if (c.kind === 'ammeter' || c.kind === 'galvanometer') {
      const other = loadPairs.get(nodePair(sol, c))
      if (other) faults.push({ code: 'ammeter_parallel', severity: 'error', compIds: [c.id, other],
        message: `${c.kind === 'ammeter' ? '电流表' : '电流计'}并联在元件两端——会短路该元件并可能烧表` })
    }
    if (c.kind === 'voltmeter' && totalI > 1e-7) {
      const iv = Math.abs(sol.elements[c.id]?.i ?? 0)
      if (Math.abs(iv - totalI) < 0.01 * totalI) faults.push({ code: 'voltmeter_series', severity: 'error', compIds: [c.id],
        message: '电压表被串联进主回路——内阻极大，电路几乎无电流，用电器不工作' })
    }
  }

  // 读数：反接 / 超量程 / 量程过大
  for (const m of meterReadings(circuit, sol)) {
    const c = comps.find((x) => x.id === m.compId)!
    const name = c.kind === 'voltmeter' ? '电压表' : c.kind === 'ammeter' ? '电流表' : '电流计'
    if (m.reversed) faults.push({ code: 'meter_reversed', severity: 'error', compIds: [c.id], message: `${name}正负接反，指针反向偏转` })
    else if (m.overRange) faults.push({ code: 'over_range', severity: 'error', compIds: [c.id], message: `${name}超量程（读数 ${fmt(m.value)} > 量程 ${fmt(m.range)}），应换大量程` })
    else if (Math.abs(m.value) > 1e-9 && Math.abs(m.value) < m.range / 3)
      faults.push({ code: 'range_too_large', severity: 'warning', compIds: [c.id], message: `${name}量程过大（偏转不到 1/3），读数误差大，宜换小量程` })
  }

  // 电解电容反接 / 灯泡过载
  for (const c of comps) {
    const r = sol.elements[c.id]
    if (!r) continue
    if (c.kind === 'capacitor' && c.props.polarized === true && r.v < -0.5)
      faults.push({ code: 'capacitor_reversed', severity: 'warning', compIds: [c.id], message: '电解电容极性接反' })
    if (c.kind === 'lamp' && Math.abs(r.v) > 1.2 * num(c, 'ratedU', 2.5))
      faults.push({ code: 'lamp_overload', severity: 'warning', compIds: [c.id], message: `小灯泡电压 ${Math.abs(r.v).toFixed(2)} V 超过额定值 ${num(c, 'ratedU', 2.5)} V，有烧毁风险` })
  }
  return faults
}

function fmt(x: number): string {
  const a = Math.abs(x)
  if (a >= 1) return x.toFixed(2)
  if (a >= 1e-3) return `${(x * 1e3).toFixed(1)}m`
  return `${(x * 1e6).toFixed(0)}μ`
}
