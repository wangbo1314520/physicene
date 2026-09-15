<script setup lang="ts">
/**
 * 运动的合成与分解（必修二 · 教材演示：红蜡块）
 * 玻璃管竖直、内有红蜡块匀速上浮（v_y）；玻璃管同时水平运动（v_x 匀速或匀加速）。
 * 蜡块合运动轨迹：两分运动均匀速 → 直线；水平匀加速 → 抛物线。实时画速度分量与合速度矢量。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const vx = ref(0.2)   // m/s
const vy = ref(0.3)   // m/s（蜡块上浮）
const ax = ref(0)     // 水平加速度（0=匀速）
const running = ref(false)
let t = 0
const pos = ref({ x: 0, y: 0 })
const trail: { x: number; y: number }[] = []
const TUBE_H = 1.0

function start() { running.value = true; t = 0; pos.value = { x: 0, y: 0 }; trail.length = 0 }
function step(dt: number) {
  if (!running.value) return
  t += dt
  pos.value = { x: vx.value * t + 0.5 * ax.value * t * t, y: vy.value * t }
  trail.push({ ...pos.value })
  if (pos.value.y >= TUBE_H) { running.value = false }
}
const vNow = computed(() => ({ x: vx.value + ax.value * t, y: vy.value }))
const speed = computed(() => Math.hypot(vNow.value.x, vNow.value.y))
const angleDeg = computed(() => Math.atan2(vNow.value.y, vNow.value.x) * 180 / Math.PI)

function record() {
  if (trail.length < 3) return
  const pts = trail.filter((_, i) => i % 8 === 0).map((p) => ({ x: +p.x.toFixed(3), y: +p.y.toFixed(3) }))
  lab.value?.loadPoints(pts)
  emit('record', { vx: vx.value, vy: vy.value, ax: ax.value, samples: pts.length,
    shape: ax.value === 0 ? '直线' : '抛物线', tanTheta: +(vy.value / vx.value).toFixed(3) })
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const S = Math.min((w - 120) / 1.6, (h - 80) / 1.15)
  const ox = 60, oy = h - 40
  const X = (x: number) => ox + x * S, Y = (y: number) => oy - y * S
  // 地面参考 + 网格
  ctx.strokeStyle = '#23233a'; ctx.lineWidth = 1
  for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(X(i * 0.2), Y(0)); ctx.lineTo(X(i * 0.2), Y(TUBE_H)); ctx.stroke() }
  for (let j = 0; j <= 5; j++) { ctx.beginPath(); ctx.moveTo(X(0), Y(j * 0.2)); ctx.lineTo(X(1.6), Y(j * 0.2)); ctx.stroke() }
  // 玻璃管（随水平运动）
  const tubeX = X(pos.value.x)
  ctx.fillStyle = 'rgba(108,217,232,0.10)'; ctx.strokeStyle = '#6cd9e8'; ctx.lineWidth = 1.5
  ctx.fillRect(tubeX - 14, Y(TUBE_H), 28, TUBE_H * S); ctx.strokeRect(tubeX - 14, Y(TUBE_H), 28, TUBE_H * S)
  // 轨迹
  ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2
  ctx.beginPath(); trail.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke()
  // 蜡块
  const bx = X(pos.value.x), by = Y(pos.value.y)
  ctx.fillStyle = '#E05555'; ctx.fillRect(bx - 10, by - 8, 20, 16)
  // 速度矢量：vx 蓝、vy 绿、合速度 黄
  const vs = 0.9 * S
  arrow(ctx, bx, by, bx + vNow.value.x * vs, by, '#4A90D9', 'vₓ')
  arrow(ctx, bx, by, bx, by - vNow.value.y * vs, '#3ecf8e', 'v_y')
  arrow(ctx, bx, by, bx + vNow.value.x * vs, by - vNow.value.y * vs, '#F5C542', 'v')
  label(ctx, `v = √(vₓ²+v_y²) = ${speed.value.toFixed(3)} m/s　θ = ${angleDeg.value.toFixed(1)}°　轨迹：${ax.value === 0 ? '直线（两分运动均匀速）' : '抛物线（水平匀加速）'}`,
    w / 2, 18, '#7fe3b3', 12)
  if (!running.value && trail.length === 0) label(ctx, '点击「开始」：蜡块上浮 + 玻璃管水平运动', w / 2, h / 2, '#565675', 13)
}
function arrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string, name: string) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
  if (len < 2) return
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
  const a = Math.atan2(dy, dx)
  ctx.beginPath(); ctx.moveTo(x2, y2)
  ctx.lineTo(x2 - 9 * Math.cos(a - 0.4), y2 - 9 * Math.sin(a - 0.4)); ctx.lineTo(x2 - 9 * Math.cos(a + 0.4), y2 - 9 * Math.sin(a + 0.4)); ctx.fill()
  label(ctx, name, x2 + 10 * Math.cos(a), y2 + 10 * Math.sin(a) - 8, color, 11)
}

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="运动的合成与分解（红蜡块）"
    desc="红蜡块在竖直玻璃管中匀速上浮，同时玻璃管沿水平方向运动。蜡块的实际运动是两个分运动的合成：均匀速时轨迹为直线，水平匀加速时为抛物线。"
    formula="v = √(vₓ² + v_y²)　tanθ = v_y / vₓ　分运动互不影响、具有等时性"
    :axes="{ x: 'x', y: 'y', xUnit: 'm', yUnit: 'm' }">
    <template #controls>
      <label>水平速度 vₓ = {{ vx.toFixed(2) }} m/s<input type="range" min="0" max="0.6" step="0.05" v-model.number="vx"></label>
      <label>上浮速度 v_y = {{ vy.toFixed(2) }} m/s<input type="range" min="0.1" max="0.6" step="0.05" v-model.number="vy"></label>
      <label>水平加速度 aₓ = {{ ax.toFixed(2) }} m/s²（0 = 匀速）<input type="range" min="0" max="0.6" step="0.1" v-model.number="ax"></label>
      <button class="btn" @click="start">▶ 开始</button>
      <div class="readout">合速度 v = {{ speed.toFixed(3) }} m/s
方向 θ = {{ angleDeg.toFixed(1) }}°　tanθ = {{ vx > 0 ? (vy / vx).toFixed(2) : '∞' }}</div>
      <button class="btn alt" :disabled="running || trail.length < 3" @click="record">📏 把轨迹送到坐标纸</button>
      <p class="hint">aₓ = 0 时坐标纸拟合为过原点直线，斜率 = v_y/vₓ；aₓ ≠ 0 则明显偏离直线（抛物线）。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
