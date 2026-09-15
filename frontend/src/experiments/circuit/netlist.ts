/**
 * Netlist：把被导线连接的引脚合并成节点（并查集），选地节点。
 */
import type { Circuit, PinRef } from './types'
import { pinCount } from './components'

export interface Netlist {
  nodeCount: number
  ground: number
  nodeOf: (ref: PinRef) => number
  /** 每个节点上的引脚 */
  pinsOfNode: PinRef[][]
  /** 每个节点上连接的导线条数（用于识别悬空/孤立） */
  wireDegree: number[]
}

const key = (r: PinRef) => `${r.comp}:${r.pin}`

export function buildNetlist(circuit: Circuit, opts: { includeLoose?: boolean } = {}): Netlist {
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let p = parent.get(k) ?? k
    if (p !== k) { p = find(p); parent.set(k, p) }
    return p
  }
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }

  const allPins: PinRef[] = []
  for (const c of circuit.components) {
    for (let p = 0; p < pinCount(c.kind); p++) { const ref = { comp: c.id, pin: p }; allPins.push(ref); parent.set(key(ref), key(ref)) }
  }
  const degree = new Map<string, number>()
  for (const w of circuit.wires) {
    if (w.loose && !opts.includeLoose) continue
    if (!parent.has(key(w.a)) || !parent.has(key(w.b))) continue
    union(key(w.a), key(w.b))
    degree.set(key(w.a), (degree.get(key(w.a)) ?? 0) + 1)
    degree.set(key(w.b), (degree.get(key(w.b)) ?? 0) + 1)
  }

  const rootIndex = new Map<string, number>()
  const pinsOfNode: PinRef[][] = []
  const wireDegree: number[] = []
  const nodeIndex = new Map<string, number>()
  for (const ref of allPins) {
    const root = find(key(ref))
    let idx = rootIndex.get(root)
    if (idx === undefined) { idx = pinsOfNode.length; rootIndex.set(root, idx); pinsOfNode.push([]); wireDegree.push(0) }
    pinsOfNode[idx].push(ref)
    wireDegree[idx] += degree.get(key(ref)) ?? 0
    nodeIndex.set(key(ref), idx)
  }

  // 地：第一个电源的 − 端（pin1）；没有电源则节点 0
  let ground = 0
  const src = circuit.components.find((c) => c.kind === 'battery' || c.kind === 'dc_source' || c.kind === 'ac_source')
  if (src) ground = nodeIndex.get(`${src.id}:1`) ?? 0

  return {
    nodeCount: pinsOfNode.length,
    ground,
    nodeOf: (ref) => nodeIndex.get(key(ref)) ?? -1,
    pinsOfNode,
    wireDegree,
  }
}
