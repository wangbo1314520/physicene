/**
 * B11 竞赛扩展组 2（纯 3D）：刚体动力学（模型69，斜面纯滚动竞速）· 电磁感应 + 微分方程（模型70）
 */
import * as THREE from 'three'
import type { EMSceneDef, EMKit } from '../../../engine/emScene'
import { mkMesh, GrowingTrail, arrowMesh } from '../../../renderers/canvas3d/three-kit'
import { C, f2, f3, bar, label, arrowGridXZ } from './em-kit'

const G = 9.8

/* ══════════ 模型 69：刚体动力学（纯滚动竞速） ══════════ */
const BODIES = [{ name: '薄圆环', k: 1, color: 0xE05555 }, { name: '实心圆柱', k: 0.5, color: 0xF5C542 }, { name: '实心球', k: 0.4, color: 0x3ecf8e }]
interface RB { mesh: THREE.Mesh; s: number; v: number; arrived: number | null }
interface S69 { grp: THREE.Group; bodies: RB[]; done: boolean }
export const rigidBody: EMSceneDef<S69> = {
  id: 'gk-rigid-body',
  title: '刚体动力学（斜面纯滚动竞速 · 转动惯量）',
  desc: '薄圆环（I=mR²）、实心圆柱（I=½mR²）、实心球（I=⅖mR²）同时从斜面顶端由静止纯滚动下滑。加速度 a=g sinθ/(1+k)（k=I/mR²），与质量、半径都无关，只与质量分布有关：球最快、环最慢。机械能守恒中动能分为平动 ½mv² 与转动 ½Iω²，比例 1:k。',
  formula: '纯滚动 v=ωR　mg sinθ−f=ma，fR=Iα，α=a/R → a=g sinθ/(1+k)　t=√(2L(1+k)/(g sinθ))　E_k平:E_k转=1:k',
  params: [
    { key: 'th', label: '斜面倾角 θ', min: 10, max: 45, step: 5, default: 30, unit: '°' },
    { key: 'L', label: '斜面长 L', min: 3, max: 10, step: 0.5, default: 6, unit: 'm' },
  ],
  camera: { pos: [0, 5, 12], target: [0, 0.3, 0] },
  timeScale: 0.7,
  init(p, tl, kit) {
    tl.start('同时释放：纯滚动下滑', '#F5C542')
    const th = (p.th * Math.PI) / 180
    const grp = kit.track(new THREE.Group()); grp.rotation.z = -th; grp.position.set(-p.L / 2 * Math.cos(th), p.L / 2 * Math.sin(th) - 1, 0)
    const gk: EMKit = { scene: kit.scene, track: (o) => { grp.add(o); return o } }
    const plane = gk.track(mkMesh(new THREE.BoxGeometry(p.L + 1, 0.2, 7), 0x3a3a5e)); plane.position.set(p.L / 2, -0.1, 0)
    for (let i = 1; i < p.L; i++) { const tick = gk.track(mkMesh(new THREE.BoxGeometry(0.04, 0.02, 7), 0x565675)); tick.position.set(i, 0.01, 0) }
    label(kit, `θ=${p.th}°　L=${p.L} m　三者半径、质量任意（不影响 a）`, 0, 3.6, 0, '#b0b0cc')
    const R = 0.5
    const bodies: RB[] = BODIES.map((b, i) => {
      const z = (i - 1) * 2.2
      let mesh: THREE.Mesh
      if (i === 0) { mesh = gk.track(mkMesh(new THREE.TorusGeometry(R - 0.06, 0.06, 10, 32), b.color)) }
      else if (i === 1) { mesh = gk.track(mkMesh(new THREE.CylinderGeometry(R, R, 0.9, 24), b.color)); mesh.rotation.x = Math.PI / 2 }
      else { mesh = gk.track(mkMesh(new THREE.SphereGeometry(R, 20, 20), b.color)) }
      mesh.position.set(0, R, z)
      const tag = label(kit, `${b.name} k=${b.k}`, 0, 0, 0, `#${b.color.toString(16).padStart(6, '0')}`, 0.6)
      tag.position.set(grp.position.x + Math.cos(th) * 0 - Math.sin(th) * 0 - 1.2, grp.position.y + 1.0 + (1 - i) * 0.0, z); tag.position.set(-p.L / 2 * Math.cos(th) - 1.6, p.L / 2 * Math.sin(th) - 1 + 0.6 - i * 0.55, z)
      return { mesh, s: 0, v: 0, arrived: null }
    })
    for (let i = 0; i < 3; i++) { const stripe = gk.track(mkMesh(new THREE.BoxGeometry(0.06, 0.03, 0.3), 0xffffff)); stripe.position.set(0, R * 2 - 0.02, (i - 1) * 2.2); void stripe }
    return { grp, bodies, done: false }
  },
  step(s, p, d, t, tl) {
    const th = (p.th * Math.PI) / 180
    let allDone = true
    s.bodies.forEach((b, i) => {
      if (b.arrived !== null) return
      const a = (G * Math.sin(th)) / (1 + BODIES[i].k)
      b.v += a * d; b.s += b.v * d
      if (b.s >= p.L) { b.arrived = t; b.s = p.L; tl.log(t, `${BODIES[i].name}到达 t=${f2(t)} s（理论 √(2L(1+k)/g sinθ)=${f2(Math.sqrt((2 * p.L * (1 + BODIES[i].k)) / (G * Math.sin(th))))}），v=${f2(b.v)} m/s，E_k平:E_k转=1:${BODIES[i].k}`) }
      else allDone = false
    })
    if (allDone) { tl.switchTo('全部到达', '#8a8aa0', t, '名次：球 → 圆柱 → 环（k 越小越快，与 m、R 无关）'); return false }
    return true
  },
  sync(s) {
    const R = 0.5
    s.bodies.forEach((b, i) => {
      b.mesh.position.x = b.s
      const phi = b.s / R
      if (i === 0) b.mesh.rotation.set(0, 0, -phi)
      else if (i === 1) { b.mesh.rotation.set(Math.PI / 2, 0, -phi) }
      else b.mesh.rotation.set(0, 0, -phi)
    })
  },
  readout(p) {
    const th = (p.th * Math.PI) / 180
    return BODIES.map((b) => `${b.name}：a=g sinθ/(1+${b.k})=${f2((G * Math.sin(th)) / (1 + b.k))} m/s²，t=${f2(Math.sqrt((2 * p.L * (1 + b.k)) / (G * Math.sin(th))))} s，到底 v=${f2(Math.sqrt((2 * G * p.L * Math.sin(th)) / (1 + b.k)))} m/s`).join('\n') + `\n对比光滑滑块（不转）：a=g sinθ=${f2(G * Math.sin(th))} m/s²`
  },
  solution(p) {
    const th = (p.th * Math.PI) / 180
    return {
      problemType: '刚体纯滚动：用平动 + 转动方程或能量法求加速度、比较不同质量分布的快慢',
      hints: ['纯滚动约束 v=ωR、a=αR，摩擦是静摩擦、不做功', '两条方程：质心 mg sinθ−f=ma；绕质心 fR=Iα', '把 I 写成 kmR²，m、R 自动约掉', '能量法：mgh=½mv²+½Iω²=½mv²(1+k)'],
      processes: ['释放：静摩擦提供力矩使其转动', '沿斜面匀加速纯滚动', '到底：动能按 1:k 分成平动与转动'],
      forces: ['重力 mg（沿斜面 mg sinθ）', '支持力', '静摩擦力 f=k·mg sinθ/(1+k)（沿斜面向上）'],
      laws: ['牛顿第二定律（质心）', '转动定律 M=Iα', '纯滚动条件 a=αR', '机械能守恒（静摩擦不做功）'],
      critical: ['纯滚动需要 μ ≥ k tanθ/(1+k)，否则边滚边滑', 'a 与 m、R 无关，只与 k 有关', '环 k=1 最慢，球 k=0.4 最快，滑块 k=0 最快'],
      derivation: ['mg sinθ−f=ma，fR=kmR²·(a/R) → f=kma', 'a=g sinθ/(1+k)', `t=√(2L/a)`],
      numeric: BODIES.map((b) => `${b.name}：a=${f2((G * Math.sin(th)) / (1 + b.k))} m/s²，t=${f2(Math.sqrt((2 * p.L * (1 + b.k)) / (G * Math.sin(th))))} s`),
      pitfalls: ['认为重的/大的先到', '静摩擦力做功（纯滚动时不做功）', '忘记转动动能', '把滑动摩擦公式 μN 用于静摩擦'],
      similar: ['溜溜球（yo-yo）', '圆柱在斜面上的临界摩擦系数', '滚动的球撞墙'],
      competition: ['非纯滚动过渡到纯滚动（台球）', '角动量守恒（花样滑冰）', '陀螺进动'],
    }
  },
}

/* ══════════ 模型 70：电磁感应 + 微分方程 ══════════ */
interface S70 { rod: THREE.Mesh; vArrow: THREE.Group; x: number; v: number; trail: GrowingTrail; lastT: number; marks: number }
function tau70(p: Record<string, number>) { return (p.m * p.R) / (p.B * p.L) ** 2 }
export const inductionOde: EMSceneDef<S70> = {
  id: 'gk-induction-circuit-mech',
  title: '电磁感应 + 微分方程（一阶线性 ODE · 时间常数 τ）',
  desc: '导轨导体棒问题的严格解：恒力 F 拉动时 m dv/dt=F−B²L²v/R，解得 v=v_m(1−e^{−t/τ})，τ=mR/(B²L²)，v_m=FR/(B²L²)；无外力有初速时 v=v₀e^{−t/τ}。t=τ 时达到 63.2%（或衰减到 36.8%），t=3τ 达 95%。v–t 板上白线为解析解、黄线为数值仿真。',
  formula: 'm dv/dt=F−(B²L²/R)v　τ=mR/(B²L²)　v=v_m(1−e^{−t/τ})，v_m=FR/(B²L²)　衰减：v=v₀e^{−t/τ}，x_∞=v₀τ',
  params: [
    { key: 'mode', label: '情形', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '恒力 F 从静止启动（趋近终速）' }, { value: 1, label: '初速 v₀ 无外力（指数衰减）' }] },
    { key: 'F', label: '恒力 F', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'N' },
    { key: 'v0', label: '初速 v₀', min: 1, max: 6, step: 0.5, default: 4, unit: 'm/s' },
    { key: 'm', label: '质量 m', min: 0.5, max: 3, step: 0.1, default: 1, unit: 'kg' },
    { key: 'R', label: '电阻 R', min: 0.5, max: 4, step: 0.1, default: 1, unit: 'Ω' },
    { key: 'B', label: '磁感应强度 B', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'L', label: '导轨间距 L', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
  ],
  camera: { pos: [0, 8, 16], target: [0, -1.5, 0] },
  init(p, tl, kit) {
    const tau = tau70(p), vm = (p.F * p.R) / (p.B * p.L) ** 2
    tl.start(p.mode === 0 ? '启动：dv/dt=(F−B²L²v/R)/m' : '衰减：dv/dt=−v/τ', '#F5C542')
    for (const z of [-2, 2]) bar(kit, { x: -9, y: 0, z }, { x: 9, y: 0, z }, 0.09, 0x8a8aa0)
    const res = kit.track(mkMesh(new THREE.BoxGeometry(0.8, 0.4, 1.4), 0xF5C542)); res.position.set(-8.6, 0.2, 0); bar(kit, { x: -8.6, y: 0, z: -2 }, { x: -8.6, y: 0, z: 2 }, 0.05, 0xF5C542)
    arrowGridXZ(kit, { x: 0, y: -1, z: 0 }, -7, 8, -1.5, 1.5, 8, 2, 1.4, C.B, 1.5)
    label(kit, `τ=mR/(B²L²)=${f2(tau)} s　${p.mode === 0 ? `v_m=FR/(B²L²)=${f2(vm)} m/s` : `x_∞=v₀τ=${f2(p.v0 * tau)} m`}`, 0, 2.8, 0, '#b0b0cc')
    const rod = kit.track(mkMesh(new THREE.BoxGeometry(0.36, 0.36, 4.5), 0xE05555, { emissive: 0.25 })); rod.position.set(-7, 0.22, 0)
    const vArrow = kit.track(arrowMesh(new THREE.Vector3(0, 1, 0), 1, C.particle, { radius: 0.06 })); vArrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)); vArrow.position.set(-7, 0.9, 0)
    // v–t 板：解析解白线 + τ 竖线
    const TT = 5 * tau, vScale = p.mode === 0 ? vm : p.v0
    const board = kit.track(mkMesh(new THREE.PlaneGeometry(14, 4.4), 0x1d1d33, { basic: true, opacity: 0.9 })); board.position.set(0, -4.4, -3)
    bar(kit, { x: -6.8, y: -6.2, z: -2.9 }, { x: 6.8, y: -6.2, z: -2.9 }, 0.02, 0x565675); bar(kit, { x: -6.8, y: -6.2, z: -2.9 }, { x: -6.8, y: -2.6, z: -2.9 }, 0.02, 0x565675)
    const pts: THREE.Vector3[] = []
    for (let i = 0; i <= 100; i++) { const t = (i / 100) * TT; const v = p.mode === 0 ? vm * (1 - Math.exp(-t / tau)) : p.v0 * Math.exp(-t / tau); pts.push(new THREE.Vector3(-6.8 + (t / TT) * 13.6, -6.2 + (v / vScale) * 3.2, -2.9)) }
    kit.track(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff })))
    for (let k = 1; k <= 4; k++) { bar(kit, { x: -6.8 + (k / 5) * 13.6, y: -6.2, z: -2.9 }, { x: -6.8 + (k / 5) * 13.6, y: -2.7, z: -2.9 }, 0.012, k === 1 ? 0x3ecf8e : 0x3a3a5e); label(kit, `${k}τ`, -6.8 + (k / 5) * 13.6, -6.5, -2.9, k === 1 ? '#3ecf8e' : '#565675', 0.5) }
    bar(kit, { x: -6.8, y: -6.2 + (p.mode === 0 ? 0.632 : 0.368) * 3.2, z: -2.9 }, { x: 6.8, y: -6.2 + (p.mode === 0 ? 0.632 : 0.368) * 3.2, z: -2.9 }, 0.012, 0x3ecf8e)
    label(kit, p.mode === 0 ? '63.2% v_m' : '36.8% v₀', 7.8, -6.2 + (p.mode === 0 ? 0.632 : 0.368) * 3.2, -2.9, '#3ecf8e', 0.5)
    label(kit, 'v–t：白=解析解，黄=数值仿真', 0, -2.3, -2.9, '#8a8aa0', 0.6)
    const trail = new GrowingTrail(0xF5C542, 3000); kit.track(trail.line)
    return { rod, vArrow, x: -7, v: p.mode === 0 ? 0 : p.v0, trail, lastT: -1, marks: 0 }
  },
  step(s, p, d, t, tl) {
    const tau = tau70(p), vm = (p.F * p.R) / (p.B * p.L) ** 2, k = (p.B * p.L) ** 2 / p.R
    const a = ((p.mode === 0 ? p.F : 0) - k * s.v) / p.m
    s.v += a * d; s.x += s.v * d
    const marks = [1, 3]
    for (const n of marks) { const tn = n * tau; if (t - d < tn && t >= tn && s.marks < n) { s.marks = n; const ratio = p.mode === 0 ? s.v / vm : s.v / p.v0; tl.log(t, `t=${n}τ=${f2(tn)} s：v=${f2(s.v)} m/s（${(ratio * 100).toFixed(1)}% ${p.mode === 0 ? 'v_m' : 'v₀'}，理论 ${((p.mode === 0 ? 1 - Math.exp(-n) : Math.exp(-n)) * 100).toFixed(1)}%）`) } }
    if (t >= 5 * tau || s.x >= 8.5) { tl.log(t, p.mode === 0 ? `5τ 后 v=${f2(s.v)} m/s ≈ v_m=${f2(vm)}（99.3%）` : `5τ 后 v≈0，总位移 x=${f2(s.x + 7)} m（理论 x_∞=v₀τ=${f2(p.v0 * tau)}）`); return false }
    return true
  },
  sync(s, p, t) {
    const tau = tau70(p), vm = (p.F * p.R) / (p.B * p.L) ** 2, vScale = p.mode === 0 ? vm : p.v0
    s.rod.position.x = s.x
    const len = Math.max(0.3, s.v * 0.5); s.vArrow.position.x = s.x + len / 2; s.vArrow.scale.set(1, len, 1); s.vArrow.visible = s.v > 0.02
    if (t - s.lastT >= tau / 60) { s.lastT = t; s.trail.push({ x: -6.8 + Math.min(13.6, (t / (5 * tau)) * 13.6), y: -6.2 + (s.v / vScale) * 3.2, z: -2.85 }) }
  },
  readout(p, s) {
    const tau = tau70(p), vm = (p.F * p.R) / (p.B * p.L) ** 2
    return `τ=mR/(B²L²)=${f2(tau)} s　${p.mode === 0 ? `v(t)=v_m(1−e^{−t/τ})，v_m=${f2(vm)} m/s；t=τ 达 63.2%，3τ 达 95%，5τ 达 99.3%` : `v(t)=v₀e^{−t/τ}；x(t)=v₀τ(1−e^{−t/τ}) → x_∞=v₀τ=${f2(p.v0 * tau)} m（与动量定理 x=mv₀R/B²L² 一致）`}${s ? `\n当前 v=${f2(s.v)} m/s` : ''}`
  },
  solution(p) {
    const tau = tau70(p), vm = (p.F * p.R) / (p.B * p.L) ** 2
    return {
      problemType: '导体棒运动的微分方程解：一阶线性 ODE、时间常数、指数逼近/衰减',
      hints: ['列牛顿第二定律：m dv/dt=F−B²L²v/R——右边是 v 的一次函数', '分离变量：dv/(F−kv)=dt/m，积分得对数', '定义 τ=mR/(B²L²)：v 变化的特征时间', '检验：t→∞ 时 v→v_m（与 a=0 求法一致）'],
      processes: ['t=0：a 最大（F/m 或 −v₀/τ）', '过渡：a 随 v 线性减小', 't≫τ：达到终态（v_m 或 0）'],
      forces: ['恒力 F（模式一）', '安培力 −B²L²v/R（与 v 成正比）'],
      laws: ['m dv/dt=F−(B²L²/R)v', '解：v=v_m(1−e^{−t/τ})；或 v=v₀e^{−t/τ}', '位移 x=∫v dt'],
      critical: ['τ 越小趋近越快：B、L 大、m、R 小', 't=τ 时 63.2%；t=3τ 时 95%', '衰减总位移 x_∞=v₀τ 有限，但时间无限'],
      derivation: ['dv/(F−kv)=dt/m → −(1/k)ln(F−kv)=t/m+C', 'v(0)=0 → v=(F/k)(1−e^{−kt/m})，τ=m/k=mR/(B²L²)'],
      numeric: [`τ=${f2(tau)} s`, p.mode === 0 ? `v_m=${f2(vm)} m/s；t=τ：${f2(0.632 * vm)}，3τ：${f2(0.95 * vm)} m/s` : `x_∞=${f2(p.v0 * tau)} m`],
      pitfalls: ['把指数过程当匀变速', '认为有限时间内能严格达到 v_m', '积分常数漏掉初始条件', 'τ 与 RC 电路、RL 电路的时间常数类比时单位搞错'],
      similar: ['RC 电路充放电（同形式 ODE）', '空气阻力∝v 的落体（终速）', 'RL 电路电流上升'],
      competition: ['含自感的二阶 ODE', '阻力∝v² 的非线性情形', '拉普拉斯变换解暂态'],
    }
  },
}
