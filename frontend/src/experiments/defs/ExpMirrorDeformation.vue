<script setup lang="ts">
/**
 * 通过平面镜观察桌面的微小形变（必修一 · 演示，光杠杆原理）
 * 桌面受压产生微米级凹陷，桌面上的平面镜随之微转 θ；激光经 M₁、M₂ 两次反射投到远处墙上，
 * 光点位移 Δ ≈ 2θ·D 被放大到毫米级可见。压力越大光点偏移越大。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const F = ref(0)              // N
const D = ref(5)              // 光程 m
const L = 1.2                 // 桌面长 m
const K_UM_PER_N = 4          // 桌面刚度：每牛顿下沉 4 μm
const sagUm = computed(() => F.value * K_UM_PER_N)
const thetaRad = computed(() => (3 * sagUm.value * 1e-6) / L)   // 镜面倾角 ≈ 3δ/L
const deltaMm = computed(() => 2 * thetaRad.value * D.value * 1e3)
const spot = ref(0)           // 动画平滑后的光点位移 mm
const records = ref<{ F: number; delta: number }[]>([])

function record() {
  records.value.push({ F: F.value, delta: +deltaMm.value.toFixed(2) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.F, y: r.delta })))
  emit('record', { rows: records.value, sag_um: +sagUm.value.toFixed(1), theta_rad: thetaRad.value })
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const tableY = h * 0.62, tx0 = 40, tx1 = w * 0.55
  // 支撑
  ctx.fillStyle = '#3d3d5e'
  ctx.fillRect(tx0, tableY, 14, h - tableY - 10); ctx.fillRect(tx1 - 14, tableY, 14, h - tableY - 10)
  // 桌面（形变夸大 ×800 显示）
  const sagPx = Math.min(26, sagUm.value * 1e-6 * 800 * 900)
  ctx.strokeStyle = '#d9a05a'; ctx.lineWidth = 6
  ctx.beginPath(); ctx.moveTo(tx0, tableY)
  ctx.quadraticCurveTo((tx0 + tx1) / 2, tableY + sagPx * 2, tx1, tableY); ctx.stroke()
  // 压力（手/重物）
  if (F.value > 0) {
    const mx = (tx0 + tx1) / 2
    ctx.fillStyle = '#4A90D9'
    ctx.fillRect(mx - 18, tableY - 40 + sagPx, 36, 28)
    ctx.beginPath(); ctx.moveTo(mx, tableY - 10 + sagPx); ctx.lineTo(mx - 6, tableY - 18 + sagPx); ctx.lineTo(mx + 6, tableY - 18 + sagPx); ctx.fill()
    label(ctx, `F = ${F.value} N`, mx, tableY - 52 + sagPx, '#4A90D9', 12)
  }
  // 镜子 M1（桌面 1/4 处，随形变倾斜，夸大显示）与 M2（右侧墙固定）
  const m1x = tx0 + (tx1 - tx0) * 0.28, m1y = tableY - 2 + sagPx * 0.9
  const tiltVis = thetaRad.value * 800 * 3
  ctx.save(); ctx.translate(m1x, m1y); ctx.rotate(-tiltVis)
  ctx.fillStyle = '#6cd9e8'; ctx.fillRect(-16, -4, 32, 4)
  ctx.restore()
  label(ctx, 'M₁（随桌面微转）', m1x, m1y - 22, '#6cd9e8', 11)
  const m2x = w * 0.62, m2y = h * 0.22
  ctx.fillStyle = '#6cd9e8'; ctx.fillRect(m2x - 3, m2y - 26, 6, 52)
  label(ctx, 'M₂', m2x, m2y - 36, '#6cd9e8', 11)
  // 墙 + 刻度（mm）
  const wallX = w - 46
  ctx.fillStyle = '#23233a'; ctx.fillRect(wallX, 20, 12, h - 40)
  ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1
  const mmPx = 9
  for (let mm = -10; mm <= 10; mm++) {
    const y = m2y + mm * mmPx
    ctx.beginPath(); ctx.moveTo(wallX + 12, y); ctx.lineTo(wallX + 12 + (mm % 5 === 0 ? 10 : 5), y); ctx.stroke()
    if (mm % 5 === 0) label(ctx, `${mm}`, wallX + 32, y, '#8a8aa0', 9)
  }
  // 激光路径：激光器 → M1 → M2 → 墙
  const laserX = 60, laserY = h * 0.25
  ctx.fillStyle = '#E05555'; ctx.fillRect(laserX - 30, laserY - 8, 30, 16)
  label(ctx, '激光', laserX - 15, laserY - 18, '#E05555', 11)
  const spotY = m2y - spot.value * mmPx
  ctx.strokeStyle = 'rgba(224,85,85,0.85)'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(laserX, laserY); ctx.lineTo(m1x, m1y - 3); ctx.lineTo(m2x, m2y + spot.value * mmPx * 0.5); ctx.lineTo(wallX, spotY); ctx.stroke()
  // 光点
  const glow = ctx.createRadialGradient(wallX, spotY, 1, wallX, spotY, 12)
  glow.addColorStop(0, 'rgba(255,90,90,1)'); glow.addColorStop(1, 'rgba(255,90,90,0)')
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(wallX, spotY, 12, 0, Math.PI * 2); ctx.fill()
  label(ctx, `桌面下沉 δ = ${sagUm.value.toFixed(0)} μm（肉眼不可见）　镜转 θ = ${(thetaRad.value * 1e3).toFixed(3)} mrad　光点位移 Δ = ${deltaMm.value.toFixed(2)} mm`,
    w / 2, h - 12, '#7fe3b3', 12)
}

onMounted(() => { loop = makeLoop((dt) => { spot.value += (deltaMm.value - spot.value) * Math.min(1, dt * 6); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="通过平面镜观察桌面的微小形变（光杠杆）"
    desc="用手压桌面，桌面下沉几十微米——肉眼看不见。但桌上的平面镜随之微微转动 θ，激光经两次反射到远处墙上，光点移动 2θ·D 被放大到毫米级，一眼可见。"
    formula="Δ ≈ 2θ·D　θ ≈ 3δ/L　放大倍数 ∝ D/L"
    :axes="{ x: 'F', y: 'Δ', xUnit: 'N', yUnit: 'mm' }">
    <template #controls>
      <label>压力 F = {{ F }} N<input type="range" min="0" max="50" step="5" v-model.number="F"></label>
      <label>光程 D = {{ D }} m（越远放大越大）<input type="range" min="2" max="10" step="1" v-model.number="D"></label>
      <div class="readout">δ = {{ sagUm.toFixed(0) }} μm
θ = {{ (thetaRad * 1e3).toFixed(3) }} mrad
Δ = {{ deltaMm.toFixed(2) }} mm</div>
      <button class="btn alt" @click="record">📏 记录 (F, Δ)（{{ records.length }}）</button>
      <p class="hint">Δ 与 F 成正比（弹性形变）；增大 D 可进一步放大。这就是"微小量放大法"。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
