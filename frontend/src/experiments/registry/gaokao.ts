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
import { GkSlopeSpring, GkConveyorBoard, GkConnectedBodies, GkCollisionSpring, GkCircularCritical, GkCollisionChain, GkIsochrone, GkClothesline, GkMultistage, GkImpulseMicro, GkPrismRefraction, GkWaveMultiSolution, GkVibrationWaveGraphs, GkPhotoelectricEkNu, GkHydrogenLevels, GkObliqueProjectile, GkWeightChange, GkLiquidSealTube, GkCylinderPiston, GkVariableMassGas, GkUTube, GkThinFilm, GkDiffractionVsInterference, GkWaveSuperposition, GkNuclearReaction, GkBohrCollision, GkMatterWave, GkVariableForce, GkSmallQuantity, GkNoninertial } from '../defs/gaokao/mechWrappers'
import { GkAccelDeflectScreen, GkBThenE, GkVelocitySelector, GkMassSpectrometer, GkEBEMulti, GkCompositeField, GkCyclotron, GkRailRod, GkRodFree, GkRodForce, GkDoubleRod, GkRodCapacitor, GkVoltAmmeterResistance, GkMeterConversion, GkTransformerTransmission, GkTransformerDynamic, GkPowerTransmission, GkAcFourValues, GkBBCombo, GkFrameThroughB, GkRodInclineB, GkMhdGenerator, GkEmFlowmeter, GkHallEffect } from '../defs/gaokao/emWrappers'

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
  'gk-velocity-selector': { component: GkVelocitySelector, summary: '平行板 + 垂直磁场 + 入口/出口狭缝：E=U/d，只有 v=U/(Bd) 的粒子直线通过；三粒子对比（0.7v 撞电场力侧、1.3v 撞洛伦兹力侧）；正负电荷通过条件相同。', hint: '设 U、d、B 算出 v₀=U/(Bd) → 把 v 调到 v₀ → ▶ 播放 → 中间粒子直线通过、两侧粒子分别撞板；切换负电荷再验证' },
  'gk-mass-spectrometer': { component: GkMassSpectrometer, summary: '两种同位素同 q 不同 m 经同一 U 加速 → 狭缝 → 磁场半圆 → 底片：r=√(2mU/q)/B，落点 2r，谱线间距 Δx=2(r₂−r₁)；底片带刻度。', hint: '调 U、B、m₁、m₂ → ▶ 播放 → 看两离子先后到达底片的位置与 Δx；减小 B 看分辨率提高' },
  'gk-e-b-e-multi': { component: GkEBEMulti, summary: '电场区加速 → 磁场半圆 → 反向回电场区减速到零 → 再加速……每周期上移 2r 的阶梯往复；三段用时分别为 2L/v、πm/(qB)、2L/v。', hint: '调 U、B、周期数 → ▶ 播放 → 看时间轴“加速→半圆→减速”循环与每周期上移 2r' },
  'gk-composite-field': { component: GkCompositeField, summary: '重力 + 竖直电场 + 垂直磁场：①qE+qvB=mg 匀速直线 ②qE=mg 匀速圆周（T 与 v 无关）③E=0 摆线（漂移 v_d=mg/qB、最低点深度 2g/(qB/m)²）④自定义。', hint: '选情形 → 调 v、B、q/m → ▶ 播放 → 圆周情形记录周期 T 与 2πm/(qB) 对照；摆线情形看最低点深度' },
  'gk-cyclotron': { component: GkCyclotron, summary: 'D₁/D₂ 形盒 + 同步交变缝隙电压：每次穿越 +qU、半径增大、周期不变；到边缘 R 引出，E_k,max=q²B²R²/2m 与 U 无关，U 只改变穿越次数 N。', hint: '调 U、B、R → ▶ 播放 → 数穿越次数与理论 N=E_k/qU 对照；把 U 加倍看 N 减半而引出能量不变' },
  'gk-rail-rod': { component: GkRailRod, summary: '平行导轨 + 竖直磁场 + 导体棒（电阻/电容/双杆四种搭法 = 模型 38–41）：E=BLv、I、安培力 B²L²v/R 实时箭头；动量定理求位移、终速、共速、含容匀加速。', hint: '选搭法 → 调 B、L、R、m、v₀/F → ▶ 播放 → 看电流/速度箭头与事件里的理论对照' },
  'gk-rod-free': { component: GkRodFree, summary: '模型 38：棒以 v₀ 滑行、回路接 R，安培力 B²L²v/R 使其指数减速；动量定理 x=mv₀R/(B²L²)，q=BLx/R，Q=½mv₀²；可加导轨摩擦。', hint: '默认搭法 38 → ▶ 播放 → 停止后核对 x、q、Q 三个理论值；加 μ 观察能停下且 x 变小' },
  'gk-rod-force': { component: GkRodForce, summary: '模型 39：恒力 F 拉棒由静止加速，安培力随 v 增大直到 F=B²L²v/R+μmg → 终速 v_m=(F−μmg)R/(B²L²)；稳态 Fv_m=I²R+μmgv_m。', hint: '默认搭法 39 → ▶ 播放 → 看 v 趋近 v_m 的过程与稳态功率平衡；改 R 看 v_m 正比于 R' },
  'gk-double-rod': { component: GkDoubleRod, summary: '模型 40：棒 1 以 v₀ 运动、棒 2 静止，同一回路电流使两棒受等大反向安培力 → 动量守恒共速 v=m₁v₀/(m₁+m₂)，焦耳热 Q=ΔE_k。', hint: '默认搭法 40 → ▶ 播放 → 共速事件核对 v_共 与 Q；改 m₂ 看能量分配比 m₂/(m₁+m₂)' },
  'gk-rod-capacitor': { component: GkRodCapacitor, summary: '模型 41：恒力 F 拉棒、回路接电容 C：q=CBLv → i=CBLa 恒定，F−BiL=ma → a=F/(m+CB²L²) 匀加速（与电阻回路的终速不同）。', hint: '默认搭法 41 → ▶ 播放 → t=2 s 事件核对 v=at 与 q=CBLv；把 C 调到最小对比 a→F/m' },
  'gk-prism-refraction': { component: GkPrismRefraction, summary: '平行玻璃砖（出射平行、侧移 d）/ 三棱镜（两次折射偏向角 δ=θ₁+θ₄−A，右面可全反射）/ 半圆砖（沿半径入射、圆心处看临界角）；光线逐段生长、量角器、每个界面的角度事件。', hint: '选搭法 → 调 n、θ₁、A → ▶ 开始 → 看每个界面的折射角事件；棱镜把 θ₁ 调小直到右面全反射；半圆砖把 θ₁ 调过 C' },
  'gk-wave-multi-solution': { component: GkWaveMultiSolution, summary: '实线 t₁ 波形与虚线 t₂ 波形：方向与整波长数不定 → Δx=nλ+Δx₀（+x）或 nλ+(λ−Δx₀)（−x）；选定假设后播放，t=Δt 时波形应与虚线重合；解集表列出 n=0–3 全部 v。', hint: '选方向与 n → ▶ 开始 → t=Δt 时看波形是否与虚线重合；换另一方向再验证一次多解' },
  'gk-vibration-wave-graphs': { component: GkVibrationWaveGraphs, summary: '左 y–x 波动图像随时间平移，右 P 点 y–t 振动图像随时间生长；同侧法判断 P 的运动方向；首次到波峰时刻与 v=λ/T 事件。', hint: '调 λ、T、方向、x_P → ▶ 开始 → 对照两张图：左图读 λ、右图读 T；看 P 首次到达波峰的时刻' },
  'gk-photoelectric-ek-nu': { component: GkPhotoelectricEkNu, summary: '光电管动画（光子按频率着色、光电子按 Eₖ 速度飞向阳极）+ 自动扫频作 Eₖ–ν 图：横截距 ν₀、纵截距 −W₀、斜率 h；五种阴极材料；扫频结束拟合直线核对 h 与 W₀。', hint: '选材料 → ▶ 开始 → 看 ν 越过 ν₀ 才出现光电子；结束后核对拟合斜率≈0.414（h）与截距 −W₀；换材料看图线平行' },
  'gk-hydrogen-levels': { component: GkHydrogenLevels, summary: '氢原子能级图（Eₙ=−13.6/n²）+ 电子跃迁动画 + 光子波包按波长着色飞向光谱屏；单次 m→n 或大量原子处于 m 能级全部向下跃迁，谱线条数 C(m,2)、可见光条数。', hint: '单次模式设 3→2 看 656 nm 红光；切到“大量原子 m=4”看 6 条谱线并数可见光条数' },
  'gk-oblique-projectile': { component: GkObliqueProjectile, summary: '以 v₀、θ（可从高度 h₀）斜抛：水平匀速、竖直上抛分解，速度分量箭头实时；最高点与落地事件对照理论；可叠加余角 90°−θ 对照体验证等射程。', hint: '调 v₀、θ → ▶ 开始 → 看最高点 H、射程 R 事件；开对照抛体看 θ 与 90°−θ 射程相同、45° 最远' },
  'gk-weight-change': { component: GkWeightChange, summary: '电梯上升/下降全过程（加速→匀速→减速）或缆绳断裂：体重计读数 N=m(g±a)、匀速 N=mg、自由下落 N=0；右侧 N–t 图分超重/失重区。', hint: '选过程 → ▶ 开始 → 看每段 N 与 mg 的大小关系；注意减速下降是超重、减速上升是失重' },
  'gk-liquid-seal-tube': { component: GkLiquidSealTube, summary: '汞柱封闭空气柱：开口向上 p=p₀+h / 向下 p=p₀−h；升温等压（L∝T）或缓慢转动等温（pL 不变）；状态板实时显示 p、L、T 与 pL/T 守恒。', hint: '选过程 → ▶ 开始 → 看 L 随 T 或随转角变化；核对 pL/T 恒定与末态理论值' },
  'gk-cylinder-piston': { component: GkCylinderPiston, summary: '竖直/水平汽缸：活塞受力图（Mg、p₀S、pS、F）→ p=p₀+Mg/S+F/S；加热等压或加力等温，活塞随之移动。', hint: '选过程 → ▶ 开始 → 看活塞位置与状态板；切换水平汽缸看重力不再参与' },
  'gk-variable-mass-gas': { component: GkVariableMassGas, summary: '打气筒往容器打气 / 从容器抽气：分子点数与压力表随次数变化，p–n 图线性（打气）或等比（抽气）；等效总体积法 p₀(V+nV₀)=pₙV。', hint: '设 V、V₀、n → ▶ 开始 → 每次冲程后读 p；对照 p–n 图与公式' },
  'gk-u-tube': { component: GkUTube, summary: '左封右开的 U 形管：p=p₀+Δh；升温或向右臂注汞时两液面联动（一降 x 一升 x），气柱长与液面差同时变化，解二次方程得 x 并动画到位。', hint: '设 Δh₀、L₁、T₂/Δ → ▶ 开始 → 看液面移动到 x 目标值；核对末态 p₂L₂/T₂=p₁L₁/T₁' },
  'gk-thin-film': { component: GkThinFilm, summary: '空气劈尖等厚干涉：侧视两束反射光与半波损失、俯视条纹随探针扫描逐级点亮；Δd=λ/2n、Δx=λ/(2nα)，棱边暗纹。', hint: '调 λ、α、n → ▶ 开始 → 看探针经过各级亮纹的事件与条纹间距；α 增大条纹变密' },
  'gk-diffraction-vs-interference': { component: GkDiffractionVsInterference, summary: '同屏对比双缝干涉与单缝衍射：光子逐个随机落屏、统计直方图逼近理论光强曲线；Δx=Lλ/d 等间距 vs 中央亮纹 2Lλ/a 最宽最亮。', hint: '▶ 开始 → 看条纹从噪声中显现；调 d、a、λ 对照间距与中央宽度公式' },
  'gk-wave-superposition': { component: GkWaveSuperposition, summary: '双相干源水波叠加热图实时演化，加强/减弱双曲线族叠加显示；探针 P 的 Δr 与 λ 的关系给出加强/减弱判断；同相/反相可切换。', hint: '移动探针 P → ▶ 开始 → 读 Δr=kλ 或 (k+½)λ 的判定；切反相看结论互换' },
  'gk-nuclear-reaction': { component: GkNuclearReaction, summary: 'α/β 衰变、聚变、裂变、人工转变五种反应：核子团接近→重组→飞离动画，A/Z 守恒计数表，真实核质量算 Δm 与 ΔE=Δmc²（931.5 MeV/u）。', hint: '选反应 → ▶ 开始 → 看计数表守恒与 ΔE；对比聚变每核子放能远大于裂变' },
  'gk-bohr-collision': { component: GkBohrCollision, summary: '入射电子（≥ 能级差即可激发、多余带走）与入射光子（必须恰好相等）撞击基态氢原子：判断能激发到 n 几、是否电离，退激发放出 C(n,2) 种光子动画。', hint: '设电子 12.5 eV 看激发到 n=3 剩余 0.41 eV；换成 12.5 eV 光子看不被吸收；调到 12.09 eV 光子被吸收' },
  'gk-matter-wave': { component: GkMatterWave, summary: '电子/质子/α 经 U 加速的德布罗意波长 λ=h/√(2mqU)（电子 1.226/√U nm），穿过晶体形成衍射环（粒子逐个到达统计成环），环半径随 U 减小。', hint: '调 U 看 λ 与环半径变化；换质子看同电压下 λ 缩小 √(1836) 倍' },
  'gk-variable-force': { component: GkVariableForce, summary: '四种 F(x)（线性/弹簧/半正弦/平方反比）作用下的物体：F–x 图微元矩形逐个累积 W=ΣF·Δx，与 ΔE_k=½mv² 及解析 ∫F dx 三方对照，Δx 越小误差越小。', hint: '选 F(x) → 调 Δx → ▶ 开始 → 看矩形累积与动能条同步增长；把 Δx 调小一半重跑' },
  'gk-small-quantity': { component: GkSmallQuantity, summary: '实摆（精确 sinθ）与简谐影子摆（T₀=2π√(L/g)）并排：幅角越大实摆越慢；右侧 T/T₀–θ₀ 曲线（精确椭圆积分 vs 级数 1+θ₀²/16），实测周期事件。', hint: '设 θ₀=5° 看两摆同步；调到 60°、120° 看影子摆逐渐领先，读 T/T₀' },
  'gk-noninertial': { component: GkNoninertial, summary: '加速车厢内的摆与光滑小球：地面系（真实力）/ 车厢系（惯性力 −ma）切换观察；摆稳定到 tanθ=a/g，光滑球相对车厢 ½at² 后退，等效重力 g′=√(g²+a²)。', hint: '先在车厢系看惯性力箭头与平衡角事件；切到地面系理解“球没动、车跑了”' },
  'gk-volt-ammeter-resistance': { component: GkVoltAmmeterResistance, summary: '3D 实验台：电源/R_x/指针式电流表电压表/导线，电流粒子流动、指针偏转；内接 vs 外接的读数与 R_测=U/I 系统误差，√(R_AR_V) 判据（大内偏大、小外偏小）。', hint: '默认外接 R_x=100 Ω → 读 R_测 偏小；切内接看偏大；把 R_x 调到 √(R_AR_V)≈55 Ω 附近比较两种误差' },
  'gk-transformer-transmission': { component: GkTransformerTransmission, summary: '发电机 → 升压变压器 → 输电线（r）→ 降压变压器 → 用户 的 3D 链路，电流粒子按各段电流快慢流动、用户灯按效率发光；对比升压输电与直接输电的损耗（1/k²）。', hint: '默认“对比”搭法 → ▶ 播放 → 看两条事件：升压后线路电流、损耗、用户电压；把 k 从 10 调到 1 观察灯变暗' },
  'gk-transformer-dynamic': { component: GkTransformerDynamic, summary: '模型 45：铁芯 + 原副线圈 + 交流源 + 负载 R，U₂ 由匝数比决定、I₂ 由负载决定、I₁ 随 I₂ 变（原边随副边）、P₁=P₂；原副边电流粒子流速对应电流大小。', hint: '调 n₂ 看 U₂ 变化；调 R 看 I₂、I₁ 同时变而 U₂ 不变；核对 P₁=P₂' },
  'gk-power-transmission': { component: GkPowerTransmission, summary: '模型 46：I=P/(kU)、P_损=I²r、ΔU=Ir、用户电压 (kU−Ir)/k 与效率 η；调升压比 k、线路电阻 r、发电功率 P 观察损耗与用户电压。', hint: '调 k 看损耗按 1/k² 下降；调 r 看 ΔU 与 P_损 线性/平方增长' },
  'gk-ac-four-values': { component: GkAcFourValues, summary: '矩形线圈在 B 中匀速转动（慢放）：滑环电刷输出到灯泡，e–t 曲线板实时生长；峰值 NBSω、有效值 /√2、半周期平均值 2E_m/π、瞬时值；中性面与平行位置事件。', hint: '▶ 播放 → 看线圈过中性面时 e=0、灯最暗；过平行位置 e=E_m；读四个值并对应用途（耐压/热量/电荷量/方向）' },
  'gk-b-b-combo': { component: GkBBCombo, summary: '两区反向磁场 S 形轨迹 / 同向不等磁场半径突变 / 圆形磁场 r=R 磁聚焦（同一点五个方向射入全部平行射出）；过边界速率不变、半径按 B 反比。', hint: '默认磁聚焦 → ▶ 播放 → 五条轨迹平行射出；切到反向两区看 S 形，同向两区看半径突变' },
  'gk-frame-through-b': { component: GkFrameThroughB, summary: '矩形线框滑向磁场区：进入（前边切割减速）→ 完全在内（无电流匀速）→ 穿出（后边切割反向电流）五阶段；i–t 板实时；Δv=B²L²a/(mR)、q=BLa/R 与速度无关。', hint: '▶ 播放 → 看三段速度 4→3→2 与 i–t 脉冲；切到“恒外力维持匀速”看 i 变方波' },
  'gk-rod-incline-b': { component: GkRodInclineB, summary: '倾斜导轨（可选 B 垂直斜面 / 竖直）上的导体棒由静止释放：mg sinθ 与安培力竞争到终速 v_m=mgR sinθ/(B²L²)（竖直 B 多 1/cos²θ）；稳态重力功率=焦耳热功率。', hint: '▶ 播放 → 看 v 趋近 v_m 与稳态功率平衡；切 B 竖直看有效切割变 BL cosθ' },
  'gk-mhd-generator': { component: GkMhdGenerator, summary: '等离子体通道 + 竖直磁场 + 两侧极板：正负离子被洛伦兹力分向两极板（粒子动画），稳态 E=Bdv；含内阻 r 的外电路电流、输出功率与 R=r 最大输出。', hint: '调 B、v、d 看 E=Bdv；调 R 找输出功率最大点 R=r' },
  'gk-em-flowmeter': { component: GkEmFlowmeter, summary: '导电液体流过带磁场的绝缘管，管壁电极测得 U=BDv，换算流速与流量 Q=πD²v/4；离子横向分离动画、电压表读数随 v 线性。', hint: '调 v 看 U 线性变化；调 D、B 验证 v=U/(BD) 与 Q 公式' },
  'gk-hall-effect': { component: GkHallEffect, summary: '通电薄片 + 垂直磁场：电子/空穴漂移方向相反但被推到同一侧面，霍尔电压 U_H=BI/(nqd) 极性相反 → 判断载流子类型；n 从金属到半导体跨 6 个量级看 U_H 变化。', hint: '切换电子/空穴看极性反转；把 n 调到 0.001（半导体量级）看 U_H 从 μV 到 mV' },
  'gk-meter-conversion': { component: GkMeterConversion, summary: '灵敏电流计 G 改装：并联 R_并=I_gR_g/(I−I_g) 成电流表（粒子流分流可见）或串联 R_串=U/I_g−R_g 成电压表；输入信号按量程比例输入，表头偏转比例一致（线性刻度）。', hint: '选改装类型 → 调 I_g、R_g、量程 → 调“输入/量程”滑杆看指针偏转比例是否一致 → 读改装后内阻' },
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
