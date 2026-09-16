/**
 * B11 力学场景组 2：碰撞+弹簧（场景6/模型29）· 圆周临界五类（场景7/模型28）· 多体碰撞链（场景8）
 */
import type { MechSceneDef } from '../../../engine/mechScene'
import { ground, block, ball, spring } from './draw'

const G = 9.8
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')

/* ══════════ 场景 6 / 模型 29：碰撞 + 弹簧 ══════════ */
interface S6 { xA: number; vA: number; xB: number; vB: number; xc: number; xmax: number; sep: boolean; touched: boolean; done: boolean }
const NAT = 1.2 // 弹簧原长 m
export const collisionSpring: MechSceneDef<S6> = {
  id: 'gk-collision-spring',
  title: '碰撞 + 弹簧（动量守恒 · 最大压缩 · 能量分配）',
  desc: '搭法①：A 以 v₁ 撞向前端连着弹簧的 B；搭法②：A、B 夹着压缩弹簧由静止释放。光滑水平面：全程动量守恒，弹簧最短时共速，恢复原长时分离——等效于弹性碰撞。',
  formula: 'm₁v₁+m₂v₂=(m₁+m₂)v_共　½kx_m²=ΣE_k0−½(m₁+m₂)v_共²　分离：v₁′=(m₁−m₂)v₁/(m₁+m₂)，v₂′=2m₁v₁/(m₁+m₂)',
  params: [
    { key: 'setup', label: '搭法', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: 'A 撞 B（B 前端连弹簧）' }, { value: 1, label: 'A、B 夹压缩弹簧由静止释放' }] },
    { key: 'm1', label: 'A 质量 m₁', min: 0.5, max: 5, step: 0.5, default: 1, unit: 'kg' },
    { key: 'm2', label: 'B 质量 m₂', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'kg' },
    { key: 'v1', label: 'A 初速 v₁（搭法①）', min: 1, max: 8, step: 0.5, default: 4, unit: 'm/s' },
    { key: 'v2', label: 'B 初速 v₂（搭法①）', min: -3, max: 3, step: 0.5, default: 0, unit: 'm/s' },
    { key: 'k', label: '劲度系数 k', min: 20, max: 400, step: 20, default: 100, unit: 'N/m' },
    { key: 'x0', label: '初始压缩量 x₀（搭法②）', min: 0.1, max: 0.8, step: 0.05, default: 0.4, unit: 'm' },
  ],
  init(p, tl) {
    if (p.setup === 0) { tl.start('① A 接近（匀速）', '#4A90D9'); return { xA: 0, vA: p.v1, xB: 4, vB: p.v2, xc: 0, xmax: 0, sep: false, touched: false, done: false } }
    tl.start('① 释放：弹簧推开 A、B', '#F5C542')
    return { xA: 2, vA: 0, xB: 2 + 0.4 + (NAT - p.x0), vB: 0, xc: p.x0, xmax: p.x0, sep: false, touched: true, done: false }
  },
  step(s, p, d, t, tl) {
    // 弹簧位于 A 右侧面(xA+0.4) 与 B 左侧面(xB) 之间，自然长 NAT
    const gap = s.xB - (s.xA + 0.4)
    const xc = Math.max(0, NAT - gap)
    if (p.setup === 0 && !s.touched && xc > 0) { s.touched = true; tl.switchTo('② 压缩弹簧（A 减速 B 加速）', '#F5C542', t, `t=${f2(t)}s A 接触弹簧`) }
    const F = s.touched && !s.sep ? p.k * xc : 0
    const vAp = s.vA, vBp = s.vB
    s.vA += (-F / p.m1) * d; s.vB += (F / p.m2) * d
    s.xA += ((vAp + s.vA) / 2) * d; s.xB += ((vBp + s.vB) / 2) * d
    s.xc = xc
    if (s.touched && !s.sep) {
      if (xc > s.xmax) s.xmax = xc
      if (vAp - vBp > 0 && s.vA - s.vB <= 0 && xc > 1e-4) tl.switchTo('③ 弹簧恢复（A 继续减速 B 继续加速）', '#3ecf8e', t, `t=${f2(t)}s 共速 v=${f2(s.vA)} m/s，最大压缩 x_m=${f3(xc)} m`)
      if (xc <= 1e-6 && s.xmax > 1e-4 && s.vB > s.vA) {
        s.sep = true
        tl.switchTo('④ 分离：各自匀速', '#8a8aa0', t, `t=${f2(t)}s 弹簧恢复原长分离：v_A′=${f2(s.vA)}，v_B′=${f2(s.vB)} m/s`)
      }
    }
    if (s.sep && (s.xB > 12 || s.xA < -4)) return false
    if (t > 12) return false
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const gy = h - 80, PX = (w - 60) / 12
    ground(ctx, gy, 20, w - 20, '光滑水平面', dc.label)
    const ax = 30 + s.xA * PX, bx = 30 + s.xB * PX
    block(ctx, ax, gy, 0.4 * PX, 30, '#4A90D9'); dc.label(`A m₁=${p.m1}`, ax + 0.2 * PX, gy - 40, '#9cc5ff')
    block(ctx, bx, gy, 0.5 * PX, 30, '#E05555'); dc.label(`B m₂=${p.m2}`, bx + 0.25 * PX, gy - 40, '#f0a0a0')
    const sx0 = s.touched && !s.sep ? ax + 0.4 * PX : bx - NAT * PX
    spring(ctx, sx0, gy - 15, bx, gy - 15, 10, 7)
    dc.arrow(ax + 0.2 * PX, gy - 52, s.vA * 12, 0, '#4A90D9', `v_A=${f2(s.vA)}`)
    dc.arrow(bx + 0.25 * PX, gy - 52, s.vB * 12, 0, '#E05555', `v_B=${f2(s.vB)}`)
    dc.label(`弹簧压缩 x=${f3(s.xc)} m（最大 ${f3(s.xmax)}）`, w / 2, 30, '#F5C542', 12)
  },
  energy(s, p) {
    const EkA = 0.5 * p.m1 * s.vA ** 2, EkB = 0.5 * p.m2 * s.vB ** 2, Es = 0.5 * p.k * s.xc ** 2
    return { items: [{ name: 'A 动能', value: EkA, color: '#4A90D9' }, { name: 'B 动能', value: EkB, color: '#E05555' }, { name: '弹性势能', value: Es, color: '#F5C542' }],
      E0: Math.max(1e-9, EkA + EkB + Es), momentum: `总动量 p = ${f3(p.m1 * s.vA + p.m2 * s.vB)} kg·m/s（守恒）　总能量 E = ${f3(EkA + EkB + Es)} J（守恒）` }
  },
  readout(p, s) {
    if (p.setup === 0) {
      const vc = (p.m1 * p.v1 + p.m2 * p.v2) / (p.m1 + p.m2)
      const E0 = 0.5 * p.m1 * p.v1 ** 2 + 0.5 * p.m2 * p.v2 ** 2
      const xm = Math.sqrt(Math.max(0, 2 * (E0 - 0.5 * (p.m1 + p.m2) * vc * vc) / p.k))
      const u = p.v1 - p.v2
      const vA2 = vc - (p.m2 / (p.m1 + p.m2)) * u, vB2 = vc + (p.m1 / (p.m1 + p.m2)) * u
      return `理论：共速 v_共=${f3(vc)} m/s　最大压缩 x_m=${f3(xm)} m\n分离后 v_A′=${f3(vA2)}，v_B′=${f3(vB2)} m/s（弹性碰撞结果）${s ? `\n当前 x=${f3(s.xc)}，v_A=${f2(s.vA)}，v_B=${f2(s.vB)}` : ''}`
    }
    const E = 0.5 * p.k * p.x0 ** 2
    const vA = -Math.sqrt((2 * E * p.m2) / (p.m1 * (p.m1 + p.m2))), vB = -(p.m1 / p.m2) * vA
    return `理论：释放后分离速度 v_A=${f3(vA)}，v_B=${f3(vB)} m/s（总动量 0，E_p=${f3(E)} J 全部变动能）${s ? `\n当前 v_A=${f2(s.vA)}，v_B=${f2(s.vB)}` : ''}`
  },
  solution(p) {
    const vc = (p.m1 * p.v1 + p.m2 * p.v2) / (p.m1 + p.m2)
    const E0 = 0.5 * p.m1 * p.v1 ** 2 + 0.5 * p.m2 * p.v2 ** 2
    const xm = Math.sqrt(Math.max(0, 2 * (E0 - 0.5 * (p.m1 + p.m2) * vc * vc) / p.k))
    const E = 0.5 * p.k * p.x0 ** 2
    const vAr = -Math.sqrt((2 * E * p.m2) / (p.m1 * (p.m1 + p.m2)))
    return {
      problemType: p.setup === 0 ? '碰撞 + 弹簧：求最大压缩量 / 共速 / 分离速度' : '弹簧释放（“爆炸”类）：动量守恒 + 弹性势能全部转化',
      hints: ['弹簧最短的瞬间两物体速度相同（共速），不是速度为零', '全程外力为零 → 动量守恒；弹簧无摩擦 → 机械能守恒', '分离时弹簧恢复原长，弹性势能为零', '把“压缩—恢复”整体看成一次弹性碰撞'],
      processes: ['过程一：A 接近（或释放瞬间）', '过程二：压缩弹簧：A 减速、B 加速，直到共速（最大压缩）', '过程三：弹簧恢复：A 继续减速、B 继续加速', '过程四：弹簧恢复原长，A、B 分离后各自匀速'],
      forces: ['A、B 之间只有弹簧弹力（内力，等大反向）', '光滑水平面：无外力（水平方向）'],
      laws: ['动量守恒：m₁v₁ + m₂v₂ = (m₁+m₂)v_共 = m₁v₁′ + m₂v₂′', '能量守恒：½m₁v₁² + ½m₂v₂² = ½(m₁+m₂)v_共² + ½kx_m²'],
      critical: ['最大压缩 ⇔ 共速', '分离 ⇔ 弹簧恢复原长（x=0）且 v_B > v_A', '若 m₁ < m₂，A 分离后反弹（v_A′<0）；m₁ = m₂ 交换速度'],
      derivation: ['v_共 = (m₁v₁+m₂v₂)/(m₁+m₂)', '½kx_m² = ½m₁v₁² + ½m₂v₂² − ½(m₁+m₂)v_共² = ½·m₁m₂/(m₁+m₂)·(v₁−v₂)²', 'x_m = (v₁−v₂)√[m₁m₂/(k(m₁+m₂))]', '分离速度即弹性碰撞公式：v₁′=(m₁−m₂)v₁/(m₁+m₂)+2m₂v₂/(m₁+m₂)'],
      numeric: p.setup === 0 ? [`v_共 = ${f3(vc)} m/s`, `x_m = ${f3(xm)} m`, `分离后 v_A′ = ${f3(vc - (p.m2 / (p.m1 + p.m2)) * (p.v1 - p.v2))}，v_B′ = ${f3(vc + (p.m1 / (p.m1 + p.m2)) * (p.v1 - p.v2))} m/s`, `最大弹性势能 E_p,max = ${f3(0.5 * p.k * xm * xm)} J`]
        : [`E_p = ½kx₀² = ${f3(E)} J`, `v_A = ${f3(vAr)} m/s，v_B = ${f3(-(p.m1 / p.m2) * vAr)} m/s`, `动能之比 E_kA : E_kB = m₂ : m₁ = ${p.m2} : ${p.m1}`],
      pitfalls: ['把“弹簧最短”误当“A 停下”', '碰撞过程与弹簧过程混淆，漏掉能量守恒方程', '分离后忘记 A 可能反向', '用“碰后共速”当最终状态（那只是中间时刻）'],
      similar: ['弹簧振子（B 固定）', '完全弹性碰撞', '爆炸/反冲'],
      competition: ['多弹簧串联/并联', '变质量（喷气）反冲', '弹簧有质量时的能量分配'],
    }
  },
}

/* ══════════ 场景 7 / 模型 28：竖直圆周临界五类 ══════════ */
interface S7 { th: number; dir: number; v: number; phase: 'loop' | 'fly' | 'swing' | 'done'; x: number; y: number; vx: number; vy: number; flew: boolean; vTop?: number; nTop?: number }
const TYPES = [{ value: 0, label: '绳系小球（N ≥ 0）' }, { value: 1, label: '杆系小球（v ≥ 0）' }, { value: 2, label: '内轨（N ≥ 0）' }, { value: 3, label: '外轨（按题设 v ≥ 0）' }, { value: 4, label: '管道（双壁，v ≥ 0）' }]
const oneSided = (t: number) => t === 0 || t === 2
export const circularCritical: MechSceneDef<S7> = {
  id: 'gk-circular-critical',
  title: '竖直圆周临界：绳 / 杆 / 内轨 / 外轨 / 管道',
  desc: '小球在最低点以 v₀ 出发做竖直圆周。绳/内轨只能提供指向圆心的力（最高点 N≥0 → v≥√(gR)）；杆/管道可推可拉（最高点 v≥0 即可）。观察弹力实时变化、脱离或折返。',
  formula: '½mv₀² = ½mv² + mgR(1−cosθ)　N = mv²/R + mg cosθ（θ 自最低点起）　最高点 mg+N = mv²/R',
  params: [
    { key: 'type', label: '类型', min: 0, max: 4, step: 1, default: 0, options: TYPES },
    { key: 'R', label: '半径 R', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
    { key: 'v0', label: '最低点速度 v₀', min: 2, max: 12, step: 0.1, default: 6, unit: 'm/s' },
    { key: 'm', label: '质量 m', min: 0.2, max: 3, step: 0.1, default: 1, unit: 'kg' },
  ],
  init(_p, tl) { tl.start('① 上升段（减速）', '#F5C542'); return { th: 0, dir: 1, v: _p.v0, phase: 'loop', x: 0, y: 0, vx: 0, vy: 0, flew: false } },
  step(s, p, d, t, tl) {
    const speedAt = (th: number) => { const v2 = p.v0 ** 2 - 2 * G * p.R * (1 - Math.cos(th)); return v2 > 0 ? Math.sqrt(v2) : 0 }
    if (s.phase === 'loop' || s.phase === 'swing') {
      const v = speedAt(s.th)
      const N = (p.m * v * v) / p.R + p.m * G * Math.cos(s.th)
      if (oneSided(p.type) && N < 0) {
        s.phase = 'fly'; s.flew = true
        s.x = p.R * Math.sin(s.th); s.y = p.R - p.R * Math.cos(s.th)
        s.vx = v * Math.cos(s.th) * s.dir; s.vy = v * Math.sin(s.th) * s.dir
        tl.switchTo('③ 弹力为零 → 脱离，做斜抛', '#E05555', t, `t=${f2(t)}s θ=${f1((s.th * 180) / Math.PI)}° 处 N<0 脱离（v=${f2(v)} m/s）`)
        return true
      }
      if (!oneSided(p.type) && v < 1e-4 && s.th < Math.PI && s.dir > 0) {
        s.dir = -1; s.phase = 'swing'
        tl.switchTo('③ 速度归零 → 折返摆动（杆/管道不脱离）', '#b06ce6', t, `t=${f2(t)}s θ=${f1((s.th * 180) / Math.PI)}° 处 v=0，折返`)
      }
      const prev = s.th
      s.th += s.dir * (Math.max(v, 1e-3) / p.R) * d
      s.v = v
      if (s.dir > 0 && prev < Math.PI && s.th >= Math.PI) {
        s.vTop = speedAt(Math.PI); s.nTop = (p.m * s.vTop ** 2) / p.R - p.m * G
        tl.switchTo('② 过最高点 → 下降段（加速）', '#3ecf8e', t, `t=${f2(t)}s 最高点 v=${f2(s.vTop)} m/s，${oneSided(p.type) ? 'N' : '弹力'}=${f2(s.nTop)} N${!oneSided(p.type) && s.nTop < 0 ? '（负值：杆/外壁提供支持）' : ''}`)
      }
      if (s.th >= 2 * Math.PI) { tl.switchTo('④ 回到最低点', '#8a8aa0', t, `t=${f2(t)}s 完成一周，v=${f2(speedAt(0))} m/s`); s.phase = 'done'; return false }
      if (s.phase === 'swing' && s.th <= 0) { tl.switchTo('④ 摆回最低点', '#8a8aa0', t, `t=${f2(t)}s 摆回最低点`); s.phase = 'done'; return false }
      return true
    }
    if (s.phase === 'fly') {
      s.x += s.vx * d; s.vy -= G * d; s.y += s.vy * d
      if (Math.hypot(s.x, s.y - p.R) >= p.R - 0.02 && s.vy < 0 && s.y < p.R) { tl.switchTo('④ 落回轨道/绳再次绷紧', '#8a8aa0', t, `t=${f2(t)}s 斜抛后落回圆周（本题到此）`); s.phase = 'done'; return false }
      if (s.y <= 0) { s.phase = 'done'; tl.switchTo('④ 落至最低点高度', '#8a8aa0', t); return false }
      return true
    }
    return false
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const PX = Math.min((h - 130) / (2 * p.R + 1), (w - 80) / (2 * p.R + 2))
    const cx = w / 2, cy = h / 2 - 10
    const X = (x: number) => cx + x * PX, Y = (y: number) => cy + (p.R - y) * PX
    const color = ['#F5C542', '#b06ce6', '#3ecf8e', '#4A90D9', '#E05555'][p.type]
    ctx.strokeStyle = color; ctx.lineWidth = p.type === 4 ? 10 : 3; ctx.globalAlpha = p.type === 4 ? 0.35 : 1
    ctx.beginPath(); ctx.arc(cx, cy, p.R * PX, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1
    if (p.type <= 1) { ctx.fillStyle = '#8a8aa0'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill() }
    const bx = s.flew ? X(s.x) : X(p.R * Math.sin(s.th)), by = s.flew ? Y(s.y) : Y(p.R - p.R * Math.cos(s.th))
    if (p.type <= 1 && !s.flew) { ctx.strokeStyle = p.type === 0 ? '#d9a05a' : '#8a8aa0'; ctx.lineWidth = p.type === 0 ? 2 : 4; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke() }
    ball(ctx, bx, by, 9, '#F5C542')
    if (s.phase === 'loop' || s.phase === 'swing') {
      const N = (p.m * s.v * s.v) / p.R + p.m * G * Math.cos(s.th)
      const nx = -Math.sin(s.th), ny = -Math.cos(s.th)   // 指向圆心（屏幕 y 向下为正）
      dc.arrow(bx, by, nx * Math.min(70, Math.abs(N) * 3) * Math.sign(N), -ny * Math.min(70, Math.abs(N) * 3) * Math.sign(N) * -1, N >= 0 ? '#3ecf8e' : '#E05555', `${p.type <= 1 ? 'T' : 'N'}=${f2(N)} N`)
      dc.arrow(bx, by, s.v * 9 * Math.cos(s.th) * s.dir, -s.v * 9 * Math.sin(s.th) * s.dir, '#4A90D9', `v=${f2(s.v)}`)
    }
    dc.label(`${TYPES[p.type].label}　R=${p.R} m`, cx, cy - p.R * PX - 22, color, 12)
    dc.label('最高点', cx, cy - p.R * PX - 8, '#565675', 10); dc.label('最低点', cx, cy + p.R * PX + 14, '#565675', 10)
  },
  energy(s, p) {
    const y = s.flew ? s.y : p.R - p.R * Math.cos(s.th)
    const v = s.flew ? Math.hypot(s.vx, s.vy) : s.v
    return { items: [{ name: '动能', value: 0.5 * p.m * v * v, color: '#F5C542' }, { name: '重力势能', value: p.m * G * y, color: '#4A90D9' }, { name: '机械能', value: 0.5 * p.m * v * v + p.m * G * y, color: '#3ecf8e' }], E0: 0.5 * p.m * p.v0 ** 2 }
  },
  readout(p, s) {
    const need = oneSided(p.type) ? Math.sqrt(5 * G * p.R) : 2 * Math.sqrt(G * p.R)
    const vTop2 = p.v0 ** 2 - 4 * G * p.R
    const cosD = (2 * G * p.R - p.v0 ** 2) / (3 * G * p.R)
    return `临界：最高点 v_min=${oneSided(p.type) ? `√(gR)=${f2(Math.sqrt(G * p.R))}` : '0'} m/s → 最低点需 v₀ ≥ ${f2(need)} m/s（当前 ${p.v0}：${p.v0 >= need - 1e-9 ? '✔ 能过' : '✗ 过不了'}）
${vTop2 >= 0 ? `最高点 v=${f2(Math.sqrt(vTop2))}，N=${f2((p.m * vTop2) / p.R - p.m * G)} N` : '到不了最高点'}${oneSided(p.type) && p.v0 < need && cosD >= -1 && cosD <= 1 ? `　脱离角 θ_d=${f1((Math.acos(cosD) * 180) / Math.PI)}°` : ''}${s?.vTop !== undefined ? `\n实测最高点 v=${f2(s.vTop)}，N=${f2(s.nTop!)}` : ''}`
  },
  solution(p) {
    const one = oneSided(p.type)
    const need = one ? Math.sqrt(5 * G * p.R) : 2 * Math.sqrt(G * p.R)
    const vTop2 = p.v0 ** 2 - 4 * G * p.R
    return {
      problemType: `竖直圆周临界（${TYPES[p.type].label}）：求最高点最低速度与最低点最小速度`,
      hints: ['先问：这个约束能不能“拉”也能“推”？只能拉（绳/内轨）→ 最高点弹力不能为负', '最低点到最高点用机械能守恒，最高点用牛顿第二定律', '管道有内外两壁：速度大时外壁压、速度小时内壁托——不会脱离', '外轨若是“车过拱桥外侧”则判据相反（v² ≤ gR 才不脱离）——看清题意'],
      processes: ['过程一：最低点以 v₀ 出发，沿圆周上升减速', '过程二：到最高点（临界判断）', '过程三：越过最高点后下降加速回到最低点；或中途脱离/折返'],
      forces: ['任意点：重力 mg + 约束力（绳拉力 T / 轨道弹力 N），二者沿半径方向的合力提供向心力', '最高点：mg + N = mv²/R（N 为指向圆心的约束力，杆/管道可为负）'],
      laws: ['机械能守恒：½mv₀² = ½mv² + mgR(1 − cosθ)', '牛顿第二定律（径向）：N + mg cosθ = mv²/R', '临界条件按约束类型取 N=0 或 v=0'],
      critical: ['绳 / 内轨：最高点 N ≥ 0 → v_top ≥ √(gR)；最低点 v₀ ≥ √(5gR)', '杆 / 外轨（题设）/ 管道：最高点 v_top ≥ 0；最低点 v₀ ≥ 2√(gR)', '绳类不足时在上半圆 N=0 处脱离：cosθ_d = (2gR − v₀²)/(3gR)'],
      derivation: ['最高点：½mv₀² = ½mv_top² + 2mgR → v_top² = v₀² − 4gR', one ? '临界 N=0：mg = mv_top²/R → v_top = √(gR) → v₀ = √(5gR)' : '临界 v_top = 0 → v₀ = 2√(gR)', '一般点弹力：N = mv²/R + mg cosθ = m(v₀² − 2gR + 3gR cosθ)/R'],
      numeric: [`所需最低点速度 v₀,min = ${f2(need)} m/s（当前 ${p.v0} m/s）`, vTop2 >= 0 ? `最高点 v = ${f2(Math.sqrt(vTop2))} m/s，弹力 = ${f2((p.m * vTop2) / p.R - p.m * G)} N` : '最高点速度²<0：到不了最高点', `最低点弹力 N₀ = mv₀²/R + mg = ${f2((p.m * p.v0 ** 2) / p.R + p.m * G)} N（超重）`],
      pitfalls: ['把杆的临界 v=0 用到绳上（或反之）', '忘记最高点到最低点高度差是 2R', '管道双临界漏掉“内壁托”的情形', '外轨的两种题意（内侧轨道 vs 拱桥外侧）混淆'],
      similar: ['过山车', '水流星', '绳系小球', '汽车过拱桥/凹桥'],
      competition: ['变半径轨道的曲率与法向加速度', '非竖直平面内的圆周（圆锥摆+重力分量）', '多圈运动的摩擦耗散'],
    }
  },
}

/* ══════════ 场景 8：多体碰撞链 ══════════ */
interface S8 { x: number[]; v: number[]; m: number[]; hits: number; lastHit: number; Ek0: number; p0: number }
export const collisionChain: MechSceneDef<S8> = {
  id: 'gk-collision-chain',
  title: '多体碰撞链（动量守恒 · 能量分配 · 恢复系数）',
  desc: '一列小球在光滑水平面上，首球以 v₀ 撞击。恢复系数 e=1 时等质量球依次“传递”速度（牛顿摆）；e<1 时每次碰撞损失动能。总动量始终守恒。',
  formula: 'm₁v₁+m₂v₂ 守恒　e = (v₂′−v₁′)/(v₁−v₂)　v₁′ = [m₁v₁+m₂v₂ − m₂e(v₁−v₂)]/(m₁+m₂)',
  params: [
    { key: 'n', label: '小球个数', min: 2, max: 5, step: 1, default: 4 },
    { key: 'dist', label: '质量分布', min: 0, max: 2, step: 1, default: 0, options: [{ value: 0, label: '全部相等' }, { value: 1, label: '递增 1:2:3:…' }, { value: 2, label: '递减 …:3:2:1' }] },
    { key: 'v0', label: '首球初速 v₀', min: 1, max: 6, step: 0.5, default: 3, unit: 'm/s' },
    { key: 'e', label: '恢复系数 e', min: 0, max: 1, step: 0.1, default: 1 },
    { key: 'gap', label: '球间距', min: 0, max: 2, step: 0.25, default: 0.5, unit: 'm' },
  ],
  init(p, tl) {
    tl.start('① 首球运动', '#4A90D9')
    const n = Math.round(p.n)
    const m = Array.from({ length: n }, (_, i) => (p.dist === 0 ? 1 : p.dist === 1 ? i + 1 : n - i))
    const x = Array.from({ length: n }, (_, i) => 1 + i * (0.5 + p.gap))
    const v = Array.from({ length: n }, (_, i) => (i === 0 ? p.v0 : 0))
    return { x, v, m, hits: 0, lastHit: -1, Ek0: 0.5 * m[0] * p.v0 ** 2, p0: m[0] * p.v0 }
  },
  step(s, p, d, t, tl) {
    for (let i = 0; i < s.x.length; i++) s.x[i] += s.v[i] * d
    for (let i = 0; i + 1 < s.x.length; i++) {
      if (s.x[i + 1] - s.x[i] <= 0.5 && s.v[i] > s.v[i + 1]) {
        const m1 = s.m[i], m2 = s.m[i + 1], v1 = s.v[i], v2 = s.v[i + 1]
        const v1n = (m1 * v1 + m2 * v2 - m2 * p.e * (v1 - v2)) / (m1 + m2)
        const v2n = (m1 * v1 + m2 * v2 + m1 * p.e * (v1 - v2)) / (m1 + m2)
        s.v[i] = v1n; s.v[i + 1] = v2n; s.x[i + 1] = s.x[i] + 0.5
        s.hits++
        tl.switchTo(`${'②③④⑤⑥⑦⑧'[Math.min(6, s.hits - 1)]} 第 ${s.hits} 次碰撞后`, ['#F5C542', '#3ecf8e', '#b06ce6', '#E05555', '#4A90D9'][s.hits % 5], t,
          `t=${f2(t)}s 球${i + 1}(${m1}kg) 撞 球${i + 2}(${m2}kg)：v=${f2(v1)}→${f2(v1n)}，${f2(v2)}→${f2(v2n)} m/s`)
      }
    }
    const Ek = s.v.reduce((a, v, i) => a + 0.5 * s.m[i] * v * v, 0)
    const done = s.x[s.x.length - 1] > 12 || t > 10 || (p.e === 0 && s.hits >= s.x.length - 1 && t > 2)
    if (done) tl.log(t, `结束：总动量 ${f2(s.v.reduce((a, v, i) => a + s.m[i] * v, 0))}（初 ${f2(s.p0)}），动能 ${f2(Ek)} J（初 ${f2(s.Ek0)}，损失 ${f2(s.Ek0 - Ek)} J）`)
    return !done
  },
  draw(dc, s) {
    const { ctx, w, h } = dc
    const gy = h - 80, PX = (w - 60) / 13
    ground(ctx, gy, 20, w - 20, '光滑水平面', dc.label)
    const colors = ['#F5C542', '#4A90D9', '#3ecf8e', '#b06ce6', '#E05555']
    s.x.forEach((x, i) => {
      const r = 8 + s.m[i] * 3
      ball(ctx, 30 + x * PX, gy - r, r, colors[i % colors.length])
      dc.label(`m=${s.m[i]}`, 30 + x * PX, gy + 14, '#8a8aa0', 10)
      dc.arrow(30 + x * PX, gy - r - 14, s.v[i] * 14, 0, colors[i % colors.length], Math.abs(s.v[i]) > 0.01 ? `v=${f2(s.v[i])}` : undefined)
    })
  },
  energy(s) {
    const items = s.v.map((v, i) => ({ name: `球${i + 1}动能`, value: 0.5 * s.m[i] * v * v, color: ['#F5C542', '#4A90D9', '#3ecf8e', '#b06ce6', '#E05555'][i % 5] }))
    const Ek = items.reduce((a, it) => a + it.value, 0)
    items.push({ name: '碰撞损失', value: s.Ek0 - Ek, color: '#8a8aa0' })
    return { items, E0: s.Ek0, momentum: `总动量 p = ${f3(s.v.reduce((a, v, i) => a + s.m[i] * v, 0))} kg·m/s（守恒，初值 ${f3(s.p0)}）` }
  },
  readout(p, s) {
    const n = Math.round(p.n)
    return `${p.e === 1 && p.dist === 0 ? `等质量弹性：速度依次传递，最终只有末球以 v₀=${p.v0} m/s 运动（牛顿摆）` : p.e === 0 ? '完全非弹性：碰后粘在一起，动能损失最大' : `e=${p.e}：每次碰撞损失部分动能，总动量不变`}${s ? `\n已碰撞 ${s.hits} 次（共 ${n} 球）` : ''}`
  },
  solution(p) {
    const eq = p.dist === 0 && p.e === 1
    return {
      problemType: '多体碰撞链：逐次两体碰撞的动量守恒与能量分配',
      hints: ['多体问题拆成一次次的两体碰撞，按发生顺序处理', '每次碰撞：动量守恒 + 恢复系数（e=1 时也可用动能守恒）', '等质量弹性碰撞 → 交换速度，所以“速度沿链传递”', '总动量永远守恒，总动能只在 e=1 时守恒'],
      processes: ['过程一：首球以 v₀ 运动到与第 2 球接触', '过程二：第 1 次碰撞（两体）', '过程三：被撞球再撞下一球……直到链末', '过程四：分离后各球匀速'],
      forces: ['碰撞瞬间：相互冲力（内力，等大反向），远大于其他力', '光滑水平面：无水平外力'],
      laws: ['两体动量守恒：m₁v₁ + m₂v₂ = m₁v₁′ + m₂v₂′', '恢复系数定义：e = (v₂′ − v₁′)/(v₁ − v₂)', '联立得 v₁′ = [m₁v₁ + m₂v₂ − m₂e(v₁−v₂)]/(m₁+m₂)，v₂′ = [m₁v₁ + m₂v₂ + m₁e(v₁−v₂)]/(m₁+m₂)'],
      critical: ['e=1：弹性，动能守恒；等质量时交换速度', 'e=0：完全非弹性，碰后共速，动能损失最大 ΔE = ½·m₁m₂/(m₁+m₂)·(v₁−v₂)²', '是否发生二次碰撞：看碰后前球速度是否小于后球'],
      derivation: ['等质量 e=1：v₁′ = v₂ = 0，v₂′ = v₁ → 速度完全传递', '质量递增（轻撞重）：前球反弹（v₁′<0），可能与更前面的球再碰', '质量递减（重撞轻）：后球获得更大速度 v₂′ = 2m₁v₁/(m₁+m₂) > v₁'],
      numeric: (() => {
        const n = Math.round(p.n)
        const m1 = p.dist === 2 ? n : 1, m2 = p.dist === 0 ? 1 : p.dist === 1 ? 2 : n - 1
        const v1n = (m1 * p.v0 - m2 * p.e * p.v0) / (m1 + m2), v2n = (m1 * p.v0 + m1 * p.e * p.v0) / (m1 + m2)
        return [eq ? `等质量弹性链：末球速度 = v₀ = ${p.v0} m/s，其余静止` : `第 1 次碰撞（${m1}kg 撞 ${m2}kg）：v₁′ = ${f3(v1n)}，v₂′ = ${f3(v2n)} m/s`,
          `总动量 = m₁v₀ = ${f2(m1 * p.v0)} kg·m/s 始终不变`, `e=${p.e}：等质量两球单次碰撞动能损失比例 (1−e²)/2 = ${f2(((1 - p.e * p.e) / 2) * 100)}%`]
      })(),
      pitfalls: ['把多体当整体一次算完（忽略顺序）', '漏掉二次碰撞', 'e<1 时仍用动能守恒', '忘记轻球撞重球会反弹'],
      similar: ['牛顿摆', '子弹打木块', '连环追尾'],
      competition: ['无穷多球的极限传递', '不同质量比下的最大末速度（“鞭梢效应”）', '碰撞时间有限时的接触力'],
    }
  },
}
