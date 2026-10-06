/**
 * 电路基础元件引擎（B1 批1 · 2026-10-07）：干电池/定值电阻/滑动变阻器/单刀单掷/单刀双掷。
 * 拓扑：wire 连线（端子锚点对）→ 复数 MNA 的 ω=0 退化（同 dc-devices：solveAC(circuit, 0)）。
 * 建模：电池=EMF 源 + 内阻 r 串联（<id>#src / <id>#r）；电阻/变阻器=线性电阻（变阻器
 *  R=Rmax·pos）；SPST=R_ON/R_OFF 二态（0.01Ω / 1e9Ω——拓扑不变 KCL 仍成立，断路 I≈0 教材口径）；
 * SPDT=刀端对 A/B 双阻二选通（sel 决定 R_ON 落在哪侧）。
 * 断言分级（单测）：物理独立（KCL 节点/欧姆定律）· 教材规律（串并联化简）· 方法独立（MNA vs 闭式）。
 */
import { solveAC, cabs } from './ac-circuit'
import type { AcCircuit, AcComp } from './ac-circuit'

export const CIRCUIT_BASIC_TYPES = new Set(['battery', 'resistor', 'rheostat', 'switch_spst', 'switch_spdt'])

export interface CircuitBody {
  id: string
  type: string
  x: number; y: number; angle: number
  params: Record<string, number>
  links: { toId: string; kind: string; anchorA: string; anchorB: string }[]
}
export interface CircuitFrame { t: number; readings: Record<string, number> }

const R_ON = 0.01, R_OFF = 1e9
const R2 = (id: string, r: number): AcComp => ({ id, kind: 'resistor', pins: 2, props: { R: Math.max(1e-9, r) } })
const SRC = (id: string, u: number): AcComp => ({ id, kind: 'ac_source', pins: 2, props: { um: u * Math.SQRT2 } })
const W = (a: [string, number], b: [string, number]) => ({ a, b })

/** 元件端子（锚点名）→ MNA 引脚 [compId, pin]。电池正极=源 pin0，负极=内阻 pin1（内部串联）。 */
function pinOf(e: CircuitBody, anchor: string): [string, number] | null {
  switch (e.type) {
    case 'battery':
      if (anchor === '正极') return [e.id + '#src', 0]
      if (anchor === '负极') return [e.id + '#r', 1]
      return null
    case 'resistor': case 'rheostat': case 'switch_spst':
      if (anchor === '左端') return [e.id, 0]
      if (anchor === '右端') return [e.id, 1]
      return null
    case 'switch_spdt':
      if (anchor === '刀端') return [e.id + '#A', 0]
      if (anchor === '掷A') return [e.id + '#A', 1]
      if (anchor === '掷B') return [e.id + '#B', 1]
      return null
  }
  return null
}

/** wire 连线 → AcCircuit。返回 { error } = 不可解原因（调用方 toast 上屏）。 */
export function buildCircuit(els: CircuitBody[]): { circuit: AcCircuit } | { error: string } {
  const byId = new Map(els.map((e) => [e.id, e]))
  const components: AcComp[] = []
  const wires: { a: [string, number]; b: [string, number] }[] = []
  if (!els.some((e) => e.type === 'battery')) return { error: '电路缺少电源（干电池）' }

  for (const e of els) {
    const p = e.params
    switch (e.type) {
      case 'battery': {
        const emf = Math.max(0.01, p.EMF ?? 1.5)
        components.push(SRC(e.id + '#src', emf), R2(e.id + '#r', Math.max(0.01, p.r ?? 0.5)))
        wires.push(W([e.id + '#src', 1], [e.id + '#r', 0]))   // 源负—内阻串联
        break
      }
      case 'resistor': components.push(R2(e.id, Math.max(0.01, p.R ?? 10))); break
      case 'rheostat': {
        const pos = Math.min(1, Math.max(0.05, p.pos ?? 0.5))
        components.push(R2(e.id, Math.max(0.01, (p.Rmax ?? 20) * pos)))
        break
      }
      case 'switch_spst': components.push(R2(e.id, (p.state ?? 1) === 1 ? R_ON : R_OFF)); break
      case 'switch_spdt': {
        const sel = (p.sel ?? 0) === 1 ? 1 : 0
        components.push(R2(e.id + '#A', sel === 0 ? R_ON : R_OFF), R2(e.id + '#B', sel === 1 ? R_ON : R_OFF))
        wires.push(W([e.id + '#A', 0], [e.id + '#B', 0]))   // 两闸刀公共端（刀端）
        break
      }
    }
  }
  for (const e of els) {
    for (const l of e.links) {
      if (l.kind !== 'wire') continue
      const t = byId.get(l.toId)
      if (!t) continue
      const pa = pinOf(e, l.anchorA), pb = pinOf(t, l.anchorB)
      if (pa && pb) wires.push(W(pa, pb))
    }
  }
  return { circuit: { components, wires } }
}

function solveDC(circuit: AcCircuit): { i: Record<string, number>; u: Record<string, number> } {
  const s = solveAC(circuit, 0)
  const i: Record<string, number> = {}, u: Record<string, number> = {}
  for (const k of Object.keys(s.iPhasors)) i[k] = cabs(s.iPhasors[k])
  for (const k of Object.keys(s.uPhasors)) u[k] = cabs(s.uPhasors[k])
  return { i, u }
}

/** 读数帧：每元件电流/端电压（DC 稳态；30fps × 2s，同 dc-devics 节奏）。 */
export function runCircuitBasics(els: CircuitBody[], maxDuration = 2): CircuitFrame[] {
  const built = buildCircuit(els)
  if ('error' in built) return []
  const { i } = solveDC(built.circuit)
  const readings: Record<string, number> = {}
  for (const e of els) {
    const p = e.params
    if (e.type === 'battery') {
      const cur = i[`${e.id}#src#I`] ?? 0
      readings[`I_${e.id}`] = +cur.toFixed(4)
      readings[`U_${e.id}`] = +((p.EMF ?? 1.5) - cur * (p.r ?? 0.5)).toFixed(4)   // 端电压=EMF−I·r
    } else if (e.type === 'resistor') {
      const rEff = Math.max(0.01, p.R ?? 10)
      const cur = i[`${e.id}#I`] ?? 0
      readings[`I_${e.id}`] = +cur.toFixed(4)
      readings[`U_${e.id}`] = +(cur * rEff).toFixed(4)
    } else if (e.type === 'rheostat') {
      const pos = Math.min(1, Math.max(0.05, p.pos ?? 0.5))
      const rEff = Math.max(0.01, (p.Rmax ?? 20) * pos)
      const cur = i[`${e.id}#I`] ?? 0
      readings[`I_${e.id}`] = +cur.toFixed(4)
      readings[`U_${e.id}`] = +(cur * rEff).toFixed(4)
    } else if (e.type === 'switch_spst') {
      readings[`I_${e.id}`] = +(i[`${e.id}#I`] ?? 0).toFixed(4)
    } else if (e.type === 'switch_spdt') {
      const sel = (p.sel ?? 0) === 1 ? 'B' : 'A'
      readings[`I_${e.id}`] = +(i[`${e.id}#${sel}#I`] ?? 0).toFixed(4)
    }
  }
  const frames: CircuitFrame[] = []
  for (let k = 0; k <= 60; k++) frames.push({ t: k / 30, readings })
  return frames
}
