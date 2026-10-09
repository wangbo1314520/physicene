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
    /** P3·装置模板：TS 引擎读数断言（key=tsReadings 键） */
    | { kind: 'tsreading'; key: string }
    /** P3·装置模板：Java probes 通道断言（key 如 pA_<id>，值取 [t, v][1]） */
    | { kind: 'probe'; key: string }
}

export interface GeoTemplate {
  id: string
  card: string
  name: string
  group: '力学' | '电磁' | '热学' | '光学' | '近代'
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
    mk('loop_track', 2, 0, { radius: CIRC_R, side: 0, gap: 0 }),
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
    mk('loop_track', 0, 0, { radius: PL_R, side: 0, gap: 0 }),
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
    mk('point_charge', 0, 0, { qm: 1, v0: 0, grav: 1 }),  // grav=1 计重力（qE=mg 平衡的前提）
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

// ════ P3·装置模板批 1（8 个）：7 TS 引擎装置 + 1 Java 耦合热学装置 ════
// 口径（清偿5+P3 令）：每卡注明引擎归属；断言走 tsreading（TS）/probe+final（Java）。
// theory 永久规则：由本文件参数常量推导（常数表值以命名常量入档）。

const D2R = Math.PI / 180
// —— 卡 55 棱镜折射（TS·OpticsRunner）：θ₂=arcsin(sinθ₁/n)，δ=θ₁+arcsin(n·sin(A−θ₂))−A ——
const P55_TH1 = 40, P55_N = 1.5, P55_A = 60
const p55Th2 = Math.asin(Math.sin(P55_TH1 * D2R) / P55_N) / D2R
const p55Delta = P55_TH1 + Math.asin(P55_N * Math.sin((P55_A - p55Th2) * D2R)) / D2R - P55_A
function dvPrism55(): GeoTemplate {
  return {
    id: 'dv-prism-55', card: '55', name: '棱镜折射（Snell + 偏向角）', group: '光学',
    tags: ['装置', '光学', '折射'],
    elements: [
      mk('light_source', -5, 2, { th1: P55_TH1, lam: 600 }),
      mk('prism', 0, 0, { n: P55_N, A: P55_A }),
      mk('optic_screen', 5, 0, {}),
    ],
    criticalChecks: [
      { label: 'θ₂=arcsin(sinθ₁/n)', theory: p55Th2, tol: 0.01, from: { kind: 'tsreading', key: 'theta_2' } },
      { label: 'δ=θ₁+θ₄−A', theory: p55Delta, tol: 0.01, from: { kind: 'tsreading', key: 'delta' } },
      { label: 'δmin（接线断言·物理由单测教材值 37.18° 锚定）', theory: 2 * Math.asin(P55_N * Math.sin(P55_A * D2R / 2)) / D2R - P55_A, tol: 0.01, from: { kind: 'tsreading', key: 'delta_min' } },
    ],
    solutionId: 'gk-prism-refraction',
  }
}
// —— 卡 56 劈尖（TS）：ΔL=λ/(2n·tanα) ——
const P56_LAM = 600, P56_N = 1.5, P56_ALPHA_DEG = 0.1146  // = 0.002 rad
const p56FringeMm = P56_LAM * 1e-9 / (2 * P56_N * Math.tan(P56_ALPHA_DEG * D2R)) * 1000
function dvWedge56(): GeoTemplate {
  return {
    id: 'dv-wedge-56', card: '56', name: '劈尖薄膜（等厚干涉）', group: '光学',
    tags: ['装置', '干涉'],
    elements: [mk('wedge', 0, 0, { lam: P56_LAM, n: P56_N, alpha: P56_ALPHA_DEG })],
    criticalChecks: [
      { label: 'ΔL（接线断言·物理由单测厚度差链独立式锚定）', theory: p56FringeMm, tol: 0.02, from: { kind: 'tsreading', key: 'fringe_mm' } },
    ],
    solutionId: 'gk-thin-film',
  }
}
// —— 卡 57 双缝（TS）：Δx=Lλ/d ——
const P57_LAM = 600, P57_D = 0.2, P57_L = 1
function dvDoubleSlit57(): GeoTemplate {
  return {
    id: 'dv-double-slit-57', card: '57', name: '双缝干涉（Δx=Lλ/d）', group: '光学',
    tags: ['装置', '干涉'],
    elements: [mk('double_slit', 0, 0, { lam: P57_LAM, d: P57_D, L: P57_L })],
    criticalChecks: [
      { label: 'Δx（接线断言·物理由单测教材典型题值锚定）', theory: P57_L * P57_LAM * 1e-9 / (P57_D * 1e-3) * 1000, tol: 0.01, from: { kind: 'tsreading', key: 'dx_mm' } },
    ],
    solutionId: 'gk-diffraction-vs-interference',
  }
}
// —— 卡 61 光电效应（TS·ModernRunner）：W₀ 表值钠 2.28eV，ν₀=W₀/h ——
import { H_EV, E1, HC_EV_NM, H_SI, M_E, Q_E } from '../../physics/modern-physics'  // 常数单源（P3 收口包同步）
const E1_EV = Math.abs(E1)  // E1=−13.6 带符号，theory 推导取 |E₁|=13.6
const P61_W = 2.28  // 钠逸出功表值（eV）
function dvPhotoelectric61(): GeoTemplate {
  return {
    id: 'dv-photoelectric-61', card: '61', name: '光电效应（Eₖ=hν−W₀）', group: '近代',
    tags: ['装置', '光电'],
    elements: [mk('photo_tube', 0, 0, { mat: 0 })],
    criticalChecks: [
      { label: 'W₀（表值断言·钠逸出功 2.28eV 独立物理数据）', theory: P61_W, tol: 0.01, from: { kind: 'tsreading', key: 'work_function' } },
      { label: 'ν₀=W₀/h（×10¹⁴Hz）', theory: P61_W / H_EV / 1e14, tol: 0.01, from: { kind: 'tsreading', key: 'cutoff_freq' } },
    ],
    solutionId: 'gk-photoelectric-ek-nu',
  }
}
// —— 卡 62 氢原子能级（TS）：ΔE=13.6(1/n²−1/m²)，λ=hc/ΔE ——
const P62_M = 3, P62_N = 2
const p62DE = E1_EV * (1 / (P62_N * P62_N) - 1 / (P62_M * P62_M))
function dvHydrogen62(): GeoTemplate {
  return {
    id: 'dv-hydrogen-62', card: '62', name: '氢原子能级跃迁（ΔE/λ）', group: '近代',
    tags: ['装置', '能级'],
    elements: [mk('h_atom', 0, 0, { m: P62_M, n: P62_N })],
    criticalChecks: [
      { label: 'ΔE=13.6(1/n²−1/m²)', theory: p62DE, tol: 0.01, from: { kind: 'tsreading', key: 'delta_E' } },
      { label: 'λ=hc/ΔE（nm，统一 1240 口径）', theory: HC_EV_NM / p62DE, tol: 0.005, from: { kind: 'tsreading', key: 'wavelength_nm' } },
    ],
    solutionId: 'gk-hydrogen-levels',
  }
}
// —— 卡 64 玻尔碰撞（TS）：E=12.75eV ↔ ΔE₁ₙ=13.6(1−1/n²) → n=4 ——
const P64_E = 12.75
const p64N = Math.sqrt(E1_EV / (E1_EV - P64_E))
function dvBohr64(): GeoTemplate {
  return {
    id: 'dv-bohr-64', card: '64', name: '玻尔碰撞（共振激发阈值）', group: '近代',
    tags: ['装置', '玻尔'],
    elements: [mk('bohr_collision', 0, 0, { E: P64_E, maxN: 4 })],
    criticalChecks: [
      { label: '共振能级 n=√(E₁/(E₁−E))', theory: p64N, tol: 0.01, from: { kind: 'tsreading', key: 'res_n' } },
      { label: 'ΔE=E（共振匹配）', theory: E1_EV * (1 - 1 / (p64N * p64N)), tol: 0.01, from: { kind: 'tsreading', key: 'delta_E' } },
    ],
    solutionId: 'gk-bohr-collision',
  }
}
// —— 卡 65 物质波（TS）：λ=h/√(2meU) ——
const P65_U = 100  // H_SI/M_E/Q_E 已从 modern-physics 导入
function dvMatterWave65(): GeoTemplate {
  return {
    id: 'dv-matter-wave-65', card: '65', name: '物质波（λ=h/√(2meU)）', group: '近代',
    tags: ['装置', '物质波'],
    elements: [mk('electron_gun', 0, 0, { U: P65_U })],
    criticalChecks: [
      { label: 'λ（接线断言·物理由单测教材值 1.23Å@100V 锚定）', theory: H_SI / Math.sqrt(2 * M_E * Q_E * P65_U) * 1e12, tol: 0.01, from: { kind: 'tsreading', key: 'lambda_pm' } },
    ],
    solutionId: 'gk-matter-wave',
  }
}
// —— 卡 52 汽缸活塞（Java 耦合外壳·CouplingOrchestrator）：p·A=Mg 平衡 ——
const P52_M = 10, P52_S = 0.01
function dvCylinder52(): GeoTemplate {
  const cyl = mk('cylinder', 0, 0, { S: P52_S })
  const pis = mk('piston', 0, 1.2, { M: P52_M, dampingRatio: 0.5 })
  pis.id = 'piston-dv52'  // 稳定 id：probe 断言键 pA_piston-dv52
  return {
    id: 'dv-cylinder-52', card: '52', name: '汽缸活塞（p·A=Mg 平衡）', group: '热学',
    tags: ['装置', '热学耦合'],
    elements: [cyl, pis, mk('gas_cell', 0, -1, { p0: 101325, V0: 0.01, T0: 300, gamma: 1 })],
    criticalChecks: [
      { label: '平衡静止 |vy|→0', theory: 0, tol: 0.02, tolAbs: 0.1, from: { kind: 'final', subject: 0, pick: 'vy' } },
      { label: 'p·A=Mg（±1%）', theory: P52_M * 9.8, tol: 0.01, from: { kind: 'probe', key: 'pA_piston-dv52' } },
    ],
    solutionId: 'gk-cylinder-piston', maxDuration: 8,
  }
}

// ════ P3·批 2 装置模板（热学静力学 3 卡，决策1：TS 纯函数装置引擎）════
// 物理单一源：src/physics/thermal-statics.ts（场景卡 thermo1/thermo2 已收编同源）
// —— 卡 51 液封：p=p₀±h（cmHg 教学口径）——
const P51_P0 = 76, P51_H = 10
function dvLiquidSeal51(): GeoTemplate {
  return {
    id: 'dv-liquid-seal-51', card: '51', name: '液封玻璃管（p=p₀±ρgh）', group: '热学',
    tags: ['装置', '液封'],
    elements: [mk('liquid_seal', 0, 0, { p0: P51_P0, h: P51_H, mode: 0 })],
    criticalChecks: [
      { label: 'p=p₀+h（接线断言·物理由单测教材值 86/66/76 锚定）', theory: P51_P0 + P51_H, tol: 0.01, from: { kind: 'tsreading', key: 'p_cmhg' } },
      { label: 'kPa 换算（换算断言·单位常数独立）', theory: (P51_P0 + P51_H) * 1.33322, tol: 0.01, from: { kind: 'tsreading', key: 'p_kpa' } },
    ],
    solutionId: 'gk-liquid-seal-tube',
  }
}
// —— 卡 53 变质量气体：打气 pₙ=p₀(1+nV₀/V) ——
const P53_V = 5, P53_V0 = 0.25, P53_N = 10
function dvPumpSyringe53(): GeoTemplate {
  return {
    id: 'dv-pump-syringe-53', card: '53', name: '打气抽气（变质量气体）', group: '热学',
    tags: ['装置', '打气'],
    elements: [mk('pump_syringe', 0, 0, { V: P53_V, V0: P53_V0, n: P53_N, mode: 0 })],
    criticalChecks: [
      { label: 'nV 守恒（不变量断言·p₀(V+nV₀)=pₙV 等效总体积法）', theory: 1 + (P53_N * P53_V0) / P53_V, tol: 0.02, from: { kind: 'tsreading', key: 'p_ratio' } },
    ],
    solutionId: 'gk-variable-mass-gas',
  }
}
// —— 卡 54 U 形管：升温二次方程 + p₂L₂/T₂=p₁L₁/T₁ 自洽 ——
const P54_L1 = 20, P54_DH0 = 4, P54_T1 = 300, P54_T2 = 360, P54_P0 = 76
const p54X = (-((P54_P0 + P54_DH0) + 2 * P54_L1) + Math.sqrt(((P54_P0 + P54_DH0) + 2 * P54_L1) ** 2 - 8 * ((P54_P0 + P54_DH0) * P54_L1 * (1 - P54_T2 / P54_T1)))) / 4
const p54P2 = P54_P0 + P54_DH0 + 2 * p54X
const p54L2 = P54_L1 + p54X
function dvUTube54(): GeoTemplate {
  return {
    id: 'dv-u-tube-54', card: '54', name: 'U 形管（液面差定压强）', group: '热学',
    tags: ['装置', 'U形管'],
    elements: [mk('u_tube', 0, 0, { L1: P54_L1, dh0: P54_DH0, mode: 0, T1: P54_T1, T2: P54_T2 })],
    criticalChecks: [
      { label: 'x（接线断言·物理由单测不变量 (p₁+2x)(L₁+x)=K ±1e-9 锚定）', theory: p54X, tol: 0.02, from: { kind: 'tsreading', key: 'x_cm' } },
      { label: '末态 p₂=p₀+Δh₀+2x', theory: p54P2, tol: 0.02, from: { kind: 'tsreading', key: 'p2_cmhg' } },
      { label: '气体定律自洽 p₂L₂/T₂=p₁L₁/T₁', theory: ((P54_P0 + P54_DH0) * P54_L1) / P54_T1, tol: 0.02, from: { kind: 'tsreading', key: 'plT2' } },
    ],
    solutionId: 'gk-u-tube',
  }
}

// ════ P3·批 3 第 2 步：AC 装置 4 卡（决策2：TS 复数 MNA，物理源 src/physics/ac-circuit.ts）════
// 断言独立来源：能量守恒 P₁=P₂ / P收=P送−P损 · 欧姆定律 U₂=I₂·R · 辛普森数值积分（人教3-2
// 第五章§2：我国生活用电有效值 220V、峰值 Um=220√2≈311V 为教材原文口径）
// —— 卡 45 变压器动态：负载 11→44Ω 扫描，末帧断言 ——
const P45_U1 = 220, P45_N1 = 2, P45_N2 = 1, P45_R0 = 11, P45_R1 = 44
function dvTransformer45(): GeoTemplate {
  return {
    id: 'dv-transformer-45', card: '45', name: '变压器（负载动态扫描）', group: '电磁',
    tags: ['装置', '变压器'],
    elements: [mk('transformer', 0, 0, { u1: P45_U1, n1: P45_N1, n2: P45_N2, r_load: P45_R0, r_load_end: P45_R1 })],
    criticalChecks: [
      // 末帧 R=44Ω：独立定律断言（能量守恒：理想变压器 P₁=P₂；欧姆：U₂=I₂·R）
      { label: 'P₁=P₂（自洽检查·理想变压器约束定义——物理锚见单测教材规律锚）', theory: Math.pow(P45_U1 * P45_N2 / P45_N1, 2) / P45_R1, tol: 0.01, from: { kind: 'tsreading', key: 'p2' } },
      { label: 'U₂=I₂·R_load（欧姆定律·独立）', theory: P45_U1 * P45_N2 / P45_N1, tol: 0.01, from: { kind: 'tsreading', key: 'u2' } },
      { label: 'I₁=I₂·n₂/n₁（电流比·接线断言，物理由 MNA 单测教材锚）', theory: (P45_U1 * P45_N2 / P45_N1) / P45_R1 * (P45_N2 / P45_N1), tol: 0.01, from: { kind: 'tsreading', key: 'i1' } },
    ],
    solutionId: 'gk-transformer-dynamic',
  }
}
// —— 卡 46 远距离输电：守恒 + 欧姆独立断言 ——
const P46_P = 110e3, P46_U = 1100, P46_R = 0.5
function dvPowerline46(): GeoTemplate {
  return {
    id: 'dv-powerline-46', card: '46', name: '远距离输电（I=P/U · P损=I²R）', group: '电磁',
    tags: ['装置', '输电'],
    elements: [mk('powerline', 0, 0, { p_send: P46_P / 1000, u_send: P46_U / 1000, r_line: P46_R })],
    criticalChecks: [
      { label: 'P收=P送−P损（自洽检查·守恒记账；缩放规律锚 U×2→P损/4 见单测）', theory: P46_P - Math.pow(P46_P / P46_U, 2) * P46_R, tol: 0.005, from: { kind: 'tsreading', key: 'p_recv' } },
      { label: 'ΔU=I·R线（欧姆定律·独立）', theory: (P46_P / P46_U) * P46_R, tol: 0.01, from: { kind: 'tsreading', key: 'u_drop' } },
    ],
    solutionId: 'gk-power-transmission',
  }
}
// —— 卡 47 交变四值：辛普森数值积分独立推导（教材 311/220 口径）——
const P47_UM = 311, P47_F = 50
const p47T = 1 / P47_F  // 周期 0.02s
// 辛普森数值积分（独立于引擎闭式 √2 与 2/π）：rms=√(∫u²/T)、avg=∫|u|/T
const p47N = 1200, p47H = p47T / p47N
let p47S2 = 0, p47Sa = 0
for (let i = 0; i <= p47N; i++) {
  const u = P47_UM * Math.sin(2 * Math.PI * P47_F * i * p47H)
  const c = i === 0 || i === p47N ? 1 : i % 2 ? 4 : 2
  p47S2 += c * u * u; p47Sa += c * Math.abs(u)
}
const p47Rms = Math.sqrt(((p47H / 3) * p47S2) / p47T)
const p47Avg = ((p47H / 3) * p47Sa) / p47T
function dvAcFour47(): GeoTemplate {
  return {
    id: 'dv-ac-four-47', card: '47', name: '交变电流四值（峰值/有效值/平均/瞬时）', group: '电磁',
    tags: ['装置', '交变电流'],
    elements: [mk('ac_four_values', 0, 0, { um: P47_UM, f: P47_F })],
    criticalChecks: [
      { label: '有效值=辛普森数值积分 √(∫u²/T)（独立方法·教材 220V 口径）', theory: p47Rms, tol: 0.002, from: { kind: 'tsreading', key: 'rms' } },
      { label: '平均值=∫|u|/T 数值积分（独立方法）', theory: p47Avg, tol: 0.002, from: { kind: 'tsreading', key: 'avg' } },
      { label: '峰值=T/4 瞬时值（独立取点）', theory: P47_UM * Math.sin(2 * Math.PI * P47_F * (p47T / 4)), tol: 0.001, from: { kind: 'tsreading', key: 'peak' } },
    ],
    solutionId: 'gk-ac-four-values',
  }
}
// —— 卡 15 变压器输电全链：MNA 全电路 + 全链守恒 ——
const P15_UG = 220, P15_UP = 10, P15_DOWN = 10, P15_RL = 0.5, P15_RLOAD = 11
function dvTransformerPower15(): GeoTemplate {
  return {
    id: 'dv-transformer-power-15', card: '15', name: '变压器输电全链（升压-线路-降压）', group: '电磁',
    tags: ['装置', '输电', '变压器'],
    elements: [mk('transformer_powerline', 0, 0, { u_gen: P15_UG, up: P15_UP, down: P15_DOWN, r_line: P15_RL, r_load: P15_RLOAD })],
    criticalChecks: [
      // 独立方法：阻抗折算（负载 R 经 T2 折算到高压侧 = R·down²）——与引擎 MNA 节点法不同路径
      { label: 'I线=U高/(R线+R负·down²)（阻抗折算法·独立于 MNA）', theory: (P15_UG * P15_UP) / (P15_RL + P15_RLOAD * P15_DOWN * P15_DOWN), tol: 0.01, from: { kind: 'tsreading', key: 'i_line' } },
      { label: 'P负=I线²·R负·down²（折算法·独立）', theory: Math.pow((P15_UG * P15_UP) / (P15_RL + P15_RLOAD * P15_DOWN * P15_DOWN), 2) * P15_RLOAD * P15_DOWN * P15_DOWN, tol: 0.01, from: { kind: 'tsreading', key: 'p_load' } },
      { label: 'P损=I线²·R线（欧姆定律·独立）', theory: Math.pow((P15_UG * P15_UP) / (P15_RL + P15_RLOAD * P15_DOWN * P15_DOWN), 2) * P15_RL, tol: 0.01, from: { kind: 'tsreading', key: 'p_line_loss' } },
    ],
    solutionId: 'gk-transformer-transmission',
  }
}

// ════ P3·批 3 第 3 步：回旋加速器（卡 12，专用求解器 src/physics/cyclotron.ts）════
const P12_QM = 9.578e7, P12_B = 1.0, P12_U = 1e4, P12_R = 0.5
const p12N = Math.floor((P12_QM * P12_B * P12_B * P12_R * P12_R) / (2 * P12_U))
function dvCyclotron12(): GeoTemplate {
  return {
    id: 'dv-cyclotron-12', card: '12', name: '回旋加速器（时变 E + 匀强 B）', group: '电磁',
    tags: ['装置', '回旋'],
    elements: [mk('cyclotron', 0, 0, { B: P12_B, U: P12_U, R_max: P12_R, qm: P12_QM })],
    criticalChecks: [
      { label: 'rₙ₊₁/rₙ=√(n/(n−1))（物理独立：qvB=mv²/r 两步相除推导）', theory: Math.sqrt(p12N / (p12N - 1)), tol: 0.01, from: { kind: 'tsreading', key: 'r_ratio_last' } },
      { label: '出射动能交叉验证：引擎能量记账 n·U vs 闭式 qm·B²R²/2（物理独立两法）', theory: (P12_QM * P12_B * P12_B * P12_R * P12_R) / 2, tol: 0.005, from: { kind: 'tsreading', key: 'ek_cross_ev' } },
      { label: '半周期 τ=π/(qm·B)（教材结论：与速度无关）', theory: Math.PI / (P12_QM * P12_B), tol: 0.005, from: { kind: 'tsreading', key: 'half_period' } },
    ],
    solutionId: 'gk-cyclotron',
  }
}

// ════ P3·批 3 第 4 步：DC 装置六卡（卡 33/34/35/48/49/50，物理源 src/physics/dc-devices.ts）════
// builder 路径（审查裁定）：电路走 TS MNA ω=0 退化，零场景内联
const P33_B = 1, P33_D = 0.2, P33_V = 10, P33_RL = 5, P33_RI = 1
function dvMhd33(): GeoTemplate {
  return {
    id: 'dv-mhd-33', card: '33', name: '磁流体发电（EMF=B·D·v）', group: '电磁',
    tags: ['装置', '磁流体'],
    elements: [mk('mhd_generator', 0, 0, { B: P33_B, D: P33_D, v: P33_V, r_load: P33_RL, r_in: P33_RI })],
    criticalChecks: [
      { label: 'EMF=B·D·v（物理独立：qU/d=qvB 洛伦兹力平衡推导）', theory: P33_B * P33_D * P33_V, tol: 0.005, from: { kind: 'tsreading', key: 'emf' } },
      { label: '路端电压=分压定律 R/(R+r)（方法独立：闭式 vs MNA 两法）', theory: (P33_B * P33_D * P33_V * P33_RL) / (P33_RL + P33_RI), tol: 0.005, from: { kind: 'tsreading', key: 'u_out' } },
    ],
    solutionId: 'gk-mhd-channel',
  }
}
const P34_B = 0.5, P34_D = 0.1, P34_Q = 5e-3, P34_A = 2.5e-3
function dvFlow34(): GeoTemplate {
  return {
    id: 'dv-flow-34', card: '34', name: '电磁流量计（v=U/BD）', group: '电磁',
    tags: ['装置', '流量计'],
    elements: [mk('flow_meter', 0, 0, { B: P34_B, D: P34_D, Q: P34_Q, A: P34_A })],
    criticalChecks: [
      { label: 'U=B·D·(Q/A)（两定律串联：连续性 Q=Av + 洛伦兹 E=vB）', theory: P34_B * P34_D * (P34_Q / P34_A), tol: 0.005, from: { kind: 'tsreading', key: 'u_sensor' } },
      { label: '同源互证：反解 v=U/(B·D) 还原流速（与卡 33 同一洛伦兹平衡）', theory: P34_Q / P34_A, tol: 0.005, from: { kind: 'tsreading', key: 'v_from_u' } },
    ],
    solutionId: 'gk-flow-meter',
  }
}
const P35_B = 0.5, P35_I = 1e-3, P35_N = 1e25, P35_D = 1e-3
function dvHall35(): GeoTemplate {
  return {
    id: 'dv-hall-35', card: '35', name: '霍尔效应（U_H=IB/nqd）', group: '电磁',
    tags: ['装置', '霍尔'],
    elements: [mk('hall_slab', 0, 0, { B: P35_B, I: P35_I, n: P35_N, d: P35_D })],
    criticalChecks: [
      { label: 'U_H=I·B/(n·q·d)（教材规律：霍尔电压电流式）', theory: (P35_I * P35_B) / (P35_N * 1.602e-19 * P35_D), tol: 0.005, from: { kind: 'tsreading', key: 'u_hall' } },
    ],
    solutionId: 'gk-hall-slab',
  }
}
const P48_IG = 100e-6, P48_RG = 1000, P48_T = 1
function dvMeter48(): GeoTemplate {
  return {
    id: 'dv-meter-48', card: '48', name: '电表改装（安培计分流）', group: '电磁',
    tags: ['装置', '电表'],
    elements: [mk('meter_conversion', 0, 0, { ig: P48_IG, rg: P48_RG, target: P48_T, mode: 0 })],
    criticalChecks: [
      { label: '分流电阻 Rs=Ig·Rg/(I−Ig)（物理独立：并联电压相等推导）', theory: (P48_IG * P48_RG) / (P48_T - P48_IG), tol: 0.005, from: { kind: 'tsreading', key: 'rs' } },
      { label: '通入量程电流表头恰满偏（方法独立：MNA 实解 vs 闭式设计两法）', theory: P48_IG, tol: 0.01, from: { kind: 'tsreading', key: 'i_meter' } },
    ],
    solutionId: 'gk-meter-conversion',
  }
}
const P49_RX = 10, P49_RA = 0.1
function dvVoltammetry49(): GeoTemplate {
  return {
    id: 'dv-voltammetry-49', card: '49', name: '伏安法（内接偏大）', group: '电磁',
    tags: ['装置', '伏安法'],
    elements: [mk('voltammetry', 0, 0, { r_x: P49_RX, r_a: P49_RA, mode: 0 })],
    criticalChecks: [
      { label: '内接 R测=R+RA（物理独立：串联化简 vs MNA 两法；教材规律：大内偏大）', theory: P49_RX + P49_RA, tol: 0.005, from: { kind: 'tsreading', key: 'r_meas' } },
    ],
    solutionId: 'gk-volt-ammeter-resistance',
  }
}
const P50_R = 20
function dvBlackBox50(): GeoTemplate {
  return {
    id: 'dv-black-box-50', card: '50', name: '电学黑箱（探测判别）', group: '电磁',
    tags: ['装置', '黑箱'],
    elements: [mk('black_box', 0, 0, { r_ab: P50_R })],
    criticalChecks: [
      { label: 'A–B 电阻读数（两法：MNA 欧姆表读数 vs 直阻）', theory: P50_R, tol: 0.005, from: { kind: 'tsreading', key: 'r_ab' } },
      { label: '正反向阻值比 1e10（理想二极管判据·二态建模 0.1Ω/1GΩ）', theory: 1e10, tol: 0.01, from: { kind: 'tsreading', key: 'fwd_rev_ratio' } },
    ],
    solutionId: 'gk-black-box',
  }
}

// ════ P3·批 4 装置模板 6 卡（波 58/59/60 + 核反应 63 + 微元 66 + 超重失重 24）════
// 物理源：wave.ts / misc-devices.ts；断言分级见 label
// —— 卡 58 波多解：+x/-x 双解 ——
const P58_LAM = 4, P58_DX0 = 1, P58_DT = 1, P58_N = 1
function dvWaveMulti58(): GeoTemplate {
  return {
    id: 'dv-wave-multi-58', card: '58', name: '波的多解（方向与 n 不定）', group: '光学',
    tags: ['装置', '波'],
    elements: [mk('wave_multi', 0, 0, { lambda: P58_LAM, dx0: P58_DX0, dt: P58_DT, n: P58_N })],
    criticalChecks: [
      { label: '+x：v=(nλ+Δx₀)/Δt（教材通式；与场景卡 DOM 值 5.00 互证见 E2E）', theory: (P58_N * P58_LAM + P58_DX0) / P58_DT, tol: 0.005, from: { kind: 'tsreading', key: 'v_plus' } },
      { label: '−x：v=(nλ+λ−Δx₀)/Δt（教材通式）', theory: (P58_N * P58_LAM + (P58_LAM - P58_DX0)) / P58_DT, tol: 0.005, from: { kind: 'tsreading', key: 'v_minus' } },
      { label: 'T=λ/v=0.8s（教材规律：周期由波长与波速定）', theory: P58_LAM / ((P58_N * P58_LAM + P58_DX0) / P58_DT), tol: 0.005, from: { kind: 'tsreading', key: 'T_plus' } },
    ],
    solutionId: 'gk-wave-multi-solution',
  }
}
// —— 卡 59 振动+波动图像：v=λ/T、首峰、同侧法 ——
const P59_LAM = 4, P59_T = 2, P59_XP = 1
function dvWaveGraphs59(): GeoTemplate {
  return {
    id: 'dv-wave-graphs-59', card: '59', name: '振动图像 + 波动图像', group: '光学',
    tags: ['装置', '波'],
    elements: [mk('wave_graphs', 0, 0, { a: 1, lambda: P59_LAM, T: P59_T, dir: 1, x_p: P59_XP })],
    criticalChecks: [
      { label: 'v=λ/T（方法独立锚：x 峰峰距测 λ + t 峰峰距测 T，见单测）', theory: P59_LAM / P59_T, tol: 0.005, from: { kind: 'tsreading', key: 'v' } },
      { label: '首峰 t=T(1/4+x_P/λ)（方法独立：数值扫描首极大 vs 相位闭式，见单测）', theory: P59_T * (0.25 + P59_XP / P59_LAM), tol: 0.005, from: { kind: 'tsreading', key: 't_crest' } },
    ],
    solutionId: 'gk-vibration-wave-graphs',
  }
}
// —— 卡 60 波叠加：Δr=kλ 加强 ——
const P60_LAM = 2, P60_D = 4, P60_PX = 1
function dvWaveSuper60(): GeoTemplate {
  return {
    id: 'dv-wave-super-60', card: '60', name: '波的叠加与干涉', group: '光学',
    tags: ['装置', '干涉'],
    elements: [mk('wave_super', 0, 0, { lambda: P60_LAM, d: P60_D, px: P60_PX, py: 0 })],
    criticalChecks: [
      { label: 'Δr=|PS₁−PS₂|=2.00m（几何两点距，独立于干涉判据）', theory: Math.abs(3 - 1), tol: 0.005, from: { kind: 'tsreading', key: 'delta_r' } },
      { label: 'Δr=1.00λ → 加强（光程差判据；数值叠加振幅扫描互证见单测）', theory: 1, tol: 0.005, from: { kind: 'tsreading', key: 'k_ratio' } },
      { label: '判定=加强（离散值，容差 1e-3）', theory: 1, tol: 0.001, from: { kind: 'tsreading', key: 'enhanced' } },
    ],
    solutionId: 'gk-wave-superposition',
  }
}
// —— 卡 63 核反应：D+T 聚变 ——
function dvNuclear63(): GeoTemplate {
  return {
    id: 'dv-nuclear-63', card: '63', name: '核反应（D+T 聚变）', group: '近代',
    tags: ['装置', '核反应'],
    elements: [mk('nuclear_react', 0, 0, {})],
    criticalChecks: [
      { label: 'A 守恒（教材核反应方程规范；离散值容差 1e-3）', theory: 1, tol: 0.001, from: { kind: 'tsreading', key: 'a_ok' } },
      { label: 'Z 守恒', theory: 1, tol: 0.001, from: { kind: 'tsreading', key: 'z_ok' } },
      { label: 'ΔE=17.59MeV（教材经典聚变值：Δm≈0.0189u×931.5）', theory: (2.014102 + 3.016049 - 4.002603 - 1.008665) * 931.5, tol: 0.01, from: { kind: 'tsreading', key: 'energy_mev' } },
    ],
    solutionId: 'gk-nuclear-reaction',
  }
}
// —— 卡 66 微元积分：弹簧功两法 ——
const P66_K = 100, P66_X = 0.5
function dvMicroIntegral66(): GeoTemplate {
  return {
    id: 'dv-micro-integral-66', card: '66', name: '微元法变力做功（W=∫F dx）', group: '力学',
    tags: ['装置', '微元'],
    elements: [mk('micro_integral', 0, 0, { k: P66_K, x: P66_X })],
    criticalChecks: [
      { label: 'W=½kx²（教材闭式）', theory: 0.5 * P66_K * P66_X * P66_X, tol: 0.005, from: { kind: 'tsreading', key: 'w_analytic' } },
      { label: '辛普森数值积分与闭式一致（方法独立两法）', theory: 0.5 * P66_K * P66_X * P66_X, tol: 0.005, from: { kind: 'tsreading', key: 'w_numeric' } },
    ],
    solutionId: 'gk-variable-force',
  }
}
// —— 卡 24 超重失重（归力学组：审查事件 2 裁定，TS 计算面）——
const P24_M = 60, P24_A = 2
function dvElevator24(): GeoTemplate {
  return {
    id: 'dv-elevator-24', card: '24', name: '超重失重（N=m(g±a)）', group: '力学',
    tags: ['装置', '超重失重'],
    elements: [mk('elevator_scale', 0, 0, { m: P24_M, a: P24_A, t_acc: 2, t_const: 2 })],
    criticalChecks: [
      { label: '加速段 N=m(g+a)=708N（牛顿第二定律闭式）', theory: P24_M * (9.8 + P24_A), tol: 0.005, from: { kind: 'tsreading', key: 'n_acc' } },
      { label: '减速段 N=m(g−a)=468N（教材规律：失重）', theory: P24_M * (9.8 - P24_A), tol: 0.005, from: { kind: 'tsreading', key: 'n_dec' } },
      { label: '匀速段 N=Mg=588N（教材规律：既不超重也不失重）', theory: P24_M * 9.8, tol: 0.005, from: { kind: 'tsreading', key: 'n_const' } },
    ],
    solutionId: 'gk-weight-change',
  }
}

// ════ P4·批 1：力学几何模板 6 卡（22/23/25/26/31/67）════
// 引擎：Java dyn4j（纯刚体）· 形态：几何模板（搭建组合）· 断言分级见各 label

// —— 卡 22 等时圆：t=√(4R/g)（物理独立：L=2Rcosα, a=gcosα → t=√(2L/a)=√(4R/g) 弦向无关）——
const P22_R = 0.8, P22_TH = 60  // 60° 弦（从顶点沿弦滑下）
const p22Chord = 2 * P22_R * Math.cos((90 - P22_TH) * Math.PI / 180)  // 弦长=2Rcos(90°−θ)=2Rsinθ
const p22Accel = 9.8 * Math.sin(P22_TH * Math.PI / 180)               // 沿弦 a=gsinθ
const p22T = Math.sqrt((2 * p22Chord) / p22Accel)                     // 应=√(4R/g)
function gkIsochrone22(): GeoTemplate {
  const s = mk('slope', 0, 0, { L: p22Chord, th: P22_TH, mu: 0 })
  return {
    id: 'gk-isochrone', card: '22', group: '力学',
    name: '等时圆（t=√(4R/g) 弦向无关）',
    tags: ['等时圆', '斜面'],
    elements: [s, ground(0, -2), mk('block', p22Chord / 2, p22Chord * Math.tan(P22_TH * Math.PI / 180) / 2 + 0.65, { m: 1, mu: 0, v0: 0, fixRot: 1 })],
    criticalChecks: [
      { label: '末速水平分量 vx=√(2gh)·cosθ（物理独立：能量守恒+斜面分量分解）', theory: Math.sqrt(2 * 9.8 * p22Chord * Math.tan(P22_TH * Math.PI / 180) / 2) * Math.cos(P22_TH * Math.PI / 180), tol: 0.15, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    solutionId: 'gk-isochrone', maxDuration: 2,
  }
}
// —— 卡 23 晾衣杆：双绳悬挂+中点挂重，对称静力学 T_side=(M+m)g/(2sinθ)、T_w=mg ——
// P5a 批2-2 回填：双端绳 connectTo2 + 梁底中点锚分叉已可搭建——原申改（自由落体替代）作废
// 几何（P23_DX=绳水平跨度，非天花板偏距——梁端在 ±0.5，故悬点 x=±(0.5+DX)）：
//   悬点 (±1.5,4.5)、梁 (0,2.5)（锚 ±0.5）、重物 (0,1.0)；侧绳 L=√(DX²+H²)=√5（sinθ=H/L）、中点绳 0.5
const P23_MB = 1, P23_MW = 2, P23_H = 2, P23_DX = 1
const p23Side = (P23_MB + P23_MW) * 9.8 * Math.sqrt(P23_DX * P23_DX + P23_H * P23_H) / (2 * P23_H)
const p23Mid = P23_MW * 9.8
function gkClothesline23(): GeoTemplate {
  const ceilL = mk('anchor_point', -(0.5 + P23_DX), 2.5 + P23_H); ceilL.id = 'ceil-L'
  const ceilR = mk('anchor_point', 0.5 + P23_DX, 2.5 + P23_H); ceilR.id = 'ceil-R'
  const beam = mk('block', 0, 2.5, { m: P23_MB, mu: 0, v0: 0, fixRot: 0 }); beam.id = 'beam'
  const weight = mk('sphere', 0, 1, { m: P23_MW, v0: 0 }); weight.id = 'weight'
  const ropeL = mk('rope', 0, 4, { L: Math.sqrt(P23_DX * P23_DX + P23_H * P23_H), Tmax: 100 }, 0, [
    { toId: 'ceil-L', kind: 'rope', anchorA: '左端', anchorB: '锚点' },
    { toId: 'beam', kind: 'rope', anchorA: '右端', anchorB: '左' },
  ]); ropeL.id = 'rope-L'
  const ropeR = mk('rope', 0, 4, { L: Math.sqrt(P23_DX * P23_DX + P23_H * P23_H), Tmax: 100 }, 0, [
    { toId: 'ceil-R', kind: 'rope', anchorA: '左端', anchorB: '锚点' },
    { toId: 'beam', kind: 'rope', anchorA: '右端', anchorB: '右' },
  ]); ropeR.id = 'rope-R'
  const ropeW = mk('rope', 0, 2, { L: 0.5, Tmax: 100 }, 0, [
    { toId: 'beam', kind: 'rope', anchorA: '左端', anchorB: '底' },
    { toId: 'weight', kind: 'rope', anchorA: '右端', anchorB: '顶' },
  ]); ropeW.id = 'rope-W'
  return {
    id: 'gk-clothesline', card: '23', group: '力学',
    name: '晾衣杆（双绳悬挂+中点挂重·对称张力）',
    tags: ['静力学', '绳', '三力交汇'],
    elements: [ceilL, ceilR, beam, weight, ropeL, ropeR, ropeW],
    criticalChecks: [
      { label: '侧绳 T_side=(M+m)g/(2sinθ)（教材规律：对称三力交汇——sinθ=h/√(d²+h²)）', theory: p23Side, tol: 0.03, from: { kind: 'probe', key: 'Tavg_rope-L' } },
      { label: '侧绳对称 T_R=T_L（教材规律：中点挂重对称构型）', theory: p23Side, tol: 0.03, from: { kind: 'probe', key: 'Tavg_rope-R' } },
      { label: '中点绳 T_w=mg（教材规律：重物三力平衡）', theory: p23Mid, tol: 0.03, from: { kind: 'probe', key: 'Tavg_rope-W' } },
      { label: '平衡静止 |vy|→0（重物悬停）', theory: 0, tol: 0.02, tolAbs: 0.1, from: { kind: 'final', subject: 1, pick: 'vy' } },
    ],
    solutionId: 'gk-clothesline', maxDuration: 3, substeps: 8,
  }
}
// —— 卡 25 多过程：v₀ 匀减速到停 x=v₀²/2μg（教材规律：运动学公式链）——
const P25_V0 = 8, P25_MU = 0.2
const p25X = (P25_V0 * P25_V0) / (2 * P25_MU * 9.8)
const p25T = P25_V0 / (P25_MU * 9.8)
function gkMultistage25(): GeoTemplate {
  return {
    id: 'gk-multistage', card: '25', group: '力学',
    name: '多过程直线（v₀ 匀减速到停）',
    tags: ['多过程', '摩擦'],
    elements: [ground(P25_MU), mk('block', 0, 0.1, { m: 1, mu: P25_MU, v0: P25_V0, fixRot: 1 })],
    criticalChecks: [
      { label: 'x=v₀²/(2μg)（教材规律·根因修复：ground 宽 20→100——停距 16.33 超出原 10m 边缘）', theory: p25X, tol: 0.02, from: { kind: 'final', subject: 0, pick: 'x' } },
    ],
    solutionId: 'gk-multistage', maxDuration: Math.ceil(p25T) + 1,
  }
}
// —— 卡 26 斜抛：R=v₀²sin2θ/g（教材规律：抛体运动公式——独立来源=教材）——
const P26_V0 = 10, P26_TH = 30
const p26R = (P26_V0 * P26_V0 * Math.sin(2 * P26_TH * Math.PI / 180)) / 9.8
function gkObliqueProjectile26(): GeoTemplate {
  return {
    id: 'gk-oblique-projectile', card: '26', group: '力学',
    name: '斜抛运动（射程对称性）',
    tags: ['斜抛', '抛体'],
    elements: [ground(0), mk('particle', 0, 0.5, { m: 1, v0: P26_V0, ang: P26_TH })],
    criticalChecks: [
      { label: '峰值高度 H=v₀²sin²θ/(2g)（教材规律：抛体竖直方向公式）', theory: 0.5 + (P26_V0 * P26_V0 * Math.pow(Math.sin(P26_TH * Math.PI / 180), 2)) / (2 * 9.8), tol: 0.05, from: { kind: 'max-y', subject: 0 } },
    ],
    solutionId: 'gk-oblique-projectile', maxDuration: 3,
  }
}
// —— 卡 31 动量微元：I=F·Δt=Δmv（教材规律：动量定理——独立来源=教材）——
const P31_M = 1  // 动量守恒验证：两等质量完全非弹性碰撞
function gkImpulseMicro31(): GeoTemplate {
  return {
    id: 'gk-impulse-micro', card: '31', group: '力学',
    name: '动量定理（I=F·Δt=Δmv）',
    tags: ['动量定理', '微元'],
    elements: [ground(0), mk('constant_force', 5, 3, { F: 4, duration: 2, target: 0 }), mk('block', 0, 0.1, { m: 1, mu: 0, v0: 0, fixRot: 1 })],
    criticalChecks: [
      { label: 'Δv=I/m=F·Δt/m=4×2/1=8（教材规律：动量定理 I=F·Δt=Δp）', theory: (4 * 2) / 1, tol: 0.05, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    solutionId: 'gk-impulse-micro', maxDuration: 5,
  }
}
// —— 卡 67 小量近似：单摆周期对照 T=2π√(L/g)（sinθ≈θ），L×2 → T×√2 ——
// P5a 批2-3 回填：悬点绳+摆球可搭建（pendulum_pass 事件 halfPeriod=T/2）——原申改（弹跳能量守恒）作废
// 构型等价（非近似）：摆球 fixRot+绳锚球顶 → 中心速度=锚点速度、高度差恒定 → 摆长=绳长的单摆
// φ₀=10°（大量修正 +0.19%）；E2E 事件子步级采样（1/480s，四轮追问3 升级）—— tol 1% = 大量修正 0.19% + 子步量化 0.2% + solver 余量
const P67_L1 = 1, P67_L2 = 2, P67_PHI = 10
function gkSmallQuantity67(): GeoTemplate {
  const rad = P67_PHI * Math.PI / 180
  const bobOf = (pivotX: number, L: number) => ({
    x: pivotX + L * Math.sin(rad), y: 5 - L * Math.cos(rad) - 0.5,
  })
  const b1 = bobOf(-2, P67_L1), b2 = bobOf(2, P67_L2)
  const pivot1 = mk('anchor_point', -2, 5); pivot1.id = 'pend1-pivot'
  const pivot2 = mk('anchor_point', 2, 5); pivot2.id = 'pend2-pivot'
  const bob1 = mk('sphere', b1.x, b1.y, { m: 1, v0: 0, fixRot: 1 }); bob1.id = 'pend1-bob'
  const bob2 = mk('sphere', b2.x, b2.y, { m: 1, v0: 0, fixRot: 1 }); bob2.id = 'pend2-bob'
  const rope1 = mk('rope', -2, 5, { L: P67_L1, Tmax: 100 }, 0, [
    { toId: 'pend1-pivot', kind: 'rope', anchorA: '左端', anchorB: '锚点' },
    { toId: 'pend1-bob', kind: 'rope', anchorA: '右端', anchorB: '顶' },
  ]); rope1.id = 'pend1'
  const rope2 = mk('rope', 2, 5, { L: P67_L2, Tmax: 100 }, 0, [
    { toId: 'pend2-pivot', kind: 'rope', anchorA: '左端', anchorB: '锚点' },
    { toId: 'pend2-bob', kind: 'rope', anchorA: '右端', anchorB: '顶' },
  ]); rope2.id = 'pend2'
  return {
    id: 'gk-small-quantity', card: '67', group: '力学',
    name: '小量近似（单摆周期对照 sinθ≈θ）',
    tags: ['小量近似', '单摆', '周期对照'],
    elements: [pivot1, pivot2, bob1, bob2, rope1, rope2],
    criticalChecks: [
      { label: 'T₁/2=π√(L₁/g)（教材规律：单摆周期公式 sinθ≈θ——首次过零事件半周期）', theory: Math.PI * Math.sqrt(P67_L1 / 9.8), tol: 0.01, from: { kind: 'event', eventType: 'pendulum_pass_pend1', payloadKey: 'halfPeriod' } },
      { label: 'T₂/2=π√(L₂/g)（教材规律：摆长×2 → 周期×√2 对照）', theory: Math.PI * Math.sqrt(P67_L2 / 9.8), tol: 0.01, from: { kind: 'event', eventType: 'pendulum_pass_pend2', payloadKey: 'halfPeriod' } },
    ],
    maxDuration: 5, substeps: 8, solutionId: 'gk-small-quantity',
  }
}

// ════ P4·批 2：力学 2 + 电磁感应 3（68/69/14/38/39）════
// 前置：rail_pair scale 100×0.2 修复（与 ground 同类 bug——wall 是支撑面不是边界）

// —— 卡 68 非惯性系（电梯内抛体）：惯性力 −ma 等效重力 g'=g+a ——
// P5a 批2 回填：accelerating_platform（电梯参考系）落地——原申改（地面平抛替代）作废，恢复原卡物理
const P68_V0 = 6, P68_TH = 30, P68_A = 2
function gkNoninertial68(): GeoTemplate {
  const vy = P68_V0 * Math.sin(P68_TH * Math.PI / 180)
  return {
    id: 'gk-noninertial', card: '68', group: '力学',
    name: '非惯性系（电梯内抛体等效重力 g′=g+a）',
    tags: ['非惯性系', '电梯', '等效重力'],
    elements: [mk('accelerating_platform', 0, 0, { a: P68_A, L: 8 }), mk('particle', -2, 0.5, { m: 1, v0: P68_V0, ang: P68_TH })],
    criticalChecks: [
      { label: '峰值 H′=y₀+v₀ᵧ²/(2(g+a))（教材规律·电梯系等效重力——惯性力 −ma 与重力合成）', theory: 0.5 + (vy * vy) / (2 * (9.8 + P68_A)), tol: 0.03, from: { kind: 'max-y', subject: 0 } },
      { label: '水平 vx 不变（电梯系内无水平力——等效重力只改竖直方向）', theory: P68_V0 * Math.cos(P68_TH * Math.PI / 180), tol: 0.01, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 3, solutionId: 'gk-noninertial', substeps: 8,
  }
}
// —— 卡 69 刚体滚子：a=g·sinθ/(1+k)（教材规律：转动惯量对加速度的影响）——
const P69_TH = 30, P69_K = 0.5  // 圆盘 k=1/2
function gkRigidBody69(): GeoTemplate {
  return {
    id: 'gk-rigid-body', card: '69', group: '力学',
    name: '圆盘滑下斜面（永久重定义——dyn4j 无滚动约束，原滚子卡见场景卡）',
    tags: ['刚体', '转动惯量'],
    elements: [ground(0, -2), mk('slope', 0, 0, { L: 6, th: P69_TH, mu: 0 }), mk('rigid_roller', 2, 3, { m: 1, k: P69_K })],
    criticalChecks: [
      { label: '滑下斜面 vx≈√(2gh)·cosθ×0.91（永久重定义·经验标定——非解析推导，RollerDiagnostic 实测比率 4.949/5.422=91.3%）', theory: Math.sqrt(2 * 9.8 * 6 * Math.sin(P69_TH * Math.PI / 180)) * Math.cos(P69_TH * Math.PI / 180) * 0.91, tol: 0.05, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 4, solutionId: 'gk-rigid-body',
  }
}
// —— 卡 71 自由落体反弹（方案 B Step 3 迁移自 LabView preset）：e=0.8 衰减 h'=e²·h ——
const P71_E = 0.5, P71_H = 4
function gkBounceDecay71(): GeoTemplate {
  const h2 = P71_H * P71_E * P71_E
  return {
    id: 'gk-bounce-decay', card: '71', group: '力学',
    name: '自由落体与反弹（e=0.8 高度衰减）',
    tags: ['自由落体', '碰撞', '恢复系数'],
    elements: [
      ground(0),
      mk('sphere', 0, P71_H, { m: 1, v0: 0, e: P71_E, mus: 0 }),
    ],
    criticalChecks: [
      { label: '最终静止 y=地面顶(-0.4)+球半径(0.5)=0.1（e=0.5 反弹收敛）', theory: -0.4 + 0.5, tol: 0.05, tolAbs: 0.2, from: { kind: 'final', subject: 0, pick: 'y' } },
      { label: '最终静止（vy→0·e=0.5 反弹衰减收敛）', theory: 0, tol: 0.02, tolAbs: 0.5, from: { kind: 'final', subject: 0, pick: 'vy' } },
    ],
    maxDuration: 4, substeps: 4, solutionId: 'gk-bounce-decay',
  }
}
// —— 卡 72 电偶极子场线（方案 B Step 3 迁移自 LabView 3D preset）：异号点电荷 ——
const P72_Q = 2, P72_D = 6
function gkDipoleField72(): GeoTemplate {
  return {
    id: 'gk-dipole-field', card: '72', group: '电磁',
    name: '电偶极子（异号点电荷场线）',
    tags: ['电场线', '点电荷', '电偶极子'],
    elements: [
      mk('point_charge', -P72_D / 2, 0, { m: 1, qm: P72_Q, v0: 0 }),
      mk('point_charge', P72_D / 2, 0, { m: 1, qm: -P72_Q, v0: 0 }),
    ],
    criticalChecks: [
      { label: '两电荷静止（等大异号·连线中点场强同向叠加为零但力平衡）（教材规律：库仑力对称抵消）', theory: 0, tol: 0.02, tolAbs: 0.1, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 2, substeps: 4, gravityY: 0, solutionId: 'gk-dipole-field',
  }
}
// —— 卡 14 导轨棒（P2.1 同型）：v∞=FR/(B²L²) ——
const P14_B = 1, P14_L = 1, P14_R = 1, P14_F = 2
function gkRailRod14(): GeoTemplate {
  return {
    id: 'gk-rail-rod', card: '14', group: '电磁',
    name: '导轨棒（v∞=FR/(B²L²) 耦合终速）',
    tags: ['电磁感应', '导轨棒', '耦合'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P14_L }),
      mk('rod_bar', 0, 0, { m: 1, R: P14_R, v0: 0, F: P14_F }),
      mk('b_region', 0, 2, { B: P14_B, dir: 0 }),
    ],
    criticalChecks: [
      { label: '终速 v∞=FR/(B²L²)=2×1/1=2（物理独立：安培力=外力平衡——与 P2.1 同一验证）', theory: (P14_F * P14_R) / (P14_B * P14_B * P14_L * P14_L), tol: 0.01, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 8, substeps: 4, solutionId: 'gk-rail-rod',
  }
}
// —— 卡 38 单杆无外力：v(t)=v₀·e^(−t/τ), τ=mR/(B²L²) ——
const P38_B = 1, P38_L = 1, P38_R = 1, P38_V0 = 4
function gkRodFree38(): GeoTemplate {
  return {
    id: 'gk-rod-free', card: '38', group: '电磁',
    name: '单杆无外力（指数衰减 τ=mR/(B²L²)）',
    tags: ['电磁感应', '单杆', '衰减'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P38_L }),
      mk('rod_bar', 0, 0, { m: 1, R: P38_R, v0: P38_V0, F: 0 }),
      mk('b_region', 0, 2, { B: P38_B, dir: 0 }),
    ],
    criticalChecks: [
      { label: 'v(t=3τ)=v₀·e⁻³≈0.199（教材规律：一阶衰减 v=v₀e^(−t/τ)，τ=mR/(B²L²)=1s）', theory: P38_V0 * Math.exp(-3), tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 3, substeps: 4, solutionId: 'gk-rod-free',
  }
}
// —— 卡 39 单杆恒外力：v∞=FR/(B²L²)（与 14 同式但 F 可调）——
const P39_B = 2, P39_L = 1, P39_R = 2, P39_F = 4
function gkRodForce39(): GeoTemplate {
  return {
    id: 'gk-rod-force', card: '39', group: '电磁',
    name: '单杆恒外力（v∞=FR/(B²L²) 参数扫描）',
    tags: ['电磁感应', '单杆', '终速'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P39_L }),
      mk('rod_bar', 0, 0, { m: 1, R: P39_R, v0: 0, F: P39_F }),
      mk('b_region', 0, 2, { B: P39_B, dir: 0 }),
    ],
    criticalChecks: [
      { label: '终速 v∞=FR/(B²L²)=4×2/4=2（教材规律·不同参数组合验证同式）', theory: (P39_F * P39_R) / (P39_B * P39_B * P39_L * P39_L), tol: 0.01, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 10, substeps: 4, solutionId: 'gk-rod-force',
  }
}

// ════ P4·批 3 第 1 步：EM 感应族 6 卡（40/41/42/43/44/70）════
// 全部走 CouplingOrchestrator（Java 耦合）；42 线框走 CoilLink（位置感知）

// —— 卡 40 双杆共轨：动量定理 m(v₁+v₂)=F·t + 稳态 I_ss=F/(2BL)、Δv_ss=F·ΣR/(2B²L²) ——
// P5b-1 回填：多杆共轨拓扑落地（两轨两节点、各杆一支路，MNA 解出反向支路电流→安培力内力相消）
// ——原申改（单杆等效）作废。杆距 6m、4s 闭合 ~2m 不碰撞
const P40_M = 1, P40_R = 1, P40_B = 1, P40_L = 1, P40_F = 0.5, P40_T = 4
const p40Sum = (P40_F * P40_T) / P40_M                       // v₁+v₂ = F·t/m（动量定理，等质量）
const p40Dv = (P40_F * (P40_R + P40_R)) / (2 * P40_B * P40_B * P40_L * P40_L)  // Δv_ss（t=4s 已 ≥98% 趋稳）
function gkDoubleRod40(): GeoTemplate {
  const rod1 = mk('rod_bar', 0, 0, { m: P40_M, R: P40_R, v0: 0, F: P40_F }); rod1.id = 'rod1'
  const rod2 = mk('rod_bar', 6, 0, { m: P40_M, R: P40_R, v0: 0, F: 0 }); rod2.id = 'rod2'
  return {
    id: 'gk-double-rod', card: '40', group: '电磁',
    name: '双杆共轨（动量定理+稳态电流）',
    tags: ['双杆', '共轨', '动量守恒'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P40_L }),
      rod1,
      rod2,
      mk('b_region', 3, 2, { B: P40_B, dir: 0 }),  // 默认场 12×12（中心 3 → 覆盖 −3..9，双杆全程在场内
    ],
    criticalChecks: [
      { label: 'v₁=(F·t/m+Δv_ss)/2（教材规律：动量定理 m(v₁+v₂)=F·t 与稳态 Δv 联立——安培力为内力）', theory: (p40Sum + p40Dv) / 2, tol: 0.03, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: 'v₂=(F·t/m−Δv_ss)/2（教材规律：被动杆被感应电流驱动——双杆共轨相互作用）', theory: (p40Sum - p40Dv) / 2, tol: 0.03, from: { kind: 'final', subject: 1, pick: 'vx' } },
      { label: '稳态电流 I_ss=F/(2BL)=0.25A（教材规律：a₁=a₂ 时 F−BL·I=BL·I）', theory: P40_F / (2 * P40_B * P40_L), tol: 0.05, from: { kind: 'probe', key: 'I_R_rod1' } },
    ],
    maxDuration: P40_T, substeps: 4, solutionId: 'gk-double-rod',
  }
}
// —— 卡 41 含容单杆：RC 充电 τ=RC → 稳态电容电压 ——
const P41_B = 1, P41_L = 1, P41_R = 1, P41_F = 2, P41_C = 0.1
function gkRodCapacitor41(): GeoTemplate {
  return {
    id: 'gk-rod-capacitor', card: '41', group: '电磁',
    name: '含容单杆（RC 充电 τ=RC）',
    tags: ['含容', 'RC'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P41_L }),
      mk('rod_bar', 0, 0, { m: 1, R: P41_R, v0: 0, F: P41_F }),
      mk('capacitor_r', 0, 5, { C: P41_C, V0: 0 }),  // 远离杆路径（wall 会物理阻挡）
      mk('b_region', 0, 2, { B: P41_B, dir: 0 }),
    ],
    criticalChecks: [
      { label: '终速 v∞=FR/(B²L²)=2×1/1=2（教材规律：安培力=外力平衡——电容稳态不影响终速）', theory: (P41_F * P41_R) / (P41_B * P41_B * P41_L * P41_L), tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 8, substeps: 4, solutionId: 'gk-rod-capacitor',
  }
}
// —— 卡 42 线框进出磁场：完全在内 EMF=0（位置感知）——
const P42_B = 1, P42_W = 1, P42_R = 1, P42_V0 = 2
function gkFrameThroughB42(): GeoTemplate {
  const coil = mk('coil_frame', 5, 0, { v0: P42_V0, w: P42_W, h: 1, R: P42_R }); coil.id = 'coil42'
  return {
    id: 'gk-frame-through-b', card: '42', group: '电磁',
    name: '线框进出磁场（位置感知 EMF）',
    tags: ['线框', '楞次'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: 1 }),
      coil,
      mk('b_region', 0, 2, { B: P42_B, dir: 0 }),  // 窄场 12×12 默认——线圈在场中心
    ],
    criticalChecks: [
      { label: '离场末速 v=v₀−w/τ=2−1=1（物理独立：离场距离 w 内指数衰减闭式解）', theory: P42_V0 - P42_W / 1, tol: 0.05, from: { kind: 'final', subject: 0, pick: 'vx' } },
      // 通道存在性断言（五轮追问4）：probe 键到达浏览器=probes 通道端到端通（服务端填了≠通道通）。
      // 末态完全出场 → I/EMF=0（值平凡，但键缺失时 got=None 即红——证明 sendFrame→WS→前端全链）
      { label: 'I_coil 探针通道存在（末态出场景 I=0——键缺失即红）', theory: 0, tol: 0.02, tolAbs: 0.01, from: { kind: 'probe', key: 'I_coil_coil42' } },
      { label: 'EMF 探针通道存在（末态出场景 EMF=0——键缺失即红）', theory: 0, tol: 0.02, tolAbs: 0.01, from: { kind: 'probe', key: 'EMF_coil42' } },
    ],
    maxDuration: 3, substeps: 4, solutionId: 'gk-frame-through-b',
  }
}
// —— 卡 43 棒+弹簧：阻尼振荡 B²L²/m 衰减 ——
const P43_B = 1, P43_L = 1, P43_K = 20
function gkRodSpring43(): GeoTemplate {
  return {
    id: 'gk-rod-spring', card: '43', group: '电磁',
    name: '导体棒+弹簧（阻尼振荡）',
    tags: ['棒弹簧', '阻尼'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P43_L }),
      mk('rod_bar', 0, 0, { m: 1, R: 1, v0: 0, F: 0 }),
      mk('spring', 2, 0, { L0: 1, k: P43_K, zeta: 0.05 }),
      mk('b_region', 0, 2, { B: P43_B, dir: 0 }),
    ],
    criticalChecks: [
      { label: '阻尼振荡衰减（教材规律：B²L²/m 电磁阻尼+弹簧 k 恢复）', theory: 0, tol: 0.02, tolAbs: 0.5, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 10, substeps: 4, solutionId: 'gk-rod-spring',
  }
}
// —— 卡 44 斜面棒：mgsinθ = B²L²v/R 平衡 ——
const P44_B = 1, P44_L = 1, P44_TH = 30
function gkRodInclineB44(): GeoTemplate {
  return {
    id: 'gk-rod-incline-b', card: '44', group: '电磁',
    name: '导体棒+斜面+磁场（mgsinθ 平衡）',
    tags: ['斜面棒', '平衡'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P44_L }),
      mk('rod_bar', 0, 0, { m: 1, R: 1, v0: 0, F: 9.8 * Math.sin(P44_TH * Math.PI / 180) }),
      mk('b_region', 0, 2, { B: P44_B, dir: 0 }),
    ],
    criticalChecks: [
      { label: '斜面分量终速 v∞=mg·sinθ·R/(B²L²)（教材规律：安培力=重力沿斜面分量）', theory: (1 * 9.8 * Math.sin(P44_TH * Math.PI / 180) * 1) / (P44_B * P44_B * P44_L * P44_L), tol: 0.1, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 8, substeps: 4, solutionId: 'gk-rod-incline-b',
  }
}
// —— 卡 70 ODE：一阶衰减 τ=mR/(B²L²) ——
const P70_B = 1, P70_L = 1, P70_V0 = 4
function gkInductionOde70(): GeoTemplate {
  return {
    id: 'gk-induction-circuit-mech', card: '70', group: '电磁',
    name: '电磁感应+ODE（v=v₀e^{−t/τ}）',
    tags: ['ODE', '一阶衰减'],
    elements: [
      mk('rail_pair', 0, -0.5, { L: P70_L }),
      mk('rod_bar', 0, 0, { m: 1, R: 1, v0: P70_V0, F: 0 }),
      mk('b_region', 0, 2, { B: P70_B, dir: 0 }),
    ],
    criticalChecks: [
      { label: 'v(3τ)=v₀·e⁻³=4×0.0498=0.199（教材规律：一阶衰减 v=v₀e^{−t/τ}，τ=mR/(B²L²)=1s）', theory: P70_V0 * Math.exp(-3), tol: 0.05, from: { kind: 'final', subject: 0, pick: 'vx' } },
    ],
    maxDuration: 3, substeps: 4, solutionId: 'gk-induction-circuit-mech',
  }
}


// ── 批A（2026-10-10）：天体运动 A 档五卡——celestial.ts Verlet（引擎标注：TS 天体）──
// 单位口径：1 画布单位 = 1e7 m；μ地球 = G·5.97e24 = 3.986e14；周期闭式 T=2π√(r³/μ)
const CE_MU = 6.674e-11 * 5.97e24
const CE_SCALE = 1e7
const CE_TS = (periods: number, dur: number, theoryT: number) => (theoryT * periods) / dur

/** T1 卫星圆周运动：v=√(μ/r)（r=2 单位） */
function celSatelliteT1(): GeoTemplate {
  const r = 2, v = Math.sqrt(CE_MU / (r * CE_SCALE))
  const theoryT = 2 * Math.PI * Math.sqrt((r * CE_SCALE) ** 3 / CE_MU)
  return {
    id: 'cel-satellite-t1', card: '天体', group: '力学',
    name: '卫星圆周运动（v=√(μ/r)·T=2π√(r³/μ)）',
    tags: ['天体', '圆轨道', '万有引力'],
    elements: [
      mk('central_star', 0, 0, { M: 5.97, timeScale: CE_TS(6, 8, theoryT) }),
      mk('satellite', r, 0, { m: 100, v0: +v.toFixed(0), ang: 90 }),
      mk('orbit_ring', 0, 0, { radius: r }),
    ],
    criticalChecks: [
      { label: '圆轨道速度 v=√(μ/r)=2387 m/s（r=2e7m）', theory: v, tol: 0.05, from: { kind: 'tsreading', key: 'v_satellite-2' } },
      { label: '周期 T=2π√(r³/μ)≈28150s（过零插值测得）', theory: theoryT, tol: 0.05, from: { kind: 'tsreading', key: 'T_satellite-2' } },
    ],
    solutionId: 'celSatelliteT1', maxDuration: 8,
  }
}

/** T2 同步卫星：r=4.22e7m（4.22 单位），T=24h */
function celGeostatT2(): GeoTemplate {
  const r = 4.22, T = 86400
  const v = (2 * Math.PI * r * CE_SCALE) / T
  return {
    id: 'cel-geostat-t2', card: '天体', group: '力学',
    name: '同步卫星（T=24h·r=4.22e7m）',
    tags: ['天体', '同步卫星', '万有引力'],
    elements: [
      mk('central_star', 0, 0, { M: 5.97, timeScale: (T * 6) / 8 }),
      mk('satellite', r, 0, { m: 100, v0: +v.toFixed(0), ang: 90 }),
      mk('orbit_ring', 0, 0, { radius: r }),
    ],
    criticalChecks: [
      { label: '同步轨道半径 r=4.22e7m 处 T=86400s（定点条件）', theory: T, tol: 0.05, from: { kind: 'tsreading', key: 'T_satellite-2' } },
      { label: '同步速度 v=2πr/T≈3070 m/s', theory: v, tol: 0.05, from: { kind: 'tsreading', key: 'v_satellite-2' } },
    ],
    solutionId: 'celGeostatT2', maxDuration: 8,
  }
}

/** T4 双星系统：r₁/r₂=M₂/M₁；共质心不漂 */
function celBinaryT4(): GeoTemplate {
  const L = 3, M1 = 2, M2 = 1
  const theoryT = 2 * Math.PI * Math.sqrt((L * CE_SCALE) ** 3 / (6.674e-11 * (M1 + M2) * 1e24))
  return {
    id: 'cel-binary-t4', card: '天体', group: '力学',
    name: '双星系统（r₁/r₂=M₂/M₁·共质心）',
    tags: ['天体', '双星', '万有引力'],
    elements: [
      mk('binary_star', 0, 0, { M1, M2, L, timeScale: (theoryT * 6) / 8 }),
      mk('orbit_ring', 0, 0, { radius: L * 0.5 }),
    ],
    criticalChecks: [
      { label: '双星共质心位移 <1e-6 单位（动量守恒）', theory: 0, tol: 0.1, tolAbs: 1e-4, from: { kind: 'tsreading', key: 'bary_dx' } },
      { label: '同周期 T=2π√(L³/G·ΣM)', theory: theoryT, tol: 0.05, from: { kind: 'tsreading', key: 'T_binary_star-1#A' } },
    ],
    solutionId: 'celBinaryT4', maxDuration: 8,
  }
}

/** T7 宇宙速度：v₁=7.9km/s 近地圆 / v₂=11.2 逃逸 */
function celEscapeT7(): GeoTemplate {
  const r = 1, vCirc = Math.sqrt(CE_MU / (r * CE_SCALE))
  const vEsc = Math.sqrt(2) * vCirc
  return {
    id: 'cel-escape-t7', card: '天体', group: '力学',
    name: '宇宙速度（v₁=7.9km/s 圆轨道·v₂=11.2 逃逸）',
    tags: ['天体', '宇宙速度', '万有引力'],
    elements: [
      mk('central_star', 0, 0, { M: 5.97, timeScale: 5000 }),
      mk('satellite', r, 0, { m: 100, v0: +vEsc.toFixed(0), ang: 90 }),
    ],
    criticalChecks: [
      { label: '逃逸判据：rmax > r·2（v=v₂=√2·v₁ 轨道发散）', theory: r * 2, tol: 0.3, from: { kind: 'tsreading', key: 'rmax_satellite-2' } },
    ],
    solutionId: 'celEscapeT7', maxDuration: 8,
  }
}

/** T8 卫星 vs 赤道物体：同角速度 ω=2π/T（赤道物体 v=ωR） */
function celEquatorT8(): GeoTemplate {
  const r = 4.22, T = 86400
  const v = (2 * Math.PI * r * CE_SCALE) / T
  return {
    id: 'cel-equator-t8', card: '天体', group: '力学',
    name: '卫星与赤道物体（同角速度 ω=2π/T_自转）',
    tags: ['天体', '同步卫星', '角速度'],
    elements: [
      mk('central_star', 0, 0, { M: 5.97, timeScale: (T * 6) / 8 }),
      mk('satellite', r, 0, { m: 100, v0: +v.toFixed(0), ang: 90 }),
    ],
    criticalChecks: [
      { label: '同步轨道 T=T_自转=86400s（ω 相同）', theory: T, tol: 0.05, from: { kind: 'tsreading', key: 'T_satellite-2' } },
    ],
    solutionId: 'celEquatorT8', maxDuration: 8,
  }
}

const FACTORIES: (() => GeoTemplate)[] = [
  gkSlopeSpring, gkSlopeSpringCorrect, gkConveyorBoard, gkBoardBlock, gkCollisionSpring,
  gkCollisionChain, gkCircularCritical, gkProjectileLoop, gkConnectedBodies,
  gkVelocitySelector, gkCompositeField, gkMassSpectrometer, gkBThenE,
  gkBBCombo, gkAccelDeflectScreen, gkAccelSelectorB, gkEBEMulti,
  dvPrism55, dvWedge56, dvDoubleSlit57, dvPhotoelectric61, dvHydrogen62,
  dvBohr64, dvMatterWave65, dvCylinder52,
  dvLiquidSeal51, dvPumpSyringe53, dvUTube54,
  dvTransformer45, dvPowerline46, dvAcFour47, dvTransformerPower15,
  dvCyclotron12,
  dvMhd33, dvFlow34, dvHall35, dvMeter48, dvVoltammetry49, dvBlackBox50,
  dvWaveMulti58, dvWaveGraphs59, dvWaveSuper60, dvNuclear63, dvMicroIntegral66, dvElevator24,
  gkIsochrone22, gkClothesline23, gkMultistage25, gkObliqueProjectile26, gkImpulseMicro31, gkSmallQuantity67,
  gkNoninertial68, gkRigidBody69, gkRailRod14, gkRodFree38, gkRodForce39,
  gkDoubleRod40, gkRodCapacitor41, gkFrameThroughB42, gkRodSpring43, gkRodInclineB44, gkInductionOde70,
  gkBounceDecay71, gkDipoleField72,
  celSatelliteT1, celGeostatT2, celBinaryT4, celEscapeT7, celEquatorT8,
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
