/**
 * B11 热学组 2（纯 2D）：变质量气体（模型53）· U 形管（模型54）
 */
import type { MechSceneDef } from '../../../engine/mechScene'

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')

/* ══════════ 模型 53：变质量气体（打气 / 抽气） ══════════ */
const MODES53 = [{ value: 0, label: '打气：每次把 p₀、V₀ 的空气压入容器' }, { value: 1, label: '抽气：每次抽走容器内 V₀ 的气体' }]
interface S53 { k: number; phase: number; p: number; done: boolean }
import { pumpPressureRatio, uTubeSolveX } from '../../../../physics/thermal-statics'
function p53(p: Record<string, number>, k: number) { return pumpPressureRatio(k, p.V0, p.V, p.mode) }  // 共享物理源（P3 批2 收编）
export const variableMassGas: MechSceneDef<S53> = {
  id: 'gk-variable-mass-gas',
  title: '变质量气体（打气 / 抽气 · 等效总体积法）',
  desc: '打气筒每次把大气压 p₀、体积 V₀ 的空气压入容积 V 的容器（等温）。把“容器 + n 筒空气”看成同一部分气体：p₀(V+nV₀)=pₙV → pₙ=p₀(1+nV₀/V) 线性增长。抽气：每次抽走 V₀ 后剩余气体等温膨胀回 V：pₙ=p₀[V/(V+V₀)]ⁿ 按等比衰减。',
  formula: '打气：p₀(V+nV₀)=pₙV　抽气：pₖ₋₁V=pₖ(V+V₀) → pₙ=p₀[V/(V+V₀)]ⁿ　关键：选“变前变后都完整”的那部分气体',
  params: [
    { key: 'mode', label: '操作', min: 0, max: 1, step: 1, default: 0, options: MODES53 },
    { key: 'V', label: '容器容积 V', min: 5, max: 30, step: 1, default: 10, unit: 'L' },
    { key: 'V0', label: '每筒体积 V₀', min: 0.2, max: 2, step: 0.1, default: 0.5, unit: 'L' },
    { key: 'n', label: '次数 n', min: 1, max: 20, step: 1, default: 8 },
  ],
  h: 1 / 200,
  init(p, tl) { tl.start(p.mode === 0 ? '打气：p 线性上升' : '抽气：p 等比下降', '#F5C542'); return { k: 0, phase: 0, p: 1, done: false } },
  step(s, p, d, t, tl) {
    const period = 0.6
    const kNow = Math.min(Math.round(p.n), Math.floor(t / period))
    s.phase = (t % period) / period
    if (kNow > s.k) {
      s.k = kNow; s.p = p53(p, s.k)
      if (s.k <= 3 || s.k === Math.round(p.n) || s.k % 5 === 0) tl.log(t, `第 ${s.k} 次：p=${f2(s.p)} p₀（${p.mode === 0 ? `等效总体积 V+${s.k}V₀=${f1(p.V + s.k * p.V0)} L` : `剩余比例 [V/(V+V₀)]^${s.k}`}）`)
      if (s.k >= Math.round(p.n)) { tl.switchTo('结束', '#8a8aa0', t, `${p.mode === 0 ? `打气 ${s.k} 次后 p=p₀(1+nV₀/V)=${f2(s.p)} p₀` : `抽气 ${s.k} 次后 p=p₀[V/(V+V₀)]ⁿ=${f3(s.p)} p₀`}（容器内气体质量变为原来的 ${f2(s.p)} 倍）`); return false }
    }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    // 容器
    const cx = w / 2 + 40, cy = h / 2, R = Math.min(110, h / 4)
    ctx.fillStyle = '#1d1d33'; ctx.strokeStyle = '#9cc5ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
    const nDots = Math.round(40 * s.p)
    ctx.fillStyle = '#F5C542'
    for (let i = 0; i < nDots; i++) { const a = i * 2.399963, r = R * 0.9 * Math.sqrt((i + 0.5) / Math.max(1, nDots)); ctx.beginPath(); ctx.arc(cx + r * Math.cos(a + s.phase * 0.5), cy + r * Math.sin(a + s.phase * 0.5), 2.2, 0, Math.PI * 2); ctx.fill() }
    dc.label(`容器 V=${p.V} L`, cx, cy + R + 18, '#8a8aa0', 11)
    // 压力表
    const gx = cx + R + 70, gy = cy - R + 10
    ctx.fillStyle = '#23233a'; ctx.beginPath(); ctx.arc(gx, gy, 34, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1.5; ctx.stroke()
    const frac = Math.min(1, s.p / 3), ang = Math.PI * (1.25 - 1.5 * frac)
    ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + 26 * Math.cos(ang), gy - 26 * Math.sin(ang)); ctx.stroke()
    dc.label(`p=${f2(s.p)} p₀`, gx, gy + 48, '#E05555', 12)
    // 打气筒
    const px = cx - R - 120, py = cy - 60
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2; ctx.strokeRect(px, py, 40, 120)
    const stroke = p.mode === 0 ? (s.phase < 0.5 ? s.phase * 2 : 2 - s.phase * 2) : (s.phase < 0.5 ? 1 - s.phase * 2 : s.phase * 2 - 1)
    ctx.fillStyle = '#4A90D9'; ctx.fillRect(px + 3, py + 6 + stroke * 80, 34, 10)
    ctx.fillRect(px + 17, py - 30 + stroke * 80, 6, 40)
    ctx.fillStyle = '#F5C54233'; ctx.fillRect(px + 3, py + 16 + stroke * 80, 34, 104 - stroke * 80)
    ctx.strokeStyle = '#8a8aa0'; ctx.beginPath(); ctx.moveTo(px + 40, py + 110); ctx.lineTo(cx - R, cy); ctx.stroke()
    dc.label(`打气筒 V₀=${p.V0} L（${p.mode === 0 ? '压入' : '抽出'}）`, px + 20, py + 140, '#8a8aa0', 10)
    dc.label(`已${p.mode === 0 ? '打' : '抽'} ${s.k}/${Math.round(p.n)} 次`, px + 20, py - 50, '#F5C542', 12)
    // p–n 图
    const bx0 = w - 230, bx1 = w - 30, by0 = h - 70, byT = h - 200
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx0, byT); ctx.lineTo(bx0, by0); ctx.lineTo(bx1, by0); ctx.stroke()
    const N = Math.round(p.n), pmax = p.mode === 0 ? p53(p, N) : 1
    for (let k = 0; k <= N; k++) { const x = bx0 + (k / N) * (bx1 - bx0), y = by0 - (p53(p, k) / pmax) * (by0 - byT); ctx.fillStyle = k <= s.k ? '#F5C542' : '#3a3a5e'; ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill() }
    dc.label(p.mode === 0 ? 'p–n：线性' : 'p–n：等比衰减', (bx0 + bx1) / 2, byT - 12, '#8a8aa0', 10)
  },
  readout(p, s) {
    const N = Math.round(p.n)
    return p.mode === 0 ? `等效总体积法：p₀(V+nV₀)=pₙV → pₙ=p₀(1+nV₀/V)：n=${N} 时 ${f2(p53(p, N))} p₀\n每打一次增加 V₀/V=${f3(p.V0 / p.V)} p₀（线性）${s ? `\n当前 ${s.k} 次，p=${f2(s.p)} p₀` : ''}`
      : `每抽一次：pₖ₋₁V=pₖ(V+V₀) → 比例 V/(V+V₀)=${f3(p.V / (p.V + p.V0))}；n=${N} 次后 p=${f3(p53(p, N))} p₀（永远抽不到零）${s ? `\n当前 ${s.k} 次，p=${f3(s.p)} p₀` : ''}`
  },
  solution(p) {
    const N = Math.round(p.n)
    return {
      problemType: '变质量气体（打气 / 抽气）：用“等效总体积”把变质量转化为定质量',
      hints: ['研究对象选“操作前后都完整的那部分气体”', '打气：容器里的气 + 将要打进去的 n 筒气，一起按 p₀ 算初态', '抽气：每次都是容器内剩余气体等温膨胀到 V+V₀，再倒掉 V₀', '温度不变才能用玻意耳定律'],
      processes: ['确定等效气体：初态 (p₀, V+nV₀) 或 (pₖ₋₁, V)', '等温压缩/膨胀', '末态 (pₙ, V)'],
      forces: ['不涉及受力'],
      laws: ['玻意耳定律 pV=常数（同一部分气体）', '打气：p₀(V+nV₀)=pₙV', '抽气：pₖ=pₖ₋₁·V/(V+V₀)'],
      critical: ['打气到 p 时需要的次数 n=(p/p₀−1)V/V₀', '抽气 p 趋于零但达不到', '若打气过程温度升高，需用 pV/T'],
      derivation: [p.mode === 0 ? `pₙ=p₀(1+nV₀/V)=p₀(1+${N}×${p.V0}/${p.V})=${f2(p53(p, N))} p₀` : `pₙ=p₀(V/(V+V₀))ⁿ=(${p.V}/${f1(p.V + p.V0)})^${N}=${f3(p53(p, N))} p₀`],
      numeric: [`n=${N}，V=${p.V} L，V₀=${p.V0} L`, `末压强 ${p.mode === 0 ? f2(p53(p, N)) : f3(p53(p, N))} p₀`],
      pitfalls: ['直接对容器内气体（质量在变）用 pV=常数', '抽气按线性减少', '忘记打气筒内气体初始也是 p₀', '单位 L 与 m³ 混用（比值无影响）'],
      similar: ['轮胎充气', '真空泵抽气次数', '气球放气'],
      competition: ['绝热压缩下的打气', '非理想气体', '多级泵'],
    }
  },
}

/* ══════════ 模型 54：U 形管 ══════════ */
const MODES54 = [{ value: 0, label: '左端封闭气体缓慢升温（p、L 同时变）' }, { value: 1, label: '向开口端注入汞柱 Δ（等温）' }]
interface S54 { x: number; T: number; done: boolean; target: number }
const P0 = 76
function solve54(p: Record<string, number>) { return uTubeSolveX(P0, p.dh0, p.L1, p.T1, p.T2, p.dAdd, p.mode) }  // 共享物理源（P3 批2 收编）
export const uTube: MechSceneDef<S54> = {
  id: 'gk-u-tube',
  title: 'U 形管（液面差定压强 · 两端联动 · 二次方程）',
  desc: '左臂封闭一段气体（长 L₁），右臂开口。气体压强 p=p₀+Δh（Δh=右液面高−左液面高，可为负）。升温或向右臂注汞时，左液面下降 x、右液面上升 x（注汞再加 Δ），Δh 变为 Δh₀+2x（+Δ），L 变为 L₁±x，联立气体定律得关于 x 的二次方程。',
  formula: 'p=p₀+Δh　升温：(p₀+Δh₀+2x)(L₁+x)/T₂=(p₀+Δh₀)L₁/T₁　注汞 Δ：(p₀+Δh₀+2x+Δ)(L₁−x)=(p₀+Δh₀)L₁',
  params: [
    { key: 'mode', label: '过程', min: 0, max: 1, step: 1, default: 0, options: MODES54 },
    { key: 'L1', label: '初始气柱长 L₁', min: 10, max: 30, step: 1, default: 20, unit: 'cm' },
    { key: 'dh0', label: '初始液面差 Δh₀（右−左）', min: -10, max: 20, step: 1, default: 4, unit: 'cm' },
    { key: 'T1', label: '初温 T₁', min: 250, max: 350, step: 5, default: 300, unit: 'K' },
    { key: 'T2', label: '末温 T₂（升温模式）', min: 250, max: 450, step: 5, default: 360, unit: 'K' },
    { key: 'dAdd', label: '注入汞柱长 Δ（注汞模式）', min: 2, max: 20, step: 1, default: 10, unit: 'cm' },
  ],
  h: 1 / 200,
  init(p, tl) {
    const x = solve54(p)
    tl.start(p.mode === 0 ? '升温：气体膨胀推动汞柱' : '注汞：右臂加汞压缩气体', '#F5C542')
    tl.log(0, `初态 p₁=p₀+Δh₀=${f1(P0 + p.dh0)} cmHg，L₁=${p.L1} cm`)
    return { x: 0, T: p.T1, done: false, target: x }
  },
  step(s, p, d, t, tl) {
    const u = Math.min(1, t / 4)
    s.x = s.target * u
    if (p.mode === 0) s.T = p.T1 + (p.T2 - p.T1) * u
    if (u >= 1) {
      const p2 = P0 + p.dh0 + 2 * s.x + (p.mode === 1 ? p.dAdd : 0), L2 = p.mode === 0 ? p.L1 + s.x : p.L1 - s.x
      tl.log(t, `末态：左液面下降 x=${f2(s.x)} cm，Δh=${f1(p.dh0 + 2 * s.x + (p.mode === 1 ? p.dAdd : 0))} cm，p₂=${f1(p2)} cmHg，L₂=${f2(L2)} cm；验证 p₂L₂/T₂=${f2((p2 * L2) / (p.mode === 0 ? p.T2 : p.T1))}=p₁L₁/T₁=${f2(((P0 + p.dh0) * p.L1) / p.T1)}`)
      return false
    }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const PX = Math.min(4.5, (h - 160) / (p.L1 + 60)), cx = w / 2 - 60, base = h - 70
    const armW = 30, gap = 90
    const extra = p.mode === 1 ? (s.x / Math.max(1e-6, s.target)) * p.dAdd : 0
    const yL = 20 - s.x, yR = 20 + p.dh0 + s.x + extra                 // 液面高度（cm，相对底部）
    const L = p.mode === 0 ? p.L1 + s.x : p.L1 - s.x
    const topL = yL + L
    const drawArm = (x: number, hMerc: number, gasTop: number | null, closed: boolean) => {
      const H = Math.max(hMerc, gasTop ?? 0) + 8
      ctx.fillStyle = '#1d1d33'; ctx.strokeStyle = '#9cc5ff'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.rect(x - armW / 2, base - H * PX, armW, H * PX); ctx.fill(); ctx.stroke()
      ctx.fillStyle = '#b0b0cc'; ctx.fillRect(x - armW / 2 + 2, base - hMerc * PX, armW - 4, hMerc * PX)
      if (gasTop !== null) { ctx.fillStyle = '#F5C54233'; ctx.fillRect(x - armW / 2 + 2, base - gasTop * PX, armW - 4, (gasTop - hMerc) * PX) }
      if (closed) { ctx.fillStyle = '#9cc5ff'; ctx.fillRect(x - armW / 2, base - H * PX - 3, armW, 4) } else { ctx.fillStyle = '#14142a'; ctx.fillRect(x - armW / 2 + 2, base - H * PX - 2, armW - 4, 5) }
    }
    ctx.fillStyle = '#b0b0cc'; ctx.fillRect(cx - gap / 2 - armW / 2 + 2, base - 20 * PX, gap + armW - 4, 20 * PX)   // 底部连通汞
    drawArm(cx - gap / 2, yL, topL, true); drawArm(cx + gap / 2, yR, null, false)
    // 液面差标注
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#565675'; ctx.beginPath(); ctx.moveTo(cx - gap / 2 - 20, base - yL * PX); ctx.lineTo(cx + gap / 2 + 40, base - yL * PX); ctx.moveTo(cx - gap / 2 - 20, base - yR * PX); ctx.lineTo(cx + gap / 2 + 40, base - yR * PX); ctx.stroke(); ctx.setLineDash([])
    dc.arrow(cx + gap / 2 + 36, base - yL * PX, 0, -(yR - yL) * PX, '#3ecf8e', `Δh=${f1(yR - yL)}`)
    dc.label(`气柱 L=${f2(L)} cm`, cx - gap / 2, base - (yL + L / 2) * PX, '#F5C542', 10)
    dc.label('封闭', cx - gap / 2, base - (topL + 8) * PX - 14, '#9cc5ff', 10); dc.label('开口 p₀', cx + gap / 2, base - (Math.max(yR, 0) + 8) * PX - 14, '#8a8aa0', 10)
    const bx = w - 190
    dc.label('封闭气体', bx + 60, 60, '#F5C542', 12)
    dc.label(`p=p₀+Δh=${f1(P0 + yR - yL)} cmHg`, bx + 60, 84, '#b0b0cc', 11)
    dc.label(`L=${f2(L)} cm`, bx + 60, 104, '#b0b0cc', 11)
    dc.label(`T=${f1(s.T)} K`, bx + 60, 124, '#b0b0cc', 11)
    dc.label(`x=${f2(s.x)} cm（目标 ${f2(s.target)}）`, bx + 60, 150, '#3ecf8e', 11)
  },
  readout(p, s) {
    const x = solve54(p), p1 = P0 + p.dh0
    const p2 = p1 + 2 * x + (p.mode === 1 ? p.dAdd : 0), L2 = p.mode === 0 ? p.L1 + x : p.L1 - x
    return `p₁=p₀+Δh₀=${f1(p1)} cmHg，L₁=${p.L1} cm
${p.mode === 0 ? `升温到 ${p.T2} K：(p₁+2x)(L₁+x)/T₂=p₁L₁/T₁ → x=${f2(x)} cm` : `注汞 Δ=${p.dAdd} cm：(p₁+2x+Δ)(L₁−x)=p₁L₁ → x=${f2(x)} cm`}
末态 p₂=${f1(p2)} cmHg，L₂=${f2(L2)} cm，Δh=${f1(p.dh0 + 2 * x + (p.mode === 1 ? p.dAdd : 0))} cm${s ? `\n当前 x=${f2(s.x)}` : ''}`
  },
  solution(p) {
    const x = solve54(p), p1 = P0 + p.dh0
    return {
      problemType: 'U 形管封闭气体：液面差定压强，两臂液面联动列二次方程',
      hints: ['压强看液面差：p=p₀+（开口侧液面−封闭侧液面）', '一边降 x 另一边升 x：液面差变 2x（注汞再加 Δ）', '气柱长也随 x 变：升温 L₁+x，注汞 L₁−x', '两个变化联立到气体定律 → 关于 x 的二次方程，取正根'],
      processes: ['初态：p₁=p₀+Δh₀，L₁，T₁', '过程：升温（p、L 都变）或注汞（等温）', '末态：解 x 后回代'],
      forces: ['汞柱平衡：两液面等高处压强相等'],
      laws: ['连通器等高等压：p_气+ρgh_左=p₀+ρgh_右', 'pL/T=常数 或 pL=常数', '几何：液面差与气柱长同时随 x 变化'],
      critical: ['Δh₀ 为负表示封闭侧液面高，p<p₀', '注汞时气柱被压缩、液面差增大', '解出的 x 必须使 L₂>0 且不溢出'],
      derivation: [p.mode === 0 ? `(${f1(p1)}+2x)(${p.L1}+x)=${f1(p1)}·${p.L1}·${p.T2}/${p.T1} → x=${f2(x)} cm` : `(${f1(p1)}+2x+${p.dAdd})(${p.L1}−x)=${f1(p1)}·${p.L1} → x=${f2(x)} cm`],
      numeric: [`x=${f2(x)} cm`, `p₂=${f1(p1 + 2 * x + (p.mode === 1 ? p.dAdd : 0))} cmHg，L₂=${f2(p.mode === 0 ? p.L1 + x : p.L1 - x)} cm`],
      pitfalls: ['升温当等压（p 随液面差变）', '液面差只算一边的变化（应为 2x）', '压强用“高的一侧”还是“低的一侧”搞反', '二次方程取了负根'],
      similar: ['液封玻璃管', '双 U 形管', '水银气压计误差'],
      competition: ['U 形管振荡周期', '两种液体的 U 形管', '有加速度的连通器'],
    }
  },
}
