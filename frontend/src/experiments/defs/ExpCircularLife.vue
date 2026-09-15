<script setup lang="ts">
/**
 * 生活中的圆周运动（必修二）三个场景：
 * 汽车转弯（俯视）：需要的向心力 mv²/r 由摩擦提供，超过 μmg 则侧滑；
 * 水流星（侧视）：最高点 v ≥ √(gr) 水才不洒；
 * 洗衣机脱水（俯视）：ω²r 超过附着力时水珠沿切线飞出。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

const scene = ref<'car' | 'bucket' | 'drum'>('car')
const g = 9.8
// 汽车
const carM = 1000, carR = ref(30), carV = ref(15), mu = ref(0.6)
const Fneed = computed(() => carM * carV.value ** 2 / carR.value)
const Fmax = computed(() => mu.value * carM * g)
const skid = computed(() => Fneed.value > Fmax.value)
let carAng = 0, skidT = 0
// 水流星
const bucketR = 1.0, bucketV = ref(3.5)
const vMin = Math.sqrt(g * bucketR)
let bucketAng = 0
const drops: { x: number; y: number; vx: number; vy: number }[] = []
// 脱水桶
const drumR = 0.25, drumRpm = ref(600)
const drumOmega = computed(() => drumRpm.value * 2 * Math.PI / 60)
const flyOut = computed(() => drumOmega.value ** 2 * drumR > 60) // 附着加速度阈值 60 m/s²
let drumAng = 0
const flung: { x: number; y: number; vx: number; vy: number; life: number }[] = []
const records = ref<{ v: number; F: number }[]>([])

function record() {
  records.value.push({ v: carV.value, F: +Fneed.value.toFixed(0) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.v * r.v, y: r.F })))
  emit('record', { rows: records.value, m: carM, r: carR.value })
}

function step(dt: number) {
  if (scene.value === 'car') {
    if (skid.value) skidT += dt; else { skidT = 0; carAng += (carV.value / carR.value) * dt }
    if (skidT > 2.2) skidT = 0
  } else if (scene.value === 'bucket') {
    bucketAng += (bucketV.value / bucketR) * dt
    // 最高点附近若 v < vMin，水洒出
    const topPhase = ((bucketAng % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    if (bucketV.value < vMin && Math.abs(topPhase - Math.PI / 2) < 0.25 && Math.random() < 0.5) {
      const bx = Math.cos(bucketAng) * bucketR, by = Math.sin(bucketAng) * bucketR
      drops.push({ x: bx, y: by, vx: -Math.sin(bucketAng) * bucketV.value * 0.6, vy: Math.cos(bucketAng) * bucketV.value * 0.6 })
    }
    for (const d of drops) { d.vy -= g * dt; d.x += d.vx * dt; d.y += d.vy * dt }
    while (drops.length && drops[0].y < -1.6) drops.shift()
    if (drops.length > 80) drops.splice(0, drops.length - 80)
  } else {
    drumAng += drumOmega.value * dt
    if (flyOut.value && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2
      flung.push({ x: Math.cos(a) * drumR, y: Math.sin(a) * drumR, vx: -Math.sin(a) * drumOmega.value * drumR, vy: Math.cos(a) * drumOmega.value * drumR, life: 0 })
    }
    for (const f of flung) { f.x += f.vx * dt * 0.15; f.y += f.vy * dt * 0.15; f.life += dt }
    for (let i = flung.length - 1; i >= 0; i--) if (flung[i].life > 0.5) flung.splice(i, 1)
  }
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2, cy = h / 2
  if (scene.value === 'car') {
    const pxPerM = Math.min(w, h) / 2.6 / carR.value
    // 弯道
    ctx.strokeStyle = '#3d3d5e'; ctx.lineWidth = 26
    ctx.beginPath(); ctx.arc(cx, cy, carR.value * pxPerM, 0, Math.PI * 2); ctx.stroke()
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 1; ctx.setLineDash([8, 8])
    ctx.beginPath(); ctx.arc(cx, cy, carR.value * pxPerM, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([])
    // 车
    const rr = carR.value * pxPerM + (skid.value ? skidT * 60 : 0)
    const px = cx + Math.cos(carAng) * rr, py = cy + Math.sin(carAng) * rr
    ctx.save(); ctx.translate(px, py); ctx.rotate(carAng + Math.PI / 2)
    ctx.fillStyle = skid.value ? '#E05555' : '#4A90D9'; ctx.fillRect(-9, -16, 18, 32)
    ctx.restore()
    // 向心力箭头（指向圆心）
    const ux = (cx - px), uy = (cy - py), un = Math.hypot(ux, uy) || 1
    const flen = Math.min(90, Fneed.value / 200)
    ctx.strokeStyle = skid.value ? '#E05555' : '#3ecf8e'; ctx.lineWidth = 2.5
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + ux / un * flen, py + uy / un * flen); ctx.stroke()
    label(ctx, `需要 F = mv²/r = ${Fneed.value.toFixed(0)} N　最大静摩擦 μmg = ${Fmax.value.toFixed(0)} N　${skid.value ? '⚠ 侧滑！' : '✓ 安全转弯'}`,
      w / 2, h - 14, skid.value ? '#E05555' : '#7fe3b3', 12)
    label(ctx, `v_max = √(μgr) = ${Math.sqrt(mu.value * g * carR.value).toFixed(1)} m/s`, w / 2, 20, '#8a8aa0', 12)
  } else if (scene.value === 'bucket') {
    const S = Math.min(w, h) / 3.2
    const bx = cx + Math.cos(bucketAng) * bucketR * S, by = cy - Math.sin(bucketAng) * bucketR * S
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(bx, by); ctx.stroke()
    ctx.fillStyle = '#d9a05a'; ctx.fillRect(bx - 12, by - 10, 24, 20)
    ctx.fillStyle = '#4A90D9'; ctx.fillRect(bx - 10, by - 4, 20, 12)
    for (const d of drops) {
      ctx.beginPath(); ctx.arc(cx + d.x * S, cy - d.y * S, 3, 0, Math.PI * 2); ctx.fill()
    }
    const Ttop = 1 * bucketV.value ** 2 / bucketR - g // m=1kg
    label(ctx, `v = ${bucketV.value.toFixed(1)} m/s　临界 √(gr) = ${vMin.toFixed(2)} m/s　最高点绳拉力 T = mv²/r − mg = ${Ttop.toFixed(1)} N`,
      w / 2, h - 14, bucketV.value >= vMin ? '#7fe3b3' : '#E05555', 12)
    label(ctx, bucketV.value >= vMin ? '✓ 水不洒：重力不够提供向心力，绳仍绷紧' : '✗ 太慢：最高点重力大于所需向心力，水洒出', w / 2, 20, bucketV.value >= vMin ? '#7fe3b3' : '#E05555', 12)
  } else {
    const S = Math.min(w, h) / 2.4 / drumR
    ctx.strokeStyle = '#8a8aa0'; ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(cx, cy, drumR * S, 0, Math.PI * 2); ctx.stroke()
    // 桶壁孔洞与衣物
    for (let i = 0; i < 12; i++) {
      const a = drumAng + i / 12 * Math.PI * 2
      ctx.fillStyle = '#23233a'
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * drumR * S, cy + Math.sin(a) * drumR * S, 4, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#b06ce6'
      ctx.beginPath(); ctx.arc(cx + Math.cos(a + 0.26) * drumR * 0.82 * S, cy + Math.sin(a + 0.26) * drumR * 0.82 * S, 9, 0, Math.PI * 2); ctx.fill()
    }
    ctx.fillStyle = '#6cd9e8'
    for (const f of flung) { ctx.beginPath(); ctx.arc(cx + f.x * S, cy + f.y * S, 3, 0, Math.PI * 2); ctx.fill() }
    label(ctx, `n = ${drumRpm.value} r/min　ω = ${drumOmega.value.toFixed(1)} rad/s　ω²r = ${(drumOmega.value ** 2 * drumR).toFixed(0)} m/s²　${flyOut.value ? '水珠沿切线飞出（离心现象）' : '转速不足，水留在衣物上'}`,
      w / 2, h - 14, flyOut.value ? '#7fe3b3' : '#8a8aa0', 12)
  }
}

onMounted(() => { loop = makeLoop((dt) => { step(dt); draw() }) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel ref="lab" title="生活中的圆周运动"
    desc="汽车转弯靠摩擦力提供向心力，太快会侧滑；水流星最高点速度须 ≥√(gr) 水才不洒；洗衣机脱水时衣物随桶转、水珠因附着力不足沿切线飞出。"
    formula="F向 = mv²/r = mω²r"
    :axes="{ x: 'v²', y: 'F', xUnit: 'm²/s²', yUnit: 'N' }">
    <template #controls>
      <div class="row">
        <button class="btn" :class="{ ghost: scene !== 'car' }" @click="scene = 'car'">汽车转弯</button>
        <button class="btn" :class="{ ghost: scene !== 'bucket' }" @click="scene = 'bucket'">水流星</button>
        <button class="btn" :class="{ ghost: scene !== 'drum' }" @click="scene = 'drum'">脱水桶</button>
      </div>
      <template v-if="scene === 'car'">
        <label>车速 v = {{ carV }} m/s<input type="range" min="5" max="30" step="1" v-model.number="carV"></label>
        <label>弯道半径 r = {{ carR }} m<input type="range" min="10" max="60" step="5" v-model.number="carR"></label>
        <label>路面 μ = {{ mu.toFixed(2) }}（干 0.6 / 湿 0.4 / 冰 0.1）<input type="range" min="0.1" max="0.9" step="0.05" v-model.number="mu"></label>
        <div class="readout">F需 = mv²/r = {{ Fneed.toFixed(0) }} N
f_max = μmg = {{ Fmax.toFixed(0) }} N　{{ skid ? '⚠ 侧滑' : '✓ 安全' }}</div>
        <button class="btn alt" @click="record">📏 记录 (v², F)（{{ records.length }}）</button>
      </template>
      <template v-else-if="scene === 'bucket'">
        <label>桶速 v = {{ bucketV.toFixed(1) }} m/s（r = 1 m）<input type="range" min="2" max="6" step="0.1" v-model.number="bucketV"></label>
        <div class="readout">临界速度 √(gr) = {{ vMin.toFixed(2) }} m/s
{{ bucketV >= vMin ? '水不洒' : '水洒出' }}</div>
      </template>
      <template v-else>
        <label>转速 n = {{ drumRpm }} r/min<input type="range" min="100" max="1200" step="50" v-model.number="drumRpm"></label>
        <div class="readout">ω²r = {{ (drumOmega ** 2 * drumR).toFixed(0) }} m/s²
{{ flyOut ? '水珠飞出' : '未达阈值' }}</div>
      </template>
    </template>
    <canvas ref="canvasRef"></canvas>
  </LabPanel>
</template>
