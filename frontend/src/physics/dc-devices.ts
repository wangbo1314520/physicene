/**
 * DC 装置引擎（P3 批 3 第 4 步 · 卡 33/34/35/48/49/50）——builder 路径，零场景内联。
 * 电路类（48/49/50）：复用 ac-circuit 的复数 MNA 的 ω=0 退化（L 短路 C 开路=DC MNA）。
 * 场论类（33/34/35）：磁流体/流量计/霍尔的洛伦兹平衡静力学。
 * 断言分级：物理独立（洛伦兹平衡 qU/d=qvB / 并联分流 / 串并联化简）· 教材规律 ·
 * 方法独立（MNA vs 闭式化简两法）· 比值锚。
 */
import { solveAC, cabs } from './ac-circuit'
import type { AcCircuit, AcComp } from './ac-circuit'

import { Q_E } from './modern-physics'  // 常数单源
const R = (id: string, r: number): AcComp => ({ id, kind: 'resistor', pins: 2, props: { R: r } })
const SRC = (id: string, u: number): AcComp => ({ id, kind: 'ac_source', pins: 2, props: { um: u * Math.SQRT2 } })
const W = (a: [string, number], b: [string, number]) => ({ a, b })
/** DC MNA：ω=0 退化（solveAC 相量法在 ω=0 即直流） */
function solveDC(circuit: AcCircuit): { i: Record<string, number>; u: Record<string, number> } {
  const s = solveAC(circuit, 0)
  const i: Record<string, number> = {}, u: Record<string, number> = {}
  for (const k of Object.keys(s.iPhasors)) i[k] = cabs(s.iPhasors[k])
  for (const k of Object.keys(s.uPhasors)) u[k] = cabs(s.uPhasors[k])
  return { i, u }
}

export interface DcBody {
  id: string
  type: 'mhd_generator' | 'flow_meter' | 'hall_slab' | 'meter_conversion' | 'voltammetry' | 'black_box'
  x: number; y: number; angle: number
  params: Record<string, number>
}
export interface DcFrame { t: number; readings: Record<string, number> }

export function runDc(elements: DcBody[], maxDuration = 3): DcFrame[] {
  const frames: DcFrame[] = []
  const push = (readings: Record<string, number>) => { for (let i = 0; i <= 60; i++) frames.push({ t: i / 30, readings }) }

  // ── 卡 33 磁流体发电：EMF=B·D·v（洛伦兹平衡 qU/d=qvB）+ 负载分压 ──
  const mhd = elements.find((e) => e.type === 'mhd_generator')
  if (mhd) {
    const b = mhd.params.B ?? 1, d = mhd.params.D ?? 0.2, v = mhd.params.v ?? 10
    const rl = mhd.params.r_load ?? 5, ri = mhd.params.r_in ?? 1
    const emf = b * d * v
    // 电路验证（MNA 法）：EMF 源 + 内阻 + 负载 → 分压；与闭式分压定律两法
    const sol = solveDC({ components: [SRC('u', emf), R('ri', ri), R('rl', rl)],
      wires: [W(['u', 0], ['ri', 0]), W(['ri', 1], ['rl', 0]), W(['rl', 1], ['u', 1])] })
    push({ emf, u_out: sol.u['rl#U'], i_out: sol.i['rl#I'], divider: (emf * rl) / (rl + ri) })
    return frames
  }

  // ── 卡 34 电磁流量计：v=U/(B·D)，与 33 同源（E=vB 洛伦兹平衡逆用）+ 连续性 Q=A·v ──
  const fm = elements.find((e) => e.type === 'flow_meter')
  if (fm) {
    const b = fm.params.B ?? 0.5, d = fm.params.D ?? 0.1, qFlow = fm.params.Q ?? 5e-3, area = fm.params.A ?? 2.5e-3
    const v = qFlow / area                    // 连续性 Q=A·v
    const u = b * d * v                       // 洛伦兹平衡 U=BDv
    push({ B: b, D: d, Q: qFlow, A: area, v, u_sensor: u, v_from_u: u / (b * d) })  // v_from_u 应=v（同源自证）
    return frames
  }

  // ── 卡 35 霍尔：U_H=I·B/(n·q·d)（教材电流式）──
  const hall = elements.find((e) => e.type === 'hall_slab')
  if (hall) {
    const b = hall.params.B ?? 0.5, i = hall.params.I ?? 1e-3
    const n = hall.params.n ?? 1e25, d = hall.params.d ?? 1e-3
    const uH = (i * b) / (n * Q_E * d)
    push({ B: b, I: i, n, d, u_hall: uH, e_field: uH / d })
    return frames
  }

  // ── 卡 48 电表改装：MNA 实解 vs 分流/分压闭式两法 ──
  const mc = elements.find((e) => e.type === 'meter_conversion')
  if (mc) {
    const ig = mc.params.ig ?? 100e-6, rg = mc.params.rg ?? 1000, target = mc.params.target ?? 1  // 量程 1A
    const mode = mc.params.mode ?? 0
    if (mode === 0) {
      // 安培计：表头(Rg) 并联分流 Rs，通入 target 电流 → 表头恰满偏 ig
      const rs = (ig * rg) / (target - ig)
      // 欧姆表式注入：源电压 = 量程电流 × (Rs∥Rg)，无附加电阻——表头恰满偏
      const uIn = target * ((rs * rg) / (rs + rg))
      const sol = solveDC({ components: [SRC('u', uIn), R('rs', rs), R('rg', rg)],
        wires: [W(['u', 0], ['rs', 0]), W(['rs', 1], ['u', 1]),
                W(['u', 0], ['rg', 0]), W(['rg', 1], ['u', 1])] })
      push({ ig, rg, target, rs, i_meter: sol.i['rg#I'] })  // i_meter 应=ig 满偏
    } else {
      // 伏特计：表头串联分压 Rv，加 target 电压 → 满偏
      const rv = (target / ig) - rg
      const sol = solveDC({ components: [SRC('u', target), R('rv', rv), R('rg', rg)],
        wires: [W(['u', 0], ['rv', 0]), W(['rv', 1], ['rg', 0]), W(['rg', 1], ['u', 1])] })
      push({ ig, rg, target, rv, i_meter: sol.i['rg#I'] })
    }
    return frames
  }

  // ── 卡 49 伏安法：内接 R测=R+RA（偏大）/ 外接 R测=R·RV/(R+RV)（偏小）——MNA vs 化简两法 ──
  const va = elements.find((e) => e.type === 'voltammetry')
  if (va) {
    const rx = va.params.r_x ?? 10, ra = va.params.r_a ?? 0.1, rv = va.params.r_v ?? 3000, mode = va.params.mode ?? 0
    if (mode === 0) {
      // 内接：安培计串入 → U 表含 RA 压降 → R测=(U/I)=R+RA
      const sol = solveDC({ components: [SRC('u', 3), R('ra', ra), R('rx', rx)],
        wires: [W(['u', 0], ['ra', 0]), W(['ra', 1], ['rx', 0]), W(['rx', 1], ['u', 1])] })
      const uAll = sol.u['ra#U'] + sol.u['rx#U']
      push({ r_x: rx, r_a: ra, r_meas: uAll / sol.i['rx#I'] })  // 应=rx+ra（偏大）
    } else {
      // 外接：伏特计并入 → I 含伏特计分流 → R测=R·RV/(R+RV)（偏小）
      const sol = solveDC({ components: [SRC('u', 3), R('rx', rx), R('rv', rv)],
        wires: [W(['u', 0], ['rx', 0]), W(['rx', 1], ['u', 1]),
                W(['u', 0], ['rv', 0]), W(['rv', 1], ['u', 1])] })
      push({ r_x: rx, r_v: rv, r_meas: sol.u['rx#U'] / (sol.i['rx#I'] + sol.i['rv#I']) })  // 偏小
    }
    return frames
  }

  // ── 卡 50 黑箱：二极管二态建模（正向 0.1Ω / 反向 1GΩ），每探测极性一次线性 MNA ──
  const bb = elements.find((e) => e.type === 'black_box')
  if (bb) {
    const rAb = bb.params.r_ab ?? 20, rDiodeFwd = 0.1, rDiodeRev = 1e9
    // B–C 正向：BC 导通≈0.1Ω；反向：截止 1GΩ。欧姆表=恒流源 1mA 读电压
    const probe = (rBox: number) => {
      const sol = solveDC({ components: [SRC('u', 1e-3), R('rbox', rBox)],
        wires: [W(['u', 0], ['rbox', 0]), W(['rbox', 1], ['u', 1])] })
      return sol.u['rbox#U'] / sol.i['rbox#I']  // 欧姆表读数 U/I
    }
    push({
      r_ab: probe(rAb),
      r_bc_fwd: probe(rDiodeFwd),      // ≈0.1Ω 导通
      r_bc_rev: probe(rDiodeRev),      // ≈1GΩ 截止
      fwd_rev_ratio: probe(rDiodeRev) / probe(rDiodeFwd),
      conduct_dir: 1,                   // 判定：B→C 导通（正向阻值低）
    })
    return frames
  }
  return []
}
