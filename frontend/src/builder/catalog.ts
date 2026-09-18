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

const MASS = P('m', '质量 m', 0.1, 10, 0.1, 1, 'kg'), V0 = P('v0', '初速度 v₀', 0, 12, 0.5, 4, 'm/s'), MU = P('mu', '摩擦系数 μ', 0, 1, 0.05, 0.2)
const THETA = P('th', '倾角 θ', 0, 80, 5, 30, '°'), BMAG = P('B', '磁感应强度 B', 0.1, 3, 0.1, 1, 'T'), RES = P('R', '电阻 R', 0.5, 100, 0.5, 1, 'Ω')

// 通用锚点模板
const ENDPOINT_TL = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'endpoint', accepts: ['surfaceEnd', 'endpoint', 'tangentPoint'], align: 'translate', label })
const SURFACE_END = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'surfaceEnd', accepts: ['endpoint', 'surfaceEnd', 'tangentPoint'], align: 'translate', label })
const TANGENT_PT = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'tangentPoint', accepts: ['surfaceEnd', 'endpoint'], align: 'tangent', label })
const TERMINAL = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'terminal', accepts: ['terminal'], align: 'translate', label })
const ATTACH = (x: number, y: number, label: string): AnchorTemplate => ({ id: label, local: { x, y }, kind: 'attachPoint', accepts: ['endpoint', 'attachPoint', 'terminal'], align: 'translate', label })

export const CATALOG: ElementSpec[] = [
  // ── 力学 body ──
  el('block', '物块', '▣', 'mech', ['2.5D'], '#4A90D9', '有摩擦的滑块/物块', [MASS, V0, MU], 'body', ['物块'], [
    ATTACH(-0.5, 0, '左'), ATTACH(0.5, 0, '右'), ATTACH(0, -0.5, '底'), ATTACH(0, 0.5, '顶'),
  ]),
  el('sphere', '小球', '●', 'mech', ['2D', '2.5D', '3D'], '#F5C542', '质点模型', [MASS, V0], 'body', ['小球'], [
    ATTACH(0, -0.5, '底'), ATTACH(0, 0.5, '顶'),
  ]),
  el('cart', '平板小车', '🚃', 'mech', ['2.5D'], '#3ecf8e', '板块模型的板', [P('M', '质量 M', 0.5, 10, 0.5, 3, 'kg'), P('L', '板长 L', 1, 10, 0.5, 6, 'm'), P('mu2', '板-地摩擦 μ₂', 0, 0.5, 0.05, 0.1)], 'body', ['小车', '板'], [
    SURFACE_END(-3, 0, '左端'), SURFACE_END(3, 0, '右端'),
  ]),
  el('particle', '质点', '•', 'mech', ['2D', '2.5D', '3D'], '#F5C542', '理想质点', [MASS, V0, P('ang', '抛射角', 0, 85, 5, 0, '°')], 'body', ['质点']),
  // ── 力学 constraint ──
  el('slope', '斜面', '◺', 'mech', ['2.5D'], '#3ecf8e', '固定斜面', [THETA, MU, P('L', '长度 L', 1, 12, 0.5, 6, 'm')], 'constraint', ['斜面'], [
    ENDPOINT_TL(-3, 0, '底端'), ENDPOINT_TL(3, -1.8, '顶端'),
  ]),
  el('ground', '地面', '═', 'mech', ['2.5D'], '#8a8aa0', '水平面', [MU], 'constraint', ['地面']),
  el('belt', '传送带', '⇶', 'mech', ['2.5D'], '#3ecf8e', '速度、倾角、摩擦', [P('vb', '带速 v_带', 0, 8, 0.5, 3, 'm/s'), THETA, MU, P('L', '长度 L', 2, 12, 0.5, 6, 'm')], 'constraint', ['传送带'], [
    SURFACE_END(-3, 0.15, '左端上表面'), SURFACE_END(3, 0.15, '右端上表面'),
  ]),
  el('loop_track', '竖直圆轨道', '◯', 'mech', ['2.5D'], '#b06ce6', '绳/杆/内轨/外轨/管道五类', [P('radius', '半径 R', 0.3, 3, 0.1, 1, 'm'), SEL('side', '类型', 0, [{ value: 0, label: '内轨（球在轨内）' }, { value: 1, label: '外轨（球在轨外）' }, { value: 2, label: '管道（双壁）' }])], 'constraint', ['圆轨道'], [
    TANGENT_PT(0, -1, '入口切点'), ATTACH(0, 1, '顶点'),
  ]),
  el('spring', '弹簧', '〰', 'mech', ['2.5D'], '#F5C542', '劲度系数、自然长', [P('k', '劲度系数 k', 5, 500, 5, 100, 'N/m'), P('L0', '自然长', 0.3, 3, 0.1, 1, 'm'), P('zeta', '阻尼比', 0, 1, 0.05, 0.05)], 'constraint', ['弹簧'], [
    ATTACH(-1.5, 0, '左端'), ATTACH(1.5, 0, '右端'),
  ]),
  el('rope', '轻绳', '╱', 'mech', ['2.5D'], '#d9a05a', '不可伸长', [P('L', '长度 L', 0.5, 5, 0.1, 2, 'm'), P('Tmax', '最大承受力 T_max', 10, 200, 10, 40, 'N')], 'constraint', ['绳'], [
    ATTACH(-1, 0, '左端'), ATTACH(1, 0, '右端'),
  ]),
  el('pulley', '滑轮', '◎', 'mech', ['2.5D'], '#5c5c7a', '定滑轮/动滑轮', [SEL('kind', '类型', 0, [{ value: 0, label: '定滑轮' }, { value: 1, label: '动滑轮' }])], 'constraint', ['滑轮'], [
    ATTACH(0, 0, '悬挂点'),
  ]),
  el('projectile_platform', '平抛平台', '⤵', 'mech', ['2.5D'], '#F5C542', '高度 h 的水平抛出', [P('h', '高度 h', 0.5, 8, 0.5, 3, 'm'), V0], 'constraint', ['平抛'], [
    SURFACE_END(0, 0, '右端'),
  ]),
  // ── 电磁 field ──
  el('e_region', '匀强电场', '⇉', 'em', ['3D'], '#3ecf8e', 'E', [P('Ex', 'Ex', -20, 20, 0.5, 0, 'N/C'), P('Ey', 'Ey', -20, 20, 0.5, 9.8, 'N/C')], 'field', ['电场']),
  el('b_region', '匀强磁场', '⊗', 'em', ['3D'], '#b06ce6', 'B', [BMAG, SEL('dir', '方向', 0, [{ value: 0, label: '⊗ 向里' }, { value: 1, label: '⊙ 向外' }])], 'field', ['磁场']),
  el('point_charge', '带电粒子', '⊕', 'em', ['3D'], '#F5C542', '比荷、初速', [P('qm', '比荷 q/m', 0.5, 2, 0.1, 1), V0], 'body', ['带电粒子']),
  // ── 电磁 circuit ──
  el('rail_pair', '导轨对', '═╤═', 'em', ['3D'], '#8a8aa0', '间距 L', [P('L', '间距 L', 0.5, 2, 0.1, 1, 'm')], 'circuit', ['导轨'], [
    TERMINAL(-3, 0, '左端'), TERMINAL(3, 0, '右端'),
  ]),
  el('rod_bar', '导体棒', '┃', 'em', ['3D'], '#E05555', '质量、电阻', [MASS, V0, RES], 'circuit', ['导体棒'], [
    TERMINAL(0, -0.5, '下端'), TERMINAL(0, 0.5, '上端'),
  ]),
  // ── 热学 ──
  el('cylinder', '汽缸', '▯', 'heat', ['2D'], '#9cc5ff', '截面积', [P('S', '截面积 S', 0.005, 0.03, 0.005, 0.01, 'm²')], 'thermal', ['汽缸']),
  el('piston', '活塞', '▬', 'heat', ['2D'], '#8a8aa0', '质量、摩擦', [P('M', '质量 M', 0, 40, 2, 10, 'kg'), P('dampingRatio', '阻尼比', 0, 1, 0.05, 0.5)], 'thermal', ['活塞']),
  el('gas_cell', '气室', '⁘', 'heat', ['2D'], '#F5C542', '初态 p、V、T', [P('p0', '初始压强', 90000, 110000, 1000, 101325, 'Pa'), P('V0', '初始体积', 0.005, 0.05, 0.005, 0.01, 'm³'), P('T0', '初始温度', 250, 400, 5, 300, 'K'), P('gamma', '多方指数', 1, 1.67, 0.01, 1)], 'thermal', ['气室']),
  el('heater', '温度源', '🔥', 'heat', ['2D'], '#E05555', '目标温度', [P('T2', '目标温度', 250, 450, 5, 360, 'K')], 'thermal', ['温度源']),
  // ── 光学 ──
  el('light_source', '光源', '☀', 'optics', ['2D'], '#F5C542', '波长、入射角', [P('lam', '波长 λ', 400, 700, 10, 600, 'nm'), P('th1', '入射角 θ₁', 0, 85, 1, 40, '°')], 'optic', ['光源']),
  el('prism', '棱镜', '△', 'optics', ['2D'], '#4A90D9', '折射率、顶角', [P('n', '折射率 n', 1.3, 2, 0.05, 1.5), P('A', '顶角 A', 30, 80, 5, 60, '°')], 'optic', ['棱镜']),
  el('optic_screen', '光屏', '▯', 'optics', ['2D'], '#d4af37', '位置', [P('L', '距离', 0.5, 2, 0.1, 1, 'm')], 'optic', ['光屏']),
  // ── 近代 ──
  el('photo_tube', '光电管', '⚲', 'modern', ['2D'], '#8a8a0', '材料', [SEL('mat', '材料', 0, [{ value: 0, label: '钠 2.28eV' }, { value: 1, label: '钾 2.25eV' }, { value: 2, label: '铯 1.94eV' }])], 'device', ['光电管']),
  el('h_atom', '氢原子', 'Ⓗ', 'modern', ['2D'], '#F5C542', '初末能级', [P('m', '初能级 m', 2, 6, 1, 3), P('n', '末能级 n', 1, 5, 1, 2)], 'device', ['氢原子']),
  // ── 通用 detector/display ──
  el('photogate', '光电门', 'Ⓥ', 'util', ['2.5D'], '#3ecf8e', '测速', [], 'detector', ['传感器']),
  el('force_sensor', '力传感器', 'Ⓕ', 'util', ['2.5D'], '#3ecf8e', '显示力', [], 'detector', ['传感器']),
  el('trail', '轨迹追踪', '⋯', 'util', ['2.5D'], '#8a8a0', '显示轨迹', [], 'display', ['轨迹']),
  el('energy_meter', '能量条', '▮▮', 'util', ['2.5D'], '#3ecf8e', '显示能量', [], 'display', ['能量条']),
  el('timeline', '时间轴', '⏳', 'util', ['2.5D'], '#4A90D9', '多过程', [], 'display', ['时间轴']),
]

export const byType = new Map(CATALOG.map((e) => [e.type, e]))
export const PLAN_COUNT = CATALOG.length

export function defaultsOf(spec: ElementSpec): Record<string, number> {
  return Object.fromEntries(spec.params.map((p) => [p.key, p.default]))
}
