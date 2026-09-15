/**
 * CircuitEngine 出口 + 电路构建器
 */
import type { Circuit, CircuitComponent, ComponentKind, PinRef, Wire } from './types'
import { createComponent } from './components'

export * from './types'
export * from './components'
export { buildNetlist, type Netlist } from './netlist'
export { solveDC, simulateTransient, initialState, type EngineState, type TransientOptions, type TransientResult } from './solver/mna'
export { solveAC, reactanceL, reactanceC, type ACSolution, type ACElement } from './solver/ac'
export { detectFaults, meterReadings } from './faults'
export { gradeCircuit, type CircuitTemplate, type GradeIssue, type GradeResult } from './grading'

/** 解析 "compId:pin" */
export function pinRef(s: string): PinRef {
  const i = s.lastIndexOf(':')
  return { comp: s.slice(0, i), pin: Number(s.slice(i + 1)) }
}

let wireSeq = 0
export function makeWire(a: string, b: string, loose = false): Wire {
  return { id: `w${++wireSeq}`, a: pinRef(a), b: pinRef(b), ...(loose ? { loose } : {}) }
}

/** 链式构建器：add(kind,id,props) → wire('a:0','b:1') → circuit */
export function circuitBuilder(): {
  add: (kind: ComponentKind, id: string, props?: Record<string, number | boolean | string>, x?: number, y?: number) => CircuitComponent
  wire: (a: string, b: string, loose?: boolean) => Wire
  chain: (...pins: string[]) => void
  circuit: Circuit
} {
  const circuit: Circuit = { components: [], wires: [] }
  return {
    circuit,
    add(kind, id, props = {}, x = 0, y = 0) { const c = createComponent(kind, x, y, id, props); circuit.components.push(c); return c },
    wire(a, b, loose = false) { const w = makeWire(a, b, loose); circuit.wires.push(w); return w },
    /** 依次首尾相连：chain('bat:0','s:0','s:1','r:0', ...) 每两个为一根导线 */
    chain(...pins) { for (let i = 0; i + 1 < pins.length; i += 2) circuit.wires.push(makeWire(pins[i], pins[i + 1])) },
  }
}

/** 最小二乘直线拟合 y = k x + b */
export function linearFit(pts: { x: number; y: number }[]): { k: number; b: number; r2: number } {
  const n = pts.length
  if (n < 2) return { k: 0, b: pts[0]?.y ?? 0, r2: 0 }
  const mx = pts.reduce((s, p) => s + p.x, 0) / n, my = pts.reduce((s, p) => s + p.y, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2 }
  const k = sxx > 0 ? sxy / sxx : 0
  const b = my - k * mx
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1
  return { k, b, r2 }
}
