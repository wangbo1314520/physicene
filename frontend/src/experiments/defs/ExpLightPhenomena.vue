<script setup lang="ts">
/**
 * 观察光的干涉、衍射、偏振现象（选必一）三个分页：
 * 干涉：双缝彩色条纹（波长→真彩色），Δy = λL/d，游标测量；
 * 衍射：单缝 sinc² 图样，缝宽可调，中央亮纹最宽；
 * 偏振：两偏振片转轴可调，透射光强 I = I₀cos²θ（马吕斯定律），灯泡亮度实时反馈。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const tab = ref<'interference' | 'diffraction' | 'polarization'>('interference')
const lambdaNm = ref(550)
const dmm = ref(0.25)
const Lm = ref(1.0)
const slitMm = ref(0.2)
const a1 = ref(0)   // 偏振片1 角度
const a2 = ref(60)  // 偏振片2 角度
const I0 = 1

const dyMm = computed(() => ((lambdaNm.value * 1e-9 * Lm.value) / (dmm.value * 1e-3)) * 1e3)
const polarAngle = computed(() => {
  const raw = Math.abs(((a2.value - a1.value) % 180 + 180) % 180)
  return Math.min(raw, 180 - raw) // 透振轴夹角 0~90°
})
const Iout = computed(() => I0 * Math.cos(polarAngle.value * Math.PI / 180) ** 2)
const records = ref<{ lambda: number; dy: number }[]>([])

/** 波长→RGB（近似谱色） */
function wl2rgb(nm: number): [number, number, number] {
  let r = 0, g = 0, b = 0
  if (nm < 440) { r = -(nm - 440) / 60; b = 1 }
  else if (nm < 490) { g = (nm - 440) / 50; b = 1 }
  else if (nm < 510) { g = 1; b = -(nm - 510) / 20 }
  else if (nm < 580) { r = (nm - 510) / 70; g = 1 }
  else if (nm < 645) { r = 1; g = -(nm - 645) / 65 }
  else r = 1
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function record() {
  records.value.push({ lambda: lambdaNm.value, dy: +dyMm.value.toFixed(3) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.lambda, y: r.dy })))
  emit('record', { rows: records.value, tab: tab.value, lambda: lambdaNm.value, dy: +dyMm.value.toFixed(3) })
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const [r, g, b] = wl2rgb(lambdaNm.value)
  if (tab.value === 'interference') {
    // 双缝条纹：屏占满，条纹间距 Δy 缩放（0.12 px/μm 可见）
    const pxPerUm = 0.28
    const spacing = Math.max(6, dyMm.value * 1000 * pxPerUm)
    for (let x = 0; x < w; x++) {
      const yMid = h / 2
      // 双缝干涉 I ∝ cos²(πx/Δy)，乘以单缝包络
      const inten = Math.max(0.05, Math.cos((Math.PI * (x - w / 2)) / spacing) ** 2)
        * Math.max(0.15, 1 - Math.abs(x - w / 2) / (w * 0.7))
      // 单缝包络
      const envY = h * 0.06
      const grad = ctx.createLinearGradient(0, yMid - envY, 0, yMid + envY)
      const rr = Math.round(r * inten), gg = Math.round(g * inten), bb = Math.round(b * inten)
      grad.addColorStop(0, '#14142a'); grad.addColorStop(0.5, `rgb(${rr},${gg},${bb})`); grad.addColorStop(1, '#14142a')
      ctx.fillStyle = grad
      ctx.fillRect(x, yMid - envY, 1.2, envY * 2)
    }
    // Δy 标注线
    ctx.strokeStyle = '#F5C542'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(w / 2 - spacing / 2, h * 0.14); ctx.lineTo(w + 4, h * 0.14)
    ctx.moveTo(w / 2 + spacing / 2, h * 0.14 - 0); ctx.lineTo(w / 2 + spacing / 2, h * 0.2); ctx.stroke()
    ctx.setLineDash([])
    label(ctx, `Δy = ${dyMm.value.toFixed(2)} mm（λ=${lambdaNm.value}nm, d=${dmm.value}mm, L=${Lm.value}m）`, w / 2, h - 14, '#b0b0cc', 12)
  } else if (tab.value === 'diffraction') {
    // 单缝衍射：sinc² 沿 x 分布的彩色条纹
    const yMid = h / 2
    for (let x = 0; x < w; x++) {
      const u = ((x - w / 2) / w) * 24 // 缝宽角度参数
      const s = u === 0 ? 1 : (Math.sin(Math.PI * u) / (Math.PI * u)) ** 2
      const envY = h * 0.07
      const grad = ctx.createLinearGradient(0, yMid - envY, 0, yMid + envY)
      const inten = Math.max(0.04, s)
      const rr = Math.round(r * inten), gg = Math.round(g * inten), bb = Math.round(b * inten)
      grad.addColorStop(0, '#14142a'); grad.addColorStop(0.5, `rgb(${rr},${gg},${bb})`); grad.addColorStop(1, '#14142a')
      ctx.fillStyle = grad
      ctx.fillRect(x, yMid - envY, 1.2, envY * 2)
    }
    label(ctx, `中央亮纹最宽最亮；缝宽 a=${slitMm.value}mm 越窄 → 条纹越宽（aλ 定标）`, w / 2, h - 14, '#b0b0cc', 12)
  } else {
    // 偏振：光源 → P₁ → P₂ → 屏
    const yMid = h / 2
    const xs = [w * 0.14, w * 0.42, w * 0.7, w * 0.92]
    // 入射光束（亮度 I0）
    beam(ctx, xs[0], xs[1], yMid, 1)
    label(ctx, '自然光 I₀', (xs[0] + xs[1]) / 2, yMid - 44, '#b0b0cc', 11)
    // P1 后：亮度 0.5（偏振化）
    beam(ctx, xs[1], xs[2], yMid, 0.5 * 0.9)
    label(ctx, `P₁ ${a1.value}°`, xs[1], yMid - 78, '#F5C542', 12)
    polarizer(ctx, xs[1], yMid, a1.value)
    // P2 后：cos²θ
    beam(ctx, xs[2], xs[3], yMid, Iout.value)
    label(ctx, `P₂ ${a2.value}°`, xs[2], yMid - 78, '#F5C542', 12)
    polarizer(ctx, xs[2], yMid, a2.value)
    // 屏
    ctx.fillStyle = '#23233a'; ctx.fillRect(xs[3], yMid - 70, 10, 140)
    const glow = ctx.createRadialGradient(xs[3], yMid, 2, xs[3], yMid, 64)
    glow.addColorStop(0, `rgba(245,197,66,${0.75 * Iout.value})`); glow.addColorStop(1, 'rgba(245,197,66,0)')
    ctx.fillStyle = glow
    ctx.beginPath(); ctx.arc(xs[3], yMid, 64, 0, Math.PI * 2); ctx.fill()
    label(ctx, `θ = ${polarAngle.value}°　I = I₀cos²θ = ${(Iout.value * 100).toFixed(0)}%`,
      w / 2, h - 14, Iout.value < 0.02 ? '#E05555' : '#7fe3b3', 13)
    if (polarAngle.value === 90) label(ctx, '⊥ 正交 → 消光（偏振证据）', w / 2, 24, '#E05555', 13)
  }
}

function beam(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, brightness: number) {
  ctx.strokeStyle = `rgba(245, 197, 66, ${0.15 + 0.75 * brightness})`
  ctx.lineWidth = 5
  ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke()
  ctx.lineWidth = 1; ctx.strokeStyle = '#8a8aa0'
}
function polarizer(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number) {
  ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.ellipse(x, y, 14, 54, 0, 0, Math.PI * 2); ctx.stroke()
  // 透振轴刻线
  const rad = angle * Math.PI / 180
  ctx.strokeStyle = '#E05555'; ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x - Math.sin(rad) * 46, y - Math.cos(rad) * 46)
  ctx.lineTo(x + Math.sin(rad) * 46, y + Math.cos(rad) * 46)
  ctx.stroke()
}

onMounted(() => { loop = makeLoop(() => draw()) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="观察光的干涉、衍射、偏振现象"
    desc="双缝干涉（彩色条纹随波长变化）、单缝衍射（中央亮纹最宽）、偏振（两片偏振片转轴夹角决定透射光强，正交时消光）。"
    formula="Δy = λL/d　I = I₀cos²θ（马吕斯定律）"
    :axes="{ x: 'λ', y: 'Δy', xUnit: 'nm', yUnit: 'mm' }">
    <template #controls>
      <div class="row">
        <button class="btn" :class="{ ghost: tab !== 'interference' }" @click="tab = 'interference'">干涉</button>
        <button class="btn" :class="{ ghost: tab !== 'diffraction' }" @click="tab = 'diffraction'">衍射</button>
        <button class="btn" :class="{ ghost: tab !== 'polarization' }" @click="tab = 'polarization'">偏振</button>
      </div>
      <label v-if="tab !== 'polarization'">波长 λ = {{ lambdaNm }} nm
        <input type="range" min="400" max="700" step="10" v-model.number="lambdaNm"></label>
      <template v-if="tab === 'interference'">
        <label>双缝间距 d = {{ dmm.toFixed(2) }} mm<input type="range" min="0.1" max="0.5" step="0.05" v-model.number="dmm"></label>
        <label>缝屏距 L = {{ Lm.toFixed(1) }} m<input type="range" min="0.5" max="2" step="0.1" v-model.number="Lm"></label>
        <div class="readout">Δy = λL/d = {{ dyMm.toFixed(2) }} mm</div>
        <button class="btn alt" @click="record">📏 记录 (λ, Δy)（{{ records.length }}）</button>
      </template>
      <template v-else-if="tab === 'diffraction'">
        <label>缝宽 a = {{ slitMm.toFixed(2) }} mm<input type="range" min="0.1" max="0.4" step="0.05" v-model.number="slitMm"></label>
        <p class="hint">红光条纹比蓝光宽（λ 大）；缝减半 → 中央亮纹加倍宽。</p>
      </template>
      <template v-else>
        <label>偏振片 P₁ 角度 = {{ a1 }}°<input type="range" min="0" max="180" step="5" v-model.number="a1"></label>
        <label>偏振片 P₂ 角度 = {{ a2 }}°<input type="range" min="0" max="180" step="5" v-model.number="a2"></label>
        <div class="readout">夹角 θ = {{ polarAngle }}°
I/I₀ = cos²θ = {{ (Iout * 100).toFixed(0) }}%{{ polarAngle === 90 ? '\n正交消光！光为横波' : '' }}</div>
      </template>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
