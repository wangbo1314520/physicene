<script setup lang="ts">
/**
 * 测量纸带的平均速度和瞬时速度（必修一）
 * 仪器：电磁打点计时器打出纸带 → 刻度尺读计数点位置 → v̄=Δx/Δt，v_n=(x_{n+1}−x_{n−1})/2T
 * 交互：调 a/v₀ → 「打点」动画生成纸带 → 点击计数点读 x → 记录 → v-t 作图（斜率=a）
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'
import { TapeSampler } from '../renderers/sim25d/TapeSampler'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const a = ref(1.5)
const v0 = ref(0.3)
const T = 0.1 // 计数点间隔 s
let positions: number[] = [] // 每 0.02s 一个点（m）
const counting = ref<{ n: number; x: number; t: number }[]>([])
const punchProgress = ref(0)
const selected = ref<number | null>(null)
const records = ref<{ n: number; t: number; x: number; v: number | null }[]>([])

function punch() {
  const ts = TapeSampler.generate(0, v0.value, a.value, 1.2, 0.02, 0.0004)
  positions = ts.points.map((p) => p.x)
  counting.value = ts.countingPoints.map((c) => ({ n: c.index, x: c.x, t: c.t }))
  punchProgress.value = 0
  selected.value = null
  records.value = []
  lab.value?.loadPoints([])
}

const sel = computed(() => (selected.value == null ? null : counting.value[selected.value]))
/** 中间时刻瞬时速度：相邻两计数点位移 / 2T */
const vInst = computed(() => {
  const i = selected.value
  if (i == null || i <= 0 || i >= counting.value.length - 1) return null
  return (counting.value[i + 1].x - counting.value[i - 1].x) / (2 * T)
})
const vAvgNext = computed(() => {
  const i = selected.value
  if (i == null || i >= counting.value.length - 1) return null
  return (counting.value[i + 1].x - counting.value[i].x) / T
})

function record() {
  if (!sel.value || vInst.value == null) return
  records.value.push({ n: sel.value.n, t: sel.value.t, x: sel.value.x, v: vInst.value })
  lab.value?.loadPoints(records.value.map((r) => ({ x: +r.t.toFixed(2), y: +(r.v as number).toFixed(4) })))
  emit('record', { rows: records.value, a: a.value, v0: v0.value })
}

// ── 画布：打点计时器 + 纸带 + 刻度尺 ──
const SCALE = 520 // px / m
const X0 = 60
function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const yTape = h * 0.42
  ctx.fillStyle = '#23233a'; ctx.fillRect(8, yTape - 44, 44, 88)
  ctx.strokeStyle = '#3d3d5e'; ctx.strokeRect(8, yTape - 44, 44, 88)
  label(ctx, '打点', 30, yTape - 8); label(ctx, '计时器', 30, yTape + 8)
  ctx.fillStyle = '#f2ead7'
  ctx.fillRect(X0, yTape - 16, w - X0 - 10, 32)
  const shown = Math.floor(positions.length * punchProgress.value)
  ctx.fillStyle = '#2d2d4a'
  for (let i = 0; i < shown; i++) {
    const x = X0 + positions[i] * SCALE
    if (x > w - 10) break
    ctx.beginPath(); ctx.arc(x, yTape, 1.6, 0, Math.PI * 2); ctx.fill()
  }
  counting.value.forEach((cp, i) => {
    if (i * 5 >= shown) return
    const x = X0 + cp.x * SCALE
    if (x > w - 10) return
    const isSel = selected.value === i
    ctx.strokeStyle = isSel ? '#E05555' : '#4A90D9'; ctx.lineWidth = isSel ? 2.5 : 1.5
    ctx.beginPath(); ctx.arc(x, yTape, 6, 0, Math.PI * 2); ctx.stroke()
    label(ctx, String(cp.n), x, yTape - 26, isSel ? '#E05555' : '#8a8aa0', 11)
  })
  const yRuler = yTape + 44
  ctx.fillStyle = '#d9a05a'; ctx.fillRect(X0 - 8, yRuler, w - X0, 26)
  ctx.strokeStyle = '#14142a'; ctx.lineWidth = 1
  for (let cm = 0; cm * 0.01 * SCALE < w - X0; cm++) {
    const x = X0 + cm * 0.01 * SCALE
    const tall = cm % 10 === 0 ? 14 : cm % 5 === 0 ? 9 : 5
    ctx.beginPath(); ctx.moveTo(x, yRuler); ctx.lineTo(x, yRuler + tall); ctx.stroke()
    if (cm % 10 === 0) label(ctx, `${cm}`, x, yRuler + 20, '#14142a', 10)
  }
  label(ctx, 'cm', w - 22, yRuler + 20, '#14142a', 10)
  if (sel.value) {
    const x = X0 + sel.value.x * SCALE
    ctx.strokeStyle = '#E05555'; ctx.setLineDash([4, 3])
    ctx.beginPath(); ctx.moveTo(x, yTape + 8); ctx.lineTo(x, yRuler); ctx.stroke()
    ctx.setLineDash([])
    label(ctx, `x${sel.value.n} = ${(sel.value.x * 100).toFixed(2)} cm`, x, yRuler + 42, '#E05555', 12)
  }
  if (!positions.length) label(ctx, '点击「打点」生成纸带', w / 2, h * 0.8, '#565675', 13)
}

function onClick(e: MouseEvent) {
  const c = canvasRef.value
  if (!c || !counting.value.length) return
  const mx = e.clientX - c.getBoundingClientRect().left
  let best = -1, bestD = 14
  counting.value.forEach((cp, i) => {
    const d = Math.abs(X0 + cp.x * SCALE - mx)
    if (d < bestD) { bestD = d; best = i }
  })
  if (best >= 0) selected.value = best
}

onMounted(() => {
  loop = makeLoop((dt) => {
    if (positions.length && punchProgress.value < 1) punchProgress.value = Math.min(1, punchProgress.value + dt / 1.2)
    draw()
  })
})
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="测量纸带的平均速度和瞬时速度"
    desc="打点计时器 50 Hz（T=0.02 s），每 5 个间隔取一个计数点（Δt=0.1 s）。点击计数点用刻度尺读位置。"
    formula="v̄ = Δx/Δt　　v_n = (x_{n+1} − x_{n−1}) / 2T"
    :axes="{ x: 't', y: 'v', xUnit: 's', yUnit: 'm/s' }">
    <template #controls>
      <label>小车加速度 a = {{ a.toFixed(1) }} m/s²<input type="range" min="0.5" max="3" step="0.1" v-model.number="a"></label>
      <label>初速度 v₀ = {{ v0.toFixed(1) }} m/s<input type="range" min="0" max="1" step="0.1" v-model.number="v0"></label>
      <button class="btn" @click="punch">⚡ 打点（生成纸带）</button>
      <div class="readout">{{ sel
        ? `计数点 ${sel.n}：x = ${(sel.x * 100).toFixed(2)} cm，t = ${sel.t.toFixed(1)} s\n`
          + (vAvgNext != null ? `到下一点平均速度 v̄ = ${vAvgNext.toFixed(3)} m/s\n` : '')
          + (vInst != null ? `瞬时速度 v${sel.n} = ${vInst.toFixed(3)} m/s` : '（端点无法求瞬时速度）')
        : '点击纸带上的计数点读数' }}</div>
      <button class="btn alt" :disabled="!sel || vInst == null" @click="record">📏 记录（{{ records.length }} 组）</button>
      <p class="hint">记录 ≥3 个点后坐标纸拟合 v-t 直线，斜率即加速度 a</p>
    </template>
    <canvas ref="canvasRef" @click="onClick"></canvas>
  </LabPanel>
</template>
