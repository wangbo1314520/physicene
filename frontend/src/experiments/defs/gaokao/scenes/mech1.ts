/**
 * B11 力学场景组 1：斜面+弹簧+滑块（场景3）· 传送带+板块（场景4/模型30）· 连接体整体/隔离（场景5/模型21）
 */
import type { MechSceneDef } from '../../../engine/mechScene'
import { ground, block, ball, spring, pulley, rope, incline, belt, scratch } from './draw'

const G = 9.8
const f2 = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '—')
const f3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : '—')

/* ══════════ 场景 3：斜面 + 弹簧 + 滑块 ══════════ */
interface S3 { s: number; v: number; Q: number; cycle: number; onSpring: boolean; phase: string }
export const slopeSpring: MechSceneDef<S3> = {
  id: 'gk-slope-spring',
  title: '斜面 + 弹簧 + 滑块（能量守恒 · 弹性势能 · 临界）',
  desc: '滑块从斜面上方由静止释放，沿斜面下滑压缩底部弹簧后回弹。观察动能↔重力势能↔弹性势能转化与摩擦生热；μ=0 时能回到原高度。',
  formula: '½mv² = mgΔh·sinθ − μmg cosθ·s ± ½kx²　Q = μmg cosθ·总路程',
  params: [
    { key: 'm', label: '滑块质量 m', min: 0.5, max: 4, step: 0.5, default: 1, unit: 'kg' },
    { key: 'th', label: '斜面倾角 θ', min: 15, max: 45, step: 1, default: 30, unit: '°' },
    { key: 'mu', label: '摩擦因数 μ', min: 0, max: 0.5, step: 0.05, default: 0.1 },
    { key: 'k', label: '劲度系数 k', min: 10, max: 200, step: 10, default: 60, unit: 'N/m' },
    { key: 'L0', label: '释放距离 L₀（距弹簧自由端）', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'm' },
  ],
  init(p, tl) { tl.start('① 沿斜面下滑', '#4A90D9'); return { s: -p.L0, v: 0, Q: 0, cycle: 0, onSpring: false, phase: 'down' } },
  step(s, p, d, t, tl) {
    const th = (p.th * Math.PI) / 180
    const gp = p.m * G * Math.sin(th), gf = p.mu * p.m * G * Math.cos(th)
    const wasOn = s.onSpring
    let a = (s.v >= 0 ? gp : -gp) - Math.sign(s.v) * gf - (s.s > 0 ? (p.k * s.s) / p.m : 0)
    if (s.s > 0 && !wasOn) { s.onSpring = true; tl.switchTo('② 压缩弹簧（减速）', '#F5C542', t, `t=${f2(t)}s 接触弹簧`) }
    const vPrev = s.v
    s.v += a * d
    s.s += ((vPrev + s.v) / 2) * d
    s.Q += gf * Math.abs(((vPrev + s.v) / 2)) * d
    // 最大压缩：在弹簧上速度过零（向下→向上）
    if (s.s > 0 && vPrev > 0 && s.v <= 0) tl.switchTo('③ 弹簧回弹（弹出滑块）', '#3ecf8e', t, `t=${f2(t)}s 最大压缩 x=${f2(s.s)} m`)
    // 离开弹簧
    if (s.onSpring && s.s <= 0 && s.v < 0) { s.onSpring = false; tl.switchTo('④ 上滑减速', '#b06ce6', t, `t=${f2(t)}s 弹簧恢复原长，滑块以 ${f2(-s.v)} m/s 上滑`) }
    // 上滑到最高（s<0 处速度过零）
    if (!s.onSpring && vPrev < 0 && s.v >= 0) {
      s.cycle++
      const staticHold = p.mu >= Math.tan(th)
      if (s.cycle >= 2 || staticHold) {
        tl.switchTo(staticHold ? '⑤ 静止（μ ≥ tanθ）' : '⑤ 结束（展示两轮往复）', '#8a8aa0', t,
          `t=${f2(t)}s 到达 s=${f2(s.s)} m${staticHold ? '，静摩擦足以平衡重力分量，静止' : ''}；Q=${f2(s.Q)} J`)
        return false
      }
      tl.switchTo('⑤ 再次下滑（μ<tanθ，达不到原高度）', '#4A90D9', t, `t=${f2(t)}s 最高点 s=${f2(s.s)} m（未回到 −${p.L0}）`)
    }
    if (s.s < -p.L0 - 0.5) return false
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const th = (p.th * Math.PI) / 180
    const hiU = -p.L0 - 0.6, loU = 2.2                    // 沿斜面坐标 u：向下为正，弹簧自由端 u=0，固定端 u=1.6
    const span = loU - hiU
    const PX = Math.min((w - 60) / (span * Math.cos(th)), (h - 180) / (span * Math.sin(th)))
    const ox = 30 - hiU * PX * Math.cos(th), oy = 100 - hiU * PX * Math.sin(th)
    const P = (u: number): [number, number] => [ox + u * PX * Math.cos(th), oy + u * PX * Math.sin(th)]
    const [hx, hy] = P(hiU), [lx, ly] = P(loU)
    // 斜面实体（直角在左下）
    ctx.fillStyle = 'rgba(62,207,142,0.18)'; ctx.strokeStyle = '#3ecf8e'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(lx, ly); ctx.lineTo(hx, ly); ctx.closePath(); ctx.fill(); ctx.stroke()
    dc.label(`θ=${p.th}°  μ=${p.mu}`, hx + 60, ly - 14, '#3ecf8e')
    // 固定挡板 + 弹簧（从滑块接触点或自由端到固定端）
    const [ax, ay] = P(1.6)
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(th); ctx.fillStyle = '#8a8aa0'; ctx.fillRect(0, -26, 6, 26); ctx.restore()
    const contactU = Math.max(0, s.s)
    const [fx, fy] = P(contactU)
    spring(ctx, fx + 6 * Math.sin(th) * 0, fy - 12 * Math.cos(th), ax - 12 * Math.sin(th) * 0, ay - 12 * Math.cos(th), 10, 7)
    const [f0x, f0y] = P(0)
    ctx.strokeStyle = '#565675'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(f0x, f0y); ctx.lineTo(f0x + 14 * Math.sin(th), f0y - 14 * Math.cos(th)); ctx.stroke(); ctx.setLineDash([])
    dc.label('自由端', f0x + 22 * Math.sin(th), f0y - 26 * Math.cos(th), '#565675', 10)
    dc.label(`k=${p.k} N/m`, (fx + ax) / 2 + 16 * Math.sin(th), (fy + ay) / 2 - 26 * Math.cos(th), '#F5C542')
    // 滑块：沿坡面旋转贴合（局部坐标 x 沿坡向下，y 垂直坡面向上为负）
    const [bx, by] = P(s.s)
    ctx.save(); ctx.translate(bx, by); ctx.rotate(th)
    ctx.fillStyle = '#4A90D9'; ctx.fillRect(-16, -22, 32, 22)
    ctx.fillStyle = '#ffffff33'; ctx.beginPath(); ctx.moveTo(-16, -22); ctx.lineTo(-8, -30); ctx.lineTo(24, -30); ctx.lineTo(16, -22); ctx.fill()
    ctx.restore()
    dc.label(`m=${p.m} kg`, bx - 30 * Math.sin(th), by - 40 * Math.cos(th), '#9cc5ff')
    dc.arrow(bx, by - 34 * Math.cos(th), s.v * 12 * Math.cos(th), s.v * 12 * Math.sin(th), '#F5C542', `v=${f2(Math.abs(s.v))}`)
  },
  energy(s, p) {
    const th = (p.th * Math.PI) / 180
    const Ek = 0.5 * p.m * s.v * s.v
    const Ep = p.m * G * Math.sin(th) * (1.6 - s.s)          // 零点取坡底挡板处
    const Es = s.s > 0 ? 0.5 * p.k * s.s * s.s : 0
    const E0 = p.m * G * Math.sin(th) * (p.L0 + 1.6)
    return { items: [{ name: '动能', value: Ek, color: '#F5C542' }, { name: '重力势能', value: Ep, color: '#4A90D9' },
      { name: '弹性势能', value: Es, color: '#3ecf8e' }, { name: '摩擦生热 Q', value: s.Q, color: '#E05555' }], E0: Math.max(1e-9, E0 + s.Q) }
  },
  readout(p, s) {
    const th = (p.th * Math.PI) / 180
    const b = p.m * G * (Math.sin(th) - p.mu * Math.cos(th))
    const xm = b > 0 ? (b + Math.sqrt(b * b + 2 * p.k * b * p.L0)) / p.k : 0
    const up = p.m * G * (Math.sin(th) + p.mu * Math.cos(th))
    const dUp = 0.5 * p.k * xm * xm / up - xm
    return `理论：最大压缩 x_m = ${f2(xm)} m　回弹最高（距自由端）= ${f2(dUp)} m（μ=0 时 = L₀ = ${p.L0}）${s ? `　当前 s=${f2(s.s)} m，v=${f2(s.v)} m/s，Q=${f2(s.Q)} J` : ''}`
  },
  solution(p) {
    const th = (p.th * Math.PI) / 180
    const b = p.m * G * (Math.sin(th) - p.mu * Math.cos(th))
    const xm = b > 0 ? (b + Math.sqrt(b * b + 2 * p.k * b * p.L0)) / p.k : 0
    const up = p.m * G * (Math.sin(th) + p.mu * Math.cos(th))
    const dUp = 0.5 * p.k * xm * xm / up - xm
    return {
      problemType: '斜面 + 弹簧 + 滑块：能量守恒与临界回弹高度',
      hints: ['全程只有一个力做功会“存起来”——摩擦把机械能变成热', '压缩最大时速度为零，用能量方程而不是牛顿定律', '回弹阶段摩擦力方向反了，做功仍为负', 'μ=0 时机械能守恒：能回到原高度'],
      processes: ['过程一：释放后沿斜面加速下滑（摩擦做负功）', '过程二：接触弹簧后减速，压缩到最大（v=0）', '过程三：弹簧回弹，把滑块弹回上坡', '过程四：脱离弹簧后上滑减速，到最高点（可能再次下滑）'],
      forces: ['下滑：重力分量 mg sinθ（动力）、摩擦 μmg cosθ（阻力）', '压缩/回弹：再加弹簧弹力 kx（始终指向自然长度）', '上滑：摩擦力方向沿斜面向下（与运动相反）'],
      laws: ['动能定理 / 能量守恒分段列式', '最大压缩：mg sinθ(L₀+x) − μmg cosθ(L₀+x) = ½kx²', '回弹：½kx_m² = mg sinθ(x_m+d) + μmg cosθ(x_m+d)'],
      critical: ['能否下滑：tanθ > μ', '脱离弹簧：弹簧恢复原长（x=0）瞬间', '最终静止条件：μ ≥ tanθ（静摩擦平衡重力分量）'],
      derivation: ['下滑加速度 a = g(sinθ − μcosθ)', 'x_m 解二次方程：x = [b + √(b² + 2kbL₀)]/k，b = mg(sinθ − μcosθ)', '回弹高度 d（高于自由端）：½kx_m² = (mg sinθ + μmg cosθ)(x_m + d)', 'μ=0：d = L₀（回到原高度，机械能守恒）'],
      numeric: [`x_m = ${f2(xm)} m`, `回弹最高距自由端 d = ${f2(dUp)} m（释放时为 ${p.L0} m）`, `全程摩擦生热（一轮）≈ ${f2(2 * p.mu * p.m * G * Math.cos(th) * (p.L0 + xm))} J`, `μ ≥ tanθ = ${f2(Math.tan(th))} 时滑不上/停住（当前 μ=${p.mu}）`],
      pitfalls: ['把“滑块位移”当成“弹簧压缩量”', '回弹阶段摩擦力方向没有反向', '最大压缩时误以为 a=0（其实是 v=0）', '忘记 μ=0 才能回到原高度'],
      similar: ['水平面滑块压缩弹簧', '弹簧竖直弹球（类上抛）', '粗糙斜面往返运动'],
      competition: ['摩擦生热随往复次数收敛：等比数列求总路程', '弹簧质量不可忽略时的有效质量修正', '微元法求变力冲量'],
    }
  },
}

/* ══════════ 场景 4 / 模型 30：传送带 + 板块（地面有摩擦） ══════════ */
interface S4 { x: number; v: number; vr0: number; Q: number; ds: number; common: boolean; xB: number; vB: number; off: string | null; ph: number }
export const conveyorBoard: MechSceneDef<S4> = {
  id: 'gk-conveyor-board',
  title: '传送带 + 板块（摩擦力方向 · 相对位移 · 热量 Q=f·Δs）',
  desc: '水平/倾斜传送带上放物块：判断摩擦力方向，跟踪相对滑动→共速→（倾斜时可能再下滑）；板块模式则平板车与滑块叠加在粗糙地面上。热量只看相对位移。',
  formula: 'a = μg cosθ ∓ g sinθ　Δs_相 = ∫|v_物−v_带|dt　Q = μmg cosθ·Δs_相',
  params: [
    { key: 'setup', label: '搭法', min: 0, max: 2, step: 1, default: 0, options: [{ value: 0, label: '水平传送带' }, { value: 1, label: '倾斜传送带（向上输送）' }, { value: 2, label: '板块 + 粗糙地面' }] },
    { key: 'v0', label: '物块初速 v₀', min: -6, max: 6, step: 0.5, default: 0, unit: 'm/s' },
    { key: 'vb', label: '传送带速度 v_带', min: -6, max: 6, step: 0.5, default: 3, unit: 'm/s' },
    { key: 'mu', label: '摩擦因数 μ（物-带/板）', min: 0.05, max: 0.6, step: 0.05, default: 0.2 },
    { key: 'th', label: '倾角 θ（搭法2）', min: 0, max: 30, step: 1, default: 15, unit: '°' },
    { key: 'L', label: '带/板长度 L', min: 2, max: 10, step: 0.5, default: 6, unit: 'm' },
    { key: 'M', label: '平板质量 M（搭法2）', min: 1, max: 8, step: 0.5, default: 3, unit: 'kg' },
    { key: 'mu2', label: '地面摩擦 μ₂（搭法2）', min: 0, max: 0.3, step: 0.05, default: 0.1 },
    { key: 'm', label: '物块质量 m', min: 0.5, max: 4, step: 0.5, default: 1, unit: 'kg' },
  ],
  init(p, tl) {
    tl.start(p.setup === 2 ? '① 相对滑动（滑块-板 μ，板-地 μ₂）' : Math.abs(p.v0 - p.vb) < 1e-9 ? '① 物块与带同速' : '① 相对滑动（摩擦拖动物块）', '#F5C542')
    return { x: 0.5, v: p.v0, vr0: p.v0 - p.vb, Q: 0, ds: 0, common: false, xB: 0, vB: 0, off: null, ph: 0 }
  },
  step(s, p, d, t, tl) {
    const th = (p.setup === 1 ? p.th : 0) * Math.PI / 180
    s.ph += p.vb * d
    if (p.setup < 2) {
      const vr = s.v - p.vb
      if (Math.abs(vr) > 1e-4) {
        const a = -Math.sign(vr) * p.mu * G * Math.cos(th) - G * Math.sin(th)
        s.v += a * d
        if (Math.sign(s.v - p.vb) !== Math.sign(vr)) s.v = p.vb
      } else {
        // 共速后：能否保持
        if (p.mu >= Math.tan(th)) { s.v = p.vb; if (!s.common) { s.common = true; tl.switchTo('② 共速：随带匀速运动', '#3ecf8e', t, `t=${f2(t)}s 共速 v=${f2(p.vb)} m/s（μ ≥ tanθ）`) } }
        else { s.v += (-G * Math.sin(th) + p.mu * G * Math.cos(th)) * d
          if (s.common) { s.common = false; tl.switchTo('② 共速瞬态后继续下滑（μ < tanθ）', '#E05555', t, `t=${f2(t)}s 摩擦不足以维持，继续相对下滑`) } }
      }
      const vAvg = s.v
      s.x += vAvg * d
      s.ds += Math.abs(s.v - p.vb) * d
      s.Q += p.mu * p.m * G * Math.cos(th) * Math.abs(s.v - p.vb) * d
      if (s.x > p.L) { s.off = '右'; tl.switchTo(`③ 从带右端离开`, '#8a8aa0', t, `t=${f2(t)}s 离开右端（v=${f2(s.v)}）`); return false }
      if (s.x < 0) { s.off = '左'; tl.switchTo(`③ 从带左端滑下`, '#8a8aa0', t, `t=${f2(t)}s 从左端滑下（v=${f2(s.v)}）`); return false }
      return true
    }
    // 搭法 2：板块 + 粗糙地面
    const rel = s.v - s.vB
    if (Math.abs(rel) > 1e-4) {
      const f1 = p.mu * p.m * G                       // 滑块-板
      const f2g = p.mu2 * (p.m + p.M) * G             // 板-地（最大）
      const aBlock = -Math.sign(rel) * p.mu * G
      const boardDrive = Math.sign(rel) * f1 - (Math.abs(s.vB) > 1e-6 ? Math.sign(s.vB) * f2g : (Math.sign(rel) * f1 > f2g ? -Math.sign(rel) * f2g : 0))
      const aBoard = boardDrive / p.M
      const vPrev = s.v, vBPrev = s.vB
      s.v += aBlock * d; s.vB += aBoard * d
      if (Math.sign(s.v - s.vB) !== Math.sign(rel)) { s.v = s.vB = (p.m * vPrev + p.M * vBPrev) / (p.m + p.M) }
      s.x += ((vPrev + s.v) / 2) * d; s.xB += ((vBPrev + s.vB) / 2) * d
      const relD = Math.abs(rel) * d
      s.ds += relD; s.Q += f1 * relD
      if (s.x - s.xB > p.L - 0.4) { tl.switchTo('③ 滑块滑出板端', '#E05555', t, `t=${f2(t)}s 滑出（板长不足）`); return false }
    } else {
      if (!s.common) { s.common = true; tl.switchTo('② 共速：一起减速至停（地面 μ₂）', '#3ecf8e', t, `t=${f2(t)}s 共速 v=${f2(s.v)} m/s`) }
      const a = -p.mu2 * G
      const vP = s.v
      s.v += a * d; s.vB = s.v
      if (s.v <= 0) { s.v = 0; s.vB = 0; tl.switchTo('③ 一起停止', '#8a8aa0', t, `t=${f2(t)}s 停止；滑块共滑 ${f2(s.x)} m，Q=${f2(s.Q)} J`); return false }
      s.x += ((vP + s.v) / 2) * d; s.xB = s.x - 0.3
    }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const PX = (w - 100) / p.L, gy = h - 90
    if (p.setup < 2) {
      const th = (p.setup === 1 ? p.th : 0) * Math.PI / 180
      ctx.save(); ctx.translate(60, gy); ctx.rotate(-th)
      belt(ctx, 0, p.L * PX, 0, s.ph * PX, 10)
      ctx.restore()
      // 物块位置（沿带坐标）
      const pos = (u: number): [number, number] => { const a = -th; return [60 + u * PX * Math.cos(a), gy + u * PX * Math.sin(a) - 22] }
      const [bx, by] = pos(s.x)
      block(ctx, bx - 16, by + 22, 32, 22, '#4A90D9')
      dc.arrow(bx, by - 6, s.v * 10, 0, '#4A90D9', `v=${f2(s.v)}`)
      dc.arrow(bx, by - 6, p.vb * 10, 0, '#3ecf8e', `v带=${p.vb}`)
      // 划痕（相对位移）画在带上
      const [s0x] = pos(0.5), [s1x] = pos(Math.max(0.5, Math.min(p.L, 0.5 + s.ds * Math.sign(p.vb - p.v0))))
      scratch(ctx, s0x, gy - 10, s1x)
      dc.label(`相对位移 Δs=${f2(s.ds)} m　Q=${f2(s.Q)} J`, w / 2, 30, '#E05555', 12)
    } else {
      ground(ctx, gy + 26, 20, w - 20)
      const bx = 60 + s.xB * PX, bw = p.L * PX
      block(ctx, bx, gy + 26, bw, 10, '#5c4a2a', '#7a623855')
      dc.label(`板 M=${p.M}kg`, bx + bw / 2, gy + 44, '#b0b0cc')
      const kx = 60 + s.x * PX
      block(ctx, kx - 14, gy + 26, 28, 20, '#4A90D9')
      dc.arrow(kx, gy - 6, s.v * 10, 0, '#4A90D9', `v=${f2(s.v)}`)
      dc.arrow(bx + bw / 2, gy + 18, s.vB * 10, 0, '#3ecf8e', `V=${f2(s.vB)}`)
      scratch(ctx, 60 + s.xB * PX, gy + 22, 60 + (s.xB + Math.min(p.L, s.ds)) * PX)
      dc.label(`Δs_相=${f2(s.ds)} m　Q(滑块-板)=${f2(s.Q)} J`, w / 2, 30, '#E05555', 12)
    }
  },
  energy(s, p) {
    const th = (p.setup === 1 ? p.th : 0) * Math.PI / 180
    const Ek = 0.5 * p.m * s.v * s.v + (p.setup === 2 ? 0.5 * p.M * s.vB * s.vB : 0)
    return { items: [{ name: '动能', value: Ek, color: '#F5C542' }, { name: '摩擦生热 Q', value: s.Q, color: '#E05555' }], E0: Math.max(1e-9, Ek + s.Q), momentum: p.setup === 2 ? `总动量 p = ${f2(p.m * s.v + p.M * s.vB)} kg·m/s（地面有摩擦 → 不守恒）` : undefined }
  },
  readout(p, s) {
    if (p.setup < 2) {
      const th = (p.setup === 1 ? p.th : 0) * Math.PI / 180
      const t1 = Math.abs(p.vb - p.v0) / (p.mu * G * Math.cos(th))
      const dsr = ((p.vb - p.v0) ** 2) / (2 * p.mu * G * Math.cos(th))
      return `理论（到共速）：t=${f2(t1)} s　Δs_相=${f2(dsr)} m　Q=${f2(p.mu * p.m * G * Math.cos(th) * dsr)} J${p.setup === 1 ? `\nμ ${p.mu >= Math.tan(th) ? '≥' : '<'} tanθ=${f2(Math.tan(th))} → 共速后${p.mu >= Math.tan(th) ? '随带匀速向上' : '继续下滑'}` : ''}${s ? `\n当前 v=${f2(s.v)}，Δs=${f2(s.ds)}，Q=${f2(s.Q)} J` : ''}`
    }
    const vcClean = (p.m * p.v0 * (p.mu - p.mu2)) / Math.max(1e-9, p.mu * p.M + p.mu2 * p.M) // 阶段1 冲量估算（板能动时）
    return `板块+地面：共速后一起以 a=μ₂g=${f2(p.mu2 * G)} 减速${s ? `　当前 v=${f2(s.v)} V=${f2(s.vB)} Δs=${f2(s.ds)} Q=${f2(s.Q)} J` : `　估算 v_c≈${f2(vcClean)} m/s（若板能动：需 μmg > μ₂(m+M)g ⇔ μ > μ₂(${p.mu > p.mu2 ? '成立' : '不成立，板不动'})`}`
  },
  solution(p) {
    const belt = p.setup < 2
    const th = (p.setup === 1 ? p.th : 0) * Math.PI / 180
    const dsr = ((p.vb - p.v0) ** 2) / (2 * p.mu * G * Math.cos(th))
    return {
      problemType: belt ? '传送带模型：摩擦力方向、相对位移与热量' : '板块+粗糙地面：三阶段（相对滑动→共速→一起减速）',
      hints: [belt ? '先比较 v₀ 与 v_带：相对速度方向决定摩擦力方向' : '三层接触：滑块-板 μ、板-地 μ₂，分别判断会不会动', '共速是分界点：共速后要重新判断摩擦力', '热量用相对位移：Q = f × Δs_相，不是对地位移'],
      processes: belt ? ['过程一：物块与带相对滑动（摩擦力拖动物块向带速靠拢）', '过程二：达到共速（水平：随带匀速；倾斜且 μ≥tanθ 同样匀速）', '过程三（倾斜 μ<tanθ）：共速瞬态后继续下滑，从底端离带'] : ['过程一：滑块-板相对滑动，板-地摩擦判断板是否被带动', '过程二：共速后滑块+板作为整体', '过程三：整体在地面摩擦下减速到停'],
      forces: belt ? ['物块：摩擦力 μmg cosθ（方向由 v_物−v_带 的符号决定）', '倾斜：重力沿带分量 mg sinθ（沿带向下）'] : ['滑块：板给的摩擦 μmg（与相对速度反向）', '板：滑块摩擦的反作用 + 地面摩擦 μ₂(m+M)g'],
      laws: ['牛顿第二定律：a = ±μg cosθ ∓ g sinθ', '运动学：v = v₀ + at', '热量：Q = μmg cosθ × Δs_相（相对位移）'],
      critical: [belt ? '共速：v_物 = v_带' : '板被带动：μ m g > μ₂ (m+M) g ⇔ μ > μ₂(1 + M/m)', belt ? '倾斜带保持共速：μ ≥ tanθ' : '滑块不滑出板端：Δs_相 ≤ L − s₀', '恰好不掉下：相对位移 = 板长'],
      derivation: [belt ? '到共速时间 t = |v_带−v₀|/(μg cosθ)' : '阶段1加速度：滑块 a₁=μg，板 a₂=(μm−μ₂(m+M)/… 按力分析', 'Δs_相 = |v_带−v₀|²/(2μg cosθ)', 'Q = μmg cosθ × Δs_相', belt ? '对地位移：s_物 = (v₀+v_带)t/2' : '共速后 a = μ₂g，滑行 v_c²/(2μ₂g)'],
      numeric: [`Δs_相（到共速）= ${f2(dsr)} m`, `Q = ${f2(p.mu * p.m * G * Math.cos(th) * dsr)} J`, p.setup === 1 ? `tanθ=${f2(Math.tan(th))}，μ=${p.mu} → 共速后${p.mu >= Math.tan(th) ? '匀速向上输送' : '继续下滑'}` : `共速后减速 a = ${f2(p.mu2 * G)} m/s²`],
      pitfalls: ['摩擦力方向判断错（以相对速度为准，不是物块速度）', '共速后忘记重新判断（水平带共速后无摩擦）', '用对地位移算热量', '倾斜带漏掉重力分量'],
      similar: ['水平/倾斜传送带各方向组合', '板块模型（光滑/粗糙地面）', '物体在平板车上刹车'],
      competition: ['变速传送带（带速随时间变化）', '多物块同带', '传送带电动机功率与多做的功'],
    }
  },
}

/* ══════════ 场景 5 / 模型 21：连接体（整体法 / 隔离法） ══════════ */
interface S5 { xA: number; vA: number; xB: number; vB: number; phase: string }
export const connectedBodies: MechSceneDef<S5> = {
  id: 'gk-connected-bodies',
  title: '连接体（整体法求 a · 隔离法求绳张力 T）',
  desc: '三种搭法：水平面 A-B 绳连被 F 拉；斜面+定滑轮（A 在斜面、B 悬垂）；动滑轮（悬绳省力）。力传感器显示绳张力，加速度传感器显示 a。',
  formula: '整体：(F − Σf)/(Σm) = a　隔离：T = m₂a + m₂μ g（水平）　内力 T = m₂F/(m₁+m₂)（光滑）',
  params: [
    { key: 'setup', label: '搭法', min: 0, max: 2, step: 1, default: 0, options: [{ value: 0, label: '水平面：F 拉 A（A 绳连 B）' }, { value: 1, label: '斜面 + 定滑轮（A 上 B 垂）' }, { value: 2, label: '动滑轮（悬绳省力）' }] },
    { key: 'm1', label: '物块 A 质量 m₁', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'kg' },
    { key: 'm2', label: '物块 B 质量 m₂', min: 0.5, max: 5, step: 0.5, default: 1, unit: 'kg' },
    { key: 'F', label: '拉力 F（搭法0）', min: 0, max: 60, step: 1, default: 20, unit: 'N' },
    { key: 'mu', label: '摩擦因数 μ', min: 0, max: 0.4, step: 0.05, default: 0.1 },
    { key: 'th', label: '斜面倾角 θ（搭法1）', min: 15, max: 45, step: 1, default: 30, unit: '°' },
    { key: 'H', label: 'B 悬高 H / 桌长（搭法1）', min: 1, max: 5, step: 0.5, default: 2, unit: 'm' },
  ],
  init(_p, tl) { tl.start('① 系统加速（绳绷紧）', '#4A90D9'); return { xA: 0, vA: 0, xB: 0, vB: 0, phase: 'accel' } },
  step(s, p, d, t, tl) {
    const th = (p.th * Math.PI) / 180
    let a = 0, T = 0
    if (p.setup === 0) {
      a = (p.F - p.mu * (p.m1 + p.m2) * G) / (p.m1 + p.m2)
      if (a < 0) a = 0
      T = p.m2 * a + p.mu * p.m2 * G
    } else if (p.setup === 1) {
      const down = p.m2 * G - p.m1 * G * Math.sin(th) - p.mu * p.m1 * G * Math.cos(th)
      const up = p.m1 * G * Math.sin(th) - p.mu * p.m1 * G * Math.cos(th) - p.m2 * G
      if (down > 0) { a = down / (p.m1 + p.m2); T = p.m2 * (G - a) }        // B 下降
      else if (up > 0) { a = -up / (p.m1 + p.m2); T = p.m2 * (G + a) }      // B 上升（A 沿斜面下滑）
      else { a = 0; T = p.m2 * G }
    } else {
      const aA = (p.m2 * G / 2 - p.mu * p.m1 * G) / (p.m1 + p.m2 / 4)
      a = aA; T = (p.m2 * (G - aA / 2)) / 2
    }
    const vP = s.vA
    if (s.phase === 'accel') {
      s.vA += a * d
      s.xA += ((vP + s.vA) / 2) * d
      s.vB = p.setup === 2 ? s.vA / 2 : s.vA
      s.xB += (p.setup === 2 ? s.vA / 4 : (vP + s.vA) / 2) * d
      if (p.setup === 1 && s.xB >= p.H) {
        tl.switchTo('② B 落地：绳松弛，A 靠惯性减速', '#F5C542', t, `t=${f2(t)}s B 落地（v=${f2(s.vA)} m/s），此后 T=0`)
        s.phase = 'coast'
      }
    } else if (s.phase === 'coast') {
      // A 减速：斜面上受重力分量+摩擦（沿运动反向）；水平只有摩擦
      const dec = (p.setup === 1 ? G * Math.sin(th) : 0) + p.mu * G * Math.cos(th)
      s.vA -= dec * d
      s.xA += ((vP + Math.max(0, s.vA)) / 2) * d
      if (s.vA <= 0) { s.vA = 0; tl.switchTo('③ A 停止', '#8a8aa0', t, `t=${f2(t)}s A 停止，共滑 ${f2(s.xA)} m`); return false }
    }
    return true
  },
  draw(dc, s, p) {
    const { ctx, w, h } = dc
    const gy = h - 80
    if (p.setup === 0) {
      ground(ctx, gy, 20, w - 20, '水平面（可调 μ）', dc.label)
      const PX = 26
      const ax = 120 + s.xA * PX, bx = ax + 90
      block(ctx, ax, gy, 44, 26, '#4A90D9'); dc.label(`A m₁=${p.m1}`, ax + 22, gy - 34, '#9cc5ff')
      block(ctx, bx, gy, 40, 26, '#E05555'); dc.label(`B m₂=${p.m2}`, bx + 20, gy - 34, '#f0a0a0')
      rope(ctx, [[ax + 44, gy - 13], [bx, gy - 13]])
      dc.label('轻绳（不计质量）', (ax + 44 + bx) / 2, gy - 26, '#d9a05a', 10)
      dc.arrow(ax, gy - 44, p.F * 1.6, 0, '#3ecf8e', `F=${p.F}N`)
      dc.arrow(ax + 20, gy + 14, s.vA * 14, 0, '#F5C542', `v=${f2(s.vA)}`)
    } else if (p.setup === 1) {
      const th = (p.th * Math.PI) / 180
      const PX = 26, topX = w * 0.45
      incline(ctx, topX, gy, 6 * PX, 6 * PX * Math.tan(th))
      pulley(ctx, topX, gy - 6 * PX * Math.tan(th) - 14, 10)
      ground(ctx, gy, 20, w - 20, '', undefined)
      const ax = topX - Math.min(s.xA, 5.5) * PX
      const ay = gy - Math.min(s.xA, 5.5) * PX * Math.tan(th)
      block(ctx, ax - 20, ay, 36, 22, '#4A90D9')
      dc.label(`A m₁=${p.m1}`, ax - 2, ay - 30, '#9cc5ff')
      const py = gy - 6 * PX * Math.tan(th) - 14
      const bx = topX + 16, byY = py + 30 + s.xB * PX
      rope(ctx, [[ax + 16, ay - 11], [topX, py], [bx, byY - 13]])
      ball(ctx, bx + 18, byY, 13, '#E05555')
      dc.label(`B m₂=${p.m2}`, bx + 18, byY + 26, '#f0a0a0')
      dc.label(`斜面 θ=${p.th}° μ=${p.mu}`, topX - 3 * PX, gy - 3 * PX * Math.tan(th) - 20, '#3ecf8e')
    } else {
      const PX = 26
      ground(ctx, gy, 20, w - 20, '水平面', dc.label)
      const anchorX = w * 0.62, fixPulleyX = w * 0.5
      const ax = 90 + s.xA * PX
      block(ctx, ax, gy, 40, 24, '#4A90D9'); dc.label(`A m₁=${p.m1}`, ax + 20, gy - 32, '#9cc5ff')
      const mpY = gy - 120
      const bx = fixPulleyX + 40 + s.xB * PX
      rope(ctx, [[ax + 40, gy - 12], [fixPulleyX, mpY - 60], [bx, mpY]])
      rope(ctx, [[bx - 12, mpY], [bx + 12, mpY]], '#8a8aa0', 1)
      pulley(ctx, bx, mpY, 12)   // 动滑轮（B 挂其下）
      rope(ctx, [[bx, mpY + 12], [bx, mpY + 40]])
      ball(ctx, bx, mpY + 54, 14, '#E05555')
      dc.label(`B m₂=${p.m2}（a_B = a_A/2）`, bx, mpY + 80, '#f0a0a0')
      dc.label('定滑轮', fixPulleyX, mpY - 76, '#8a8aa0', 10)
      dc.label('动滑轮', bx + 34, mpY - 8, '#8a8aa0', 10)
      ctx.strokeStyle = '#565675'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(anchorX, gy - 160); ctx.lineTo(anchorX, gy); ctx.stroke()
      rope(ctx, [[bx + 12, mpY], [anchorX, mpY]])
    }
  },
  energy(s, p) {
    const Ek = 0.5 * p.m1 * s.vA * s.vA + (p.setup === 2 ? 0.5 * p.m2 * (s.vA / 2) ** 2 : 0.5 * p.m2 * s.vA * s.vA)
    return { items: [{ name: '系统动能', value: Ek, color: '#F5C542' }], E0: Math.max(1e-9, 1), momentum: undefined }
  },
  readout(p, s) {
    let a = 0, T = 0
    const th = (p.th * Math.PI) / 180
    if (p.setup === 0) { a = Math.max(0, (p.F - p.mu * (p.m1 + p.m2) * G) / (p.m1 + p.m2)); T = p.m2 * a + p.mu * p.m2 * G }
    else if (p.setup === 1) {
      const down = p.m2 * G - p.m1 * G * Math.sin(th) - p.mu * p.m1 * G * Math.cos(th)
      const up = p.m1 * G * Math.sin(th) - p.mu * p.m1 * G * Math.cos(th) - p.m2 * G
      if (down > 0) { a = down / (p.m1 + p.m2); T = p.m2 * (G - a) } else if (up > 0) { a = -up / (p.m1 + p.m2); T = p.m2 * (G + a) } else { a = 0; T = p.m2 * G }
    } else { a = (p.m2 * G / 2 - p.mu * p.m1 * G) / (p.m1 + p.m2 / 4); T = (p.m2 * (G - a / 2)) / 2 }
    return `加速度传感器：a = ${f2(a)} m/s²　力传感器：绳张力 T = ${f2(T)} N${p.setup === 0 ? `　（光滑时内力 T = m₂F/(m₁+m₂) = ${f2((p.m2 * p.F) / (p.m1 + p.m2))} N）` : ''}${s ? `\n当前 v_A=${f2(s.vA)} m/s，x_A=${f2(s.xA)} m${p.setup === 2 ? `，v_B=${f2(s.vA / 2)} m/s` : ''}` : ''}`
  },
  solution(p) {
    const th = (p.th * Math.PI) / 180
    const nums: string[] = []
    if (p.setup === 0) {
      const a = Math.max(0, (p.F - p.mu * (p.m1 + p.m2) * G) / (p.m1 + p.m2))
      nums.push(`整体：a = (F − μ(m₁+m₂)g)/(m₁+m₂) = ${f2(a)} m/s²`, `隔离 B：T = m₂a + μm₂g = ${f2(p.m2 * a + p.mu * p.m2 * G)} N`, `光滑时 T = m₂F/(m₁+m₂) = ${f2((p.m2 * p.F) / (p.m1 + p.m2))} N`, `恰好滑动：F = μ(m₁+m₂)g = ${f2(p.mu * (p.m1 + p.m2) * G)} N（当前 ${p.F} N → ${p.F > p.mu * (p.m1 + p.m2) * G ? '能动' : '静止'}）`)
    } else if (p.setup === 1) {
      const down = p.m2 * G - p.m1 * G * Math.sin(th) - p.mu * p.m1 * G * Math.cos(th)
      nums.push(`整体（沿绳方向）：a = (m₂g − m₁g sinθ − μm₁g cosθ)/(m₁+m₂) = ${f2(down / (p.m1 + p.m2))} m/s²`, `隔离 B：T = m₂(g − a) = ${f2(p.m2 * (G - down / (p.m1 + p.m2)))} N`, `若为负则 A 沿斜面下滑、B 上升；再负则系统静止`)
    } else {
      const aA = (p.m2 * G / 2 - p.mu * p.m1 * G) / (p.m1 + p.m2 / 4)
      nums.push(`A：T − μm₁g = m₁a_A；B：m₂g − 2T = m₂a_A/2`, `解得 a_A = ${f2(aA)} m/s²，a_B = a_A/2 = ${f2(aA / 2)} m/s²`, `单绳张力 T = m₂(g − a_A/2)/2 = ${f2((p.m2 * (G - aA / 2)) / 2)} N，挂 B 处合力 2T`)
    }
    return {
      problemType: p.setup === 0 ? '连接体：水平面 F 拉动 A-B，求 a 与绳张力' : p.setup === 1 ? '连接体：斜面 + 定滑轮（A 上 B 垂）' : '连接体：动滑轮（位移/加速度减半，力加倍）',
      hints: ['先整体后隔离：整体求 a，隔离求内力 T', '整体法的“整体”沿绳方向拉直成一个方向', '隔离时选受力少的那个（通常挂 B）', '绳松弛（T=0）后不能再当连接体'],
      processes: ['过程一：绳绷紧，系统以共同加速度运动（动滑轮：a_B = a_A/2）', '过程二（斜面搭法）：B 落地后绳松弛，A 靠惯性滑行减速', '过程三：A 停止（或滑出斜面）'],
      forces: ['整体：外力 F / 悬挂端重力 + 总摩擦（内力 T 不出现在整体方程）', '隔离 A：T、F（若有）、摩擦 μm₁g', '隔离 B：T 与 m₂g（动滑轮：两段绳各 T）'],
      laws: ['整体：ΣF_外 = (Σm)a', '隔离：T ∓ μm₂g = m₂a（沿绳方向）', '动滑轮约束：a_B = a_A/2，绳中张力相等'],
      critical: ['恰好滑动：F = μ(m₁+m₂)g（水平）', '斜面搭法静止判据：|m₂g − m₁g sinθ| ≤ μm₁g cosθ', '绳松弛：B 落地后 T=0'],
      derivation: ['整体法求 a', '隔离法求 T', '光滑水平面内力：T = m₂F/(m₁+m₂)', '动滑轮：2T − m₂g = m₂a_A/2 联立 T − μm₁g = m₁a_A'],
      numeric: nums,
      pitfalls: ['整体法漏掉某个外力（尤其是摩擦）', '隔离时忘记摩擦力', '绳松弛后仍用整体法', '动滑轮把 a 与 T 的关系搞错（差 2 倍）'],
      similar: ['电梯中的人（超重失重）', '多物体绳串联', '斜面-滑轮组合'],
      competition: ['变质量连接体（链条滑落）', '非惯性系中的连接体（加惯性力）', '绳弹性（波动方程）'],
    }
  },
}
