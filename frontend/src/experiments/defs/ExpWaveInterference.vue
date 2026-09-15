<script setup lang="ts">
/**
 * 观察波的干涉、衍射现象（选必一）
 * 仪器：水波槽（俯视）双波源 S₁S₂ 实时叠加波场动画 + 右侧屏幕条纹与加强/减弱点；
 * 切换单缝衍射显示中央亮纹最宽。屏上条纹间距 Δy=λL/d 由时间平均光强自动测出。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const mode = ref<'interference' | 'diffraction'>('interference')
const lambdaCm = ref(2)   // 波长 cm
const dCm = ref(6)        // 双源间距 cm
const slitCm = ref(2)     // 单缝宽 cm
const Lcm = 100           // 屏距 cm
let tGlobal = 0

/** 屏上时间平均强度（沿 y 采样）：干涉 = |cos| 型条纹；衍射 = sinc² */
function screenProfile(): number[] {
  const N = 90
  const arr: number[] = []
  for (let i = 0; i < N; i++) {
    const y = (i / (N - 1) - 0.5) * 60 // cm（屏 ±30cm）
    if (mode.value === 'interference') {
      const dy = (lambdaCm.value * Lcm) / dCm.value // cm
      arr.push(Math.cos(Math.PI * y / dy) ** 2)
    } else {
      const x = (Math.PI * y * slitCm.value) / (lambdaCm.value * Lcm) * 60
      arr.push(x === 0 ? 1 : (Math.sin(x) / x) ** 2)
    }
  }
  return arr
}
const fringeSpacing = computed(() => (lambdaCm.value * Lcm) / dCm.value)
const records = ref<{ lambda: number; d: number; dy: number }[]>([])

function record() {
  records.value.push({ lambda: lambdaCm.value, d: dCm.value, dy: +fringeSpacing.value.toFixed(2) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: +(r.lambda / r.d).toFixed(4), y: r.dy })))
  emit('record', { rows: records.value, mode: mode.value })
}

// 低分辨率离屏波场（放大绘制，60fps 可承受）
const FW = 150, FH = 105
const off = typeof document !== 'undefined' ? document.createElement('canvas') : null
const offCtx = off?.getContext('2d') ?? null
const img = offCtx?.createImageData(FW, FH) ?? null

function draw() {
  const c = canvasRef.value
  if (!c || !offCtx || !img || !off) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const tankW = w * 0.72, tankH = h
  // ── 波场 ──
  if (mode.value === 'interference') {
    const k = (2 * Math.PI) / lambdaCm.value
    const omega = k * 18
    const s1x = 8, s1y = tankH / 2 - (dCm.value / 2) * 6, s2y = tankH / 2 + (dCm.value / 2) * 6
    const px = 6 // cm/像素换算基准：源间距 dCm*6 px
    const data = img.data
    for (let j = 0; j < FH; j++) {
      for (let i = 0; i < FW; i++) {
        const X = (i / FW) * 40, Y = (j / FH) * (tankH / 6)
        const r1 = Math.hypot(X, Y - dCm.value / 2)
        const r2 = Math.hypot(X, Y + dCm.value / 2)
        const v = Math.cos(k * r1 - omega * tGlobal) + Math.cos(k * r2 - omega * tGlobal)
        const inten = (v / 2) // -1..1
        const idx = (j * FW + i) * 4
        const base = 24
        const amp = inten > 0 ? inten * 200 : -inten * 60
        data[idx] = base + amp * 0.25
        data[idx + 1] = base + amp * 0.45
        data[idx + 2] = base + amp
        data[idx + 3] = 255
      }
    }
  } else {
    const k = (2 * Math.PI) / lambdaCm.value
    const omega = k * 18
    const data = img.data
    for (let j = 0; j < FH; j++) {
      for (let i = 0; i < FW; i++) {
        // 单缝：缝内各点作为次级波源（8 个），缝后叠加
        const X = (i / FW) * 40
        const Y = (j / FH) * 70
        let v = 0
        for (let s = 0; s < 8; s++) {
          const sy = -slitCm.value / 2 + (slitCm.value * s) / 7
          const dx = X - 2, dy = Y - 35 - sy
          const r = Math.max(0.4, Math.hypot(dx, dy))
          v += Math.cos(k * r - omega * tGlobal) / Math.sqrt(r)
        }
        const inten = Math.max(-1, Math.min(1, v / 3))
        const idx = (j * FW + i) * 4
        const base = inten > 0 ? 24 + inten * 190 : 24 - inten * 40
        data[idx] = base * 0.3; data[idx + 1] = base * 0.5; data[idx + 2] = base
        data[idx + 3] = 255
      }
    }
  }
  offCtx.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(off, 0, 0, tankW, tankH)
  // 波源标记
  if (mode.value === 'interference') {
    const s1y = tankH / 2 - (dCm.value / 2) * 6, s2y = tankH / 2 + (dCm.value / 2) * 6
    ctx.fillStyle = '#F5C542'
    ctx.beginPath(); ctx.arc(12, s1y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(12, s2y, 5, 0, Math.PI * 2); ctx.fill()
    label(ctx, 'S₁', 12, s1y - 14, '#F5C542', 11)
    label(ctx, 'S₂', 12, s2y - 14, '#F5C542', 11)
  } else {
    ctx.fillStyle = '#23233a'
    ctx.fillRect(0, 0, 8, tankH / 2 - slitCm.value * 3)
    ctx.fillRect(0, tankH / 2 + slitCm.value * 3, 8, tankH)
    label(ctx, '单缝', 20, 16, '#b0b0cc', 11)
  }
  // ── 屏幕：时间平均强度条纹 ──
  const sx = tankW + 12, sw = w - sx - 6
  ctx.fillStyle = '#101020'; ctx.fillRect(sx, 0, sw, tankH)
  const profile = screenProfile()
  profile.forEach((v, i) => {
    const y = (i / profile.length) * tankH
    const barH = tankH / profile.length + 1
    const bright = Math.max(0.04, v)
    ctx.fillStyle = `rgba(108, 217, 232, ${0.25 + bright * 0.75})`
    ctx.fillRect(sx + sw * 0.25, y, sw * 0.5 * bright + sw * 0.12, barH)
  })
  label(ctx, '屏', sx + sw / 2, 14, '#8a8aa0', 11)
  // 条纹间距标注（干涉）
  if (mode.value === 'interference') {
    const dyPx = (fringeSpacing.value / 60) * tankH
    const yMid = tankH / 2
    ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 1.5
    ctx.setLineDash([3, 3])
    ctx.beginPath(); ctx.moveTo(sx, yMid - dyPx / 2); ctx.lineTo(sx + sw, yMid - dyPx / 2)
    ctx.moveTo(sx, yMid + dyPx / 2); ctx.lineTo(sx + sw, yMid + dyPx / 2); ctx.stroke()
    ctx.setLineDash([])
    label(ctx, `Δy = ${fringeSpacing.value.toFixed(2)} cm`, sx + sw / 2, yMid + dyPx / 2 + 14, '#F5C542', 11)
    label(ctx, `λ=${lambdaCm.value}cm  d=${dCm.value}cm  L=${Lcm}cm`, tankW / 2, tankH - 14, '#b0b0cc', 12)
  } else {
    label(ctx, `λ=${lambdaCm.value}cm  缝宽 a=${slitCm.value}cm（中央亮纹最宽最亮）`, tankW / 2, tankH - 14, '#b0b0cc', 12)
  }
}

onMounted(() => {
  loop = makeLoop((dt) => { tGlobal += dt; draw() })
})
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="观察波的干涉、衍射现象"
    desc="水波槽俯视：双波源实时叠加——波峰相遇加强（亮）、波峰波谷相遇减弱（暗），屏上呈现等间距条纹；切到单缝看衍射（中央亮纹最宽）。"
    formula="干涉加强条件：Δr = nλ　条纹间距 Δy = λL/d"
    :axes="{ x: 'λ/d', y: 'Δy', xUnit: '', yUnit: 'cm' }">
    <template #controls>
      <div class="row">
        <button class="btn" :class="{ ghost: mode !== 'interference' }" @click="mode = 'interference'">双源干涉</button>
        <button class="btn" :class="{ ghost: mode !== 'diffraction' }" @click="mode = 'diffraction'">单缝衍射</button>
      </div>
      <label>波长 λ = {{ lambdaCm }} cm<input type="range" min="1" max="4" step="0.5" v-model.number="lambdaCm"></label>
      <label v-if="mode === 'interference'">波源间距 d = {{ dCm }} cm<input type="range" min="3" max="10" step="1" v-model.number="dCm"></label>
      <label v-else>缝宽 a = {{ slitCm }} cm<input type="range" min="1" max="4" step="0.5" v-model.number="slitCm"></label>
      <div class="readout">{{ mode === 'interference'
        ? `Δy = λL/d = ${fringeSpacing.toFixed(2)} cm\nλ/d = ${(lambdaCm / dCm).toFixed(3)}`
        : '中央亮纹宽度 ∝ λ/a（缝越窄越宽）' }}</div>
      <button class="btn alt" :disabled="mode !== 'interference'" @click="record">📏 记录 (λ/d, Δy)（{{ records.length }}）</button>
      <p class="hint">固定 L=100cm：只改 λ 和 d 记录多组，Δy-λ/d 图为过原点直线（斜率 = L）。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
