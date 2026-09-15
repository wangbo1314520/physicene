<script setup lang="ts">
import { computed, markRaw, onMounted, onUnmounted, reactive, ref, shallowRef, watch, type Component } from 'vue'
import * as echarts from 'echarts'
import { createSimRenderer, type SimRenderer, type SimDimension } from '../sim/threeScene'
import { ensureDemoLogin } from '../api/auth'
import {
  useSimulationSocket,
  type PhysicsElementInput,
} from '../composables/useSimulationSocket'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let renderer: SimRenderer | null = null
let chart: echarts.ECharts | null = null

const { state, error, run, pause, play, step, end } = useSimulationSocket()

// 预置实验场景。dimension 为该实验的最佳展示维度（唯一口径：纯2D/纯2.5D/纯3D，
// 依据 docs/实验开发优先级与维度规划.md）：2D=正交平面图；2.5D=等距立体；3D=可旋转+空间场线
type Preset = {
  group?: string
  name: string
  dimension: SimDimension
  elements: PhysicsElementInput[]
  config: Record<string, any>
}
const presets = reactive<Record<string, Preset>>({
  collision: {
    group: '选择性必修一 · 动量守恒',
    name: '两车弹性碰撞（e=1 速度交换）',
    dimension: '2.5D',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -3, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 1.0 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 3, y: 0.5 }, color: '#E05555',
        properties: { mass: 1, friction: 0, restitution: 1.0 },
        initialState: { velocity: { x: -5, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 3.0 },
  },
  inelastic: {
    group: '选择性必修一 · 动量守恒',
    name: '两车非弹性碰撞（e=0.3 动能有损）',
    dimension: '2.5D',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -3, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 0.3 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 3, y: 0.5 }, color: '#E05555',
        properties: { mass: 2, friction: 0, restitution: 0.3 },
        initialState: { velocity: { x: -2, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 3.0 },
  },
  perfect_inelastic: {
    group: '选择性必修一 · 动量守恒',
    name: '完全非弹性碰撞（e=0 碰后共速，动能损失最大）',
    dimension: '2.5D',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -4, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 2, friction: 0, restitution: 0 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 2, y: 0.5 }, color: '#E05555',
        properties: { mass: 1, friction: 0, restitution: 0 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 3.5 },
  },
  light_vs_heavy: {
    group: '选择性必修一 · 动量守恒',
    name: '不等质量弹性碰撞：轻碰重反弹 / 重碰轻跟进（双车道）',
    dimension: '2.5D',
    elements: [
      // 上车道：轻车 m=1 撞静止重车 m=5 → 轻车以 (m1−m2)/(m1+m2)·v = −3.3 反弹
      { id: 'light_a', type: 'cube', position: { x: -5, y: 5.4 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 1 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'heavy_a', type: 'cube', position: { x: 1, y: 5.4 }, color: '#E05555',
        properties: { mass: 5, friction: 0, restitution: 1 } },
      { id: 'lane_up', type: 'wall', position: { x: 0, y: 4.8 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0' },
      // 下车道：重车 m=5 撞静止轻车 m=1 → 轻车以 2m1/(m1+m2)·v = 5 弹飞，重车 2 跟进
      { id: 'heavy_b', type: 'cube', position: { x: -5, y: 0.4 }, color: '#E05555',
        properties: { mass: 5, friction: 0, restitution: 1 },
        initialState: { velocity: { x: 3, y: 0 } } },
      { id: 'light_b', type: 'cube', position: { x: 1, y: 0.4 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 1 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.2 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 4 },
  },
  recoil: {
    group: '选择性必修一 · 动量守恒',
    name: '反冲运动（静止分离，动量守恒 p=0）',
    dimension: '2.5D',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -0.6, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 0.5 },
        initialState: { velocity: { x: -4, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 0.6, y: 0.5 }, color: '#E05555',
        properties: { mass: 2, friction: 0, restitution: 0.5 },
        initialState: { velocity: { x: 2, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 5 },
  },
  bounce_ball: {
    group: '选择性必修一 · 动量守恒',
    name: '篮球反弹：恢复系数 e 与反弹高度（h′=e²h，做一做）',
    dimension: '2.5D',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: 0, y: 8 }, color: '#E07B39',
        properties: { mass: 0.6, friction: 0, restitution: 0.75 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 12, y: 0.2 },
        color: '#8a8aa0', properties: { restitution: 0.75 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 8 },
  },
  freefall: {
    group: '必修一 · 匀变速直线运动',
    name: '自由落体（1s 下落 ≈4.9m）',
    dimension: '2.5D',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: 0, y: 10 }, color: '#F5C542',
        properties: { mass: 1, friction: 0, restitution: 0.2 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 3.0 },
  },
  vertical_throw: {
    group: '必修一 · 匀变速直线运动',
    name: '竖直上抛（v0=10，h=v0²/2g≈5.1m，升降对称）',
    dimension: '2.5D',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: 0, y: 0.5 }, color: '#F5C542',
        properties: { mass: 1, friction: 0, restitution: 0.55 },
        initialState: { velocity: { x: 0, y: 10 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 12, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4 },
  },
  newton_tube: {
    group: '必修一 · 运动和力',
    name: '牛顿管（真空）：硬币与羽毛同时落地',
    dimension: '2.5D',
    elements: [
      // dyn4j 无空气阻力 = 真空环境：质量悬殊的两物同时落地
      { id: 'coin', type: 'sphere', position: { x: -0.8, y: 9 }, color: '#F5C542',
        properties: { mass: 5, friction: 0, restitution: 0 } },
      { id: 'feather', type: 'cube', position: { x: 0.8, y: 9 }, scale: { x: 0.9, y: 0.25 },
        color: '#b0b0cc',
        properties: { mass: 0.05, friction: 0, restitution: 0 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 12, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 2.5 },
  },
  slope_real: {
    group: '必修一 · 相互作用与牛顿定律',
    name: '斜面滑块 · 现实（滑离底部有磕碰）',
    dimension: '2.5D',
    elements: [
      // 斜面：scale(2, 2.3) → 底 4 × 高 2.3，tan θ = 2.3/4 ≈ 30°，直角在左下
      { id: 'slope1', type: 'slope', position: { x: -2, y: 0 }, scale: { x: 2, y: 2.3 },
        color: '#3ecf8e' },
      // 方块：贴斜面顶端静止；有效弹性 = max(块 0.2, 地面 0.3)，滑落后磕碰弹跳
      { id: 'block', type: 'cube', position: { x: -3.23, y: 1.28 }, angle: -0.5236,
        color: '#4A90D9',
        properties: { mass: 1, friction: 0.1, restitution: 0.2 },
        initialState: { velocity: { x: 0, y: 0 } } },
      // 地面故意低于斜面底边 5cm：滑离瞬间产生落差磕碰
      { id: 'ground', type: 'wall', position: { x: 2, y: -1.3 }, scale: { x: 24, y: 0.2 },
        color: '#8a8aa0', properties: { friction: 0.1, restitution: 0.3 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4.0 },
  },
  slope_ideal: {
    group: '必修一 · 相互作用与牛顿定律',
    name: '斜面滑块 · 理想（球模型，平滑过渡无弹跳）',
    dimension: '2.5D',
    elements: [
      { id: 'slope1', type: 'slope', position: { x: -2, y: 0 }, scale: { x: 2, y: 2.3 },
        color: '#3ecf8e' },
      // 球形单点接触 + 双侧 e=0（dyn4j 弹性取 max，必须球和地面同时为零）
      { id: 'ball', type: 'sphere', position: { x: -3.23, y: 1.28 },
        color: '#F5C542',
        properties: { mass: 1, friction: 0.1, restitution: 0 },
        initialState: { velocity: { x: 0, y: 0 } } },
      // 地面顶面与斜面底边严格齐平（y=-1.15）：无落差 + e=0，vy 全程无正向跳变
      { id: 'ground', type: 'wall', position: { x: 2, y: -1.25 }, scale: { x: 24, y: 0.2 },
        color: '#8a8aa0', properties: { friction: 0.1, restitution: 0 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4.0 },
  },
  friction_decel: {
    group: '必修一 · 相互作用与牛顿定律',
    name: '摩擦减速（μ=0.3 滑块减速到停止）',
    dimension: '2.5D',
    elements: [
      { id: 'cube_a', type: 'cube', position: { x: -8, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0.3, restitution: 0 },
        initialState: { velocity: { x: 8, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0', properties: { friction: 0.3, restitution: 0 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 5 },
  },
  inertia: {
    group: '必修一 · 相互作用与牛顿定律',
    name: '惯性：光滑冰面匀速直线（牛顿第一定律）',
    dimension: '2.5D',
    elements: [
      { id: 'cube_a', type: 'cube', position: { x: -8, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 0 },
        initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0', properties: { friction: 0 } },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 6 },
  },
  f_equals_ma: {
    group: '必修一 · 相互作用与牛顿定律',
    name: '探究 a=F/m：同电场力下不同质量的加速度（牛顿第二定律）',
    dimension: '2.5D',
    elements: [
      { id: 'q_light', type: 'point_charge', position: { x: -6, y: 1.5 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 0, y: 0 } } },
      { id: 'q_heavy', type: 'point_charge', position: { x: -6, y: -1.5 }, color: '#E05555',
        properties: { mass: 2, charge: 1 }, initialState: { velocity: { x: 0, y: 0 } } },
      { id: 'ef', type: 'e_field', position: { x: 0, y: 0 }, scale: { x: 24, y: 10 },
        properties: { eFieldX: 1, eFieldY: 0 } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 5 },
  },
  projectile_h: {
    group: '必修二 · 抛体运动',
    name: '平抛运动（水平初速 + 重力）',
    dimension: '2D',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: -10, y: 10 }, color: '#F5C542',
        properties: { mass: 0.5, friction: 0, restitution: 0.3 },
        initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 40, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4 },
  },
  projectile_45: {
    group: '必修二 · 抛体运动',
    name: '斜抛运动 45°（v0=20，射程 40m）',
    dimension: '2D',
    elements: [
      { id: 'ball', type: 'cube', position: { x: -15, y: 0.5 }, color: '#F5C542',
        properties: { mass: 0.5, friction: 0, restitution: 0.2 },
        initialState: { velocity: { x: 14.14, y: 14.14 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 60, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 5 },
  },
  energy_conserve: {
    group: '必修二 · 机械能守恒',
    name: '机械能守恒：20m 高落差自由落体（Ep→Ek 转化）',
    dimension: '2.5D',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: 0, y: 20 }, color: '#F5C542',
        properties: { mass: 1, friction: 0, restitution: 0.3 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4 },
  },
  e_deflect: {
    group: '必修三 · 静电场',
    name: '电场偏转（示波器模型，电荷抛物线）',
    dimension: '2D',
    elements: [
      { id: 'pc', type: 'point_charge', position: { x: -10, y: 0 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'ef', type: 'e_field', position: { x: 1, y: 0 }, scale: { x: 22, y: 10 },
        properties: { eFieldX: 0, eFieldY: -2 } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 5 },
  },
  e_accel: {
    group: '必修三 · 静电场',
    name: '电场加速：W=qEd → ½mv²（v=√(2qEd/m)）',
    dimension: '2D',
    elements: [
      { id: 'pc', type: 'point_charge', position: { x: -10, y: 0 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 },
        initialState: { velocity: { x: 0, y: 0 } } },
      { id: 'ef', type: 'e_field', position: { x: 0, y: 0 }, scale: { x: 22, y: 6 },
        properties: { eFieldX: 1, eFieldY: 0 } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 6 },
  },
  coulomb_repulse: {
    group: '必修三 · 静电场',
    name: '库仑力：同种电荷相互排斥（F=Kq₁q₂/r²）',
    dimension: '2D',
    elements: [
      { id: 'q1', type: 'point_charge', position: { x: -2, y: 0 }, color: '#E05555',
        properties: { mass: 1, charge: 2 }, initialState: { velocity: { x: 0, y: 0 } } },
      { id: 'q2', type: 'point_charge', position: { x: 2, y: 0 }, color: '#E05555',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 0, y: 0 } } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 6 },
  },
  coulomb_attract: {
    group: '必修三 · 静电场',
    name: '库仑力：异种电荷相互吸引（碰后弹开的振荡）',
    dimension: '2D',
    elements: [
      { id: 'q1', type: 'point_charge', position: { x: -5, y: 0 }, color: '#E05555',
        properties: { mass: 2, charge: 2, restitution: 0.4 }, initialState: { velocity: { x: 0, y: 0 } } },
      { id: 'q2', type: 'point_charge', position: { x: 5, y: 0 }, color: '#4A90D9',
        properties: { mass: 1, charge: -1, restitution: 0.4 }, initialState: { velocity: { x: 0, y: 0 } } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 8 },
  },
  b_circle: {
    group: '选择性必修二 · 磁场',
    name: '磁场圆周运动（洛伦兹力，r=mv/qB）',
    dimension: '3D',
    elements: [
      { id: 'pc', type: 'point_charge', position: { x: -5, y: 0 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 },
        initialState: { velocity: { x: 0, y: 4 } } },
      { id: 'bf', type: 'b_field', position: { x: 0, y: 0 }, scale: { x: 30, y: 30 },
        properties: { bField: 1, bDirection: 'out' } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 8 },
  },
  velocity_selector: {
    group: '选择性必修二 · 磁场',
    name: '速度选择器：v=E/B 的电荷直线通过（E⊥B 叠加场）',
    dimension: '3D',
    elements: [
      { id: 'v_ok', type: 'point_charge', position: { x: -9, y: 0.8 }, color: '#3ecf8e',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 2, y: 0 } } },
      { id: 'v_slow', type: 'point_charge', position: { x: -9, y: 2.6 }, color: '#4A90D9',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 1, y: 0 } } },
      { id: 'v_fast', type: 'point_charge', position: { x: -9, y: -2.4 }, color: '#E05555',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 4, y: 0 } } },
      { id: 'ef', type: 'e_field', position: { x: 2, y: 0 }, scale: { x: 22, y: 9 },
        properties: { eFieldX: 0, eFieldY: 2 } },
      { id: 'bf', type: 'b_field', position: { x: 2, y: 0 }, scale: { x: 22, y: 9 },
        properties: { bField: 1, bDirection: 'out' } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 6 },
  },
  mass_spec: {
    group: '选择性必修二 · 磁场',
    name: '质谱仪原理：不同速率的电荷在磁场中偏转半径不同（r=mv/qB）',
    dimension: '3D',
    elements: [
      { id: 'fast', type: 'point_charge', position: { x: -8, y: 0 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 0, y: 4 } } },
      { id: 'slow', type: 'point_charge', position: { x: 8, y: 0 }, color: '#3ecf8e',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 0, y: 2 } } },
      { id: 'bf', type: 'b_field', position: { x: 0, y: 0 }, scale: { x: 30, y: 30 },
        properties: { bField: 1, bDirection: 'out' } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 9 },
  },
  alpha_scatter: {
    group: '选择性必修三 · 原子物理',
    name: 'α粒子散射（卢瑟福）：瞄准距离越小偏转角越大',
    dimension: '3D',
    elements: [
      // 金核固定；5 颗 α 粒子瞄准距离 b = 5 / 3 / 0.9 / 0.35 / 0.05，
      // 对应偏转角约 5° / 8.5° / 28° / 65° / 155°（tan(θ/2)=KQq/(mv²b)）。
      // x 错开发射：避开 α 粒子之间的库仑斥力互相干扰（同 x 时近距对会明显互斥）
      { id: 'nucleus', type: 'point_charge', position: { x: 0, y: 0 }, color: '#E05555',
        properties: { mass: 1000, charge: 8 }, initialState: { velocity: { x: 0, y: 0 } }, isFixed: true },
      { id: 'a_far', type: 'point_charge', position: { x: -12, y: 5 }, color: '#b0b0cc',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'a_top', type: 'point_charge', position: { x: -13, y: 3 }, color: '#4A90D9',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'a_mid', type: 'point_charge', position: { x: -14, y: 0.9 }, color: '#3ecf8e',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'a_near', type: 'point_charge', position: { x: -15, y: 0.35 }, color: '#F5C542',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 6, y: 0 } } },
      { id: 'a_head', type: 'point_charge', position: { x: -16, y: 0.05 }, color: '#E07B39',
        properties: { mass: 1, charge: 1 }, initialState: { velocity: { x: 6, y: 0 } } },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 8 },
  },
})
const selected = ref<keyof typeof presets | string>('collision')
const currentPreset = computed<Preset | null>(() => (presets[selected.value] ?? null))

// ===== 实验库 3D 实验接入（演示模式：自包含组件，无步骤评分）=====
const exp3dList = shallowRef<{ key: string; name: string; component: Component }[]>([])
const currentExp3d = computed(() => exp3dList.value.find((e) => e.key === selected.value) ?? null)
const exp3dKey = ref(0) // 重置 = 重新挂载组件

const currentDimension = computed<SimDimension>(() => currentPreset.value?.dimension ?? '3D')
const dimClass = computed(() => ({ '2D': 'd2', '2.5D': 'd25', '3D': 'd3' })[currentDimension.value])
const dimensionHint = computed(() => ({
  '2D': '正交视角平面图（教材插图观感，滚轮缩放 / 右键平移）',
  '2.5D': '2D 物理 + 等距立体渲染（滚轮缩放 / 右键平移）',
  '3D': '左键拖拽旋转 / 滚轮缩放 / 右键平移，双击复位',
} as Record<string, string>)[currentDimension.value])

// ===== 可折叠分组实验选择器 =====
const pickerOpen = ref(false)
const filterText = ref('')
const collapsed = reactive<Record<string, boolean>>({})
const currentLabel = computed(() => currentPreset.value?.name ?? currentExp3d.value?.name ?? '选择实验')
const pickerGroups = computed(() => {
  const groups: { name: string; items: { key: string; name: string; dim: SimDimension }[] }[] = []
  for (const [gname, list] of Object.entries(groupedPresets.value)) {
    groups.push({
      name: gname,
      items: list.map((p: { key: string; name: string }) =>
        ({ key: p.key, name: p.name, dim: presets[p.key].dimension })),
    })
  }
  if (exp3dList.value.length) {
    groups.push({
      name: '实验库 · 3D 引擎实验（演示模式）',
      items: exp3dList.value.map((e) => ({ key: e.key, name: e.name, dim: '3D' as SimDimension })),
    })
  }
  const kw = filterText.value.trim().toLowerCase()
  if (!kw) return groups
  return groups
    .map((g) => ({ name: g.name, items: g.items.filter((i) => i.name.toLowerCase().includes(kw)) }))
    .filter((g) => g.items.length > 0)
})
function currentGroupName(): string | null {
  for (const g of pickerGroups.value) {
    if (g.items.some((i) => i.key === selected.value)) return g.name
  }
  return null
}
function openPicker() {
  pickerOpen.value = true
  filterText.value = ''
  // 默认只展开当前实验所在分组，其余收起
  const cur = currentGroupName()
  for (const g of pickerGroups.value) collapsed[g.name] = g.name !== cur
}
function toggleGroup(name: string) {
  collapsed[name] = !collapsed[name]
}
function isGroupOpen(name: string): boolean {
  return filterText.value.trim() !== '' ? true : !collapsed[name]
}
function pickExperiment(key: string) {
  selected.value = key
  pickerOpen.value = false
  filterText.value = ''
}
const dimClassOf = (d: SimDimension) => ({ '2D': 'd2', '2.5D': 'd25', '3D': 'd3' })[d]

function resetCamera() {
  if (currentExp3d.value) exp3dKey.value++
  else renderer?.resetView()
}

const showParams = ref(true)

// 规范化：所有可动元件补齐 properties/initialState（预设数据缺字段时参数面板不崩）
for (const preset of Object.values(presets)) {
  for (const el of preset.elements) {
    if (el.type !== 'wall' && el.type !== 'slope') {
      if (!el.properties) el.properties = { mass: 1, friction: 0, restitution: 0.5 }
      if (!el.initialState) el.initialState = { velocity: { x: 0, y: 0 } }
      if (!el.initialState.velocity) el.initialState.velocity = { x: 0, y: 0 }
    }
  }
}

// 质量显示单位（每个元件独立）：UI 显示 g 时，提交后端前换算回 kg
const massUnit = reactive<Record<string, 'kg' | 'g'>>({})

function toggleMassUnit(el: PhysicsElementInput) {
  const cur = massUnit[el.id] ?? 'kg'
  const next = cur === 'kg' ? 'g' : 'kg'
  const m = el.properties?.mass ?? 1
  el.properties!.mass = next === 'g' ? m * 1000 : m / 1000
  massUnit[el.id] = next
}

const groupedPresets = computed(() => {
  const groups: Record<string, { key: string; name: string }[]> = {}
  for (const [key, preset] of Object.entries(presets)) {
    const g = (preset as any).group || '其他'
    ;(groups[g] ??= []).push({ key, name: preset.name })
  }
  return groups
})

const LINE_COLORS = ['#4A90D9', '#E05555', '#F5C542', '#3ecf8e', '#b06ce6', '#6cd9e8']

function statusText() {
  switch (state.status) {
    case 'running': return `▶ 运行中 t=${state.currentT.toFixed(2)}s`
    case 'paused': return `⏸ 已暂停 t=${state.currentT.toFixed(2)}s`
    case 'ended': return `■ 已结束 (${state.endInfo?.reason ?? ''} ${state.endInfo?.totalDuration.toFixed(2) ?? 0}s)`
    case 'connecting': return '… 连接中'
    default: return '待运行'
  }
}

const busy = computed(() => state.status === 'running' || state.status === 'paused' || state.status === 'connecting')

function startRun() {
  const preset = currentPreset.value
  if (!preset) return
  // 深拷贝当前参数快照，避免运行中面板编辑影响已提交场景；质量按显示单位换算回 kg
  const elements: PhysicsElementInput[] = JSON.parse(JSON.stringify(preset.elements))
  for (const el of elements) {
    if ((massUnit[el.id] ?? 'kg') === 'g' && el.properties) {
      el.properties.mass = el.properties.mass / 1000
    }
  }
  const config = JSON.parse(JSON.stringify(preset.config))
  renderer?.syncElements(elements)
  run(elements, config)
}

// 切换实验：按该实验的最佳维度切渲染模式，再同步元件（3D 实验库项走独立组件，不触发）
watch(selected, () => {
  const preset = currentPreset.value
  if (!preset) return
  renderer?.setDimension(preset.dimension)
  renderer?.syncElements(preset.elements)
})

watch(
  () => state.subjects,
  (subjects) => renderer?.updateStates(subjects),
  { deep: true },
)

// v-t 图增量刷新（每 6 帧一次）：带符号速度分量 + Ek/p 双轴
// replaceMerge 清掉上一场残留 series（切实验后旧曲线不再滞留）
watch(
  () => state.frameCount,
  (n) => {
    if (!chart || n % 6 !== 0) return
    const series: echarts.SeriesOption[] = []
    state.vSeries.forEach((s, i) => {
      const color = LINE_COLORS[i % LINE_COLORS.length]
      const id = state.vIds[i] ?? `主体${i + 1}`
      series.push({
        name: `${id}.vx`, type: 'line', showSymbol: false,
        lineStyle: { color, width: 2 },
        itemStyle: { color },
        data: s.map((p) => [p.t, +p.vx.toFixed(3)]),
      })
      series.push({
        name: `${id}.vy`, type: 'line', showSymbol: false,
        lineStyle: { color, width: 1.5, type: 'dashed', opacity: 0.7 },
        itemStyle: { color },
        data: s.map((p) => [p.t, +p.vy.toFixed(3)]),
      })
    })
    series.push({
      name: '总动能 Ek', type: 'line', showSymbol: false, yAxisIndex: 1,
      lineStyle: { color: '#F5C542', width: 1.5 },
      itemStyle: { color: '#F5C542' },
      data: state.ekSeries.map((p) => [p.t, +p.v.toFixed(3)]),
    })
    series.push({
      name: '总动量模 p', type: 'line', showSymbol: false, yAxisIndex: 1,
      lineStyle: { color: '#6cd9e8', width: 1.5 },
      itemStyle: { color: '#6cd9e8' },
      data: state.pSeries.map((p) => [p.t, +p.v.toFixed(3)]),
    })
    chart.setOption({ series }, { replaceMerge: ['series'] })
  },
)

onMounted(async () => {
  // 实验库 3D 实验按需加载（避免把 55 个实验组件打进演示页首包）
  import('../experiments/registry').then(({ EXPERIMENTS }) => {
    exp3dList.value = EXPERIMENTS
      .filter((e) => e.batch === 'B3' && e.dimension === '3D' && e.component)
      .map((e) => ({ key: `exp3d:${e.id}`, name: e.name, component: markRaw(e.component as Component) }))
  })
  // 演示页免登录：demo token 只存内存，不触发路由守卫放行（实验台仍需正式登录）
  await ensureDemoLogin()
  if (canvasRef.value) {
    renderer = createSimRenderer(canvasRef.value)
    const preset = currentPreset.value
    if (preset) {
      renderer.setDimension(preset.dimension)
      renderer.syncElements(preset.elements)
    }
  }
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      darkMode: true,
      animation: false,
      grid: { left: 50, right: 55, top: 30, bottom: 28 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 2 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: 't/s', nameTextStyle: { color: '#6c6c85' },
        axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: [
        { type: 'value', name: 'v (m/s)', nameTextStyle: { color: '#6c6c85' },
          axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
        { type: 'value', name: 'Ek(J) / p(kg·m/s)', nameTextStyle: { color: '#6c6c85' },
          axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
      ],
      series: [],
    })
  }
})

onUnmounted(() => {
  renderer?.dispose()
  chart?.dispose()
})
</script>

<template>
  <main class="sim-page">
    <section class="toolbar">
      <div class="picker">
        <button class="picker-trigger" :disabled="state.status === 'running' || state.status === 'paused'"
                @keydown.esc="pickerOpen = false" @click="pickerOpen ? (pickerOpen = false) : openPicker()">
          <span class="dim-chip" :class="dimClass">{{ currentDimension }}</span>
          <span class="picker-label">{{ currentLabel }}</span>
          <span class="caret" :class="{ open: pickerOpen }">▾</span>
        </button>
        <template v-if="pickerOpen">
          <div class="picker-backdrop" @click="pickerOpen = false"></div>
          <div class="picker-pop">
            <input class="picker-search" v-model="filterText" placeholder="🔍 筛选实验…"
                   @keydown.esc="pickerOpen = false">
            <div v-for="g in pickerGroups" :key="g.name" class="picker-group">
              <button class="picker-group-header" @click="toggleGroup(g.name)">
                <span class="caret" :class="{ open: isGroupOpen(g.name) }">▸</span>
                <span class="gname">{{ g.name }}</span>
                <span class="gcount">{{ g.items.length }}</span>
              </button>
              <div v-show="isGroupOpen(g.name)" class="picker-items">
                <button v-for="it in g.items" :key="it.key" class="picker-item"
                        :class="{ active: it.key === selected }" @click="pickExperiment(it.key)">
                  <span class="dim-chip" :class="dimClassOf(it.dim)">{{ it.dim }}</span>
                  <span class="iname">{{ it.name }}</span>
                </button>
              </div>
            </div>
            <p v-if="pickerGroups.length === 0" class="picker-empty">无匹配实验</p>
          </div>
        </template>
      </div>
      <span class="dim-badge" :class="dimClass" :title="dimensionHint">{{ currentDimension }}</span>
      <button class="primary" :disabled="state.status === 'running' || state.status === 'connecting' || !!currentExp3d"
              @click="startRun">▶ 运行</button>
      <button :disabled="state.status !== 'running'" @click="pause">⏸ 暂停</button>
      <button :disabled="state.status !== 'paused'" @click="play">▶ 继续</button>
      <button :disabled="state.status !== 'paused'" @click="step">⏭ 单步</button>
      <button :disabled="state.status === 'ended' || state.status === 'idle'" @click="end">■ 停止</button>
      <span class="status">{{ statusText() }}</span>
      <button class="ghost" @click="resetCamera()" title="复位视角（实验库 3D 项为重置实验）">⟲ 复位</button>
      <button class="ghost" @click="showParams = !showParams" v-if="currentPreset">
        {{ showParams ? '收起参数' : '展开参数' }}
      </button>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="showParams && currentPreset" class="params">
      <div class="param-group" v-for="el in currentPreset.elements" :key="el.id">
        <h3>{{ el.id }} <code>{{ el.type }}</code></h3>
        <div class="fields">
          <template v-if="el.type === 'e_field'">
            <label>场强 Ex (N/C)
              <input type="number" step="0.5" v-model.number="el.properties!.eFieldX" :disabled="busy">
            </label>
            <label>场强 Ey (N/C)
              <input type="number" step="0.5" v-model.number="el.properties!.eFieldY" :disabled="busy">
            </label>
          </template>
          <template v-else-if="el.type === 'b_field'">
            <label>磁感应强度 B (T)
              <input type="number" step="0.1" min="0" v-model.number="el.properties!.bField" :disabled="busy">
            </label>
            <label>磁场方向
              <select v-model="el.properties!.bDirection" :disabled="busy">
                <option value="out">⊙ 垂直纸面向外</option>
                <option value="in">⊗ 垂直纸面向内</option>
              </select>
            </label>
          </template>
          <template v-else-if="el.type === 'point_charge'">
            <label>质量 m (kg)
              <input type="number" step="0.5" min="0.1" v-model.number="el.properties!.mass" :disabled="busy">
            </label>
            <label>电荷量 q (C)
              <input type="number" step="0.5" v-model.number="el.properties!.charge" :disabled="busy">
            </label>
            <label>初速 vx (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.x" :disabled="busy">
            </label>
            <label>初速 vy (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.y" :disabled="busy">
            </label>
          </template>
          <template v-else-if="el.type !== 'wall' && el.type !== 'slope'">
            <label>质量 m
              <span class="unit-row">
                <input type="number" step="0.5" min="0.0001" v-model.number="el.properties!.mass" :disabled="busy">
                <button class="unit" @click="toggleMassUnit(el)" :disabled="busy"
                        :title="(massUnit[el.id] ?? 'kg') === 'kg' ? '切换为克' : '切换为千克'">
                  {{ massUnit[el.id] ?? 'kg' }}
                </button>
              </span>
            </label>
            <label>摩擦系数 μ<span class="unit-hint">0~1 无量纲</span>
              <input type="number" step="0.05" min="0" max="1" v-model.number="el.properties!.friction" :disabled="busy">
            </label>
            <label>弹性 e<span class="unit-hint">0~1 无量纲</span>
              <input type="number" step="0.1" min="0" max="1" v-model.number="el.properties!.restitution" :disabled="busy">
            </label>
            <label>初速 vx (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.x" :disabled="busy">
            </label>
            <label>初速 vy (m/s)
              <input type="number" step="1" v-model.number="el.initialState!.velocity!.y" :disabled="busy">
            </label>
          </template>
          <span v-else class="hint">固定元件（{{ el.type === 'slope' ? '斜面默认固定' : '地面' }}）</span>
        </div>
      </div>
      <div class="param-group">
        <h3>全局配置</h3>
        <div class="fields">
          <label>重力 gy (m/s²)<span class="unit-hint">0 = 无重力</span>
            <input type="number" step="0.5" v-model.number="currentPreset!.config.gravity.y" :disabled="busy">
          </label>
          <label>时长上限 (s)
            <input type="number" step="1" min="1" max="30" v-model.number="currentPreset!.config.maxDuration" :disabled="busy">
          </label>
        </div>
      </div>
    </section>

    <section class="content">
      <div v-if="currentExp3d" class="exp3d-wrap">
        <component :key="`${selected}-${exp3dKey}`" :is="currentExp3d.component" />
        <p class="exp3d-note">🖱 左键旋转 · 滚轮缩放 · 右键平移　｜　实验库 3D 引擎 · 演示模式（无步骤评分，完整版在「实验库」）</p>
      </div>
      <div class="canvas-wrap" v-show="!currentExp3d">
        <canvas ref="canvasRef"></canvas>
        <div v-if="state.keyEvents.length" class="events">
          <div v-for="(ev, i) in state.keyEvents" :key="i" class="event-tag">
            ⚡ {{ ev.label }} @ {{ ev.t.toFixed(2) }}s
          </div>
        </div>
      </div>
      <div class="chart-wrap" v-show="!currentExp3d">
        <div ref="chartRef" class="chart"></div>
        <div class="meta">
          <div>接收帧数: {{ state.frameCount }}</div>
          <div>关键事件: {{ state.keyEvents.length }}</div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sim-page { max-width: 1280px; margin: 0 auto; padding: 16px 24px; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.toolbar select, .toolbar button {
  background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer;
}
.toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
.toolbar .primary { background: #2b5c8f; border-color: #4a90d9; }
.toolbar .ghost { background: transparent; color: #8a8aa0; }
.status { color: #8a8aa0; font-size: 13px; margin-left: 8px; }
.dim-badge {
  font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px;
  border: 1px solid #2f2f4a; letter-spacing: 0.5px;
}
.dim-badge.d2 { color: #6cd9e8; border-color: #2a5c6c; background: rgba(108, 217, 232, 0.08); }
.dim-badge.d25 { color: #7fe3b3; border-color: #2a6c4a; background: rgba(62, 207, 142, 0.08); }
.dim-badge.d3 { color: #d9a1f0; border-color: #5c2a6c; background: rgba(176, 108, 230, 0.1); }

/* 可折叠分组实验选择器 */
.picker { position: relative; }
.picker-trigger {
  display: flex; align-items: center; gap: 8px; max-width: 380px;
  background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 7px 12px; font-size: 13px; cursor: pointer;
}
.picker-trigger:disabled { opacity: 0.45; cursor: not-allowed; }
.picker-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.caret { color: #8a8aa0; transition: transform 0.15s; font-size: 11px; }
.caret.open { transform: rotate(90deg); }
.picker-trigger .caret.open { transform: rotate(180deg); }
.picker-backdrop { position: fixed; inset: 0; z-index: 20; }
.picker-pop {
  position: absolute; top: calc(100% + 6px); left: 0; z-index: 21;
  width: 460px; max-width: 92vw; max-height: 430px; overflow-y: auto;
  background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px;
  padding: 8px; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}
.picker-search {
  width: 100%; background: #23233a; border: 1px solid #2f2f4a; border-radius: 6px;
  color: #e8e8f0; padding: 7px 10px; font-size: 12px; margin-bottom: 6px;
}
.picker-search:focus { outline: 1px solid #4a90d9; }
.picker-group-header {
  display: flex; align-items: center; gap: 6px; width: 100%;
  background: transparent; border: none; color: #b0b0cc; font-size: 12px;
  font-weight: 600; padding: 7px 6px; cursor: pointer; border-radius: 6px;
}
.picker-group-header:hover { background: #23233a; }
.picker-group-header .gname { flex: 1; text-align: left; }
.picker-group-header .gcount {
  font-size: 10px; color: #6c6c85; background: #23233a;
  border-radius: 999px; padding: 1px 7px;
}
.picker-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  background: transparent; border: none; color: #8a8aa0; font-size: 12px;
  padding: 6px 8px 6px 22px; cursor: pointer; border-radius: 6px; text-align: left;
}
.picker-item:hover { background: #23233a; color: #e8e8f0; }
.picker-item.active { background: #2b3a55; color: #e8e8f0; }
.picker-item .iname { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dim-chip {
  flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 1px 6px;
  border-radius: 999px; border: 1px solid #2f2f4a; letter-spacing: 0.3px;
}
.dim-chip.d2 { color: #6cd9e8; border-color: #2a5c6c; }
.dim-chip.d25 { color: #7fe3b3; border-color: #2a6c4a; }
.dim-chip.d3 { color: #d9a1f0; border-color: #5c2a6c; }
.picker-empty { color: #6c6c85; font-size: 12px; text-align: center; padding: 14px 0; }
.exp3d-wrap {
  grid-column: 1 / -1;
  background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px;
  overflow: hidden; padding: 10px; min-height: 540px;
}
.exp3d-note { margin: 8px 4px 0; font-size: 12px; color: #6c6c85; }
.error { color: #e05555; font-size: 13px; }
.params {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
  gap: 10px; margin-bottom: 10px;
}
.param-group {
  background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px;
  padding: 10px 14px 12px;
}
.param-group h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 8px; font-weight: 600; }
.param-group h3 code { color: #4a90d9; font-size: 11px; background: #23233a; padding: 1px 6px; border-radius: 4px; }
.param-group .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: 8px 10px; }
.param-group label {
  display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: #8a8aa0;
}
.param-group input {
  width: 100%; background: #23233a; border: 1px solid #2f2f4a; border-radius: 4px;
  color: #e8e8f0; padding: 4px 6px; font-size: 12px;
}
.param-group input:disabled { opacity: 0.45; }
.param-group .unit-row { display: flex; gap: 4px; align-items: stretch; }
.param-group .unit-row input { width: 100%; min-width: 0; flex: 1; }
.param-group button.unit {
  flex-shrink: 0; width: 38px; background: #2f2f4a; color: #8a8aa0;
  border: 1px solid #3d3d5e; border-radius: 4px; font-size: 11px; cursor: pointer;
}
.param-group .unit-hint { font-size: 10px; color: #565675; }
.param-group .hint { font-size: 11px; color: #6c6c85; }
.content { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; }
.canvas-wrap { position: relative; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-wrap canvas { display: block; width: 100%; height: 520px; }
.events { position: absolute; top: 10px; left: 10px; display: flex; flex-direction: column; gap: 6px; }
.event-tag {
  background: rgba(62, 207, 142, 0.15); border: 1px solid #3ecf8e; color: #7fe3b3;
  font-size: 11px; border-radius: 4px; padding: 2px 8px;
}
.chart-wrap { display: flex; flex-direction: column; gap: 8px; }
.chart { height: 460px; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; }
.meta { display: flex; gap: 18px; color: #6c6c85; font-size: 12px; }
@media (max-width: 960px) { .content { grid-template-columns: 1fr; } }
</style>
