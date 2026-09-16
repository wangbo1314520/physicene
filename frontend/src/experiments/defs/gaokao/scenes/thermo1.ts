/**
 * B11 热学组 1（纯 2D）：玻璃管液封（模型51）· 汽缸活塞（模型52）
 * 压强单位 cmHg（p₀=76 cmHg，汞柱 h cm 直接相加），长度 cm，温度 K
 */
import type { MechSceneDef } from '../../../engine/mechScene'

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const RAMP = 4   // 过程用时 s

/* ══════════ 模型 51：玻璃管液封 ══════════ */
const MODES51 = [{ value: 0, label: '开口向上，升温（等压）' }, { value: 1, label: '开口向下，升温（等压）' }, { value: 2, label: '开口向上 → 缓慢转到开口向下（等温）' }]
interface S51 { L: number; p: number; T: number; ang: number; done: boolean; logged: boolean }
function p51(p: Record<string, number>, ang: number) { return p.p0 + p.h * Math.cos(ang) }   // ang=0 开口向上（液柱压在气体上）；π 开口向下
export const liquidSealTube: MechSceneDef<S51> = {
  id: 'gk-liquid-seal-tube',
  title: '玻璃管液封气体（p=p₀±ρgh · 等压 / 等温）',
  desc: '一段汞柱（长 h）封闭一段空气柱（长 L）。开口向上时气体压强 p=p₀+h；开口向下时 p=p₀−h（汞柱被大气托住）。升温时 p 不变 → 等压 L/T=常数；缓慢转动玻璃管时 T 不变 → 等温 pL=常数。',
  formula: '开口向上 p=p₀+h　开口向下 p=p₀−h　等压 L₁/T₁=L₂/T₂　等温 p₁L₁=p₂L₂　一般 pL/T=常数（截面积不变）',
  params: [
    { key: 'mode', label: '过程', min: 0, max: 2, step: 1, default: 0, options: MODES51 },
    { key: 'h', label: '汞柱长 h', min: 4, max: 30, step: 1, default: 10, unit: 'cmHg' },
    { key: 'L1', label: '初始气柱长 L₁', min: 10, max: 40, step: 1, default: 20, unit: 'cm' },
    { key: 'T1', label: '初温 T₁', min: 250, max: 350, step: 5, default: 300, unit: 'K' },
    { key: 'T2', label: '末温 T₂（升温模式）', min: 250, max: 450, step: 5, default: 360, unit: 'K' },
    { key: 'p0', label: '大气压 p₀', min: 70, max: 80, step: 1, default: 76, unit: 'cmHg' },
  ],
  h: 1 / 200,
  init(p, tl) {
    const ang = p.mode === 1 ? Math.PI : 0
    const pr = p51(p, ang)
    tl.start(p.mode === 2 ? '等温：转动玻璃管，p 变 L 变' : '等压：升温，L 随 T 线性增大', '#F5C542')
    tl.log(0, `初态：${p.mode === 1 ? '开口向下 p₁=p₀−h' : '开口向上 p₁=p₀+h'}=${f1(pr)} cmHg，L₁=${p.L1} cm，T₁=${p.T1} K`)
    return { L: p.L1, p: pr, T: p.T1, ang, done: false, logged: false }
  },
  step(s, p, d, t, tl) {
    const u = Math.min(1, t / RAMP)
    if (p.mode <= 1) {
      s.T = p.T1 + (p.T2 - p.T1) * u
      s.L = (p.L1 * s.T) / p.T1
      if (!s.logged && u >= 1) { s.logged = true; tl.log(t, `T=${p.T2} K：L=${f2(s.L)} cm（等压 L₂=L₁T₂/T₁=${f2((p.L1 * p.T2) / p.T1)}），p 保持 ${f1(s.p)} cmHg`); return false }
    } else {
      s.ang = Math.PI * u
      const pNew = p51(p, s.ang)
      s.L = (p.L1 * p51(p, 0)) / pNew
      s.p = pNew
      if (Math.abs(s.ang - Math.PI / 2) < 0.02 && !s.logged) { s.logged = true; tl.switchTo('水平：p=p₀', '#3ecf8e', t, `水平时 p=p₀=${p.p0} cmHg，L=${f2(s.L)} cm`) }
      if (u >= 1) { tl.log(t, `开口向下：p₂=p₀−h=${f1(pNew)} cmHg，L₂=p₁L₁/p₂=${f2(s.L)} cm（等温 pL 不变：${f1(p51(p, 0) * p.L1)}=${f1(pNew * s.L)}）`); return false }
    }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const cx = w / 2 - 60, cy = h / 2 - 20, PX = Math.min(4.2, (h - 160) / (p.L1 * 2.2 + p.h))
    const tubeW = 34, total = (s.L + p.h + 8) * PX
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.ang)
    // 玻璃管（闭口端在下方 -y 方向）：局部坐标以闭口端为原点向上
    const y0 = total / 2
    ctx.fillStyle = '#1d1d33'; ctx.strokeStyle = '#9cc5ff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.roundRect(-tubeW / 2, -y0, tubeW, total, 6); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#F5C54233'; ctx.fillRect(-tubeW / 2 + 2, y0 - s.L * PX, tubeW - 4, s.L * PX)           // 气柱（闭口端）
    ctx.fillStyle = '#b0b0cc'; ctx.fillRect(-tubeW / 2 + 2, y0 - (s.L + p.h) * PX, tubeW - 4, p.h * PX)        // 汞柱
    ctx.fillStyle = '#14142a'; ctx.fillRect(-tubeW / 2 + 2, -y0 - 2, tubeW - 4, 6)                               // 开口
    ctx.restore()
    dc.label(`${s.ang < Math.PI / 4 ? '开口向上' : s.ang > (3 * Math.PI) / 4 ? '开口向下' : '倾斜/水平'}`, cx, cy + total / 2 + 20, '#8a8aa0', 11)
    // 读数板
    const bx = w - 200
    dc.label('封闭气体状态', bx + 70, 60, '#F5C542', 12)
    dc.label(`p = ${f1(s.p)} cmHg`, bx + 70, 84, '#b0b0cc', 12)
    dc.label(`L = ${f2(s.L)} cm`, bx + 70, 104, '#b0b0cc', 12)
    dc.label(`T = ${f1(s.T)} K`, bx + 70, 124, '#b0b0cc', 12)
    dc.label(`pL/T = ${f2((s.p * s.L) / s.T)}（守恒）`, bx + 70, 150, '#3ecf8e', 11)
    // 受力：汞柱平衡
    dc.label(p.mode === 1 || s.ang > Math.PI / 2 ? '汞柱：p₀S 向上 = pS + ρghS 向下 → p=p₀−h' : '汞柱：pS 向上 = p₀S + ρghS 向下 → p=p₀+h', w / 2, h - 60, '#8a8aa0', 11)
  },
  readout(p, s) {
    const pUp = p.p0 + p.h, pDown = p.p0 - p.h
    if (p.mode <= 1) { const pr = p.mode === 0 ? pUp : pDown; return `p=${f1(pr)} cmHg（${p.mode === 0 ? 'p₀+h' : 'p₀−h'}）不变 → 等压：L₂=L₁T₂/T₁=${f2((p.L1 * p.T2) / p.T1)} cm${s ? `\n当前 T=${f1(s.T)} K，L=${f2(s.L)} cm` : ''}` }
    return `等温：p₁L₁=p₂L₂　开口向上 p₁=${f1(pUp)} → 水平 p=${p.p0} → 开口向下 p₂=${f1(pDown)}\nL：${p.L1} → ${f2((p.L1 * pUp) / p.p0)} → ${f2((p.L1 * pUp) / pDown)} cm${s ? `\n当前 p=${f1(s.p)}，L=${f2(s.L)} cm` : ''}`
  },
  solution(p) {
    const pUp = p.p0 + p.h, pDown = p.p0 - p.h
    return {
      problemType: '玻璃管液封气体：先由液柱平衡求 p，再用气体定律求 L 或 T',
      hints: ['第一步永远是“以液柱为对象”求气体压强：p=p₀±ρgh', '看清哪个量不变：升温缓慢 → p 不变（等压）；转动缓慢 → T 不变（等温）', '气柱长度可代替体积（截面积相同）', '开口向下时液柱靠大气压托住，气体压强小于 p₀'],
      processes: ['确定封闭气体与初态 (p₁, L₁, T₁)', '按过程性质选定律', '求末态并检验合理性（如液柱不会溢出）'],
      forces: ['液柱受重力 ρghS、上方气体压力、下方压力（大气或气体）三力平衡'],
      laws: ['p=p₀+h（开口向上）/ p=p₀−h（开口向下）/ p=p₀（水平）', '等压：L/T 常数；等温：pL 常数；一般 pL/T 常数'],
      critical: ['液柱恰好到管口（溢出临界）', '开口向下时 p₀−h≤0 液柱会掉出（h 不能超过 p₀）', '倾斜 θ 时 p=p₀±h cosθ'],
      derivation: [`开口向上 p₁=${p.p0}+${p.h}=${f1(pUp)}；开口向下 p=${f1(pDown)} cmHg`, p.mode <= 1 ? `等压 L₂=L₁T₂/T₁=${f2((p.L1 * p.T2) / p.T1)} cm` : `等温 L₂=p₁L₁/p₂=${f2((p.L1 * pUp) / pDown)} cm`],
      numeric: [`p（向上）=${f1(pUp)}，p（向下）=${f1(pDown)} cmHg`, p.mode <= 1 ? `L₂=${f2((p.L1 * p.T2) / p.T1)} cm` : `转到向下后 L₂=${f2((p.L1 * pUp) / pDown)} cm`],
      pitfalls: ['开口方向搞反导致 ± 错', '单位混用（cmHg 与 Pa）', '用摄氏温度代入气体定律', '忘记检查液柱是否溢出'],
      similar: ['U 形管', '汽缸活塞', '倾斜玻璃管'],
      competition: ['液柱有加速度时的“等效重力”', '两段液柱封两段气体的联立', '温度沿管不均匀'],
    }
  },
}

/* ══════════ 模型 52：汽缸活塞 ══════════ */
const MODES52 = [{ value: 0, label: '竖直汽缸（活塞在上），缓慢加热（等压）' }, { value: 1, label: '竖直汽缸，缓慢加外力 F 下压（等温）' }, { value: 2, label: '水平汽缸，缓慢加推力 F（等温）' }]
interface S52 { L: number; p: number; T: number; F: number; done: boolean }
const PA0 = 1.0e5
function p52(p: Record<string, number>, F: number) { return p.mode === 2 ? PA0 + F / p.S : PA0 + (p.M * 9.8) / p.S + F / p.S }
export const cylinderPiston: MechSceneDef<S52> = {
  id: 'gk-cylinder-piston',
  title: '汽缸活塞（活塞受力平衡 · p=p₀+Mg/S+F/S）',
  desc: '活塞（质量 M、面积 S）封闭理想气体。先以活塞为对象列平衡求气体压强：竖直 p=p₀+Mg/S（+F/S），水平 p=p₀+F/S。缓慢加热 → 等压（L∝T）；缓慢加外力 → 等温（pL 不变）。',
  formula: '竖直：pS=p₀S+Mg+F → p=p₀+Mg/S+F/S　水平：p=p₀+F/S　等压 L/T 常数　等温 pL 常数',
  params: [
    { key: 'mode', label: '过程', min: 0, max: 2, step: 1, default: 0, options: MODES52 },
    { key: 'M', label: '活塞质量 M', min: 0, max: 40, step: 2, default: 10, unit: 'kg' },
    { key: 'S', label: '活塞面积 S', min: 0.005, max: 0.03, step: 0.005, default: 0.01, unit: 'm²' },
    { key: 'Fmax', label: '外力 F 终值（模式 1/2）', min: 0, max: 2000, step: 100, default: 500, unit: 'N' },
    { key: 'L1', label: '初始气柱长 L₁', min: 10, max: 40, step: 1, default: 20, unit: 'cm' },
    { key: 'T1', label: '初温 T₁', min: 250, max: 350, step: 5, default: 300, unit: 'K' },
    { key: 'T2', label: '末温 T₂（模式 0）', min: 250, max: 450, step: 5, default: 360, unit: 'K' },
  ],
  h: 1 / 200,
  init(p, tl) {
    const pr = p52(p, 0)
    tl.start(p.mode === 0 ? '等压加热：L 随 T 增大' : '等温加力：p 增大 L 减小', '#F5C542')
    tl.log(0, `活塞平衡 → 初态 p₁=${p.mode === 2 ? 'p₀' : 'p₀+Mg/S'}=${f2(pr / 1e5)}×10⁵ Pa，L₁=${p.L1} cm，T₁=${p.T1} K`)
    return { L: p.L1, p: pr, T: p.T1, F: 0, done: false }
  },
  step(s, p, d, t, tl) {
    const u = Math.min(1, t / RAMP)
    if (p.mode === 0) { s.T = p.T1 + (p.T2 - p.T1) * u; s.L = (p.L1 * s.T) / p.T1; if (u >= 1) { tl.log(t, `T=${p.T2} K：L=${f2(s.L)} cm（等压 L₂=L₁T₂/T₁=${f2((p.L1 * p.T2) / p.T1)}），p 保持 ${f2(s.p / 1e5)}×10⁵ Pa`); return false } }
    else { s.F = p.Fmax * u; s.p = p52(p, s.F); s.L = (p.L1 * p52(p, 0)) / s.p; if (u >= 1) { tl.log(t, `F=${p.Fmax} N：p₂=p₁+F/S=${f2(s.p / 1e5)}×10⁵ Pa，L₂=p₁L₁/p₂=${f2(s.L)} cm（等温）`); return false } }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const vertical = p.mode !== 2
    const PX = Math.min(5, (h - 200) / (p.L1 * 1.4))
    if (vertical) {
      const cx = w / 2 - 80, bot = h - 90, cw = 110
      ctx.strokeStyle = '#9cc5ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - cw / 2, bot - p.L1 * 1.5 * PX); ctx.lineTo(cx - cw / 2, bot); ctx.lineTo(cx + cw / 2, bot); ctx.lineTo(cx + cw / 2, bot - p.L1 * 1.5 * PX); ctx.stroke()
      ctx.fillStyle = '#F5C54233'; ctx.fillRect(cx - cw / 2 + 2, bot - s.L * PX, cw - 4, s.L * PX)
      const py = bot - s.L * PX
      ctx.fillStyle = '#8a8aa0'; ctx.fillRect(cx - cw / 2 + 2, py - 14, cw - 4, 14)
      dc.label(`活塞 M=${p.M} kg`, cx, py - 26, '#b0b0cc', 10)
      dc.arrow(cx, py - 14, 0, -Math.min(70, p.M * 2), '#E05555', `Mg=${f1(p.M * 9.8)}N`)
      if (s.F > 0) dc.arrow(cx + 30, py - 90, 0, Math.min(70, s.F / 8), '#F5C542', `F=${f1(s.F)}N`)
      dc.arrow(cx - 30, py, 0, -40, '#3ecf8e', 'pS'); dc.arrow(cx - 30, py - 70, 0, 30, '#4A90D9', 'p₀S')
      if (p.mode === 0) { ctx.fillStyle = '#E0555588'; for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.moveTo(cx - 40 + k * 20, bot + 10); ctx.lineTo(cx - 34 + k * 20, bot + 22); ctx.lineTo(cx - 40 + k * 20, bot + 34); ctx.stroke() } dc.label('加热', cx, bot + 48, '#E05555', 10) }
    } else {
      const cy = h / 2, left = 60, ch = 90
      ctx.strokeStyle = '#9cc5ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(left + p.L1 * 1.5 * PX, cy - ch / 2); ctx.lineTo(left, cy - ch / 2); ctx.lineTo(left, cy + ch / 2); ctx.lineTo(left + p.L1 * 1.5 * PX, cy + ch / 2); ctx.stroke()
      ctx.fillStyle = '#F5C54233'; ctx.fillRect(left + 2, cy - ch / 2 + 2, s.L * PX, ch - 4)
      const px = left + s.L * PX
      ctx.fillStyle = '#8a8aa0'; ctx.fillRect(px, cy - ch / 2 + 2, 14, ch - 4)
      if (s.F > 0) dc.arrow(px + 90, cy, -Math.min(70, s.F / 8), 0, '#F5C542', `F=${f1(s.F)}N`)
      dc.arrow(px, cy - 20, 40, 0, '#3ecf8e', 'pS'); dc.arrow(px + 70, cy + 20, -30, 0, '#4A90D9', 'p₀S')
      dc.label('水平：活塞重力与压强无关', w / 2, h - 60, '#8a8aa0', 11)
    }
    const bx = w - 200
    dc.label('封闭气体状态', bx + 70, 60, '#F5C542', 12)
    dc.label(`p = ${f2(s.p / 1e5)}×10⁵ Pa`, bx + 70, 84, '#b0b0cc', 12)
    dc.label(`L = ${f2(s.L)} cm`, bx + 70, 104, '#b0b0cc', 12)
    dc.label(`T = ${f1(s.T)} K`, bx + 70, 124, '#b0b0cc', 12)
    dc.label(`pL/T = ${f2((s.p * s.L) / s.T / 1e3)}（守恒）`, bx + 70, 150, '#3ecf8e', 11)
  },
  readout(p, s) {
    const p1 = p52(p, 0), p2 = p52(p, p.Fmax)
    return p.mode === 0 ? `p=p₀+Mg/S=${f2(p1 / 1e5)}×10⁵ Pa 不变 → L₂=L₁T₂/T₁=${f2((p.L1 * p.T2) / p.T1)} cm${s ? `\n当前 T=${f1(s.T)} K，L=${f2(s.L)} cm` : ''}`
      : `p₁=${f2(p1 / 1e5)}×10⁵ Pa → 加 F=${p.Fmax} N 后 p₂=p₁+F/S=${f2(p2 / 1e5)}×10⁵ Pa\n等温 L₂=p₁L₁/p₂=${f2((p.L1 * p1) / p2)} cm${s ? `\n当前 F=${f1(s.F)} N，p=${f2(s.p / 1e5)}×10⁵ Pa，L=${f2(s.L)} cm` : ''}`
  },
  solution(p) {
    const p1 = p52(p, 0), p2 = p52(p, p.Fmax)
    return {
      problemType: '汽缸活塞：以活塞为对象求气体压强，再用气体定律求末态',
      hints: ['先画活塞受力：重力、大气压力、气体压力、外力', '竖直汽缸活塞重力参与平衡；水平汽缸不参与', '缓慢 = 每时刻都平衡（准静态）', '判断哪个量不变再选定律'],
      processes: ['初态：活塞平衡 → p₁', '过程：加热（等压）或加力（等温）', '末态：气体定律求 L₂ 或 T₂'],
      forces: ['活塞：Mg、p₀S、pS、F', '竖直平衡 pS=p₀S+Mg+F'],
      laws: ['p=p₀+Mg/S+F/S（竖直）', 'p=p₀+F/S（水平）', '等压 L/T；等温 pL'],
      critical: ['活塞恰好到缸口', '倒置汽缸时 p=p₀−Mg/S', '气体压强不能为负（活塞会掉出）'],
      derivation: [`p₁=${f2(p1 / 1e5)}×10⁵ Pa`, p.mode === 0 ? `L₂=L₁T₂/T₁=${f2((p.L1 * p.T2) / p.T1)} cm` : `p₂=${f2(p2 / 1e5)}×10⁵ Pa，L₂=${f2((p.L1 * p1) / p2)} cm`],
      numeric: [`Mg/S=${f2((p.M * 9.8) / p.S / 1e5)}×10⁵ Pa`, p.mode === 0 ? `L₂=${f2((p.L1 * p.T2) / p.T1)} cm` : `F/S=${f2(p.Fmax / p.S / 1e5)}×10⁵ Pa`],
      pitfalls: ['漏掉大气压力', '水平汽缸算上活塞重力', '摄氏温度直接代入', '外力方向与压强增减搞反'],
      similar: ['液封玻璃管', '两个活塞的联动汽缸', '汽缸倒置'],
      competition: ['活塞有摩擦（静摩擦范围）', '绝热过程 pV^γ 常数', '活塞振动的周期'],
    }
  },
}
