/**
 * 故障检测与电表读数
 */
import type { Circuit, CircuitComponent, DCSolution, Fault, MeterReading } from './types'
import { buildNetlist } from './netlist'
import { meterSpec, multimeterSpec, num, pinCount, twoTerminalResistance, OHM_EMF } from './components'

const isSource = (c: CircuitComponent) => c.kind === 'battery' || c.kind === 'dc_source' || c.kind === 'ac_source' || c.kind === 'coil'
type MeterComp = CircuitComponent & { kind: 'ammeter' | 'voltmeter' | 'galvanometer' | 'multimeter' }
const isMeter = (c: CircuitComponent): c is MeterComp =>
  c.kind === 'ammeter' || c.kind === 'voltmeter' || c.kind === 'galvanometer' || c.kind === 'multimeter'
const isLoad = (c: CircuitComponent) =>
  c.kind === 'resistor' || c.kind === 'lamp' || c.kind === 'wire_sample' || c.kind === 'rheostat' ||
  c.kind === 'photoresistor' || c.kind === 'inductor' || c.kind === 'diode'

export function meterReadings(circuit: Circuit, sol: DCSolution): MeterReading[] {
  const out: MeterReading[] = []
  for (const c of circuit.components) {
    if (!isMeter(c) || !sol.elements[c.id]) continue
    const r = sol.elements[c.id]
    if (c.kind === 'multimeter') {
      const spec = multimeterSpec(c)
      if (spec.mode === 'ohm') {
        const iExt = r.i // 黑→红 的外电路电流
        const Rx = iExt > 1e-12 ? OHM_EMF / iExt - spec.r : Infinity
        out.push({ compId: c.id, kind: 'multimeter', mode: 'ohm', value: Rx, range: spec.r,
          deflection: Number.isFinite(Rx) ? spec.r / (spec.r + Math.max(0, Rx)) : 0, reversed: iExt < -1e-9, overRange: false })
      } else {
        const value = spec.mode === 'dcv' ? r.v : r.i
        out.push({ compId: c.id, kind: 'multimeter', mode: spec.mode, value, range: spec.range, deflection: value / spec.range,
          reversed: value < -0.02 * spec.range, overRange: Math.abs(value) > spec.range * 1.001 })
      }
      continue
    }
    const { range } = meterSpec(c)
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
  const ohmMeters = comps.filter((c) => c.kind === 'multimeter' && multimeterSpec(c).mode === 'ohm')
  if (sources.length === 0 && ohmMeters.length === 0) {
    faults.push({ code: 'no_source', severity: 'error', compIds: [], message: '电路中没有电源' })
    return faults
  }
  if (!sol.ok) return faults
  const net = buildNetlist(circuit)

  // 欧姆挡规则：必须断电测量；待测元件应从电路中断开
  for (const m of ohmMeters) {
    if (sources.length) faults.push({ code: 'ohm_live_circuit', severity: 'error', compIds: [m.id, ...sources.map((s) => s.id)],
      message: '欧姆挡测电阻时电路必须断电——先断开电源，把待测电阻从电路中取出再测' })
    const pair = nodePair(sol, m)
    const target = comps.find((c) => c.id !== m.id && pinCount(c.kind) === 2 && nodePair(sol, c) === pair)
    if (target) {
      const na = sol.nodeOf({ comp: m.id, pin: 0 }), nb = sol.nodeOf({ comp: m.id, pin: 1 })
      const others = comps.filter((c) => c.id !== m.id && c.id !== target.id &&
        Array.from({ length: pinCount(c.kind) }, (_, p) => sol.nodeOf({ comp: c.id, pin: p })).some((n) => n === na || n === nb))
      if (others.length) faults.push({ code: 'ohm_not_isolated', severity: 'warning', compIds: [target.id, ...others.map((c) => c.id)],
        message: '待测电阻两端还连着其他元件，测得的是并联值——应把它从电路中断开后单独测' })
    }
  }

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
    if (s.kind === 'ac_source' || s.kind === 'coil') continue   // 交流源直流解 EMF=0；感应线圈静止时 EMF=0——短路/断路判据无意义
    // 短路：电源看到的外电阻极小
    if (Number.isFinite(src.rExt) && src.rExt < 0.3 && Math.abs(src.iOut) > 1e-6) {
      const path = comps.filter((c) => c.id !== s.id && sol.elements[c.id] && Math.abs(sol.elements[c.id].i) > 0.9 * Math.abs(src.iOut))
        .filter((c) => { const R = twoTerminalResistance(c); return R === null || R < 1 })
      faults.push({ code: 'short', severity: 'error', compIds: [s.id, ...path.map((c) => c.id)],
        message: `电源被短路：外电路电阻仅 ${src.rExt.toFixed(3)} Ω，电流 ${Math.abs(src.iOut).toFixed(2)} A` })
    }
    // 断路：负载元件中没有电流（电压表跨接电源时电源仍有微小电流，不能用电源电流判）
    const loads = comps.filter(isLoad)
    const hasLoad = loads.length > 0
    const loadI = loads.reduce((s, c) => s + Math.abs(sol.elements[c.id]?.i ?? 0), 0)
    const hasCap = comps.some((c) => c.kind === 'capacitor')
    if (hasLoad && loadI < 1e-9) {
      if (openSwitches.length) faults.push({ code: 'switch_open', severity: 'error', compIds: openSwitches.map((c) => c.id), message: '开关未闭合，电路断路' })
      if (dangling.length) faults.push({ code: 'dangling_pin', severity: 'error', compIds: dangling, message: '有元件引脚未接导线，电路断路' })
      if (!openSwitches.length && !dangling.length && !hasCap && !loose.length)
        faults.push({ code: 'open', severity: 'error', compIds: [], message: '电路不构成回路（断路）' })
    } else if (dangling.length) {
      faults.push({ code: 'dangling_pin', severity: 'warning', compIds: dangling, message: '有元件引脚未接导线' })
    }
  }

  // 电表错接（感应线圈是弱源，电流计直接接在它两端是正确用法，不计入）
  const loadPairs = new Map<string, string>()
  for (const c of comps) if ((isLoad(c) || isSource(c)) && c.kind !== 'coil') loadPairs.set(nodePair(sol, c), c.id)
  const totalI = Math.max(0, ...sources.map((s) => Math.abs(sol.sources[s.id]?.iOut ?? 0)))
  const actsAsAmmeter = (c: CircuitComponent) => c.kind === 'ammeter' || c.kind === 'galvanometer' || (c.kind === 'multimeter' && multimeterSpec(c).mode === 'dca')
  const actsAsVoltmeter = (c: CircuitComponent) => c.kind === 'voltmeter' || (c.kind === 'multimeter' && multimeterSpec(c).mode === 'dcv')
  // 与任一二端元件共享两端节点的电压表 = 并联接法（即使直流下该元件开路，如电容），不判串联
  const pairsOfParts = new Set(comps.filter((c) => !isMeter(c) && pinCount(c.kind) === 2).map((c) => nodePair(sol, c)))
  for (const c of comps) {
    if (actsAsAmmeter(c)) {
      const other = loadPairs.get(nodePair(sol, c))
      if (other) faults.push({ code: 'ammeter_parallel', severity: 'error', compIds: [c.id, other],
        message: `${meterName(c)}并联在元件两端——会短路该元件并可能烧表` })
    }
    if (actsAsVoltmeter(c) && totalI > 1e-7 && !pairsOfParts.has(nodePair(sol, c))) {
      const iv = Math.abs(sol.elements[c.id]?.i ?? 0)
      if (Math.abs(iv - totalI) < 0.01 * totalI) faults.push({ code: 'voltmeter_series', severity: 'error', compIds: [c.id],
        message: `${meterName(c)}被串联进主回路——内阻极大，电路几乎无电流，用电器不工作` })
    }
  }

  // 读数：反接 / 超量程 / 量程过大
  for (const m of meterReadings(circuit, sol)) {
    const c = comps.find((x) => x.id === m.compId)!
    const name = meterName(c)
    if (m.mode === 'ohm') {
      if (m.reversed) faults.push({ code: 'meter_reversed', severity: 'error', compIds: [c.id], message: `${name}欧姆挡指针反向偏转——外电路带电或极性错误` })
      continue
    }
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

function meterName(c: CircuitComponent): string {
  if (c.kind === 'multimeter') { const m = multimeterSpec(c).mode; return `多用电表${m === 'dcv' ? '电压挡' : m === 'dca' ? '电流挡' : '欧姆挡'}` }
  return c.kind === 'voltmeter' ? '电压表' : c.kind === 'ammeter' ? '电流表' : '电流计'
}

function fmt(x: number): string {
  const a = Math.abs(x)
  if (a >= 1) return x.toFixed(2)
  if (a >= 1e-3) return `${(x * 1e3).toFixed(1)}m`
  return `${(x * 1e6).toFixed(0)}μ`
}
