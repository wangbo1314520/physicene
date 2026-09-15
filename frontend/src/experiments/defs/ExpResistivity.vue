<script setup lang="ts">
/**
 * 导体电阻率的测量（必修三）
 * 仪器：伏安法电路（电源、开关、电流表、待测镍铬丝、电压表）+ 下方米尺，滑片改变接入长度 L；
 * 螺旋测微器读直径 d。记录多组 (L, R=U/I) → R-L 拟合斜率 k → ρ = kS/L。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { battery, currentDots, fitCanvas, label, makeLoop, meter, resistor, switchSym, wire } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const RHO = 1.1e-6      // 镍铬合金电阻率 Ω·m
const D_MM = 0.50       // 螺旋测微器读数
const S = Math.PI * (D_MM / 2000) ** 2
const R0 = 2            // 滑动变阻器限流 Ω
const E = 3.0

const L = ref(0.6)      // m
const closed = ref(true)
const records = ref<{ L: number; R: number }[]>([])
const U = computed(() => I.value * Rw())
const Rw = () => (RHO * L.value) / S
const I = computed(() => (closed.value ? E / (R0 + Rw()) : 0))
const slopeRho = computed(() => {
  const rs = records.value
  if (rs.length < 2) return null
  const n = rs.length
  const sx = rs.reduce((s, r) => s + r.L, 0), sy = rs.reduce((s, r) => s + r.R, 0)
  const sxx = rs.reduce((s, r) => s + r.L * r.L, 0), sxy = rs.reduce((s, r) => s + r.L * r.R, 0)
  const k = (n * sxy - sx * sy) / (n * sxx - sx * sx)
  return k * S
})

function record() {
  if (!closed.value) return
  const noise = () => 1 + (Math.random() - 0.5) * 0.02
  records.value.push({ L: +L.value.toFixed(2), R: +(Rw() * noise()).toFixed(3) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.L, y: r.R })))
  emit('record', { rows: records.value, d_mm: D_MM, rhoFromSlope: slopeRho.value, rhoTrue: RHO })
}

let phase = 0
function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const pad = 46, top = 56, bot = h - 76
  const left = pad, right = w - pad
  const midY = (top + bot) / 2
  // 主回路（上）：电源—开关—电流表—待测电阻丝（底部）
  wire(ctx, left, top, right, top); wire(ctx, left, top, left, bot); wire(ctx, right, top, right, bot)
  battery(ctx, left, midY - 40)
  label(ctx, `E=${E}V`, left, midY - 40 + 58)
  switchSym(ctx, (left + right) / 2 - 80, top, closed.value)
  label(ctx, closed.value ? '闭合' : '断开', (left + right) / 2 - 80, top - 16)
  resistor(ctx, (left + right) / 2 + 40, top, true, '保护电阻')
  meter(ctx, right - 46, midY - 70, 'A', I.value * 1000, 600)
  label(ctx, 'mA', right - 46, midY - 70 + 38)
  // 待测金属丝（底部）：固定端子 left+40，滑片在 x(L)
  const x0 = left + 40, x1 = right - 40
  const xSlide = x0 + (L.value / 1.0) * (x1 - x0)
  ctx.strokeStyle = '#d9a05a'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x1, bot); ctx.stroke()
  ctx.lineWidth = 2; ctx.strokeStyle = '#8a8aa0'
  ctx.beginPath(); ctx.moveTo(x0, bot); ctx.lineTo(x0, bot - 26); ctx.stroke() // 左端接线
  // 电压表并联在接入段
  ctx.beginPath(); ctx.moveTo(x0, bot - 26); ctx.lineTo(x0, bot - 44); ctx.lineTo(xSlide, bot - 44); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(xSlide, bot); ctx.lineTo(xSlide, bot - 30); ctx.stroke()
  meter(ctx, (x0 + xSlide) / 2, bot - 66, 'V', U.value, 3)
  // 滑片
  ctx.fillStyle = '#4A90D9'
  ctx.fillRect(xSlide - 4, bot - 12, 8, 24)
  label(ctx, '滑片', xSlide, bot + 16, '#4A90D9', 11)
  // 米尺
  const yR = bot + 30
  ctx.fillStyle = '#d9a05a'; ctx.fillRect(x0 - 10, yR, x1 - x0 + 20, 18)
  ctx.strokeStyle = '#14142a'; ctx.lineWidth = 1
  for (let cm = 0; cm <= 100; cm++) {
    const x = x0 + (cm / 100) * (x1 - x0)
    const tall = cm % 10 === 0 ? 10 : cm % 5 === 0 ? 7 : 4
    ctx.beginPath(); ctx.moveTo(x, yR); ctx.lineTo(x, yR + tall); ctx.stroke()
    if (cm % 20 === 0) label(ctx, `${cm}`, x, yR + 14, '#14142a', 9)
  }
  // 电流动画
  if (closed.value) {
    phase = (phase + 0.004 * (I.value * 1000) / 300) % 1
    currentDots(ctx, [[left, midY - 14], [left, top], [right, top], [right, bot], [xSlide, bot], [x0, bot], [left, bot]], phase, 1)
  }
  label(ctx, `L = ${L.value.toFixed(2)} m　U = ${U.value.toFixed(3)} V　I = ${(I.value * 1000).toFixed(0)} mA　R = U/I = ${(U.value / Math.max(I.value, 1e-9)).toFixed(3)} Ω`,
    w / 2, h - 10, '#7fe3b3', 12)
}

onMounted(() => { loop = makeLoop(() => draw()) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="导体电阻率的测量（伏安法）"
    desc="镍铬丝直径 d = 0.500 mm（螺旋测微器已读）。移动滑片改变接入长度 L，读出 (U, I)，R=U/I。多组数据作 R-L 图，斜率 k → ρ = kS。"
    formula="R = ρL/S　→　ρ = k·S（k 为 R-L 斜率，S = πd²/4）"
    :axes="{ x: 'L', y: 'R', xUnit: 'm', yUnit: 'Ω' }">
    <template #controls>
      <label>接入长度 L = {{ L.toFixed(2) }} m<input type="range" min="0.2" max="1" step="0.05" v-model.number="L"></label>
      <button class="btn ghost" @click="closed = !closed">{{ closed ? '断开开关' : '闭合开关' }}</button>
      <div class="readout">螺旋测微器：d = 0.500 mm
S = πd²/4 = {{ (S * 1e6).toFixed(3) }} mm²
U = {{ U.toFixed(3) }} V　I = {{ (I * 1000).toFixed(0) }} mA
R = U/I = {{ (U / Math.max(I, 1e-9)).toFixed(3) }} Ω</div>
      <button class="btn alt" :disabled="!closed" @click="record">📏 记录 (L, R)（{{ records.length }}）</button>
      <div class="readout" v-if="slopeRho">由斜率求得 ρ = {{ (slopeRho * 1e6).toFixed(3) }}×10⁻⁶ Ω·m
（真值 1.100×10⁻⁶，镍铬合金）</div>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
