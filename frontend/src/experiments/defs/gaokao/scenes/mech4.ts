/**
 * B11 力学场景组 4（v3.1 补充模型）：多过程直线运动 + 实时 v–t（模型25）· 动量定理微元法（模型31）
 */
import type { MechSceneDef } from '../../../engine/mechScene'
import { ground, block } from './draw'

const G = 9.8
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')

/* ══════════ 模型 25：多过程直线运动（实时 v–t + 分段表） ══════════ */
interface Row25 { name: string; t0: number; t1: number; v0: number; v1: number; x0: number; x1: number; color: string }
interface S25 { x: number; v: number; ph: number; rows: Row25[]; samples: number[][]; maxAbs: number }
const SETUPS25 = [{ value: 0, label: '加速 → 匀速 → 刹车' }, { value: 1, label: '加速 → 立即减速（v–t 三角形）' }, { value: 2, label: '往返：正向减速 → 反向加速' }]

function theory25(p: Record<string, number>) {
  if (p.setup === 2) { const vmax = p.v0, tF = p.v0 / p.a2, totalT = 2 * tF, xTotal = (p.v0 * p.v0) / (2 * p.a2); return { vmax, totalT, xTotal } }
  const vmax = p.a1 * p.t1
  const tDe = vmax / p.a2
  const xAcc = 0.5 * p.a1 * p.t1 * p.t1
  const xDe = (vmax * vmax) / (2 * p.a2)
  if (p.setup === 1) return { vmax, totalT: p.t1 + tDe, xTotal: xAcc + xDe }
  return { vmax, totalT: p.t1 + p.t2 + tDe, xTotal: xAcc + vmax * p.t2 + xDe }
}

export const multistage: MechSceneDef<S25> = {
  id: 'gk-multistage',
  title: '多过程直线运动（实时 v–t 图 + 分段数据表）',
  desc: '三种搭法：①加速→匀速→刹车；②加速→立即减速（v–t 三角形）；③初速向前、恒定减速到反向（v–t 穿过时间轴，往返）。v–t 图实时生长，图线下面积 = 位移（t 轴下为负）。',
  formula: '匀变速：v = v₀+at，x = v₀t+½at²　v–t 图线与 t 轴围成的面积 = 位移（t 轴上方为正、下方为负）',
  params: [
    { key: 'setup', label: '搭法', min: 0, max: 2, step: 1, default: 0, options: SETUPS25 },
    { key: 'a1', label: '加速阶段 a₁（搭法①②）', min: 0.5, max: 4, step: 0.5, default: 2, unit: 'm/s²' },
    { key: 't1', label: '加速时长 t₁', min: 1, max: 5, step: 0.5, default: 2, unit: 's' },
    { key: 't2', label: '匀速时长 t₂（搭法①）', min: 1, max: 5, step: 0.5, default: 2, unit: 's' },
    { key: 'a2', label: '减速大小 a₂', min: 0.5, max: 5, step: 0.5, default: 2.5, unit: 'm/s²' },
    { key: 'v0', label: '初速 v₀（搭法③）', min: 2, max: 10, step: 0.5, default: 6, unit: 'm/s' },
  ],
  init(p, tl) {
    const first = p.setup === 2 ? '① 正向减速' : '① 匀加速'
    tl.start(p.setup === 2 ? '① 正向匀减速' : '① 匀加速', '#F5C542')
    const v = p.setup === 2 ? p.v0 : 0
    return { x: 0, v, ph: 0, rows: [{ name: first, t0: 0, t1: 0, v0: v, v1: v, x0: 0, x1: 0, color: '#F5C542' }], samples: [[0, v]], maxAbs: 1e-3 }
  },
  step(s, p, d, t, tl) {
    const push = (name: string, color: string) => {
      const prev = s.rows[s.rows.length - 1]
      if (prev) prev.t1 = t
      s.rows.push({ name, t0: t, t1: t, v0: s.v, v1: s.v, x0: s.x, x1: s.x, color })
    }
    const vPrev = s.v
    if (p.setup === 0) {
      if (s.ph === 0) { s.v += p.a1 * d }
      if (s.ph === 1) { /* 匀速 */ }
      if (s.ph === 2) { s.v = Math.max(0, s.v - p.a2 * d) }
      s.x += s.v * d
      if (s.ph === 0 && t >= p.t1) { s.ph = 1; tl.switchTo('② 匀速直线', '#4A90D9', t, `t=${f2(t)}s 达最大速度 v_max=${f2(s.v)} m/s`); push('② 匀速', '#4A90D9') }
      else if (s.ph === 1 && t >= p.t1 + p.t2) { s.ph = 2; tl.switchTo('③ 刹车匀减速', '#E05555', t, `t=${f2(t)}s 开始刹车`); push('③ 匀减速', '#E05555') }
      else if (s.ph === 2 && s.v <= 0) {
        s.rows[s.rows.length - 1].t1 = t; s.rows[s.rows.length - 1].v1 = 0; s.rows[s.rows.length - 1].x1 = s.x
        tl.switchTo('④ 停止', '#8a8aa0', t, `t=${f2(t)}s 停止：总位移 x=${f2(s.x)} m（= v–t 图线下总面积）`); return false
      }
    } else if (p.setup === 1) {
      if (s.ph === 0) s.v += p.a1 * d
      else s.v = Math.max(0, s.v - p.a2 * d)
      s.x += s.v * d
      if (s.ph === 0 && t >= p.t1) { s.ph = 1; tl.switchTo('② 立即匀减速', '#E05555', t, `t=${f2(t)}s v_max=${f2(s.v)} m/s`); push('② 匀减速', '#E05555') }
      else if (s.ph === 1 && s.v <= 0) {
        s.rows[s.rows.length - 1].t1 = t; s.rows[s.rows.length - 1].v1 = 0; s.rows[s.rows.length - 1].x1 = s.x
        tl.switchTo('③ 停止', '#8a8aa0', t, `t=${f2(t)}s 停止：总位移 x=${f2(s.x)} m（v–t 三角形面积）`); return false
      }
    } else {
      s.v -= p.a2 * d
      s.x += s.v * d
      if (s.ph === 0 && vPrev > 0 && s.v <= 0) { s.ph = 1; tl.switchTo('② 反向匀加速（v–t 穿轴）', '#3ecf8e', t, `t=${f2(t)}s v=0，最远 x_max=${f2(s.x)} m，开始返回`); push('② 反向加速', '#3ecf8e') }
      else if (s.ph === 1 && s.x <= 0) {
        s.rows[s.rows.length - 1].t1 = t; s.rows[s.rows.length - 1].v1 = s.v; s.rows[s.rows.length - 1].x1 = 0
        tl.switchTo('③ 回到出发点', '#8a8aa0', t, `t=${f2(t)}s 回到出发点，v=${f2(s.v)} m/s（与 v₀ 等大反向，总面积=0）`); return false
      }
    }
    const last = s.rows[s.rows.length - 1]
    if (last) { last.t1 = t; last.v1 = s.v; last.x1 = s.x }
    s.maxAbs = Math.max(s.maxAbs, Math.abs(s.x), Math.abs(s.v))
    const lastS = s.samples[s.samples.length - 1]
    if (t - lastS[0] >= 0.02) s.samples.push([t, s.v])
    return true
  },
  draw(dc, s, p, t) {
    const { ctx, w, h } = dc
    const th = theory25(p)
    // ── v–t 图（上方；顶部 0–70px 留给运行器的能量条）──
    const gx0 = 70, gx1 = w - 30, gy = h - 200, gTop = 84
    const tMax = th.totalT * 1.05 || 10
    const vLim = Math.max(th.vmax, Math.abs(p.setup === 2 ? p.v0 : 0)) * 1.15
    const vMin = p.setup === 2 ? -vLim : -vLim * 0.15
    const TX = (tt: number) => gx0 + (tt / tMax) * (gx1 - gx0)
    const VY = (vv: number) => gTop + ((vLim - vv) / (vLim - vMin)) * (gy - gTop)
    // 分段底色
    for (const r of s.rows) { ctx.fillStyle = r.color + '14'; ctx.fillRect(TX(r.t0), gTop - 6, Math.max(1, TX(r.t1) - TX(r.t0)), gy - gTop + 6) }
    // 坐标轴 + 刻度
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gx0, gTop - 6); ctx.lineTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke()
    for (let k = 1; k <= Math.floor(tMax); k++) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(TX(k), gy - 4, 1, 4); ltext(ctx, String(k), TX(k) - 3, gy + 9, '#565675', 9) }
    ctx.strokeStyle = '#565675'; ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(gx0, VY(0)); ctx.lineTo(gx1, VY(0)); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(gx0, VY(th.vmax)); ctx.lineTo(gx1, VY(th.vmax)); ctx.stroke(); ctx.setLineDash([])
    ltext(ctx, `${f1(th.vmax)}`, gx0 - 26, VY(th.vmax), '#8a8aa0', 10); ltext(ctx, '0', gx0 - 12, VY(0), '#8a8aa0', 10)
    if (p.setup === 2) ltext(ctx, `−${f1(th.vmax)}`, gx0 - 30, VY(-th.vmax), '#8a8aa0', 10)
    // 面积着色（位移 = 面积）
    ctx.fillStyle = '#F5C54222'
    ctx.beginPath(); ctx.moveTo(TX(s.samples[0][0]), VY(0))
    for (const [tt, vv] of s.samples) ctx.lineTo(TX(tt), VY(vv))
    ctx.lineTo(TX(t), VY(0)); ctx.closePath(); ctx.fill()
    // 曲线
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2.5; ctx.beginPath()
    s.samples.forEach(([tt, vv], i) => (i ? ctx.lineTo(TX(tt), VY(vv)) : ctx.moveTo(TX(tt), VY(vv))))
    ctx.stroke()
    ball25(ctx, TX(t), VY(s.v), 5, '#3ecf8e')
    ltext(ctx, 'v/(m·s⁻¹)', gx0 + 6, gTop - 14, '#8a8aa0', 10); ltext(ctx, 't/s', gx1 - 18, gy + 9, '#8a8aa0', 10)
    dc.label(`图线下（带符号）面积 = 位移 x = ${f2(s.x)} m`, (gx0 + gx1) / 2, gTop - 14, '#F5C542', 11)
    // 分段数据表（图与轨道之间的条带）
    let ty = gy + 26
    ltext(ctx, '分段数据', gx0, ty, '#8a8aa0', 10)
    for (const r of s.rows) {
      ctx.fillStyle = r.color; ctx.fillRect(gx0 + 56, ty - 5, 6, 10)
      ltext(ctx, `${r.name}　Δt=${f1(r.t1 - r.t0)} s　v: ${f1(r.v0)} → ${f1(r.v1)} m/s　Δx=${f1(r.x1 - r.x0)} m`, gx0 + 68, ty, '#b0b0cc', 10)
      ty += 14
    }
    // ── 轨道（下方）──
    const tgy = h - 60
    ground(ctx, tgy, 30, w - 30, '', dc.label)
    const PX = (w - 220) / (2 * Math.max(th.xTotal * 1.05, s.maxAbs * 1.1))
    const bx = w / 2 + s.x * PX - 15
    block(ctx, bx, tgy, 30, 22, '#4A90D9')
    dc.arrow(bx + 15, tgy - 34, s.v * 10, 0, '#F5C542', `v=${f2(s.v)}`)
    ctx.fillStyle = '#565675'; ctx.fillRect(w / 2 - 1, tgy - 6, 2, 12); ltext(ctx, 'x=0', w / 2 + 5, tgy + 14, '#565675', 10)
    ltext(ctx, `t = ${f2(t)} s`, 36, tgy - 12, '#8a8aa0', 11)
  },
  energy(s) {
    return { items: [{ name: '动能', value: 0.5 * s.v * s.v, color: '#F5C542' }], E0: Math.max(1e-9, 0.5 * s.maxAbs * s.maxAbs), momentum: `m=1kg　p = mv = ${f2(s.v)} kg·m/s　x = ${f2(s.x)} m` }
  },
  readout(p, s) {
    const th = theory25(p)
    const head = p.setup === 0 ? `①匀加速 a₁=${p.a1}×t₁=${p.t1}s → v_max=${f2(th.vmax)}；②匀速 ${p.t2}s；③刹车 a₂=${p.a2}`
      : p.setup === 1 ? `①匀加速 a₁=${p.a1}×t₁=${p.t1}s → v_max=${f2(th.vmax)}；②立即减速 a₂=${p.a2}`
        : `初速 v₀=${p.v0}，恒定减速 a₂=${p.a2}：最远 x_max=v₀²/2a₂=${f2(th.xTotal)} m，返回时 v=−v₀`
    return `${head}
理论：总时间 T=${f2(th.totalT)} s，全程位移 x=${f2(th.xTotal)} m${s ? `
实测：t=${f2(s.samples[s.samples.length - 1][0])} s，x=${f2(s.x)} m，v=${f2(s.v)} m/s（面积法核对 ↑）` : ''}`
  },
  solution(p) {
    const th = theory25(p)
    return {
      problemType: `多过程直线运动（${SETUPS25[p.setup].label}）：分段运动学 + v–t 图面积`,
      hints: ['先分阶段：每段设一个正方向，标出每段的初速、加速度、时长', '相邻段的衔接量：前段末速度 = 后段初速度', '总位移 = 各段位移的代数和 = v–t 图面积的代数和', '往返过程：v=0 处是最远点，之后 x 减小'],
      processes: p.setup === 0 ? ['阶段一：匀加速 a₁，历时 t₁', '阶段二：以 v_max 匀速，历时 t₂', '阶段三：匀减速 a₂ 直到停止'] : p.setup === 1 ? ['阶段一：匀加速 a₁，历时 t₁', '阶段二：匀减速 a₂ 直到停止'] : ['阶段一：正向匀减速 a₂，直到 v=0（最远点）', '阶段二：继续同方向加速度，反向匀加速回到出发点'],
      forces: ['水平方向恒定外力对应恒定加速度（F=ma）', '各段切换只是外力（加速度）突变，速度与位置连续'],
      laws: ['匀变速公式：v = v₀ + at，x = v₀t + ½at²，v² − v₀² = 2ax', '匀速段：x = v·t', 'v–t 图：斜率 = 加速度；面积（带符号）= 位移'],
      critical: ['刹车到停止的时刻：t = v_max/a₂（之后不再运动）', '往返问题 v=0 是位移最大的转折点', '回到出发点的判据：正负面积抵消（总位移为零）'],
      derivation: p.setup === 2
        ? ['减速段时间 t₁ = v₀/a₂，最远 x_max = v₀²/(2a₂)', '由对称性：返回再需 t₁，总时间 2v₀/a₂', '回到出发点时 v = −v₀（速度大小相等方向相反）']
        : ['v_max = a₁t₁', p.setup === 0 ? '加速段位移 x₁ = ½a₁t₁²；匀速段 x₂ = v_max·t₂' : '加速段位移 x₁ = ½a₁t₁²', '减速段时间 t₃ = v_max/a₂，位移 x₃ = v_max²/(2a₂)', 'x总 = x₁(+x₂)+x₃；T = t₁(+t₂)+t₃'],
      numeric: [`v_max = ${f2(th.vmax)} m/s`, `总时间 T = ${f2(th.totalT)} s`, `总位移 x = ${f2(th.xTotal)} m${p.setup === 2 ? '（最远点；回到出发点时为 0）' : ''}`],
      pitfalls: ['把路程当位移（往返段符号错）', '衔接处速度突变（速度必连续，只有加速度突变）', 'v–t 图面积只算正的一半（漏掉 t 轴下方的负面积）', '刹车结束后继续按公式算出“倒退”（物理上已停止）'],
      similar: ['汽车先加速后匀速再刹车的安全距离', '电梯上升-停靠的多段运动', '物体冲上粗糙斜面再滑回'],
      competition: ['变加速度的 v–t 曲线：面积用积分求', 'a–t 图二次积分得 x(t)', '分段最优问题（最短时间的加速-减速策略）'],
    }
  },
}

function ball25(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill()
}
/** 左对齐文字（dc.label 是居中对齐，表格/刻度需要左对齐） */
function ltext(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = '#b0b0cc', size = 10) {
  ctx.fillStyle = color; ctx.font = `${size}px system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y)
}

/* ══════════ 模型 31：动量定理 + 微元法 ══════════ */
interface S31 { x: number; v: number; I: number; done: boolean; bin: number }
const SHAPES = [{ value: 0, label: '恒力（矩形脉冲）' }, { value: 1, label: '线性增大（斜坡）' }, { value: 2, label: '半正弦脉冲' }, { value: 3, label: '窄尖峰（碰撞类）' }]

function Fof31(t: number, p: Record<string, number>): number {
  if (t < 0 || t > p.T) return 0
  if (p.shape === 0) return p.F0
  if (p.shape === 1) return (p.F0 * t) / p.T
  if (p.shape === 2) return p.F0 * Math.sin((Math.PI * t) / p.T)
  const tc = p.T / 2, sig = p.T / 8
  return p.F0 * Math.exp(-((t - tc) ** 2) / (2 * sig * sig))
}
function Iexact31(p: Record<string, number>): number {
  if (p.shape === 0) return p.F0 * p.T
  if (p.shape === 1) return (p.F0 * p.T) / 2
  if (p.shape === 2) return (2 * p.F0 * p.T) / Math.PI
  return p.F0 * (p.T / 8) * Math.sqrt(2 * Math.PI)
}

export const impulseMicro: MechSceneDef<S31> = {
  id: 'gk-impulse-micro',
  title: '动量定理 + 微元法（F–t 图微元矩形累积 = Δp）',
  desc: '光滑水平面上物体受四种 F(t) 之一：恒力 / 线性斜坡 / 半正弦 / 窄尖峰。把作用时间切成宽 Δt 的微元，每个微元内 F 近似不变（绿色矩形），I = ΣF·Δt 逐步累积；力消失后核对 I = Δp = m(v−v₀)。',
  formula: '动量定理：I = ∫F dt = ΣF·Δt = Δp = mv − mv₀（微元 Δt→0 时求和 → 积分）',
  params: [
    { key: 'shape', label: 'F(t) 形状', min: 0, max: 3, step: 1, default: 2, options: SHAPES },
    { key: 'm', label: '质量 m', min: 0.5, max: 4, step: 0.5, default: 1, unit: 'kg' },
    { key: 'F0', label: '力幅值 F₀', min: 5, max: 60, step: 5, default: 20, unit: 'N' },
    { key: 'T', label: '作用时长 T', min: 0.5, max: 4, step: 0.25, default: 2, unit: 's' },
    { key: 'dt', label: '微元宽 Δt', min: 0.02, max: 0.5, step: 0.02, default: 0.2, unit: 's' },
  ],
  init(_p, tl) {
    tl.start('① F 作用：微元矩形逐个累积 I', '#F5C542')
    return { x: 0, v: 0, I: 0, done: false, bin: 0 }
  },
  step(s, p, d, t, tl) {
    const F = Fof31(t, p)
    s.v += (F / p.m) * d
    s.x += s.v * d
    // 微元累积：每个宽 Δt 的箱以左端点 F 值近似（与画面上的矩形一致），Δp 则来自精细积分
    while (s.bin * p.dt < p.T - 1e-9 && Math.min((s.bin + 1) * p.dt, p.T) <= t) {
      const t0 = s.bin * p.dt
      s.I += Fof31(t0, p) * (Math.min(t0 + p.dt, p.T) - t0)
      s.bin++
    }
    if (!s.done && t >= p.T) {
      s.done = true
      tl.switchTo('② 力消失：匀速直线，核对 I = Δp', '#3ecf8e', t, `t=${f2(t)}s 力消失：I_微元=${f2(s.I)} N·s，Δp=m·Δv=${f2(p.m * s.v)} kg·m/s`)
    }
    if (s.done && t >= p.T + 1) {
      tl.log(t, `解析 I=∫Fdt=${f3s(Iexact31(p))} N·s　微元误差 ${f2(Math.abs(s.I - Iexact31(p)) / Iexact31(p) * 100)}%（Δt 越小越准）`)
      return false
    }
    return true
  },
  draw(dc, s, p, t) {
    const { ctx, w, h } = dc
    const Iex = Iexact31(p)
    // 对照数字（顶部 0–50px 留给运行器能量条）
    dc.label(`I_微元 = ΣF·Δt = ${f2(s.I)} N·s　　Δp = m(v−v₀) = ${f2(p.m * s.v)} kg·m/s　　解析 ∫Fdt = ${f2(Iex)} N·s`, w / 2, 64, '#b0b0cc', 12)
    // ── F–t 图 ──
    const gx0 = 70, gx1 = w - 30, gy = h - 150, gTop = 100
    const tMax = (p.T + 1) * 1.05
    const TX = (tt: number) => gx0 + (tt / tMax) * (gx1 - gx0)
    const FY = (ff: number) => gy - (ff / (p.F0 * 1.15)) * (gy - gTop)
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(gx0, gTop - 6); ctx.lineTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke()
    for (let k = 1; k <= Math.floor(tMax); k++) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(TX(k), gy - 4, 1, 4); ltext(ctx, String(k), TX(k) - 3, gy + 9, '#565675', 9) }
    ltext(ctx, `${f1(p.F0)}`, gx0 - 30, FY(p.F0), '#8a8aa0', 10); ltext(ctx, '0', gx0 - 12, gy, '#8a8aa0', 10)
    ctx.strokeStyle = '#565675'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(TX(p.T), gy); ctx.lineTo(TX(p.T), gTop - 6); ctx.moveTo(gx0, FY(p.F0)); ctx.lineTo(gx1, FY(p.F0)); ctx.stroke(); ctx.setLineDash([])
    ltext(ctx, `T=${f2(p.T)} s 力消失`, TX(p.T) + 4, gTop + 4, '#565675', 10)
    // 微元矩形（左端点取值，已完成部分填充）
    for (let t0 = 0; t0 < p.T - 1e-9; t0 += p.dt) {
      const t1 = Math.min(p.T, t0 + p.dt)
      if (t1 > t) break
      const F = Fof31(t0, p)
      ctx.fillStyle = '#3ecf8e33'; ctx.fillRect(TX(t0), FY(F), Math.max(1, TX(t1) - TX(t0)), gy - FY(F))
      ctx.strokeStyle = '#3ecf8eaa'; ctx.lineWidth = 1; ctx.strokeRect(TX(t0), FY(F), Math.max(1, TX(t1) - TX(t0)), gy - FY(F))
    }
    // 理论曲线
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2.5; ctx.beginPath()
    let first = true
    for (let tt = 0; tt <= p.T + 1e-9; tt += p.T / 160) { const yy = FY(Fof31(tt, p)); first ? (ctx.moveTo(TX(tt), yy), first = false) : ctx.lineTo(TX(tt), yy) }
    ctx.stroke()
    // 时间游标
    ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(TX(Math.min(t, tMax)), gTop - 6); ctx.lineTo(TX(Math.min(t, tMax)), gy); ctx.stroke()
    ltext(ctx, 'F/N', gx0 + 6, gTop - 14, '#8a8aa0', 10); ltext(ctx, 't/s', gx1 - 18, gy + 9, '#8a8aa0', 10)
    dc.label(`绿矩形：宽 Δt=${f2(p.dt)} s，每个微元 I_i = F·Δt，Σ = ${f2(s.I)} N·s`, (gx0 + gx1) / 2, gTop - 14, '#3ecf8e', 11)
    // ── 轨道（镜头跟随物块：物块固定，地面刻度随 x 滚动）──
    const tgy = h - 60, PX = 40, bx = 150
    ground(ctx, tgy, 30, w - 30, '', dc.label)
    for (let k = Math.floor(s.x) - 3; k <= Math.floor(s.x) + 20; k++) {
      const px = bx + 17 + (k - s.x) * PX
      if (px < 30 || px > w - 30) continue
      ctx.fillStyle = k % 5 === 0 ? '#8a8aa0' : '#3a3a5e'; ctx.fillRect(px, tgy - 6, 1, 6)
      if (k % 5 === 0) ltext(ctx, `${k} m`, px - 8, tgy + 14, '#565675', 9)
    }
    block(ctx, bx, tgy, 34, 24, '#4A90D9')
    const vEnd = Math.max(1e-6, Iex / p.m)
    dc.arrow(bx + 17, tgy - 36, (s.v / vEnd) * 80, 0, '#F5C542', `v=${f2(s.v)} m/s`)
    if (t <= p.T) { const F = Fof31(t, p); dc.arrow(bx + 17, tgy - 62, (F / p.F0) * 90, 0, '#E05555', `F=${f1(F)} N`) }
    ltext(ctx, `光滑水平面　t = ${f2(t)} s　x = ${f2(s.x)} m`, w - 250, tgy - 30, '#8a8aa0', 11)
  },
  energy(s, p) {
    return { items: [{ name: '动能', value: 0.5 * p.m * s.v * s.v, color: '#F5C542' }], E0: Math.max(1e-9, (Iexact31(p) ** 2) / (2 * p.m)), momentum: `m=${p.m}kg　I = ${f2(s.I)} N·s　Δp = ${f2(p.m * s.v)} kg·m/s　${Math.abs(s.I - p.m * s.v) < 0.05 * Math.max(1e-9, Iexact31(p)) && s.done ? '✔ I = Δp' : ''}` }
  },
  readout(p, s) {
    const Iex = Iexact31(p)
    return `理论：I = ∫F dt = ${f2(Iex)} N·s → 末速 v = I/m = ${f2(Iex / p.m)} m/s
微元法：I ≈ ΣF·Δt（Δt=${f2(p.dt)} s）${s ? `当前 ${f2(s.I)} N·s，误差 ${f2(Math.abs(s.I - Iex) / Iex * 100)}%` : ''}
${s ? `动量定理实测：Δp = m·v = ${f2(p.m * s.v)} kg·m/s（应等于 I）\n当前 v=${f2(s.v)} m/s，x=${f2(s.x)} m` : '动量定理：Δp = m·v 应等于 I'}`
  },
  solution(p) {
    const Iex = Iexact31(p)
    const names = ['恒力', '线性斜坡', '半正弦', '窄尖峰']
    return {
      problemType: `变力冲量（${names[p.shape]}）：用微元法 / F–t 图面积求冲量，再用动量定理求速度变化`,
      hints: ['冲量的定义是 I = ∫F dt——F 随 t 变时不能直接用 F·t', '把时间切成小段 Δt，每段内 F 近似不变：I_i = F(t_i)·Δt', '总冲量 = 所有微元矩形面积之和 = F–t 曲线下面积', '力消失后物体匀速：Δp 已经固定，可与 I 对照'],
      processes: ['过程一：F(t) 作用阶段（0 ≤ t ≤ T），物体加速', '过程二：力消失后匀速直线运动', '核对：微元累积 I 与 Δp = m·Δv 是否相等'],
      forces: ['水平方向只有 F(t)（光滑面无摩擦）', '重力与支持力竖直方向抵消，不进入水平动量定理'],
      laws: ['动量定理（牛顿第二定律的积分形式）：I = ∫F dt = Δp', '微元法：I = lim Σ F(t_i)Δt（Δt→0 即积分定义）', '动能定理对照：W = ∫F dx = ΔE_k（注意 dx 与 dt 的积分变量不同）'],
      critical: ['冲量是 F–t 图下的“面积”，不是 F 的峰值', '同一峰值下：窄尖峰（高×短）与恒力（低×长）可以有相同冲量', 'F 与 v 同向则加速；这里始终同向，v 单调增'],
      derivation: ['微元：I = Σ F(t_i)·Δt（左端点矩形近似）', 'Δt→0：I = ∫₀ᵀ F(t)dt = F–t 曲线下面积', '动量定理：I = mv − mv₀ = m·Δv', names[p.shape] === '恒力' ? 'I = F₀T' : names[p.shape] === '线性斜坡' ? 'I = ½F₀T（三角形面积）' : names[p.shape] === '半正弦' ? 'I = 2F₀T/π ≈ 0.637F₀T' : 'I = F₀σ√(2π)（高斯面积，σ=T/8）'],
      numeric: [`I = ${f2(Iex)} N·s`, `v末 = I/m = ${f2(Iex / p.m)} m/s`, `当前微元和 ${`Δt=${f2(p.dt)} s`}`],
      pitfalls: ['用平均力 F̄ = F₀ 直接乘 T（只有线性/恒力才对）', '把冲量当功（N·s 与 J 混淆；∫Fdt ≠ ∫Fdx）', '忘记初动量（v₀≠0 时 Δp = mv − mv₀）', '微元取得太粗导致误差大，误以为定理不成立'],
      similar: ['球拍击球（冲击力）的平均力估算', '火箭推力与动量守恒', '流体连续冲击（微元法 → 稳定流压强）'],
      competition: ['用冲量-动量图解法求变力冲量', 'F–x 图面积是功、F–t 图面积是冲量的对照', '二维变力的矢量冲量（分方向动量定理）'],
    }
  },
}

function f3s(x: number) { return Number.isFinite(x) ? x.toFixed(3) : '—' }
