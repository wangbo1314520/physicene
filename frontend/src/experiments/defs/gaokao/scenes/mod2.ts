/**
 * B11 近代物理组 2（纯 2D）：核反应方程 + 质量亏损（模型63）· 玻尔模型 + 碰撞（模型64）· 物质波（模型65）
 */
import type { MechSceneDef } from '../../../engine/mechScene'

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')
const f4 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '—')
const C2 = 931.494   // MeV/u

/* ══════════ 模型 63：核反应方程 + 质量亏损 ══════════ */
interface Nuc { sym: string; A: number; Z: number; m: number }
interface Rxn { name: string; kind: string; left: Nuc[]; right: Nuc[] }
const RXNS: Rxn[] = [
  { name: 'α 衰变：²³⁸U → ²³⁴Th + ⁴He', kind: 'α 衰变', left: [{ sym: 'U', A: 238, Z: 92, m: 238.050788 }], right: [{ sym: 'Th', A: 234, Z: 90, m: 234.043601 }, { sym: 'He', A: 4, Z: 2, m: 4.002602 }] },
  { name: 'β 衰变：¹⁴C → ¹⁴N + e⁻（+ ν̄）', kind: 'β⁻ 衰变', left: [{ sym: 'C', A: 14, Z: 6, m: 14.003242 }], right: [{ sym: 'N', A: 14, Z: 7, m: 14.003074 }, { sym: 'e', A: 0, Z: -1, m: 0 }] },
  { name: '聚变：²H + ³H → ⁴He + n', kind: '核聚变', left: [{ sym: 'H', A: 2, Z: 1, m: 2.014102 }, { sym: 'H', A: 3, Z: 1, m: 3.016049 }], right: [{ sym: 'He', A: 4, Z: 2, m: 4.002602 }, { sym: 'n', A: 1, Z: 0, m: 1.008665 }] },
  { name: '裂变：²³⁵U + n → ¹⁴⁴Ba + ⁸⁹Kr + 3n', kind: '核裂变', left: [{ sym: 'U', A: 235, Z: 92, m: 235.043930 }, { sym: 'n', A: 1, Z: 0, m: 1.008665 }], right: [{ sym: 'Ba', A: 144, Z: 56, m: 143.922955 }, { sym: 'Kr', A: 89, Z: 36, m: 88.917636 }, { sym: 'n', A: 1, Z: 0, m: 1.008665 }, { sym: 'n', A: 1, Z: 0, m: 1.008665 }, { sym: 'n', A: 1, Z: 0, m: 1.008665 }] },
  { name: '人工核反应：⁷Li + p → 2 ⁴He', kind: '人工转变', left: [{ sym: 'Li', A: 7, Z: 3, m: 7.016003 }, { sym: 'p', A: 1, Z: 1, m: 1.007825 }], right: [{ sym: 'He', A: 4, Z: 2, m: 4.002602 }, { sym: 'He', A: 4, Z: 2, m: 4.002602 }] },
]
const sumA = (ns: Nuc[]) => ns.reduce((a, n) => a + n.A, 0), sumZ = (ns: Nuc[]) => ns.reduce((a, n) => a + n.Z, 0), sumM = (ns: Nuc[]) => ns.reduce((a, n) => a + n.m, 0)
interface S63 { t: number; ph: 0 | 1 | 2 }
export const nuclearReaction: MechSceneDef<S63> = {
  id: 'gk-nuclear-reaction',
  title: '核反应方程 + 质量亏损（守恒 · Δm · ΔE=Δmc²）',
  desc: '五类典型核反应：反应前后质量数 A 与电荷数 Z 守恒（核子重新组合），但静止质量不守恒——质量亏损 Δm 以能量 ΔE=Δmc² 释放（1 u 对应 931.5 MeV）。动画：反应物接近 → 重组 → 生成物飞离（动能∝ΔE），核子计数器实时核对守恒。',
  formula: 'A 守恒、Z 守恒　Δm=Σm_前−Σm_后　ΔE=Δmc²=Δm(u)×931.5 MeV　平均结合能=结合能/A',
  params: [
    { key: 'rxn', label: '核反应', min: 0, max: 4, step: 1, default: 2, options: RXNS.map((r, i) => ({ value: i, label: r.name })) },
  ],
  h: 1 / 200,
  init(p, tl) {
    const r = RXNS[p.rxn], dm = sumM(r.left) - sumM(r.right)
    tl.start(`${r.kind}：反应物接近`, '#F5C542')
    tl.log(0, `守恒检查：A ${sumA(r.left)}=${sumA(r.right)} ✓，Z ${sumZ(r.left)}=${sumZ(r.right)} ✓；Δm=${f4(dm)} u → ΔE=${f2(dm * C2)} MeV${r.kind.includes('β') ? '（β 衰变的质量用原子质量差，忽略中微子）' : ''}`)
    return { t: 0, ph: 0 }
  },
  step(s, _p, _d, t, tl) {
    s.t = t
    if (s.ph === 0 && t >= 1.5) { s.ph = 1; tl.switchTo('核子重组（强相互作用）', '#E05555', t, `t=${f2(t)}s 核子重新组合：总核子数不变，结合能改变`) }
    if (s.ph === 1 && t >= 2.2) { s.ph = 2; tl.switchTo('生成物飞离：ΔE 变为动能/光子', '#3ecf8e', t, `t=${f2(t)}s 释放 ΔE=Δmc²（生成物动能按动量守恒分配：轻的分得多）`) }
    return t < 5
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const r = RXNS[p.rxn], dm = sumM(r.left) - sumM(r.right), dE = dm * C2
    const cy = h / 2 - 20
    const drawNuc = (n: Nuc, x: number, y: number, scale = 1) => {
      const N = Math.min(60, n.A), rad = 6 + 3.2 * Math.cbrt(Math.max(1, n.A)) * scale
      for (let i = 0; i < N; i++) { const a = i * 2.3999, rr = rad * 0.85 * Math.sqrt((i + 0.5) / N); ctx.fillStyle = i < Math.round((N * Math.max(0, n.Z)) / Math.max(1, n.A)) ? '#E05555' : '#4A90D9'; ctx.beginPath(); ctx.arc(x + rr * Math.cos(a), y + rr * Math.sin(a), 3.2, 0, Math.PI * 2); ctx.fill() }
      if (n.A === 0) { ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill() }
      dc.label(`${n.A ? '' : ''}${n.sym}`, x, y + rad + 12, '#b0b0cc', 11); dc.label(`A=${n.A} Z=${n.Z}`, x, y + rad + 26, '#8a8aa0', 9)
    }
    const u = Math.min(1, s.t / 1.5), v = Math.max(0, Math.min(1, (s.t - 2.2) / 2.5))
    if (s.ph < 2) {
      const nL = r.left.length
      r.left.forEach((n, i) => { const x0 = w / 2 + (i - (nL - 1) / 2) * 260, x1 = w / 2 + (i - (nL - 1) / 2) * 40; drawNuc(n, x0 + (x1 - x0) * u, cy) })
      if (s.ph === 1) { ctx.fillStyle = '#F5C54233'; ctx.beginPath(); ctx.arc(w / 2, cy, 60 + 20 * Math.sin(s.t * 20), 0, Math.PI * 2); ctx.fill() }
    } else {
      const nR = r.right.length
      r.right.forEach((n, i) => { const ang = ((i / nR) * 2 * Math.PI) + 0.4; const dist = 40 + v * (140 + (n.A < 5 ? 80 : 0)); drawNuc(n, w / 2 + dist * Math.cos(ang), cy + dist * 0.55 * Math.sin(ang), 1) ; if (n.A < 5 && v > 0.05) dc.arrow(w / 2 + dist * Math.cos(ang), cy + dist * 0.55 * Math.sin(ang), 22 * Math.cos(ang), 12 * Math.sin(ang), '#F5C542') })
      ctx.fillStyle = '#F5C54211'; ctx.beginPath(); ctx.arc(w / 2, cy, 40 + v * 200, 0, Math.PI * 2); ctx.fill()
    }
    // 计数器
    const tbl = [['', '反应前', '反应后'], ['质量数 A', String(sumA(r.left)), String(sumA(r.right))], ['电荷数 Z', String(sumZ(r.left)), String(sumZ(r.right))], ['静止质量/u', f4(sumM(r.left)), f4(sumM(r.right))]]
    tbl.forEach((row, i) => row.forEach((cell, j) => dc.label(cell, 90 + j * 90, 40 + i * 18, i === 0 ? '#8a8aa0' : j === 0 ? '#b0b0cc' : '#F5C542', 11)))
    dc.label(`Δm=${f4(dm)} u　ΔE=Δmc²=${f2(dE)} MeV${r.right.length > 1 && r.kind !== 'β⁻ 衰变' ? `　每核子 ${f3(dE / sumA(r.left))} MeV` : ''}`, w / 2, h - 66, '#3ecf8e', 12)
    dc.label('红：质子　蓝：中子　黄：电子/β', w - 130, 40, '#8a8aa0', 10)
    dc.label(r.name, w / 2, h - 88, '#F5C542', 12)
  },
  readout(p) {
    const r = RXNS[p.rxn], dm = sumM(r.left) - sumM(r.right)
    return `${r.name}\nA：${sumA(r.left)} → ${sumA(r.right)}　Z：${sumZ(r.left)} → ${sumZ(r.right)}（守恒）　Δm=${f4(dm)} u　ΔE=${f2(dm * C2)} MeV=${(dm * C2 * 1.602e-13).toExponential(2)} J`
  },
  solution(p) {
    const r = RXNS[p.rxn], dm = sumM(r.left) - sumM(r.right)
    return {
      problemType: `核反应（${r.kind}）：配平方程 + 由质量亏损求释放能量`,
      hints: ['先配平：上标 A 之和相等、下标 Z 之和相等', 'β⁻ 衰变是中子变质子放出电子：A 不变、Z 加 1', '质量亏损 Δm=反应前总质量−反应后总质量（用 u）', 'ΔE=Δm×931.5 MeV（1 u 对应 931.5 MeV），或 Δm(kg)×c²'],
      processes: ['反应物接近（需克服库仑斥力：聚变要高温）', '核子重组', '生成物带走 ΔE（动能 / γ 光子）'],
      forces: ['核力（强相互作用）短程强引力', '库仑斥力（质子间）'],
      laws: ['质量数守恒、电荷数守恒', '质能方程 E=mc²，ΔE=Δmc²', '动量守恒决定生成物动能分配'],
      critical: ['平均结合能越大核越稳定：轻核聚变、重核裂变都放能', '半衰期由核性质决定，与温度压强无关', 'γ 光子不改变 A、Z'],
      derivation: [`Δm=${f4(sumM(r.left))}−${f4(sumM(r.right))}=${f4(dm)} u`, `ΔE=${f4(dm)}×931.5=${f2(dm * C2)} MeV`],
      numeric: [`ΔE=${f2(dm * C2)} MeV`, r.right.length === 2 && r.left.length === 1 ? '两体衰变：动能之比等于质量反比（动量等大反向）' : '多体反应：动能按动量守恒分配'],
      pitfalls: ['用质子数配平时忘记电子 Z=−1', '把 Δm 单位 u 直接乘 c²（应先换 kg 或用 931.5 MeV/u）', 'β 衰变认为电子来自核外', '认为衰变能被单个粒子全部带走'],
      similar: ['α 衰变的反冲核动能', '正电子发射', '链式反应临界体积'],
      competition: ['Q 值与阈能', '中微子的能量分配', '核反应截面'],
    }
  },
}

/* ══════════ 模型 64：玻尔模型 + 碰撞 ══════════ */
const E_N = (n: number) => -13.6 / (n * n)
interface S64 { t: number; ph: 0 | 1 | 2 | 3; nTop: number; x: number; lines: number[] }
export const bohrCollision: MechSceneDef<S64> = {
  id: 'gk-bohr-collision',
  title: '玻尔模型 + 碰撞（电子撞击激发 vs 光子吸收）',
  desc: '基态氢原子被入射粒子撞击：若是电子（或其他实物粒子），只要动能 ≥ 某能级差就能激发，多余能量由电子带走；若是光子，能量必须恰好等于能级差才能被吸收（否则不吸收）。激发后原子退激发放出光子，谱线条数 C(n,2)。',
  formula: '电子撞击：E_k ≥ E_n−E₁ 可激发到 n（取最高可达）　光子：hν=E_n−E₁ 严格相等　电离：≥13.6 eV',
  params: [
    { key: 'kind', label: '入射粒子', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '电子（动能 E_k）' }, { value: 1, label: '光子（能量 hν）' }] },
    { key: 'E', label: '入射能量', min: 8, max: 15, step: 0.1, default: 12.5, unit: 'eV' },
  ],
  h: 1 / 200,
  init(p, tl) {
    let nTop = 1
    if (p.kind === 0) { for (let n = 2; n <= 6; n++) if (p.E >= E_N(n) - E_N(1) - 1e-9) nTop = n; if (p.E >= 13.6) nTop = 99 }
    else { for (let n = 2; n <= 6; n++) if (Math.abs(p.E - (E_N(n) - E_N(1))) < 0.05) nTop = n; if (p.E >= 13.6) nTop = 99 }
    tl.start(p.kind === 0 ? '电子飞向基态氢原子' : '光子飞向基态氢原子', '#F5C542')
    return { t: 0, ph: 0, nTop, x: 0, lines: [] }
  },
  step(s, p, d, t, tl) {
    s.t = t
    if (s.ph === 0 && t >= 1.2) {
      s.ph = 1
      if (s.nTop === 99) tl.switchTo('电离', '#E05555', t, `E=${p.E} eV ≥ 13.6 eV：电子被打出原子（电离），剩余动能 ${f2(p.E - 13.6)} eV`)
      else if (s.nTop === 1) tl.switchTo(p.kind === 0 ? '未激发（E_k<10.2 eV）' : '不吸收（能量不匹配）', '#8a8aa0', t, p.kind === 0 ? `E_k=${p.E} eV < 10.2 eV：无法激发，弹性碰撞` : `hν=${p.E} eV 不等于任何 E_n−E₁（10.2、12.09、12.75、13.06…）：光子不被吸收，穿过`)
      else tl.switchTo(`激发到 n=${s.nTop}`, '#3ecf8e', t, p.kind === 0 ? `E_k=${p.E} eV ≥ E_${s.nTop}−E₁=${f2(E_N(s.nTop) - E_N(1))} eV：最高激发到 n=${s.nTop}，电子剩余 ${f2(p.E - (E_N(s.nTop) - E_N(1)))} eV 带走` : `hν=${p.E} eV=E_${s.nTop}−E₁ 恰好匹配：光子被吸收，激发到 n=${s.nTop}`)
    }
    if (s.ph === 1 && t >= 2.4) {
      s.ph = 2
      if (s.nTop > 1 && s.nTop !== 99) { const n = s.nTop; s.lines = []; for (let a = n; a >= 2; a--) for (let b = a - 1; b >= 1; b--) s.lines.push(E_N(a) - E_N(b)); tl.switchTo('退激发：放出光子', '#F5C542', t, `从 n=${n} 向下跃迁，最多 C(${n},2)=${(n * (n - 1)) / 2} 种光子：${s.lines.map((e) => f2(e) + ' eV').join('、')}`) }
      else return false
    }
    return t < 5
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const cx = w / 2 + 40, cy = h / 2 - 10
    // 原子：核 + 轨道
    ctx.fillStyle = '#E05555'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill()
    for (let n = 1; n <= 4; n++) { ctx.strokeStyle = n === Math.min(4, s.nTop === 99 ? 4 : s.ph >= 1 && s.ph < 2 ? s.nTop : 1) ? '#F5C54288' : '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, 22 * n * n * 0.55 + 10, 0, Math.PI * 2); ctx.stroke(); dc.label(`n=${n}`, cx + 22 * n * n * 0.55 + 10 + 16, cy - 6, '#565675', 9) }
    const nNow = s.nTop === 99 ? 4 : s.ph === 1 ? s.nTop : s.ph >= 2 ? 1 : 1
    const rE = 22 * nNow * nNow * 0.55 + 10, ang = s.t * 3
    ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(cx + rE * Math.cos(ang), cy + rE * Math.sin(ang), 5, 0, Math.PI * 2); ctx.fill()
    // 入射粒子
    if (s.ph === 0) { const x = 40 + (cx - 60 - 40) * Math.min(1, s.t / 1.2); if (p.kind === 0) { ctx.fillStyle = '#3ecf8e'; ctx.beginPath(); ctx.arc(x, cy, 5, 0, Math.PI * 2); ctx.fill(); dc.label(`e⁻ E_k=${p.E} eV`, x, cy - 16, '#3ecf8e', 11) } else { ctx.strokeStyle = '#b06ce6'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i <= 14; i++) ctx.lineTo(x - 20 + i * 3, cy + Math.sin(i * 1.3) * 4); ctx.stroke(); dc.label(`光子 hν=${p.E} eV`, x, cy - 16, '#b06ce6', 11) } }
    if (s.ph >= 1 && p.kind === 0 && s.nTop !== 99) { const rem = s.nTop === 1 ? p.E : p.E - (E_N(s.nTop) - E_N(1)); const x = cx + 60 + (s.t - 1.2) * 120 * Math.min(1, rem / 5 + 0.2); ctx.fillStyle = '#3ecf8e'; ctx.beginPath(); ctx.arc(x, cy - 30, 5, 0, Math.PI * 2); ctx.fill(); dc.label(`剩余 ${f2(rem)} eV`, x, cy - 46, '#3ecf8e', 10) }
    if (s.ph >= 1 && p.kind === 1 && s.nTop === 1) { const x = cx + 60 + (s.t - 1.2) * 150; ctx.strokeStyle = '#b06ce6'; ctx.beginPath(); for (let i = 0; i <= 14; i++) ctx.lineTo(x - 20 + i * 3, cy + Math.sin(i * 1.3) * 4); ctx.stroke(); dc.label('未被吸收', x, cy - 16, '#b06ce6', 10) }
    if (s.ph >= 2) s.lines.forEach((e, i) => { const a = (i / Math.max(1, s.lines.length)) * Math.PI * 2 + 0.5, dist = 60 + (s.t - 2.4) * 90; ctx.strokeStyle = e > 10 ? '#b06ce6' : e > 1.8 ? '#E05555' : '#ff8c00'; ctx.lineWidth = 2; ctx.beginPath(); for (let k = 0; k <= 10; k++) { const rr = dist + k * 3; ctx.lineTo(cx + rr * Math.cos(a) + Math.sin(k * 1.5) * 3, cy + rr * Math.sin(a)) } ctx.stroke(); dc.label(`${f2(e)} eV（${Math.round(1240 / e)} nm）`, cx + (dist + 40) * Math.cos(a), cy + (dist + 40) * Math.sin(a), '#b0b0cc', 9) })
    // 能级表
    const tx = 70
    dc.label('能级差 E_n−E₁', tx + 40, 40, '#8a8aa0', 11)
    for (let n = 2; n <= 6; n++) dc.label(`n=${n}：${f2(E_N(n) - E_N(1))} eV`, tx + 40, 40 + (n - 1) * 16, n === s.nTop ? '#F5C542' : '#6c6c85', 10)
    dc.label('电离：13.60 eV', tx + 40, 40 + 6 * 16, s.nTop === 99 ? '#E05555' : '#6c6c85', 10)
  },
  readout(p, s) {
    const list = [2, 3, 4, 5, 6].map((n) => `${n}:${f2(E_N(n) - E_N(1))}`).join('  ')
    return `能级差（eV）${list}  电离 13.6
${p.kind === 0 ? '电子：E_k ≥ 能级差即可激发（多余带走）' : '光子：必须恰好等于能级差'}${s ? `\n结论：${s.nTop === 99 ? '电离' : s.nTop === 1 ? (p.kind === 0 ? '不能激发' : '不吸收') : `激发到 n=${s.nTop}，退激发谱线 ${(s.nTop * (s.nTop - 1)) / 2} 条`}` : ''}`
  },
  solution(p) {
    return {
      problemType: '玻尔模型：实物粒子碰撞激发与光子吸收的区别、能激发到哪一级、放出几种光子',
      hints: ['光子能量要“恰好等于”能级差；电子动能只要“大于等于”', '电子撞击后能激发到的最高能级：所有 ≤E_k 的能级差里最大的那个', '≥13.6 eV 则电离，多余成为自由电子动能', '退激发谱线数用 C(n,2)（一群原子）'],
      processes: ['入射粒子接近原子', '碰撞/吸收：能量转移到电子', '原子处于激发态 → 自发退激发放出光子'],
      forces: ['库仑力（电子与核）；碰撞过程近似能量守恒'],
      laws: ['能级 E_n=−13.6/n² eV', '光子吸收条件 hν=E_n−E_m', '电子碰撞：E_k ≥ E_n−E₁ 且能量守恒'],
      critical: ['10.2 eV：最低激发能', '13.6 eV：电离能', '12.09 eV 的光子可激发到 n=3；12.5 eV 的光子不被吸收，12.5 eV 的电子可激发到 n=3'],
      derivation: ['E_n−E₁=13.6(1−1/n²)：10.2、12.09、12.75、13.06、13.22 eV', '判断 E 与这些值的关系'],
      numeric: [`E=${p.E} eV（${p.kind === 0 ? '电子' : '光子'}）`, '退激发光子能量 = 各能级差'],
      pitfalls: ['把电子碰撞也要求“恰好相等”', '光子能量大于能级差就能吸收（错）', '一个原子算 C(n,2) 条谱线（错）', '忘记电离时多余能量'],
      similar: ['弗兰克–赫兹实验', '氢原子光谱', '光电效应 + 能级组合'],
      competition: ['碰撞中的动量守恒对阈能的修正（质心系）', '共振荧光', '激光的受激辐射'],
    }
  },
}

/* ══════════ 模型 65：物质波 ══════════ */
const H_SI = 6.626e-34, E_C = 1.602e-19
const PARTS = [{ value: 0, label: '电子', m: 9.109e-31 }, { value: 1, label: '质子', m: 1.673e-27 }, { value: 2, label: 'α 粒子', m: 6.645e-27 }]
interface S65 { hits: number[][]; n: number }
export const matterWave: MechSceneDef<S65> = {
  id: 'gk-matter-wave',
  title: '物质波（德布罗意波长 · 电子衍射环）',
  desc: '德布罗意：一切运动的实物粒子都有波动性，λ=h/p。经电压 U 加速的电子 λ=h/√(2meU)≈1.226/√U nm，与 X 射线同量级，穿过晶体产生衍射环（戴维孙–革末、汤姆孙实验）。环半径∝λ∝1/√U；宏观物体 λ 极小，波动性不可观测。',
  formula: 'λ=h/p=h/(mv)　经 U 加速：p=√(2mqU) → λ=h/√(2mqU)　电子：λ≈1.226/√U nm　衍射：2d sinθ=kλ',
  params: [
    { key: 'part', label: '粒子', min: 0, max: 2, step: 1, default: 0, options: PARTS.map((q) => ({ value: q.value, label: q.label })) },
    { key: 'U', label: '加速电压 U', min: 50, max: 5000, step: 50, default: 100, unit: 'V' },
    { key: 'd', label: '晶面间距 d', min: 0.1, max: 0.4, step: 0.02, default: 0.2, unit: 'nm' },
  ],
  h: 1 / 200,
  init(p, tl) { const lam = lam65(p); tl.start('电子束穿过晶体 → 衍射环逐渐形成', '#F5C542'); tl.log(0, `λ=h/√(2mqU)=${f4(lam)} nm${p.part === 0 ? `（1.226/√${p.U}=${f4(1.226 / Math.sqrt(p.U))}）` : ''}，第一级环 sinθ=λ/(2d)=${f4(lam / (2 * p.d))}`); return { hits: [], n: 0 } },
  step(s, p, d, t, tl) {
    const lam = lam65(p)
    const rings = [1, 2, 3].map((k) => { const sn = (k * lam) / (2 * p.d); return sn < 1 ? Math.tan(2 * Math.asin(sn)) : NaN }).filter((x) => Number.isFinite(x) && x > 0)
    const cnt = Math.round(600 * d)
    for (let i = 0; i < cnt; i++) {
      const a = Math.random() * Math.PI * 2
      const k = Math.floor(Math.random() * Math.max(1, rings.length))
      const base = rings[k] ?? 0.2
      const r = Math.max(0, base + (Math.random() - 0.5) * 0.06 * (1 + k))
      if (Math.random() < 0.85 / (1 + k)) s.hits.push([r * Math.cos(a), r * Math.sin(a)])
      s.n++
    }
    if (s.hits.length > 6000) s.hits.splice(0, s.hits.length - 6000)
    if (Math.floor(t) !== Math.floor(t - d) && Math.floor(t) === 3) tl.log(t, `${s.n} 个粒子后环已清晰：环半径 ∝ tan2θ，θ 随 λ 增大 → U 越小环越大`)
    return t < 8
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const lam = lam65(p)
    // 装置示意
    const y = h / 2 - 20
    ctx.fillStyle = '#8a8aa0'; ctx.fillRect(40, y - 30, 8, 60); dc.label(`${PARTS[p.part].label}枪`, 60, y + 46, '#8a8aa0', 10)
    dc.arrow(56, y, 90, 0, '#F5C542', `U=${p.U} V`)
    ctx.fillStyle = '#4A90D9'; ctx.fillRect(160, y - 40, 10, 80); dc.label(`晶体 d=${p.d} nm`, 165, y + 54, '#4A90D9', 10)
    const sx = w / 2 + 90, R = Math.min(h / 2 - 60, 150)
    ctx.fillStyle = '#0d0d1a'; ctx.beginPath(); ctx.arc(sx, y, R, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3a3a5e'; ctx.stroke()
    const scale = R / 1.6
    ctx.fillStyle = '#3ecf8e'
    for (const [hx, hy] of s.hits) { if (Math.hypot(hx, hy) * scale < R) ctx.fillRect(sx + hx * scale, y + hy * scale, 1.6, 1.6) }
    dc.label('荧光屏（衍射环）', sx, y + R + 16, '#8a8aa0', 10)
    ctx.strokeStyle = '#F5C54266'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(170, y); ctx.lineTo(sx, y); ctx.stroke(); ctx.setLineDash([])
    dc.label(`λ=${f4(lam)} nm　p=${(H_SI / (lam * 1e-9)).toExponential(2)} kg·m/s`, w / 2, 36, '#F5C542', 12)
    dc.label(`第一级 2d sinθ=λ → θ=${f2((Math.asin(Math.min(1, lam / (2 * p.d))) * 180) / Math.PI)}°`, w / 2, 56, '#8a8aa0', 11)
    dc.label(`已到达 ${s.n} 个粒子`, sx, y - R - 12, '#8a8aa0', 10)
  },
  readout(p) {
    const lam = lam65(p), e = lam65({ ...p, part: 0 })
    return `λ=h/√(2mqU)=${f4(lam)} nm${p.part === 0 ? '（电子 ≈1.226/√U）' : `（同电压电子 ${f4(e)} nm：质量越大 λ 越短）`}\n对比：1 kg 物体以 1 m/s 运动 λ=6.6×10⁻³⁴ m，波动性不可观测；X 射线 λ~0.1 nm 与电子相当`
  },
  solution(p) {
    const lam = lam65(p)
    return {
      problemType: '物质波：求德布罗意波长并解释电子衍射；比较不同粒子/宏观物体',
      hints: ['λ=h/p，先求动量：经电压加速 p=√(2mqU)', '电子专用速算 λ=1.226/√U nm', '同能量下质量大的动量大、波长短', '宏观物体 λ 远小于任何缝宽，观察不到衍射'],
      processes: ['粒子被 U 加速获得动量', '穿过晶体：晶面间距与 λ 同量级 → 衍射', '屏上形成同心环（多晶）或斑点（单晶）'],
      forces: ['加速电场做功 qU'],
      laws: ['E_k=qU=p²/2m', 'λ=h/p', '布拉格 2d sinθ=kλ'],
      critical: ['U 越大 λ 越短、环越小', '衍射明显条件：λ 与 d 可比', '光子 λ=hc/E 与电子 λ=h/√(2mE) 公式不同'],
      derivation: ['p=√(2mqU)', `λ=h/p=${f4(lam)} nm`, 'sinθ=λ/(2d)'],
      numeric: [`λ=${f4(lam)} nm`, `θ₁=${f2((Math.asin(Math.min(1, lam / (2 * p.d))) * 180) / Math.PI)}°`],
      pitfalls: ['用光子公式 λ=hc/E 算电子', 'U 加倍 λ 减半（错，减到 1/√2）', '认为电子波是电子“抖动”的轨迹', '相对论修正（U 很高时）'],
      similar: ['电子显微镜分辨率', '中子衍射', 'X 射线衍射'],
      competition: ['相对论德布罗意波长', '波包与不确定关系', '单电子双缝'],
    }
  },
}
function lam65(p: Record<string, number>): number { const m = PARTS[p.part].m; return (H_SI / Math.sqrt(2 * m * E_C * p.U)) * 1e9 }
