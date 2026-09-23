/**
 * B11 光学与振动波组 1（纯 2D）：玻璃砖/棱镜折射（模型55）· 波的多解（模型58）· 振动图像 + 波动图像（模型59）
 */
import { waveMultiSolution as waveMultiFn, firstCrestTime } from '../../../../physics/wave'
import type { MechSceneDef } from '../../../engine/mechScene'

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const D2R = Math.PI / 180, R2D = 180 / Math.PI
type V = [number, number]
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1]]
const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]]
const mul = (a: V, k: number): V => [a[0] * k, a[1] * k]
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1]
const len = (a: V) => Math.hypot(a[0], a[1])
const unit = (a: V): V => mul(a, 1 / len(a))
/** 矢量形式 Snell：d 入射方向，N 迎着入射光的法线（单位），eta=n₁/n₂；返回 {t, tir} */
function refract(d: V, N: V, eta: number): { t: V; tir: boolean; thetaI: number; thetaT: number } {
  const cosi = -dot(N, d)
  const k = 1 - eta * eta * (1 - cosi * cosi)
  const thetaI = Math.acos(Math.min(1, Math.max(-1, cosi))) * R2D
  if (k < 0) return { t: unit(sub(d, mul(N, 2 * dot(d, N)))), tir: true, thetaI, thetaT: NaN }
  const t = add(mul(d, eta), mul(N, eta * cosi - Math.sqrt(k)))
  return { t: unit(t), tir: false, thetaI, thetaT: Math.acos(Math.min(1, Math.sqrt(k))) * R2D }
}
/** 射线 (o, d) 与线段 ab 的交点参数 s>1e-6，返回 s 或 null */
function hitSeg(o: V, d: V, a: V, b: V): number | null {
  const e = sub(b, a), den = d[0] * e[1] - d[1] * e[0]
  if (Math.abs(den) < 1e-9) return null
  const ao = sub(a, o)
  const s = (ao[0] * e[1] - ao[1] * e[0]) / den, u = (ao[0] * d[1] - ao[1] * d[0]) / den
  return s > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6 ? s : null
}

/* ══════════ 模型 55：玻璃砖 / 棱镜折射 ══════════ */
interface Seg { a: V; b: V; color: string; width: number; name: string }
interface S55 { segs: Seg[]; L: number; drawn: number; cum: number[]; idx: number; notes: string[]; polys: V[][] }
const MODES55 = [{ value: 0, label: '平行玻璃砖（侧移）' }, { value: 1, label: '三棱镜（偏向角 / 全反射）' }, { value: 2, label: '半圆玻璃砖（临界角演示）' }]
function trace55(p: Record<string, number>): { segs: Seg[]; notes: string[]; polys: V[][] } {
  const n = p.n, th1 = p.th1 * D2R, segs: Seg[] = [], notes: string[] = [], polys: V[][] = []
  const push = (a: V, b: V, color: string, name: string, width = 2.5) => segs.push({ a, b, color, width, name })
  if (p.mode === 0) {
    const h = p.h, top: V[] = [[-4, 0], [4, 0]], bot: V[] = [[-4, -h], [4, -h]]
    polys.push([[-4, 0], [4, 0], [4, -h], [-4, -h]])
    const d0: V = [Math.sin(th1), -Math.cos(th1)], o: V = [-1.5, 0]
    push(sub(o, mul(d0, 2.6)), o, '#F5C542', 'Ⅰ 入射光（空气）')
    const r1 = refract(d0, [0, 1], 1 / n)
    notes.push(`上表面：sinθ₁=n·sinθ₂ → 折射角 θ₂=${f2(r1.thetaT)}°`)
    const s1 = hitSeg(o, r1.t, bot[0], bot[1])!
    const q = add(o, mul(r1.t, s1))
    push(o, q, '#ffb347', 'Ⅱ 折射光（玻璃内）')
    push(o, add(o, mul(unit(sub(d0, mul([0, 1], 2 * dot(d0, [0, 1])))), 1.4)), '#F5C54255', '反射（部分）', 1.5)
    const r2 = refract(r1.t, [0, 1], n)
    const shift = h * Math.sin(th1 - r1.thetaT * D2R) / Math.cos(r1.thetaT * D2R)
    notes.push(`下表面：出射角=入射角 θ₁=${f1(p.th1)}°，出射光与入射光平行，侧移 d=h·sin(θ₁−θ₂)/cosθ₂=${f2(shift)} m`)
    push(q, add(q, mul(r2.t, 2.6)), '#F5C542', 'Ⅲ 出射光（平行于入射光）')
    void top
  } else if (p.mode === 1) {
    const A = p.A * D2R, H = 4, W2 = H * Math.tan(A / 2)
    const apex: V = [0, H], bl: V = [-W2, 0], br: V = [W2, 0]
    polys.push([apex, br, bl])
    const nL = unit([-Math.cos(A / 2), Math.sin(A / 2)]), nR = unit([Math.cos(A / 2), Math.sin(A / 2)])
    const M1 = mul(add(apex, bl), 0.5)
    const inward = mul(nL, -1)
    const ca = Math.cos(th1), sa = Math.sin(th1)
    const tang: V = [-inward[1], inward[0]]
    // 入射角取在“底边一侧”（教材标准图：光近水平射入、向底边偏折），此时右面入射角 θ₃=A−θ₂
    const d0: V = unit(add(mul(inward, ca), mul(tang, sa)))
    push(sub(M1, mul(d0, 3)), M1, '#F5C542', 'Ⅰ 入射光（左面）')
    const r1 = refract(d0, nL, 1 / n)
    notes.push(`左面：折射角 θ₂=${f2(r1.thetaT)}°（sinθ₁=n·sinθ₂）`)
    let o: V = M1, d: V = r1.t, faceN: V[] = [nR, [0, -1]], faces: V[][] = [[apex, br], [bl, br]]
    let last = '', exitDir: V | null = null
    for (let k = 0; k < 3; k++) {
      let best: { s: number; i: number } | null = null
      faces.forEach((f, i) => { const s = hitSeg(o, d, f[0], f[1]); if (s !== null && (!best || s < best.s)) best = { s, i } })
      if (!best) break
      const b = best as { s: number; i: number }
      const q = add(o, mul(d, b.s))
      push(o, q, '#ffb347', k === 0 ? 'Ⅱ 棱镜内' : 'Ⅱ′ 全反射后')
      const r = refract(d, mul(faceN[b.i], -1), n)
      const faceName = b.i === 0 ? '右面' : '底面'
      if (r.tir) { notes.push(`${faceName}：入射角 ${f2(r.thetaI)}° ≥ 临界角 C=arcsin(1/n)=${f2(Math.asin(1 / n) * R2D)}° → 全反射`); o = q; d = r.t; faces = b.i === 0 ? [[bl, br], [apex, bl]] : [[apex, br], [apex, bl]]; faceN = b.i === 0 ? [[0, -1], nL] : [nR, nL]; last = 'tir'; continue }
      notes.push(`${faceName}：入射角 θ₃=${f2(r.thetaI)}°，出射角 θ₄=${f2(r.thetaT)}°（n·sinθ₃=sinθ₄）`)
      push(q, add(q, mul(r.t, 3)), '#F5C542', 'Ⅲ 出射光'); exitDir = r.t; last = 'out'; break
    }
    if (exitDir && last === 'out') { const delta = Math.acos(Math.min(1, dot(d0, exitDir))) * R2D; notes.push(`偏向角 δ=${f2(delta)}°（=θ₁+θ₄−A）`) }
  } else {
    const R = 3.2
    polys.push(Array.from({ length: 41 }, (_, i) => { const a = Math.PI + (i / 40) * Math.PI; return [R * Math.cos(a), R * Math.sin(a)] as V }))
    const d0: V = [Math.sin(th1), Math.cos(th1)]
    const o: V = mul(d0, -R)
    push(sub(o, mul(d0, 1.2)), o, '#F5C542', 'Ⅰ 入射（沿半径，不偏折）')
    push(o, [0, 0], '#ffb347', 'Ⅱ 玻璃内沿半径到圆心')
    const r = refract(d0, [0, -1], n)
    const Cc = Math.asin(1 / n) * R2D
    notes.push(`平面处入射角 θ₁=${f1(p.th1)}°，临界角 C=arcsin(1/n)=${f2(Cc)}°`)
    const refl = unit(sub(d0, mul([0, -1], 2 * dot(d0, [0, -1]))))
    if (r.tir) { notes.push('θ₁ ≥ C：全反射，无折射光'); push([0, 0], mul(refl, R), '#E05555', 'Ⅲ 全反射光') }
    else { notes.push(`折射角 θ₂=arcsin(n·sinθ₁)=${f2(r.thetaT)}°`); push([0, 0], mul(r.t, 2.6), '#F5C542', 'Ⅲ 折射光（空气）'); push([0, 0], mul(refl, R), '#ffb34766', '反射（部分）', 1.5) }
  }
  return { segs, notes, polys }
}
export const prismRefraction: MechSceneDef<S55> = {
  id: 'gk-prism-refraction',
  title: '玻璃砖 / 棱镜折射（折射定律 · 全反射 · 偏向角）',
  desc: '三种搭法：①平行玻璃砖——出射光与入射光平行、侧移 d；②三棱镜——两次折射的偏向角 δ=θ₁+θ₄−A，右面入射角超过临界角则全反射；③半圆玻璃砖——光沿半径射到圆心，改变入射角观察临界角 C=arcsin(1/n)。光线逐段生长，量角器读角。',
  formula: 'n=sinθ₁/sinθ₂　sinC=1/n　平行砖侧移 d=h·sin(θ₁−θ₂)/cosθ₂　棱镜 δ=θ₁+θ₄−A（θ₃=A−θ₂）',
  params: [
    { key: 'mode', label: '搭法', min: 0, max: 2, step: 1, default: 1, options: MODES55 },
    { key: 'n', label: '折射率 n', min: 1.3, max: 2.0, step: 0.05, default: 1.5 },
    { key: 'th1', label: '入射角 θ₁', min: 0, max: 85, step: 1, default: 40, unit: '°' },
    { key: 'A', label: '棱镜顶角 A', min: 30, max: 80, step: 5, default: 60, unit: '°' },
    { key: 'h', label: '玻璃砖厚度 h', min: 1, max: 4, step: 0.5, default: 2.5, unit: 'm' },
  ],
  h: 1 / 200,
  init(p, tl) {
    const tr = trace55(p)
    const cum: number[] = []; let L = 0
    for (const s of tr.segs) { L += len(sub(s.b, s.a)); cum.push(L) }
    tl.start(tr.segs[0].name, '#F5C542')
    return { segs: tr.segs, L, drawn: 0, cum, idx: 0, notes: tr.notes, polys: tr.polys }
  },
  step(s, _p, d, t, tl) {
    s.drawn += 3.5 * d
    while (s.idx < s.segs.length - 1 && s.drawn >= s.cum[s.idx]) {
      s.idx++
      const seg = s.segs[s.idx]
      if (!seg.name.startsWith('反射')) tl.switchTo(seg.name, seg.color.length > 7 ? '#8a8aa0' : seg.color === '#E05555' ? '#E05555' : seg.color === '#ffb347' ? '#ffb347' : '#F5C542', t, `t=${f2(t)}s ${seg.name}：${s.notes[Math.min(s.notes.length - 1, s.idx - 1)] ?? ''}`)
    }
    if (s.drawn >= s.L + 0.5) { tl.log(t, s.notes[s.notes.length - 1]); return false }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const PX = Math.min(w / 12, (h - 120) / 9), cx = w / 2, cy = p.mode === 0 ? h / 2 - 20 : p.mode === 1 ? h / 2 + 100 : h / 2 - 20
    const X = (v: V) => cx + v[0] * PX, Y = (v: V) => cy - v[1] * PX
    ctx.fillStyle = 'rgba(80,140,220,0.18)'; ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 1.5
    for (const poly of s.polys) { ctx.beginPath(); poly.forEach((v, i) => (i ? ctx.lineTo(X(v), Y(v)) : ctx.moveTo(X(v), Y(v)))); if (p.mode === 2) ctx.lineTo(X(poly[0]), Y(poly[0])); ctx.closePath(); ctx.fill(); ctx.stroke() }
    dc.label(`n=${p.n}`, cx, p.mode === 1 ? cy - 1.6 * PX : cy - (p.mode === 0 ? p.h / 2 : 1.2) * PX, '#9cc5ff', 12)
    // 法线（虚线）
    ctx.setLineDash([5, 5]); ctx.strokeStyle = '#565675'; ctx.lineWidth = 1
    for (const seg of s.segs.slice(0, 3)) { const a = seg.b; if (p.mode === 0) { ctx.beginPath(); ctx.moveTo(X(a), Y(a) - 60); ctx.lineTo(X(a), Y(a) + 60); ctx.stroke() } }
    if (p.mode === 2) { ctx.beginPath(); ctx.moveTo(cx, cy - 80); ctx.lineTo(cx, cy + 80); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx - 3.2 * PX, cy); ctx.lineTo(cx + 3.2 * PX, cy); ctx.stroke() }
    ctx.setLineDash([])
    // 光线逐段生长
    let remain = s.drawn
    for (const seg of s.segs) {
      const Ls = len(sub(seg.b, seg.a)); if (remain <= 0) break
      const frac = Math.min(1, remain / Ls); remain -= Ls
      const e = add(seg.a, mul(sub(seg.b, seg.a), frac))
      ctx.strokeStyle = seg.color; ctx.lineWidth = seg.width; ctx.beginPath(); ctx.moveTo(X(seg.a), Y(seg.a)); ctx.lineTo(X(e), Y(e)); ctx.stroke()
      if (frac >= 1 && seg.width > 2) { ctx.fillStyle = seg.color; ctx.beginPath(); ctx.arc(X(seg.b), Y(seg.b), 3, 0, Math.PI * 2); ctx.fill() }
    }
    // 量角器（入射点）
    const o = s.segs[0].b
    ctx.strokeStyle = '#3ecf8e55'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X(o), Y(o), 46, 0, Math.PI * 2); ctx.stroke()
    for (let a = 0; a < 360; a += 30) { const r0 = a % 90 === 0 ? 38 : 42; ctx.beginPath(); ctx.moveTo(X(o) + r0 * Math.cos(a * D2R), Y(o) - r0 * Math.sin(a * D2R)); ctx.lineTo(X(o) + 46 * Math.cos(a * D2R), Y(o) - 46 * Math.sin(a * D2R)); ctx.stroke() }
    dc.label(`θ₁=${p.th1}°`, X(o) + 58, Y(o) - 30, '#F5C542', 11)
    s.notes.slice(0, Math.max(1, Math.min(s.notes.length, s.idx + 1))).forEach((nt, i) => dc.label(nt, w / 2, h - 70 - (Math.min(s.notes.length, s.idx + 1) - 1 - i) * 16, i === s.idx ? '#F5C542' : '#8a8aa0', 11))
  },
  readout(p) {
    const n = p.n, th1 = p.th1
    const th2 = Math.asin(Math.sin(th1 * D2R) / n) * R2D
    const Cc = Math.asin(1 / n) * R2D
    if (p.mode === 0) return `θ₂=arcsin(sinθ₁/n)=${f2(th2)}°　侧移 d=h·sin(θ₁−θ₂)/cosθ₂=${f2(p.h * Math.sin((th1 - th2) * D2R) / Math.cos(th2 * D2R))} m\n出射光与入射光平行（两次折射角互为反函数）`
    if (p.mode === 1) { const th3 = p.A - th2, s4 = n * Math.sin(th3 * D2R); return `左面 θ₂=${f2(th2)}°　右面入射角 θ₃=A−θ₂=${f2(th3)}°（C=${f2(Cc)}°）\n${s4 >= 1 ? '右面全反射（n·sinθ₃≥1）' : `出射角 θ₄=arcsin(n·sinθ₃)=${f2(Math.asin(s4) * R2D)}°，偏向角 δ=θ₁+θ₄−A=${f2(th1 + Math.asin(s4) * R2D - p.A)}°`}` }
    return `临界角 C=arcsin(1/n)=${f2(Cc)}°　当前 θ₁=${th1}° → ${th1 >= Cc ? '全反射' : `折射角 θ₂=arcsin(n·sinθ₁)=${f2(Math.asin(n * Math.sin(th1 * D2R)) * R2D)}°`}`
  },
  solution(p) {
    const n = p.n, th2 = Math.asin(Math.sin(p.th1 * D2R) / n) * R2D, Cc = Math.asin(1 / n) * R2D
    const th3 = p.A - th2, s4 = n * Math.sin(th3 * D2R)
    return {
      problemType: `${MODES55[p.mode].label}：用折射定律与全反射条件求角度 / 侧移 / 偏向角`,
      hints: ['先在每个界面画法线，角都从法线量', '光疏→光密：折射角小于入射角；光密→光疏：先判断是否超过临界角', '平行砖两次折射“互逆”，所以出射平行入射', '棱镜内第二次入射角 θ₃=A−θ₂（几何：四边形内角和）'],
      processes: ['过程一：第一界面折射（空气→玻璃）', '过程二：玻璃内直线传播到第二界面', '过程三：第二界面折射出射，或全反射后再到下一界面'],
      forces: ['几何光学不涉及受力；关键是各界面的法线与角度关系'],
      laws: ['折射定律 n=sinθ₁/sinθ₂（n 为玻璃对空气的折射率）', '光路可逆', '全反射条件：光密→光疏且 θ ≥ C=arcsin(1/n)'],
      critical: [`临界角 C=${f2(Cc)}°`, p.mode === 1 ? `棱镜右面：θ₃=${f2(th3)}°，${s4 >= 1 ? '≥C 全反射' : '<C 可出射'}` : p.mode === 2 ? `半圆砖：θ₁ ${p.th1 >= Cc ? '≥' : '<'} C` : '平行砖不会在下表面全反射（θ₂<C 恒成立）', '偏向角在“最小偏向角”时光路对称（θ₁=θ₄）'],
      derivation: ['sinθ₁=n·sinθ₂ → θ₂', p.mode === 0 ? 'd=h·sin(θ₁−θ₂)/cosθ₂' : p.mode === 1 ? 'θ₃=A−θ₂；n·sinθ₃=sinθ₄；δ=(θ₁−θ₂)+(θ₄−θ₃)=θ₁+θ₄−A' : 'sinC=1/n；θ₁<C：sinθ₂=n·sinθ₁'],
      numeric: [`θ₂=${f2(th2)}°`, p.mode === 1 ? (s4 >= 1 ? '右面全反射' : `θ₄=${f2(Math.asin(s4) * R2D)}°，δ=${f2(p.th1 + Math.asin(s4) * R2D - p.A)}°`) : p.mode === 0 ? `d=${f2(p.h * Math.sin((p.th1 - th2) * D2R) / Math.cos(th2 * D2R))} m` : `C=${f2(Cc)}°`],
      pitfalls: ['角从界面量而不是从法线量', '光密→光疏忘记判断全反射', '棱镜第二次入射角误写成 θ₂', '折射率写反（n=sin折射角/sin入射角）'],
      similar: ['光导纤维（全反射）', '水下看物体的视深', '彩虹的色散'],
      competition: ['最小偏向角法测折射率 n=sin((A+δ_min)/2)/sin(A/2)', '色散：n(λ) 不同导致偏向角不同', '费马原理推导折射定律'],
    }
  },
}

/* ══════════ 模型 58：波的多解 ══════════ */
interface S58 { t: number; matched: boolean }
export const waveMultiSolution: MechSceneDef<S58> = {
  id: 'gk-wave-multi-solution',
  title: '波的多解（传播方向不定 · 平移 nλ+Δx₀）',
  desc: '实线是 t₁ 时刻的波形，虚线是 t₂=t₁+Δt 时刻的波形。仅凭两张图无法确定方向与平移了几个整波长：向 +x 平移 Δx=nλ+Δx₀，向 −x 平移 Δx=nλ+(λ−Δx₀)，n=0,1,2…。选定方向与 n 后播放，波以对应速度 v=Δx/Δt 传播，到 t=Δt 时应恰好与虚线重合。',
  formula: '+x：Δx=nλ+Δx₀　−x：Δx=nλ+(λ−Δx₀)　v=Δx/Δt　T=λ/v　n=0,1,2,…',
  params: [
    { key: 'lam', label: '波长 λ', min: 2, max: 8, step: 0.5, default: 4, unit: 'm' },
    { key: 'frac', label: '虚线相对实线的最小右移 Δx₀/λ', min: 0.1, max: 0.9, step: 0.05, default: 0.25 },
    { key: 'dt', label: '两时刻间隔 Δt', min: 0.5, max: 3, step: 0.25, default: 1, unit: 's' },
    { key: 'dir', label: '假设的传播方向', min: -1, max: 1, step: 2, default: 1, options: [{ value: 1, label: '向 +x 传播' }, { value: -1, label: '向 −x 传播' }] },
    { key: 'n', label: '假设平移的整波长数 n', min: 0, max: 3, step: 1, default: 1 },
    { key: 'A', label: '振幅 A', min: 0.5, max: 2, step: 0.25, default: 1, unit: 'm' },
  ],
  h: 1 / 200,
  init(p, tl) { tl.start(`假设：向 ${p.dir > 0 ? '+x' : '−x'}，n=${p.n}`, '#F5C542'); return { t: 0, matched: false } },
  step(s, p, d, t, tl) {
    s.t = t
    const dx0 = p.frac * p.lam
    const dx = waveMultiFn(p.lam, dx0, p.dt, p.dir > 0 ? 1 : -1, p.n).dx  // 共享物理源（P3 批4 收编）
    const v = dx / p.dt
    if (!s.matched && t >= p.dt) { s.matched = true; tl.switchTo('t=Δt：与虚线重合 ✓', '#3ecf8e', t, `t=Δt=${p.dt}s 波形与虚线重合：Δx=${f2(dx)} m，v=${f2(v)} m/s（n=${p.n}，${p.dir > 0 ? '+x' : '−x'}），T=λ/v=${f2(p.lam / v)} s`) }
    return t < p.dt * 1.6
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const x0 = 60, x1 = w - 30, y0 = h / 2 - 40, xMax = 3 * p.lam, PX = (x1 - x0) / xMax, PY = 70 / p.A
    const dx0 = p.frac * p.lam
    const dx = waveMultiFn(p.lam, dx0, p.dt, p.dir > 0 ? 1 : -1, p.n).dx  // 共享物理源（P3 批4 收编）
    const v = dx / p.dt
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.moveTo(x0, y0 - 90); ctx.lineTo(x0, y0 + 90); ctx.stroke()
    for (let x = 0; x <= xMax + 1e-9; x += p.lam / 2) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(x0 + x * PX, y0 - 3, 1, 6); dc.label(f1(x), x0 + x * PX, y0 + 14, '#565675', 9) }
    dc.label('x/m', x1 - 10, y0 + 28, '#8a8aa0', 10); dc.label('y', x0 - 14, y0 - 90, '#8a8aa0', 10)
    const wave = (shift: number, color: string, dash: number[], width = 2) => {
      ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath()
      for (let i = 0; i <= 300; i++) { const x = (i / 300) * xMax; const y = p.A * Math.sin((2 * Math.PI * (x - shift)) / p.lam); i ? ctx.lineTo(x0 + x * PX, y0 - y * PY) : ctx.moveTo(x0 + x * PX, y0 - y * PY) }
      ctx.stroke(); ctx.setLineDash([])
    }
    wave(0, '#8a8aa066', [], 1.5)
    wave(dx0, '#4A90D9', [6, 5], 2)
    const shiftNow = p.dir * v * Math.min(s.t, p.dt)
    wave(shiftNow, s.matched ? '#3ecf8e' : '#F5C542', [], 2.5)
    dc.arrow(x0 + 0.3 * p.lam * PX, y0 - 100, p.dir * 50, 0, '#F5C542', `v=${f2(v)} m/s`)
    dc.label(`实线：t₁ 波形　虚线：t₂=t₁+Δt 波形（右移 Δx₀=${f2(dx0)} m 或左移 ${f2(p.lam - dx0)} m）`, w / 2, 26, '#8a8aa0', 11)
    dc.label(`当前假设：向 ${p.dir > 0 ? '+x' : '−x'}，n=${p.n} → Δx=${f2(dx)} m，v=${f2(v)} m/s　t=${f2(s.t)} s`, w / 2, 44, '#F5C542', 12)
    // 解集表
    let ty = h - 110
    dc.label('全部解（n=0,1,2,3）：', 140, ty, '#8a8aa0', 11); ty += 15
    for (let n = 0; n <= 3; n++) {
      const dxp = n * p.lam + dx0, dxm = n * p.lam + (p.lam - dx0)
      dc.label(`n=${n}：+x  Δx=${f2(dxp)} m，v=${f2(dxp / p.dt)} m/s　｜　−x  Δx=${f2(dxm)} m，v=${f2(dxm / p.dt)} m/s`, w / 2, ty, n === p.n ? '#F5C542' : '#6c6c85', 10); ty += 14
    }
  },
  readout(p) {
    const dx0 = p.frac * p.lam
    return `通式：+x  v=(nλ+Δx₀)/Δt=(${p.n}×${p.lam}+${f2(dx0)})/${p.dt}=${f2((p.n * p.lam + dx0) / p.dt)} m/s
　　　−x  v=(nλ+λ−Δx₀)/Δt=${f2((p.n * p.lam + p.lam - dx0) / p.dt)} m/s
若题目给出 Δt<T（或 v 的范围），可唯一确定 n 与方向`
  },
  solution(p) {
    const dx0 = p.frac * p.lam
    return {
      problemType: '波的多解：由两时刻波形图求波速 / 周期（方向与整波长数不定）',
      hints: ['波形平移 nλ 后与自身重合——这是多解的根源', '先看两图差多少（Δx₀），再分“向左/向右”两种写通式', '题目里的限制条件（Δt<T、v 范围、某质点运动方向）用来筛掉多余解', '周期 T 的多解形式：Δt=nT+t₀'],
      processes: ['过程一：读出两波形间的最小平移 Δx₀', '过程二：按方向写 Δx=nλ+Δx₀ 或 nλ+(λ−Δx₀)', '过程三：v=Δx/Δt，T=λ/v；用附加条件定 n'],
      forces: ['波动为运动学问题，不涉及受力'],
      laws: ['v=λ/T=λf', '波形平移的周期性：平移 nλ 图像不变', '质点振动方向与传播方向的“同侧法/上下坡法”'],
      critical: ['Δt<T 时 n 只能取 0', '给了某质点此刻的运动方向，可定传播方向', '若 Δx₀=λ/2 则左右对称，仍有两解'],
      derivation: ['+x：Δx=nλ+Δx₀', '−x：Δx=nλ+(λ−Δx₀)', 'v=Δx/Δt，T=λ/v'],
      numeric: [`Δx₀=${f2(dx0)} m，λ=${p.lam} m，Δt=${p.dt} s`, `+x：v=${f2((dx0) / p.dt)}, ${f2((p.lam + dx0) / p.dt)}, ${f2((2 * p.lam + dx0) / p.dt)}… m/s`, `−x：v=${f2((p.lam - dx0) / p.dt)}, ${f2((2 * p.lam - dx0) / p.dt)}, …  m/s`],
      pitfalls: ['只写一个方向的解', '把 Δx₀ 与 λ−Δx₀ 搞混', '忘记 n 从 0 开始', 'Δt 与 T 的多解形式混用'],
      similar: ['由振动图像与波动图像联合求速', '两质点相位关系求波长多解', '波在反射后的叠加'],
      competition: ['多普勒效应下的频率多解', '色散介质中相速度与群速度', '驻波节点的周期性'],
    }
  },
}

/* ══════════ 模型 59：振动图像 + 波动图像 ══════════ */
interface S59 { t: number; hist: number[][]; crestT: number | null; dir0: string }
export const vibrationWaveGraphs: MechSceneDef<S59> = {
  id: 'gk-vibration-wave-graphs',
  title: '振动图像 + 波动图像（y–x 与 y–t 同步生长）',
  desc: '左：波动图像 y–x（某时刻所有质点的位移，随时间整体平移）；右：质点 P 的振动图像 y–t（一个质点随时间的位移，随时间向右延伸）。同侧法判断 P 此刻的运动方向；波速 v=λ/T。',
  formula: 'y(x,t)=A·sin[2π(t/T ∓ x/λ)]（∓：向 +x/−x）　v=λ/T　同侧法：波形上 P 点与传播方向同侧 → 向下运动',
  params: [
    { key: 'A', label: '振幅 A', min: 0.5, max: 2, step: 0.25, default: 1, unit: 'm' },
    { key: 'lam', label: '波长 λ', min: 2, max: 8, step: 0.5, default: 4, unit: 'm' },
    { key: 'T', label: '周期 T', min: 1, max: 4, step: 0.25, default: 2, unit: 's' },
    { key: 'dir', label: '传播方向', min: -1, max: 1, step: 2, default: 1, options: [{ value: 1, label: '向 +x' }, { value: -1, label: '向 −x' }] },
    { key: 'xP', label: '质点 P 的位置 x_P', min: 0, max: 8, step: 0.25, default: 1, unit: 'm' },
  ],
  h: 1 / 200,
  init(p, tl) {
    const yP = (t: number) => p.A * Math.sin(2 * Math.PI * (t / p.T - (p.dir * p.xP) / p.lam))
    const dir0 = yP(1e-3) > yP(0) ? '向上（+y）' : '向下（−y）'
    tl.start('波传播，P 振动', '#F5C542')
    tl.log(0, `t=0：P 位于 y=${f2(yP(0))} m，同侧法判断 P 正在${dir0}`)
    return { t: 0, hist: [[0, yP(0)]], crestT: null, dir0 }
  },
  step(s, p, d, t, tl) {
    s.t = t
    const y = p.A * Math.sin(2 * Math.PI * (t / p.T - (p.dir * p.xP) / p.lam))
    const last = s.hist[s.hist.length - 1]
    if (t - last[0] >= 0.02) s.hist.push([t, y])
    if (s.crestT === null && y >= p.A * 0.9995 && t > 0.01) { s.crestT = t; tl.switchTo('P 到达波峰', '#3ecf8e', t, `P 点首次到达波峰 t=${f2(t)} s（理论 T·(1/4 ${p.dir > 0 ? '+' : '−'} x_P/λ) 的最小正值）；波速 v=λ/T=${f2(p.lam / p.T)} m/s`) }
    if (t >= 2 * p.T) { tl.log(t, `两个周期结束：波前进 2λ=${f2(2 * p.lam)} m，P 振动 2 次`); return false }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const gw = (w - 100) / 2, xL0 = 50, xR0 = xL0 + gw + 40, y0 = h / 2 - 30, PY = 60 / p.A
    const xMax = 2 * p.lam, PX = (gw - 20) / xMax
    // 左：y–x
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xL0, y0); ctx.lineTo(xL0 + gw, y0); ctx.moveTo(xL0, y0 - 80); ctx.lineTo(xL0, y0 + 80); ctx.stroke()
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2.5; ctx.beginPath()
    for (let i = 0; i <= 240; i++) { const x = (i / 240) * xMax; const y = p.A * Math.sin(2 * Math.PI * (s.t / p.T - (p.dir * x) / p.lam)); i ? ctx.lineTo(xL0 + x * PX, y0 - y * PY) : ctx.moveTo(xL0 + x * PX, y0 - y * PY) }
    ctx.stroke()
    for (let x = 0; x <= xMax + 1e-9; x += p.lam / 2) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(xL0 + x * PX, y0 - 3, 1, 6); dc.label(f1(x), xL0 + x * PX, y0 + 14, '#565675', 9) }
    const yP = p.A * Math.sin(2 * Math.PI * (s.t / p.T - (p.dir * p.xP) / p.lam))
    ctx.fillStyle = '#E05555'; ctx.beginPath(); ctx.arc(xL0 + p.xP * PX, y0 - yP * PY, 6, 0, Math.PI * 2); ctx.fill()
    dc.label('P', xL0 + p.xP * PX, y0 - yP * PY - 14, '#E05555', 12)
    const vy = Math.cos(2 * Math.PI * (s.t / p.T - (p.dir * p.xP) / p.lam))
    dc.arrow(xL0 + p.xP * PX + 14, y0 - yP * PY, 0, -vy * 24, '#E05555')
    dc.arrow(xL0 + gw - 70, y0 - 100, p.dir * 40, 0, '#F5C542', `v=λ/T=${f2(p.lam / p.T)} m/s`)
    dc.label(`波动图像 y–x（t=${f2(s.t)} s 的“照片”）`, xL0 + gw / 2, 30, '#F5C542', 12)
    dc.label('x/m', xL0 + gw, y0 + 28, '#8a8aa0', 10)
    // 右：P 的 y–t
    const tMax = 2 * p.T, PT = (gw - 20) / tMax
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(xR0, y0); ctx.lineTo(xR0 + gw, y0); ctx.moveTo(xR0, y0 - 80); ctx.lineTo(xR0, y0 + 80); ctx.stroke()
    for (let t = 0; t <= tMax + 1e-9; t += p.T / 2) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(xR0 + t * PT, y0 - 3, 1, 6); dc.label(f1(t), xR0 + t * PT, y0 + 14, '#565675', 9) }
    ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2.5; ctx.beginPath()
    s.hist.forEach(([t, y], i) => (i ? ctx.lineTo(xR0 + t * PT, y0 - y * PY) : ctx.moveTo(xR0 + t * PT, y0 - y * PY)))
    ctx.stroke()
    ctx.fillStyle = '#E05555'; ctx.beginPath(); ctx.arc(xR0 + s.t * PT, y0 - yP * PY, 5, 0, Math.PI * 2); ctx.fill()
    dc.label(`质点 P 的振动图像 y–t（“录像”）`, xR0 + gw / 2, 30, '#E05555', 12)
    dc.label('t/s', xR0 + gw, y0 + 28, '#8a8aa0', 10)
    dc.label(`同侧法：t=0 时 P 在${p.dir > 0 ? '波形' : '波形'}上，传播向 ${p.dir > 0 ? '+x' : '−x'} → P 正在${s.dir0}`, w / 2, h - 70, '#8a8aa0', 11)
  },
  readout(p, s) {
    const v = p.lam / p.T
    const tCrest = firstCrestTime(p.xP, p.lam, p.T, p.dir > 0 ? 1 : -1)  // 共享物理源（P3 批4 收编）
    return `v=λ/T=${f2(v)} m/s　f=1/T=${f2(1 / p.T)} Hz
P 点：y_P(t)=A·sin[2π(t/T ${p.dir > 0 ? '−' : '+'} x_P/λ)]，首次到波峰 t=${f2(tCrest)} s${s ? `\n当前 t=${f2(s.t)} s，y_P=${f2(p.A * Math.sin(2 * Math.PI * (s.t / p.T - (p.dir * p.xP) / p.lam)))} m` : ''}`
  },
  solution(p) {
    const v = p.lam / p.T
    return {
      problemType: '振动图像与波动图像的区分与联合：由 y–x 与 y–t 求 λ、T、v 及质点运动方向',
      hints: ['y–x 图横轴是位置：读波长；y–t 图横轴是时间：读周期', '判断质点此刻运动方向用同侧法：沿传播方向看，波形与质点“同侧”则质点向下', 'P 的振动图像就是把 P 的位移随时间记录下来', 'v=λ/T 把两张图联系起来'],
      processes: ['从 y–x 读 A、λ；从 y–t 读 A、T', '判断传播方向或质点运动方向（二者互推）', '写出 P 的振动方程 y=A·sin(2πt/T+φ)'],
      forces: ['简谐波中各质点做简谐运动（回复力 F=−kx），此处只讨论运动学'],
      laws: ['v=λ/T', 'y(x,t)=A·sin[2π(t/T ∓ x/λ)]', '同侧法 / 上下坡法（沿传播方向：上坡下、下坡上）'],
      critical: ['波峰/波谷处质点速度为零、加速度最大', '平衡位置处速度最大', 'x 相差 λ/2 的两质点振动反相'],
      derivation: ['λ=读图，T=读图 → v=λ/T', 'P 的初相由 t=0 时 P 的位置与运动方向决定', '首次到波峰时刻：2π(t/T ∓ x_P/λ)=π/2'],
      numeric: [`λ=${p.lam} m，T=${p.T} s → v=${f2(v)} m/s`, `P（x=${p.xP} m）t=0 时 y=${f2(p.A * Math.sin(-2 * Math.PI * (p.dir * p.xP) / p.lam))} m`],
      pitfalls: ['把 y–t 当 y–x 读“波长”', '同侧法用错方向', '以为质点随波迁移（质点只在平衡位置附近振动）', '忘记 x 相差 λ 的质点振动完全相同'],
      similar: ['已知两质点振动图像求波速多解', '波形图 + 某质点振动方向判断传播方向', '机械波干涉中质点振动'],
      competition: ['波动方程的一般解 f(x∓vt)', '色散与群速度', '多普勒效应中的相位'],
    }
  },
}
