<script setup lang="ts">
/**
 * 测反应时间（必修一 · 做一做）两种方法：
 * ① 变色点击：随机延时后色块变绿，立即点击，计时；
 * ② 落尺法（教材）：同伴松手直尺自由下落，你看到后捏住，读下落高度 h → t = √(2h/g)。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const method = ref<'click' | 'ruler'>('ruler')
// ── 变色点击 ──
const armed = ref(false), go = ref(false)
let goAt = 0
let timer = 0
const clickTimes = ref<number[]>([])
function startClick() {
  armed.value = true; go.value = false
  clearTimeout(timer)
  timer = window.setTimeout(() => { go.value = true; goAt = performance.now() }, 1200 + Math.random() * 2500)
}
function hitClick() {
  if (!armed.value) return
  if (!go.value) { armed.value = false; clearTimeout(timer); early.value = true; setTimeout(() => (early.value = false), 900); return }
  const ms = Math.round(performance.now() - goAt)
  clickTimes.value.push(ms)
  if (clickTimes.value.length > 5) clickTimes.value.shift()
  armed.value = false; go.value = false
  emit('record', { method: 'click', ms, avg: avgClick.value })
}
const early = ref(false)
const avgClick = computed(() => clickTimes.value.length
  ? Math.round(clickTimes.value.reduce((a, b) => a + b, 0) / clickTimes.value.length) : null)

// ── 落尺法 ──
const g = 9.8
const rulerState = ref<'hold' | 'falling' | 'caught'>('hold')
const fallY = ref(0)        // 尺下落距离 m
let fallT = 0
let releaseDelay = 0
let waiting = false
const catches = ref<{ h: number; t: number }[]>([])
function startRuler() {
  rulerState.value = 'hold'; fallY.value = 0; fallT = 0
  waiting = true
  releaseDelay = 0.8 + Math.random() * 2
}
function catchRuler() {
  if (rulerState.value !== 'falling') return
  rulerState.value = 'caught'
  const h = fallY.value
  const t = Math.sqrt((2 * h) / g)
  catches.value.push({ h: +(h * 100).toFixed(1), t: +t.toFixed(3) })
  if (catches.value.length > 5) catches.value.shift()
  emit('record', { method: 'ruler', h_cm: +(h * 100).toFixed(1), t_s: +t.toFixed(3) })
}
const avgRuler = computed(() => catches.value.length
  ? +(catches.value.reduce((a, b) => a + b.t, 0) / catches.value.length).toFixed(3) : null)

function step(dt: number) {
  if (method.value !== 'ruler') return
  if (waiting) {
    releaseDelay -= dt
    if (releaseDelay <= 0) { waiting = false; rulerState.value = 'falling' }
  }
  if (rulerState.value === 'falling') {
    fallT += dt
    fallY.value = 0.5 * g * fallT * fallT
    if (fallY.value > 0.6) { rulerState.value = 'caught'; catches.value.push({ h: 60, t: 0.35 }) } // 掉地：超时
  }
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  if (method.value === 'click') {
    const color = go.value ? '#3ecf8e' : armed.value ? '#2d2d4a' : '#23233a'
    ctx.fillStyle = color
    ctx.fillRect(40, 40, w - 80, h - 80)
    label(ctx, early.value ? '太早了！等变绿再点' : go.value ? '点！' : armed.value ? '等待变绿…' : '点击「开始」',
      w / 2, h / 2, go.value ? '#14142a' : '#8a8aa0', 26)
    return
  }
  // 落尺法：竖直直尺（60cm），上方"同伴手"，中部"你的手"（捏住位置固定）
  const rulerTop0 = 60, scale = (h - 140) / 0.6 // px per m
  const topY = rulerTop0 + fallY.value * scale
  const rx = w / 2
  ctx.fillStyle = '#d9a05a'; ctx.fillRect(rx - 14, topY, 28, 0.6 * scale)
  ctx.strokeStyle = '#14142a'; ctx.lineWidth = 1
  for (let cm = 0; cm <= 60; cm++) {
    const y = topY + (cm / 100) * scale
    const len = cm % 10 === 0 ? 14 : cm % 5 === 0 ? 9 : 5
    ctx.beginPath(); ctx.moveTo(rx - 14, y); ctx.lineTo(rx - 14 + len, y); ctx.stroke()
    if (cm % 10 === 0) label(ctx, `${cm}`, rx + 4, y, '#14142a', 9)
  }
  // 你的手（捏住位置 = 尺 0 刻度初始所在高度）
  const handY = rulerTop0
  ctx.fillStyle = rulerState.value === 'caught' ? '#3ecf8e' : '#b0b0cc'
  ctx.fillRect(rx - 40, handY - 12, 22, 24); ctx.fillRect(rx + 18, handY - 12, 22, 24)
  label(ctx, '你的手指（0 刻度处）', rx + 80, handY, '#8a8aa0', 11)
  // 同伴手
  label(ctx, waiting ? '同伴：准备松手…' : rulerState.value === 'falling' ? '同伴：已松手！' : '同伴持尺',
    rx, 30, '#8a8aa0', 12)
  if (rulerState.value === 'caught') {
    const y = handY
    ctx.strokeStyle = '#E05555'; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(rx - 60, y); ctx.lineTo(rx + 60, y); ctx.stroke(); ctx.setLineDash([])
    label(ctx, `捏住处读数 h = ${(fallY.value * 100).toFixed(1)} cm → t = √(2h/g) = ${Math.sqrt(2 * fallY.value / g).toFixed(3)} s`,
      w / 2, h - 20, '#7fe3b3', 13)
  } else if (rulerState.value === 'falling') {
    label(ctx, '快捏住！（点击画布）', w / 2, h - 20, '#F5C542', 13)
  } else {
    label(ctx, '点击「开始」，同伴将在随机时刻松手', w / 2, h - 20, '#6c6c85', 12)
  }
}

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => { loop?.stop(); clearTimeout(timer) })
</script>

<template>
  <LabPanel title="测反应时间" :graph="false"
    desc="人的反应时间约 0.15~0.25 s。落尺法：同伴松手让直尺自由下落，看到后立即捏住；读出下落距离 h，由 h=½gt² 反推反应时间。"
    formula="t = √(2h/g)">
    <template #controls>
      <div class="row">
        <button class="btn" :class="{ ghost: method !== 'ruler' }" @click="method = 'ruler'">落尺法</button>
        <button class="btn" :class="{ ghost: method !== 'click' }" @click="method = 'click'">变色点击</button>
      </div>
      <template v-if="method === 'ruler'">
        <button class="btn" @click="startRuler">▶ 开始（同伴准备松手）</button>
        <div class="readout">{{ catches.length ? catches.map((c, i) => `#${i + 1}  h=${c.h}cm  t=${c.t}s`).join('\n') + `\n平均反应时间 ${avgRuler} s` : '尚无记录' }}</div>
        <p class="hint">下落越远说明反应越慢：10 cm ≈ 0.14 s，20 cm ≈ 0.20 s，30 cm ≈ 0.25 s。</p>
      </template>
      <template v-else>
        <button class="btn" @click="startClick" :disabled="armed">▶ 开始</button>
        <div class="readout">{{ clickTimes.length ? clickTimes.map((t, i) => `#${i + 1}  ${t} ms`).join('\n') + `\n平均 ${avgClick} ms` : '尚无记录' }}</div>
      </template>
    </template>
    <canvas ref="canvasRef" @click="method === 'ruler' ? catchRuler() : hitClick()"></canvas>
  </LabPanel>
</template>
