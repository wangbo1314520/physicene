/**
 * AC 电路分析引擎（P3 批 3 · 决策 2）：正弦稳态相量法——复数 MNA（节点分析）。
 * 设计契约见 docs/AC引擎设计-P3批3.md。
 * 独立实现，不改动 Java CircuitEngine（DC MNA 服务刚体耦合；AC 相量无耦合需求）。
 *
 * 物理：U̇=Żİ；Z_R=R，Z_L=jωL，Z_C=1/(jωC)；理想变压器 U̇₂=ratio·U̇₁、İ₂=−İ₁/ratio（功率守恒）。
 * 数值：自实现复数四则 + 复数高斯消元（部分主元），零依赖。
 */

export type Cx = { re: number; im: number }
const cx = (re: number, im = 0): Cx => ({ re, im })
const cadd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im })
const csub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im })
const cmul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
export const cabs = (a: Cx): number => Math.hypot(a.re, a.im)
/** 相量辐角（度） */
export const cang = (a: Cx): number => (Math.atan2(a.im, a.re) * 180) / Math.PI

/** 复数线性方程组高斯消元（部分主元），A·x=b */
function solveLinear(A: Cx[][], b: Cx[]): Cx[] | null {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (cabs(M[r][col]) > cabs(M[piv][col])) piv = r
    if (cabs(M[piv][col]) < 1e-12) return null
    ;[M[col], M[piv]] = [M[piv], M[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = cdiv(M[r][col], M[col][col])
      for (let c = col; c <= n; c++) M[r][c] = csub(M[r][c], cmul(f, M[col][c]))
    }
  }
  return M.map((row, i) => cdiv(row[n], row[i]))
}

// ───────────────────────── 电路描述 ─────────────────────────

export type AcKind = 'resistor' | 'inductor' | 'capacitor' | 'ac_source' | 'ideal_transformer'

export interface AcComp {
  id: string
  kind: AcKind
  /** 元件端子数：双端 2；理想变压器 4（0,1=原边；2,3=副边）。引脚以 (compId, pin) 表达 */
  pins: number
  /**
   * resistor: { R }；inductor: { L }；capacitor: { C }
   * ac_source: { um: 峰值 V, phase: 初相 rad }（源值取有效值 Um/√2）
   * ideal_transformer: { ratio: n2/n1 }
   */
  props: Record<string, number>
}

/** 导线：连接两引脚 */
export interface AcWire { a: [string, number]; b: [string, number] }
export interface AcCircuit { components: AcComp[]; wires: AcWire[] }

export interface AcSolution {
  ok: boolean
  /** 支路/绕组电流相量（有效值 A）：双端元件 1 条；变压器 {I1, I2} */
  iPhasors: Record<string, Cx>
  /** 元件端电压相量（有效值 V） */
  uPhasors: Record<string, Cx>
  /** 电源复功率（W/var/VA）与功率因数 */
  sPower: { p: number; q: number; s: number; cosPhi: number }
}

/** 正弦稳态求解（角频率 ω rad/s）。接地点 = 第一个 ac_source 的 pin 1 */
export function solveAC(circuit: AcCircuit, omega: number): AcSolution {
  const empty: AcSolution = { ok: false, iPhasors: {}, uPhasors: {}, sPower: { p: 0, q: 0, s: 0, cosPhi: 0 } }
  const { components, wires } = circuit
  // ── 引脚 → 节点（union-find）──
  const pinKey = (c: string, p: number) => `${c}#${p}`
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    let r = parent.get(k)
    if (r === undefined) { parent.set(k, k); r = k }
    return r === k ? k : (parent.set(k, find(r)), r)!
  }
  const union = (a: string, b: string) => { parent.set(find(a), find(b)) }
  for (const c of components) for (let p = 0; p < c.pins; p++) find(pinKey(c.id, p))
  for (const w of wires) union(pinKey(...w.a), pinKey(...w.b))

  const src = components.find((c) => c.kind === 'ac_source')
  if (!src) return empty
  const gnd = find(pinKey(src.id, 1))

  // ── 节点编号（地=0，其余 1..n）──
  const nodeId = new Map<string, number>([[gnd, 0]])
  let n = 0
  for (const k of parent.keys()) {
    const r = find(k)
    if (r !== gnd && !nodeId.has(r)) nodeId.set(r, ++n)
  }
  const nd = (c: string, p: number) => nodeId.get(find(pinKey(c, p)))!

  // ── 未知量：节点电压 n 个 + 电压约束支路电流（源/变压器绕组）──
  const branches: { comp: AcComp; pinA: number; pinB: number }[] = []
  for (const c of components) {
    if (c.kind === 'ac_source') branches.push({ comp: c, pinA: 0, pinB: 1 })
    if (c.kind === 'ideal_transformer') { branches.push({ comp: c, pinA: 0, pinB: 1 }); branches.push({ comp: c, pinA: 2, pinB: 3 }) }
  }
  const N = n + branches.length
  const A: Cx[][] = Array.from({ length: N }, () => Array.from({ length: N }, () => cx(0)))
  const rhs: Cx[] = Array.from({ length: N }, () => cx(0))
  const rowOfBranch = (i: number) => n + i
  const addY = (na: number, nb: number, y: Cx) => {
    if (na !== 0) A[na - 1][na - 1] = cadd(A[na - 1][na - 1], y)
    if (nb !== 0) A[nb - 1][nb - 1] = cadd(A[nb - 1][nb - 1], y)
    if (na !== 0 && nb !== 0) { A[na - 1][nb - 1] = csub(A[na - 1][nb - 1], y); A[nb - 1][na - 1] = csub(A[nb - 1][na - 1], y) }
  }

  // GMIN：每节点对地 1e-9S 微导纳（SPICE 惯例）——理想变压器副边浮空无参考点会致奇异，
  // 教学电路量值影响 <1e-7%
  const GMIN = 1e-9
  for (let node = 1; node <= n; node++) addY(node, 0, cx(GMIN))

  for (const c of components) {
    if (c.kind === 'resistor') addY(nd(c.id, 0), nd(c.id, 1), cx(1 / c.props.R))
    else if (c.kind === 'inductor') addY(nd(c.id, 0), nd(c.id, 1), cdiv(cx(1), cx(0, omega * c.props.L)))
    else if (c.kind === 'capacitor') addY(nd(c.id, 0), nd(c.id, 1), cx(0, omega * c.props.C))
  }
  // 电压约束支路（MNA 扩展行）：V_a − V_b = U̇，支路电流计入 KCL
  const srcVal = (c: AcComp): Cx => {
    const rms = c.props.um / Math.SQRT2
    return cx(rms * Math.cos(c.props.phase ?? 0), rms * Math.sin(c.props.phase ?? 0))
  }
  branches.forEach((br, i) => {
    const na = nd(br.comp.id, br.pinA), nb = nd(br.comp.id, br.pinB)
    const r = rowOfBranch(i)
    if (na !== 0) { A[na - 1][r] = cadd(A[na - 1][r], cx(1)); A[r][na - 1] = cadd(A[r][na - 1], cx(1)) }
    if (nb !== 0) { A[nb - 1][r] = csub(A[nb - 1][r], cx(1)); A[r][nb - 1] = csub(A[r][nb - 1], cx(1)) }
    if (br.comp.kind === 'ac_source') rhs[r] = srcVal(br.comp)
  })
  // 理想变压器两绕组约束：U̇₂ = ratio·U̇₁（行 n+i1 已含 U̇₁，改造为差式）；İ₁ + ratio·İ₂ = 0
  for (let bi = 0; bi < branches.length; bi++) {
    if (branches[bi].comp.kind !== 'ideal_transformer') continue
    const isPrim = branches[bi].pinA === 0
    const other = branches.findIndex((b, j) => j !== bi && b.comp === branches[bi].comp)
    if (!isPrim || other < 0) continue
    const rp = rowOfBranch(bi), rs = rowOfBranch(other)
    const ratio = branches[bi].comp.props.ratio
    // 行 rp（原是 U̇₁ = 0）：改为 U̇₂ − ratio·U̇₁ = 0
    for (let c2 = 0; c2 < N; c2++) A[rp][c2] = csub(A[rs][c2], cmul(cx(ratio), A[rp][c2]))
    rhs[rp] = csub(rhs[rs], cmul(cx(ratio), rhs[rp]))
    // 行 rs：İ₂ + (1/ratio)·İ₁ = 0 → 只留电流未知列
    for (let c2 = 0; c2 < N; c2++) A[rs][c2] = cx(0)
    A[rs][rs] = cx(1)
    A[rs][rp] = cx(1 / ratio)
    rhs[rs] = cx(0)
  }

  const x = solveLinear(A, rhs)
  if (!x) return empty
  const vNode = (node: number): Cx => (node === 0 ? cx(0) : x[node - 1])
  const iPhasors: Record<string, Cx> = {}
  const uPhasors: Record<string, Cx> = {}
  branches.forEach((br, i) => {
    const key = br.comp.kind === 'ideal_transformer' ? `${br.comp.id}#${br.pinA === 0 ? 'I1' : 'I2'}` : `${br.comp.id}#I`
    iPhasors[key] = x[rowOfBranch(i)]
    uPhasors[key.replace(/#I\d?$/, '#U').replace('#I', '#U')] = csub(vNode(nd(br.comp.id, br.pinA)), vNode(nd(br.comp.id, br.pinB)))
  })
  for (const c of components) {
    if (c.kind !== 'resistor' && c.kind !== 'inductor' && c.kind !== 'capacitor') continue
    const z = c.kind === 'resistor' ? cx(c.props.R) : c.kind === 'inductor' ? cx(0, omega * c.props.L) : cdiv(cx(1), cx(0, omega * c.props.C))
    const uZ = csub(vNode(nd(c.id, 0)), vNode(nd(c.id, 1)))
    uPhasors[`${c.id}#U`] = uZ
    iPhasors[`${c.id}#I`] = cdiv(uZ, z)
  }
  // 电源复功率 S = −U̇·İ*（İ 为流经源内部的支路电流——MNA 口径，对外供电取负号）
  const iSrc = iPhasors[`${src.id}#I`]
  const uSrc = uPhasors[`${src.id}#U`]
  const s = cmul(cx(-uSrc.re, -uSrc.im), cx(iSrc.re, -iSrc.im))
  const sAbs = cabs(s)
  return {
    ok: true, iPhasors, uPhasors,
    sPower: { p: s.re, q: s.im, s: sAbs, cosPhi: sAbs > 1e-9 ? s.re / sAbs : 1 },
  }
}

// ───────────────── 交变四值（卡 47）─────────────────

/** 峰值/有效值/平均值/瞬时（u=um·sin(ωt+phase)） */
export function fourValues(um: number, omega: number, phase = 0): {
  peak: number; rms: number; avg: number; instantAt: (t: number) => number
} {
  return {
    peak: um,
    rms: um / Math.SQRT2,
    avg: (2 * um) / Math.PI,  // 半周期平均（绝对值平均，教材口径）
    instantAt: (t: number) => um * Math.sin(omega * t + phase),
  }
}

/** 输电损耗（卡 46 教材口径）：I=P/U，P损=I²·R_line，P收=P送−P损 */
export function powerlineLoss(pSend: number, uSend: number, rLine: number): {
  i: number; pLoss: number; pRecv: number; uDrop: number
} {
  const i = pSend / uSend
  const pLoss = i * i * rLine
  return { i, pLoss, pRecv: pSend - pLoss, uDrop: i * rLine }
}
