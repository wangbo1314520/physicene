<script setup lang="ts">
/**
 * 测量玻璃的折射率（必修三）
 * 仪器：玻璃砖 + 四枚大头针 + 量角器。入射角 θ₁ 滑杆设定；真实折射光路由 n=1.52 决定；
 * 学生转动量角器游标对准折射光线读出 θ₂（测量技能）→ n = sinθ₁/sinθ₂，多组作 sinθ₁-sinθ₂ 图。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const N_TRUE = 1.52
const theta1 = ref(45) // 入射角
const theta2 = ref(30) // 学生量角器读数（游标）
const records = ref<{ t1: number; t2: number; n: number }[]>([])

const theta2True = computed(() => Math.asin(Math.sin(theta1.value * Math.PI / 180) / N_TRUE) * 180 / Math.PI)
const nMeasured = computed(() => {
  const s1 = Math.sin(theta1.value * Math.PI / 180)
  const s2 = Math.sin(theta2.value * Math.PI / 180)
  return s2 > 1e-6 ? s1 / s2 : null
})

function record() {
  if (nMeasured.value == null) return
  const noise = () => 1 + (Math.random() - 0.5) * 0.006
  const t2 = +(theta2.value * noise()).toFixed(1)
  const s1 = Math.sin(theta1.value * Math.PI / 180)
  const s2 = Math.sin(t2 * Math.PI / 180)
  records.value.push({ t1: theta1.value, t2, n: +(s1 / Math.max(s2, 1e-6)).toFixed(3) })
  lab.value?.loadPoints(records.value.map((r) => ({
    x: +Math.sin(r.t1 * Math.PI / 180).toFixed(4),
    y: +Math.sin(r.t2 * Math.PI / 180).toFixed(4),
  })))
  emit('record', { rows: records.value, nTrue: N_TRUE })
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const cx = w * 0.42, cy = h / 2 // 入射点
  const bw = Math.min(w * 0.34, 300), bh = Math.min(h * 0.62, 260) // 玻璃砖半宽高
  // 玻璃砖
  ctx.fillStyle = 'rgba(108, 217, 232, 0.13)'
  ctx.strokeStyle = '#6cd9e8'; ctx.lineWidth = 1.5
  ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh)
  ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh)
  label(ctx, '玻璃砖', cx + bw / 2 - 34, cy - bh / 2 + 14, '#6cd9e8', 11)
  // 法线（虚线竖直）
  ctx.strokeStyle = '#565675'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(cx, cy - bh / 2 - 34); ctx.lineTo(cx, cy + bh / 2 + 34); ctx.stroke()
  ctx.setLineDash([])
  const r1 = theta1.value * Math.PI / 180
  const r2t = theta2True.value * Math.PI / 180
  const inLen = 120
  const p1: [number, number] = [cx - Math.sin(r1) * inLen, cy - Math.cos(r1) * inLen]
  const p2: [number, number] = [cx - Math.sin(r1) * (inLen * 0.55), cy - Math.cos(r1) * (inLen * 0.55)]
  // 入射光线（红）+ 大头针 P1 P2
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(cx, cy); ctx.stroke()
  drawPin(ctx, p1[0], p1[1], 'P₁'); drawPin(ctx, p2[0], p2[1], 'P₂')
  // 折射光线（绿）
  const inLen2 = bh / 2 + 40
  const pExit: [number, number] = [cx + Math.sin(r2t) * (bw / 2), cy + Math.cos(r2t) * (bw / 2)] // 到达右壁
  ctx.strokeStyle = '#3ecf8e'
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(pExit[0], pExit[1]); ctx.stroke()
  // 出射光线（红，平行入射）
  ctx.strokeStyle = '#E05555'
  ctx.beginPath(); ctx.moveTo(pExit[0], pExit[1])
  ctx.lineTo(pExit[0] + Math.sin(r1) * 90, pExit[1] + Math.cos(r1) * 90); ctx.stroke()
  drawPin(ctx, pExit[0] + Math.sin(r1) * 55, pExit[1] + Math.cos(r1) * 55, 'P₄')
  drawPin(ctx, pExit[0] + Math.sin(r1) * 26, pExit[1] + Math.cos(r1) * 26, 'P₃')
  // 量角器弧：θ₁（红）与 θ₂ 游标（黄，由学生滑杆控制）
  const R = 70
  ctx.lineWidth = 2
  ctx.strokeStyle = '#E05555'
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2 - r1, -Math.PI / 2, false); ctx.stroke()
  ctx.strokeStyle = '#F5C542'
  ctx.beginPath(); ctx.arc(cx, cy, R + 14, -Math.PI / 2 + r2t * 0, -Math.PI / 2 + r2t, false); ctx.stroke()
  // 游标线（黄虚线）：学生当前读数位置
  const rv = theta2.value * Math.PI / 180
  ctx.strokeStyle = '#F5C542'; ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(rv) * (bh / 2 + 50), cy + Math.cos(rv) * (bh / 2 + 50)); ctx.stroke()
  ctx.setLineDash([])
  label(ctx, `θ₁ = ${theta1.value}°`, cx - 78, cy - 76, '#E05555', 12)
  const aligned = Math.abs(theta2.value - theta2True.value) <= 0.5
  label(ctx, aligned ? '✓ 游标已对准折射光线' : '量角器游标（转动滑杆对准绿色光线）',
    w / 2, h - 12, aligned ? '#7fe3b3' : '#F5C542', 12)
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, name: string) {
  ctx.fillStyle = '#F5C542'
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#b0b0cc'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 14); ctx.stroke()
  label(ctx, name, x + 12, y + 8, '#F5C542', 11)
}

onMounted(() => { loop = makeLoop(() => draw()) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="测量玻璃的折射率（插针法）"
    desc="P₁P₂ 锁定入射光方向，透过玻璃砖观察 P₃P₄ 与 P₁P₂ 在同一直线上，即锁定折射光路。转动量角器游标对准绿色折射光线读出 θ₂。"
    formula="n = sinθ₁ / sinθ₂（sinθ₁-sinθ₂ 图斜率 = 1/n）"
    :axes="{ x: 'sinθ₁', y: 'sinθ₂', xUnit: '', yUnit: '' }">
    <template #controls>
      <label>入射角 θ₁ = {{ theta1 }}°<input type="range" min="20" max="75" step="5" v-model.number="theta1"></label>
      <label>量角器读数 θ₂ = {{ theta2 }}°<input type="range" min="10" max="60" step="0.5" v-model.number="theta2"></label>
      <div class="readout">θ₁ = {{ theta1 }}°　θ₂(读数) = {{ theta2 }}°
n = sinθ₁/sinθ₂ = {{ nMeasured ? nMeasured.toFixed(3) : '—' }}</div>
      <button class="btn alt" @click="record">📏 记录 (sinθ₁, sinθ₂)（{{ records.length }}）</button>
      <p class="hint">对准绿光线后再读数（显示 ✓）。多组数据拟合直线，斜率的倒数即 n（真值 1.52）。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
