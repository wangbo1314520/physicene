/**
 * 统一几何搭建台：GeoElement 模型（方案 §2.1）+ 锚点模板（§2.2）+ 元件目录（§2.3）
 * 37 个几何类型（role 标注求解归属）+ 28 个装置类型（device，参数化面板）
 */
import type { Component } from 'vue'

export type Dim = '2D' | '2.5D' | '3D'
export type Domain = 'mech' | 'em' | 'heat' | 'optics' | 'modern' | 'util'
export type Role = 'body' | 'constraint' | 'field' | 'circuit' | 'thermal' | 'optic' | 'device' | 'detector' | 'display'

export interface ParamSpec {
  key: string; label: string; min: number; max: number; step: number; default: number; unit?: string
  options?: { value: number; label: string }[]
}

/** 元件目录条目 */
export interface ElementSpec {
  type: string; label: string; icon: string; domain: Domain; dims: Dim[]; color: string
  desc: string; params: ParamSpec[]; role: Role; tags: string[]
  /** 锚点模板（局部坐标 + 接受类型 + 对齐方式） */
  anchors?: AnchorTemplate[]
}

export interface AnchorTemplate {
  id: string; local: { x: number; y: number }; kind: AnchorKind
  accepts: AnchorKind[]; align: 'translate' | 'tangent' | 'free'; label: string
}
export type AnchorKind = 'endpoint' | 'surfaceEnd' | 'tangentPoint' | 'terminal' | 'attachPoint' | 'apex'

/** 画布实例 */
export interface GeoElement {
  id: string; type: string
  position: { x: number; y: number }; angle: number
  params: Record<string, number>
  isFixed: boolean; role: Role
  links: { toId: string; kind: 'rope' | 'rod' | 'spring' | 'wire' | 'pulley-rope'; anchorA: string; anchorB: string }[]
  display?: { label?: string; color?: string; showTrail?: boolean; showVectors?: boolean }
  initialState?: { velocity?: { x: number; y: number }; angularVelocity?: number; bullet?: boolean }
}

export const DOMAINS: { key: Domain; label: string; icon: string }[] = [
  { key: 'mech', label: '力学', icon: '🧱' }, { key: 'em', label: '电磁', icon: '⚡' }, { key: 'heat', label: '热学', icon: '🌡' },
  { key: 'optics', label: '光学', icon: '🔦' }, { key: 'modern', label: '近代', icon: '⚛' }, { key: 'util', label: '通用', icon: '🧰' },
]

const P = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): ParamSpec => ({ key, label, min, max, step, default: def, unit })
const SEL = (key: string, label: string, def: number, options: { value: number; label: string }[]): ParamSpec => ({ key, label, min: 0, max: options.length - 1, step: 1, default: def, options })

const el = (type: string, label: string, icon: string, domain: Domain, dims: Dim[], color: string, desc: string, params: ParamSpec[], role: Role, tags: string[], anchors?: AnchorTemplate[]): ElementSpec => ({ type, label, icon, domain, dims, color, desc, params, role, tags, anchors })

const MASS = P('m', '质量 m', 0.1, 10, 0.1, 1, 'kg'), V0 = P('v0', '初速度 v₀', 0, 12, 0.5, 0, 'm/s'), MU = P('mu', '摩擦系数 μ', 0, 1, 0.05, 0.2)
const THETA = P('th', '倾角 θ', 0, 80, 5, 30, '°'), BMAG = P('B', '磁感应强度 B', 0.1, 3, 0.1, 1, 'T'), RES = P('R', '电阻 R', 0.5, 100, 0.5, 1, 'Ω')

// ── 全栈共享几何常量（渲染/锚点/RunBridge 同源引用，防三处漂移）──
export const BELT_RADIUS = 0.15      // 传送带端部滚轮半径 = 带面局部 y（原三处硬编码 0.15 收敛）
export const BRACKET_POST = 0.4      // bracket 竖杆高（桌夹支架：杆矮臂长，卡 5/21）
export const BRACKET_ARM = 0.8       // bracket 横臂长（mount 锚点在臂末端）
export const POLE_WIDTH = 0.08       // pole 竖直杆视觉宽度
export const BODY_HALF = 0.5          // 体半宽基准（block/sphere 锚点与渲染一致；Java Cube/SphereElement 同值 0.5——双栈对账表）

// 锚点局部坐标约定：y 向上（世界/物理系），取元件默认参数下的端点位置（参数化锚点由阶段四模板层提供）
// 通用锚点模板
const ENDPOINT_TL = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'endpoint', accepts: ['surfaceEnd', 'endpoint', 'tangentPoint'], align: 'translate', label })
const SURFACE_END = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'surfaceEnd', accepts: ['endpoint', 'surfaceEnd', 'tangentPoint'], align: 'translate', label })
const TANGENT_PT = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'tangentPoint', accepts: ['surfaceEnd', 'endpoint'], align: 'tangent', label })
const TERMINAL = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'terminal', accepts: ['terminal'], align: 'translate', label })
const ATTACH = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'attachPoint', accepts: ['endpoint', 'attachPoint', 'terminal'], align: 'translate', label })

export const CATALOG: ElementSpec[] = [
  // ── 力学 body ──
  el('block', '物块', '▣', 'mech', ['2.5D'], '#4A90D9', '有摩擦的滑块/物块（fixRot=1 锁转为滑块模型）', [MASS, V0, MU, P('ang', '初速方向', -90, 90, 5, 0, '°'), P('fixRot', '锁转（滑块质点理想化，默认 0 自由翻转）', 0, 1, 1, 0)], 'body', ['物块'], [
    ATTACH(-0.5, 0, '左'), ATTACH(0.5, 0, '右'), ATTACH(0, -0.5, '底'), ATTACH(0, 0.5, '顶'),
  ]),
  el('sphere', '小球', '●', 'mech', ['2D', '2.5D', '3D'], '#F5C542', '质点模型', [MASS, V0, P('e', '恢复系数 e', 0, 1, 0.05, 1), P('mus', '摩擦 μ', 0, 1, 0.05, 0)], 'body', ['小球'], [
    ATTACH(0, -0.5, '底'), ATTACH(0, 0.5, '顶'),
  ]),
  el('cart', '平板小车', '🚃', 'mech', ['2.5D'], '#3ecf8e', '板块模型的板', [P('M', '质量 M', 0.5, 10, 0.5, 3, 'kg'), P('L', '板长 L', 1, 10, 0.5, 6, 'm'), P('mu2', '板-地摩擦 μ₂', 0, 0.5, 0.05, 0.1)], 'body', ['小车', '板'], [
    SURFACE_END(-3, 0, '左端'), SURFACE_END(3, 0, '右端'),
  ]),
  el('particle', '质点', '•', 'mech', ['2D', '2.5D', '3D'], '#F5C542', '理想质点', [MASS, V0, P('ang', '抛射角', 0, 85, 5, 0, '°')], 'body', ['质点']),
  // ── 力学 constraint ──
  el('slope', '斜面', '◺', 'mech', ['2.5D'], '#3ecf8e', '固定斜面（position=直角角点，底边沿 +x）', [THETA, MU, P('L', '长度 L', 1, 12, 0.5, 6, 'm')], 'constraint', ['斜面'], [
    ENDPOINT_TL(0, 3.46, '顶端'), ENDPOINT_TL(6, 0, '底端'),
  ]),
  el('ground', '地面', '═', 'mech', ['2.5D'], '#8a8aa0', '水平面', [MU], 'constraint', ['地面']),
  el('vwall', '竖直墙面', '▯', 'mech', ['2.5D'], '#8a8aa0', '弹簧/绳的竖直固定端', [P('H', '墙高 H', 1, 12, 0.5, 6, 'm')], 'constraint', ['墙面', '固定端'], [
    ATTACH(0, 3, '墙面中点'), ATTACH(0, 6, '墙顶'),
  ]),
  el('anchor_point', '悬挂锚点', '✛', 'mech', ['2D', '2.5D'], '#9cc5ff', '天花板/支架固定点（绳、弹簧、滑轮的固定端）', [], 'constraint', ['锚点', '悬挂点'], [
    ATTACH(0, 0, '锚点'),
  ]),
  el('bracket', '支架', '⌐', 'mech', ['2.5D'], '#8a8aa0', 'L 形桌夹支架（竖杆 0.4 + 横臂 0.8），横臂末端悬挂滑轮/绳/弹簧——卡 5/21 连接体', [], 'constraint', ['支架', '固定端', 'mount'], [
    ATTACH(BRACKET_ARM, BRACKET_POST, 'mount'),
  ]),
  el('pole', '竖直杆', '▎', 'mech', ['2.5D'], '#9cc5ff', '竖直杆（晾衣绳系杆顶，T 与杆高无关是教学点）', [P('H', '杆高 H', 0.6, 3, 0.1, 1.2, 'm')], 'constraint', ['竖直杆', '固定端', 'mount'], [
    ATTACH(0, 0.6, 'mount'),
  ]),
  el('lead_in', '切线导入段', '⌐', 'mech', ['2.5D'], '#b06ce6', '轨道入口的平滑切线过渡', [P('L', '段长 L', 0.5, 4, 0.25, 2, 'm')], 'constraint', ['导入段'], [
    SURFACE_END(-1, 0, '尾端'), SURFACE_END(1, 0, '首端'),
  ]),
  el('belt', '传送带', '⇶', 'mech', ['2.5D'], '#3ecf8e', '速度、倾角、摩擦', [P('vb', '带速 v_带', -8, 8, 0.5, 3, 'm/s'), P('th', '倾角 θ', 0, 80, 5, 0, '°'), P('mu', '摩擦系数 μ', 0, 1, 0.05, 0.4), P('L', '长度 L', 2, 12, 0.5, 6, 'm')], 'constraint', ['传送带'], [
    SURFACE_END(-3, BELT_RADIUS, '左端上表面'), SURFACE_END(3, BELT_RADIUS, '右端上表面'),
    ATTACH(-1.5, BELT_RADIUS, '表面左中'), ATTACH(0, BELT_RADIUS, '表面中'), ATTACH(1.5, BELT_RADIUS, '表面右中'),
  ]),
  el('loop_track', '竖直圆轨道', '◯', 'mech', ['2.5D'], '#b06ce6', '绳/杆/内轨/外轨/管道五类', [P('radius', '半径 R', 0.3, 3, 0.1, 1, 'm'), SEL('side', '类型', 0, [{ value: 0, label: '内轨（球在轨内）' }, { value: 1, label: '外轨（球在轨外）' }, { value: 2, label: '管道（双壁）' }])], 'constraint', ['圆轨道'], [
    TANGENT_PT(0, -1, '入口切点'), ATTACH(0, 1, '顶点'),
  ]),
  el('spring', '弹簧', '〰', 'mech', ['2.5D'], '#F5C542', '劲度系数、自然长', [P('k', '劲度系数 k', 5, 500, 5, 100, 'N/m'), P('L0', '自然长', 0.3, 3, 0.1, 1, 'm'), P('zeta', '阻尼比', 0, 1, 0.05, 0.05)], 'constraint', ['弹簧'], [
    ATTACH(0, 0, '左端'), ATTACH(1, 0, '右端'),
  ]),
  el('rope', '轻绳', '╱', 'mech', ['2.5D'], '#d9a05a', '不可伸长', [P('L', '长度 L', 0.5, 5, 0.1, 2, 'm'), P('Tmax', '最大承受力 T_max', 10, 200, 10, 40, 'N')], 'constraint', ['绳'], [
    ATTACH(0, 0, '左端'), ATTACH(2, 0, '右端'),
  ]),
  el('pulley', '滑轮', '◎', 'mech', ['2.5D'], '#5c5c7a', '定滑轮/动滑轮', [SEL('kind', '类型', 0, [{ value: 0, label: '定滑轮' }, { value: 1, label: '动滑轮' }])], 'constraint', ['滑轮'], [
    ATTACH(0, 0, '悬挂点'),
  ]),
  el('projectile_platform', '平抛平台', '⤵', 'mech', ['2.5D'], '#F5C542', '高度 h 的水平抛出', [P('h', '高度 h', 0.5, 8, 0.5, 3, 'm'), V0], 'constraint', ['平抛'], [
    SURFACE_END(0, 0, '右端'),
  ]),
  // ── 电磁 field ──
  el('e_region', '匀强电场', '⇉', 'em', ['2D', '2.5D', '3D'], '#3ecf8e', 'E（默认空场区，按需设分量）', [P('Ex', 'Ex', -20, 20, 0.5, 0, 'N/C'), P('Ey', 'Ey', -20, 20, 0.5, 0, 'N/C')], 'field', ['电场']),
  el('b_region', '匀强磁场', '⊗', 'em', ['3D'], '#b06ce6', 'B', [BMAG, SEL('dir', '方向', 0, [{ value: 0, label: '⊗ 向里' }, { value: 1, label: '⊙ 向外' }])], 'field', ['磁场']),
  el('point_charge', '带电粒子', '⊕', 'em', ['2D', '2.5D', '3D'], '#F5C542', '比荷（负值为阴离子）、初速', [P('qm', '比荷 q/m', -2, 2, 0.1, 1), V0], 'body', ['带电粒子']),
  // ── 电磁 circuit ──
  el('rail_pair', '导轨对', '═╤═', 'em', ['3D'], '#8a8aa0', '间距 L', [P('L', '间距 L', 0.5, 2, 0.1, 1, 'm')], 'circuit', ['导轨'], [
    TERMINAL(-3, 0, '左端'), TERMINAL(3, 0, '右端'),
  ]),
  el('rod_bar', '导体棒', '┃', 'em', ['2D', '2.5D', '3D'], '#E05555', '质量、电阻、外力 F（v₀=0 中性起步；配 b_region 实现 EMF→安培力耦合）', [MASS, V0, RES, P('F', '外力 F', 0, 10, 0.5, 0, 'N')], 'circuit', ['导体棒'], [
    TERMINAL(0, -0.5, '下端'), TERMINAL(0, 0.5, '上端'),
  ]),
  // ── 热学 ──
  el('cylinder', '汽缸', '▯', 'heat', ['2D'], '#9cc5ff', '截面积', [P('S', '截面积 S', 0.005, 0.03, 0.005, 0.01, 'm²')], 'thermal', ['汽缸']),
  el('piston', '活塞', '▬', 'heat', ['2D'], '#8a8aa0', '质量、摩擦', [P('M', '质量 M', 0, 40, 2, 10, 'kg'), P('dampingRatio', '阻尼比', 0, 1, 0.05, 0.5)], 'thermal', ['活塞']),
  el('gas_cell', '气室', '⁘', 'heat', ['2D'], '#F5C542', '初态 p、V、T', [P('p0', '初始压强', 90000, 110000, 1000, 101325, 'Pa'), P('V0', '初始体积', 0.005, 0.05, 0.005, 0.01, 'm³'), P('T0', '初始温度', 250, 400, 5, 300, 'K'), P('gamma', '多方指数', 1, 1.67, 0.01, 1)], 'thermal', ['气室']),
  el('heater', '温度源', '🔥', 'heat', ['2D'], '#E05555', '目标温度', [P('T2', '目标温度', 250, 450, 5, 360, 'K')], 'thermal', ['温度源']),
  // P3 批2·热学静力学装置（决策1：TS 纯函数装置引擎，物理函数在 src/physics/thermal-statics.ts）
  el('liquid_seal', '液封玻璃管', '⌐', 'heat', ['2D'], '#9cc5ff', '汞柱封闭气柱：p=p₀±h（cmHg 口径）', [P('p0', '大气压 p₀', 70, 80, 1, 76, 'cmHg'), P('h', '汞柱长 h', 4, 30, 1, 10, 'cmHg'), SEL('mode', '朝向', 0, [{ value: 0, label: '开口向上 p=p₀+h' }, { value: 1, label: '开口向下 p=p₀−h' }])], 'device', ['液封']),
  el('pump_syringe', '打气抽气筒', '⧗', 'heat', ['2D'], '#9cc5ff', '变质量气体：打气线性/抽气等比（等效总体积法）', [P('V', '容器容积 V', 1, 20, 0.5, 5, 'L'), P('V0', '每筒体积 V₀', 0.05, 1, 0.05, 0.25, 'L'), P('n', '次数 n', 1, 30, 1, 10, '次'), SEL('mode', '方式', 0, [{ value: 0, label: '打气 p₀(1+nV₀/V)' }, { value: 1, label: '抽气 p₀[V/(V+V₀)]ⁿ' }])], 'device', ['打气', '抽气']),
  el('u_tube', 'U 形管', '⊔', 'heat', ['2D'], '#9cc5ff', '左封气体+右开口：升温/注汞二次方程', [P('L1', '初始气柱 L₁', 10, 30, 1, 20, 'cm'), P('dh0', '初始液面差 Δh₀', -10, 20, 1, 4, 'cm'), SEL('mode', '过程', 0, [{ value: 0, label: '升温膨胀' }, { value: 1, label: '注汞压缩' }]), P('T1', '初温 T₁', 250, 350, 5, 300, 'K'), P('T2', '末温 T₂', 250, 450, 5, 360, 'K'), P('dAdd', '注入汞柱 Δ', 2, 20, 1, 10, 'cm')], 'device', ['U形管']),
  // P3 批3·AC 装置（决策2：TS 复数 MNA 引擎，物理在 src/physics/ac-circuit.ts）
  el('transformer', '变压器', 'Λi', 'em', ['2D'], '#8a8a0', '理想变压器：U₂/U₁=n₂/n₁；负载可扫描（动态分析）', [P('u1', '原边电压 U₁', 6, 380, 5, 220, 'V'), P('n1', '原边匝数 n₁', 1, 20, 1, 2), P('n2', '副边匝数 n₂', 1, 20, 1, 1), P('r_load', '负载 R₀', 1, 100, 1, 11, 'Ω'), P('r_load_end', '负载扫描终点 R₁（=R₀ 则静态）', 1, 200, 1, 44, 'Ω')], 'device', ['变压器']),
  el('powerline', '远距离输电', '⇌', 'em', ['2D'], '#8a8a0', 'I=P/U，P损=I²·R线', [P('p_send', '输送功率 P', 10, 500, 10, 110, 'kW'), P('u_send', '输送电压 U', 0.22, 500, 1, 1.1, 'kV'), P('r_line', '线路电阻 R线', 0.05, 10, 0.05, 0.5, 'Ω')], 'device', ['输电']),
  el('ac_four_values', '交变电流四值', '∿', 'em', ['2D'], '#8a8a0', '峰值/有效值/平均值/瞬时（u=Um·sin(2πft)）', [P('um', '峰值 Um', 10, 400, 1, 311, 'V'), P('f', '频率 f', 10, 100, 1, 50, 'Hz')], 'device', ['交变电流']),
  el('transformer_powerline', '变压器输电全链', '⇉', 'em', ['2D'], '#8a8a0', '发电→升压→线路→降压→负载（MNA 全电路）', [P('u_gen', '发电电压', 6, 380, 5, 220, 'V'), P('up', '升压比', 1, 50, 1, 10), P('down', '降压比', 1, 50, 1, 10), P('r_line', '线路电阻', 0.05, 10, 0.05, 0.5, 'Ω'), P('r_load', '负载', 1, 100, 1, 11, 'Ω')], 'device', ['输电', '变压器']),
  el('cyclotron', '回旋加速器', '◍', 'em', ['2D'], '#8a8a0', '半周期反转电场+匀强B：rₙ₊₁/rₙ=√((n+1)/n)，T=2πm/qB 与 v 无关', [P('B', '磁感应强度 B', 0.1, 3, 0.1, 1, 'T'), P('U', '缝电压 U', 100, 50000, 100, 10000, 'V'), P('R_max', 'D 形盒半径 R', 0.1, 2, 0.1, 0.5, 'm'), P('qm', '比荷 q/m', 1e6, 1e8, 1e6, 9.578e7, 'C/kg')], 'device', ['回旋']),
  // P3 批3 第4步：DC 装置六卡（物理源 src/physics/dc-devices.ts，电路走 TS MNA ω=0 退化）
  el('mhd_generator', '磁流体发电', '≋', 'em', ['2D'], '#7ec8e3', 'EMF=B·D·v（洛伦兹平衡）+ 负载分压', [P('B', '磁感应强度 B', 0.1, 3, 0.1, 1, 'T'), P('D', '电极间距 D', 0.05, 1, 0.05, 0.2, 'm'), P('v', '流速 v', 1, 50, 1, 10, 'm/s'), P('r_load', '负载 R', 0.5, 20, 0.5, 5, 'Ω'), P('r_in', '内阻 r', 0.1, 5, 0.1, 1, 'Ω')], 'device', ['磁流体']),
  el('flow_meter', '电磁流量计', '⌀', 'em', ['2D'], '#7ec8e3', 'U=B·D·v，v=Q/A（与磁流体同源互证）', [P('B', '磁感应强度 B', 0.1, 2, 0.1, 0.5, 'T'), P('D', '电极间距 D', 0.05, 1, 0.05, 0.1, 'm'), P('Q', '流量 Q', 0.001, 0.05, 0.001, 0.005, 'm³/s'), P('A', '管道截面积 A', 0.001, 0.01, 0.001, 0.0025, 'm²')], 'device', ['流量计']),
  el('hall_slab', '霍尔元件', '▤', 'em', ['2D'], '#7ec8e3', 'U_H=I·B/(n·q·d)', [P('B', '磁感应强度 B', 0.1, 2, 0.1, 0.5, 'T'), P('I', '工作电流 I', 0.1, 10, 0.1, 1, 'mA'), P('n', '载流子浓度 n', 1e23, 1e27, 1e23, 1e25, 'm⁻³'), P('d', '厚度 d', 0.1, 5, 0.1, 1, 'mm')], 'device', ['霍尔']),
  el('meter_conversion', '电表改装', 'Ⓐ', 'em', ['2D'], '#F5A623', '表头扩程：并联分流/串联分压', [P('ig', '满偏电流 Ig', 10, 1000, 10, 100, 'μA'), P('rg', '表头内阻 Rg', 10, 5000, 10, 1000, 'Ω'), P('target', '目标量程', 0.1, 10, 0.1, 1, 'A'), SEL('mode', '改装方式', 0, [{ value: 0, label: '安培计（并联分流）' }, { value: 1, label: '伏特计（串联分压）' }])], 'device', ['电表']),
  el('voltammetry', '伏安法测电阻', '⎓', 'em', ['2D'], '#F5A623', '内接偏大/外接偏小（大内偏大小外偏小）', [P('r_x', '待测电阻 R', 1, 100, 1, 10, 'Ω'), P('r_a', '安培计内阻 RA', 0.01, 1, 0.01, 0.1, 'Ω'), P('r_v', '伏特计内阻 RV', 100, 10000, 100, 3000, 'Ω'), SEL('mode', '接法', 0, [{ value: 0, label: '内接（偏大）' }, { value: 1, label: '外接（偏小）' }])], 'device', ['伏安法']),
  el('black_box', '电学黑箱', '▣', 'em', ['2D'], '#F5A623', '探测判别：R + 二极管方向（二态建模 0.1Ω/1GΩ）', [P('r_ab', 'A–B 电阻', 1, 100, 1, 20, 'Ω')], 'device', ['黑箱']),
  // ── 光学 ──
  el('light_source', '光源', '☀', 'optics', ['2D'], '#F5C542', '波长、入射角', [P('lam', '波长 λ', 400, 700, 10, 600, 'nm'), P('th1', '入射角 θ₁', 0, 85, 1, 40, '°')], 'optic', ['光源']),
  el('prism', '棱镜', '△', 'optics', ['2D'], '#4A90D9', '折射率、顶角', [P('n', '折射率 n', 1.3, 2, 0.05, 1.5), P('A', '顶角 A', 30, 80, 5, 60, '°')], 'optic', ['棱镜']),
  el('optic_screen', '光屏', '▯', 'optics', ['2D'], '#d4af37', '位置', [P('L', '距离', 0.5, 2, 0.1, 1, 'm')], 'optic', ['光屏']),
  // 清偿5·P1 的 11 卡补面：劈尖/双缝（卡 56/57）——OpticsRunner 公式已有，此处接 builder 元件面
  el('wedge', '劈尖薄膜', '◺', 'optics', ['2D'], '#7ec8e3', '等厚干涉条纹间距 ΔL=λ/(2n·tanα)', [P('lam', '波长 λ', 400, 700, 10, 600, 'nm'), P('n', '介质折射率 n', 1, 2, 0.05, 1.5), P('alpha', '劈尖角 α', 0.01, 2, 0.01, 0.1, '°')], 'optic', ['劈尖', '薄膜干涉']),
  el('double_slit', '双缝干涉', '⋮⋮', 'optics', ['2D'], '#7ec8e3', '干涉条纹间距 Δx=Lλ/d', [P('lam', '波长 λ', 400, 700, 10, 600, 'nm'), P('d', '缝间距 d', 0.05, 1, 0.05, 0.2, 'mm'), P('L', '缝屏距 L', 0.5, 3, 0.1, 1, 'm')], 'optic', ['双缝', '干涉']),
  // ── 近代 ──
  el('photo_tube', '光电管', '⚲', 'modern', ['2D'], '#8a8a0', '材料', [SEL('mat', '材料', 0, [{ value: 0, label: '钠 2.28eV' }, { value: 1, label: '钾 2.25eV' }, { value: 2, label: '铯 1.94eV' }])], 'device', ['光电管']),
  el('h_atom', '氢原子', 'Ⓗ', 'modern', ['2D'], '#F5C542', '初末能级', [P('m', '初能级 m', 2, 6, 1, 3), P('n', '末能级 n', 1, 5, 1, 2)], 'device', ['氢原子']),
  // 清偿5·P1 的 11 卡补面：物质波/玻尔碰撞（卡 65/64）——ModernRunner 公式已有
  el('electron_gun', '电子枪', '→e', 'modern', ['2D'], '#b39ddf', '物质波 λ=h/√(2meU)', [P('U', '加速电压 U', 10, 5000, 50, 100, 'V')], 'device', ['物质波', '电子']),
  el('bohr_collision', '玻尔碰撞', '⦿', 'modern', ['2D'], '#b39ddf', '电子碰撞激发：能量阈值与可跃迁能级', [P('E', '电子能量 E', 1, 20, 0.25, 12.75, 'eV'), P('maxN', '最高能级', 2, 6, 1, 4)], 'device', ['玻尔', '碰撞激发']),
  // ── 通用 detector/display ──
  el('rigid_roller', '转动惯量滚子', '◎', 'mech', ['2D', '2.5D'], '#F5A623', 'I=k·mR²：圆环(1)/圆盘(0.5)/球(0.4)，滚下斜面验证 a=g·sinθ/(1+k)', [MASS, P('k', 'I 系数 k', 0.1, 1, 0.1, 0.5)], 'body', ['滚子', '转动惯量'], [
    ATTACH(0, -0.5, '底'), ATTACH(0, 0.5, '顶'),
  ]),
  el('accel_sensor', '加速度传感器', 'Ⓐ', 'util', ['2D', '2.5D'], '#E05555', '指定刚体加速度（差分），probes 通道 30fps 上帧', [], 'detector', ['传感器']),
  el('speed_sensor', '速度传感器', 'Ⓥ', 'util', ['2D', '2.5D'], '#3ecf8e', '指定刚体速度模，probes 通道 30fps 上帧', [], 'detector', ['传感器']),
  el('range_finder', '距离传感器', 'Ⓛ', 'util', ['2D', '2.5D'], '#4A90D9', '到参考点距离，probes 通道 30fps 上帧', [], 'detector', ['传感器']),
  el('photogate', '光电门', 'Ⓥ', 'util', ['2.5D'], '#3ecf8e', '测速', [], 'detector', ['传感器']),
  el('force_sensor', '力传感器', 'Ⓕ', 'util', ['2.5D'], '#3ecf8e', '显示力', [], 'detector', ['传感器']),
  el('trail', '轨迹追踪', '⋯', 'util', ['2.5D'], '#8a8a0', '显示轨迹', [], 'display', ['轨迹']),
  el('energy_meter', '能量条', '▮▮', 'util', ['2.5D'], '#3ecf8e', '显示能量', [], 'display', ['能量条']),
  el('timeline', '时间轴', '⏳', 'util', ['2.5D'], '#4A90D9', '多过程', [], 'display', ['时间轴']),
  el('vector_arrow', '矢量箭头', '➤', 'util', ['2D', '2.5D'], '#3ecf8e', '速度/加速度/静态矢量可视化：连线绑定主体即实时跟随（速度=帧直读，加速度=帧差分）；不连线为静态箭头', [SEL('mode', '模式', 0, [{ value: 0, label: '静态箭头' }, { value: 1, label: '跟随速度' }, { value: 2, label: '跟随加速度' }]), P('len', '静态长度', 0.2, 3, 0.1, 1, 'm'), P('th', '静态角度', -180, 180, 5, 0, '°'), P('scale', '缩放系数', 0.05, 1, 0.05, 0.3)], 'display', ['矢量', '箭头'], [
    ATTACH(0, 0, '尾'),
  ]),
  el('graph_tag', '图上标签', '🏷', 'util', ['2D', '2.5D'], '#F5C542', '图上文字标注（文本在属性面板「标签文本」编辑）：坐标点/数据/结论标注', [P('size', '字号', 0.5, 2, 0.1, 1), SEL('color', '颜色', 0, [{ value: 0, label: '黄' }, { value: 1, label: '白' }, { value: 2, label: '红' }, { value: 3, label: '绿' }])], 'display', ['标签', '标注']),
]

export const byType = new Map(CATALOG.map((e) => [e.type, e]))
export const PLAN_COUNT = CATALOG.length

export function defaultsOf(spec: ElementSpec): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.key, p.default]))
}
