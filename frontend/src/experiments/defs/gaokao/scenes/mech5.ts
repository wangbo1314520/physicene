/**
 * B11 力学场景组 5：斜抛运动（模型26）· 超重失重（模型24）
 */
import type { MechSceneDef } from '../../../engine/mechScene'
import { ground, block, ball } from './draw'

const G = 9.8
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const D2R = Math.PI / 180

/* ══════════ 模型 26：斜抛运动 ══════════ */
interface Proj { x: number; y: number; vx: number; vy: number; trail: number[][]; peak: boolean; landed: boolean; th: number }
interface S26 { ps: Proj[]; done: boolean }
function th26(v0: number, th: number, h0: number) {
  const vy = v0 * Math.sin(th * D2R), vx = v0 * Math.cos(th * D2R)
  const T = (vy + Math.sqrt(vy * vy + 2 * G * h0)) / G
  return { vx, vy, T, R: vx * T, H: h0 + (vy * vy) / (2 * G), tUp: vy / G }
}
export const obliqueProjectile: MechSceneDef<S26> = {
  id: 'gk-oblique-projectile',
  title: '斜抛运动（分解 · 最高点 · 射程 · 余角对称）',
  desc: '以 v₀、仰角 θ 抛出（可从高度 h₀）：水平匀速 v₀cosθ，竖直上抛 v₀sinθ。最高点 vᵧ=0、H=v₀²sin²θ/2g；h₀=0 时射程 R=v₀²sin2θ/g，θ 与 90°−θ 射程相同、45° 最远。可叠加余角对照抛体。',
  formula: 'x=v₀cosθ·t　y=h₀+v₀sinθ·t−½gt²　t_上=v₀sinθ/g　H=h₀+v₀²sin²θ/2g　R=v₀²sin2θ/g（h₀=0）',
  params: [
    { key: 'v0', label: '初速度 v₀', min: 5, max: 20, step: 0.5, default: 10, unit: 'm/s' },
    { key: 'th', label: '仰角 θ', min: 10, max: 80, step: 1, default: 30, unit: '°' },
    { key: 'h0', label: '抛出高度 h₀', min: 0, max: 5, step: 0.5, default: 0, unit: 'm' },
    { key: 'cmp', label: '对照抛体', min: 0, max: 1, step: 1, default: 1, options: [{ value: 0, label: '无' }, { value: 1, label: '余角 90°−θ（同 v₀）' }] },
  ],
  init(p, tl) {
    tl.start('① 上升段（vᵧ 减小）', '#F5C542')
    const mk = (th: number): Proj => ({ x: 0, y: p.h0, vx: p.v0 * Math.cos(th * D2R), vy: p.v0 * Math.sin(th * D2R), trail: [[0, p.h0]], peak: false, landed: false, th })
    const ps = [mk(p.th)]; if (p.cmp) ps.push(mk(90 - p.th))
    return { ps, done: false }
  },
  step(s, p, d, t, tl) {
    for (const q of s.ps) {
      if (q.landed) continue
      const vyPrev = q.vy
      q.vy -= G * d; q.x += q.vx * d; q.y += ((vyPrev + q.vy) / 2) * d
      if (q.trail.length === 0 || t - (q.trail.length * 0.02) >= 0) q.trail.push([q.x, q.y])
      if (!q.peak && vyPrev > 0 && q.vy <= 0) { q.peak = true; const th = th26(p.v0, q.th, p.h0); if (q === s.ps[0]) tl.switchTo('② 下降段（vᵧ 反向增大）', '#3ecf8e', t, `t=${f2(t)}s θ=${q.th}° 到最高点：H=${f2(q.y)} m（理论 ${f2(th.H)}），vₓ=${f2(q.vx)} 不变`) ; else tl.log(t, `对照 θ′=${q.th}° 到最高点 H′=${f2(q.y)} m`) }
      if (q.y <= 0 && q.vy < 0) { q.landed = true; q.y = 0; const th = th26(p.v0, q.th, p.h0); tl.log(t, `${q === s.ps[0] ? '' : '对照 '}θ=${q.th}° 落地：x=${f2(q.x)} m（理论 ${f2(th.R)}），t=${f2(t)} s（理论 ${f2(th.T)}）`) }
    }
    if (s.ps.every((q) => q.landed)) { if (s.ps.length > 1 && p.h0 === 0) tl.log(t, `θ 与 90°−θ 射程相同（sin2θ 相等），θ 大的飞得高、时间长`); return false }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const th = th26(p.v0, p.th, p.h0), th2 = th26(p.v0, 90 - p.th, p.h0)
    const Rmax = Math.max(th.R, p.cmp ? th2.R : 0, 1), Hmax = Math.max(th.H, p.cmp ? th2.H : 0, 1)
    const gy = h - 80, PX = Math.min((w - 90) / (Rmax * 1.08), (gy - 70) / (Hmax * 1.1))
    ground(ctx, gy, 20, w - 20, '', dc.label)
    const X = (x: number) => 40 + x * PX, Y = (y: number) => gy - y * PX
    for (let x = 0; x <= Rmax * 1.05; x += Rmax > 20 ? 5 : 2) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(X(x), gy, 1, 6); dc.label(`${x}`, X(x), gy + 16, '#565675', 9) }
    if (p.h0 > 0) block(ctx, 22, gy, 18, p.h0 * PX, '#3a3a5e')
    s.ps.forEach((q, i) => {
      const color = i === 0 ? '#F5C542' : '#4A90D9'
      ctx.strokeStyle = color + '99'; ctx.lineWidth = 1.5; ctx.beginPath(); q.trail.forEach(([x, y], k) => (k ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y)))); ctx.stroke()
      ball(ctx, X(q.x), Y(q.y), 7, color)
      if (!q.landed) { dc.arrow(X(q.x), Y(q.y), q.vx * 5, 0, '#3ecf8e', i === 0 ? `vₓ=${f2(q.vx)}` : undefined); dc.arrow(X(q.x), Y(q.y), 0, -q.vy * 5, '#E05555', i === 0 ? `vᵧ=${f2(q.vy)}` : undefined) }
      const tq = th26(p.v0, q.th, p.h0)
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(X(tq.vx * tq.tUp), Y(tq.H), 3, 0, Math.PI * 2); ctx.fill()
      dc.label(`θ=${q.th}°`, X(q.x) + 16, Y(q.y) - 14, color, 10)
    })
    dc.label(`理论：T=${f2(th.T)} s，H=${f2(th.H)} m，R=${f2(th.R)} m${p.cmp && p.h0 === 0 ? `　｜　余角 ${90 - p.th}°：R′=${f2(th2.R)} m（相同）` : ''}`, w / 2, 96, '#8a8aa0', 11)
  },
  energy(s, p) {
    const q = s.ps[0], Ek = 0.5 * (q.vx ** 2 + q.vy ** 2), Ep = G * q.y
    return { items: [{ name: '动能', value: Ek, color: '#F5C542' }, { name: '重力势能', value: Ep, color: '#4A90D9' }, { name: '机械能', value: Ek + Ep, color: '#3ecf8e' }], E0: 0.5 * p.v0 ** 2 + G * p.h0, momentum: `m=1kg　vₓ 恒定 ${f2(q.vx)} m/s，机械能守恒` }
  },
  readout(p, s) {
    const th = th26(p.v0, p.th, p.h0)
    return `vₓ=v₀cosθ=${f2(th.vx)}，vᵧ₀=v₀sinθ=${f2(th.vy)} m/s
上升 t=${f2(th.tUp)} s，最高点 H=${f2(th.H)} m；落地 T=${f2(th.T)} s，射程 R=${f2(th.R)} m${p.h0 === 0 ? `（45° 时最大 v₀²/g=${f2(p.v0 ** 2 / G)}）` : ''}${s ? `\n当前 x=${f2(s.ps[0].x)}，y=${f2(s.ps[0].y)}，v=${f2(Math.hypot(s.ps[0].vx, s.ps[0].vy))} m/s` : ''}`
  },
  solution(p) {
    const th = th26(p.v0, p.th, p.h0)
    return {
      problemType: '斜抛运动：分解为水平匀速与竖直上抛，求最高点、飞行时间与射程',
      hints: ['水平方向不受力 → 匀速；竖直方向只受重力 → 匀变速', '最高点的特征是 vᵧ=0，而不是速度为零', '总时间由竖直方向决定，射程由水平速度 × 总时间', 'h₀=0 时 R=v₀²sin2θ/g，sin2θ 决定了 θ 与 90°−θ 等射程'],
      processes: ['过程一：上升段，vᵧ 从 v₀sinθ 减到 0', '过程二：下降段，vᵧ 反向增大直到落地'],
      forces: ['全程只受重力 mg（忽略空气阻力）', '水平方向合力为零'],
      laws: ['x=v₀cosθ·t', 'y=h₀+v₀sinθ·t−½gt²', '机械能守恒（速度大小只与高度有关）'],
      critical: ['最高点 vᵧ=0：t=v₀sinθ/g', '落地 y=0 解二次方程取正根', '射程最大：h₀=0 时 θ=45°；h₀>0 时最佳角略小于 45°'],
      derivation: ['t_上=v₀sinθ/g，H=h₀+(v₀sinθ)²/2g', 'h₀=0：T=2v₀sinθ/g，R=v₀cosθ·T=v₀²sin2θ/g', 'h₀≠0：T=[v₀sinθ+√(v₀²sin²θ+2gh₀)]/g'],
      numeric: [`vₓ=${f2(th.vx)}，vᵧ₀=${f2(th.vy)} m/s`, `H=${f2(th.H)} m，T=${f2(th.T)} s，R=${f2(th.R)} m`, p.h0 === 0 ? `余角 ${90 - p.th}° 射程相同` : `h₀=${p.h0} m 时落地速度 ${f2(Math.sqrt(p.v0 ** 2 + 2 * G * p.h0))} m/s`],
      pitfalls: ['最高点速度写成 0', '射程用 v₀ 而非 v₀cosθ 乘时间', '有抛出高度时仍用 R=v₀²sin2θ/g', '认为落地速度方向与抛出对称（仅 h₀=0 时对称）'],
      similar: ['平抛（θ=0）', '斜面上的斜抛（沿斜面/垂直斜面分解）', '投篮 / 铅球最佳角'],
      competition: ['有空气阻力的抛体（数值解）', '包络抛物线（安全抛物线）', '旋转参考系中的抛体'],
    }
  },
}

/* ══════════ 模型 24：超重失重 ══════════ */
interface S24 { y: number; v: number; ph: number; N: number; hist: number[][]; done: boolean }
const MODES24 = [{ value: 0, label: '电梯上升：加速 → 匀速 → 减速' }, { value: 1, label: '电梯下降：加速 → 匀速 → 减速' }, { value: 2, label: '缆绳断裂：完全失重（自由下落）' }]
export const weightChange: MechSceneDef<S24> = {
  id: 'gk-weight-change',
  title: '超重与失重（电梯 · 体重计读数 · N–t 图）',
  desc: '人站在电梯内体重计上。加速度向上（加速上升 / 减速下降）→ N=m(g+a)>mg 超重；加速度向下 → N=m(g−a)<mg 失重；a=g 完全失重 N=0。匀速时 N=mg。右侧实时画出 N–t 图。',
  formula: 'N−mg=ma（取向上为正）　a↑：N=m(g+a) 超重　a↓：N=m(g−a) 失重　a=g：N=0 完全失重　重力 mg 始终不变',
  params: [
    { key: 'mode', label: '过程', min: 0, max: 2, step: 1, default: 0, options: MODES24 },
    { key: 'm', label: '人的质量 m', min: 40, max: 100, step: 5, default: 60, unit: 'kg' },
    { key: 'a', label: '加速度大小 a', min: 0.5, max: 4, step: 0.5, default: 2, unit: 'm/s²' },
  ],
  h: 1 / 200,
  init(p, tl) {
    const names = ['① 加速上升（a 向上 → 超重）', '① 加速下降（a 向下 → 失重）', '① 自由下落（a=g → 完全失重）']
    tl.start(names[p.mode], p.mode === 0 ? '#E05555' : '#4A90D9')
    const N0 = p.mode === 0 ? p.m * (G + p.a) : p.mode === 1 ? p.m * (G - p.a) : 0
    tl.log(0, p.mode === 0 ? `加速上升：a=${p.a} m/s² 向上 → N=m(g+a)=${f1(N0)} N > mg=${f1(p.m * G)} N（超重）` : p.mode === 1 ? `加速下降：a=${p.a} m/s² 向下 → N=m(g−a)=${f1(N0)} N < mg=${f1(p.m * G)} N（失重）` : `缆绳断裂：a=g 向下 → N=0（完全失重），但重力仍是 mg=${f1(p.m * G)} N`)
    return { y: p.mode === 1 ? 12 : 0, v: 0, ph: 0, N: N0, hist: [[0, N0]], done: false }
  },
  step(s, p, d, t, tl) {
    const T1 = 2, T2 = 2
    let acc = 0
    if (p.mode === 2) { acc = -G; if (t > 1.3) { tl.log(t, `自由下落 ${f2(t)} s：v=${f2(-s.v)} m/s，全程 N=0`); return false } }
    else {
      const sgn = p.mode === 0 ? 1 : -1
      if (t < T1) acc = sgn * p.a
      else if (t < T1 + T2) { acc = 0; if (s.ph === 0) { s.ph = 1; tl.switchTo('② 匀速（N=mg）', '#8a8aa0', t, `t=${f2(t)}s 匀速：a=0 → N=mg=${f1(p.m * G)} N（不超重不失重，速度方向无关）`) } }
      else if (t < 2 * T1 + T2) { acc = -sgn * p.a; if (s.ph === 1) { s.ph = 2; tl.switchTo(p.mode === 0 ? '③ 减速上升（a 向下 → 失重）' : '③ 减速下降（a 向上 → 超重）', p.mode === 0 ? '#4A90D9' : '#E05555', t, `t=${f2(t)}s ${p.mode === 0 ? `减速上升：a 向下 → N=m(g−a)=${f1(p.m * (G - p.a))} N（失重）` : `减速下降：a 向上 → N=m(g+a)=${f1(p.m * (G + p.a))} N（超重）`}`) } }
      else { tl.log(t, `停止：全程重力不变，变的是体重计读数（弹力 N）`); return false }
    }
    s.v += acc * d; s.y += s.v * d
    s.N = Math.max(0, p.m * (G + acc))
    if (t - s.hist[s.hist.length - 1][0] >= 0.02) s.hist.push([t, s.N])
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    // 左：电梯井
    const sx = 60, sw = 150, top = 40, bot = h - 60, PY = (bot - top - 90) / 14
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 2; ctx.strokeRect(sx, top, sw, bot - top)
    const cy = bot - 10 - s.y * PY
    ctx.fillStyle = '#23233a'; ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1.5
    ctx.fillRect(sx + 15, cy - 80, sw - 30, 80); ctx.strokeRect(sx + 15, cy - 80, sw - 30, 80)
    // 体重计与人
    ctx.fillStyle = '#4A90D9'; ctx.fillRect(sx + 45, cy - 10, 60, 8)
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sx + 75, cy - 12); ctx.lineTo(sx + 75, cy - 45); ctx.moveTo(sx + 62, cy - 30); ctx.lineTo(sx + 88, cy - 30); ctx.stroke()
    ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(sx + 75, cy - 55, 8, 0, Math.PI * 2); ctx.fill()
    dc.label(`N=${f1(s.N)} N`, sx + 75, cy - 70, s.N > p.m * G + 1 ? '#E05555' : s.N < p.m * G - 1 ? '#4A90D9' : '#b0b0cc', 11)
    dc.arrow(sx + sw + 20, cy - 40, 0, -s.v * 6, '#3ecf8e', Math.abs(s.v) > 0.05 ? `v=${f2(s.v)}` : undefined)
    dc.label(`y=${f2(s.y)} m`, sx + sw + 40, cy - 6, '#8a8aa0', 10)
    // 右：N–t
    const gx0 = sx + sw + 110, gx1 = w - 30, gy = h - 90, gTop = 60
    const tMax = p.mode === 2 ? 1.4 : 6.2, Nmax = p.m * (G + 4.5)
    const X = (t: number) => gx0 + (t / tMax) * (gx1 - gx0), Y = (N: number) => gy - (N / Nmax) * (gy - gTop)
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx0, gTop - 6); ctx.lineTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke()
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#8a8aa0'; ctx.beginPath(); ctx.moveTo(gx0, Y(p.m * G)); ctx.lineTo(gx1, Y(p.m * G)); ctx.stroke(); ctx.setLineDash([])
    dc.label(`mg=${f1(p.m * G)} N`, gx1 - 50, Y(p.m * G) - 10, '#8a8aa0', 10)
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2.5; ctx.beginPath(); s.hist.forEach(([t, N], i) => (i ? ctx.lineTo(X(t), Y(N)) : ctx.moveTo(X(t), Y(N)))); ctx.stroke()
    for (let t = 0; t <= tMax; t += 1) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(X(t), gy - 4, 1, 4); dc.label(`${t}`, X(t), gy + 10, '#565675', 9) }
    dc.label('N/N', gx0 + 16, gTop - 12, '#8a8aa0', 10); dc.label('t/s', gx1 - 10, gy + 10, '#8a8aa0', 10)
    dc.label('体重计读数 N–t（红：超重 / 蓝：失重区）', (gx0 + gx1) / 2, 40, '#F5C542', 11)
    ctx.fillStyle = '#E0555518'; ctx.fillRect(gx0, gTop, gx1 - gx0, Y(p.m * G) - gTop)
    ctx.fillStyle = '#4A90D918'; ctx.fillRect(gx0, Y(p.m * G), gx1 - gx0, gy - Y(p.m * G))
  },
  readout(p, s) {
    return `mg=${f1(p.m * G)} N　超重 N=m(g+a)=${f1(p.m * (G + p.a))} N　失重 N=m(g−a)=${f1(p.m * (G - p.a))} N　完全失重 N=0
判据只看加速度方向：a 向上超重、a 向下失重，与速度方向无关${s ? `\n当前 N=${f1(s.N)} N，v=${f2(s.v)} m/s` : ''}`
  },
  solution(p) {
    return {
      problemType: '超重与失重：由运动状态判断体重计读数（弹力）的变化',
      hints: ['体重计测的是支持力 N，不是重力', '先判断加速度方向，再用牛顿第二定律 N−mg=ma', '“减速下降”加速度向上 → 超重；“减速上升”加速度向下 → 失重', '完全失重时一切由重力产生的现象（液柱压强、天平）都消失'],
      processes: ['加速段（a≠0）→ 匀速段（a=0）→ 减速段（a 反向）', '各段分别列 N−mg=ma'],
      forces: ['重力 mg（恒定）', '支持力 N（随加速度变）'],
      laws: ['牛顿第二定律：N−mg=ma（向上为正）', '匀速：N=mg', '自由下落：a=g → N=0'],
      critical: ['a=0：不超重不失重', 'a=g 向下：完全失重', '超重/失重只取决于 a 的方向'],
      derivation: ['a 向上：N=m(g+a)', 'a 向下：N=m(g−a)', 'a=g：N=0'],
      numeric: [`m=${p.m} kg：mg=${f1(p.m * G)} N`, `a=${p.a} m/s²：超重 ${f1(p.m * (G + p.a))} N，失重 ${f1(p.m * (G - p.a))} N`, `视重变化比例 a/g=${f2(p.a / G * 100)}%`],
      pitfalls: ['以为上升就超重、下降就失重（要看加速度）', '以为失重时重力变小', '匀速上升当超重', '完全失重时用天平仍能称质量（不能）'],
      similar: ['过桥（凸桥失重、凹桥超重）', '竖直圆周最高/最低点', '航天器中的失重环境'],
      competition: ['非惯性系中引入惯性力的等价描述', '绳断瞬间的加速度突变', '弹簧秤上的振子'],
    }
  },
}
