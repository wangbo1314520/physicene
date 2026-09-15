<script setup lang="ts">
/**
 * 库仑扭秤实验·定量探究（必修三）
 * 仪器（俯视）：悬丝+平衡杆（A 球与配重）+ 固定 B 球；B 靠近时库仑斥力使杆扭转 φ，
 * 悬丝扭力矩与库仑力矩平衡 → φ ∝ F ∝ q₁q₂/r²。动画：杆带阻尼转向新平衡角。
 * 记录 (1/r², F) 作图验证线性。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const K = 8.99e9
const q1 = ref(2)   // ×1e-8 C
const q2 = 2e-8     // 固定 B 球电荷
const rCm = ref(15) // cm

const F_uN = computed(() => {
  const r = rCm.value / 100
  return K * q1.value * 1e-8 * q2 / (r * r) * 1e6
})
/** 平衡扭转角（度）：φ = c·F，取 c 使 F=100μN 时约 40° */
const phiEq = computed(() => F_uN.value * 0.4)
const phi = ref(0)
const records = ref<{ r: number; F: number }[]>([])

function record() {
  records.value.push({ r: rCm.value, F: +F_uN.value.toFixed(2) })
  lab.value?.loadPoints(records.value.map((r0) => ({
    x: +(1 / (r0.r * r0.r)).toFixed(6), y: r0.F,
  })))
  emit('record', { rows: records.value, q1e8: q1.value, F_uN: +F_uN.value.toFixed(3) })
}

function step(dt: number) {
  // 扭转弹簧-阻尼系统趋向平衡角
  const w = 6
  phi.value += (phiEq.value - phi.value) * Math.min(1, w * dt)
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2, cy = h / 2
  const scale = Math.min(w, h) / 44 // cm → px
  // 固定球 B（左侧，距离 r）
  const bx = cx - rCm.value * scale
  // 悬丝
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, cy); ctx.stroke()
  ctx.setLineDash([])
  label(ctx, '悬丝（俯视）', cx, 16, '#6c6c85', 11)
  // 平衡杆（绕悬点转 φ）
  const rad = phi.value * Math.PI / 180
  const armLen = 10 * scale
  const ax = cx + Math.cos(rad) * armLen, ay = cy + Math.sin(rad) * armLen
  const wx = cx - Math.cos(rad) * armLen * 0.6, wy = cy - Math.sin(rad) * armLen * 0.6
  ctx.strokeStyle = '#d9a05a'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(ax, ay); ctx.stroke()
  // A 球（带电，杆端）与配重
  ctx.fillStyle = '#E05555'
  ctx.beginPath(); ctx.arc(ax, ay, 11, 0, Math.PI * 2); ctx.fill()
  label(ctx, `A +${q1.value}×10⁻⁸C`, ax, ay - 18, '#E05555', 11)
  ctx.fillStyle = '#8a8aa0'
  ctx.beginPath(); ctx.arc(wx, wy, 7, 0, Math.PI * 2); ctx.fill()
  label(ctx, '配重', wx, wy - 13, '#8a8aa0', 10)
  // B 球
  ctx.fillStyle = '#E05555'
  ctx.beginPath(); ctx.arc(bx, cy, 11, 0, Math.PI * 2); ctx.fill()
  label(ctx, 'B +2×10⁻⁸C', bx, cy - 18, '#E05555', 11)
  // 距离标注
  ctx.strokeStyle = '#4A90D9'; ctx.lineWidth = 1; ctx.setLineDash([4, 3])
  ctx.beginPath(); ctx.moveTo(bx, cy + 26); ctx.lineTo(ax - Math.cos(rad) * 14, ay + Math.sin(rad) * 14 + 26 * Math.cos(rad)); ctx.stroke()
  ctx.setLineDash([])
  label(ctx, `r = ${rCm.value} cm`, (bx + ax) / 2, cy + 42, '#4A90D9', 12)
  // 角度弧
  ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(cx, cy, 46, 0, rad, false); ctx.stroke()
  label(ctx, `φ = ${phi.value.toFixed(1)}°`, cx + 58, cy + 10 + rad * 8, '#F5C542', 12)
  // 斥力箭头
  const fx = ax - Math.cos(rad) * 40, fy = ay - Math.sin(rad) * 40
  ctx.strokeStyle = '#3ecf8e'; ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(fx, fy); ctx.stroke()
  const ang = Math.atan2(ay - fy, ax - fx)
  ctx.beginPath()
  ctx.moveTo(ax - Math.cos(ang - 0.4) * 10, ay - Math.sin(ang - 0.4) * 10)
  ctx.lineTo(ax - Math.cos(ang) * 2, ay - Math.sin(ang) * 2)
  ctx.lineTo(ax - Math.cos(ang + 0.4) * 10, ay - Math.sin(ang + 0.4) * 10)
  ctx.stroke()
  label(ctx, `F = ${F_uN.value.toFixed(1)} μN`, ax + 40, ay + 24, '#3ecf8e', 12)
}

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="库仑扭秤实验（定量探究）"
    desc="俯视图：悬丝下挂平衡杆，A 球与固定 B 球同带正电相互排斥，杆扭转至库仑力矩与悬丝扭力矩平衡。φ ∝ F。"
    formula="F = kq₁q₂/r²　k = 8.99×10⁹ N·m²/C²"
    :axes="{ x: '1/r²', y: 'F', xUnit: '1/cm²', yUnit: 'μN' }">
    <template #controls>
      <label>距离 r = {{ rCm }} cm<input type="range" min="8" max="30" step="1" v-model.number="rCm"></label>
      <label>A 球电荷 q₁ = {{ q1 }}×10⁻⁸ C<input type="range" min="1" max="5" step="0.5" v-model.number="q1"></label>
      <div class="readout">r = {{ rCm }} cm　F = {{ F_uN.toFixed(2) }} μN
平衡扭转角 φ ≈ {{ phiEq.toFixed(1) }}°</div>
      <button class="btn alt" @click="record">📏 记录 (1/r², F)（{{ records.length }}）</button>
      <p class="hint">固定 q₁ 只改 r，记录 4-5 组：F-1/r² 图为过原点直线 → F ∝ 1/r²。再固定 r 改 q₁ 验证 F ∝ q₁。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
