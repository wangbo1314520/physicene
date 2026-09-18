/**
 * 几何模板层（方案 §6.1 第 1 层，阶段四批次 1：力学 8 个）。
 * 每模板 = 打开即运行的 GeoElement 场景 + criticalChecks（理论 vs 实测 <2%，供 builder-check.py 与 CriticalPanel）。
 * 理论值与高考卡 E2E 同源（规则 13）；断言清单见 docs/统一搭建台-阶段四交付清单与验收标准.md §1。
 */
import type { GeoElement, ElementSpec } from '../catalog'
import { byType, defaultsOf } from '../catalog'

export interface CriticalCheck {
  label: string
  theory: number
  /** 相对容差（对 theory） */
  tol: number
  from:
    | { kind: 'event'; eventType: string; payloadKey?: string }
    | { kind: 'final'; subject: number; pick: 'x' | 'y' | 'vx' | 'vy' }
    | { kind: 'max-y'; subject: number }
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
  /** 讲解模板挂接（gaokao def id，labeler 批次接入后由 registry 解析 SolutionTemplate） */
  solutionId?: string
  /** 运行窗口（默认 12s；短地面场景防滑出边界） */
  maxDuration?: number
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

// ════ 批次 1：力学 8 模板 ════

/** 卡3：斜面+弹簧+滑块（μ=0 下滑压缩弹簧，阻尼收敛到平衡位 x_eq = 自然点+mg·sinθ/k） */
const gkSlopeSpring = (): GeoTemplate => {
  const block = mk('block', -0.719, -0.357, { m: 1, v0: 0, mu: 0 }, -Math.PI / 6)
  const spring = mk('spring', 1.391, -2.15, { k: 60, L0: 1.2, zeta: 0.4 }, -Math.PI / 6,
    [{ toId: block.id, kind: 'spring', anchorA: '左端', anchorB: '左' }])
  return {
    id: 'gk-slope-spring', card: '3', group: '力学', name: '斜面·弹簧·滑块（压缩平衡）',
    tags: ['斜面', '弹簧', '物块'],
    elements: [mk('slope', -4, -2.5, { th: 30, mu: 0, L: 6 }), spring, block],
    criticalChecks: [
      // 平衡推导：锚 A=(2.43,−2.75)，拉伸平衡 Δ=mg·sinθ/k=0.0817 → 块左锚距 A 为 L0+Δ，
      // 块心 = A − (L0+Δ)·(0.866,−0.5) + (0.433,−0.25) → x_eq = 2.43 − 1.2817·0.866 + 0.433 = 1.753
      { label: '拉伸平衡位置 x_eq = 1.75 m（k·Δ=mg·sinθ）', theory: 1.753, tol: 0.03, from: { kind: 'final', subject: 0, pick: 'x' } },
      { label: '弹簧恢复原长事件（往返经过）', theory: 1, tol: 0.01, from: { kind: 'event', eventType: 'spring_natural' } },
    ],
    solutionId: 'slopeSpring',
  }
}

/** 卡4：传送带+物块（共速 t*=v/(μg)，阶段三手工录制已实测 0.77s） */
const gkConveyorBoard = (): GeoTemplate => ({
  id: 'gk-conveyor-board', card: '4', group: '力学', name: '传送带·物块（摩擦共速）',
  tags: ['传送带', '物块'],
  elements: [
    mk('belt', 0, -1, { vb: 3, th: 0, mu: 0.4, L: 8 }),
    mk('block', 0, -0.35, { m: 1, v0: 0, mu: 0.4 }),
  ],
  criticalChecks: [
    { label: '共速 v* = 带速 3.00 m/s', theory: 3, tol: 0.02, from: { kind: 'event', eventType: 'belt_common_speed', payloadKey: 'v' } },
  ],
  solutionId: 'conveyorBoard',
})

/** 卡1/30：板块模型（光滑地面，共速 v′=m·v₀/(m+M)） */
const gkBoardBlock = (): GeoTemplate => ({
  id: 'gk-board-block', card: '1/30', group: '力学', name: '板块模型（动量守恒共速）',
  tags: ['小车', '板', '物块'],
  elements: [
    ground(0, -0.5),
    mk('cart', 0, -0.25, { M: 3, L: 6, mu2: 0.2 }),
    mk('block', -1.5, 0.4, { m: 1, v0: 4, mu: 0.2 }),
  ],
  criticalChecks: [
    { label: '共速后板速 v′ = m·v₀/(m+M) = 1.00 m/s', theory: 1, tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
    { label: '共速后块速同 v′ = 1.00 m/s', theory: 1, tol: 0.02, from: { kind: 'final', subject: 1, pick: 'vx' } },
  ],
  solutionId: 'gkBoardBlockDef',
  maxDuration: 6,
})

/** 卡6/29：滑块-弹簧-滑块（弹簧缓冲共速 v′=m₁v₀/(m₁+m₂)，阻尼收敛） */
const gkCollisionSpring = (): GeoTemplate => {
  const b1 = mk('block', -1.5, 0.1, { m: 1, v0: 4, mu: 0 })
  const b2 = mk('block', 0.5, 0.1, { m: 1, v0: 0, mu: 0 })
  const spring = mk('spring', -0.5, 0.1, { k: 100, L0: 1, zeta: 0.3 }, 0, [
    { toId: b1.id, kind: 'spring', anchorA: '左端', anchorB: '右' },
    { toId: b2.id, kind: 'spring', anchorA: '右端', anchorB: '左' },
  ])
  return {
    id: 'gk-collision-spring', card: '6/29', group: '力学', name: '滑块·弹簧·滑块（缓冲共速）',
    tags: ['物块', '弹簧'],
    elements: [ground(0), b1, spring, b2],
    criticalChecks: [
      { label: '共速 v₁′ = m₁v₀/(m₁+m₂) = 2.00 m/s', theory: 2, tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: '共速 v₂′ = 2.00 m/s（动量守恒）', theory: 2, tol: 0.02, from: { kind: 'final', subject: 1, pick: 'vx' } },
      { label: '弹簧恢复原长事件', theory: 1, tol: 0.01, from: { kind: 'event', eventType: 'spring_natural' } },
    ],
    solutionId: 'collisionSpring',
    maxDuration: 5,
  }
}

/** 卡8：弹性碰撞链（e=1 速度逐对交换，末球带 4 m/s 离开） */
const gkCollisionChain = (): GeoTemplate => ({
  id: 'gk-collision-chain', card: '8', group: '力学', name: '弹性碰撞链（速度交换）',
  tags: ['小球', '碰撞'],
  elements: [
    ground(0),
    mk('sphere', -3, 0.1, { m: 1, v0: 4, e: 1, mus: 0 }),
    mk('sphere', 0, 0.1, { m: 1, v0: 0, e: 1, mus: 0 }),
    mk('sphere', 1, 0.1, { m: 1, v0: 0, e: 1, mus: 0 }),
  ],
  criticalChecks: [
    { label: '末球获得 v = 4.00 m/s（e=1 等质量交换）', theory: 4, tol: 0.02, from: { kind: 'final', subject: 2, pick: 'vx' } },
    { label: '首球停住 v ≈ 0', theory: 0, tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
  ],
  solutionId: 'collisionChain',
})

/** 卡7/28：竖直圆轨道四态（v₀=8 > √(5gR′) 全程不脱离） */
const gkCircularCritical = (): GeoTemplate => ({
  id: 'gk-circular-critical', card: '7/28', group: '力学', name: '竖直圆轨道（临界速度）',
  tags: ['圆轨道', '小球'],
  elements: [
    mk('loop_track', 2, 0, { radius: 1.5, side: 0 }),
    mk('sphere', 2, -1.0, { m: 0.5, v0: 8, e: 1, mus: 0 }),
  ],
  criticalChecks: [
    { label: '球心过顶高度 = R−r = 1.00 m', theory: 1.0, tol: 0.15, from: { kind: 'max-y', subject: 0 } },
    { label: 'v₀=8 > √(5gR′)≈7.0 全程无脱离', theory: 1, tol: 0.01, from: { kind: 'no-event', eventType: 'detach' } },
  ],
  solutionId: 'circularCritical',
})

/** 卡2：平抛切入圆轨道（平台右缘距轨入 0.5m，v₀=7 > √(5g(R−r))=6.26） */
const gkProjectileLoop = (): GeoTemplate => ({
  id: 'gk-projectile-loop', card: '2', group: '力学', name: '平抛切入圆轨道',
  tags: ['平抛', '圆轨道'],
  elements: [
    mk('projectile_platform', -1.5, -0.95, { h: 1, v0: 7 }),
    mk('loop_track', 0, 0, { radius: 1, side: 0 }),
    mk('particle', 0.3, -0.8, { m: 1, v0: 7, ang: 0 }),
  ],
  criticalChecks: [
    { label: '球心过顶高度 = R−r = 0.80 m', theory: 0.8, tol: 0.12, from: { kind: 'max-y', subject: 0 } },
    { label: '不脱离轨道', theory: 1, tol: 0.01, from: { kind: 'no-event', eventType: 'detach' } },
  ],
  solutionId: 'gkProjectileLoopDef',
})

/** 卡5/21：连接体（B 受初速拉开绳→绷紧冲量→共速 v′=m_B·v₀/(m_A+m_B)，光滑地面） */
const gkConnectedBodies = (): GeoTemplate => {
  const a = mk('block', -2, 0.1, { m: 2, v0: 0, mu: 0 })
  const b = mk('block', 0, 0.1, { m: 1, v0: 4, mu: 0 })
  const rope = mk('rope', 0, 0, { L: 1, Tmax: 40 }, 0, [
    { toId: a.id, kind: 'rope', anchorA: '左端', anchorB: '右' },
    { toId: b.id, kind: 'rope', anchorA: '右端', anchorB: '左' },
  ])
  return {
    id: 'gk-connected-bodies', card: '5/21', group: '力学', name: '连接体（绳绷紧动量守恒）',
    tags: ['物块', '绳'],
    elements: [ground(0), a, b, rope],
    criticalChecks: [
      { label: '绷紧后 A 速度 v′ = m_B·v₀/(m_A+m_B) = 1.33 m/s', theory: 1.333, tol: 0.02, from: { kind: 'final', subject: 0, pick: 'vx' } },
      { label: '绷紧后 B 速度同 v′ = 1.33 m/s（绳内冲量）', theory: 1.333, tol: 0.02, from: { kind: 'final', subject: 1, pick: 'vx' } },
    ],
    solutionId: 'connectedBodies',
    maxDuration: 6,
  }
}

/** 工厂集合：惰性构造（seq 递增保证 id 唯一） */
const FACTORIES: (() => GeoTemplate)[] = [
  gkSlopeSpring, gkConveyorBoard, gkBoardBlock, gkCollisionSpring,
  gkCollisionChain, gkCircularCritical, gkProjectileLoop, gkConnectedBodies,
]

export const TEMPLATES: GeoTemplate[] = FACTORIES.map((f) => f())

export function templateById(id: string): GeoTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id)
}

/** 深拷贝模板元件（载入画布用，避免污染模板定义） */
export function instantiate(id: string): GeoElement[] | null {
  const t = templateById(id)
  if (!t) return null
  const els = JSON.parse(JSON.stringify(t.elements)) as GeoElement[]
  return els
}
