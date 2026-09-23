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

// ───────────────── P3 批 3·第 2 步：AC 装置面（卡 15/45/46/47）─────────────────

export interface AcBody {
  id: string
  type: 'transformer' | 'powerline' | 'ac_four_values' | 'transformer_powerline'
  x: number; y: number; angle: number
  params: Record<string, number>
}
export interface AcFrame {
  t: number
  readings: Record<string, number>
}

/** 单个理想变压器+负载的 MNA 求解（卡 45 变压器动态，负载可扫描） */
function transformerOnce(u1: number, n1: number, n2: number, rLoad: number, w: number) {
  const ct: AcCircuit = {
    components: [
      { id: 'u', kind: 'ac_source', pins: 2, props: { um: u1 * Math.SQRT2 } },
      { id: 't', kind: 'ideal_transformer', pins: 4, props: { ratio: n2 / n1 } },
      { id: 'r', kind: 'resistor', pins: 2, props: { R: rLoad } },
    ],
    wires: [
      { a: ['u', 0], b: ['t', 0] }, { a: ['u', 1], b: ['t', 1] },
      { a: ['t', 2], b: ['r', 0] }, { a: ['t', 3], b: ['r', 1] },
    ],
  }
  const s = solveAC(ct, w)
  const i2 = Math.hypot(s.iPhasors['r#I'].re, s.iPhasors['r#I'].im)
  const i1 = Math.hypot(s.iPhasors['t#I1'].re, s.iPhasors['t#I1'].im)
  const u2 = Math.hypot(s.uPhasors['r#U'].re, s.uPhasors['r#U'].im)
  return { u2, i2, i1, p1: s.sPower.p, p2: i2 * i2 * rLoad }
}

/** 卡 15 变压器输电全链：发电→升压→线路电阻→降压→负载（MNA 全电路） */
function transformerPowerlineOnce(uGen: number, up: number, down: number, rLine: number, rLoad: number, w: number) {
  const ct: AcCircuit = {
    components: [
      { id: 'u', kind: 'ac_source', pins: 2, props: { um: uGen * Math.SQRT2 } },
      { id: 't1', kind: 'ideal_transformer', pins: 4, props: { ratio: up } },     // 升压 n2/n1=up
      { id: 'rl', kind: 'resistor', pins: 2, props: { R: rLine } },
      { id: 't2', kind: 'ideal_transformer', pins: 4, props: { ratio: 1 / down } }, // 降压
      { id: 'r', kind: 'resistor', pins: 2, props: { R: rLoad } },
    ],
    wires: [
      { a: ['u', 0], b: ['t1', 0] }, { a: ['u', 1], b: ['t1', 1] },
      { a: ['t1', 2], b: ['rl', 0] }, { a: ['rl', 1], b: ['t2', 0] }, { a: ['t2', 1], b: ['t1', 3] },
      { a: ['t2', 2], b: ['r', 0] }, { a: ['t2', 3], b: ['r', 1] },
    ],
  }
  const s = solveAC(ct, w)
  const iLine = Math.hypot(s.iPhasors['rl#I'].re, s.iPhasors['rl#I'].im)
  const iLoad = Math.hypot(s.iPhasors['r#I'].re, s.iPhasors['r#I'].im)
  const uLoad = Math.hypot(s.uPhasors['r#U'].re, s.uPhasors['r#U'].im)
  return {
    p_gen: s.sPower.p, i_line: iLine,
    p_line_loss: iLine * iLine * rLine, p_load: iLoad * iLoad * rLoad, u_load: uLoad,
    u_high: uGen * up,
  }
}

/** AC 装置主入口（与 runThermal 同契约；变压器卡在帧上扫描负载=动态分析） */
export function runAc(elements: AcBody[], maxDuration = 3): AcFrame[] {
  const steps = 60
  const frames: AcFrame[] = []
  const tr = elements.find((e) => e.type === 'transformer')
  if (tr) {
    const u1 = tr.params.u1 ?? 220, n1 = tr.params.n1 ?? 2, n2 = tr.params.n2 ?? 1
    const r0 = tr.params.r_load ?? 11, r1 = tr.params.r_load_end ?? r0
    const w = 2 * Math.PI * 50
    for (let i = 0; i <= steps; i++) {
      const rLoad = r0 + ((r1 - r0) * i) / steps
      const m = transformerOnce(u1, n1, n2, rLoad, w)
      frames.push({ t: i / 30, readings: { u1, n1, n2, r_load: rLoad, ...m } })
    }
    return frames
  }
  const pl = elements.find((e) => e.type === 'powerline')
  if (pl) {
    // catalog 面板单位 kW/kV → SI W/V
    const r = powerlineLoss((pl.params.p_send ?? 110) * 1000, (pl.params.u_send ?? 1.1) * 1000, pl.params.r_line ?? 0.5)
    for (let i = 0; i <= steps; i++) {
      frames.push({ t: i / 30, readings: { i_line: r.i, p_loss: r.pLoss, p_recv: r.pRecv, u_drop: r.uDrop } })
    }
    return frames
  }
  const fv4 = elements.find((e) => e.type === 'ac_four_values')
  if (fv4) {
    const um = fv4.params.um ?? 311, f = fv4.params.f ?? 50
    const fv = fourValues(um, 2 * Math.PI * f)
    for (let i = 0; i <= steps; i++) {
      frames.push({ t: i / 30, readings: { um, f, peak: fv.peak, rms: fv.rms, avg: fv.avg } })
    }
    return frames
  }
  const tp = elements.find((e) => e.type === 'transformer_powerline')
  if (tp) {
    const w = 2 * Math.PI * 50
    const m = transformerPowerlineOnce(
      tp.params.u_gen ?? 220, tp.params.up ?? 10, tp.params.down ?? 10,
      tp.params.r_line ?? 0.5, tp.params.r_load ?? 11, w)
    for (let i = 0; i <= steps; i++) {
      frames.push({ t: i / 30, readings: { ...tp.params, ...m } })
    }
    return frames
  }
  return []
}
