/**
 * 交流稳态相量求解（复数 MNA，单频）
 * 电压/电流均为 RMS 相量；直流源在交流分析中视为 0 V（只剩内阻）；二极管按截止处理。
 */
import type { Circuit, CircuitComponent, PinRef } from '../types'
import { buildNetlist } from '../netlist'
import { num, twoTerminalResistance, multimeterSpec } from '../components'
import { solveComplex, cx, cadd, csub, cmul, cdiv, cabs, cang, type Cx } from './linear'
import { R_CONTACT, R_SRC_MIN } from './mna'

export interface ACElement { V: Cx; I: Cx; vRms: number; iRms: number; phase: number; Z: Cx | null }
export interface ACSolution { ok: boolean; omega: number; elements: Record<string, ACElement> }

const pin = (c: CircuitComponent, p: number): PinRef => ({ comp: c.id, pin: p })

/** 元件导纳（二端；三端与开关另行处理） */
function admittance(c: CircuitComponent, omega: number): Cx | null {
  const R2 = twoTerminalResistance(c)
  if (R2 !== null) return cx(1 / R2)
  switch (c.kind) {
    case 'battery': case 'dc_source': case 'ac_source': return cx(1 / Math.max(R_SRC_MIN, num(c, 'r', 0)))
    case 'capacitor': return cx(0, omega * num(c, 'C', 1e-3))
    case 'inductor': return cdiv(cx(1), cx(Math.max(R_CONTACT, num(c, 'rw', 0)), omega * num(c, 'L', 1)))
    case 'switch': return c.props.closed === true ? cx(1 / R_CONTACT) : cx(0)
    case 'diode': return cx(1e-9)
    case 'multimeter': return cx(1 / multimeterSpec(c).r)
    case 'coil': return cx(1 / Math.max(R_CONTACT, num(c, 'rw', 0)))
    default: return null
  }
}

export function solveAC(circuit: Circuit, freq: number): ACSolution {
  const omega = 2 * Math.PI * freq
  const net = buildNetlist(circuit)
  const n = net.nodeCount - 1
  if (n < 0) return { ok: false, omega, elements: {} }
  const row = (node: number) => (node === net.ground ? -1 : node < net.ground ? node : node - 1)
  const A: Cx[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => cx(0)))
  const b: Cx[] = Array.from({ length: n }, () => cx(0))
  const stampY = (na: number, nb: number, Y: Cx) => {
    const ra = row(na), rb = row(nb)
    if (ra >= 0) A[ra][ra] = cadd(A[ra][ra], Y)
    if (rb >= 0) A[rb][rb] = cadd(A[rb][rb], Y)
    if (ra >= 0 && rb >= 0) { A[ra][rb] = csub(A[ra][rb], Y); A[rb][ra] = csub(A[rb][ra], Y) }
  }
  const stampI = (na: number, nb: number, I: Cx) => {
    const ra = row(na), rb = row(nb)
    if (ra >= 0) b[ra] = cadd(b[ra], I)
    if (rb >= 0) b[rb] = csub(b[rb], I)
  }
  for (let r = 0; r < n; r++) A[r][r] = cadd(A[r][r], cx(1e-12))

  for (const c of circuit.components) {
    const na = net.nodeOf(pin(c, 0)), nb = net.nodeOf(pin(c, 1))
    if (c.kind === 'rheostat') {
      const Rmax = num(c, 'Rmax', 20), pos = Math.min(1, Math.max(0, num(c, 'pos', 0.5)))
      const nc = net.nodeOf(pin(c, 2))
      stampY(na, nc, cx(1 / Math.max(R_CONTACT, pos * Rmax)))
      stampY(nc, nb, cx(1 / Math.max(R_CONTACT, (1 - pos) * Rmax)))
      continue
    }
    if (c.kind === 'spdt_switch') {
      const pos = num(c, 'pos', 0)
      if (pos === 1 || pos === 2) stampY(na, net.nodeOf(pin(c, pos)), cx(1 / R_CONTACT))
      continue
    }
    const Y = admittance(c, omega)
    if (!Y) continue
    stampY(na, nb, Y)
    if (c.kind === 'ac_source') stampI(na, nb, cmul(Y, cx(num(c, 'vrms', 3))))
  }
  const x = solveComplex(A, b)
  if (!x) return { ok: false, omega, elements: {} }
  const V: Cx[] = new Array(net.nodeCount).fill(null).map(() => cx(0))
  for (let node = 0; node < net.nodeCount; node++) { const r = row(node); V[node] = r >= 0 ? x[r] : cx(0) }

  const elements: Record<string, ACElement> = {}
  for (const c of circuit.components) {
    const va = V[net.nodeOf(pin(c, 0))], vb = V[net.nodeOf(pin(c, 1))]
    const Vab = csub(va, vb)
    let I = cx(0)
    let Z: Cx | null = null
    if (c.kind === 'rheostat') {
      const Rmax = num(c, 'Rmax', 20), pos = Math.min(1, Math.max(0, num(c, 'pos', 0.5)))
      const vc = V[net.nodeOf(pin(c, 2))]
      I = cdiv(csub(va, vc), cx(Math.max(R_CONTACT, pos * Rmax)))
    } else if (c.kind === 'spdt_switch') {
      const pos = num(c, 'pos', 0)
      I = pos === 1 || pos === 2 ? cdiv(csub(va, V[net.nodeOf(pin(c, pos))]), cx(R_CONTACT)) : cx(0)
    } else {
      const Y = admittance(c, omega)
      if (Y && (Y.re !== 0 || Y.im !== 0)) {
        I = cmul(Y, Vab)
        if (c.kind === 'ac_source') I = csub(I, cmul(Y, cx(num(c, 'vrms', 3))))
        Z = cdiv(cx(1), Y)
      }
    }
    elements[c.id] = { V: Vab, I, vRms: cabs(Vab), iRms: cabs(I), phase: cang(Vab) - cang(I), Z }
  }
  return { ok: true, omega, elements }
}

/** 感抗 / 容抗理论值（用于对照与判分） */
export const reactanceL = (L: number, f: number) => 2 * Math.PI * f * L
export const reactanceC = (C: number, f: number) => 1 / (2 * Math.PI * f * C)
