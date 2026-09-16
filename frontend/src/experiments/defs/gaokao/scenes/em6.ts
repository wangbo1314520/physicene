/**
 * B11 电磁场景组 6（交流）：变压器 + 远距离输电（场景15 / 模型45 / 模型46，三种搭法）· 交变电流四值（模型47）
 */
import * as THREE from 'three'
import type { EMSceneDef, EMKit } from '../../../engine/emScene'
import { mkMesh, GrowingTrail } from '../../../renderers/canvas3d/three-kit'
import type { Vec3 } from '../../../renderers/canvas3d/FieldEngine'
import { C, f1, f2, f3, bar, label, arrowGrid } from './em-kit'

/* ── 元件 ── */
function coil(kit: EMKit, x: number, y: number, z: number, turns: number, r: number, len: number, color: number) {
  for (let i = 0; i < turns; i++) { const t = kit.track(mkMesh(new THREE.TorusGeometry(r, 0.06, 8, 24), color)); t.rotation.x = Math.PI / 2; t.position.set(x, y - len / 2 + ((i + 0.5) / turns) * len, z) }
}
function core(kit: EMKit, x: number, w: number, h: number) {
  const th = 0.5
  for (const [cx, cy, sx, sy] of [[x - w / 2, 0, th, h], [x + w / 2, 0, th, h], [x, h / 2 - th / 2, w + th, th], [x, -h / 2 + th / 2, w + th, th]]) { const m = kit.track(mkMesh(new THREE.BoxGeometry(sx, sy, 0.6), 0x5c5c7a)); m.position.set(cx, cy, 0) }
}
function lamp(kit: EMKit, x: number, y: number, z: number) {
  const bulb = kit.track(mkMesh(new THREE.SphereGeometry(0.35, 16, 16), 0xF5C542, { emissive: 0.0, opacity: 0.9 }))
  bulb.position.set(x, y, z)
  return { set(power01: number) { const m = bulb.material as THREE.MeshStandardMaterial; m.emissiveIntensity = Math.min(1.5, power01 * 1.5); m.emissive.set(0xF5C542) } }
}
class Dots {
  readonly dots: THREE.Mesh[] = []
  private L = 0; private cum: number[] = []
  constructor(kit: EMKit, readonly pts: Vec3[], n: number, color = 0x3ecf8e) {
    for (let i = 0; i + 1 < pts.length; i++) { this.L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y, pts[i + 1].z - pts[i].z); this.cum.push(this.L) }
    for (let k = 0; k < n; k++) this.dots.push(kit.track(mkMesh(new THREE.SphereGeometry(0.08, 8, 8), color, { basic: true })))
  }
  update(phase: number) {
    this.dots.forEach((d, k) => {
      let s = (((phase + (k / this.dots.length) * this.L) % this.L) + this.L) % this.L
      let i = 0; while (i < this.cum.length - 1 && s > this.cum[i]) i++
      const s0 = i === 0 ? 0 : this.cum[i - 1], a = this.pts[i], b = this.pts[i + 1], u = (s - s0) / Math.max(1e-9, this.cum[i] - s0)
      d.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u)
    })
  }
}

/* ══════════ 场景 15 / 模型 45 / 模型 46：变压器 + 远距离输电 ══════════ */
const SETUPS15 = [{ value: 0, label: '模型 45：理想变压器动态分析' }, { value: 1, label: '模型 46：远距离输电（升压—输电—降压）' }, { value: 2, label: '场景 15：升压输电 vs 直接输电 对比' }]
interface S15 { phase: number; flows: { d: Dots; I: number }[]; lamps: ReturnType<typeof lamp>[]; logged: boolean }
function th15(p: Record<string, number>) {
  const U2 = (p.U1 * p.N2) / p.N1, I2 = U2 / p.R, I1 = (I2 * p.N2) / p.N1
  const P = p.P * 1000, Iline = P / (p.k * p.Ug), Ploss = Iline * Iline * p.r, dU = Iline * p.r
  const Uuser = (p.k * p.Ug - dU) / p.k, Puser = P - Ploss
  const Idir = P / p.Ug, PlossDir = Idir * Idir * p.r
  return { U2, I2, I1, P1: p.U1 * I1, P2: U2 * I2, Iline, Ploss, dU, Uuser, Puser, eta: Puser / P, Idir, PlossDir, etaDir: Math.max(0, 1 - PlossDir / P) }
}
export const transformerTransmission: EMSceneDef<S15> = {
  id: 'gk-transformer-transmission',
  title: '变压器 + 远距离输电（匝数比 · 功率守恒 · 线路损耗）',
  desc: '理想变压器：U₁/U₂=n₁/n₂，I₁/I₂=n₂/n₁，P₁=P₂——副边负载决定副边电流、再决定原边电流（“原边随副边”）。远距离输电：I=P/U，P_损=I²r，升压 k 倍则损耗降为 1/k²；用户端电压=（升压端电压−Ir）/降压比。',
  formula: 'U₁/U₂=n₁/n₂　I₁/I₂=n₂/n₁　P₁=P₂=U₂²/R　输电：I=P/(kU)　P_损=I²r=P²r/(kU)²　ΔU=Ir',
  params: [
    { key: 'setup', label: '搭法', min: 0, max: 2, step: 1, default: 2, options: SETUPS15 },
    { key: 'U1', label: '（45）原边电压 U₁', min: 100, max: 500, step: 10, default: 220, unit: 'V' },
    { key: 'N1', label: '（45）原边匝数 n₁', min: 100, max: 1000, step: 50, default: 200 },
    { key: 'N2', label: '（45）副边匝数 n₂', min: 50, max: 2000, step: 50, default: 50 },
    { key: 'R', label: '（45）负载 R', min: 5, max: 100, step: 5, default: 22, unit: 'Ω' },
    { key: 'P', label: '（46）发电功率 P', min: 10, max: 500, step: 10, default: 100, unit: 'kW' },
    { key: 'Ug', label: '（46）发电机电压 U', min: 200, max: 1000, step: 50, default: 500, unit: 'V' },
    { key: 'k', label: '（46）升压比 k（降压比同）', min: 1, max: 50, step: 1, default: 10 },
    { key: 'r', label: '（46）输电线总电阻 r', min: 1, max: 20, step: 1, default: 5, unit: 'Ω' },
  ],
  camera: { pos: [0, 6, 27], target: [0, 0.5, 0] },
  init(p, tl, kit) {
    const th = th15(p)
    const flows: S15['flows'] = [], lamps: S15['lamps'] = []
    if (p.setup === 0) {
      tl.start('原边随副边：负载 R 决定 I₂ → 决定 I₁', '#F5C542')
      core(kit, 0, 3, 4)
      coil(kit, -1.5, 0, 0, Math.min(12, Math.max(3, Math.round(p.N1 / 60))), 0.55, 2.4, 0xE05555)
      coil(kit, 1.5, 0, 0, Math.min(12, Math.max(2, Math.round(p.N2 / 60))), 0.55, 2.4, 0x4A90D9)
      label(kit, `n₁=${p.N1}`, -1.5, 2.9, 0, '#E05555', 0.8); label(kit, `n₂=${p.N2}`, 1.5, 2.9, 0, '#4A90D9', 0.8)
      const src = kit.track(mkMesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 24), 0xF5C542)); src.position.set(-6, 0, 0); src.rotation.x = Math.PI / 2
      label(kit, `~ U₁=${p.U1} V`, -6, 1.3, 0, '#F5C542', 0.8)
      const loopP: Vec3[] = [{ x: -6, y: 0.6, z: 0.5 }, { x: -6, y: 1.6, z: 0.5 }, { x: -2.2, y: 1.6, z: 0.5 }, { x: -2.2, y: -1.6, z: 0.5 }, { x: -6, y: -1.6, z: 0.5 }, { x: -6, y: -0.6, z: 0.5 }]
      const loopS: Vec3[] = [{ x: 2.2, y: 1.6, z: 0.5 }, { x: 6, y: 1.6, z: 0.5 }, { x: 6, y: -1.6, z: 0.5 }, { x: 2.2, y: -1.6, z: 0.5 }, { x: 2.2, y: 1.6, z: 0.5 }]
      for (const L of [loopP, loopS]) for (let i = 0; i + 1 < L.length; i++) bar(kit, L[i], L[i + 1], 0.04, 0xd9a05a)
      const res = kit.track(mkMesh(new THREE.BoxGeometry(0.5, 1.4, 0.5), 0x3ecf8e)); res.position.set(6, 0, 0.5)
      label(kit, `R=${p.R} Ω`, 6, 1.9, 0, '#3ecf8e', 0.8)
      label(kit, `U₂=${f1(th.U2)} V　I₂=${f2(th.I2)} A　I₁=${f2(th.I1)} A　P₁=P₂=${f1(th.P2)} W`, 0, -3.2, 0, '#b0b0cc')
      flows.push({ d: new Dots(kit, loopP, 12, 0xE05555), I: th.I1 }, { d: new Dots(kit, loopS, 12, 0x4A90D9), I: th.I2 })
      lamps.push(lamp(kit, 6, 0, 1.1))
    } else {
      tl.start(p.setup === 1 ? '升压 → 输电 → 降压' : '对比：升压 k 倍 → 线路电流 1/k、损耗 1/k²', '#F5C542')
      const gen = kit.track(mkMesh(new THREE.CylinderGeometry(0.8, 0.8, 1.2, 24), 0xF5C542)); gen.position.set(-9, 0, 0); gen.rotation.x = Math.PI / 2
      label(kit, `发电机 P=${p.P} kW，U=${p.Ug} V`, -9, 1.8, 0, '#F5C542', 0.8)
      core(kit, -5, 1.6, 2.4); coil(kit, -5.8, 0, 0, 3, 0.4, 1.4, 0xE05555); coil(kit, -4.2, 0, 0, 8, 0.4, 1.8, 0x4A90D9)
      label(kit, `升压 1:${p.k}`, -5, 2.2, 0, '#b0b0cc', 0.7)
      core(kit, 5, 1.6, 2.4); coil(kit, 4.2, 0, 0, 8, 0.4, 1.8, 0x4A90D9); coil(kit, 5.8, 0, 0, 3, 0.4, 1.4, 0xE05555)
      label(kit, `降压 ${p.k}:1`, 5, 2.2, 0, '#b0b0cc', 0.7)
      for (const y of [0.9, -0.9]) bar(kit, { x: -3.6, y, z: 0.3 }, { x: 3.6, y, z: 0.3 }, 0.05, 0x8a8aa0)
      for (const x of [-2, 0, 2]) { const pole = kit.track(mkMesh(new THREE.BoxGeometry(0.12, 2.6, 0.12), 0x565675)); pole.position.set(x, -0.3, 0.3) }
      label(kit, `输电线 r=${p.r} Ω，I=${f1(th.Iline)} A，ΔU=${f1(th.dU)} V`, 0, 1.9, 0, '#8a8aa0', 0.8)
      for (const dx of [8.4, 9.4, 10.4]) { const house = kit.track(mkMesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), 0x2a2a44)); house.position.set(dx, 0, 0); lamps.push(lamp(kit, dx, 0.7, 0)) }
      label(kit, `用户：U=${f1(th.Uuser)} V，P=${f1(th.Puser / 1000)} kW，η=${f1(th.eta * 100)}%`, 9.4, 1.8, 0, '#3ecf8e', 0.8)
      const g: Vec3[] = [{ x: -9, y: 0.8, z: 0.5 }, { x: -9, y: 1.2, z: 0.5 }, { x: -6.3, y: 1.2, z: 0.5 }, { x: -6.3, y: -1.2, z: 0.5 }, { x: -9, y: -1.2, z: 0.5 }, { x: -9, y: -0.8, z: 0.5 }]
      const line: Vec3[] = [{ x: -3.7, y: 0.9, z: 0.3 }, { x: 3.7, y: 0.9, z: 0.3 }, { x: 3.7, y: -0.9, z: 0.3 }, { x: -3.7, y: -0.9, z: 0.3 }, { x: -3.7, y: 0.9, z: 0.3 }]
      const u: Vec3[] = [{ x: 6.3, y: 1.2, z: 0.5 }, { x: 10.8, y: 1.2, z: 0.5 }, { x: 10.8, y: -1.2, z: 0.5 }, { x: 6.3, y: -1.2, z: 0.5 }, { x: 6.3, y: 1.2, z: 0.5 }]
      for (const L of [g, u]) for (let i = 0; i + 1 < L.length; i++) bar(kit, L[i], L[i + 1], 0.04, 0xd9a05a)
      flows.push({ d: new Dots(kit, g, 14, 0xE05555), I: th.Idir }, { d: new Dots(kit, line, 16, 0x9cc5ff), I: th.Iline }, { d: new Dots(kit, u, 14, 0x3ecf8e), I: th.Idir * th.eta })
    }
    return { phase: 0, flows, lamps, logged: false }
  },
  step(s, p, d, t, tl) {
    const th = th15(p)
    s.phase += d
    if (!s.logged && t >= 0.6) {
      s.logged = true
      if (p.setup === 0) tl.log(t, `U₂=U₁n₂/n₁=${f1(th.U2)} V → I₂=U₂/R=${f2(th.I2)} A → I₁=I₂n₂/n₁=${f2(th.I1)} A；P₁=U₁I₁=${f1(th.P1)} W = P₂=${f1(th.P2)} W ✓（R 减小 → I₂、I₁ 同时增大）`)
      else {
        tl.log(t, `升压 ${p.k} 倍：I=P/(kU)=${f1(th.Iline)} A，P_损=I²r=${f2(th.Ploss / 1000)} kW（${f1((th.Ploss / (p.P * 1000)) * 100)}%），ΔU=Ir=${f1(th.dU)} V，用户 U=${f1(th.Uuser)} V，η=${f1(th.eta * 100)}%`)
        if (p.setup === 2) tl.log(t, `直接输电（k=1）：I=P/U=${f1(th.Idir)} A，P_损=${f2(th.PlossDir / 1000)} kW（${f1((th.PlossDir / (p.P * 1000)) * 100)}%）→ 升压后损耗降为 1/k²=1/${p.k * p.k}`)
      }
    }
    return t < 10
  },
  sync(s, p) {
    const th = th15(p)
    s.flows.forEach((f) => f.d.update(s.phase * (0.4 + 0.02 * f.I)))
    const glow = p.setup === 0 ? Math.min(1, th.P2 / 4000) : Math.min(1, th.eta)
    s.lamps.forEach((l) => l.set(glow))
  },
  readout(p) {
    const th = th15(p)
    if (p.setup === 0) return `U₂=U₁n₂/n₁=${f1(th.U2)} V　I₂=U₂/R=${f2(th.I2)} A　I₁=I₂n₂/n₁=${f2(th.I1)} A\nP₁=P₂=${f1(th.P2)} W　动态：R↓ → I₂↑ → I₁↑（U₂ 由匝数比决定，不随 R 变）`
    return `线路电流 I=P/(kU)=${f1(th.Iline)} A　P_损=I²r=${f2(th.Ploss / 1000)} kW（${f1((th.Ploss / (p.P * 1000)) * 100)}%）　ΔU=Ir=${f1(th.dU)} V\n用户端 U=(kU−Ir)/k=${f1(th.Uuser)} V，P=${f1(th.Puser / 1000)} kW，η=${f1(th.eta * 100)}%${p.setup === 2 ? `\n直接输电：I=${f1(th.Idir)} A，P_损=${f2(th.PlossDir / 1000)} kW（${f1((th.PlossDir / (p.P * 1000)) * 100)}%）` : ''}`
  },
  solution(p) {
    const th = th15(p)
    return {
      problemType: p.setup === 0 ? '理想变压器动态分析：匝数比 / 负载变化时 U₂、I₂、I₁、P 如何变' : '远距离输电：求线路电流、损耗功率、电压损失、用户电压与效率',
      hints: ['变压器“电压看匝数、电流看负载、功率原副相等”', '输电损耗 P_损=I²r，关键是减小线路电流：I=P/U，提高 U', '升压 k 倍 → 电流 1/k → 损耗 1/k²', '用户电压 = 升压端电压减去线路压降，再除以降压比'],
      processes: ['发电机输出 P、U', '升压变压器：U↑k 倍、I↓k 倍', '输电线：损耗 I²r、压降 Ir', '降压变压器 → 用户'],
      forces: ['电路问题不涉及受力'],
      laws: ['U₁/U₂=n₁/n₂', 'I₁/I₂=n₂/n₁（理想）', 'P₁=P₂；P_损=I²r；ΔU=Ir'],
      critical: ['U₂ 只由 U₁ 与匝数比决定，与负载无关', 'P_损 用 I²r 算，不能用 U²/r（U 不是线路两端电压）', '效率 η=1−P_损/P'],
      derivation: ['I=P/(kU)', 'P_损=(P/(kU))²r', 'U_用=(kU−Ir)/k'],
      numeric: p.setup === 0 ? [`U₂=${f1(th.U2)} V，I₂=${f2(th.I2)} A，I₁=${f2(th.I1)} A`, `P=${f1(th.P2)} W`] : [`I=${f1(th.Iline)} A，P_损=${f2(th.Ploss / 1000)} kW，η=${f1(th.eta * 100)}%`, `直接输电损耗 ${f2(th.PlossDir / 1000)} kW`],
      pitfalls: ['用 U²/r 算线路损耗', '认为升压后功率变大（功率守恒）', '电流比与匝数比方向搞反', '忘记降压比在用户电压中的作用'],
      similar: ['自耦变压器', '多副线圈变压器', '电网调度'],
      competition: ['非理想变压器的漏磁与铜损铁损', '高压直流输电', '无功功率与功率因数'],
    }
  },
}

/* ══════════ 模型 47：交变电流四值 ══════════ */
interface S47 { group: THREE.Group; trail: GrowingTrail; lamp: ReturnType<typeof lamp>; lastT: number; peaks: number }
export const acFourValues: EMSceneDef<S47> = {
  id: 'gk-ac-four-values',
  title: '交变电流四值（峰值 · 有效值 · 平均值 · 瞬时值）',
  desc: '矩形线圈在匀强磁场中绕垂直于 B 的轴匀速转动：e=NBSω·sin(ωt)（从中性面计时）。峰值 E_m=NBSω；有效值 E=E_m/√2（按热效应，算功率/热量）；平均值 Ē=2E_m/π（半个周期，算电荷量 q=NΔΦ/R）；瞬时值 e(t)。慢放演示，右侧板实时画 e–t。',
  formula: 'e=E_m sinωt，E_m=NBSω　E=E_m/√2（热效应）　Ē=ΔΦ·N/Δt=2E_m/π（半周期）　q=NΔΦ/R',
  params: [
    { key: 'N', label: '匝数 N', min: 50, max: 200, step: 10, default: 100 },
    { key: 'B', label: '磁感应强度 B', min: 0.2, max: 1, step: 0.1, default: 0.5, unit: 'T' },
    { key: 'S', label: '线圈面积 S', min: 0.01, max: 0.05, step: 0.005, default: 0.02, unit: 'm²' },
    { key: 'w', label: '角速度 ω', min: 10, max: 60, step: 1, default: 31.4, unit: 'rad/s' },
    { key: 'R', label: '外电阻 R', min: 10, max: 100, step: 10, default: 50, unit: 'Ω' },
  ],
  camera: { pos: [0, 3, 18], target: [0, -0.8, 0] },
  timeScale: 0.12,
  init(p, tl, kit) {
    tl.start('从中性面开始转动（e=0）', '#F5C542')
    arrowGrid(kit, { x: 1, y: 0, z: 0 }, -5, 5, -2.5, 2.5, 4, 3, 2.2, C.B, -1.5, 0.45)
    label(kit, `B=${p.B} T（沿 +x）`, 0, 3.6, 0, '#b06ce6', 0.8)
    const group = kit.track(new THREE.Group())
    const hw = 1.6, hh = 1.2
    const pts: [Vec3, Vec3][] = [[{ x: 0, y: -hh, z: -hw }, { x: 0, y: hh, z: -hw }], [{ x: 0, y: hh, z: -hw }, { x: 0, y: hh, z: hw }], [{ x: 0, y: hh, z: hw }, { x: 0, y: -hh, z: hw }], [{ x: 0, y: -hh, z: hw }, { x: 0, y: -hh, z: -hw }]]
    for (const [a, b] of pts) { const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, L, 10), new THREE.MeshStandardMaterial({ color: 0xE05555 })); m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3((b.x - a.x) / L, (b.y - a.y) / L, (b.z - a.z) / L)); group.add(m) }
    const axis = kit.track(mkMesh(new THREE.CylinderGeometry(0.05, 0.05, 5.2, 8), 0x8a8aa0)); axis.position.set(0, 0, 0)
    for (const y of [2.0, 2.4]) { const ring = kit.track(mkMesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), 0xd4af37)); ring.rotation.x = Math.PI / 2; ring.position.set(0, y, 0) }
    for (const y of [2.0, 2.4]) { const brush = kit.track(mkMesh(new THREE.BoxGeometry(0.5, 0.1, 0.12), 0x3a3a5e)); brush.position.set(0.45, y, 0) }
    label(kit, '滑环 + 电刷', 1.6, 2.2, 0, '#d4af37', 0.6)
    const lp = lamp(kit, 3.5, 2.2, 0); label(kit, `R=${p.R} Ω`, 3.5, 3.0, 0, '#F5C542', 0.6)
    bar(kit, { x: 0.7, y: 2.0, z: 0 }, { x: 3.5, y: 2.0, z: 0 }, 0.03, 0xd9a05a); bar(kit, { x: 0.7, y: 2.4, z: 0 }, { x: 3.5, y: 2.4, z: 0 }, 0.03, 0xd9a05a)
    // e–t 曲线板
    const board = kit.track(mkMesh(new THREE.PlaneGeometry(9, 4.4), 0x1d1d33, { basic: true, opacity: 0.9 })); board.position.set(0, -4.6, -3.5)
    const Em = p.N * p.B * p.S * p.w
    bar(kit, { x: -4.3, y: -4.6, z: -3.4 }, { x: 4.3, y: -4.6, z: -3.4 }, 0.02, 0x565675)
    bar(kit, { x: -4.3, y: -6.6, z: -3.4 }, { x: -4.3, y: -2.6, z: -3.4 }, 0.02, 0x565675)
    for (const yy of [1, -1]) bar(kit, { x: -4.3, y: -4.6 + 1.6 * yy, z: -3.4 }, { x: 4.3, y: -4.6 + 1.6 * yy, z: -3.4 }, 0.015, 0xF5C542)
    label(kit, `E_m=NBSω=${f1(Em)} V`, -2.8, -2.75, -3.4, '#F5C542', 0.6); label(kit, `有效值 E_m/√2=${f1(Em / Math.SQRT2)} V`, 2.6, -2.75, -3.4, '#3ecf8e', 0.6)
    label(kit, 'e–t（两个周期）', 0, -6.9, -3.4, '#8a8aa0', 0.6)
    const trail = new GrowingTrail(0xF5C542, 4000); kit.track(trail.line)
    return { group, trail, lamp: lp, lastT: -1, peaks: 0 }
  },
  step(s, p, d, t, tl) {
    const T = (2 * Math.PI) / p.w, Em = p.N * p.B * p.S * p.w
    const prev = t - d
    for (let k = 0; k < 4; k++) { const tpk = (0.25 + k * 0.5) * T; if (prev < tpk && t >= tpk) { s.peaks++; tl.log(t, `t=${(0.25 + k * 0.5).toFixed(2)}T：线圈平面与 B 平行，e=±E_m=${f1(Em)} V（Φ=0 但 ΔΦ/Δt 最大）`) } }
    for (let k = 1; k <= 4; k++) { const tz = 0.5 * k * T; if (prev < tz && t >= tz) tl.log(t, `t=${(0.5 * k).toFixed(1)}T：中性面 e=0（Φ 最大）；上半周期平均电动势 Ē=2E_m/π=${f1((2 * Em) / Math.PI)} V，q=NΔΦ/R=${f3((2 * p.N * p.B * p.S) / p.R)} C`) }
    if (t >= 2 * T) { tl.log(t, `两周期结束：有效值 E=${f1(Em / Math.SQRT2)} V → 电阻发热功率 P=E²/R=${f2((Em * Em) / (2 * p.R))} W`); return false }
    return true
  },
  sync(s, p, t) {
    const Em = p.N * p.B * p.S * p.w, T = (2 * Math.PI) / p.w
    s.group.rotation.y = p.w * t
    const e = Em * Math.sin(p.w * t)
    if (t - s.lastT >= T / 120) { s.lastT = t; s.trail.push({ x: -4.3 + (t / (2 * T)) * 8.6, y: -4.6 + (e / Em) * 1.6, z: -3.4 }) }
    s.lamp.set((e * e) / (Em * Em))
  },
  readout(p, s) {
    const Em = p.N * p.B * p.S * p.w, T = (2 * Math.PI) / p.w
    return `E_m=NBSω=${f1(Em)} V　有效值 E=E_m/√2=${f1(Em / Math.SQRT2)} V　半周期平均值 Ē=2E_m/π=${f1((2 * Em) / Math.PI)} V　T=2π/ω=${f3(T)} s
用途：峰值 → 电容耐压；有效值 → 功率/热量（P=E²/R=${f2((Em * Em) / (2 * p.R))} W）；平均值 → 电荷量（半周期 q=NΔΦ/R=${f3((2 * p.N * p.B * p.S) / p.R)} C）；瞬时值 → 某时刻 e${s ? `\n（慢放 ${(1 / 0.12).toFixed(0)}×）当前 e=${f1(Em * Math.sin(p.w * (s.lastT > 0 ? s.lastT : 0)))} V` : ''}`
  },
  solution(p) {
    const Em = p.N * p.B * p.S * p.w
    return {
      problemType: '正弦交变电流的四个值：各自定义、公式与适用场合',
      hints: ['先确定计时起点：中性面起 e=E_m sinωt，与 B 平行起 e=E_m cosωt', '有效值按热效应定义，只对正弦式才有 1/√2', '平均值只在算电荷量时用，且必须指明时间段（半周期 2E_m/π，整周期 0）', '瞬时值是某时刻的值，用于判断方向'],
      processes: ['线圈转动 → 磁通量 Φ=BScosωt 变化 → e=−NdΦ/dt=NBSω·sinωt', '经滑环电刷输出到外电路'],
      forces: ['转动线圈受安培力矩阻碍（需外力矩维持匀速）'],
      laws: ['e=NBSω·sinωt，E_m=NBSω', 'E=E_m/√2，I=E/R，P=I²R', 'Ē=NΔΦ/Δt，q=NΔΦ/R'],
      critical: ['中性面：Φ 最大、e=0、电流方向改变（一周两次）', '与 B 平行：Φ=0、e 最大', '非正弦波形的有效值必须回到热效应定义'],
      derivation: ['Φ=BScosωt → e=NBSω sinωt', 'E²/R·T=∫e²/R dt → E=E_m/√2', '半周期 Ē=N·2BS/(T/2)=2NBSω/π'],
      numeric: [`E_m=${f1(Em)} V，E=${f1(Em / Math.SQRT2)} V，Ē=${f1((2 * Em) / Math.PI)} V`, `P=E²/R=${f2((Em * Em) / (2 * p.R))} W，半周期 q=${f3((2 * p.N * p.B * p.S) / p.R)} C`],
      pitfalls: ['用平均值算功率', '有效值公式用到非正弦波', '中性面处 Φ=0（错，Φ 最大）', '一个周期电流方向只改变一次（错，两次）'],
      similar: ['电容器耐压选择（峰值）', '电阻发热（有效值）', '通过导线电荷量（平均值）'],
      competition: ['非正弦周期信号的有效值积分计算', '三相交流', '傅里叶分解'],
    }
  },
}
