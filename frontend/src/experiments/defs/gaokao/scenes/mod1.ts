/**
 * B11 近代物理组 1（纯 2D）：光电效应 + Eₖ–ν 图像（模型61）· 氢原子能级跃迁（模型62）
 */
import type { MechSceneDef } from '../../../engine/mechScene'

const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')
import { H_EV as H_EV_SI, energyLevel, HC_EV_NM } from '../../../../physics/modern-physics'
const H_EV = H_EV_SI * 1e14   // 共享常数（P3 收口包）：h=4.1357e-15 eV·s → 10¹⁴Hz 单位 0.41357

/* ══════════ 模型 61：光电效应 + Eₖ–ν 图像 ══════════ */
const MATS = [{ value: 0, label: '钠 Na（W₀=2.28 eV）', W: 2.28 }, { value: 1, label: '钾 K（W₀=2.25 eV）', W: 2.25 }, { value: 2, label: '铯 Cs（W₀=1.94 eV）', W: 1.94 }, { value: 3, label: '锌 Zn（W₀=4.31 eV）', W: 4.31 }, { value: 4, label: '铜 Cu（W₀=4.70 eV）', W: 4.70 }]
interface Ph { x: number; y: number }
interface S61 { nu: number; pts: number[][]; photons: Ph[]; electrons: Ph[]; spawn: number; passed: boolean; done: boolean; fit?: { k: number; b: number } }
const NU0 = 3, NU1 = 12, SWEEP = 7
function nuColor(nu: number): string {
  const t = Math.min(1, Math.max(0, (nu - 4) / 4))   // 4→红 8→紫
  const r = Math.round(230 - 150 * t), g = Math.round(60 + 40 * (1 - Math.abs(t - 0.5) * 2)), b = Math.round(60 + 190 * t)
  return `rgb(${r},${g},${b})`
}
export const photoelectricEkNu: MechSceneDef<S61> = {
  id: 'gk-photoelectric-ek-nu',
  title: '光电效应 + Eₖ–ν 图像（斜率 h · 截距 −W₀ · 截止频率）',
  desc: '光照射光电管阴极：ν<ν₀ 无论多强都无光电子；ν≥ν₀ 时最大初动能 Eₖ=hν−W₀ 与光强无关（光强只改变光电子数目）。播放时频率从 3 扫到 12（×10¹⁴ Hz），右侧实时画出 Eₖ–ν 图：直线斜率 = 普朗克常量 h，横截距 = 截止频率 ν₀，纵截距 = −W₀。',
  formula: 'Eₖ=hν−W₀　ν₀=W₀/h　eU₀=Eₖ　h=6.63×10⁻³⁴ J·s=4.14×10⁻¹⁵ eV·s（图中斜率 0.414 eV/10¹⁴Hz）',
  params: [
    { key: 'mat', label: '阴极材料', min: 0, max: 4, step: 1, default: 0, options: MATS.map((m) => ({ value: m.value, label: m.label })) },
    { key: 'I', label: '光强（相对）', min: 1, max: 5, step: 1, default: 2 },
    { key: 'nu', label: '未播放时的固定频率 ν', min: 3, max: 12, step: 0.1, default: 6, unit: '×10¹⁴ Hz' },
  ],
  h: 1 / 200,
  init(p, tl) {
    tl.start('扫频：ν 从 3 → 12（×10¹⁴ Hz）', '#F5C542')
    return { nu: p.nu, pts: [], photons: [], electrons: [], spawn: 0, passed: false, done: false }
  },
  step(s, p, d, t, tl) {
    const W = MATS[p.mat].W, nu0 = W / H_EV
    s.nu = NU0 + ((NU1 - NU0) * Math.min(t, SWEEP)) / SWEEP
    const Ek = Math.max(0, H_EV * s.nu - W)
    s.spawn += d * (3 + 2 * p.I)
    while (s.spawn >= 1) { s.spawn -= 1; s.photons.push({ x: 0, y: 0.2 + 0.6 * Math.random() }) }
    for (const ph of s.photons) ph.x += 1.6 * d
    const arrived = s.photons.filter((ph) => ph.x >= 1)
    s.photons = s.photons.filter((ph) => ph.x < 1)
    if (Ek > 0) for (const a of arrived) s.electrons.push({ x: 1, y: a.y })
    const ve = 0.25 + 0.5 * Math.sqrt(Ek)
    for (const e of s.electrons) e.x += ve * d
    s.electrons = s.electrons.filter((e) => e.x < 2)
    const last = s.pts[s.pts.length - 1]
    if (!last || s.nu - last[0] >= 0.1) s.pts.push([s.nu, Ek])
    if (!s.passed && s.nu >= nu0) { s.passed = true; tl.switchTo('ν≥ν₀：开始有光电子', '#3ecf8e', t, `t=${f2(t)}s 达到截止频率 ν₀=W₀/h=${f2(nu0)}×10¹⁴ Hz（λ₀=${Math.round(3000 / nu0)} nm），开始逸出光电子`) }
    if (!s.done && t >= SWEEP) {
      s.done = true
      const on = s.pts.filter((q) => q[1] > 0)
      const n = on.length, sx = on.reduce((a, q) => a + q[0], 0), sy = on.reduce((a, q) => a + q[1], 0), sxx = on.reduce((a, q) => a + q[0] * q[0], 0), sxy = on.reduce((a, q) => a + q[0] * q[1], 0)
      const k = (n * sxy - sx * sy) / (n * sxx - sx * sx), b = (sy - k * sx) / n
      s.fit = { k, b }
      tl.log(t, `扫频结束：拟合直线斜率=${f3(k)} eV/(10¹⁴Hz)（h 理论 ${H_EV}），纵截距=${f2(b)} eV（−W₀=${-W}），横截距 ν₀=${f2(-b / k)}`)
      return false
    }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const W = MATS[p.mat].W, nu0 = W / H_EV, Ek = Math.max(0, H_EV * s.nu - W)
    // 左：光电管
    const lx0 = 30, lw = w * 0.42, ty0 = 70, th = h - 200
    ctx.fillStyle = '#1d1d33'; ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.roundRect(lx0, ty0, lw, th, 16); ctx.fill(); ctx.stroke()
    const cathX = lx0 + lw * 0.5, anX = lx0 + lw * 0.92
    ctx.fillStyle = '#8a8aa0'; ctx.fillRect(cathX - 4, ty0 + 20, 8, th - 40)   // 阴极 K
    ctx.fillRect(anX - 3, ty0 + th * 0.3, 6, th * 0.4)                             // 阳极 A
    dc.label('K（阴极）', cathX, ty0 + th + 14, '#8a8aa0', 10); dc.label('A（阳极）', anX, ty0 + th + 14, '#8a8aa0', 10)
    dc.label(MATS[p.mat].label, cathX, ty0 - 10, '#b0b0cc', 11)
    // 光子（波浪短线）
    ctx.lineWidth = 2
    for (const ph of s.photons) {
      const x = lx0 + 10 + ph.x * (cathX - 14 - lx0 - 10), y = ty0 + 20 + ph.y * (th - 40)
      ctx.strokeStyle = nuColor(s.nu); ctx.beginPath()
      for (let i = 0; i <= 12; i++) ctx.lineTo(x - 14 + i * 2.3, y + Math.sin(i * 1.2) * 3); ctx.stroke()
    }
    // 光电子
    ctx.fillStyle = '#F5C542'
    for (const e of s.electrons) { const x = cathX + 6 + (e.x - 1) * (anX - cathX - 12), y = ty0 + 20 + e.y * (th - 40); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill() }
    dc.label(`ν=${f2(s.nu)}×10¹⁴ Hz　光强 ${p.I}`, lx0 + lw / 2, ty0 + th - 12, nuColor(s.nu), 11)
    dc.label(Ek > 0 ? `Eₖ,max=hν−W₀=${f2(Ek)} eV　遏止电压 U₀=${f2(Ek)} V` : `ν<ν₀=${f2(nu0)}：无光电子（与光强无关）`, lx0 + lw / 2, 40, Ek > 0 ? '#3ecf8e' : '#E05555', 12)
    // 右：Eₖ–ν
    const gx0 = lx0 + lw + 70, gx1 = w - 30, gy0 = h - 130, gTop = 60
    const EkMax = H_EV * NU1 - 1.9, EkMin = -5
    const X = (nu: number) => gx0 + ((nu - 0) / NU1) * (gx1 - gx0), Y = (e: number) => gy0 - ((e - EkMin) / (EkMax - EkMin)) * (gy0 - gTop)
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx0, gTop); ctx.lineTo(gx0, gy0); ctx.moveTo(gx0, Y(0)); ctx.lineTo(gx1, Y(0)); ctx.stroke()
    for (let nu = 2; nu <= NU1; nu += 2) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(X(nu), Y(0) - 3, 1, 6); dc.label(String(nu), X(nu), Y(0) + 12, '#565675', 9) }
    for (let e = -4; e <= 3; e += 1) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(gx0 - 3, Y(e), 6, 1); dc.label(String(e), gx0 - 14, Y(e), '#565675', 9) }
    dc.label('Eₖ/eV', gx0 + 20, gTop - 10, '#8a8aa0', 10); dc.label('ν/10¹⁴Hz', gx1 - 20, Y(0) + 26, '#8a8aa0', 10)
    // 理论直线（延长到纵轴）
    ctx.setLineDash([4, 4]); ctx.strokeStyle = '#56567599'; ctx.beginPath(); ctx.moveTo(X(0), Y(-W)); ctx.lineTo(X(nu0), Y(0)); ctx.stroke(); ctx.setLineDash([])
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(nu0), Y(0)); ctx.lineTo(X(NU1), Y(H_EV * NU1 - W)); ctx.stroke()
    ctx.fillStyle = '#3ecf8e'
    for (const [nu, e] of s.pts) { ctx.beginPath(); ctx.arc(X(nu), Y(e), 2.5, 0, Math.PI * 2); ctx.fill() }
    ctx.fillStyle = nuColor(s.nu); ctx.beginPath(); ctx.arc(X(s.nu), Y(Ek), 5, 0, Math.PI * 2); ctx.fill()
    dc.label(`ν₀=${f2(nu0)}`, X(nu0), Y(0) - 12, '#F5C542', 10)
    dc.label(`−W₀=${-W} eV`, gx0 + 44, Y(-W), '#F5C542', 10)
    dc.label('斜率 = h', X(9.5) + 26, Y(H_EV * 9.5 - W) - 12, '#F5C542', 10)
    if (s.fit) dc.label(`拟合：斜率 ${f3(s.fit.k)}，截距 ${f2(s.fit.b)}`, (gx0 + gx1) / 2, h - 90, '#3ecf8e', 11)
  },
  readout(p, s) {
    const W = MATS[p.mat].W, nu0 = W / H_EV, nu = s ? s.nu : p.nu
    const Ek = Math.max(0, H_EV * nu - W)
    return `${MATS[p.mat].label}：ν₀=W₀/h=${f2(nu0)}×10¹⁴ Hz，λ₀=c/ν₀=${Math.round(3000 / nu0)} nm
当前 ν=${f2(nu)}：${Ek > 0 ? `Eₖ,max=hν−W₀=${f2(Ek)} eV，U₀=Eₖ/e=${f2(Ek)} V（光强只影响电流大小）` : '低于截止频率，无光电效应'}
图线：Eₖ=hν−W₀ → 斜率 h=${H_EV} eV/(10¹⁴Hz)，纵截距 −W₀，横截距 ν₀`
  },
  solution(p) {
    const W = MATS[p.mat].W, nu0 = W / H_EV
    return {
      problemType: '光电效应 Eₖ–ν 图像：由图线求 h、W₀、ν₀；判断光强/频率改变时的现象',
      hints: ['一个光子只被一个电子吸收：能量账 hν=W₀+Eₖ', '图线是直线，斜率就是 h（与材料无关），换材料只平移', '横截距是截止频率 ν₀，纵截距的绝对值是逸出功', '遏止电压 U₀ 由 Eₖ=eU₀ 定，与光强无关'],
      processes: ['光子入射 → 电子吸收 hν → 克服 W₀ 逸出 → 剩余为 Eₖ', '加反向电压到 U₀ 时光电流恰为零', '改变 ν：Eₖ 线性变化；改变光强：只改变饱和电流'],
      forces: ['电子逸出后在电场中减速（反向电压）或加速（正向电压）'],
      laws: ['爱因斯坦光电效应方程 Eₖ=hν−W₀', 'eU₀=Eₖ', 'ν₀=W₀/h，λ₀=c/ν₀'],
      critical: ['ν<ν₀：无论光强多大都不发生', 'ν=ν₀：Eₖ=0，刚好逸出', '光强越大饱和电流越大，但 U₀ 不变'],
      derivation: ['Eₖ=hν−W₀ 为一次函数：斜率 h、截距 −W₀', '令 Eₖ=0 → ν₀=W₀/h', 'U₀=(hν−W₀)/e'],
      numeric: [`W₀=${W} eV → ν₀=${f2(nu0)}×10¹⁴ Hz，λ₀=${Math.round(3000 / nu0)} nm`, `ν=8×10¹⁴ Hz：Eₖ=${f2(H_EV * 8 - W)} eV，U₀=${f2(H_EV * 8 - W)} V`, `不同材料图线平行（斜率都是 h）`],
      pitfalls: ['以为光强大就能发生光电效应', 'U₀ 与光强有关（错）', '把纵截距当 W₀（应为 −W₀）', 'h 的单位换算（eV·s 与 J·s）'],
      similar: ['伏安特性曲线（饱和电流、遏止电压）', '康普顿效应', '氢原子光谱'],
      competition: ['密立根实验测 h 的数据处理', '多光子光电效应', '光电子的角分布'],
    }
  },
}

/* ══════════ 模型 62：氢原子能级跃迁 ══════════ */
const E_N = energyLevel   // 共享物理源（P3 收口包）
interface Jump { from: number; to: number; dE: number; lam: number }
interface S62 { jumps: Jump[]; k: number; ph: 0 | 1 | 2; tk: number; photons: { x: number; y: number; lam: number; born: number }[]; done: boolean }
function lamColor(lam: number): string {
  if (lam < 380) return '#b06ce6'
  if (lam > 780) return '#E05555'
  const t = (lam - 380) / 400
  const stops: [number, string][] = [[0, '#8b00ff'], [0.15, '#4a4aff'], [0.3, '#00c8ff'], [0.45, '#3ecf8e'], [0.6, '#f5f542'], [0.8, '#ff8c00'], [1, '#ff2020']]
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) return stops[i][1]
  return '#ff2020'
}
const series = (to: number) => ['', '莱曼系（紫外）', '巴耳末系（可见）', '帕邢系（红外）', '布拉开系（红外）'][to] ?? '红外'
export const hydrogenLevels: MechSceneDef<S62> = {
  id: 'gk-hydrogen-levels',
  title: '氢原子能级跃迁（能级图 · ΔE=hν · 谱线条数）',
  desc: 'Eₙ=−13.6/n² eV。电子从高能级跃迁到低能级放出光子 hν=Eₘ−Eₙ（λ=1240/ΔE nm）；反之吸收。单次模式看一次跃迁；“大量原子处于 n 能级”模式依次演示全部向下跃迁，谱线条数 C(n,2)=n(n−1)/2。光子波包按波长着色（可见光 380–780 nm）。',
  formula: 'Eₙ=E₁/n²，E₁=−13.6 eV　hν=Eₘ−Eₙ=13.6(1/n²−1/m²) eV　λ=hc/ΔE=1240 nm·eV/ΔE　条数 C(n,2)=n(n−1)/2',
  params: [
    { key: 'mode', label: '模式', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '单次跃迁 m → n' }, { value: 1, label: '大量原子处于 m 能级：全部向下跃迁' }] },
    { key: 'm', label: '初能级 m', min: 2, max: 6, step: 1, default: 3 },
    { key: 'n', label: '末能级 n（单次模式）', min: 1, max: 5, step: 1, default: 2 },
  ],
  h: 1 / 200,
  init(p, tl) {
    const jumps: Jump[] = []
    if (p.mode === 0) { const dE = E_N(p.n) - E_N(p.m); jumps.push({ from: p.m, to: p.n, dE, lam: HC_EV_NM / Math.abs(dE) }) }
    else for (let a = p.m; a >= 2; a--) for (let b = a - 1; b >= 1; b--) { const dE = E_N(b) - E_N(a); jumps.push({ from: a, to: b, dE, lam: HC_EV_NM / Math.abs(dE) }) }
    tl.start(p.mode === 0 ? `跃迁 ${p.m} → ${p.n}` : `n=${p.m} 能级全部向下跃迁（共 ${jumps.length} 条）`, '#F5C542')
    return { jumps, k: 0, ph: 0, tk: 0, photons: [], done: false }
  },
  step(s, _p, d, t, tl) {
    s.tk += d
    const J = s.jumps[s.k]
    if (!J) return false
    if (s.ph === 0 && s.tk >= 0.4) { s.ph = 1; s.tk = 0 }
    else if (s.ph === 1 && s.tk >= 1.0) {
      s.ph = 2; s.tk = 0
      const emit = J.dE < 0
      s.photons.push({ x: 0, y: (E_N(J.from) + E_N(J.to)) / 2, lam: J.lam, born: t })
      tl.log(t, `${J.from}→${J.to}：${emit ? '放出' : '吸收'}光子 ΔE=${f2(Math.abs(J.dE))} eV，λ=${Math.round(J.lam)} nm（${J.to <= 4 && emit ? series(J.to) : '—'}）`)
    } else if (s.ph === 2 && s.tk >= 0.9) {
      s.k++; s.ph = 0; s.tk = 0
      if (s.k >= s.jumps.length) { tl.switchTo('结束', '#8a8aa0', t, `共 ${s.jumps.length} 条谱线${s.jumps.length > 1 ? `（C(${s.jumps[0].from},2)=${s.jumps[0].from}(${s.jumps[0].from}−1)/2）` : ''}，其中可见光 ${s.jumps.filter((j) => j.lam >= 380 && j.lam <= 780).length} 条`); s.done = true; return false }
    }
    for (const ph of s.photons) ph.x += 1.2 * d
    s.photons = s.photons.filter((ph) => ph.x < 1.05)
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const lx = 90, lw = w * 0.45, top = 70, bot = h - 110
    const Y = (E: number) => top + ((0 - E) / 13.6) ** 0.55 * (bot - top)   // 非线性压缩，让高能级分得开
    ctx.strokeStyle = '#3a3a5e'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx - 30, top - 10); ctx.lineTo(lx - 30, bot + 10); ctx.stroke()
    dc.label('E/eV', lx - 30, top - 22, '#8a8aa0', 10)
    for (let n = 1; n <= 6; n++) {
      const y = Y(E_N(n))
      ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = n === 1 ? 2 : 1.5; ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + lw, y); ctx.stroke()
      dc.label(`n=${n}`, lx + lw + 22, y, '#b0b0cc', 11); dc.label(`${E_N(n).toFixed(2)}`, lx - 30 - 22, y, '#8a8aa0', 10)
    }
    const yInf = Y(0); ctx.setLineDash([3, 4]); ctx.strokeStyle = '#565675'; ctx.beginPath(); ctx.moveTo(lx, yInf); ctx.lineTo(lx + lw, yInf); ctx.stroke(); ctx.setLineDash([])
    dc.label('n=∞（电离，E=0）', lx + lw + 44, yInf, '#565675', 10)
    // 电子
    const J = s.jumps[s.k] ?? s.jumps[s.jumps.length - 1]
    if (J) {
      const ex = lx + lw * (0.2 + 0.6 * ((s.k % 3) / 2))
      const y0 = Y(E_N(J.from)), y1 = Y(E_N(J.to))
      const f = s.ph === 0 ? 0 : s.ph === 1 ? Math.min(1, s.tk / 1.0) : 1
      const ey = y0 + (y1 - y0) * f
      if (s.ph === 1) { ctx.strokeStyle = '#F5C54288'; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(ex, y0); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]) }
      ctx.fillStyle = '#F5C542'; ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill()
      dc.label('e⁻', ex + 14, ey - 8, '#F5C542', 10)
      if (s.ph === 1) dc.arrow(ex - 16, y0, 0, (y1 - y0) * 0.9, J.dE < 0 ? '#3ecf8e' : '#E05555')
    }
    // 光子波包（向右飞出到“光谱屏”）
    const sx0 = lx + lw + 120, sx1 = w - 40
    ctx.fillStyle = '#14142a'; ctx.strokeStyle = '#3a3a5e'; ctx.beginPath(); ctx.roundRect(sx0 - 10, top - 10, sx1 - sx0 + 20, bot - top + 20, 8); ctx.fill(); ctx.stroke()
    dc.label('光谱（按波长着色）', (sx0 + sx1) / 2, top - 22, '#8a8aa0', 10)
    for (const ph of s.photons) {
      const x = lx + lw + 30 + ph.x * (sx1 - lx - lw - 40), y = Y(ph.y)
      ctx.strokeStyle = lamColor(ph.lam); ctx.lineWidth = 2.5; ctx.beginPath()
      for (let i = 0; i <= 16; i++) ctx.lineTo(x - 20 + i * 2.5, y + Math.sin(i * (ph.lam < 500 ? 1.6 : 1.0)) * 4); ctx.stroke()
      dc.label(`${Math.round(ph.lam)} nm`, x, y - 12, lamColor(ph.lam), 9)
    }
    // 已发出谱线（竖线标在屏上，位置按 1/λ）
    s.jumps.slice(0, s.k + (s.ph === 2 ? 1 : 0)).forEach((j) => {
      const pos = Math.min(1, Math.max(0, (1 / j.lam - 1 / 2000) / (1 / 90 - 1 / 2000)))
      const x = sx0 + pos * (sx1 - sx0)
      ctx.fillStyle = lamColor(j.lam); ctx.fillRect(x - 1.5, bot - 40, 3, 30)
      dc.label(`${j.from}→${j.to}`, x, bot - 48, lamColor(j.lam), 8)
    })
    dc.label('紫外 ← 可见 → 红外（按 1/λ 排列）', (sx0 + sx1) / 2, bot + 4, '#565675', 9)
  },
  readout(p) {
    if (p.mode === 0) { const dE = E_N(p.n) - E_N(p.m); return `E_${p.m}=${E_N(p.m).toFixed(2)} eV，E_${p.n}=${E_N(p.n).toFixed(2)} eV\nΔE=${f2(Math.abs(dE))} eV → ${dE < 0 ? '放出' : '吸收'}光子 λ=1240/ΔE=${Math.round(HC_EV_NM / Math.abs(dE))} nm（${dE < 0 && p.n <= 4 ? series(p.n) : '—'}）` }
    const N = (p.m * (p.m - 1)) / 2
    return `处于 n=${p.m} 的大量氢原子向下跃迁：谱线 C(${p.m},2)=${N} 条\n最长波长 ${p.m}→${p.m - 1}：${Math.round(HC_EV_NM / (E_N(p.m) - E_N(p.m - 1)))} nm；最短波长 ${p.m}→1：${Math.round(HC_EV_NM / (E_N(p.m) - E_N(1)))} nm`
  },
  solution(p) {
    const dE = Math.abs(E_N(p.n) - E_N(p.m))
    return {
      problemType: '氢原子能级跃迁：求光子能量/波长、谱线条数、电离能',
      hints: ['先写能级 Eₙ=−13.6/n²，注意负号', '光子能量 = 两能级之差（取绝对值），放出还是吸收看方向', '波长用 λ=1240/ΔE（nm·eV）速算', '“一群原子”与“一个原子”的谱线条数不同：一群用 C(n,2)'],
      processes: ['原子处于激发态 m', '跃迁到 n：放出光子 hν=Eₘ−Eₙ', '（一群原子）所有可能的向下跃迁依次发生'],
      forces: ['库仑力提供电子绕核的向心力（玻尔模型）；本题只用能级公式'],
      laws: ['能级公式 Eₙ=E₁/n²', '频率条件 hν=Eₘ−Eₙ', '组合数 C(n,2)=n(n−1)/2'],
      critical: ['电离：n→∞，E=0，电离能=|Eₙ|', '入射光子必须恰好等于能级差才能被吸收；入射电子只需 ≥ 能级差', '可见光只有巴耳末系（n→2）的前几条'],
      derivation: ['ΔE=13.6(1/n²−1/m²) eV', 'λ=hc/ΔE=1240/ΔE nm', p.mode === 1 ? `C(${p.m},2)=${(p.m * (p.m - 1)) / 2}` : `${p.m}→${p.n}：ΔE=${f2(dE)} eV`],
      numeric: [p.mode === 0 ? `ΔE=${f2(dE)} eV，λ=${Math.round(HC_EV_NM / dE)} nm` : `共 ${(p.m * (p.m - 1)) / 2} 条谱线`, `基态电离能 13.6 eV；n=2 电离能 3.4 eV`, `巴耳末系：656（3→2）、486（4→2）、434（5→2）、410 nm（6→2）`],
      pitfalls: ['能级差算成 Eₘ+Eₙ', '一个原子按 C(n,2) 算条数（一个原子最多 n−1 条）', '用光子能量大于能级差也能吸收（错，必须相等）', 'λ 与 ΔE 成正比（错，反比）'],
      similar: ['类氢离子（He⁺）能级 Z² 倍', '弗兰克–赫兹实验', '光电效应 + 跃迁组合题'],
      competition: ['里德伯公式与量子数', '精细结构与塞曼效应', '玻尔模型的对应原理'],
    }
  },
}
