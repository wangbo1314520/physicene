/**
 * B11 电磁场景组 9（P2）：导体棒 + 弹簧（模型43，电磁阻尼振动）· 电学黑箱（模型50，多用电表探测）
 */
import * as THREE from 'three'
import type { EMSceneDef, EMKit } from '../../../engine/emScene'
import { mkMesh, GrowingTrail } from '../../../renderers/canvas3d/three-kit'
import { C, f1, f2, f3, bar, label, arrowGridXZ } from './em-kit'

/* ══════════ 模型 43：导体棒 + 弹簧 ══════════ */
interface S43 { rod: THREE.Mesh; rings: THREE.Mesh[]; x: number; v: number; Q: number; trail: GrowingTrail; lastT: number; cross: number[]; logged: number }
export const rodSpring: EMSceneDef<S43> = {
  id: 'gk-rod-spring',
  title: '导体棒 + 弹簧 + 磁场（电磁阻尼振动 · 能量耗散）',
  desc: '导体棒连在弹簧上，置于水平光滑导轨与竖直磁场中，导轨另一端接电阻 R。拉开 x₀ 释放：弹簧力 −kx 提供回复力，切割产生的安培力 −B²L²v/R 与速度成正比 → 线性阻尼振动 m x¨=−kx−(B²L²/R)x˙，振幅按 e^{−γt} 衰减（γ=B²L²/2mR），机械能全部变为焦耳热。断开电路（R→∞）则为无阻尼简谐。',
  formula: 'm x¨+(B²L²/R)x˙+kx=0　γ=B²L²/(2mR)　ω_d=√(k/m−γ²)　x=x₀e^{−γt}cos(ω_d t)　Q_总=½kx₀²',
  params: [
    { key: 'm', label: '棒质量 m', min: 0.5, max: 3, step: 0.1, default: 1, unit: 'kg' },
    { key: 'k', label: '劲度系数 k', min: 5, max: 60, step: 1, default: 20, unit: 'N/m' },
    { key: 'B', label: '磁感应强度 B', min: 0, max: 2, step: 0.1, default: 1, unit: 'T' },
    { key: 'L', label: '导轨间距 L', min: 0.5, max: 2, step: 0.1, default: 1, unit: 'm' },
    { key: 'R', label: '电阻 R', min: 0.5, max: 5, step: 0.1, default: 1, unit: 'Ω' },
    { key: 'x0', label: '初始拉开 x₀', min: 0.5, max: 3, step: 0.1, default: 2, unit: 'm' },
  ],
  camera: { pos: [0, 8, 16], target: [0, -1, 0] },
  init(p, tl, kit) {
    tl.start('释放：弹簧力回复 + 安培力阻尼', '#F5C542')
    for (const z of [-2, 2]) bar(kit, { x: -9, y: 0, z }, { x: 9, y: 0, z }, 0.09, 0x8a8aa0)
    const wall = kit.track(mkMesh(new THREE.BoxGeometry(0.3, 1.2, 5), 0x565675)); wall.position.set(-9, 0.4, 0)
    const res = kit.track(mkMesh(new THREE.BoxGeometry(0.8, 0.4, 1.4), 0xF5C542)); res.position.set(8.6, 0.2, 0); bar(kit, { x: 8.6, y: 0, z: -2 }, { x: 8.6, y: 0, z: 2 }, 0.05, 0xF5C542)
    label(kit, `R=${p.R} Ω`, 8.6, 1.1, 0, '#F5C542', 0.7)
    if (p.B > 0) arrowGridXZ(kit, { x: 0, y: -1, z: 0 }, -7, 7, -1.5, 1.5, 8, 2, 1.4, C.B, 1.5)
    label(kit, `B=${p.B} T（↓）　k=${p.k} N/m　γ=B²L²/(2mR)=${f3((p.B * p.B * p.L * p.L) / (2 * p.m * p.R))} s⁻¹`, 0, 2.8, 0, '#b0b0cc')
    const rod = kit.track(mkMesh(new THREE.BoxGeometry(0.36, 0.36, 4.5), 0xE05555, { emissive: 0.25 })); rod.position.set(p.x0, 0.22, 0)
    const rings: THREE.Mesh[] = []
    for (let i = 0; i < 14; i++) { const r = kit.track(mkMesh(new THREE.TorusGeometry(0.28, 0.04, 6, 14), 0x3ecf8e)); r.rotation.y = Math.PI / 2; rings.push(r) }
    label(kit, '弹簧（原长时棒在 x=0）', -4.5, 1.0, 0, '#3ecf8e', 0.7)
    // x–t 板
    const board = kit.track(mkMesh(new THREE.PlaneGeometry(14, 4), 0x1d1d33, { basic: true, opacity: 0.9 })); board.position.set(0, -4.2, -3)
    bar(kit, { x: -6.8, y: -4.2, z: -2.9 }, { x: 6.8, y: -4.2, z: -2.9 }, 0.02, 0x565675)
    const gam = (p.B * p.B * p.L * p.L) / (2 * p.m * p.R), TT = 12
    for (const sgn of [1, -1]) { const pts: THREE.Vector3[] = []; for (let i = 0; i <= 60; i++) { const t = (i / 60) * TT; pts.push(new THREE.Vector3(-6.8 + (t / TT) * 13.6, -4.2 + sgn * (p.x0 * Math.exp(-gam * t) / p.x0) * 1.6, -2.9)) } kit.track(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x8a8aa0 }))) }
    label(kit, `x–t：包络 ±x₀e^{−γt}（灰）`, -3.5, -2.5, -2.9, '#8a8aa0', 0.6)
    const trail = new GrowingTrail(0xF5C542, 4000); kit.track(trail.line)
    return { rod, rings, x: p.x0, v: 0, Q: 0, trail, lastT: -1, cross: [], logged: 0 }
  },
  step(s, p, d, t, tl) {
    const BL = p.B * p.L, i = (BL * s.v) / p.R
    const a = (-p.k * s.x - BL * i) / p.m
    const xPrev = s.x
    s.v += a * d; s.x += s.v * d; s.Q += i * i * p.R * d
    if (xPrev > 0 && s.x <= 0) s.cross.push(t)
    if (s.cross.length >= 2 && s.logged < s.cross.length - 1) {
      s.logged = s.cross.length - 1
      const T = s.cross[s.cross.length - 1] - s.cross[s.cross.length - 2]
      const gam = (p.B * p.B * p.L * p.L) / (2 * p.m * p.R), wd = Math.sqrt(Math.max(0, p.k / p.m - gam * gam))
      tl.log(t, `第 ${s.logged} 个周期：T=${f2(T)} s（理论 2π/ω_d=${f2((2 * Math.PI) / wd)}），累计焦耳热 Q=${f2(s.Q)} J（总机械能 ½kx₀²=${f2(0.5 * p.k * p.x0 * p.x0)}），当前机械能 ${f2(0.5 * p.k * s.x * s.x + 0.5 * p.m * s.v * s.v)} J`)
    }
    if (t >= 12) { tl.log(t, `12 s 后：机械能剩 ${f1(((0.5 * p.k * s.x * s.x + 0.5 * p.m * s.v * s.v) / (0.5 * p.k * p.x0 * p.x0)) * 100)}%，其余成焦耳热 Q=${f2(s.Q)} J`); return false }
    return true
  },
  sync(s, p, t) {
    s.rod.position.x = s.x
    const Lsp = s.x + 9
    s.rings.forEach((r, i) => { r.position.set(-9 + ((i + 0.5) / s.rings.length) * (Lsp - 0.2), 0.22, 0); r.scale.set(1, 1, Math.min(1.5, Math.max(0.4, 8 / Lsp))) })
    if (t - s.lastT >= 0.02) { s.lastT = t; s.trail.push({ x: -6.8 + Math.min(13.6, (t / 12) * 13.6), y: -4.2 + (s.x / p.x0) * 1.6, z: -2.9 }) }
  },
  readout(p, s) {
    const gam = (p.B * p.B * p.L * p.L) / (2 * p.m * p.R), w0 = Math.sqrt(p.k / p.m), wd = Math.sqrt(Math.max(0, w0 * w0 - gam * gam))
    return `γ=B²L²/(2mR)=${f3(gam)} s⁻¹　ω₀=√(k/m)=${f3(w0)}　ω_d=√(ω₀²−γ²)=${f3(wd)} rad/s（T_d=${f2((2 * Math.PI) / wd)} s）　${gam >= w0 ? '过阻尼（不振动）' : '欠阻尼：振幅每周期衰减为 e^{−γT}=' + f3(Math.exp(-gam * (2 * Math.PI) / wd)) + ' 倍'}
最终全部机械能 ½kx₀²=${f2(0.5 * p.k * p.x0 * p.x0)} J 变为焦耳热${s ? `\n当前 x=${f2(s.x)} m，v=${f2(s.v)} m/s，Q=${f2(s.Q)} J` : ''}`
  },
  solution(p) {
    const gam = (p.B * p.B * p.L * p.L) / (2 * p.m * p.R), w0 = Math.sqrt(p.k / p.m)
    return {
      problemType: '导体棒 + 弹簧在磁场中的振动：电磁阻尼、能量转化、最终状态',
      hints: ['安培力 B²L²v/R 与速度成正比且反向——正是线性阻尼', '弹簧提供回复力，仍是“振动”，但振幅衰减', '能量去向：机械能 → 焦耳热，最终棒停在原长位置', '断开电路后无阻尼，是标准简谐运动'],
      processes: ['释放：弹簧力使棒加速，切割产生电流与安培力', '往复振动，每个周期损失部分机械能', '最终停在平衡位置，总热量 ½kx₀²'],
      forces: ['弹簧弹力 −kx', '安培力 −B²L²v/R（阻尼）', '竖直方向重力与支持力平衡'],
      laws: ['m x¨=−kx−(B²L²/R)x˙', '能量守恒：½kx₀²=E_机+Q', 'q=BLΔx/R（每段位移对应电荷量）'],
      critical: ['γ<ω₀ 欠阻尼振动；γ≥ω₀ 过阻尼不振动', 'B 越大 / R 越小 阻尼越强', '通过电阻的总电荷量 q=BLx₀/R（从 x₀ 到 0 的净位移）'],
      derivation: ['特征方程 mλ²+(B²L²/R)λ+k=0', 'x=x₀e^{−γt}cos(ω_d t)，γ=B²L²/(2mR)，ω_d=√(k/m−γ²)'],
      numeric: [`γ=${f3(gam)} s⁻¹，ω₀=${f3(w0)} rad/s`, `总焦耳热 ${f2(0.5 * p.k * p.x0 * p.x0)} J`],
      pitfalls: ['把安培力当恒力', '认为最终停在拉开位置', '通过的电荷量按路程算（应按净位移）', '忽略阻尼对周期的微小影响'],
      similar: ['电磁阻尼摆', '涡流制动', '线框进出磁场'],
      competition: ['品质因数 Q=ω₀/(2γ)', '受迫振动与共振（加交变外力）', '含自感时的二阶电路耦合'],
    }
  },
}

/* ══════════ 模型 50：电学黑箱 ══════════ */
interface Probe { red: string; blk: string; reading: string; note: string }
interface S50 { k: number; tk: number; probes: Probe[]; redM: THREE.Mesh; blkM: THREE.Mesh; needle: THREE.Group; labels: THREE.Sprite[]; done: boolean }
const TPOS: Record<string, [number, number, number]> = { A: [-2.2, 1.3, 0], B: [0, 1.3, 0], C: [2.2, 1.3, 0] }
function probes50(p: Record<string, number>): Probe[] {
  const R = `${p.R} Ω`, fwd = p.dir === 0 ? ['B', 'C'] : ['C', 'B']   // 二极管正向：fwd[0] → fwd[1]
  // 欧姆挡：电流从黑表笔流出、红表笔流入
  const cond = (blk: string, red: string) => blk === fwd[0] && red === fwd[1]
  const rows: [string, string][] = [['A', 'B'], ['B', 'A'], ['B', 'C'], ['C', 'B'], ['A', 'C'], ['C', 'A']]
  return rows.map(([red, blk]) => {
    const pair = [red, blk].sort().join('')
    if (pair === 'AB') return { red, blk, reading: R, note: '两次相同 → 纯电阻' }
    if (pair === 'BC') return cond(blk, red) ? { red, blk, reading: '≈0（导通）', note: `电流 黑${blk}→红${red}：二极管正向` } : { red, blk, reading: '∞', note: `电流 黑${blk}→红${red}：二极管反向截止` }
    return cond(blk === 'A' ? 'B' : blk, red === 'A' ? 'B' : red) ? { red, blk, reading: `${p.R} Ω + 导通`, note: '经 A–B 电阻与 B–C 二极管（正向）' } : { red, blk, reading: '∞', note: '二极管反向，无通路' }
  })
}
export const blackBox: EMSceneDef<S50> = {
  id: 'gk-black-box',
  title: '电学黑箱（多用电表欧姆挡探测 · 二极管极性）',
  desc: '黑箱三个接线柱 A、B、C，内部有一个电阻和一个二极管。用多用电表欧姆挡对每一对接线柱正反各测一次（共 6 次）：读数相同 → 电阻；一次导通一次 ∞ → 二极管。关键：欧姆挡内部电池的正极接黑表笔，电流从黑表笔流出、红表笔流入。',
  formula: '欧姆挡：黑表笔（电流流出）→ 待测 → 红表笔（流入）　二极管：正向导通（读数小）、反向截止（∞）　电阻：正反读数相同',
  params: [
    { key: 'R', label: 'A–B 间电阻 R', min: 10, max: 100, step: 10, default: 20, unit: 'Ω' },
    { key: 'dir', label: 'B–C 间二极管方向', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: '正向 B → C' }, { value: 1, label: '正向 C → B' }] },
  ],
  camera: { pos: [0, 6.5, 17.5], target: [0, 0.8, 0] },
  init(p, tl, kit) {
    tl.start('六次探测：每对接线柱正反各一次', '#F5C542')
    const box = kit.track(mkMesh(new THREE.BoxGeometry(7, 1.2, 3), 0x14142a)); box.position.set(0, 0.6, 0)
    for (const [k, pos] of Object.entries(TPOS)) { const term = kit.track(mkMesh(new THREE.CylinderGeometry(0.18, 0.18, 0.3, 12), 0xd4af37)); term.position.set(pos[0], pos[1], pos[2]); label(kit, k, pos[0], 1.9, pos[2], '#d4af37', 0.8) }
    label(kit, '黑箱', 0, 0.6, 1.7, '#8a8aa0', 0.8)
    // 多用电表
    const body = kit.track(mkMesh(new THREE.BoxGeometry(2.6, 0.4, 2.0), 0x2a2a44)); body.position.set(5.5, 0.2, 0)
    const face = kit.track(mkMesh(new THREE.CylinderGeometry(0.8, 0.8, 0.05, 32), 0xe8e8f0)); face.position.set(5.5, 0.43, -0.2)
    const needle = kit.track(new THREE.Group()); needle.position.set(5.5, 0.5, -0.2)
    const nd = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.75), new THREE.MeshBasicMaterial({ color: 0xE05555 })); nd.position.z = -0.37; needle.add(nd)
    label(kit, '多用电表（Ω 挡）', 5.5, 1.6, 0.3, '#b0b0cc', 0.7); label(kit, '∞ ← 刻度 → 0', 5.5, 1.1, -1.2, '#565675', 0.5)
    const redM = kit.track(mkMesh(new THREE.SphereGeometry(0.16, 12, 12), 0xE05555, { emissive: 0.4 })), blkM = kit.track(mkMesh(new THREE.SphereGeometry(0.16, 12, 12), 0x222233, { emissive: 0.1 }))
    const probes = probes50(p)
    const labels: THREE.Sprite[] = probes.map((pr, i) => { const s = label(kit, `${i + 1}. 红${pr.red} 黑${pr.blk}：${pr.reading}`, -6.2, 2.9 - i * 0.55, 0, '#8a8aa0', 0.7); s.visible = false; return s })
    label(kit, '读数记录', -6.2, 3.5, 0, '#F5C542', 0.8)
    return { k: 0, tk: 0, probes, redM, blkM, needle, labels, done: false }
  },
  step(s, _p, d, t, tl) {
    s.tk += d
    if (s.k < s.probes.length && s.tk >= 1.3) {
      const pr = s.probes[s.k]
      s.labels[s.k].visible = true
      tl.log(t, `第 ${s.k + 1} 次 红${pr.red} 黑${pr.blk}：${pr.reading}——${pr.note}`)
      s.k++; s.tk = 0
      if (s.k === s.probes.length) {
        const fwd = _p.dir === 0 ? 'B→C' : 'C→B'
        tl.switchTo('结论', '#3ecf8e', t, `结论：A–B 间为电阻 R=${_p.R} Ω（正反读数相同）；B–C 间为二极管，正向 ${fwd}（红${fwd[2]}黑${fwd[0]} 时导通）；A–C 间无直接元件，经 R 与二极管串联`)
      }
    }
    return t < 1.3 * s.probes.length + 2
  },
  sync(s) {
    const pr = s.probes[Math.min(s.k, s.probes.length - 1)]
    const u = Math.min(1, s.tk / 0.5)
    const rp = TPOS[pr.red], bp = TPOS[pr.blk]
    s.redM.position.set(rp[0], rp[1] + 0.5 + 0.8 * (1 - u), rp[2] + 0.4); s.blkM.position.set(bp[0], bp[1] + 0.5 + 0.8 * (1 - u), bp[2] - 0.4)
    const reading = pr.reading
    const frac = reading.startsWith('∞') ? 0 : reading.startsWith('≈0') ? 1 : 0.6
    s.needle.rotation.y = -(frac * (s.tk >= 0.5 ? 1 : 0) - 0.5) * (2 * Math.PI / 3)
  },
  readout(p, s) {
    return `欧姆挡内部电池：正极接黑表笔 → 电流从黑表笔流出、红表笔流入
判别：正反读数相同=电阻；一次小一次 ∞=二极管，且“小”的那次电流方向（黑→红）就是二极管正向${s ? `\n已测 ${s.k}/6 次` : ''}`
  },
  solution(p) {
    return {
      problemType: '电学黑箱：用多用电表欧姆挡判断接线柱间元件（电阻 / 二极管）及其极性',
      hints: ['每对接线柱都要正反测两次', '读数相同 → 电阻，读数就是阻值（注意倍率）', '一次导通一次 ∞ → 二极管；导通时电流从黑表笔流出经元件到红表笔，这就是正向', '跨接线柱的读数要考虑串联/并联的通路'],
      processes: ['选 Ω 挡、欧姆调零', '按顺序测 6 组（AB、BA、BC、CB、AC、CA）', '列表比较，推断内部结构并画图'],
      forces: ['电路问题不涉及受力'],
      laws: ['欧姆挡原理：I=E/(R_内+R_x)，刻度反向非线性', '二极管单向导电', '串并联通路分析'],
      critical: ['黑表笔是电流流出端（与电压电流挡相反的直觉）', '有二极管时正反读数不同', '两个元件可能同时影响某对接线柱读数'],
      derivation: ['A–B 正反相同 → 纯电阻', `B–C：黑${p.dir === 0 ? 'B' : 'C'}红${p.dir === 0 ? 'C' : 'B'} 导通 → 正向 ${p.dir === 0 ? 'B→C' : 'C→B'}`, 'A–C：经 R 与二极管串联，只有二极管正向时有读数'],
      numeric: [`R=${p.R} Ω`, `二极管正向 ${p.dir === 0 ? 'B→C' : 'C→B'}`],
      pitfalls: ['以为红表笔流出电流', '只测一次就下结论', '忘记欧姆调零/换挡重调', '忽略跨接线柱的间接通路'],
      similar: ['判断二极管好坏', '测电池内阻黑箱', '含电容黑箱（指针偏转后回摆）'],
      competition: ['数字表二极管挡', '含非线性元件的伏安特性测定', '未知网络的等效电阻推断'],
    }
  },
}
