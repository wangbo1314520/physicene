/**
 * B11 力学场景组 3（v3.1 补充模型）：等时圆（模型22）· 晾衣绳动态平衡（模型23）
 */
import type { MechSceneDef } from '../../../engine/mechScene'
import { ball, rope } from './draw'

const G = 9.8
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')

/* ══════════ 模型 22：等时圆 ══════════ */
interface Track22 { alpha: number; len: number; s: number; v: number; tArr: number | null; ctrl: boolean; color: string }
const ALPHAS = [0, 30, 55, 75]
const COLORS22 = ['#F5C542', '#4A90D9', '#3ecf8e', '#b06ce6']
interface S22 { tracks: Track22[]; done: number; total: number }
export const isochrone: MechSceneDef<S22> = {
  id: 'gk-isochrone',
  title: '等时圆（沿多条光滑弦下滑同时到达）',
  desc: '从圆的最高点沿任意光滑弦（直线轨道）无摩擦下滑：弦长 L=2R·cosα，加速度 a=g·cosα，时间 t=√(2L/a)=√(4R/g) 与 α 无关——所有小球同时到达圆周。虚线对照轨比圆上弦更长，明显迟到。',
  formula: '弦长 L = 2R cosα　a = g cosα　t = √(2L/a) = √(4R/g)（与弦的方向无关）',
  params: [
    { key: 'R', label: '圆半径 R', min: 0.4, max: 1.2, step: 0.05, default: 0.8, unit: 'm' },
    { key: 'ext', label: '对照轨延长倍数', min: 1.2, max: 2, step: 0.1, default: 1.6 },
  ],
  init(p, tl) {
    tl.start('① 各球同时由静止释放', '#4A90D9')
    const tracks: Track22[] = []
    for (const a of ALPHAS) for (const sgn of a === 0 ? [1] : [1, -1]) {
      const alpha = (sgn * a * Math.PI) / 180
      tracks.push({ alpha, len: 2 * p.R * Math.cos(alpha), s: 0, v: 0, tArr: null, ctrl: false, color: COLORS22[ALPHAS.indexOf(a)] })
    }
    tracks.push({ alpha: (40 * Math.PI) / 180, len: 2 * p.R * Math.cos((40 * Math.PI) / 180) * p.ext, s: 0, v: 0, tArr: null, ctrl: true, color: '#E05555' })
    return { tracks, done: 0, total: tracks.length }
  },
  step(s, _p, d, t, tl) {
    for (const tr of s.tracks) {
      if (tr.tArr !== null) continue
      const a = G * Math.cos(tr.alpha)
      tr.v += a * d; tr.s += tr.v * d
      if (tr.s >= tr.len) {
        tr.s = tr.len; tr.tArr = t
        s.done++
        if (!tr.ctrl && s.done === s.total - 1) tl.switchTo('② 圆上各球同时到达', '#3ecf8e', t, `t=${f2(t)}s 圆上所有弦同时到达（理论 √(4R/g)=${f2(Math.sqrt(4 * _p.R / G))}s）`)
        if (tr.ctrl) { tl.switchTo('③ 对照轨最后到达（更长 → 更晚）', '#E05555', t, `t=${f2(t)}s 对照轨（长 ${f2(tr.len)} m > 弦长）才到达`); return false }
      }
    }
    return true
  },
  draw(dc, s, p, t) {
    const { ctx, w, h } = dc
    const PX = Math.min((h - 150) / (2 * p.R + 0.4), (w - 120) / (2 * p.R + 0.4))
    const cx = w / 2, topY = 70
    ctx.strokeStyle = '#565675'; ctx.lineWidth = 2.5; ctx.setLineDash([])
    ctx.beginPath(); ctx.arc(cx, topY + p.R * PX, p.R * PX, 0, Math.PI * 2); ctx.stroke()
    ball(ctx, cx, topY, 5, '#8a8aa0')
    dc.label('最高点（公共起点）', cx, topY - 12, '#8a8aa0', 10)
    for (const tr of s.tracks) {
      const dx = Math.sin(tr.alpha), dy = Math.cos(tr.alpha)
      const ex = cx + tr.len * dx * PX, ey = topY + tr.len * dy * PX
      ctx.strokeStyle = tr.ctrl ? '#E0555566' : '#3a3a5e'; ctx.lineWidth = tr.ctrl ? 2 : 3
      ctx.setLineDash(tr.ctrl ? [6, 5] : [])
      ctx.beginPath(); ctx.moveTo(cx, topY); ctx.lineTo(cx + tr.len * dx * PX * (tr.ctrl ? 1 : 1), topY + tr.len * dy * PX * (tr.ctrl ? 1 : 1)); ctx.stroke()
      ctx.setLineDash([])
      const bx = cx + tr.s * dx * PX, by = topY + tr.s * dy * PX
      ball(ctx, bx, by, 7, tr.tArr !== null ? '#3ecf8e' : tr.color)
      if (tr.tArr !== null) dc.label(`✓${f2(tr.tArr)}s`, bx + dx * 16, by + dy * 16, tr.ctrl ? '#E05555' : '#3ecf8e', 10)
    }
    dc.label(`理论：t = √(4R/g) = √(4×${f2(p.R)}/9.8) = ${f2(Math.sqrt((4 * p.R) / G))} s（与弦方向无关）`, w / 2, h - 74, '#F5C542', 12)
    dc.label(`已到达 ${s.done}/${s.total}　t=${f2(t)} s　·　红虚线 = 对照轨（不在圆上，更长 → 更晚到）`, w / 2, h - 56, '#8a8aa0', 11)
  },
  energy(s, p) {
    const Ek = s.tracks.reduce((a, tr) => a + 0.5 * tr.v * tr.v, 0)
    const Ep = s.tracks.reduce((a, tr) => a + G * (tr.len - tr.s) * Math.cos(tr.alpha), 0)
    return { items: [{ name: '动能 Σ', value: Ek, color: '#F5C542' }, { name: '势能差 Σ', value: Ep, color: '#4A90D9' }, { name: '机械能', value: Ek + Ep, color: '#3ecf8e' }],
      E0: s.tracks.reduce((a, tr) => a + G * tr.len * Math.cos(tr.alpha), 0), momentum: `每球 m=1kg：a_i = g·cosα_i` }
  },
  readout(p, s) {
    const t0 = Math.sqrt((4 * p.R) / G)
    const tracks = s?.tracks ?? []
    const arrivals = tracks.filter((tr) => tr.tArr !== null && !tr.ctrl).map((tr) => f2(tr.tArr!))
    const ctrl = tracks.find((tr) => tr.ctrl)
    return `理论 t=√(4R/g)=${f2(t0)} s（只与 R 有关，与弦方向无关）
圆上各球到达时刻实测：${arrivals.length ? arrivals.join(' , ') + ' s' : '未开始'}${ctrl && ctrl.tArr !== null ? `
对照轨到达 ${f2(ctrl.tArr)} s > ${f2(t0)} s：不在圆上的轨道不满足等时性` : ''}`
  },
  solution(p) {
    const t0 = Math.sqrt((4 * p.R) / G)
    return {
      problemType: '等时圆：证明/判断沿不同光滑弦下滑的时间相等',
      hints: ['设弦与竖直方向夹角 α，把弦长用 R 和 α 表示出来', '光滑弦上只有重力分量提供加速度：a = g cosα', '初速度为零的匀加速直线运动：t = √(2L/a)', '代入后 α 会不会消掉？'],
      processes: ['过程一：各球从最高点同时由静止出发', '过程二：沿各自弦做加速度 g cosα 的匀加速运动', '过程三：到达圆周上各自端点'],
      forces: ['只受重力和轨道支持力', '支持力不做功；重力沿弦分量 mg cosα 提供加速度'],
      laws: ['牛顿第二定律沿弦方向：ma = mg cosα', '匀变速直线运动：L = ½at²'],
      critical: ['等时条件：轨道是从圆最高点出发的“弦”（终点在圆上）', '对照轨若超出圆外（同方向但更长），时间 √(2L/g cosα) 随 L 增大而增大，不再等时', '同理：从圆周上各点沿弦滑到最低点也等时'],
      derivation: ['弦长几何：过最高点 T 作弦与竖直成 α，交圆于另一点，弦长 L = 2R cosα', '运动学：t = √(2L/a) = √(2·2R cosα/(g cosα)) = √(4R/g)', '结论：t 与 α 无关，只由 R 决定'],
      numeric: [`R = ${f2(p.R)} m → t = √(4R/g) = ${f2(t0)} s`, `竖直直径（α=0）：L = 2R = ${f2(2 * p.R)} m，a = g`, `α=60° 的弦：L = 2R cos60° = ${f2(p.R)} m，a = g/2，t 仍为 ${f2(t0)} s`],
      pitfalls: ['误以为“弦短先到”——加速度也同步变小', '把等时圆结论用到非弦轨道（如弧线、圆外延长线）', '忘记结论只对“光滑、由静止、从最高点出发”成立'],
      similar: ['不同倾角斜面（顶点共圆）同时到达底部', '斜面最速降线问题（brachistochrone）的特例对照', '摆的等时性（单摆）辨析：那是周期等时，不是路径等时'],
      competition: ['最速降线：等时圆只是“同时到”，不是“最快到”；摆线才是最速降线且真正等时', '有摩擦时的等时性修正', '推广：过圆上任意一点的“等时圆族”'],
    }
  },
}

/* ══════════ 模型 23：晾衣绳动态平衡 ══════════ */
interface S23 { ph: 1 | 2 | 3 | 4; d: number; H: number; vy: number; y: number; broken: boolean; tArr: number[] }
const tension = (p: Record<string, number>, d: number) => (p.m * G * p.L) / (2 * Math.sqrt(Math.max(1e-6, p.L * p.L - d * d)))
const dBreak = (p: Record<string, number>) => { const c = (p.m * G) / (2 * p.Tmax); return c >= 1 ? 0 : p.L * Math.sqrt(1 - c * c) }
export const clothesline: MechSceneDef<S23> = {
  id: 'gk-clothesline',
  title: '晾衣绳动态平衡（拉开两杆 · 张力与杆高无关）',
  desc: '长 L 的轻绳两端挂两杆、衣服挂中点。①拉开两杆（d 增大）：sinα=d/L 增大、cosα 减小 → T=mg/(2cosα) 增大；②同步降低两杆：d 不变 → T 不变（与杆高无关）；③继续拉开直到 T>T_max 绳断 → ④衣服自由落体。',
  formula: 'sinα = d/L（α 为绳与竖直方向夹角）　2T cosα = mg → T = mg/(2cosα) = mgL/(2√(L²−d²))　断绳：d > L√(1−(mg/2T_max)²)',
  params: [
    { key: 'L', label: '绳长 L', min: 1.5, max: 3, step: 0.1, default: 2, unit: 'm' },
    { key: 'm', label: '衣服质量 m', min: 0.5, max: 4, step: 0.5, default: 2, unit: 'kg' },
    { key: 'Tmax', label: '绳最大承受力 T_max', min: 20, max: 150, step: 10, default: 40, unit: 'N' },
    { key: 'd0', label: '初始杆距 d₀', min: 0.4, max: 1.4, step: 0.05, default: 0.8, unit: 'm' },
    { key: 'vp', label: '拉开速度', min: 0.05, max: 0.4, step: 0.05, default: 0.2, unit: 'm/s' },
  ],
  init(p, tl) {
    tl.start('① 拉开两杆', '#4A90D9')
    return { ph: 1, d: Math.min(p.d0, p.L * 0.7), H: 2.2, vy: 0, y: 0, broken: false, tArr: [] }
  },
  step(s, p, d, t, tl) {
    const T = tension(p, s.d)
    const snap = () => { s.broken = true; s.ph = 4; s.y = s.H - 0.5 * Math.sqrt(Math.max(0, p.L * p.L - s.d * s.d)); s.vy = 0
      tl.switchTo('④ 绳断自由落体', '#E05555', t, `t=${f2(t)}s d=${f2(s.d)} m 时 T=${f1(T)} N > T_max=${p.Tmax} N，绳断！（理论临界 d=${f2(dBreak(p))} m）`) }
    if (s.ph === 1) {
      s.d += p.vp * d
      if (T > p.Tmax) { snap(); return true }
      if (s.d >= p.L * 0.8) { s.ph = 2; tl.switchTo('② 同步降杆', '#3ecf8e', t, `t=${f2(t)}s 拉至 d=${f2(s.d)} m，T=${f1(T)} N；开始降杆验证“张力与杆高无关”`) }
      return true
    }
    if (s.ph === 2) {
      s.H -= 0.3 * d
      if (s.H <= 1.3) { s.ph = 3; tl.switchTo('③ 继续拉开', '#F5C542', t, `t=${f2(t)}s 杆高 2.2→${f2(s.H)} m，T 恒为 ${f1(T)} N（与杆高无关 ✔）；继续拉开`) }
      return true
    }
    if (s.ph === 3) {
      s.d += p.vp * d
      if (T > p.Tmax) { snap(); return true }
      if (s.d >= p.L * 0.985) { tl.log(t, `d 已接近 L（${f2(s.d)} m），T=${f1(T)} N 仍未超过 T_max=${p.Tmax} N：本组参数拉不断`); return false }
      return true
    }
    s.vy -= G * d; s.y += s.vy * d
    if (s.y <= 0.12) { tl.log(t, `衣服落地（绳断后自由落体）`); return false }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const PX = Math.min((h - 120) / 2.8, (w - 160) / Math.max(p.L * 1.1, s.d * 1.2))
    const gy = h - 70, cx = w / 2
    const X = (x: number) => cx + x * PX, Y = (y: number) => gy - y * PX
    // 地面与两杆
    ctx.fillStyle = '#23233a'; ctx.fillRect(20, gy, w - 40, 6)
    for (const sgn of [-1, 1]) {
      ctx.fillStyle = '#5c5c7a'; ctx.fillRect(X((sgn * s.d) / 2) - 5, Y(s.H), 10, s.H * PX)
      ctx.fillStyle = '#8a8aa0'; ctx.fillRect(X((sgn * s.d) / 2) - 5, Y(s.H), 10, 4)
    }
    dc.label(`杆高 H=${f2(s.H)} m`, X(-s.d / 2), Y(s.H) - 14, '#8a8aa0', 10)
    const T = tension(p, s.d)
    if (!s.broken) {
      const yc = s.H - 0.5 * Math.sqrt(Math.max(0, p.L * p.L - s.d * s.d))
      rope(ctx, [[X(-s.d / 2), Y(s.H)], [cx, Y(yc)], [X(s.d / 2), Y(s.H)]], '#d9a05a', 2.5)
      // 衣服
      ctx.fillStyle = '#4A90D9'; ctx.fillRect(cx - 13, Y(yc), 26, 26)
      ctx.fillStyle = '#ffffff22'; ctx.fillRect(cx - 13, Y(yc), 26, 7)
      const k = 90 / p.Tmax   // 统一力比例尺：T_max 对应 90 px
      dc.arrow(cx, Y(yc) + 26, 0, Math.max(28, p.m * G * k), '#E05555', `mg=${f1(p.m * G)}N`)
      const hyp = Math.hypot(cx - X(-s.d / 2), Y(yc) - Y(s.H))
      const ux = (cx - X(-s.d / 2)) / hyp, uy = (Y(s.H) - Y(yc)) / hyp
      const tl2 = Math.max(28, T * k)
      dc.arrow(cx, Y(yc), -ux * tl2, uy * tl2, '#3ecf8e', `T=${f1(T)}N`)
      dc.arrow(cx, Y(yc), ux * tl2, uy * tl2, '#3ecf8e', `T`)
      dc.label(`sinα = d/L = ${f2(s.d / p.L)}　α = ${f1((Math.asin(Math.min(1, s.d / p.L)) * 180) / Math.PI)}°　T = mg/(2cosα) = ${f1(T)} N（与杆高 H 无关）`, w / 2, 84, '#8a8aa0', 11)
    } else {
      const yc = s.y
      ctx.fillStyle = '#4A90D9'; ctx.fillRect(cx - 13, gy - yc * PX - 26, 26, 26)
      rope(ctx, [[X(-s.d / 2), Y(s.H)], [X(-s.d / 2) + 24, Y(s.H) + 30]], '#E0555544', 2)
      rope(ctx, [[X(s.d / 2), Y(s.H)], [X(s.d / 2) - 24, Y(s.H) + 30]], '#E0555544', 2)
      dc.label('绳已断！', cx, gy - yc * PX - 44, '#E05555', 13)
    }
    // 张力 vs 最大承受力条
    ctx.fillStyle = '#23233a'; ctx.fillRect(w - 150, 24, 130, 10)
    ctx.fillStyle = T / p.Tmax > 1 ? '#E05555' : T / p.Tmax > 0.75 ? '#F5C542' : '#3ecf8e'
    ctx.fillRect(w - 150, 24, Math.max(2, Math.min(130, (T / p.Tmax) * 130)), 10)
    dc.label(`T ${f1(T)} / T_max ${p.Tmax} N`, w - 150, 48, '#8a8aa0', 10)
  },
  energy(s, p) {
    const yc = s.broken ? s.y : s.H - 0.5 * Math.sqrt(Math.max(0, p.L * p.L - s.d * s.d))
    const Ek = 0.5 * p.m * s.vy * s.vy
    return { items: [{ name: '衣服动能', value: Ek, color: '#F5C542' }, { name: '重力势能', value: p.m * G * yc, color: '#4A90D9' }], E0: Math.max(1e-9, p.m * G * yc + Ek) }
  },
  readout(p, s) {
    const T = s ? tension(p, s.d) : tension(p, Math.min(p.d0, p.L * 0.7))
    const dBr = dBreak(p)
    const PH = ['', '①拉开两杆：sinα=d/L 增大 → cosα 减小 → T 增大', '②降杆：杆高变化而 d 不变，T 恒为 mg/(2cosα)（与杆高无关）', '③继续拉开直至 T>T_max', '④绳断，衣服自由落体']
    return `理论：T = mg/(2cosα) = mgL/(2√(L²−d²))${s ? `，当前 d=${f2(s.d)} m → T=${f1(T)} N（T_max=${p.Tmax} N）` : ''}
断绳临界 d = L√(1−(mg/2T_max)²) = ${f2(dBr)} m${s ? `（当前 d ${s.d >= dBr ? '已超过 → 断' : '未到'}）` : ''}
${s ? `${PH[s.ph]}${s.broken ? `\n断绳后 vy=${f2(s.vy)} m/s，衣服高度 ${f2(s.y)} m` : ''}` : ''}`
  },
  solution(p) {
    const T0 = (p.m * G) / (2 * Math.sqrt(Math.max(1e-9, 1 - (p.d0 / p.L) ** 2)))
    const dBr = dBreak(p)
    return {
      problemType: '晾衣绳（衣服挂绳中点）：求绳张力；判断拉开两杆/换更高杆时张力如何变化、何时断',
      hints: ['衣服受重力 mg 和两段绳的拉力，三力共点平衡', '两段绳关于中垂线对称，与竖直方向夹角相同 α', '几何：半绳长 L/2，水平投影 d/2 → sinα = d/L', '杆变高时这段几何关系变了吗？'],
      processes: ['过程一：缓慢拉开两杆（准静态，每刻都平衡）', '过程二：保持 d 不变、改变杆高（验证无关）', '过程三：T 超过最大承受力 → 绳断，衣服做自由落体'],
      forces: ['衣服：重力 mg（竖直向下）+ 左右两段绳拉力 T（沿绳斜向上）', '杆：受绳拉力（大小也是 T，方向沿绳）'],
      laws: ['共点力平衡：竖直方向 2T cosα = mg；水平方向自动对称抵消', '几何约束：sinα = (d/2)/(L/2) = d/L（绳不可伸长）'],
      critical: ['T = mgL/(2√(L²−d²))：d→L 时 T→∞（绳“拉不断”的理想绳不存在）', '断绳条件 d > L√(1−(mg/2T_max)²)', '张力与杆高 H 完全无关——只有 d/L 进入公式'],
      derivation: ['2T cosα = mg → T = mg/(2cosα)', 'sinα = d/L → cosα = √(1−sin²α) = √(L²−d²)/L', 'T = mgL/(2√(L²−d²)) = mg/(2√(1−(d/L)²))', '断绳：mgL/(2√(L²−d²)) = T_max → d = L√(1−(mg/(2T_max))²)'],
      numeric: [`初始 d₀=${f2(p.d0)} m：T = ${f1(T0)} N`, `断绳临界 d = ${f2(dBr)} m（L=${f2(p.L)}，T_max=${p.Tmax} N）`, `d=0.95L 时 T = ${f1((p.m * G) / (2 * Math.sqrt(1 - 0.95 ** 2)))} N（急剧增大）`],
      pitfalls: ['把“绳与水平方向夹角”代入 cosα 的位置（应是与竖直方向的夹角）', '认为杆越高张力越大/越小——张力只看 d/L', '两段绳拉力大小不等（对称悬挂必相等；不对称悬挂才需另算）', '绳断瞬间认为衣服向上弹（无约束即自由落体）'],
      similar: ['挂画线的张力（两点悬挂中垂物）', '钢索吊桥/悬索的张力随垂度变化', '“两个人拉不平的绳”问题：绳越平张力越大'],
      competition: ['悬挂点不等高的一般解（两段绳与竖直夹角不同，用拉密定理）', '绳有质量时悬链线方程', '考虑绳弹性（劲度 k）时的伸长与张力关系'],
    }
  },
}
