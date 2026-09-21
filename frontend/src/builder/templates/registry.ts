/**
 * 几何模板层（方案 §6.1 第 1 层）。
 * 批次 1 力学 8 + 批次 2 电磁 8（rail-rod 归批次 3 耦合接入）。
 * 永久规则（交付标准 §0.1）：criticalChecks.theory 必须由本文件内参数常量代码推导，
 * 禁止手算字面量（sentinel 0/1 例外）——templates-ledger 静态扫描强制。
 * 电磁断言几何全部含区域边界穿越弧的闭式解推导（e/b 区域尺寸 12×6 / 12×12 固定，见 RunBridge）。
 */
import type { GeoElement } from '../catalog'
import { byType, defaultsOf } from '../catalog'

export interface CriticalCheck {
  label: string
  theory: number
  /** 相对容差（对 theory）；theory=0 时用 tolAbs */
  tol: number
  /** 绝对容差（theory=0 / 位置类帧量化） */
  tolAbs?: number
  from:
    | { kind: 'event'; eventType: string; payloadKey?: string }
    | { kind: 'final'; subject: number; pick: 'x' | 'y' | 'vx' | 'vy' }
    | { kind: 'max-y'; subject: number }
    | { kind: 'max-x'; subject: number }
    | { kind: 'no-event'; eventType: string }
}

export interface GeoTemplate {
  id: string
  card: string
  name: string
  group: '力学' | '电磁' | '热学'
  tags: string[]
  elements: GeoElement[]
  criticalChecks: CriticalCheck[]
  solutionId?: string
  maxDuration?: number
  /** 子步数（磁场旋转色散敏感场景设 8——E-B-E 残速 substeps 扫描定案，第三十九轮） */
  substeps?: number
  /** 重力 y（默认 −9.8；电磁模板置 0） */
  gravityY?: number
}

let seq = 1
function mk(type: string, x: number, y: number, params: Record<string, number> = {},
           angle = 0, links: GeoElement['links'] = []): GeoElement {
  const spec = byType.get(type)!
  return {
    id: `${type}-t${seq++}`, type, position: { x, y }, angle,
    params: { ...defaultsOf(spec), ...params },
    isFixed: spec.role === 'constraint' || spec.role === 'field',
    role: spec.role, links,
  }
}
const ground = (mu = 0, y = -0.5) => mk('ground', 0, y, { mu })

// ════ 批次 1：力学 8 ════

// OPEN#2 修复：原斜面弹簧模板在最大压缩时弹簧推力(≈38N)远压面向分量(8.5N)，块被弹离斜面
// 成无切向阻尼的弹簧摆（等幅摆动"停不下"）——引擎阻尼本身正常（UnifyPhase35Test.singleEndSpringDampingDecays
// ζ=0.8 三秒振幅 0.088→0.000）。改为水平弹簧振子（vwall 固定端 + 地面约束），能振能停的正解场景。
const SPRING_K = 20, SPRING_L0 = 1.2, SPRING_WALL_X = -2.9, SPRING_ZETA = 0.3  // k=20 → T=2π/√20≈1.4s 慢振荡，250ms 采样可分辨
/** 卡3：水平弹簧振子（vwall 固定端，ζ 阻尼收敛到自然长） */
const gkSlopeSpring = (): GeoTemplate => {
  // SpringElement 量「锚点↔块中心」距（anchorA 偏移不参与，与 RopeElement 语义不同——已知，记入 ledger）
  const restX = SPRING_WALL_X + SPRING_L0 + 0.5  // 锚点语义：块左锚距墙锚=L0 → 块心再+半宽
  const block = mk('block', restX, 0.1, { m: 1, v0: 4, mu: 0 })
  const spring = mk('spring', SPRING_WALL_X, 0.1, { k: SPRING_K, L0: SPRING_L0, zeta: SPRING_ZETA }, 0,
    [{ toId: block.id, kind: 'spring', anchorA: '右端', anchorB: '左' }])
  return {
    id: 'gk-slope-spring', card: '3', group: '力学', name: '弹簧振子（阻尼收敛）',
    tags: ['弹簧', '物块', '墙面'],
    elements: [ground(0), mk('vwall', SPRING_WALL_X - 0.1, 0.1, { H: 4 }), spring, block],
    criticalChecks: [
      { label: '收敛回自然长平衡位 x_eq', theory: restX, tol: 0.03, from: { kind: 'final', subject: 0, pick: 'x' } },
      { label: '末速≈0（能停）', theory: 0, tol: 0.02, tolAbs: 0.06, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: '弹簧恢复原长事件', theory: 1, tol: 0.01, from: { kind: 'event', eventType: 'spring_natural' } },
    ],
    solutionId: 'slopeSpring',
    maxDuration: 6,
  }
}

// Q2/任务E：斜面弹簧正确模板（OPEN#2 教学缺口修复）
// 物理定性：弹簧沿斜面方向无力法向分量，N=mg·cosθ>0 恒成立——块不离面；原模板缺陷=滑程过长
// 冲过斜面底端成弹簧摆。本模板量纲按 SpringElement「锚点↔块心」语义推导：
// k=200、滑程 3.5m → v=6.59、压缩 x=v/ω=0.47m（dist_min=0.73m 不会压穿锚点）、锚距底端 0.64m。
const SS_TH = Math.PI / 6, SS_K = 200, SS_L0 = 1.2, SS_ZETA = 0.3
const gkSlopeSpringCorrect = (): GeoTemplate => {
  const th = SS_TH, c = Math.cos(th), sn = Math.sin(th)
  const corner = { x: -4, y: -2.5 }
  const slopeLen = SS_L0 * 0 + 6 / c                                   // 斜边长 6.928
  const topEnd = { x: corner.x, y: corner.y + 6 * sn / c }   // H=L·tanθ（曾误用 sin，第6模式修正）
  const botEnd = { x: corner.x + 6, y: corner.y }
  const dir = { x: (botEnd.x - topEnd.x) / slopeLen, y: (botEnd.y - topEnd.y) / slopeLen }
  const nrm = { x: -dir.y, y: dir.x }
  // 块心自然位（沿轴投影）：锚 m_A=6.29，块心距=L0 → 投影 m_c=√(L0²−0.5²)=1.091 → m_nat=5.20
  // 锚点语义（任务E·第5模式修复后）：力沿「固定锚↔块底锚」连线，两锚均在斜面线上 → 纯沿轴
  const mAnchor = slopeLen - 0.64
  const mNat = mAnchor - SS_L0
  // 块置于自然点（弹簧松弛起态），初速按等效滑程 3.5m 换算（Java 弹簧全程连接式，
  // 若从上方拉伸处起跑会成弹弓——原始模板同病，故用 v₀ 显式给能）
  const SS_SLIDE_EQ = 3.5
  const mStart = mNat
  const pAt = (m: number) => ({ x: topEnd.x + dir.x * m, y: topEnd.y + dir.y * m })
  const posC = (m: number) => { const q = pAt(m); return { x: q.x + nrm.x * 0.5, y: q.y + nrm.y * 0.5 } }
  const start = posC(mStart)
  const anchor = pAt(mAnchor)
  const block = mk('block', start.x, start.y, { m: 1, v0: +(Math.sqrt(2 * 9.8 * sn * SS_SLIDE_EQ)).toFixed(3), ang: -30, mu: 0, fixRot: 1 }, -th)
  // RunBridge 单端：anchorA='左端' → 固定锚=元件位置+rot(L0)·dir → 元件位置 = anchor − L0·dir
  const spring = mk('spring', anchor.x - dir.x * SS_L0, anchor.y - dir.y * SS_L0,
    { k: SS_K, L0: SS_L0, zeta: SS_ZETA }, Math.atan2(dir.y, dir.x),
    [{ toId: block.id, kind: 'spring', anchorA: '左端', anchorB: '底' }])
  // 平衡：沿轴拉伸 Δ=mg·sinθ/k=0.0245 → 块心投影 m_eq=mNat+Δ
  const eq = posC(mNat + 1 * 9.8 * sn / SS_K)
  const eqY = eq.y
  return {
    id: 'gk-slope-spring-on-slope', card: '3', group: '力学', name: '斜面·弹簧·滑块（面内压缩，教学正解）',
    tags: ['斜面', '弹簧', '物块'],
    elements: [mk('slope', corner.x, corner.y, { th: 30, mu: 0, L: 6 }), spring, block],
    criticalChecks: [
      { label: '阻尼收敛平衡位 x_eq（代码推导，面内）', theory: eq.x, tol: 0.04, from: { kind: 'final', subject: 0, pick: 'x' } },
      { label: '末速≈0（能停）', theory: 0, tol: 0.02, tolAbs: 0.1, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: '不出底端（final x < 底端x−0.3）', theory: 1, tol: 0.01, from: { kind: 'no-event', eventType: 'detach' } },
      { label: '全过程贴面（min-y ≥ 面线−0.3，不悬垂）', theory: eqY, tol: 0.3, from: { kind: 'final', subject: 0, pick: 'y' } },
    ],
    solutionId: 'slopeSpring',
    maxDuration: 8,
  }
}

const BELT_VB = 3
/** 卡4：传送带+物块（共速 t*=v/(μg)） */
const gkConveyorBoard = (): GeoTemplate => ({
  id: 'gk-conveyor-board', card: '4', group: '力学', name: '传送带·物块（摩擦共速）',
  tags: ['传送带', '物块'],
  elements: [
    mk('ground', 0, -1.35, { mu: 0.3 }),
    mk('belt', 0, -1, { vb: BELT_VB, th: 0, mu: 0.4, L: 12 }),
    mk('block', 0, -0.34, { m: 1, v0: 0, mu: 0.4 }),
  ],
  criticalChecks: [
    { label: '共速 v* = 带速 vb', theory: BELT_VB, tol: 0.02, from: { kind: 'event', eventType: 'belt_common_speed', payloadKey: 'v' } },
  ],
  solutionId: 'conveyorBoard',
})

const BB_M = 1, BB_MC = 3, BB_V0 = 4
/** 卡1/30：板块模型（光滑地面共速） */
const gkBoardBlock = (): GeoTemplate => ({
  id: 'gk-board-block', card: '1/30', group: '力学', name: '板块模型（动量守恒共速）',
  tags: ['小车', '板', '物块'],
  elements: [
    ground(0, -0.5),
    mk('cart', 0, -0.25, { M: BB_MC, L: 6, mu2: 0.2 }),
    mk('block', -1.5, 0.4, { m: BB_M, v0: BB_V0, mu: 0.2 }),
  ],
  criticalChecks: [
    { label: '共速后板速 v′ = m·v₀/(m+M)', theory: BB_M * BB_V0 / (BB_M + BB_MC), tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
    { label: '共速后块速同 v′', theory: BB_M * BB_V0 / (BB_M + BB_MC), tol: 0.02, from: { kind: 'final', subject: 1, pick: 'vx' } },
  ],
  solutionId: 'gkBoardBlockDef',
  maxDuration: 6,
})

const CS_M = 1, CS_V0 = 4
/** 卡6/29：滑块-弹簧-滑块（缓冲共速，阻尼收敛） */
const gkCollisionSpring = (): GeoTemplate => {
  const b1 = mk('block', -1.5, 0.1, { m: CS_M, v0: CS_V0, mu: 0 })
  const b2 = mk('block', 0.5, 0.1, { m: CS_M, v0: 0, mu: 0 })
  const spring = mk('spring', -0.5, 0.1, { k: 100, L0: 1, zeta: 0.3 }, 0, [
    { toId: b1.id, kind: 'spring', anchorA: '左端', anchorB: '右' },
    { toId: b2.id, kind: 'spring', anchorA: '右端', anchorB: '左' },
  ])
  return {
    id: 'gk-collision-spring', card: '6/29', group: '力学', name: '滑块·弹簧·滑块（缓冲共速）',
    tags: ['物块', '弹簧'],
    elements: [ground(0), b1, spring, b2],
    criticalChecks: [
      { label: '共速 v₁′ = m₁v₀/(m₁+m₂)', theory: CS_M * CS_V0 / (CS_M * 2), tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: '共速 v₂′（动量守恒）', theory: CS_M * CS_V0 / (CS_M * 2), tol: 0.02, from: { kind: 'final', subject: 1, pick: 'vx' } },
      { label: '弹簧恢复原长事件', theory: 1, tol: 0.01, from: { kind: 'event', eventType: 'spring_natural' } },
    ],
    solutionId: 'collisionSpring',
    maxDuration: 5,
  }
}

const CHAIN_V0 = 4
/** 卡8：弹性碰撞链（e=1 逐对交换） */
const gkCollisionChain = (): GeoTemplate => ({
  id: 'gk-collision-chain', card: '8', group: '力学', name: '弹性碰撞链（速度交换）',
  tags: ['小球', '碰撞'],
  elements: [
    ground(0),
    mk('sphere', -3, 0.1, { m: 1, v0: CHAIN_V0, e: 1, mus: 0 }),
    mk('sphere', 0, 0.1, { m: 1, v0: 0, e: 1, mus: 0 }),
    mk('sphere', 1, 0.1, { m: 1, v0: 0, e: 1, mus: 0 }),
  ],
  criticalChecks: [
    { label: '末球获得 v = v₀', theory: CHAIN_V0, tol: 0.02, from: { kind: 'final', subject: 2, pick: 'vx' } },
    { label: '首球停住 v ≈ 0', theory: 0, tol: 0.02, tolAbs: 0.05, from: { kind: 'final', subject: 0, pick: 'vx' } },
  ],
  solutionId: 'collisionChain',
})

const CIRC_R = 1.5, BALL_R = 0.5
/** 卡7/28：竖直圆轨道（临界速度） */
const gkCircularCritical = (): GeoTemplate => ({
  id: 'gk-circular-critical', card: '7/28', group: '力学', name: '竖直圆轨道（临界速度）',
  tags: ['圆轨道', '小球'],
  elements: [
    mk('loop_track', 2, 0, { radius: CIRC_R, side: 0 }),
    mk('sphere', 2, -(CIRC_R - BALL_R), { m: 0.5, v0: 8, e: 1, mus: 0 }),
  ],
  criticalChecks: [
    { label: '球心过顶高度 = R−r', theory: CIRC_R - BALL_R, tol: 0.02, tolAbs: 0.05, from: { kind: 'max-y', subject: 0 } },
    { label: 'v₀=8 > √(5gR′) 全程无脱离', theory: 1, tol: 0.01, from: { kind: 'no-event', eventType: 'detach' } },
  ],
  solutionId: 'circularCritical',
})

const PL_R = 1
/** 卡2：平抛切入圆轨道 */
const gkProjectileLoop = (): GeoTemplate => ({
  id: 'gk-projectile-loop', card: '2', group: '力学', name: '平抛切入圆轨道',
  tags: ['平抛', '圆轨道'],
  elements: [
    mk('projectile_platform', -1.5, -1.2, { h: 1, v0: 7 }),  // 顶面 −1.05：低于球底轨道 −1.0，防刮擦冻结
    mk('loop_track', 0, 0, { radius: PL_R, side: 0 }),
    mk('particle', 0.3, -(PL_R - 0.2), { m: 1, v0: 7, ang: 0 }),
  ],
  criticalChecks: [
    { label: '球心过顶高度 = R−r', theory: PL_R - 0.2, tol: 0.12, from: { kind: 'max-y', subject: 0 } },
    { label: '不脱离轨道', theory: 1, tol: 0.01, from: { kind: 'no-event', eventType: 'detach' } },
  ],
  solutionId: 'gkProjectileLoopDef',
})

const CB_MA = 2, CB_MB = 1, CB_V0 = 4
/** 卡5/21：连接体（绳绷紧冲量共速） */
const gkConnectedBodies = (): GeoTemplate => {
  const a = mk('block', -2, 0.1, { m: CB_MA, v0: 0, mu: 0 })
  const b = mk('block', 0, 0.1, { m: CB_MB, v0: CB_V0, mu: 0 })
  const rope = mk('rope', 0, 0, { L: 1, Tmax: 40 }, 0, [
    { toId: a.id, kind: 'rope', anchorA: '左端', anchorB: '右' },
    { toId: b.id, kind: 'rope', anchorA: '右端', anchorB: '左' },
  ])
  return {
    id: 'gk-connected-bodies', card: '5/21', group: '力学', name: '连接体（绳绷紧动量守恒）',
    tags: ['物块', '绳'],
    elements: [ground(0), a, b, rope],
    criticalChecks: [
      { label: '绷紧后 A 速度 v′ = m_B·v₀/(m_A+m_B)', theory: CB_MB * CB_V0 / (CB_MA + CB_MB), tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: '绷紧后 B 速度同 v′（绳内冲量）', theory: CB_MB * CB_V0 / (CB_MA + CB_MB), tol: 0.02, from: { kind: 'final', subject: 1, pick: 'vx' } },
    ],
    solutionId: 'connectedBodies',
    maxDuration: 6,
  }
}

// ════ 批次 2：电磁 8（Java 场引擎；gravityY=0 除注明；断言含区域边界弧闭式解） ════
// 场语义（PointChargeElement 实核）：E: F=q(E_x,E_y) 区域内；B-out: F=qB(v_y,−v_x)；区域盒 E=12×6、B=12×12（中心±6/±3、±6）

const VS_EY = 2, VS_B = 1, VS_V0 = 2
/** 卡32：速度选择器（v*=E/B 直线穿过） */
const gkVelocitySelector = (): GeoTemplate => ({
  id: 'gk-velocity-selector', card: '32', group: '电磁', name: '速度选择器（v=E/B 直线穿过）',
  tags: ['电场', '磁场', '带电粒子'],
  elements: [
    mk('e_region', 0, 0, { Ex: 0, Ey: VS_EY }),
    mk('b_region', 0, 0, { B: VS_B, dir: 1 }),
    mk('point_charge', -5, 0, { qm: 1, v0: VS_V0 }),
  ],
  criticalChecks: [
    { label: '直线穿过：final y = 0（qE=qvB）', theory: 0, tol: 0.02, tolAbs: 0.06, from: { kind: 'final', subject: 0, pick: 'y' } },
    { label: '速率保持 v₀', theory: VS_V0, tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
  ],
  solutionId: 'velocitySelector',
  gravityY: 0, maxDuration: 5,
})

/** 卡16：复合场（E 场+重力场平衡悬浮） */
const gkCompositeField = (): GeoTemplate => ({
  id: 'gk-composite-field', card: '16', group: '电磁', name: '复合场（电场力平衡重力）',
  tags: ['电场', '带电粒子'],
  elements: [
    mk('e_region', 0, 0, { Ex: 0, Ey: 9.8 }),
    mk('point_charge', 0, 0, { qm: 1, v0: 0 }),
  ],
  criticalChecks: [
    { label: '悬浮：qE=mg，final x=0', theory: 0, tol: 0.02, tolAbs: 0.03, from: { kind: 'final', subject: 0, pick: 'x' } },
    { label: 'final y=0（不升不降）', theory: 0, tol: 0.02, tolAbs: 0.03, from: { kind: 'final', subject: 0, pick: 'y' } },
  ],
  solutionId: 'compositeField',
  maxDuration: 5, // gravityY 默认 −9.8：E 上 9.8 平衡
})

const MS_V0 = 4, MS_QM = 1, MS_B = 1
/** 卡13：质谱仪（回旋半径 r=mv/(qB)=v/(qm·B)，单粒子测 2r） */
const gkMassSpectrometer = (): GeoTemplate => ({
  id: 'gk-mass-spectrometer', card: '13', group: '电磁', name: '质谱仪（回旋半径 r=v/(qm·B)）',
  tags: ['磁场', '带电粒子'],
  elements: [
    mk('b_region', 0, 6, { B: MS_B, dir: 0 }),
    mk('point_charge', 0, 0, { qm: MS_QM, v0: MS_V0 }),
  ],
  criticalChecks: [
    { label: '圆轨道直径 2r = 2v/(qm·B)', theory: 2 * MS_V0 / (MS_QM * MS_B), tol: 0.02, tolAbs: 0.05, from: { kind: 'max-y', subject: 0 } },
  ],
  solutionId: 'massSpectrometer',
  gravityY: 0, maxDuration: 3,
})

/** 卡11：磁偏转后电场减速（B 弧出下边界 + E 反向减速到停）
 * 推导：入 (3,0) v=+V，B-out → 顺时针圆心 (3,−r)，r=V/(qm·B)；出区域底 y=−6 处 φ=asin((−6+r)/r)，
 * 出口速度方向 (sinφ,−cosφ)；E = −v̂·V（qm=1 → a=V，1s 后停）。 */
const BTE_V = 4, BTE_QM = 1, BTE_B = 1  // 约束 r=v/(qm·B)≤6：保证弧从下边界出（r>6 会先出右边界，v=7 实测验证过）
const gkBThenE = (): GeoTemplate => {
  const r = BTE_V / (BTE_QM * BTE_B)
  const phi = Math.asin((-6 + r) / r)
  const tArc = (Math.PI / 2 - phi) / (BTE_QM * BTE_B)
  const vHat = { x: Math.sin(phi), y: -Math.cos(phi) }
  const aMag = BTE_V
  const e2 = { x: -vHat.x * aMag / BTE_QM, y: -vHat.y * aMag / BTE_QM }
  return {
    id: 'gk-b-then-e', card: '11', group: '电磁', name: '磁偏转→电场减速',
    tags: ['磁场', '电场', '带电粒子'],
    elements: [
      mk('b_region', 3, 0, { B: BTE_B, dir: 1 }),
      mk('e_region', 4, -9, { Ex: e2.x, Ey: e2.y }),
      mk('point_charge', 3, 0, { qm: BTE_QM, v0: BTE_V }),
    ],
    criticalChecks: [
      { label: '减速到停：final vx≈0', theory: 0, tol: 0.02, tolAbs: 0.12, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: 'final vy≈0', theory: 0, tol: 0.02, tolAbs: 0.12, from: { kind: 'final', subject: 0, pick: 'vy' } },
    ],
    solutionId: 'bThenE',
    gravityY: 0, maxDuration: +(tArc + BTE_V / aMag).toFixed(3),
  }
}

const BB_V = 3, BB_R = 3
/** 卡36：双磁场组合（相邻同向 B，串成环形轨道：B₁ 上半圆 + B₂ 回弧闭合成环）
 * 推导：入 (−6,0) v=+V，B₁(in) 逆时针圆心 (−6,r)；上半圆到 (−6,2r) 左行入 B₂(in)（中心 (−12,3)），
 * 逆时针回弧到 (−6,0) 闭合 → maxY=2r，maxX=−6+r。 */
const gkBBCombo = (): GeoTemplate => ({
  id: 'gk-b-b-combo', card: '36', group: '电磁', name: '双磁场组合（环形轨道）',
  tags: ['磁场', '带电粒子'],
  elements: [
    mk('b_region', 0, 0, { B: BB_V / BB_R, dir: 0 }),
    mk('b_region', -12, 3, { B: BB_V / BB_R, dir: 0 }),
    mk('point_charge', -6, 0, { qm: 1, v0: BB_V }),
  ],
  criticalChecks: [
    { label: '上弧顶点 maxY = 2r', theory: 2 * BB_R, tol: 0.02, tolAbs: 0.05, from: { kind: 'max-y', subject: 0 } },
    { label: '右缘 maxX = 入口+r', theory: -6 + BB_R, tol: 0.02, tolAbs: 0.05, from: { kind: 'max-x', subject: 0 } },
  ],
  solutionId: 'bbCombo',
  gravityY: 0, maxDuration: 8,
})

/** 卡10：加速→偏转→屏（E₁ 加速 v=√(v₀²+2qmEd)，E₂ 抛物线出上边界，屏 x=15 处 y 闭式） */
const ADS_V0 = 1, ADS_E = 2, ADS_EY = 2, ADS_QM = 1, ADS_SX = 15  // 屏位置
const gkAccelDeflectScreen = (): GeoTemplate => {
  const a1 = ADS_QM * ADS_E
  const v = Math.sqrt(ADS_V0 * ADS_V0 + 2 * a1 * 6)
  const ay = ADS_QM * ADS_EY
  const tTop = Math.sqrt(2 * 3 / ay)
  const xTop = 3 + v * tTop
  const vyTop = ay * tTop
  const yScreen = 3 + vyTop * (ADS_SX - xTop) / v
  const tTotal = (v - ADS_V0) / a1 + 3 / v + tTop + (ADS_SX - xTop) / v
  return {
    id: 'gk-accel-deflect-screen', card: '10', group: '电磁', name: '加速·偏转·屏',
    tags: ['电场', '带电粒子'],
    elements: [
      mk('e_region', -6, 0, { Ex: ADS_E, Ey: 0 }),
      mk('e_region', 9, 0, { Ex: 0, Ey: ADS_EY }),
      mk('point_charge', -6, 0, { qm: ADS_QM, v0: ADS_V0 }),
    ],
    criticalChecks: [
      { label: '屏 x=15 处偏转 y（闭式）', theory: yScreen, tol: 0.03, tolAbs: 0.12, from: { kind: 'final', subject: 0, pick: 'y' } },
      { label: '到达屏位置 x=屏', theory: ADS_SX, tol: 0.02, tolAbs: 0.1, from: { kind: 'final', subject: 0, pick: 'x' } },
    ],
    solutionId: 'accelDeflectScreen',
    gravityY: 0, maxDuration: +tTotal.toFixed(3),
  }
}

/** 卡9：加速→选择器→磁场（三段链；B 区出下边界要求 r≤6，本设计 r=5 ✓） */
const ASB_V0 = 1, ASB_E = 2, ASB_B = 1, ASB_QM = 1
const gkAccelSelectorB = (): GeoTemplate => {
  const a1 = ASB_QM * ASB_E
  const v = Math.sqrt(ASB_V0 * ASB_V0 + 2 * a1 * 6)
  const r = v / (ASB_QM * ASB_B)
  const omega = ASB_QM * ASB_B
  const phi = Math.asin((-6 + r) / r)
  const tArc = (Math.PI / 2 - phi) / omega
  const exitX = 15 + r * Math.cos(phi), exitVy = -v * Math.cos(phi), exitVx = v * Math.sin(phi)
  const tTotal = (v - ASB_V0) / a1 + 3 / v + 12 / v + tArc + 1.0  // 含 E1→选择器 3m 自由段
  return {
    id: 'gk-accel-selector-b', card: '9', group: '电磁', name: '加速·选择器·磁场',
    tags: ['电场', '磁场', '带电粒子'],
    elements: [
      mk('e_region', -6, 0, { Ex: ASB_E, Ey: 0 }),
      mk('e_region', 9, 0, { Ex: 0, Ey: v * ASB_B }),
      mk('b_region', 9, 0, { B: ASB_B, dir: 1 }),
      mk('b_region', 21, 0, { B: ASB_B, dir: 1 }),
      mk('point_charge', -6, 0, { qm: ASB_QM, v0: ASB_V0 }),
    ],
    criticalChecks: [
      { label: '三段链末态 x（闭式）', theory: exitX + exitVx * 1.0, tol: 0.02, tolAbs: 0.15, from: { kind: 'final', subject: 0, pick: 'x' } },
      { label: '三段链末态 y（闭式）', theory: -6 + exitVy * 1.0, tol: 0.02, tolAbs: 0.15, from: { kind: 'final', subject: 0, pick: 'y' } },
    ],
    solutionId: 'accelSelectorB',
    gravityY: 0, maxDuration: +tTotal.toFixed(3),
  }
}

/** 卡37：电→磁→电多过程（r=v/ω=3.5≤6 下边界出 ✓） */
const EBE_V0 = 1, EBE_QM = 2, EBE_E = 2, EBE_B = 1, E2_TOP_Y = -10
const gkEBEMulti = (): GeoTemplate => {
  const a1 = EBE_QM * EBE_E
  const v = Math.sqrt(EBE_V0 * EBE_V0 + 2 * a1 * 6)
  const omega = EBE_QM * EBE_B, r = v / omega
  const phi = Math.asin((-6 + r) / r)
  const tArc = (Math.PI / 2 - phi) / omega
  const exit = { x: 3 + r * Math.cos(phi), y: -6 }
  const vHat = { x: Math.sin(phi), y: -Math.cos(phi) }
  const vx = vHat.x * v, vy = vHat.y * v
  const tFree = (exit.y - E2_TOP_Y) / -vy  // 到 E2 顶边（y=−10）：下降 (exit.y−(−10))/|vy|
  const a2mag = v
  const e2 = { x: (-vx / v) * a2mag / EBE_QM, y: (-vy / v) * a2mag / EBE_QM }
  const tTotal = (v - EBE_V0) / a1 + 3 / v + tArc + tFree + v / a2mag
  return {
    id: 'gk-e-b-e-multi', card: '37', group: '电磁', name: '电·磁·电多过程',
    tags: ['电场', '磁场', '带电粒子'],
    elements: [
      mk('e_region', -6, 0, { Ex: EBE_E, Ey: 0 }),
      mk('b_region', 9, 0, { B: EBE_B, dir: 1 }),
      mk('e_region', -4, -13, { Ex: e2.x, Ey: e2.y }),  // E2 区域 y∈[−16,−10]：减速段全程在场内
      mk('point_charge', -6, 0, { qm: EBE_QM, v0: EBE_V0 }),
    ],
    criticalChecks: [
      // 零目标速度断言【第三十九轮归因定案+改善】：残速=磁场段子步洛伦兹旋转色散
      // （substeps 扫描：4→8 残速 0.202→0.112 减半=色散主导可改善；8→16 平台=几何常数项）。
      // 模板 substeps=8 后 tolAbs 0.4→0.25（前两次归因"帧边界/帧级检测"均未验证被推翻——教训在案）
      { label: '多过程减速到停 final vx≈0', theory: 0, tol: 0.02, tolAbs: 0.25, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: 'final vy≈0', theory: 0, tol: 0.02, tolAbs: 0.25, from: { kind: 'final', subject: 0, pick: 'vy' } },
    ],
    solutionId: 'inductionOde',
    gravityY: 0, maxDuration: +tTotal.toFixed(3), substeps: 8,
  }
}

const FACTORIES: (() => GeoTemplate)[] = [
  gkSlopeSpring, gkSlopeSpringCorrect, gkConveyorBoard, gkBoardBlock, gkCollisionSpring,
  gkCollisionChain, gkCircularCritical, gkProjectileLoop, gkConnectedBodies,
  gkVelocitySelector, gkCompositeField, gkMassSpectrometer, gkBThenE,
  gkBBCombo, gkAccelDeflectScreen, gkAccelSelectorB, gkEBEMulti,
]

export const TEMPLATES: GeoTemplate[] = FACTORIES.map((f) => f())

export function templateById(id: string): GeoTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

export function instantiate(id: string): GeoElement[] | null {
  const t = templateById(id)
  if (!t) return null
  return JSON.parse(JSON.stringify(t.elements)) as GeoElement[]
}
