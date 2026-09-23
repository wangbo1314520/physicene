import { pathDiff as pathDiffFn } from '../../../../physics/wave'
/**
 * B11 光学与振动波组 2（纯 2D）：薄膜干涉（模型56）· 单缝衍射 vs 双缝干涉（模型57）· 波的叠加与干涉（模型60）
 */
import { pathDiff } from '../../../../physics/wave'
import type { MechSceneDef } from '../../../engine/mechScene'

const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '—')
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
function lamColor(lam: number): string {
  const t = Math.min(1, Math.max(0, (lam - 400) / 300))
  const r = Math.round(90 + 165 * t), g = Math.round(60 + 160 * (1 - Math.abs(t - 0.45) * 2.2)), b = Math.round(255 - 235 * t)
  const hx = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${hx(r)}${hx(g)}${hx(b)}`
}

/* ══════════ 模型 56：薄膜干涉（劈尖等厚条纹） ══════════ */
interface S56 { xProbe: number; done: boolean }
export const thinFilm: MechSceneDef<S56> = {
  id: 'gk-thin-film',
  title: '薄膜干涉（劈尖 · 等厚条纹 · 半波损失）',
  desc: '两块玻璃板夹成小角度 α 的空气劈尖，单色光垂直照射：上下两表面反射光的光程差 δ=2nd+λ/2（下表面反射有半波损失）。同一厚度处光程差相同 → 条纹平行于棱边（等厚条纹）；相邻亮纹厚度差 λ/2n，间距 Δx=λ/(2nα)。探针沿劈尖移动，实时显示该处 d、δ 与明暗。',
  formula: 'δ=2nd+λ/2　亮纹 2nd=(k+½)λ·… 即相邻亮纹 Δd=λ/2n　Δx=Δd/α=λ/(2nα)　棱边 d=0 为暗纹（半波损失）',
  params: [
    { key: 'lam', label: '波长 λ', min: 400, max: 700, step: 10, default: 600, unit: 'nm' },
    { key: 'alpha', label: '劈尖角 α', min: 1, max: 6, step: 0.5, default: 2, unit: '×10⁻⁴ rad' },
    { key: 'n', label: '膜层折射率 n', min: 1.0, max: 1.6, step: 0.03, default: 1.0 },
  ],
  h: 1 / 200,
  init(p, tl) { tl.start('探针从棱边向厚端扫描', '#F5C542'); tl.log(0, `棱边 d=0：δ=λ/2 → 暗纹（半波损失）；条纹间距 Δx=λ/(2nα)=${f2((p.lam * 1e-9) / (2 * p.n * p.alpha * 1e-4) * 1e3)} mm`); return { xProbe: 0, done: false } },
  step(s, p, d, t, tl) {
    const dx = (p.lam * 1e-9) / (2 * p.n * p.alpha * 1e-4) * 1e3   // mm
    s.xProbe = Math.min(12, t * 2.4)
    const k = s.xProbe / dx
    const prevK = (s.xProbe - 2.4 * d) / dx
    if (Math.floor(k + 0.5) !== Math.floor(prevK + 0.5) && k > 0.3) { const kk = Math.floor(k + 0.5); if (kk <= 4) tl.log(t, `x=${f2(kk * dx)} mm：d=${f2((kk * p.lam) / (2 * p.n))} nm=${kk}·λ/2n → δ=2nd+λ/2=(${kk}+½)λ → 第 ${kk} 级亮纹`) }
    if (s.xProbe >= 12) { tl.log(t, `扫描结束：12 mm 内约 ${Math.floor(12 / dx)} 条亮纹；α 增大条纹变密，λ 增大条纹变疏`); return false }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const dx = (p.lam * 1e-9) / (2 * p.n * p.alpha * 1e-4) * 1e3
    // 侧视：劈尖
    const x0 = 50, x1 = w - 50, yb = h / 2 + 10, PX = (x1 - x0) / 12
    ctx.fillStyle = '#4A90D922'; ctx.strokeStyle = '#9cc5ff'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x0, yb); ctx.lineTo(x1, yb); ctx.lineTo(x1, yb - 90); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#9cc5ff33'; ctx.fillRect(x0, yb, x1 - x0, 14); ctx.fillRect(x0, yb - 104, x1 - x0, 14)
    dc.label('上玻璃板（斜置，夸大 α）', (x0 + x1) / 2, yb - 120, '#8a8aa0', 10); dc.label('下玻璃板', (x0 + x1) / 2, yb + 26, '#8a8aa0', 10)
    dc.label('棱边 d=0', x0 + 10, yb + 44, '#F5C542', 10)
    // 入射与两束反射光（探针处）
    const px = x0 + s.xProbe * PX, dHere = (s.xProbe / (x1 - x0) * (x1 - x0)) * p.alpha * 1e-4 * 1e6 // nm
    const yTop = yb - (s.xProbe / 12) * 90
    dc.arrow(px, yb - 190, 0, 80, lamColor(p.lam), '入射')
    dc.arrow(px + 6, yTop, 18, -70, lamColor(p.lam) + 'aa', '①上表面反射')
    dc.arrow(px + 12, yb, 24, -(yb - yTop) - 70, lamColor(p.lam) + 'aa', '②下表面反射(+λ/2)')
    ctx.strokeStyle = '#F5C542'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(px, yTop); ctx.lineTo(px, yb); ctx.stroke(); ctx.setLineDash([])
    const delta = 2 * p.n * dHere + p.lam / 2, order = delta / p.lam
    const bright = Math.abs(order - Math.round(order)) < 0.25
    dc.label(`探针 x=${f2(s.xProbe)} mm：d=${f1(dHere)} nm，δ=2nd+λ/2=${f1(delta)} nm=${f2(order)}λ → ${bright ? '亮' : '暗'}`, w / 2, yb - 150, bright ? '#F5C542' : '#8a8aa0', 11)
    // 俯视条纹
    const fy0 = h - 150, fh = 50
    ctx.fillStyle = '#0d0d1a'; ctx.fillRect(x0, fy0, x1 - x0, fh)
    for (let i = 0; i < x1 - x0; i++) { const xm = (i / (x1 - x0)) * 12; const ph = (2 * Math.PI * (2 * p.n * xm * p.alpha * 1e-4 * 1e6 + p.lam / 2)) / p.lam; const I = 0.5 + 0.5 * Math.cos(ph); ctx.fillStyle = lamColor(p.lam); ctx.globalAlpha = I * (i / (x1 - x0) <= s.xProbe / 12 ? 1 : 0.25); ctx.fillRect(x0 + i, fy0, 1, fh) }
    ctx.globalAlpha = 1
    ctx.fillStyle = '#F5C542'; ctx.fillRect(px - 1, fy0 - 6, 2, fh + 12)
    dc.label(`俯视等厚条纹：间距 Δx=λ/(2nα)=${f2(dx)} mm（平行于棱边，等间距）`, w / 2, fy0 + fh + 18, '#F5C542', 11)
    dc.label('x/mm', x1 + 16, fy0 + fh / 2, '#8a8aa0', 10)
    for (let xm = 0; xm <= 12; xm += 2) dc.label(`${xm}`, x0 + xm * PX, fy0 - 10, '#565675', 9)
  },
  readout(p) {
    const dx = (p.lam * 1e-9) / (2 * p.n * p.alpha * 1e-4) * 1e3
    return `相邻亮纹厚度差 Δd=λ/2n=${f1(p.lam / (2 * p.n))} nm　条纹间距 Δx=λ/(2nα)=${f2(dx)} mm\n棱边处 d=0，δ=λ/2 → 暗纹；条纹随 α 增大变密、随 λ 增大变疏；把上板抬高（α 减小）条纹变疏并向棱边方向移动`
  },
  solution(p) {
    const dx = (p.lam * 1e-9) / (2 * p.n * p.alpha * 1e-4) * 1e3
    return {
      problemType: '薄膜（劈尖）干涉：等厚条纹的成因、间距与变化规律',
      hints: ['干涉的两束光来自同一入射光在膜的上下表面的反射', '光程差主要是 2nd（走了两遍膜厚），还要加半波损失 λ/2', '厚度相同的地方明暗相同 → 条纹是等厚线', '条纹间距对应厚度变化 λ/2n，再除以劈尖角'],
      processes: ['入射光在上表面部分反射（①）', '透射到下表面反射（②，多走 2nd，且半波损失）', '①②相遇叠加：δ=2nd+λ/2 决定明暗'],
      forces: ['波动光学不涉及受力'],
      laws: ['δ=2nd+λ/2', '亮纹 δ=kλ，暗纹 δ=(k+½)λ', 'Δx=λ/(2nα)'],
      critical: ['棱边 d=0 恒为暗纹', '楔角变大条纹变密', '白光照射：不同 λ 条纹错开呈彩色'],
      derivation: ['相邻亮纹：2nΔd=λ → Δd=λ/2n', 'Δx=Δd/tanα≈λ/(2nα)'],
      numeric: [`Δd=${f1(p.lam / (2 * p.n))} nm，Δx=${f2(dx)} mm`, `12 mm 内约 ${Math.floor(12 / dx)} 条亮纹`],
      pitfalls: ['忘记半波损失导致明暗颠倒', '把光程差写成 nd（少一倍）', '认为条纹垂直于棱边', '肥皂膜竖直放置时条纹水平（厚度上薄下厚）'],
      similar: ['牛顿环', '检查平面平整度', '增透膜厚度 λ/4n'],
      competition: ['等倾干涉', '迈克尔逊干涉仪', '多光束干涉（法布里–珀罗）'],
    }
  },
}

/* ══════════ 模型 57：单缝衍射 vs 双缝干涉 ══════════ */
interface S57 { hitsD: number[]; hitsS: number[]; n: number }
const NB = 160
function I57(p: Record<string, number>, y: number, dbl: boolean): number {
  const lam = p.lam * 1e-9, th = y / p.L, k = Math.PI / lam
  const beta = k * p.a * 1e-3 * Math.sin(th), env = beta === 0 ? 1 : (Math.sin(beta) / beta) ** 2
  if (!dbl) return env
  return env * Math.cos(k * p.d * 1e-3 * Math.sin(th)) ** 2
}
export const diffractionVsInterference: MechSceneDef<S57> = {
  id: 'gk-diffraction-vs-interference',
  title: '单缝衍射 vs 双缝干涉（光子逐个落屏 · 条纹对比）',
  desc: '同一屏上对比：双缝干涉（缝距 d）条纹等间距 Δx=Lλ/d、亮度近似相等（受单缝包络调制）；单缝衍射（缝宽 a）中央亮纹最宽最亮（宽 2Lλ/a），两侧条纹变窄变暗。光子一个个随机落屏，概率∝光强，条纹在统计中显现（波粒二象性）。',
  formula: '双缝：Δx=Lλ/d　单缝：中央亮纹宽 2Lλ/a，暗纹 a·sinθ=kλ　光强：双缝 cos²(πd sinθ/λ)·包络，单缝 [sin β/β]²',
  params: [
    { key: 'lam', label: '波长 λ', min: 400, max: 700, step: 10, default: 600, unit: 'nm' },
    { key: 'd', label: '双缝间距 d', min: 0.1, max: 0.5, step: 0.05, default: 0.2, unit: 'mm' },
    { key: 'a', label: '缝宽 a', min: 0.02, max: 0.2, step: 0.01, default: 0.05, unit: 'mm' },
    { key: 'L', label: '缝到屏距离 L', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
    { key: 'rate', label: '光子发射速率', min: 100, max: 2000, step: 100, default: 800, unit: '个/s' },
  ],
  h: 1 / 200,
  init(_p, tl) { tl.start('光子逐个落屏，条纹逐渐显现', '#F5C542'); return { hitsD: new Array(NB).fill(0), hitsS: new Array(NB).fill(0), n: 0 } },
  step(s, p, d, t, tl) {
    const span = 30   // mm
    const count = Math.max(1, Math.round(p.rate * d))
    for (let k = 0; k < count; k++) {
      for (const dbl of [true, false]) {
        for (let tries = 0; tries < 20; tries++) { const y = (Math.random() - 0.5) * span; if (Math.random() < I57(p, y * 1e-3, dbl)) { const b = Math.min(NB - 1, Math.floor(((y + span / 2) / span) * NB)); (dbl ? s.hitsD : s.hitsS)[b]++; break } }
      }
      s.n++
    }
    if (Math.floor(t) !== Math.floor(t - d) && Math.floor(t) % 3 === 0) tl.log(t, `已落屏 ${s.n} 个光子/屏：双缝条纹间距 Δx=Lλ/d=${f2((p.L * p.lam * 1e-9) / (p.d * 1e-3) * 1e3)} mm；单缝中央亮纹宽 2Lλ/a=${f2((2 * p.L * p.lam * 1e-9) / (p.a * 1e-3) * 1e3)} mm`)
    return t < 12
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const span = 30, x0 = 60, x1 = w - 30, PXmm = (x1 - x0) / span
    const rows = [{ name: `双缝干涉（d=${p.d} mm）`, hits: s.hitsD, dbl: true, y: 44 }, { name: `单缝衍射（a=${p.a} mm）`, hits: s.hitsS, dbl: false, y: h / 2 + 18 }]
    for (const r of rows) {
      dc.label(`${r.name}　已落屏 ${s.n} 个光子`, (x0 + x1) / 2, r.y - 8, '#F5C542', 12)
      const maxH = Math.max(1, ...r.hits)
      // 屏（光子累积条）
      ctx.fillStyle = '#0d0d1a'; ctx.fillRect(x0, r.y + 4, x1 - x0, 36)
      r.hits.forEach((c, i) => { ctx.fillStyle = lamColor(p.lam); ctx.globalAlpha = Math.min(1, c / maxH); ctx.fillRect(x0 + (i / NB) * (x1 - x0), r.y + 4, (x1 - x0) / NB + 0.5, 36) })
      ctx.globalAlpha = 1
      // 理论强度曲线 + 直方图
      const gy = r.y + 118, gh = 64
      ctx.strokeStyle = '#3a3a5e'; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke()
      ctx.fillStyle = '#3ecf8e66'
      r.hits.forEach((c, i) => ctx.fillRect(x0 + (i / NB) * (x1 - x0), gy - (c / maxH) * gh, (x1 - x0) / NB, (c / maxH) * gh))
      ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 1.5; ctx.beginPath()
      for (let i = 0; i <= 300; i++) { const y = (i / 300 - 0.5) * span; const I = I57(p, y * 1e-3, r.dbl); const X = x0 + (i / 300) * (x1 - x0), Y = gy - I * gh; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y) }
      ctx.stroke()
      for (let mm = -15; mm <= 15; mm += 5) { ctx.fillStyle = '#3a3a5e'; ctx.fillRect(x0 + (mm + 15) * PXmm, gy, 1, 4); dc.label(`${mm}`, x0 + (mm + 15) * PXmm, gy + 12, '#565675', 9) }
      dc.label(r.dbl ? `Δx=Lλ/d=${f2((p.L * p.lam * 1e-9) / (p.d * 1e-3) * 1e3)} mm（等间距）` : `中央亮纹宽 2Lλ/a=${f2((2 * p.L * p.lam * 1e-9) / (p.a * 1e-3) * 1e3)} mm（两侧变窄变暗）`, (x0 + x1) / 2, gy + 26, '#8a8aa0', 10)
    }
  },
  readout(p) {
    const dx = (p.L * p.lam * 1e-9) / (p.d * 1e-3) * 1e3, wc = (2 * p.L * p.lam * 1e-9) / (p.a * 1e-3) * 1e3
    return `双缝 Δx=Lλ/d=${f2(dx)} mm（λ↑、L↑、d↓ 变宽）　单缝中央亮纹宽 2Lλ/a=${f2(wc)} mm（a↓ 越宽越明显）\n区别：干涉条纹等宽等亮；衍射中央最宽最亮、两侧递减。双缝图样其实是干涉 × 单缝衍射包络`
  },
  solution(p) {
    const dx = (p.L * p.lam * 1e-9) / (p.d * 1e-3) * 1e3, wc = (2 * p.L * p.lam * 1e-9) / (p.a * 1e-3) * 1e3
    return {
      problemType: '单缝衍射与双缝干涉图样的区分、条纹间距与影响因素',
      hints: ['先看条纹是否等宽等亮：等 → 干涉；中央最宽最亮 → 衍射', '双缝间距公式 Δx=Lλ/d 中 d 是缝间距不是缝宽', '衍射中央亮纹宽度是其他亮纹的两倍', '光子逐个到达但整体分布服从波动规律 → 概率波'],
      processes: ['光通过缝 → 到屏上各点的光程差不同 → 叠加加强/减弱', '大量光子统计 → 条纹'],
      forces: ['不涉及受力'],
      laws: ['双缝：d·sinθ=kλ 亮纹，Δx=Lλ/d', '单缝暗纹：a·sinθ=kλ；中央宽 2Lλ/a', '光强∝到达概率'],
      critical: ['缝宽 a 与 λ 可比时衍射明显', '白光双缝：中央白色，两侧彩色（紫内红外）', '双缝条纹缺级：d/a 为整数时'],
      derivation: ['双缝：Δx=Lλ/d', '单缝：中央亮纹半角宽 sinθ₁=λ/a → 宽 2Lλ/a'],
      numeric: [`Δx=${f2(dx)} mm`, `单缝中央宽 ${f2(wc)} mm，为双缝间距的 ${f2(wc / dx)} 倍`],
      pitfalls: ['把缝宽当缝距', '衍射条纹当等间距', '认为光子太少时条纹不存在（存在，只是统计涨落大）', '波长变短条纹变宽（错，变窄）'],
      similar: ['薄膜干涉', '泊松亮斑', '光栅'],
      competition: ['夫琅禾费衍射积分', '光栅方程与分辨本领', '电子双缝实验'],
    }
  },
}

/* ══════════ 模型 60：波的叠加与干涉 ══════════ */
interface S60 { t: number; logged: boolean }
export const waveSuperposition: MechSceneDef<S60> = {
  id: 'gk-wave-superposition',
  title: '波的叠加与干涉（双源 · 加强/减弱线 · Δr 判据）',
  desc: '两个相干波源 S₁、S₂（同频、可同相或反相）在水面激起圆形波，叠加区形成稳定干涉图样。同相时：路程差 Δr=kλ 的点振动加强、Δr=(k+½)λ 减弱（反相则相反）。热图实时显示叠加位移，探针 P 给出 Δr 与判断，虚线为加强/减弱双曲线族。',
  formula: 'Δr=|PS₁−PS₂|　同相源：Δr=kλ 加强，Δr=(k+½)λ 减弱　反相源：结论互换　加强点振幅 A₁+A₂，减弱点 |A₁−A₂|',
  params: [
    { key: 'lam', label: '波长 λ', min: 1, max: 4, step: 0.25, default: 2, unit: 'm' },
    { key: 'd', label: '两源间距 d', min: 2, max: 8, step: 0.5, default: 4, unit: 'm' },
    { key: 'phase', label: '波源相位', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '同相' }, { value: 1, label: '反相' }] },
    { key: 'px', label: '探针 P 的 x', min: -6, max: 6, step: 0.25, default: 1, unit: 'm' },
    { key: 'py', label: '探针 P 的 y', min: 0, max: 6, step: 0.25, default: 0, unit: 'm' },
  ],
  h: 1 / 100,
  init(_p, tl) { tl.start('双源发波 → 稳定干涉', '#F5C542'); return { t: 0, logged: false } },
  step(s, p, d, t, tl) {
    s.t = t
    if (!s.logged && t >= 1.5) {
      s.logged = true
      const r1 = Math.hypot(p.px + p.d / 2, p.py), r2 = Math.hypot(p.px - p.d / 2, p.py), dr = pathDiffFn(p.px, p.py, [-p.d / 2, 0], [p.d / 2, 0]), k = dr / p.lam  // 共享物理源（P3 批4 收编）
      const near = Math.abs(k - Math.round(k)), half = Math.abs(k - Math.floor(k) - 0.5)
      const kind = near < 0.06 ? (p.phase ? '振动减弱' : '振动加强') : half < 0.06 ? (p.phase ? '振动加强' : '振动减弱') : '介于加强与减弱之间'
      tl.log(t, `探针 P(${p.px}, ${p.py})：PS₁=${f2(r1)}，PS₂=${f2(r2)}，Δr=${f2(dr)} m = ${f2(k)} λ → ${kind}`)
    }
    return t < 8
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const cx = w / 2, cy = h - 110, PX = Math.min((w - 80) / 16, (h - 170) / 7.5)
    const X = (x: number) => cx + x * PX, Y = (y: number) => cy - y * PX
    const s1 = -p.d / 2, s2 = p.d / 2, k = (2 * Math.PI) / p.lam, om = 2 * Math.PI * 0.8
    // 热图
    const cols = 128, rowsN = 60, cw = (16 * PX) / cols, ch = (7.2 * PX) / rowsN
    for (let j = 0; j < rowsN; j++) for (let i = 0; i < cols; i++) {
      const x = -8 + (i + 0.5) * (16 / cols), y = (j + 0.5) * (7.2 / rowsN)
      const r1 = Math.hypot(x - s1, y), r2 = Math.hypot(x - s2, y)
      const a1 = Math.min(1, 1.2 / Math.sqrt(Math.max(0.3, r1))), a2 = Math.min(1, 1.2 / Math.sqrt(Math.max(0.3, r2)))
      const u = a1 * Math.sin(om * s.t - k * r1) + a2 * Math.sin(om * s.t - k * r2 + (p.phase ? Math.PI : 0))
      const v = Math.max(-1, Math.min(1, u / 1.6))
      ctx.fillStyle = v > 0 ? `rgba(245,197,66,${v * 0.85})` : `rgba(74,144,217,${-v * 0.85})`
      ctx.fillRect(X(x) - cw / 2, Y(y) - ch / 2, cw + 0.5, ch + 0.5)
    }
    // 加强 / 减弱线（双曲线：Δr=常数）
    const drawHyper = (dr: number, color: string, dash: number[]) => {
      ctx.strokeStyle = color; ctx.setLineDash(dash); ctx.lineWidth = 1.2
      for (const sgn of [1, -1]) {
        ctx.beginPath(); let first = true
        for (let y = 0; y <= 7.2; y += 0.05) {
          // |r1−r2|=dr → 解 x：r1−r2=sgn·dr
          const a = dr / 2, c = p.d / 2; if (a >= c || a === 0) { if (a === 0) { const xx = 0; first ? ctx.moveTo(X(xx), Y(y)) : ctx.lineTo(X(xx), Y(y)); first = false; continue } break }
          const b2 = c * c - a * a; const xx = sgn * a * Math.sqrt(1 + (y * y) / b2)
          if (Math.abs(xx) > 8) break
          first ? ctx.moveTo(X(xx), Y(y)) : ctx.lineTo(X(xx), Y(y)); first = false
        }
        ctx.stroke(); if (dr === 0) break
      }
      ctx.setLineDash([])
    }
    for (let kk = 0; kk * p.lam < p.d; kk++) { drawHyper(kk * p.lam, p.phase ? '#4A90D9aa' : '#F5C542aa', []); if ((kk + 0.5) * p.lam < p.d) drawHyper((kk + 0.5) * p.lam, p.phase ? '#F5C542aa' : '#4A90D9aa', [5, 4]) }
    // 波源与探针
    for (const [sx, name] of [[s1, 'S₁'], [s2, 'S₂']] as [number, string][]) { ctx.fillStyle = '#E05555'; ctx.beginPath(); ctx.arc(X(sx), Y(0), 6, 0, Math.PI * 2); ctx.fill(); dc.label(name, X(sx), Y(0) + 16, '#E05555', 11) }
    const r1 = Math.hypot(p.px - s1, p.py), r2 = Math.hypot(p.px - s2, p.py), dr = Math.abs(r1 - r2)
    ctx.strokeStyle = '#ffffff88'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(s1), Y(0)); ctx.lineTo(X(p.px), Y(p.py)); ctx.lineTo(X(s2), Y(0)); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#3ecf8e'; ctx.beginPath(); ctx.arc(X(p.px), Y(p.py), 6, 0, Math.PI * 2); ctx.fill()
    dc.label(`P：Δr=|${f2(r1)}−${f2(r2)}|=${f2(dr)} m=${f2(dr / p.lam)}λ`, X(p.px), Y(p.py) - 16, '#3ecf8e', 11)
    dc.label(`${p.phase ? '反相' : '同相'}波源，λ=${p.lam} m，d=${p.d} m　实线：加强线（Δr=kλ${p.phase ? '，反相时为减弱' : ''}）　虚线：减弱线`, w / 2, 24, '#8a8aa0', 11)
  },
  readout(p) {
    const r1 = Math.hypot(p.px + p.d / 2, p.py), r2 = Math.hypot(p.px - p.d / 2, p.py), dr = Math.abs(r1 - r2), k = dr / p.lam
    const near = Math.abs(k - Math.round(k)) < 0.06, half = Math.abs(k - Math.floor(k) - 0.5) < 0.06
    return `P(${p.px}, ${p.py})：PS₁=${f2(r1)}，PS₂=${f2(r2)}，Δr=${f2(dr)} m=${f2(k)}λ → ${near ? (p.phase ? '减弱（反相源）' : '加强') : half ? (p.phase ? '加强（反相源）' : '减弱') : '介于两者之间'}
两源连线上加强点间距 λ/2；加强线条数：Δr 从 0 到 d 中 kλ 的个数`
  },
  solution(p) {
    const r1 = Math.hypot(p.px + p.d / 2, p.py), r2 = Math.hypot(p.px - p.d / 2, p.py), dr = Math.abs(r1 - r2)
    return {
      problemType: '波的干涉：由路程差判断某点振动加强还是减弱；数加强/减弱区数目',
      hints: ['先算路程差 Δr=|PS₁−PS₂|，再与 λ 比', '同相源：整数倍加强、半整数倍减弱；反相源结论互换', '加强点不是“一直在最大位移”，而是振幅最大，仍在振动', '两源连线上相邻加强点相距 λ/2'],
      processes: ['两列波各自传到 P（各自相位由 r/λ 决定）', '在 P 叠加：相位差 2πΔr/λ（+π 若反相）', '相位差为 2kπ 加强，(2k+1)π 减弱'],
      forces: ['不涉及受力'],
      laws: ['叠加原理', 'Δφ=2πΔr/λ（+π）', 'A=A₁+A₂（加强）或 |A₁−A₂|（减弱）'],
      critical: ['Δr 最大为 d（两源连线上）→ 加强线条数由 d/λ 决定', '中垂线上 Δr=0：同相源加强、反相源减弱', '振幅相等的减弱点静止'],
      derivation: [`Δr=|${f2(r1)}−${f2(r2)}|=${f2(dr)} m=${f2(dr / p.lam)}λ`, '与 kλ 或 (k+½)λ 比较'],
      numeric: [`Δr=${f2(dr)} m`, `加强线数（同相）：2⌊d/λ⌋+1=${2 * Math.floor(p.d / p.lam) + 1}`],
      pitfalls: ['以为加强点位移始终最大', '忘记反相源结论互换', '把振幅叠加当位移叠加（某时刻位移可为 0）', '介于加强减弱之间的点误判'],
      similar: ['水波干涉图样', '声波干涉（两个扬声器）', '双缝干涉'],
      competition: ['惠更斯原理与干涉条纹形状（双曲线）', '不等幅波的干涉', '驻波'],
    }
  },
}
