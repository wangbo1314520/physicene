<script setup lang="ts">
/**
 * 静摩擦力的大小随拉力的变化（必修一/选必一）
 * 仪器：水平桌面 + 木块（G=10N）+ 弹簧测力计（可拖动手柄水平拉）
 * 物理：f静=F 直至 fmax=μs·N=6N，随后突降为滑动摩擦 fk=μk·N=4N；木块随拉力运动/静止
 * 交互：拖动画布上的测力计手柄设定 F（或用滑杆），记录 (F, f) 作 f-F 折线
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const N = 10, MU_S = 0.6, MU_K = 0.4, M = 1
const F_MAX = MU_S * N, F_K = MU_K * N

const F = ref(2)
const blockX = ref(0)   // 木块位置 px（相对起点）
const vx = ref(0)
const records = ref<{ F: number; f: number; moving: boolean }[]>([])
const moving = computed(() => vx.value > 1e-4)

/** 摩擦力大小：滑动（或拉力已超最大静摩擦）时为 fk，否则等于拉力 */
const f = computed(() => (moving.value || F.value > F_MAX ? F_K : F.value))

function reset() {
  blockX.value = 0; vx.value = 0
  records.value = []; lab.value?.loadPoints([])
}

function record() {
  records.value.push({ F: +F.value.toFixed(2), f: +f.value.toFixed(2), moving: moving.value })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.F, y: r.f })))
  emit('record', { rows: records.value, muS: MU_S, muK: MU_K, N })
}

function step(dt: number) {
  // 摩擦力与拉力反向：静止且 F≤fmax 时恰好抵消；否则为滑动摩擦 fk
  const friction = moving.value || F.value > F_MAX ? -F_K : -F.value
  const a = (F.value + friction) / M
  vx.value = Math.max(0, vx.value + a * dt)
  blockX.value += vx.value * 60 // px/s
  if (blockX.value > 380) blockX.value = 0 // 循环演示
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const groundY = h * 0.66
  // 桌面
  ctx.fillStyle = '#23233a'; ctx.fillRect(0, groundY, w, 12)
  ctx.strokeStyle = '#3d3d5e'; ctx.strokeRect(0, groundY, w, 12)
  // 木块
  const bx = 70 + blockX.value
  ctx.fillStyle = '#b07b4a'; ctx.fillRect(bx, groundY - 46, 52, 46)
  ctx.strokeStyle = '#d9a05a'; ctx.strokeRect(bx, groundY - 46, 52, 46)
  label(ctx, 'G = 10 N', bx + 26, groundY - 22, '#14142a', 11)
  // 弹簧测力计：壳体 + 刻度 + 指针 + 环 + 手柄箭头
  const sbX = bx + 52, sbY = groundY - 26
  const shellW = 150, shellH = 34
  ctx.fillStyle = '#f2ead7'; ctx.fillRect(sbX, sbY - shellH / 2, shellW, shellH)
  ctx.strokeStyle = '#8a8aa0'; ctx.strokeRect(sbX, sbY - shellH / 2, shellW, shellH)
  ctx.strokeStyle = '#14142a'; ctx.lineWidth = 1
  for (let i = 0; i <= 10; i++) {
    const x = sbX + 12 + (i / 10) * (shellW - 34)
    const tall = i % 2 === 0 ? 10 : 6
    ctx.beginPath(); ctx.moveTo(x, sbY - shellH / 2 + 4); ctx.lineTo(x, sbY - shellH / 2 + 4 + tall); ctx.stroke()
  }
  // 指针位置 ∝ F
  const px = sbX + 12 + Math.min(1, F.value / 10) * (shellW - 34)
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(px, sbY - shellH / 2); ctx.lineTo(px, sbY + shellH / 2 - 4); ctx.stroke()
  // 弹簧（锯齿）
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1.2
  ctx.beginPath(); ctx.moveTo(sbX - 26, sbY)
  const springW = 26, coils = 5, ext = 8 + Math.min(1, F.value / 10) * 8
  for (let i = 0; i < coils; i++) {
    ctx.lineTo(sbX - 26 + (i + 0.5) * (springW / coils), sbY - 6 + (i % 2 === 0 ? 0 : 6))
  }
  ctx.lineTo(sbX + ext * 0, sbY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(sbX - 26, sbY); ctx.lineTo(bx + 26, sbY); ctx.stroke()
  // 拉力箭头 + 手柄
  const hx = sbX + shellW + 34
  ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(sbX + shellW, sbY); ctx.lineTo(hx - 12, sbY); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(hx - 12, sbY); ctx.lineTo(hx - 20, sbY - 5); ctx.lineTo(hx - 20, sbY + 5); ctx.closePath()
  ctx.fillStyle = '#4A90D9'; ctx.fill()
  label(ctx, `F = ${F.value.toFixed(1)} N（拖我）`, hx - 6, sbY - 18, '#4A90D9', 11)
  // 状态
  const state = vx.value > 0.01 ? `滑动中：f = fk = ${F_K.toFixed(1)} N（恒定）`
    : F.value >= F_MAX ? '即将滑动！' : `静止：f静 = F = ${Math.min(F.value, F_MAX).toFixed(1)} N`
  label(ctx, state, w / 2, h - 26, vx.value > 0.01 ? '#6cd9e8' : F.value >= F_MAX ? '#E05555' : '#7fe3b3', 13)
  label(ctx, `μs = ${MU_S}（fmax = ${F_MAX} N）　μk = ${MU_K}（fk = ${F_K} N）`, w / 2, h - 10, '#6c6c85', 11)
}

let dragging = false
function onDown(e: PointerEvent) { dragging = true; onMove(e) }
function onMove(e: PointerEvent) {
  if (!dragging) return
  const c = canvasRef.value
  if (!c) return
  const x = e.clientX - c.getBoundingClientRect().left
  // 手柄横坐标映射到测力计刻度 0~10 N（半牛步进）
  const scaleStart = 70 + blockX.value + 52 + 12
  const scaleEnd = scaleStart + 116
  F.value = Math.round(Math.max(0, Math.min(10, ((x - scaleStart) / (scaleEnd - scaleStart)) * 10)) * 2) / 2
}
function onUp() { dragging = false }

onMounted(() => {
  loop = makeLoop((dt) => { step(dt); draw() })
})
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="静摩擦力的大小随拉力的变化"
    desc="水平拖动弹簧测力计手柄逐渐增大拉力 F：木块静止时 f静=F 同步增大；超过最大静摩擦 fmax=6N 后开始滑动，摩擦力突降为 fk=4N。"
    formula="f静 = F（≤ fmax = μs·N）　滑动后 f = μk·N"
    :axes="{ x: 'F', y: 'f', xUnit: 'N', yUnit: 'N' }">
    <template #controls>
      <label>拉力 F = {{ F.toFixed(1) }} N（也可拖画布手柄）
        <input type="range" min="0" max="10" step="0.5" v-model.number="F"></label>
      <div class="readout">F = {{ F.toFixed(1) }} N　f = {{ Math.abs(f).toFixed(1) }} N　{{ moving ? '（滑动）' : '（静止）' }}
木块速度 v = {{ vx.toFixed(2) }} m/s</div>
      <button class="btn alt" @click="record">📏 记录 (F, f)（{{ records.length }}）</button>
      <button class="btn ghost" @click="reset">⟲ 复位</button>
      <p class="hint">F 从 0 拉到 6 N 之间多记几组（45° 直线），越过 6 N 再记 1-2 组（突降为 4 N 平线）——经典 f-F 折线。</p>
    </template>
    <canvas ref="canvasRef" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp"></canvas>
  </LabPanel>
</template>
