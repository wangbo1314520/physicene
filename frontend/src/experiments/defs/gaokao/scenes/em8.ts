/**
 * B11 电磁场景组 8（P2，运动电荷横向分离三兄弟）：磁流体发电机（模型33）· 电磁流量计（模型34）· 霍尔效应（模型35）
 * 共同物理：q v×B 把正负电荷推向两侧 → 建立横向电场 → qE=qvB 稳态 → U=Bℓv
 */
import * as THREE from 'three'
import type { EMSceneDef, EMKit } from '../../../engine/emScene'
import { mkMesh } from '../../../renderers/canvas3d/three-kit'
import type { Vec3 } from '../../../renderers/canvas3d/FieldEngine'
import { C, f1, f2, f3, bar, label, arrowGridXZ } from './em-kit'

/** 通道中的载流子：沿 +x 匀速漂移，同时被横向力推向 ±z 极板（指数逼近），到极板后重生 */
class Carriers {
  readonly dots: { m: THREE.Mesh; x: number; z: number; sgn: number }[] = []
  constructor(kit: EMKit, n: number, readonly x0: number, readonly x1: number, readonly halfZ: number, readonly y: number, readonly both: boolean, readonly posColor = 0xE05555, readonly negColor = 0x4A90D9) {
    for (let i = 0; i < n; i++) { const sgn = both ? (i % 2 ? -1 : 1) : 1; const m = kit.track(mkMesh(new THREE.SphereGeometry(0.09, 8, 8), sgn > 0 ? posColor : negColor, { basic: true })); this.dots.push({ m, x: x0 + Math.random() * (x1 - x0), z: (Math.random() - 0.5) * halfZ * 1.6, sgn }) }
  }
  /** v：漂移速度（场景单位/s）；side：正电荷被推向 +z(1) 或 −z(−1)；rate：横向逼近速率 */
  update(d: number, v: number, side: number, rate: number) {
    for (const p of this.dots) {
      p.x += v * d
      const target = p.sgn * side * this.halfZ * 0.92
      p.z += (target - p.z) * Math.min(1, rate * d)
      if (p.x > this.x1) { p.x = this.x0; p.z = (Math.random() - 0.5) * this.halfZ * 1.6 }
      p.m.position.set(p.x, this.y, p.z)
    }
  }
}
function channel(kit: EMKit, x0: number, x1: number, halfZ: number, h: number, color = 0x2a2a44) {
  const box = kit.track(mkMesh(new THREE.BoxGeometry(x1 - x0, h, halfZ * 2), color, { opacity: 0.25 })); box.position.set((x0 + x1) / 2, h / 2, 0); (box.material as THREE.Material).depthWrite = false
  for (const s of [1, -1]) { const pl = kit.track(mkMesh(new THREE.BoxGeometry(x1 - x0, h, 0.12), s > 0 ? 0xE05555 : 0x4A90D9, { emissive: 0.15 })); pl.position.set((x0 + x1) / 2, h / 2, s * halfZ) }
}

/* ══════════ 模型 33：磁流体发电机 ══════════ */
interface S33 { car: Carriers; flow: THREE.Mesh[]; phase: number; logged: boolean }
export const mhdGenerator: EMSceneDef<S33> = {
  id: 'gk-mhd-generator',
  title: '磁流体发电机（等离子体 · E=Bdv · 内阻与输出）',
  desc: '高温等离子体（含等量正负离子）以速度 v 沿通道流过竖直磁场 B，洛伦兹力把正、负离子分别推向两侧极板（间距 d），极板间建立电场；稳态 qE=qvB → 电动势 E=Bdv。通道内等离子体有电阻 r（内阻），外接负载 R：I=Bdv/(R+r)，输出功率 P=I²R。',
  formula: 'qE=qvB → E=Bdv　I=Bdv/(R+r)　U_外=IR　P_出=I²R　R=r 时输出最大 P_max=(Bdv)²/(4r)',
  params: [
    { key: 'B', label: '磁感应强度 B（竖直向上）', min: 0.5, max: 3, step: 0.1, default: 1, unit: 'T' },
    { key: 'v', label: '等离子体流速 v', min: 1, max: 10, step: 0.5, default: 6, unit: 'm/s' },
    { key: 'd', label: '极板间距 d', min: 0.2, max: 1, step: 0.1, default: 0.5, unit: 'm' },
    { key: 'r', label: '内阻 r', min: 0.5, max: 4, step: 0.5, default: 1, unit: 'Ω' },
    { key: 'R', label: '负载 R', min: 0.5, max: 8, step: 0.5, default: 2, unit: 'Ω' },
  ],
  camera: { pos: [0, 7, 15], target: [0, 0.5, 0] },
  init(p, tl, kit) {
    tl.start('离子被洛伦兹力分离 → 极板带电 → 稳态 E=Bdv', '#F5C542')
    channel(kit, -6, 4, 1.6, 1.4)
    arrowGridXZ(kit, { x: 0, y: 1, z: 0 }, -5.5, 3.5, -1.2, 1.2, 6, 2, 1.5, C.B, 1.9)
    label(kit, `B=${p.B} T（↑）　v=${p.v} m/s　d=${p.d} m`, -1, 3.6, 0, '#b0b0cc')
    label(kit, '+ 极板（正离子聚集）', -1, 1.0, 2.6, '#E05555', 0.7); label(kit, '− 极板（负离子聚集）', -1, 1.0, -2.6, '#4A90D9', 0.7)
    const nozzle = kit.track(mkMesh(new THREE.CylinderGeometry(0.9, 1.3, 1.6, 20), 0x565675)); nozzle.rotation.z = Math.PI / 2; nozzle.position.set(-7, 0.7, 0)
    label(kit, '燃烧室 → 高速等离子体', -7, 2.2, 0, '#8a8aa0', 0.7)
    const res = kit.track(mkMesh(new THREE.BoxGeometry(0.5, 0.5, 1.4), 0x3ecf8e)); res.position.set(6.5, 0.7, 0)
    label(kit, `负载 R=${p.R} Ω`, 6.5, 1.8, 0, '#3ecf8e', 0.7)
    for (const s of [1, -1]) bar(kit, { x: 4, y: 0.7, z: s * 1.6 }, { x: 6.5, y: 0.7, z: s * 1.6 }, 0.04, 0xd9a05a), bar(kit, { x: 6.5, y: 0.7, z: s * 1.6 }, { x: 6.5, y: 0.7, z: s * 0.7 }, 0.04, 0xd9a05a)
    const flow: THREE.Mesh[] = []
    for (let i = 0; i < 10; i++) { const m = kit.track(mkMesh(new THREE.SphereGeometry(0.07, 8, 8), 0x3ecf8e, { basic: true })); flow.push(m) }
    return { car: new Carriers(kit, 44, -6, 4, 1.6, 0.7, true), flow, phase: 0, logged: false }
  },
  step(s, p, d, t, tl) {
    const E = p.B * p.d * p.v, I = E / (p.R + p.r)
    s.phase += d * (0.5 + I)
    if (!s.logged && t >= 0.8) { s.logged = true; tl.log(t, `E=Bdv=${f2(E)} V，I=E/(R+r)=${f3(I)} A，U_外=IR=${f2(I * p.R)} V，P_出=I²R=${f2(I * I * p.R)} W（效率 R/(R+r)=${f1((p.R / (p.R + p.r)) * 100)}%）`) }
    return t < 10
  },
  sync(s, p) {
    s.car.update(1 / 60, p.v * 0.5, 1, 1.2)
    const E = p.B * p.d * p.v, I = E / (p.R + p.r)
    const loop: Vec3[] = [{ x: 4, y: 0.7, z: 1.6 }, { x: 6.5, y: 0.7, z: 1.6 }, { x: 6.5, y: 0.7, z: -1.6 }, { x: 4, y: 0.7, z: -1.6 }]
    const L = 2.5 + 3.2 + 2.5
    s.flow.forEach((m, k) => {
      let u = ((s.phase * (0.6 + 0.4 * I) + (k / s.flow.length) * L) % L + L) % L
      let pos: Vec3
      if (u < 2.5) pos = { x: loop[0].x + u, y: 0.8, z: 1.6 }
      else if (u < 5.7) pos = { x: 6.5, y: 0.8, z: 1.6 - (u - 2.5) }
      else pos = { x: 6.5 - (u - 5.7), y: 0.8, z: -1.6 }
      m.position.set(pos.x, pos.y, pos.z)
    })
  },
  readout(p) {
    const E = p.B * p.d * p.v, I = E / (p.R + p.r)
    return `E=Bdv=${f2(E)} V　I=${f3(I)} A　U_外=${f2(I * p.R)} V　P_出=${f2(I * I * p.R)} W　P_max（R=r）=(Bdv)²/4r=${f2((E * E) / (4 * p.r))} W
本质：正负离子被 qvB 推向两侧，直到横向电场满足 qE=qvB；上极板为正（正离子侧）`
  },
  solution(p) {
    const E = p.B * p.d * p.v, I = E / (p.R + p.r)
    return {
      problemType: '磁流体发电机：求电动势、电流、输出功率与哪个极板为正',
      hints: ['先判方向：正离子受力用左手定则 → 哪侧极板为正', '稳态时离子不再偏转：qE=qvB → 板间电场 E=vB → 电动势 U=Ed=Bdv', '发电机有内阻 r：外电路 I=E/(R+r)', '功率最大条件 R=r'],
      processes: ['等离子体进入磁场：正负离子向两侧偏转', '极板积累电荷 → 横向电场增大', '稳态：电场力=洛伦兹力，电动势恒定；外电路有电流'],
      forces: ['洛伦兹力 qvB（分离电荷）', '电场力 qE（阻止继续分离）'],
      laws: ['qE=qvB', 'E_动=Bdv', '闭合电路欧姆定律 I=E/(R+r)'],
      critical: ['正极板：正离子受洛伦兹力指向的那一侧', 'E 与 R 无关，I 随 R 减小而增大', 'R=r 时输出功率最大'],
      derivation: ['稳态 qE=qvB → E=Bv', 'U=Ed=Bdv', `I=Bdv/(R+r)=${f3(I)} A`],
      numeric: [`E=${f2(E)} V，I=${f3(I)} A，P=${f2(I * I * p.R)} W`, `最大输出 ${f2((E * E) / (4 * p.r))} W`],
      pitfalls: ['极板正负判反（用左手定则给正离子）', '把 Bdv 当外电压（那是电动势）', '忽略内阻', '认为 v 越大电流无限增大（受内阻限制）'],
      similar: ['霍尔效应', '电磁流量计', '速度选择器'],
      competition: ['等离子体电导率与霍尔参数', 'MHD 推进', '磁约束发电'],
    }
  },
}

/* ══════════ 模型 34：电磁流量计 ══════════ */
interface S34 { car: Carriers; logged: boolean }
export const emFlowmeter: EMSceneDef<S34> = {
  id: 'gk-em-flowmeter',
  title: '电磁流量计（U=BDv · 流量 Q=πD²v/4）',
  desc: '导电液体（如自来水、血液）以速度 v 流过直径 D 的绝缘管，管外加垂直于流向的磁场 B。液体中的正负离子被洛伦兹力推向管壁两侧电极，稳态 qE=qvB → 两电极间电压 U=BDv。测出 U 即得流速与体积流量 Q=Sv=πD²v/4——不需要在管内放任何阻碍物。',
  formula: 'qE=qvB → U=BDv → v=U/(BD)　Q=πD²v/4=πDU/(4B)',
  params: [
    { key: 'B', label: '磁感应强度 B', min: 0.1, max: 2, step: 0.1, default: 0.5, unit: 'T' },
    { key: 'D', label: '管道直径 D', min: 0.05, max: 0.5, step: 0.05, default: 0.2, unit: 'm' },
    { key: 'v', label: '液体流速 v', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'm/s' },
  ],
  camera: { pos: [0, 6, 14], target: [0, 0.5, 0] },
  init(p, tl, kit) {
    tl.start('离子横向分离 → 电极电压 U=BDv', '#F5C542')
    const pipe = kit.track(mkMesh(new THREE.CylinderGeometry(1.4, 1.4, 12, 32, 1, true), 0x4A90D9, { opacity: 0.18, side: THREE.DoubleSide })); pipe.rotation.z = Math.PI / 2; pipe.position.set(0, 0.7, 0); (pipe.material as THREE.Material).depthWrite = false
    for (const s of [1, -1]) { const el = kit.track(mkMesh(new THREE.BoxGeometry(0.6, 0.3, 0.15), 0xd4af37)); el.position.set(0, 0.7, s * 1.45); label(kit, s > 0 ? '电极 +' : '电极 −', 0, 1.6, s * 1.9, s > 0 ? '#E05555' : '#4A90D9', 0.7) }
    bar(kit, { x: 0, y: 0.7, z: 1.5 }, { x: 0, y: 3.2, z: 1.5 }, 0.03, 0xd9a05a); bar(kit, { x: 0, y: 0.7, z: -1.5 }, { x: 0, y: 3.2, z: -1.5 }, 0.03, 0xd9a05a); bar(kit, { x: 0, y: 3.2, z: 1.5 }, { x: 0, y: 3.2, z: -1.5 }, 0.03, 0xd9a05a)
    const meter = kit.track(mkMesh(new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24), 0xe8e8f0)); meter.rotation.x = Math.PI / 2; meter.position.set(0, 3.2, 0)
    label(kit, `电压表 U=BDv=${f3(p.B * p.D * p.v)} V`, 0, 4.1, 0, '#F5C542', 0.8)
    arrowGridXZ(kit, { x: 0, y: 1, z: 0 }, -3, 3, -0.8, 0.8, 4, 2, 1.4, C.B, 2.2)
    label(kit, `B=${p.B} T（↑）　D=${p.D} m　v=${p.v} m/s`, -3.5, 3.4, 0, '#b0b0cc', 0.8)
    label(kit, '导电液体 →', -5.5, 2.0, 0, '#9cc5ff', 0.8)
    return { car: new Carriers(kit, 40, -6, 6, 1.3, 0.7, true), logged: false }
  },
  step(s, p, d, t, tl) {
    if (!s.logged && t >= 0.8) { s.logged = true; tl.log(t, `U=BDv=${f3(p.B * p.D * p.v)} V → v=U/(BD)=${f2(p.v)} m/s，Q=πD²v/4=${f4s((Math.PI * p.D * p.D * p.v) / 4)} m³/s=${f1((Math.PI * p.D * p.D * p.v) / 4 * 1000)} L/s`) }
    return t < 10
  },
  sync(s, p) { s.car.update(1 / 60, p.v * 1.2, 1, 1.0) },
  readout(p) {
    const U = p.B * p.D * p.v, Q = (Math.PI * p.D * p.D * p.v) / 4
    return `U=BDv=${f3(U)} V　v=U/(BD)　Q=πD²v/4=${f4s(Q)} m³/s=${f1(Q * 1000)} L/s
U 与液体电导率无关（只要导电），与流速成正比 → 线性刻度；只在磁场区（管中段）分离电荷`
  },
  solution(p) {
    const U = p.B * p.D * p.v, Q = (Math.PI * p.D * p.D * p.v) / 4
    return {
      problemType: '电磁流量计：由电极电压求流速和流量',
      hints: ['把管中导电液体想成“运动的导体”，D 是切割磁感线的有效长度', '稳态 qE=qvB → E=vB → U=BDv', '流量 = 截面积 × 流速', '正负离子同时向两侧偏转，等价于电动势 BDv'],
      processes: ['液体流入磁场区', '正负离子横向分离到管壁电极', '稳态：电场力平衡洛伦兹力，U 恒定'],
      forces: ['洛伦兹力 qvB', '横向电场力 qE'],
      laws: ['qE=qvB', 'U=Ed=BDv', 'Q=Sv=πD²v/4'],
      critical: ['U∝v，线性', 'U 与液体种类无关（只需导电）', '电极方向必须同时垂直于 B 和 v'],
      derivation: ['E=vB → U=BDv', `v=U/(BD)=${f2(p.v)} m/s`, `Q=πD²v/4=${f4s(Q)} m³/s`],
      numeric: [`U=${f3(U)} V`, `Q=${f1(Q * 1000)} L/s`],
      pitfalls: ['用管长代替直径 D', '认为电压与电导率有关', 'U 的正负与流向无关（错，反向流则电极极性反）', '把 Q 写成 πD²v'],
      similar: ['磁流体发电机', '霍尔效应', '导体棒切割磁感线'],
      competition: ['非均匀流速剖面的加权平均', '交变磁场消除极化', '血流量测量'],
    }
  },
}
const f4s = (x: number) => (Number.isFinite(x) ? x.toFixed(4) : '—')

/* ══════════ 模型 35：霍尔效应 ══════════ */
const QE = 1.602e-19
interface S35 { car: Carriers; logged: boolean }
function uh(p: Record<string, number>) { return (p.B * p.I) / (p.n * 1e28 * QE * p.d * 1e-3) }
export const hallEffect: EMSceneDef<S35> = {
  id: 'gk-hall-effect',
  title: '霍尔效应（U_H=BI/nqd · 判断载流子正负）',
  desc: '通电导体薄片（厚 d、宽 b）置于垂直磁场 B 中，载流子（电子或空穴）被洛伦兹力推向侧面聚集，形成横向霍尔电压 U_H=BI/(nqd)。同样的电流方向，电子导电与空穴导电时 U_H 极性相反——这是判断半导体类型的方法；U_H∝B 可做磁传感器。',
  formula: '稳态 qE_H=qvB，I=nqvbd → U_H=E_H b=BI/(nqd)　霍尔系数 R_H=1/(nq)　载流子密度越小 U_H 越大（半导体 ≫ 金属）',
  params: [
    { key: 'carrier', label: '载流子', min: -1, max: 1, step: 2, default: -1, options: [{ value: -1, label: '电子（金属 / N 型）' }, { value: 1, label: '空穴（P 型）' }] },
    { key: 'I', label: '电流 I（沿 +x）', min: 0.5, max: 5, step: 0.5, default: 2, unit: 'A' },
    { key: 'B', label: '磁感应强度 B（↓）', min: 0.2, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'n', label: '载流子密度 n', min: 0.001, max: 10, step: 0.001, default: 1, unit: '×10²⁸ m⁻³' },
    { key: 'd', label: '薄片厚度 d', min: 0.1, max: 5, step: 0.1, default: 1, unit: 'mm' },
  ],
  camera: { pos: [0, 6, 13], target: [0, 0.3, 0] },
  init(p, tl, kit) {
    tl.start('载流子横向偏转 → 侧面积累电荷 → 霍尔电压', '#F5C542')
    const slab = kit.track(mkMesh(new THREE.BoxGeometry(10, 0.5, 3.2), 0x8a8aa0, { opacity: 0.35 })); slab.position.set(0, 0.25, 0); (slab.material as THREE.Material).depthWrite = false
    arrowGridXZ(kit, { x: 0, y: -1, z: 0 }, -4, 4, -1, 1, 5, 2, 1.4, C.B, 2.2)
    label(kit, `I=${p.I} A →（沿 +x）　B=${p.B} T（↓）　${p.carrier < 0 ? '电子导电：电子逆电流方向漂移' : '空穴导电：空穴顺电流方向漂移'}`, 0, 3.4, 0, '#b0b0cc', 0.9)
    // 载流子受力 F=q v×B（B 沿 −y）：空穴 v=+x → −z；电子 q<0、v=−x → 同为 −z：两者聚集同一侧面、电势相反
    label(kit, '−z 侧面：载流子聚集（电子→带负电 / 空穴→带正电）', 0, 1.2, -2.3, '#F5C542', 0.7)
    label(kit, '+z 侧面：留下相反电荷', 0, 1.2, 2.3, '#8a8aa0', 0.7)
    for (const s of [1, -1]) bar(kit, { x: 0, y: 0.5, z: s * 1.6 }, { x: 0, y: 2.6, z: s * 1.6 }, 0.03, 0xd9a05a)
    bar(kit, { x: 0, y: 2.6, z: 1.6 }, { x: 0, y: 2.6, z: -1.6 }, 0.03, 0xd9a05a)
    const meter = kit.track(mkMesh(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 24), 0xe8e8f0)); meter.rotation.x = Math.PI / 2; meter.position.set(0, 2.6, 0)
    label(kit, `U_H=${fmtUH(uh(p))}（${p.carrier < 0 ? '−z 面电势低' : '−z 面电势高'}）`, 0, 3.0, 0, '#F5C542', 0.8)
    for (const x of [-6.2, 6.2]) { const lead = kit.track(mkMesh(new THREE.BoxGeometry(2.2, 0.2, 0.6), 0xd9a05a)); lead.position.set(x, 0.25, 0) }
    return { car: new Carriers(kit, 36, -5, 5, 1.5, 0.35, false, p.carrier > 0 ? 0xE05555 : 0x4A90D9), logged: false }
  },
  step(s, p, d, t, tl) {
    if (!s.logged && t >= 0.8) { s.logged = true; tl.log(t, `U_H=BI/(nqd)=${fmtUH(uh(p))}；${p.carrier < 0 ? '电子被推到 −z 面 → −z 面电势低' : '空穴被推到 −z 面 → −z 面电势高'}：同一电流方向下极性相反，据此判断载流子类型`) }
    return t < 10
  },
  sync(s, p) { s.car.update(1 / 60, (p.carrier < 0 ? -1 : 1) * 1.5 * (0.5 + p.I * 0.2), -1, 0.9) },
  readout(p) {
    const U = uh(p)
    return `U_H=BI/(nqd)=${fmtUH(U)}　（金属 n~10²⁸：微伏级；半导体 n~10²²：可达伏级 → 霍尔元件用半导体）
漂移速度 v=I/(nqbd)，霍尔电场 E_H=vB；${p.carrier < 0 ? '电子导电' : '空穴导电'}：−z 面电势${p.carrier < 0 ? '低' : '高'}`
  },
  solution(p) {
    const U = uh(p)
    return {
      problemType: '霍尔效应：推导 U_H=BI/(nqd)，判断哪一面电势高、载流子正负',
      hints: ['先定载流子漂移方向：正电荷顺电流、电子逆电流', '用左手定则求洛伦兹力方向（电子要反向）——结论：电子与空穴被推向同一侧面', '稳态 qE_H=qvB，再用 I=nqvS 消去 v', '同侧聚集但电荷正负不同 → 电势高低相反'],
      processes: ['载流子在电流中漂移', '洛伦兹力使其向一侧偏转、积累', '横向电场增大直到 qE_H=qvB，U_H 稳定'],
      forces: ['洛伦兹力 qvB', '横向电场力 qE_H'],
      laws: ['qE_H=qvB', 'I=nqvbd', 'U_H=E_H·b=BI/(nqd)'],
      critical: ['U_H 与宽度 b 无关、与厚度 d 成反比', 'n 越小 U_H 越大', '极性由载流子正负决定'],
      derivation: ['v=I/(nqbd)', 'E_H=vB=BI/(nqbd)', `U_H=E_H·b=BI/(nqd)=${fmtUH(U)}`],
      numeric: [`U_H=${fmtUH(U)}`, `R_H=1/(nq)=${(1 / (p.n * 1e28 * QE)).toExponential(2)} m³/C`],
      pitfalls: ['电子导电时把力的方向按正电荷判断而不反向', '认为电子和空穴聚集在相反侧面（实为同一侧面，电势相反）', 'U_H 写成与 b 有关', '忘记 d 的单位换算'],
      similar: ['磁流体发电机', '电磁流量计', '速度选择器'],
      competition: ['量子霍尔效应', '霍尔角与迁移率', '双载流子导电时的霍尔系数'],
    }
  },
}
function fmtUH(U: number): string { return U >= 1 ? `${f2(U)} V` : U >= 1e-3 ? `${f2(U * 1e3)} mV` : `${f2(U * 1e6)} μV` }
