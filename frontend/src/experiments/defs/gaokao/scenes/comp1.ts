/**
 * B11 竞赛扩展组 1（纯 2.5D）：微元法 + 积分（模型66）· 小量近似（模型67）· 相对运动 + 非惯性系（模型68）
 */
import type { MechSceneDef } from '../../../engine/mechScene'
import { ground, block, ball } from './draw'

const G = 9.8
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')
const f4 = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '—')

/* ══════════ 模型 66：微元法 + 积分（变力做功 W=∫F dx） ══════════ */
const SHAPES66 = [{ value: 0, label: '线性减小 F=F₀(1−x/L)' }, { value: 1, label: '弹簧型 F=F₀·x/L' }, { value: 2, label: '半正弦 F=F₀ sin(πx/L)' }, { value: 3, label: '平方反比 F=F₀(L/(x+L))²' }]
function F66(x: number, p: Record<string, number>): number {
  if (x < 0 || x > p.L) return 0
  if (p.shape === 0) return p.F0 * (1 - x / p.L)
  if (p.shape === 1) return (p.F0 * x) / p.L
  if (p.shape === 2) return p.F0 * Math.sin((Math.PI * x) / p.L)
  return p.F0 * (p.L / (x + p.L)) ** 2
}
function W66(p: Record<string, number>): number {
  if (p.shape === 0) return 0.5 * p.F0 * p.L
  if (p.shape === 1) return 0.5 * p.F0 * p.L
  if (p.shape === 2) return (2 * p.F0 * p.L) / Math.PI
  return p.F0 * p.L * 0.5
}
interface S66 { x: number; v: number; W: number; bin: number; done: boolean }
export const variableForce: MechSceneDef<S66> = {
  id: 'gk-variable-force',
  title: '微元法 + 积分（变力做功 W=∫F dx=ΣF·Δx）',
  desc: '光滑水平面上物体受沿 x 变化的力 F(x)，作用距离 L。把位移切成宽 Δx 的微元，每段内 F 近似不变：W≈ΣF·Δx（F–x 图下矩形面积和），Δx→0 即定积分。动能定理核对：W=½mv²−½mv₀²。四种 F(x) 均有解析积分可对照。',
  formula: 'W=∫₀ᴸF(x)dx=lim ΣF(xᵢ)Δx　动能定理 W=ΔE_k　线性/弹簧 ½F₀L　半正弦 2F₀L/π　平方反比 F₀L/2',
  params: [
    { key: 'shape', label: 'F(x) 形状', min: 0, max: 3, step: 1, default: 2, options: SHAPES66 },
    { key: 'F0', label: '力幅值 F₀', min: 5, max: 50, step: 5, default: 20, unit: 'N' },
    { key: 'L', label: '作用距离 L', min: 1, max: 6, step: 0.5, default: 4, unit: 'm' },
    { key: 'm', label: '质量 m', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'kg' },
    { key: 'dx', label: '微元宽 Δx', min: 0.05, max: 1, step: 0.05, default: 0.4, unit: 'm' },
  ],
  init(_p, tl) { tl.start('① F(x) 作用：微元矩形累积 W', '#F5C542'); return { x: 0, v: 0.01, W: 0, bin: 0, done: false } },
  step(s, p, d, t, tl) {
    const F = F66(s.x, p)
    s.v += (F / p.m) * d; s.x += s.v * d
    while (s.bin * p.dx < p.L - 1e-9 && Math.min((s.bin + 1) * p.dx, p.L) <= s.x) { const x0 = s.bin * p.dx; s.W += F66(x0, p) * (Math.min(x0 + p.dx, p.L) - x0); s.bin++ }
    if (!s.done && s.x >= p.L) { s.done = true; const Wex = W66(p); tl.switchTo('② 力消失：核对 W=ΔE_k', '#3ecf8e', t, `x=L：微元和 W=${f2(s.W)} J，ΔE_k=½mv²=${f2(0.5 * p.m * s.v * s.v)} J，解析 ∫Fdx=${f2(Wex)} J（微元误差 ${f2((Math.abs(s.W - Wex) / Wex) * 100)}%，Δx 越小越准）`) }
    if (s.done && s.x >= p.L + 1.5) return false
    return t < 30
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const gx0 = 70, gx1 = w - 30, gy = h - 190, gTop = 80
    const X = (x: number) => gx0 + (x / (p.L * 1.1)) * (gx1 - gx0), Y = (F: number) => gy - (F / (p.F0 * 1.15)) * (gy - gTop)
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx0, gTop - 6); ctx.lineTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke()
    for (let x0 = 0; x0 < p.L - 1e-9; x0 += p.dx) { const x1 = Math.min(p.L, x0 + p.dx); if (x1 > s.x) break; const F = F66(x0, p); ctx.fillStyle = '#3ecf8e33'; ctx.fillRect(X(x0), Y(F), X(x1) - X(x0), gy - Y(F)); ctx.strokeStyle = '#3ecf8eaa'; ctx.strokeRect(X(x0), Y(F), X(x1) - X(x0), gy - Y(F)) }
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2.5; ctx.beginPath()
    for (let i = 0; i <= 200; i++) { const x = (i / 200) * p.L; const yy = Y(F66(x, p)); i ? ctx.lineTo(X(x), yy) : ctx.moveTo(X(x), yy) }
    ctx.stroke()
    ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X(Math.min(s.x, p.L * 1.1)), gTop - 6); ctx.lineTo(X(Math.min(s.x, p.L * 1.1)), gy); ctx.stroke()
    dc.label('F/N', gx0 + 14, gTop - 14, '#8a8aa0', 10); dc.label('x/m', gx1 - 14, gy + 12, '#8a8aa0', 10)
    for (let x = 0; x <= p.L; x += p.L / 4) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(X(x), gy - 4, 1, 4); dc.label(f1(x), X(x), gy + 12, '#565675', 9) }
    dc.label(`W=ΣF·Δx=${f2(s.W)} J　ΔE_k=½mv²=${f2(0.5 * p.m * s.v * s.v)} J　解析 ∫Fdx=${f2(W66(p))} J`, w / 2, 52, '#b0b0cc', 12)
    const tgy = h - 60, PX = (w - 200) / (p.L * 1.4)
    ground(ctx, tgy, 30, w - 30, '光滑水平面', dc.label)
    const bx = 60 + s.x * PX
    block(ctx, bx, tgy, 34, 24, '#4A90D9')
    dc.arrow(bx + 17, tgy - 36, s.v * 6, 0, '#F5C542', `v=${f2(s.v)}`)
    if (s.x < p.L) dc.arrow(bx + 17, tgy - 60, (F66(s.x, p) / p.F0) * 80, 0, '#E05555', `F=${f1(F66(s.x, p))} N`)
    ctx.fillStyle = '#565675'; ctx.fillRect(60 + p.L * PX, tgy - 8, 2, 14); dc.label('x=L', 60 + p.L * PX, tgy + 14, '#565675', 9)
  },
  energy(s, p) { return { items: [{ name: '动能', value: 0.5 * p.m * s.v * s.v, color: '#F5C542' }], E0: Math.max(1e-9, W66(p)), momentum: `W_微元=${f2(s.W)} J（Δx=${p.dx} m）` } },
  readout(p, s) {
    const Wex = W66(p)
    return `解析 W=∫F dx=${f2(Wex)} J → 末速 v=√(2W/m)=${f2(Math.sqrt((2 * Wex) / p.m))} m/s
微元法：W≈ΣF(xᵢ)Δx（左端点矩形）${s ? `，当前 ${f2(s.W)} J，误差 ${f2((Math.abs(s.W - Wex) / Wex) * 100)}%` : ''}
对照模型 31：F–t 图面积是冲量，F–x 图面积是功`
  },
  solution(p) {
    const Wex = W66(p)
    return {
      problemType: `变力做功（${SHAPES66[p.shape].label}）：微元法 / F–x 图面积 / 定积分求功，再用动能定理`,
      hints: ['功的定义 W=∫F dx，F 随 x 变时不能直接 F·L', '切成小段：每段位移 Δx 内 F 近似恒定', '把所有小矩形面积加起来，就是 F–x 曲线下面积', '动能定理把功和速度连起来：W=ΔE_k'],
      processes: ['F(x) 作用：物体加速', 'x=L 后力消失：匀速', '核对：微元和 = 解析积分 = ΔE_k'],
      forces: ['水平方向只有 F(x)', '竖直方向重力与支持力平衡'],
      laws: ['W=∫F dx=ΣF·Δx', '动能定理 W=½mv²−½mv₀²', '牛顿第二定律 F=ma（逐点）'],
      critical: ['线性变化的力可用平均力 F̄=(F₁+F₂)/2', '非线性只能用面积/积分', 'Δx 取得越小误差越小（收敛）'],
      derivation: [p.shape === 0 ? 'W=∫F₀(1−x/L)dx=½F₀L' : p.shape === 1 ? 'W=∫F₀x/L dx=½F₀L' : p.shape === 2 ? 'W=∫F₀sin(πx/L)dx=2F₀L/π' : 'W=∫F₀L²/(x+L)²dx=F₀L/2', `v=√(2W/m)`],
      numeric: [`W=${f2(Wex)} J`, `v=${f2(Math.sqrt((2 * Wex) / p.m))} m/s`],
      pitfalls: ['用 F₀·L 当功', '平均力法用于非线性力', '把 F–t 面积当功', '忘记力消失后不再做功'],
      similar: ['弹簧弹力做功 ½kx²', '万有引力做功（平方反比）', '阻力随速度变化的功'],
      competition: ['曲线路径的线积分 ∫F·dl', '保守力与势能函数 F=−dU/dx', '数值积分（辛普森法）'],
    }
  },
}

/* ══════════ 模型 67：小量近似（单摆周期与幅角） ══════════ */
interface S67 { th: number; om: number; thS: number; omS: number; T: number | null; cross: number[] }
function Texact(th0: number, L: number): number {
  const k = Math.sin(th0 / 2); let K = 0; const N = 2000
  for (let i = 0; i < N; i++) { const phi = ((i + 0.5) / N) * (Math.PI / 2); K += (Math.PI / 2 / N) / Math.sqrt(1 - k * k * Math.sin(phi) ** 2) }
  return 4 * Math.sqrt(L / G) * K
}
export const smallQuantity: MechSceneDef<S67> = {
  id: 'gk-small-quantity',
  title: '小量近似（sinθ≈θ · 单摆周期与幅角）',
  desc: '单摆的精确方程 θ¨=−(g/L)sinθ 不是简谐运动；小角度时 sinθ≈θ 才有 T₀=2π√(L/g)。实摆（黄）与按 T₀ 运动的简谐“影子摆”（灰）并排：幅角越大实摆越慢，T/T₀≈1+θ₀²/16+…（精确为椭圆积分）。右侧曲线给出 T/T₀–θ₀。',
  formula: 'θ¨=−(g/L)sinθ　sinθ≈θ−θ³/6　T₀=2π√(L/g)　T≈T₀(1+θ₀²/16+11θ₀⁴/3072)　T=4√(L/g)·K(sin(θ₀/2))',
  params: [
    { key: 'th0', label: '幅角 θ₀', min: 5, max: 150, step: 5, default: 60, unit: '°' },
    { key: 'L', label: '摆长 L', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
  ],
  h: 1 / 1000,
  init(p, tl) {
    const th0 = (p.th0 * Math.PI) / 180
    tl.start('实摆（精确）vs 简谐影子摆（小角近似）', '#F5C542')
    tl.log(0, `θ₀=${p.th0}°：sinθ₀=${f4(Math.sin(th0))} vs θ₀=${f4(th0)} rad，相对偏差 ${f2((1 - Math.sin(th0) / th0) * 100)}%；T₀=2π√(L/g)=${f3(2 * Math.PI * Math.sqrt(p.L / G))} s`)
    return { th: th0, om: 0, thS: th0, omS: 0, T: null, cross: [] }
  },
  step(s, p, d, t, tl) {
    const w0 = Math.sqrt(G / p.L)
    // 精确：半隐式；用 θ 向上过零的两个时刻之差测周期
    const thPrev = s.th
    s.om += -(w0 * w0) * Math.sin(s.th) * d; s.th += s.om * d
    s.omS += -(w0 * w0) * s.thS * d; s.thS += s.omS * d
    if (thPrev < 0 && s.th >= 0) s.cross.push(t)
    if (s.T === null && s.cross.length >= 2) { s.T = s.cross[1] - s.cross[0]; const T0 = 2 * Math.PI / w0, Tex = Texact((p.th0 * Math.PI) / 180, p.L); tl.log(t, `实测 T=${f3(s.T)} s（精确椭圆积分 ${f3(Tex)}），T₀=${f3(T0)} s → T/T₀=${f3(s.T / T0)}（近似式 1+θ₀²/16=${f3(1 + ((p.th0 * Math.PI) / 180) ** 2 / 16)}）`) }
    if (t > 4 * 2 * Math.PI / w0) return false
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const px = w * 0.28, py = 90, PL = Math.min(200, h - 260)
    ctx.fillStyle = '#3a3a5e'; ctx.fillRect(px - 60, py - 6, 120, 6)
    for (const [th, color, name] of [[s.thS, '#565675', '简谐影子（T₀）'], [s.th, '#F5C542', '实摆（精确）']] as [number, string, string][]) {
      const bx = px + PL * Math.sin(th), by = py + PL * Math.cos(th)
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke()
      ball(ctx, bx, by, 10, color)
      dc.label(name, bx, by + 22, color, 10)
    }
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#3a3a5e'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + PL + 20); ctx.stroke(); ctx.setLineDash([])
    dc.label(`θ=${f1((s.th * 180) / Math.PI)}°（影子 ${f1((s.thS * 180) / Math.PI)}°）`, px, py + PL + 44, '#8a8aa0', 11)
    // T/T0–θ0 曲线
    const gx0 = w * 0.55, gx1 = w - 30, gy = h - 110, gTop = 70
    const X = (deg: number) => gx0 + (deg / 180) * (gx1 - gx0), Y = (r: number) => gy - ((r - 1) / 0.8) * (gy - gTop)
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx0, gTop); ctx.lineTo(gx0, gy); ctx.lineTo(gx1, gy); ctx.stroke()
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2; ctx.beginPath()
    for (let deg = 1; deg <= 175; deg += 3) { const r = Texact((deg * Math.PI) / 180, p.L) / (2 * Math.PI * Math.sqrt(p.L / G)); const yy = Y(Math.min(1.8, r)); deg === 1 ? ctx.moveTo(X(deg), yy) : ctx.lineTo(X(deg), yy) }
    ctx.stroke()
    ctx.strokeStyle = '#4A90D9'; ctx.setLineDash([4, 3]); ctx.beginPath()
    for (let deg = 1; deg <= 175; deg += 3) { const th0 = (deg * Math.PI) / 180; const yy = Y(Math.min(1.8, 1 + th0 * th0 / 16)); deg === 1 ? ctx.moveTo(X(deg), yy) : ctx.lineTo(X(deg), yy) }
    ctx.stroke(); ctx.setLineDash([])
    const rNow = Texact((p.th0 * Math.PI) / 180, p.L) / (2 * Math.PI * Math.sqrt(p.L / G))
    ctx.fillStyle = '#E05555'; ctx.beginPath(); ctx.arc(X(p.th0), Y(Math.min(1.8, rNow)), 5, 0, Math.PI * 2); ctx.fill()
    for (const deg of [0, 30, 60, 90, 120, 150, 180]) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(X(deg), gy - 3, 1, 3); dc.label(`${deg}°`, X(deg), gy + 12, '#565675', 9) }
    for (const r of [1, 1.2, 1.4, 1.6]) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(gx0 - 3, Y(r), 3, 1); dc.label(f1(r), gx0 - 16, Y(r), '#565675', 9) }
    dc.label('T/T₀', gx0 + 20, gTop - 12, '#8a8aa0', 10); dc.label('θ₀', gx1 - 10, gy + 24, '#8a8aa0', 10)
    dc.label(`黄：精确（椭圆积分）　蓝虚：1+θ₀²/16　当前 θ₀=${p.th0}°：T/T₀=${f3(rNow)}`, (gx0 + gx1) / 2, 50, '#8a8aa0', 10)
    dc.label(`小量近似适用条件：θ₀ ≲ 5°–10° 时 T/T₀−1 < 0.2%`, (gx0 + gx1) / 2, h - 80, '#3ecf8e', 10)
  },
  readout(p, s) {
    const th0 = (p.th0 * Math.PI) / 180, T0 = 2 * Math.PI * Math.sqrt(p.L / G), Tex = Texact(th0, p.L)
    return `sinθ₀ 与 θ₀ 偏差 ${f2((1 - Math.sin(th0) / th0) * 100)}%　T₀=${f3(T0)} s　精确 T=${f3(Tex)} s（T/T₀=${f4(Tex / T0)}）　级数 1+θ₀²/16=${f4(1 + th0 * th0 / 16)}${s?.T ? `\n实测 T=${f3(s.T)} s` : ''}
结论：幅角越大周期越长；5° 时偏差 0.05%，60° 时 7.3%，90° 时 18%`
  },
  solution(p) {
    const th0 = (p.th0 * Math.PI) / 180, T0 = 2 * Math.PI * Math.sqrt(p.L / G), Tex = Texact(th0, p.L)
    return {
      problemType: '小量近似：单摆为何只在小角度是简谐运动；大幅角周期修正',
      hints: ['回复力 −mg sinθ 只有在 sinθ≈θ 时才正比于位移 → 简谐', '泰勒展开 sinθ=θ−θ³/6+…，第二项相对第一项是 θ²/6', '大幅角时回复力“偏小”→ 摆得慢 → 周期变长', '判断近似是否合理：看被忽略项与保留项的比值'],
      processes: ['列精确方程 θ¨+(g/L)sinθ=0', '小角近似 → θ¨+(g/L)θ=0 → T₀', '大角：能量法给出精确周期（椭圆积分）或级数修正'],
      forces: ['重力沿切向分量 −mg sinθ（回复力）', '绳拉力沿径向不做功'],
      laws: ['牛顿第二定律切向：mLθ¨=−mg sinθ', '简谐条件 F=−kx', '能量守恒 ½L²θ˙²=gL(cosθ−cosθ₀)'],
      critical: ['θ₀≲5° 误差 <0.05%；10° 约 0.2%', '90° 时 T/T₀=1.18', '接近 180° 周期趋于无穷（倒立不稳定平衡）'],
      derivation: ['T=4√(L/g)∫₀^{π/2}dφ/√(1−k²sin²φ)，k=sin(θ₀/2)', '展开 K(k)≈π/2(1+k²/4+9k⁴/64) → T≈T₀(1+θ₀²/16+11θ₀⁴/3072)'],
      numeric: [`θ₀=${p.th0}°：T/T₀=${f4(Tex / T0)}`, `级数近似 ${f4(1 + th0 * th0 / 16 + (11 * th0 ** 4) / 3072)}`],
      pitfalls: ['认为单摆周期永远与振幅无关', '用角度制代入 sinθ≈θ（必须弧度）', '忽略项的量级判断错误', '把大幅角摆当简谐用叠加'],
      similar: ['弹簧振子在非线性区', '圆锥摆周期', '复摆'],
      competition: ['椭圆积分与 AGM 快速计算', '非线性振动的频率–振幅关系', '摆线摆的严格等时性'],
    }
  },
}

/* ══════════ 模型 68：相对运动 + 非惯性系 ══════════ */
interface S68 { xc: number; vc: number; th: number; om: number; xb: number; vb: number; logged: boolean; hitWall: boolean }
export const noninertial: MechSceneDef<S68> = {
  id: 'gk-noninertial',
  title: '相对运动 + 非惯性系（加速车厢 · 惯性力 −ma）',
  desc: '车厢以加速度 a 向右加速。地面系：小球受真实力，摆球被绳拉着一起加速；车厢系（非惯性系）：引入惯性力 F_惯=−ma 后可用平衡/牛顿定律——摆的平衡角 tanθ=a/g；光滑地板上的小球相对车厢以 a 向后“加速”（地面系中它其实静止）。可切换观察参考系。',
  formula: '车厢系：ΣF_真+(−ma)=ma_rel　摆：T sinθ=ma，T cosθ=mg → tanθ=a/g　光滑球：a_rel=−a（地面系 a_球=0）　等效重力 g′=√(g²+a²)',
  params: [
    { key: 'a', label: '车厢加速度 a', min: 0.5, max: 8, step: 0.5, default: 3, unit: 'm/s²' },
    { key: 'frame', label: '观察参考系', min: 0, max: 1, step: 1, default: 1, options: [{ value: 0, label: '地面系（真实力）' }, { value: 1, label: '车厢系（加惯性力 −ma）' }] },
    { key: 'L', label: '摆长 L', min: 0.5, max: 1.5, step: 0.1, default: 1, unit: 'm' },
  ],
  h: 1 / 500,
  init(p, tl) { tl.start('车厢开始加速', '#F5C542'); tl.log(0, `车厢系中每个质量 m 的物体都受惯性力 −ma（向左），等效重力 g′=√(g²+a²)=${f2(Math.hypot(G, p.a))} m/s²，方向偏后 θ=arctan(a/g)=${f1((Math.atan(p.a / G) * 180) / Math.PI)}°`); return { xc: 0, vc: 0, th: 0, om: 0, xb: 1.5, vb: 0, logged: false, hitWall: false } },
  step(s, p, d, t, tl) {
    s.vc += p.a * d; s.xc += s.vc * d
    // 摆：在车厢系中受 g 向下、a 向后（惯性力），阻尼让它稳到平衡角
    const alpha = (-G * Math.sin(s.th) - p.a * Math.cos(s.th)) / p.L - 1.6 * s.om
    s.om += alpha * d; s.th += s.om * d
    // 光滑小球：地面系静止 → 相对车厢向后
    const thEq = Math.atan(p.a / G)
    if (!s.logged && t > 2.5 && Math.abs(s.th + thEq) < 0.01 && Math.abs(s.om) < 0.05) { s.logged = true; tl.switchTo('摆稳定在平衡角', '#3ecf8e', t, `t=${f2(t)}s 摆稳定：平衡角 θ=${f1((-s.th * 180) / Math.PI)}°（理论 arctan(a/g)=${f1((thEq * 180) / Math.PI)}°），绳拉力 T=m√(g²+a²)=${f2(Math.hypot(G, p.a))}m N；光滑小球相对车厢位移 ½at²=${f2(0.5 * p.a * t * t)} m（地面系中它静止）`) }
    if (s.xb - 0.5 * p.a * t * t < -1.4 && !s.hitWall) { s.hitWall = true; tl.log(t, `小球撞到车厢后壁：相对位移 ${f2(0.5 * p.a * t * t)} m=½at²（车厢系匀加速 a 向后）`) }
    return t < 7.5
  },
  draw(dc, s, p, t) {
    const { ctx, w, h } = dc
    const gy = h - 80, PX = 90
    const carW = 3.4 * PX, carH = 2.2 * PX
    const carX = p.frame === 1 ? w / 2 - carW / 2 : Math.min(w - carW - 20, 40 + s.xc * 40)
    ground(ctx, gy, 20, w - 20, p.frame === 1 ? '车厢系（地面向后掠过）' : '地面系', dc.label)
    if (p.frame === 1) { ctx.fillStyle = '#3a3a5e'; for (let k = 0; k < 20; k++) { const gx = ((k * 60 - s.xc * 40) % (w + 60) + w + 60) % (w + 60) - 30; ctx.fillRect(gx, gy + 2, 24, 3) } }
    // 车厢
    ctx.fillStyle = '#1d1d33'; ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2; ctx.fillRect(carX, gy - carH - 16, carW, carH); ctx.strokeRect(carX, gy - carH - 16, carW, carH)
    for (const wx of [carX + 40, carX + carW - 40]) { ctx.fillStyle = '#23233a'; ctx.beginPath(); ctx.arc(wx, gy - 8, 12, 0, Math.PI * 2); ctx.fill() }
    dc.arrow(carX + carW + 10, gy - carH / 2, 50, 0, '#F5C542', `a=${p.a}`)
    dc.label(`v_车=${f2(s.vc)} m/s`, carX + carW / 2, gy - carH - 30, '#8a8aa0', 10)
    // 摆
    const px = carX + carW * 0.3, py = gy - carH - 10
    const bx = px + p.L * PX * 0.7 * Math.sin(s.th), by = py + p.L * PX * 0.7 * Math.cos(s.th)
    ctx.strokeStyle = '#d9a05a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(bx, by); ctx.stroke()
    ball(ctx, bx, by, 9, '#F5C542')
    dc.label(`θ=${f1((-s.th * 180) / Math.PI)}°`, bx + 30, by, '#F5C542', 10)
    // 摆球受力
    dc.arrow(bx, by, 0, 40, '#E05555', 'mg')
    dc.arrow(bx, by, (px - bx) * 0.6, (py - by) * 0.6, '#3ecf8e', 'T')
    if (p.frame === 1) dc.arrow(bx, by, -p.a * 12, 0, '#b06ce6', '−ma（惯性力）')
    else dc.arrow(bx, by - 30, p.a * 12, 0, '#F5C542', 'ma=合力')
    // 光滑小球
    const rel = s.xb - 0.5 * p.a * t * t
    const ballX = p.frame === 1 ? carX + carW / 2 + Math.max(-1.55, rel) * PX * 0.6 : carX + carW / 2 + Math.max(-1.55, rel) * PX * 0.6
    ball(ctx, ballX, gy - 16 - 9, 9, '#4A90D9')
    if (p.frame === 1) dc.arrow(ballX, gy - 16 - 30, -p.a * 12, 0, '#b06ce6', '−ma')
    dc.label(p.frame === 1 ? '光滑球：相对车厢向后加速（惯性力）' : '光滑球：地面系中水平不受力，保持静止，是车厢“跑了”', carX + carW / 2, gy - 44, '#4A90D9', 10)
    dc.label(p.frame === 1 ? '车厢系：加上惯性力 −ma 后，可像静止系一样列平衡 / 牛顿定律' : '地面系：只有真实力；摆球的合力 T sinθ=ma 提供加速度', w / 2, 30, '#8a8aa0', 11)
  },
  readout(p, s) {
    const thEq = Math.atan(p.a / G)
    return `摆平衡角 tanθ=a/g → θ=${f1((thEq * 180) / Math.PI)}°　绳拉力 T=m√(g²+a²)=${f2(Math.hypot(G, p.a))}m　光滑球相对加速度 a_rel=−a=${-p.a} m/s²
惯性力是“假想力”：只在非惯性系中出现，没有施力物体、不遵守牛顿第三定律${s ? `\n当前 θ=${f1((-s.th * 180) / Math.PI)}°，车速 ${f2(s.vc)} m/s` : ''}`
  },
  solution(p) {
    const thEq = Math.atan(p.a / G)
    return {
      problemType: '非惯性系问题：加速车厢内的摆与自由小球，用惯性力或地面系两种方法求解',
      hints: ['方法一（地面系）：物体真实加速度 = 车厢加速度，用牛顿第二定律', '方法二（车厢系）：加惯性力 −ma，然后当静止问题处理', '两种方法结果必须一致', '等效重力方向决定“竖直”：液面、摆线都垂直于等效重力'],
      processes: ['车厢加速 → 摆偏离竖直到平衡角（有阻尼时稳定）', '光滑小球在地面系静止、相对车厢向后运动'],
      forces: ['摆球：重力 mg、绳拉力 T（地面系）；车厢系再加惯性力 −ma', '光滑球：重力、支持力（地面系合力为零）'],
      laws: ['地面系：T sinθ=ma，T cosθ=mg', '车厢系：T + mg + (−ma) = 0', 'a_rel=a_绝对−a_系'],
      critical: ['tanθ=a/g，与 m、L 无关', '光滑球相对车厢 a_rel=−a', '等效重力 g′=√(g²+a²)，摆的周期 T=2π√(L/g′)'],
      derivation: ['tanθ=ma/mg=a/g', `θ=arctan(${p.a}/9.8)=${f1((thEq * 180) / Math.PI)}°`, 'T=m√(g²+a²)'],
      numeric: [`θ=${f1((thEq * 180) / Math.PI)}°`, `g′=${f2(Math.hypot(G, p.a))} m/s²，摆周期 T=2π√(L/g′)=${f3(2 * Math.PI * Math.sqrt(p.L / Math.hypot(G, p.a)))} s`],
      pitfalls: ['在地面系中也加惯性力（重复计算）', '认为惯性力有反作用力', '光滑球在车厢里“受到向后的力”（地面系中没有）', '摆的周期仍用 g'],
      similar: ['电梯中的超重失重', '转弯车厢中的摆', '旋转参考系中的离心力'],
      competition: ['科里奥利力', '傅科摆', '潮汐力（非惯性系视角）'],
    }
  },
}
