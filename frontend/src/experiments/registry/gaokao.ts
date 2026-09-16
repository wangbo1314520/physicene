/**
 * 高考 / 竞赛题层（B9–B11）：20 个场景，独立于教材 55 卡台账（layer: 'gaokao'）
 * 场景 1 板块模型随 v3.0 方案书首轮交付；其余 19 个按 B11 逐个接入（available:false 占位，用于题型覆盖对账）
 */
import type { Component } from 'vue'
import type { ExperimentModule } from '../core/types'
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
    { id: 'conclude', title: '写出解题思路', goal: '按“过程—受力—规律—临界—结果”写出本题的完整思路', hint: '可用「AI 讲解」核对每一步（B10 上线后）', scoreWeight: 3 },
  ]
}

const planned = (id: string, name: string, chapter: string, dimension: '2.5D' | '3D', tags: string[], book: string): ExperimentModule => ({
  id, name, book, chapter, dimension, summary: tags.join(' · '), available: false, batch: 'B11', layer: 'gaokao', tags,
  steps: gkSteps('搭场景 → 调参数 → 观察多过程 → 找临界'),
})

const MECH = '高考·力学综合（纯 2.5D）', EM = '高考·电磁综合（纯 3D）', COMP = '竞赛扩展'

export const GAOKAO: ExperimentModule[] = [
  {
    id: 'gk-board-block',
    name: '平板小车 + 滑块碰撞（板块模型）',
    book: MECH, chapter: '1 动量守恒 · 摩擦 · 相对位移 · 能量损失', dimension: '2.5D',
    summary: '滑块冲上木板 / 子弹撞入滑块 / 木板获得初速：相对滑动→共速或脱离；时间轴、能量条、临界板长。',
    available: true, batch: 'B11', layer: 'gaokao',
    tags: ['动量守恒', '摩擦力做功', '相对位移', '能量损失', '临界板长', '多过程'],
    component: GkBoardBlock as unknown as Component,
    steps: gkSteps('选起始方式（冲上/子弹/板获初速）→ 调 m、M、μ、v₀、L → ▶ 开始 → 看时间轴从“相对滑动”切到“共速”或“脱离”'),
  },
  {
    id: 'gk-projectile-loop', name: '小球平抛 + 竖直圆周', book: MECH, chapter: '2 平抛 · 临界速度 √(gR) · 最高点条件', dimension: '2.5D',
    summary: '平台平抛→落点切入竖直圆轨道→最高点临界（绳/内轨 N≥0，杆/外轨 v≥0）→脱离角与临界高度；含 AI 解题讲解。',
    available: true, batch: 'B11', layer: 'gaokao', tags: ['平抛', '机械能守恒', '最高点临界', '绳/内轨 vs 杆/外轨', '脱离角'],
    component: GkProjectileLoop as unknown as Component,
    steps: gkSteps('选绳/杆模型 → 调 v₀、h、R → ▶ 开始 → 看时间轴上“过最高点 / 脱离 / 折返”事件 → 用讲解器核对 √(5gR) 与 2√(gR)'),
  },
  { id: 'gk-slope-spring', name: '斜面 + 弹簧 + 滑块', book: MECH, chapter: '3 能量守恒 · 弹性势能 · 临界脱离', dimension: '2.5D',
    summary: '滑块沿粗糙斜面下滑压缩底部弹簧并回弹：动能/重力势能/弹性势能/摩擦热四条能量条；最大压缩与回弹高度对照理论。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['能量守恒', '弹性势能', '摩擦生热', '临界（μ ≥ tanθ 静止）'], component: GkSlopeSpring as unknown as Component,
    steps: gkSteps('调 θ、μ、k、L₀ → ▶ 开始 → 看时间轴：下滑→压缩→回弹→上滑；μ=0 时应回到原高度') },
  { id: 'gk-conveyor-board', name: '传送带 + 物块 / 板块（模型 30）', book: MECH, chapter: '4 摩擦力方向 · 相对运动 · 热量', dimension: '2.5D',
    summary: '水平/倾斜传送带与粗糙地面上的板块三种搭法：相对滑动→共速→（μ<tanθ 继续下滑）；划痕=相对位移，Q=f·Δs。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['摩擦力方向', '相对位移', '摩擦生热', '共速判据', '板块三阶段'], component: GkConveyorBoard as unknown as Component,
    steps: gkSteps('选搭法 → 设 v₀、v_带、μ、θ、L → ▶ 开始 → 看共速时刻与划痕长度，对照 Δs=(Δv)²/(2μg)') },
  { id: 'gk-connected-bodies', name: '连接体 + 滑轮（整体法 / 隔离法，模型 21）', book: MECH, chapter: '5 牛顿定律 · 系统加速度 · 绳张力', dimension: '2.5D',
    summary: '水平面 F 拉 A-B / 斜面+定滑轮 / 动滑轮三种搭法；力传感器显示绳张力、加速度传感器显示 a；B 落地后绳松弛的第二阶段。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['整体法', '隔离法', '绳张力', '动滑轮 a_B=a_A/2', '绳松弛'], component: GkConnectedBodies as unknown as Component,
    steps: gkSteps('选搭法 → 调 m₁、m₂、F/θ、μ → ▶ 开始 → 读传感器 a、T，与整体法/隔离法结果对照') },
  { id: 'gk-collision-spring', name: '碰撞 + 弹簧（模型 29）', book: MECH, chapter: '6 动量守恒 · 弹性碰撞 · 最大压缩', dimension: '2.5D',
    summary: 'A 撞连弹簧的 B / A、B 夹压缩弹簧释放：共速即最大压缩，恢复原长即分离；动量、能量条实时守恒。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['动量守恒', '最大压缩=共速', '弹性碰撞公式', '能量分配'], component: GkCollisionSpring as unknown as Component,
    steps: gkSteps('选搭法 → 调 m₁、m₂、v₁、k → ▶ 开始 → 记录最大压缩与分离速度，对照 x_m 与弹性碰撞公式') },
  { id: 'gk-circular-critical', name: '圆周运动 + 绳/杆/内轨/外轨/管道临界（模型 28）', book: MECH, chapter: '7 绳临界 vs 杆临界 · 管道双临界', dimension: '2.5D',
    summary: '五类约束在同一圆周上对比：绳/内轨 N≥0（√(gR)，√(5gR)），杆/外轨/管道 v≥0（2√(gR)）；弹力矢量实时、脱离角与折返。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['最高点临界', '√(5gR) vs 2√(gR)', '脱离角', '管道双临界'], component: GkCircularCritical as unknown as Component,
    steps: gkSteps('选类型 → 调 R、v₀ → ▶ 开始 → 看最高点弹力与是否脱离/折返；把 v₀ 调到临界值附近验证') },
  { id: 'gk-collision-chain', name: '多体碰撞链', book: MECH, chapter: '8 动量守恒 · 能量分配', dimension: '2.5D',
    summary: '2–5 个球的碰撞链，质量相等/递增/递减，恢复系数 0–1：逐次碰撞事件、总动量守恒、动能损失；等质量弹性=牛顿摆。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['两体碰撞公式', '恢复系数', '速度传递', '二次碰撞'], component: GkCollisionChain as unknown as Component,
    steps: gkSteps('选个数与质量分布、e → ▶ 开始 → 看每次碰撞后的速度与能量条；e=1 等质量时末球得到 v₀') },
  { id: 'gk-isochrone', name: '等时圆：多弦同时到达（模型 22）', book: MECH, chapter: '9 弦长 2Rcosα · a=gcosα · t=√(4R/g) 与弦无关', dimension: '2.5D',
    summary: '从圆最高点沿多条光滑弦同时释放：弦长与加速度同比例缩小，全部同时到达圆周（t=√(4R/g)）；虚线对照轨更长、明显迟到。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['等时圆', 'cosα 消去', '光滑弦', '对照轨', 'v3.1'], component: GkIsochrone as unknown as Component,
    steps: gkSteps('调 R → ▶ 开始 → 看各球到达时刻（全等于 √(4R/g)）→ 对照轨更晚到 → 调 R 验证 t 只依赖 R') },
  { id: 'gk-clothesline', name: '晾衣绳动态平衡（模型 23）', book: MECH, chapter: '10 共点力平衡 · T=mg/(2cosα) 与杆高无关 · 拉断判据', dimension: '2.5D',
    summary: '绳两端挂杆、衣服居中：①拉开两杆 d 增大 → sinα=d/L 增大、cosα 减小 → T 增大；②同步降杆验证张力与杆高无关；③继续拉到 T>T_max 绳断 → ④自由落体。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['共点力平衡', 'sinα=d/L', '与杆高无关', '断绳临界', 'v3.1'], component: GkClothesline as unknown as Component,
    steps: gkSteps('调 L、m、T_max、d₀ → ▶ 开始 → 看 T 条随 d 增长；阶段②降杆观察 T 不变；对照断绳临界 d=L√(1−(mg/2T_max)²)') },
  { id: 'gk-multistage', name: '多过程直线运动 + 实时 v–t（模型 25）', book: MECH, chapter: '11 分段运动学 · v–t 面积=位移 · 往返穿轴', dimension: '2.5D',
    summary: '加速→匀速→刹车 / 加速→立即减速（三角形）/ 正向减速→反向加速（往返）三种搭法；v–t 图实时生长、分段底色、分段数据表、面积=位移。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['多过程', 'v–t 图', '面积=位移', '往返', '分段数据表', 'v3.1'], component: GkMultistage as unknown as Component,
    steps: gkSteps('选搭法 → 调 a₁、t₁、t₂、a₂/v₀ → ▶ 开始 → 盯 v–t 曲线生长与分段表；往返搭法看图线穿过 t 轴、回到 x=0') },
  { id: 'gk-impulse-micro', name: '动量定理 + 微元法（模型 31）', book: MECH, chapter: '12 I=∫Fdt=ΣF·Δt=Δp · F–t 图微元矩形', dimension: '2.5D',
    summary: '四种 F(t)（恒力/斜坡/半正弦/窄尖峰）：把作用时间切成宽 Δt 的微元矩形逐个累积 I，与 Δp=mΔv、解析 ∫Fdt 三方对照；Δt 越小误差越小。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['动量定理', '微元法', '冲量=面积', '变力', 'Δt 收敛', 'v3.1'], component: GkImpulseMicro as unknown as Component,
    steps: gkSteps('选 F(t) 形状 → 调 F₀、T、Δt → ▶ 开始 → 看绿色微元矩形逐个累积；结束后把 Δt 调小一半重跑，看误差减小') },
  {
    id: 'gk-accel-selector-b', name: '加速电场 → 速度筛选器 → 磁场', book: EM, chapter: '9 动能定理 · E/B 平衡 · 洛伦兹力', dimension: '3D',
    summary: '三区域多过程：qU=½mv² → v=E/B 才能直线通过筛选器 → 磁场中半圆 r=mv/(qB₃) 打到底片；含 AI 解题讲解。',
    available: true, batch: 'B11', layer: 'gaokao', tags: ['动能定理', 'v=E/B', '洛伦兹力', '质谱仪', '多过程'],
    component: GkAccelSelectorB as unknown as Component,
    steps: gkSteps('调 U 使 v=√(2qU/m) 等于 E/B → ▶ 播放 → 看粒子能否直线通过筛选器、磁场中半径 → 改 B₃ 看落点 2r'),
  },
  { id: 'gk-accel-deflect-screen', name: '加速电场 → 偏转电场 → 荧光屏', book: EM, chapter: '10 类平抛 · 偏转角 · 侧移', dimension: '3D',
    summary: '示波管原型：qU₁=½mv₀² 加速 → 平行板内类平抛（y₁=U₂L²/4dU₁、tanθ=U₂L/2dU₁，与比荷无关）→ 出板直线打屏 Y=y₁+D·tanθ；撞板临界 y₁>d/2。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['类平抛', '偏转角', '侧移', '反向延长线过板中点', '与比荷无关'], component: GkAccelDeflectScreen as unknown as Component,
    steps: gkSteps('调 U₁、U₂、L、D → ▶ 播放 → 看出板时的 y₁、θ 与屏上 Y 是否与理论一致；调大 U₂ 直到撞板') },
  { id: 'gk-b-then-e', name: '磁场 → 电场组合', book: EM, chapter: '11 圆周 + 类平抛切换', dimension: '3D',
    summary: '先磁后电：有界磁场中 r=mv/(qB)，r>W 以 sinθ=W/r 穿出（出射点上移 r(1−cosθ)），进入竖直电场类平抛打屏；r≤W 转半圆折返。', available: true, batch: 'B11', layer: 'gaokao',
    tags: ['圆周运动', '类平抛', '过程切换', '穿出条件 r>W', '偏转角 sinθ=W/r'], component: GkBThenE as unknown as Component,
    steps: gkSteps('调 v、B 使 r>W 或 r≤W → ▶ 播放 → 看穿出角 θ 与出射点；调 E 看屏上落点变化') },
  planned('gk-cyclotron', '回旋加速器', '12 交变电场 · 最大动能 · 周期', '3D', ['交变电场', '最大动能', '周期'], EM),
  planned('gk-mass-spectrometer', '质谱仪', '13 加速 · 筛选 · 偏转 · 质量分辨', '3D', ['加速', '速度筛选', '偏转', '质量分辨'], EM),
  planned('gk-rail-rod', '电磁感应 + 导轨 + 导体棒', '14 楞次 · 安培力 · 动量 · 能量', '3D', ['楞次定律', '安培力', '动量', '能量'], EM),
  planned('gk-transformer-transmission', '变压器 + 远距离输电', '15 匝数比 · 功率 · 损耗', '3D', ['匝数比', '功率', '线路损耗'], EM),
  planned('gk-composite-field', '带电粒子在复合场中', '16 重力 + 电场 + 磁场平衡', '3D', ['复合场', '平衡', '匀速圆周'], EM),
  planned('gk-variable-force', '变力作用下的运动', '17 积分 · 微元', '2.5D', ['微元法', '积分'], COMP),
  planned('gk-coupled-dof', '多自由度耦合', '18 拉格朗日思想', '2.5D', ['多自由度', '拉格朗日'], COMP),
  planned('gk-noninertial', '非惯性系 + 惯性力', '19 相对运动', '2.5D', ['非惯性系', '惯性力'], COMP),
  planned('gk-induction-circuit-mech', '电磁感应 + 电路 + 力学耦合', '20 微分方程', '3D', ['电磁感应', '电路', '微分方程'], COMP),
]
