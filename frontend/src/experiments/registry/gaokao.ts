/**
 * 高考 / 竞赛题层（B9–B11）：以 v3.1 §7.1 的 50 场景总清单（gaokao-plan.ts）为骨架，
 * 已上线场景在 LIVE 中挂组件与操作提示，其余按清单自动生成占位卡（available:false，用于题型覆盖对账）。
 * 同一物理模型对应两个清单编号时（4/30、5/21、6/29、7/28）共用一个场景组件。
 */
import type { Component } from 'vue'
import type { ExperimentModule } from '../core/types'
import { PLAN50 } from './gaokao-plan'
import GkBoardBlock from '../defs/gaokao/GkBoardBlock.vue'
import GkProjectileLoop from '../defs/gaokao/GkProjectileLoop.vue'
import GkAccelSelectorB from '../defs/gaokao/GkAccelSelectorB.vue'
import { GkSlopeSpring, GkConveyorBoard, GkConnectedBodies, GkCollisionSpring, GkCircularCritical, GkCollisionChain, GkIsochrone, GkClothesline, GkMultistage, GkImpulseMicro } from '../defs/gaokao/mechWrappers'
import { GkAccelDeflectScreen, GkBThenE } from '../defs/gaokao/emWrappers'

function gkSteps(operateHint: string): ExperimentModule['steps'] {
  return [
    { id: 'read', title: '识别题型与过程', goal: '看清场景由哪些过程组成、每个过程受什么力', hint: '阅读左侧说明与公式，想清楚“先发生什么、后发生什么”' },
    { id: 'operate', title: '搭场景、调参数、观察多过程', goal: '运行一次，盯住时间轴上的过程切换点（临界）', hint: operateHint, scoreWeight: 2 },
    {
      id: 'record', title: '记录临界数据并对照理论',
      goal: '把仿真得到的临界量（共速/脱离/最高点…）与公式结果对照',
      hint: '点「📏 记录当前数据」或等待过程切换自动记录',
      check: (ctx) => ctx.lastEvent?.type === 'data-recorded',
      errorHints: { default: '先运行到出现过程切换（共速/脱离），或点记录按钮' },
      scoreWeight: 3,
    },
    { id: 'conclude', title: '写出解题思路', goal: '按“过程—受力—规律—临界—结果”写出本题的完整思路', hint: '可用「AI 讲解」逐段核对', scoreWeight: 3 },
  ]
}

interface Live { component: unknown; summary: string; hint: string }
const LIVE: Record<string, Live> = {
  'gk-board-block': { component: GkBoardBlock, summary: '滑块冲上木板 / 子弹撞入滑块 / 木板获得初速：相对滑动→共速或脱离；时间轴、能量条、临界板长。', hint: '选起始方式 → 调 m、M、μ、v₀、L → ▶ 开始 → 看时间轴从“相对滑动”切到“共速”或“脱离”' },
  'gk-projectile-loop': { component: GkProjectileLoop, summary: '平台平抛→落点切入竖直圆轨道→最高点临界（绳/内轨 N≥0，杆/外轨 v≥0）→脱离角与临界高度。', hint: '选绳/杆模型 → 调 v₀、h、R → ▶ 开始 → 看“过最高点 / 脱离 / 折返”事件 → 核对 √(5gR) 与 2√(gR)' },
  'gk-slope-spring': { component: GkSlopeSpring, summary: '滑块沿粗糙斜面下滑压缩底部弹簧并回弹：动能/重力势能/弹性势能/摩擦热四条能量条；最大压缩与回弹高度对照理论。', hint: '调 θ、μ、k、L₀ → ▶ 开始 → 看下滑→压缩→回弹→上滑；μ=0 时应回到原高度' },
  'gk-conveyor-board': { component: GkConveyorBoard, summary: '水平/倾斜传送带上的物块：相对滑动→共速→（μ<tanθ 继续下滑）；划痕=相对位移，Q=f·Δs。', hint: '选水平/倾斜搭法 → 设 v₀、v_带、μ、θ → ▶ 开始 → 看共速时刻与划痕长度，对照 Δs=(Δv)²/(2μg)' },
  'gk-m30-conveyor-board': { component: GkConveyorBoard, summary: '模型 30 板块搭法：粗糙地面上的平板车 + 滑块，滑块摩擦力驱动板、地面摩擦力阻碍板——三阶段判据与相对位移、Q=f·Δs。', hint: '选“板块 + 粗糙地面”搭法 → 调 m、M、μ₁、μ₂、v₀ → ▶ 开始 → 看板是否启动、是否共速、相对位移' },
  'gk-connected-bodies': { component: GkConnectedBodies, summary: '水平面 F 拉 A-B / 斜面+定滑轮 / 动滑轮三种搭法；力传感器显示绳张力、加速度传感器显示 a；B 落地后绳松弛的第二阶段。', hint: '选搭法 → 调 m₁、m₂、F/θ、μ → ▶ 开始 → 读传感器 a、T，与整体法/隔离法结果对照' },
  'gk-m21-whole-isolate': { component: GkConnectedBodies, summary: '模型 21：整体法求 a=F/(m₁+m₂)、隔离法求内力 T=m₂F/(m₁+m₂)（光滑）；有摩擦时 T=m₂(a+μg)；绳松弛临界 T=0。', hint: '用“水平面 F 拉 A-B”搭法 → 先设 μ=0 验证 T=m₂F/(m₁+m₂) → 再加 μ 看整体/隔离方程' },
  'gk-collision-spring': { component: GkCollisionSpring, summary: 'A 撞连弹簧的 B / A、B 夹压缩弹簧释放：共速即最大压缩，恢复原长即分离；动量、能量条实时守恒。', hint: '选搭法 → 调 m₁、m₂、v₁、k → ▶ 开始 → 记录最大压缩与分离速度，对照 x_m 与弹性碰撞公式' },
  'gk-m29-collision-spring': { component: GkCollisionSpring, summary: '模型 29 组合题：碰撞瞬间动量守恒 → 弹簧压缩阶段动量+能量守恒 → 共速时最大压缩 → 分离速度即弹性碰撞结果。', hint: '搭法① → 调 m₁/m₂ 比 → ▶ 开始 → 分别验证 m₁<m₂ 反弹、m₁=m₂ 交换速度、m₁>m₂ 同向' },
  'gk-circular-critical': { component: GkCircularCritical, summary: '绳系小球与杆系小球对比：绳最高点 N≥0（√(gR)，最低点 √(5gR)），杆 v≥0（2√(gR)）；弹力矢量实时、脱离角与折返。', hint: '选绳/杆 → 调 R、v₀ → ▶ 开始 → 看最高点弹力与是否脱离/折返；把 v₀ 调到临界值附近验证' },
  'gk-m28-circular-five': { component: GkCircularCritical, summary: '模型 28 五类约束同一圆周对比：绳/内轨（N≥0）、杆/外轨（v≥0）、管道（双壁双临界）；弹力方向随速度翻转。', hint: '依次选内轨、外轨、管道 → 同一 v₀ 对比最高点弹力符号与是否脱离' },
  'gk-collision-chain': { component: GkCollisionChain, summary: '2–5 个球的碰撞链，质量相等/递增/递减，恢复系数 0–1：逐次碰撞事件、总动量守恒、动能损失；等质量弹性=牛顿摆。', hint: '选个数与质量分布、e → ▶ 开始 → 看每次碰撞后的速度与能量条；e=1 等质量时末球得到 v₀' },
  'gk-isochrone': { component: GkIsochrone, summary: '从圆最高点沿多条光滑弦同时释放：弦长与加速度同比例缩小，全部同时到达圆周（t=√(4R/g)）；虚线对照轨更长、明显迟到。', hint: '调 R → ▶ 开始 → 看各球到达时刻（全等于 √(4R/g)）→ 对照轨更晚到 → 调 R 验证 t 只依赖 R' },
  'gk-clothesline': { component: GkClothesline, summary: '绳两端挂杆、衣服居中：①拉开两杆 d 增大 → sinα=d/L 增大 → T=mg/(2cosα) 增大；②同步降杆验证张力与杆高无关；③继续拉到 T>T_max 绳断 → ④自由落体。', hint: '调 L、m、T_max、d₀ → ▶ 开始 → 看 T 条随 d 增长；阶段②降杆观察 T 不变；对照断绳临界 d=L√(1−(mg/2T_max)²)' },
  'gk-multistage': { component: GkMultistage, summary: '加速→匀速→刹车 / 加速→立即减速（三角形）/ 正向减速→反向加速（往返）三种搭法；v–t 图实时生长、分段底色、分段数据表、面积=位移。', hint: '选搭法 → 调 a₁、t₁、t₂、a₂/v₀ → ▶ 开始 → 盯 v–t 曲线生长与分段表；往返搭法看图线穿过 t 轴、回到 x=0' },
  'gk-impulse-micro': { component: GkImpulseMicro, summary: '四种 F(t)（恒力/斜坡/半正弦/窄尖峰）：把作用时间切成宽 Δt 的微元矩形逐个累积 I，与 Δp=mΔv、解析 ∫Fdt 三方对照；Δt 越小误差越小。', hint: '选 F(t) 形状 → 调 F₀、T、Δt → ▶ 开始 → 看绿色微元矩形逐个累积；结束后把 Δt 调小一半重跑，看误差减小' },
  'gk-accel-selector-b': { component: GkAccelSelectorB, summary: '三区域多过程：qU=½mv² → v=E/B 才能直线通过筛选器 → 磁场中半圆 r=mv/(qB₃) 打到底片。', hint: '调 U 使 v=√(2qU/m) 等于 E/B → ▶ 播放 → 看粒子能否直线通过筛选器、磁场中半径 → 改 B₃ 看落点 2r' },
  'gk-accel-deflect-screen': { component: GkAccelDeflectScreen, summary: '示波管原型：qU₁=½mv₀² 加速 → 平行板内类平抛（y₁=U₂L²/4dU₁、tanθ=U₂L/2dU₁，与比荷无关）→ 出板直线打屏 Y=y₁+D·tanθ；撞板临界 y₁>d/2。', hint: '调 U₁、U₂、L、D → ▶ 播放 → 看出板时的 y₁、θ 与屏上 Y 是否与理论一致；调大 U₂ 直到撞板' },
  'gk-b-then-e': { component: GkBThenE, summary: '先磁后电：有界磁场中 r=mv/(qB)，r>W 以 sinθ=W/r 穿出（出射点上移 r(1−cosθ)），进入竖直电场类平抛打屏；r≤W 转半圆折返。', hint: '调 v、B 使 r>W 或 r≤W → ▶ 播放 → 看穿出角 θ 与出射点；调 E 看屏上落点变化' },
}

export const GAOKAO: ExperimentModule[] = PLAN50.map((pl) => {
  const live = LIVE[pl.id]
  return {
    id: pl.id, name: pl.name, book: pl.book, chapter: `#${pl.n} ${pl.name.replace(/（模型 \d+）$/, '')}`, dimension: pl.dim,
    summary: live?.summary ?? `${pl.prio} · ${pl.tags.join(' · ')}（B11 规划中）`,
    available: !!live, batch: 'B11', layer: 'gaokao', tags: [...pl.tags, pl.prio],
    component: live?.component as Component | undefined,
    steps: gkSteps(live?.hint ?? '搭场景 → 调参数 → 观察多过程 → 找临界'),
  }
})

/** 题型覆盖对账：已上线 / 总数（按 v3.1 编号） */
export const gaokaoCoverage = () => ({ live: GAOKAO.filter((e) => e.available).length, total: GAOKAO.length })
