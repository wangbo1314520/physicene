/**
 * 直流 / 暂态求解（修正节点法 MNA）
 * - 电源：EMF + 内阻 → Norton 等效（电导 1/r 并联电流源 E/r），不增加未知量
 * - 开关 / 触点：接触电阻 1 mΩ；断开不参与
 * - 电容 / 电感：后向欧拉伴随模型（暂态）；直流稳态下电容开路、电感只剩线圈电阻
 * - 二极管：分段线性（导通 0.5Ω + Vf；截止 1e-9 S），通断状态迭代 ≤ 20 次
 * - 每个节点对地加 gmin=1e-12 S，悬空节点自然解为 0 V，矩阵不奇异
 */
import type { Circuit, CircuitComponent, DCSolution, ElementResult, PinRef } from '../types'
import { buildNetlist, type Netlist } from '../netlist'
import { num, twoTerminalResistance } from '../components'
import { solveReal } from './linear'

export const R_CONTACT = 1e-3
export const R_SRC_MIN = 1e-3
const G_MIN = 1e-12
const R_DIODE_ON = 0.5
const G_DIODE_OFF = 1e-9

export interface EngineState {
  capV: Map<string, number>
  indI: Map<string, number>
  diodeOn: Map<string, boolean>
}

export function initialState(circuit: Circuit): EngineState {
  const s: EngineState = { capV: new Map(), indI: new Map(), diodeOn: new Map() }
  for (const c of circuit.components) {
    if (c.kind === 'capacitor') s.capV.set(c.id, num(c, 'v0', 0))
    if (c.kind === 'inductor') s.indI.set(c.id, num(c, 'i0', 0))
    if (c.kind === 'diode') s.diodeOn.set(c.id, false)
  }
  return s
}

interface Ctx { mode: 'dc' | 'transient'; h: number; t: number; state: EngineState }

const pin = (c: CircuitComponent, p: number): PinRef => ({ comp: c.id, pin: p })

function srcEmf(c: CircuitComponent, ctx: Ctx): number {
  if (c.kind === 'ac_source') {
    if (ctx.mode !== 'transient') return 0
    return num(c, 'vrms', 3) * Math.SQRT2 * Math.sin(2 * Math.PI * num(c, 'freq', 50) * ctx.t)
  }
  return num(c, 'emf', 1.5)
}
const srcR = (c: CircuitComponent) => Math.max(R_SRC_MIN, num(c, 'r', 0))

function solveOnce(circuit: Circuit, net: Netlist, ctx: Ctx): number[] | null {
  const n = net.nodeCount - 1
  if (n < 0) return null
  const row = (node: number) => (node === net.ground ? -1 : node < net.ground ? node : node - 1)
  const A: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const b = new Array<number>(n).fill(0)
  const stampG = (na: number, nb: number, G: number) => {
    const ra = row(na), rb = row(nb)
    if (ra >= 0) A[ra][ra] += G
    if (rb >= 0) A[rb][rb] += G
    if (ra >= 0 && rb >= 0) { A[ra][rb] -= G; A[rb][ra] -= G }
  }
  /** 电流 I 注入节点 a、流出节点 b */
  const stampI = (na: number, nb: number, I: number) => {
    const ra = row(na), rb = row(nb)
    if (ra >= 0) b[ra] += I
    if (rb >= 0) b[rb] -= I
  }
  for (let r = 0; r < n; r++) A[r][r] += G_MIN

  for (const c of circuit.components) {
    const na = net.nodeOf(pin(c, 0)), nb = net.nodeOf(pin(c, 1))
    const R2 = twoTerminalResistance(c)
    if (R2 !== null) { stampG(na, nb, 1 / R2); continue }
    switch (c.kind) {
      case 'battery': case 'dc_source': case 'ac_source': {
        const G = 1 / srcR(c)
        stampG(na, nb, G); stampI(na, nb, G * srcEmf(c, ctx)); break
      }
      case 'switch':
        if (c.props.closed === true) stampG(na, nb, 1 / R_CONTACT); break
      case 'spdt_switch': {
        const pos = num(c, 'pos', 0)
        if (pos === 1 || pos === 2) stampG(na, net.nodeOf(pin(c, pos)), 1 / R_CONTACT); break
      }
      case 'rheostat': {
        const Rmax = num(c, 'Rmax', 20), pos = Math.min(1, Math.max(0, num(c, 'pos', 0.5)))
        const nc = net.nodeOf(pin(c, 2))
        stampG(na, nc, 1 / Math.max(R_CONTACT, pos * Rmax))
        stampG(nc, nb, 1 / Math.max(R_CONTACT, (1 - pos) * Rmax)); break
      }
      case 'capacitor':
        if (ctx.mode === 'transient') {
          const G = num(c, 'C', 1e-3) / ctx.h
          stampG(na, nb, G); stampI(na, nb, G * (ctx.state.capV.get(c.id) ?? 0))
        }
        break
      case 'inductor': {
        const rw = Math.max(R_CONTACT, num(c, 'rw', 0))
        if (ctx.mode === 'dc') { stampG(na, nb, 1 / rw); break }
        const Lh = num(c, 'L', 1) / ctx.h
        const G = 1 / (rw + Lh)
        stampG(na, nb, G); stampI(na, nb, -G * Lh * (ctx.state.indI.get(c.id) ?? 0)); break
      }
      case 'diode':
        if (ctx.state.diodeOn.get(c.id)) { const G = 1 / R_DIODE_ON; stampG(na, nb, G); stampI(na, nb, G * num(c, 'vf', 0.7)) }
        else stampG(na, nb, G_DIODE_OFF)
        break
    }
  }
  const x = solveReal(A, b)
  if (!x) return null
  const V = new Array<number>(net.nodeCount).fill(0)
  for (let node = 0; node < net.nodeCount; node++) { const r = row(node); V[node] = r >= 0 ? x[r] : 0 }
  return V
}

function extract(circuit: Circuit, net: Netlist, V: number[], ctx: Ctx): Pick<DCSolution, 'elements' | 'sources'> {
  const elements: Record<string, ElementResult> = {}
  const sources: DCSolution['sources'] = {}
  for (const c of circuit.components) {
    const va = V[net.nodeOf(pin(c, 0))], vb = V[net.nodeOf(pin(c, 1))]
    const v = va - vb
    let i = 0
    const R2 = twoTerminalResistance(c)
    if (R2 !== null) i = v / R2
    else switch (c.kind) {
      case 'battery': case 'dc_source': case 'ac_source': {
        const G = 1 / srcR(c); i = G * (v - srcEmf(c, ctx))
        const iOut = -i
        sources[c.id] = { iOut, vTerm: v, rExt: Math.abs(iOut) > 1e-12 ? v / iOut : Infinity }
        break
      }
      case 'switch': i = c.props.closed === true ? v / R_CONTACT : 0; break
      case 'spdt_switch': {
        const pos = num(c, 'pos', 0)
        i = pos === 1 || pos === 2 ? (va - V[net.nodeOf(pin(c, pos))]) / R_CONTACT : 0; break
      }
      case 'rheostat': {
        const Rmax = num(c, 'Rmax', 20), pos = Math.min(1, Math.max(0, num(c, 'pos', 0.5)))
        const vc = V[net.nodeOf(pin(c, 2))]
        i = (va - vc) / Math.max(R_CONTACT, pos * Rmax); break   // A→C 段电流
      }
      case 'capacitor':
        i = ctx.mode === 'transient' ? (num(c, 'C', 1e-3) / ctx.h) * (v - (ctx.state.capV.get(c.id) ?? 0)) : 0; break
      case 'inductor': {
        const rw = Math.max(R_CONTACT, num(c, 'rw', 0))
        if (ctx.mode === 'dc') { i = v / rw; break }
        const Lh = num(c, 'L', 1) / ctx.h, G = 1 / (rw + Lh)
        i = G * v + G * Lh * (ctx.state.indI.get(c.id) ?? 0); break
      }
      case 'diode':
        i = ctx.state.diodeOn.get(c.id) ? (v - num(c, 'vf', 0.7)) / R_DIODE_ON : G_DIODE_OFF * v; break
    }
    elements[c.id] = { v, i, p: v * i }
  }
  return { elements, sources }
}

/** 二极管通断迭代直到稳定 */
function solveWithDiodes(circuit: Circuit, net: Netlist, ctx: Ctx): { V: number[]; res: ReturnType<typeof extract> } | null {
  const diodes = circuit.components.filter((c) => c.kind === 'diode')
  for (let iter = 0; iter < 20; iter++) {
    const V = solveOnce(circuit, net, ctx)
    if (!V) return null
    const res = extract(circuit, net, V, ctx)
    let changed = false
    for (const d of diodes) {
      const on = ctx.state.diodeOn.get(d.id) ?? false
      const { v, i } = res.elements[d.id]
      if (!on && v > num(d, 'vf', 0.7) + 1e-9) { ctx.state.diodeOn.set(d.id, true); changed = true }
      else if (on && i < -1e-12) { ctx.state.diodeOn.set(d.id, false); changed = true }
    }
    if (!changed || diodes.length === 0) return { V, res }
  }
  const V = solveOnce(circuit, net, ctx)
  return V ? { V, res: extract(circuit, net, V, ctx) } : null
}

const emptySolution = (net: Netlist): DCSolution => ({
  ok: false, nodeCount: net.nodeCount, nodeOf: net.nodeOf, nodeV: [], elements: {}, sources: {},
})

/** 直流稳态求解 */
export function solveDC(circuit: Circuit, state: EngineState = initialState(circuit)): DCSolution {
  const net = buildNetlist(circuit)
  if (net.nodeCount === 0) return emptySolution(net)
  const ctx: Ctx = { mode: 'dc', h: 1, t: 0, state }
  const out = solveWithDiodes(circuit, net, ctx)
  if (!out) return emptySolution(net)
  return { ok: true, nodeCount: net.nodeCount, nodeOf: net.nodeOf, nodeV: out.V, ...out.res }
}

export interface TransientOptions {
  dt: number
  tEnd: number
  /** 每步前调用，可改开关位置等（如 t≥1s 拨单刀双掷到放电） */
  control?: (t: number, circuit: Circuit) => void
  /** 初始状态（默认按 v0/i0 属性） */
  state?: EngineState
}
export interface TransientResult {
  t: number[]
  elements: Record<string, { v: number[]; i: number[] }>
  state: EngineState
  ok: boolean
}

/** 暂态仿真（后向欧拉，无条件稳定） */
export function simulateTransient(circuit: Circuit, opt: TransientOptions): TransientResult {
  const state = opt.state ?? initialState(circuit)
  const t: number[] = []
  const elements: Record<string, { v: number[]; i: number[] }> = {}
  for (const c of circuit.components) elements[c.id] = { v: [], i: [] }
  let time = 0
  let net = buildNetlist(circuit)
  const steps = Math.max(1, Math.round(opt.tEnd / opt.dt))
  for (let k = 0; k < steps; k++) {
    time += opt.dt
    if (opt.control) { opt.control(time, circuit); net = buildNetlist(circuit) }
    const ctx: Ctx = { mode: 'transient', h: opt.dt, t: time, state }
    const out = solveWithDiodes(circuit, net, ctx)
    if (!out) return { t, elements, state, ok: false }
    for (const c of circuit.components) {
      const r = out.res.elements[c.id]
      elements[c.id].v.push(r.v); elements[c.id].i.push(r.i)
      if (c.kind === 'capacitor') state.capV.set(c.id, r.v)
      if (c.kind === 'inductor') state.indI.set(c.id, r.i)
    }
    t.push(time)
  }
  return { t, elements, state, ok: true }
}
