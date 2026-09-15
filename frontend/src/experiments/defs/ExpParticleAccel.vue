<script setup lang="ts">
/**
 * 带电粒子在电场中的加速与偏转（必修三 · 示波管原理）
 * 电子从阴极 K 出发，经加速电压 U₁ 获得 v₀=√(2eU₁/m)，进入偏转板（长 L、间距 d、电压 U₂）做类平抛，
 * 出板后直线飞向荧光屏。y₁ = U₂L²/(4dU₁)，屏上偏移 Y = y₁ + D·tanθ，tanθ = U₂L/(2dU₁)。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const E_M = 1.76e11 // e/m
const U1 = ref(1000), U2 = ref(100)
const Lp = 0.04, d = 0.01, D = 0.15 // m
const v0 = computed(() => Math.sqrt(2 * E_M * U1.value))
const y1 = computed(() => (U2.value * Lp * Lp) / (4 * d * U1.value))          // 出板偏移 m
const tanTheta = computed(() => (U2.value * Lp) / (2 * d * U1.value))
const Y = computed(() => y1.value + D * tanTheta.value)                       // 屏上偏移 m
const records = ref<{ U2: number; Y: number }[]>([])
let phase = 0

function record() {
  records.value.push({ U2: U2.value, Y: +(Y.value * 100).toFixed(2) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.U2, y: r.Y })))
  emit('record', { rows: records.value, U1: U1.value, v0: +v0.value.toExponential(3) })
}

/** 电子沿管轴归一化位置 s∈[0,1] → 屏幕坐标（x 沿轴，y 偏移 m） */
function electronPos(s: number): { x: number; y: number } {
  // 分区：加速区 0~0.2，漂移 0.2~0.35，偏转板 0.35~0.55，出板到屏 0.55~1
  if (s < 0.35) return { x: s, y: 0 }
  if (s < 0.55) {
    const f = (s - 0.35) / 0.2 // 板内比例
    return { x: s, y: y1.value * f * f }
  }
  const f = (s - 0.55) / 0.45
  return { x: s, y: y1.value + D * tanTheta.value * f }
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const axisY = h / 2, x0 = 30, x1 = w - 40
  const X = (s: number) => x0 + s * (x1 - x0)
  const yScale = 1400 // px per m（偏移夸大显示）
  const Yp = (y: number) => axisY - y * yScale
  // 管壳
  ctx.strokeStyle = '#3d3d5e'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(x0 - 10, axisY - 90, x1 - x0 + 30, 180, 30); ctx.stroke()
  // 阴极 K / 加速阳极 A（带孔）
  ctx.fillStyle = '#E05555'; ctx.fillRect(X(0) - 4, axisY - 14, 6, 28); label(ctx, 'K', X(0), axisY + 30, '#E05555', 12)
  ctx.fillStyle = '#4A90D9'; ctx.fillRect(X(0.2) - 3, axisY - 40, 6, 32); ctx.fillRect(X(0.2) - 3, axisY + 8, 6, 32)
  label(ctx, `A　U₁=${U1.value}V`, X(0.2), axisY + 56, '#4A90D9', 12)
  // 加速电场箭头（K→A 方向 E 指向 K，电子受力向右）
  for (let i = 0; i < 3; i++) {
    const yy = axisY - 24 + i * 24
    ctx.strokeStyle = 'rgba(62,207,142,0.6)'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(X(0.18), yy); ctx.lineTo(X(0.03), yy); ctx.stroke()
  }
  // 偏转板
  const plateTop = axisY - d * yScale * 3, plateBot = axisY + d * yScale * 3
  ctx.fillStyle = U2.value >= 0 ? '#E05555' : '#4A90D9'; ctx.fillRect(X(0.35), plateTop - 5, X(0.55) - X(0.35), 5)
  ctx.fillStyle = U2.value >= 0 ? '#4A90D9' : '#E05555'; ctx.fillRect(X(0.35), plateBot, X(0.55) - X(0.35), 5)
  label(ctx, `${U2.value >= 0 ? '+' : '−'}`, X(0.45), plateTop - 16, '#e8e8f0', 13)
  label(ctx, `${U2.value >= 0 ? '−' : '+'}　U₂=${U2.value}V`, X(0.45), plateBot + 18, '#e8e8f0', 12)
  // 荧光屏
  ctx.fillStyle = '#23402e'; ctx.fillRect(X(1) - 2, axisY - 80, 6, 160)
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1
  for (let cm = -5; cm <= 5; cm++) {
    const yy = Yp(cm / 100)
    ctx.beginPath(); ctx.moveTo(X(1) + 6, yy); ctx.lineTo(X(1) + (cm % 5 === 0 ? 14 : 9), yy); ctx.stroke()
  }
  // 电子束轨迹 + 流动电子
  ctx.strokeStyle = 'rgba(108,217,232,0.5)'; ctx.lineWidth = 2
  ctx.beginPath()
  for (let i = 0; i <= 100; i++) { const p = electronPos(i / 100); i ? ctx.lineTo(X(p.x), Yp(p.y)) : ctx.moveTo(X(p.x), Yp(p.y)) }
  ctx.stroke()
  ctx.fillStyle = '#6cd9e8'
  for (let k = 0; k < 14; k++) {
    const s = ((phase + k / 14) % 1)
    const p = electronPos(s)
    // 加速区速度慢（点密），之后匀速
    ctx.beginPath(); ctx.arc(X(p.x), Yp(p.y), s < 0.2 ? 2.2 : 3, 0, Math.PI * 2); ctx.fill()
  }
  // 光点
  const sy = Yp(Y.value)
  const glow = ctx.createRadialGradient(X(1) + 1, sy, 1, X(1) + 1, sy, 14)
  glow.addColorStop(0, 'rgba(127,227,179,1)'); glow.addColorStop(1, 'rgba(127,227,179,0)')
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(X(1) + 1, sy, 14, 0, Math.PI * 2); ctx.fill()
  label(ctx, `v₀ = √(2eU₁/m) = ${(v0.value / 1e6).toFixed(2)}×10⁶ m/s　y₁ = ${(y1.value * 100).toFixed(2)} cm　屏上 Y = ${(Y.value * 100).toFixed(2)} cm`,
    w / 2, h - 12, '#7fe3b3', 12)
}

onMounted(() => { loop = makeLoop((dt) => { phase = (phase + dt * 0.35) % 1; draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="带电粒子在电场中的加速与偏转（示波管）"
    desc="电子经加速电场获得速度 v₀，垂直进入偏转电场做类平抛运动，出板后沿直线打到荧光屏。偏转量与 U₂ 成正比、与 U₁ 成反比——这就是示波器显示波形的原理。"
    formula="eU₁ = ½mv₀²　y₁ = U₂L²/(4dU₁)　Y = y₁ + D·U₂L/(2dU₁)"
    :axes="{ x: 'U₂', y: 'Y', xUnit: 'V', yUnit: 'cm' }">
    <template #controls>
      <label>加速电压 U₁ = {{ U1 }} V<input type="range" min="500" max="3000" step="100" v-model.number="U1"></label>
      <label>偏转电压 U₂ = {{ U2 }} V<input type="range" min="-200" max="200" step="10" v-model.number="U2"></label>
      <div class="readout">v₀ = {{ (v0 / 1e6).toFixed(2) }}×10⁶ m/s
y₁ = {{ (y1 * 100).toFixed(2) }} cm　tanθ = {{ tanTheta.toFixed(3) }}
屏上偏移 Y = {{ (Y * 100).toFixed(2) }} cm</div>
      <button class="btn alt" @click="record">📏 记录 (U₂, Y)（{{ records.length }}）</button>
      <p class="hint">固定 U₁ 改 U₂：Y-U₂ 为过原点直线（示波器 Y 轴线性）；增大 U₁ 电子更快、偏转变小。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
