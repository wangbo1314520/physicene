<script setup lang="ts">
/**
 * 伽利略斜面实验（必修一 · 演示）
 * 小球从左斜面定高释放，滚上右斜面：无摩擦时到达同一高度；右斜面越平缓滚得越远；
 * 外推到水平且无摩擦 → 永远滚下去（惯性）。摩擦滑杆演示"越光滑滚得越远"。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const g = 9.8
const h0 = 1.0                 // 释放高度 m
const mu = ref(0.05)           // 摩擦系数
const angleDeg = ref(20)       // 右斜面倾角（0 = 水平）
const running = ref(false)
// 轨道参数化：s 为沿轨道路径长度；左斜面固定 30°
const LEFT_ANGLE = 30 * Math.PI / 180
const leftLen = h0 / Math.sin(LEFT_ANGLE)
const flatLen = 3.0
let s = 0, v = 0
const trail: { x: number; y: number }[] = []
const maxHeightReached = ref(0)
const stopDist = ref<number | null>(null)
const records = ref<{ mu: number; angle: number; dist: number }[]>([])

const rightAngle = computed(() => angleDeg.value * Math.PI / 180)

/** 路径 s → 世界坐标 (x, y) 与当地坡角 */
function pos(sv: number): { x: number; y: number; slope: number } {
  if (sv < leftLen) {
    const t = leftLen - sv
    return { x: -flatLen / 2 - t * Math.cos(LEFT_ANGLE), y: t * Math.sin(LEFT_ANGLE), slope: -LEFT_ANGLE }
  }
  const s2 = sv - leftLen
  if (s2 < flatLen) return { x: -flatLen / 2 + s2, y: 0, slope: 0 }
  const s3 = s2 - flatLen
  return { x: flatLen / 2 + s3 * Math.cos(rightAngle.value), y: s3 * Math.sin(rightAngle.value), slope: rightAngle.value }
}

function start() {
  s = 0; v = 0; running.value = true; trail.length = 0
  maxHeightReached.value = 0; stopDist.value = null
}
function step(dt: number) {
  if (!running.value) return
  const h = dt / 4
  for (let i = 0; i < 4; i++) {
    const p = pos(s)
    const dir = Math.sign(v) || 1
    const a = -g * Math.sin(p.slope) - mu.value * g * Math.cos(p.slope) * dir
    const vNew = v + a * h
    // 水平面上摩擦不能使球反向：速度过零即停止，记录从左斜面底部起的滚行距离
    if (p.slope === 0 && v !== 0 && Math.sign(vNew) !== Math.sign(v)) {
      v = 0; running.value = false
      if (stopDist.value == null) stopDist.value = s - leftLen
      break
    }
    v = vNew
    s += v * h
    if (s < 0) { s = 0; v = 0 }
    const q = pos(s)
    maxHeightReached.value = Math.max(maxHeightReached.value, q.y)
    // 右斜面上到最高点（速度归零）：记录沿轨道滚行距离
    if (q.slope > 0 && v <= 0 && stopDist.value == null) stopDist.value = s - leftLen
  }
  // 理想情形：水平且无摩擦 → 匀速滚出画面，标记为永不停止
  if (angleDeg.value === 0 && mu.value === 0 && s > leftLen + 14) { running.value = false; stopDist.value = Infinity }
  const p = pos(s)
  trail.push({ x: p.x, y: p.y })
  if (trail.length > 600) trail.shift()
}

function record() {
  if (stopDist.value == null || !Number.isFinite(stopDist.value)) return
  records.value.push({ mu: mu.value, angle: angleDeg.value, dist: +stopDist.value.toFixed(2) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.mu, y: r.dist })))
  emit('record', { rows: records.value, h0 })
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const scale = Math.min(w / 9, h / 2.6)
  const ox = w * 0.42, oy = h * 0.8
  const X = (x: number) => ox + x * scale, Y = (y: number) => oy - y * scale
  // 轨道
  ctx.strokeStyle = '#d9a05a'; ctx.lineWidth = 3
  ctx.beginPath()
  const pL = pos(0), pF0 = pos(leftLen), pF1 = pos(leftLen + flatLen), pR = pos(leftLen + flatLen + 3)
  ctx.moveTo(X(pL.x), Y(pL.y)); ctx.lineTo(X(pF0.x), Y(pF0.y)); ctx.lineTo(X(pF1.x), Y(pF1.y)); ctx.lineTo(X(pR.x), Y(pR.y))
  ctx.stroke()
  // 释放高度参考线
  ctx.strokeStyle = '#565675'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(X(pL.x) - 10, Y(h0)); ctx.lineTo(X(pR.x) + 10, Y(h0)); ctx.stroke(); ctx.setLineDash([])
  label(ctx, `h₀ = ${h0} m`, X(pL.x) - 8, Y(h0) - 10, '#8a8aa0', 11)
  // 轨迹
  ctx.strokeStyle = 'rgba(245,197,66,0.5)'; ctx.lineWidth = 1.5
  ctx.beginPath(); trail.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y)))); ctx.stroke()
  // 小球
  const p = pos(s)
  ctx.fillStyle = '#F5C542'
  ctx.beginPath(); ctx.arc(X(p.x), Y(p.y) - 8, 8, 0, Math.PI * 2); ctx.fill()
  // 最高点标注
  if (maxHeightReached.value > 0.02) {
    ctx.strokeStyle = '#3ecf8e'; ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(X(pF1.x), Y(maxHeightReached.value)); ctx.lineTo(X(pR.x) + 10, Y(maxHeightReached.value)); ctx.stroke(); ctx.setLineDash([])
    label(ctx, `到达高度 ${maxHeightReached.value.toFixed(2)} m`, X(pR.x) - 30, Y(maxHeightReached.value) - 10, '#3ecf8e', 11)
  }
  label(ctx, `μ = ${mu.value.toFixed(2)}　右斜面 ${angleDeg.value}°　v = ${Math.abs(v).toFixed(2)} m/s`
    + (stopDist.value != null ? `　滚行距离 ${Number.isFinite(stopDist.value) ? stopDist.value.toFixed(2) + ' m' : '∞（永不停止）'}` : ''), w / 2, h - 14, '#7fe3b3', 12)
  if (angleDeg.value === 0 && mu.value === 0) label(ctx, '理想情形：水平且无摩擦 → 小球永远匀速滚动（惯性）', w / 2, 22, '#F5C542', 13)
}

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="伽利略斜面实验"
    desc="小球从左斜面 1 m 高处释放。无摩擦时它总能滚到右斜面同样高度；右斜面越平缓，滚得越远。外推：水平且无摩擦 → 永远滚下去，运动不需要力来维持。"
    formula="mgh₀ = ½mv² + mgh（无摩擦）　有摩擦：滚行距离 ∝ 1/μ"
    :axes="{ x: 'μ', y: '距离', xUnit: '', yUnit: 'm' }">
    <template #controls>
      <label>摩擦系数 μ = {{ mu.toFixed(2) }}<input type="range" min="0" max="0.3" step="0.01" v-model.number="mu"></label>
      <label>右斜面倾角 = {{ angleDeg }}°（0 = 水平）<input type="range" min="0" max="45" step="5" v-model.number="angleDeg"></label>
      <button class="btn" @click="start">▶ 释放小球</button>
      <div class="readout">到达高度 {{ maxHeightReached.toFixed(2) }} m{{ stopDist != null ? `\n滚行距离 ${Number.isFinite(stopDist) ? stopDist.toFixed(2) + ' m' : '∞（永不停止）'}` : '' }}</div>
      <button class="btn alt" :disabled="stopDist == null || !Number.isFinite(stopDist)" @click="record">📏 记录 (μ, 距离)（{{ records.length }}）</button>
      <p class="hint">先把倾角设 0，逐步减小 μ：距离越来越远；μ=0 时永不停止——这正是伽利略的理想实验。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
