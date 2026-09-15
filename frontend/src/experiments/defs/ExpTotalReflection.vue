<script setup lang="ts">
/**
 * 观察全反射现象（选必一）
 * 光从水（玻璃/金刚石）射向空气：入射角增大 → 折射角更快增大、折射光变弱反射光变强；
 * 入射角 ≥ 临界角 C（sinC = 1/n）时折射光消失，全部反射——全反射。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const MEDIA = { water: { n: 1.33, name: '水' }, glass: { n: 1.5, name: '玻璃' }, diamond: { n: 2.42, name: '金刚石' } }
const medium = ref<keyof typeof MEDIA>('water')
const theta = ref(30)
const fan = ref(false)
const n = computed(() => MEDIA[medium.value].n)
const critical = computed(() => Math.asin(1 / n.value) * 180 / Math.PI)
const refractAngle = computed(() => {
  const s = n.value * Math.sin(theta.value * Math.PI / 180)
  return s >= 1 ? null : Math.asin(s) * 180 / Math.PI
})
/** 反射率近似：θ→C 时快速增大到 1（Fresnel 定性） */
const reflectance = computed(() => refractAngle.value == null ? 1 : Math.min(1, 0.04 + 0.96 * (theta.value / critical.value) ** 6))
let t = 0

function drawRay(ctx: CanvasRenderingContext2D, ox: number, oy: number, angDegFromNormal: number, up: boolean, len: number, alpha: number, color: string) {
  // up=true：射向上半空间（空气）；角度以法线（竖直）计
  const a = angDegFromNormal * Math.PI / 180
  const dx = Math.sin(a) * len, dy = (up ? -1 : 1) * Math.cos(a) * len
  ctx.strokeStyle = color.replace('A', String(alpha)); ctx.lineWidth = 2.5
  ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx, oy + dy); ctx.stroke()
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const iy = h * 0.5, ox = w * 0.5
  // 上：空气；下：介质
  ctx.fillStyle = 'rgba(108,217,232,0.16)'; ctx.fillRect(0, iy, w, h - iy)
  ctx.strokeStyle = '#6cd9e8'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, iy); ctx.lineTo(w, iy); ctx.stroke()
  label(ctx, '空气 n=1', 44, iy - 14, '#8a8aa0', 12)
  label(ctx, `${MEDIA[medium.value].name} n=${n.value}`, 60, iy + 18, '#6cd9e8', 12)
  // 法线
  ctx.strokeStyle = '#565675'; ctx.setLineDash([5, 4])
  ctx.beginPath(); ctx.moveTo(ox, 20); ctx.lineTo(ox, h - 20); ctx.stroke(); ctx.setLineDash([])
  const R = Math.min(w, h) * 0.42
  const angles = fan.value ? [10, 20, 30, 40, 48, 55, 62, 70, 80] : [theta.value]
  for (const th of angles) {
    const a = th * Math.PI / 180
    const sx = ox - Math.sin(a) * R, sy = iy + Math.cos(a) * R
    // 入射（从介质内射向界面）
    ctx.strokeStyle = 'rgba(224,85,85,0.9)'; ctx.lineWidth = fan.value ? 1.6 : 2.5
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ox, iy); ctx.stroke()
    const s = n.value * Math.sin(a)
    const refl = s >= 1 ? 1 : Math.min(1, 0.04 + 0.96 * (th / critical.value) ** 6)
    if (s < 1) {
      const rAng = Math.asin(s)
      drawRay(ctx, ox, iy, rAng * 180 / Math.PI, true, R, +(0.95 * (1 - refl) + 0.08).toFixed(2), 'rgba(62,207,142,A)')
    }
    // 反射光（介质内，右下）
    const ra = a
    ctx.strokeStyle = `rgba(245,197,66,${(0.15 + 0.85 * refl).toFixed(2)})`; ctx.lineWidth = fan.value ? 1.6 : 2.5
    ctx.beginPath(); ctx.moveTo(ox, iy); ctx.lineTo(ox + Math.sin(ra) * R, iy + Math.cos(ra) * R); ctx.stroke()
  }
  // 临界角标注弧（介质侧）
  const ca = critical.value * Math.PI / 180
  ctx.strokeStyle = '#F5C542'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3])
  ctx.beginPath(); ctx.arc(ox, iy, 70, Math.PI / 2, Math.PI / 2 + ca, false); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(ox, iy); ctx.lineTo(ox - Math.sin(ca) * 110, iy + Math.cos(ca) * 110); ctx.stroke(); ctx.setLineDash([])
  label(ctx, `C = ${critical.value.toFixed(1)}°`, ox - Math.sin(ca) * 122 - 18, iy + Math.cos(ca) * 122 + 8, '#F5C542', 12)
  // 光源
  if (!fan.value) {
    const a = theta.value * Math.PI / 180
    ctx.fillStyle = '#E05555'; ctx.beginPath(); ctx.arc(ox - Math.sin(a) * R, iy + Math.cos(a) * R, 6, 0, Math.PI * 2); ctx.fill()
  }
  // 入射/折射角弧
  if (!fan.value) {
    const a = theta.value * Math.PI / 180
    ctx.strokeStyle = '#E05555'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.arc(ox, iy, 44, Math.PI / 2, Math.PI / 2 + a, false); ctx.stroke()
    label(ctx, `θ₁=${theta.value}°`, ox - 56, iy + 40, '#E05555', 12)
    if (refractAngle.value != null) {
      const ra = refractAngle.value * Math.PI / 180
      ctx.strokeStyle = '#3ecf8e'
      ctx.beginPath(); ctx.arc(ox, iy, 44, -Math.PI / 2, -Math.PI / 2 + ra, false); ctx.stroke()
      label(ctx, `θ₂=${refractAngle.value.toFixed(1)}°`, ox + 62, iy - 40, '#3ecf8e', 12)
    }
  }
  const status = refractAngle.value == null ? `θ₁ ≥ C：全反射！折射光消失，光能全部反射` : `θ₁ < C：部分折射（${Math.round((1 - reflectance.value) * 100)}%）+ 部分反射（${Math.round(reflectance.value * 100)}%）`
  label(ctx, status, w / 2, h - 14, refractAngle.value == null ? '#F5C542' : '#7fe3b3', 13)
}

onMounted(() => { loop = makeLoop((dt) => { t += dt; draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel title="观察全反射现象" :graph="false"
    desc="光从光密介质射向光疏介质：入射角增大，折射角更快增大，折射光越来越弱、反射光越来越强；当入射角达到临界角 C 时折射角为 90°，再增大就只剩反射——全反射。光纤通信即基于此。"
    formula="sinC = 1/n　n = sinθ₂/sinθ₁（由介质射向空气）">
    <template #controls>
      <label>介质
        <select v-model="medium" class="sel">
          <option value="water">水 n=1.33（C≈48.8°）</option>
          <option value="glass">玻璃 n=1.5（C≈41.8°）</option>
          <option value="diamond">金刚石 n=2.42（C≈24.4°）</option>
        </select>
      </label>
      <label>入射角 θ₁ = {{ theta }}°<input type="range" min="0" max="85" step="1" v-model.number="theta" :disabled="fan"></label>
      <button class="btn ghost" @click="fan = !fan">{{ fan ? '单束光' : '扇形光束（一次看全部角度）' }}</button>
      <div class="readout">临界角 C = arcsin(1/n) = {{ critical.toFixed(1) }}°
{{ refractAngle != null ? `折射角 θ₂ = ${refractAngle.toFixed(1)}°` : '无折射光（全反射）' }}
反射占比 ≈ {{ Math.round(reflectance * 100) }}%</div>
      <p class="hint">金刚石临界角最小、最容易全反射，所以格外闪亮；水→空气临界角 48.8°：从水下斜看水面像镜子。</p>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>

<style scoped>
.sel { width: 100%; background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a; border-radius: 6px; padding: 6px; margin-top: 4px; }
</style>
