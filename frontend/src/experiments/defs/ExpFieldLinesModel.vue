<script setup lang="ts">
/**
 * 电场线、等势面（模型）（必修三）
 * 预设：单正电荷 / 单负电荷 / 等量异种（偶极）/ 等量同种 / 匀强电场（平行板）
 * 电场线：从正电荷出发沿 E 方向积分（RK2），到负电荷或出界终止，线中带箭头；
 * 等势面：背景按电势分色带（离散化即"等势线族"）。电荷可拖动。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import LabPanel from './apparatus/LabPanel.vue'
import { fitCanvas, label, makeLoop } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let loop: { stop: () => void } | null = null

type Charge = { x: number; y: number; q: number }
const preset = ref<'pos' | 'neg' | 'dipole' | 'same' | 'uniform'>('dipole')
const charges = ref<Charge[]>([])
const showPotential = ref(true)
let dragIdx = -1
let dirty = true
let cache: { lines: { pts: [number, number][]; q: number }[]; pot: ImageData | null } = { lines: [], pot: null }

function applyPreset() {
  const p = preset.value
  if (p === 'pos') charges.value = [{ x: 0.5, y: 0.5, q: 1 }]
  else if (p === 'neg') charges.value = [{ x: 0.5, y: 0.5, q: -1 }]
  else if (p === 'dipole') charges.value = [{ x: 0.36, y: 0.5, q: 1 }, { x: 0.64, y: 0.5, q: -1 }]
  else if (p === 'same') charges.value = [{ x: 0.36, y: 0.5, q: 1 }, { x: 0.64, y: 0.5, q: 1 }]
  else charges.value = [
    ...Array.from({ length: 7 }, (_, i) => ({ x: 0.2 + i * 0.1, y: 0.22, q: 0.6 })),
    ...Array.from({ length: 7 }, (_, i) => ({ x: 0.2 + i * 0.1, y: 0.78, q: -0.6 })),
  ]
  dirty = true
  emit('record', { preset: p, charges: charges.value.length })
}
watch(preset, applyPreset, { immediate: true })
watch(showPotential, () => (dirty = true))

function fieldAt(x: number, y: number): [number, number] {
  let ex = 0, ey = 0
  for (const c of charges.value) {
    const dx = x - c.x, dy = y - c.y
    const r2 = Math.max(1e-4, dx * dx + dy * dy)
    const f = c.q / (r2 * Math.sqrt(r2))
    ex += f * dx; ey += f * dy
  }
  return [ex, ey]
}
function potentialAt(x: number, y: number): number {
  let v = 0
  for (const c of charges.value) v += c.q / Math.max(0.03, Math.hypot(x - c.x, y - c.y))
  return v
}

function buildLines(): { pts: [number, number][]; q: number }[] {
  const lines: { pts: [number, number][]; q: number }[] = []
  const stepLen = 0.006
  const trace = (x0: number, y0: number, sign: 1 | -1, q: number) => {
    const pts: [number, number][] = [[x0, y0]]
    let x = x0, y = y0
    for (let s = 0; s < 700; s++) {
      const [ex, ey] = fieldAt(x, y)
      const m = Math.hypot(ex, ey)
      if (m < 1e-6) break
      // RK2 中点
      const mx = x + (sign * ex / m) * stepLen / 2, my = y + (sign * ey / m) * stepLen / 2
      const [ex2, ey2] = fieldAt(mx, my)
      const m2 = Math.hypot(ex2, ey2) || 1
      x += (sign * ex2 / m2) * stepLen; y += (sign * ey2 / m2) * stepLen
      pts.push([x, y])
      if (x < -0.05 || x > 1.05 || y < -0.05 || y > 1.05) break
      if (charges.value.some((c) => Math.sign(c.q) === -sign && Math.hypot(x - c.x, y - c.y) < 0.02)) break
    }
    if (pts.length > 4) lines.push({ pts, q })
  }
  const positives = charges.value.filter((c) => c.q > 0)
  const negatives = charges.value.filter((c) => c.q < 0)
  const sources = positives.length ? positives : negatives
  const sign: 1 | -1 = positives.length ? 1 : -1
  for (const c of sources) {
    const n = preset.value === 'uniform' ? 3 : Math.round(8 + 8 * Math.abs(c.q))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.1
      trace(c.x + Math.cos(a) * 0.022, c.y + Math.sin(a) * 0.022, sign, c.q)
    }
  }
  return lines
}

function buildPotential(w: number, h: number, ctx: CanvasRenderingContext2D): ImageData {
  const W = 96, H = Math.max(8, Math.round(96 * h / w))
  const img = ctx.createImageData(W, H)
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const v = potentialAt(i / W, j / H)
      // 离散色带（等势线族）：正红负蓝
      const band = Math.round(Math.max(-1, Math.min(1, v / 20)) * 6) / 6
      const idx = (j * W + i) * 4
      const t = Math.abs(band)
      img.data[idx] = band > 0 ? 40 + 120 * t : 20
      img.data[idx + 1] = 22
      img.data[idx + 2] = band < 0 ? 46 + 130 * t : 42
      img.data[idx + 3] = 255
    }
  }
  return img
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  if (dirty) {
    cache.lines = buildLines()
    cache.pot = showPotential.value ? buildPotential(w, h, ctx) : null
    dirty = false
  }
  ctx.clearRect(0, 0, w, h)
  if (cache.pot) {
    const off = document.createElement('canvas')
    off.width = cache.pot.width; off.height = cache.pot.height
    off.getContext('2d')!.putImageData(cache.pot, 0, 0)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(off, 0, 0, w, h)
  }
  // 电场线 + 中段箭头
  for (const line of cache.lines) {
    ctx.strokeStyle = 'rgba(245,197,66,0.85)'; ctx.lineWidth = 1.4
    ctx.beginPath()
    line.pts.forEach((p, i) => (i ? ctx.lineTo(p[0] * w, p[1] * h) : ctx.moveTo(p[0] * w, p[1] * h)))
    ctx.stroke()
    const mid = Math.floor(line.pts.length * 0.5)
    if (mid > 1 && mid < line.pts.length - 1) {
      const [x1, y1] = line.pts[mid - 1], [x2, y2] = line.pts[mid + 1]
      const a = Math.atan2((y2 - y1) * h, (x2 - x1) * w)
      const px = line.pts[mid][0] * w, py = line.pts[mid][1] * h
      ctx.fillStyle = '#F5C542'
      ctx.beginPath(); ctx.moveTo(px + 7 * Math.cos(a), py + 7 * Math.sin(a))
      ctx.lineTo(px - 5 * Math.cos(a - 0.5), py - 5 * Math.sin(a - 0.5)); ctx.lineTo(px - 5 * Math.cos(a + 0.5), py - 5 * Math.sin(a + 0.5)); ctx.fill()
    }
  }
  // 电荷
  for (const ch of charges.value) {
    const r = preset.value === 'uniform' ? 7 : 14
    ctx.fillStyle = ch.q > 0 ? '#E05555' : '#4A90D9'
    ctx.beginPath(); ctx.arc(ch.x * w, ch.y * h, r, 0, Math.PI * 2); ctx.fill()
    if (preset.value !== 'uniform') label(ctx, ch.q > 0 ? '+' : '−', ch.x * w, ch.y * h, '#fff', 16)
  }
  if (preset.value === 'uniform') { label(ctx, '+ + + + + + +  极板', w / 2, h * 0.22 - 18, '#E05555', 12); label(ctx, '− − − − − − −  极板', w / 2, h * 0.78 + 20, '#4A90D9', 12) }
  label(ctx, `${showPotential.value ? '色带 = 等势面（同色同势，与电场线处处垂直）　' : ''}电场线：从正电荷出发、终止于负电荷或无穷远，箭头为 E 方向`, w / 2, h - 12, '#b0b0cc', 11)
}

function pick(e: PointerEvent): number {
  const c = canvasRef.value!
  const r = c.getBoundingClientRect()
  const x = (e.clientX - r.left) / c.clientWidth, y = (e.clientY - r.top) / c.clientHeight
  return charges.value.findIndex((ch) => Math.hypot((ch.x - x) * c.clientWidth, (ch.y - y) * c.clientHeight) < 16)
}
function onDown(e: PointerEvent) { if (preset.value === 'uniform') return; dragIdx = pick(e) }
function onMove(e: PointerEvent) {
  if (dragIdx < 0) return
  const c = canvasRef.value!
  const r = c.getBoundingClientRect()
  charges.value[dragIdx].x = Math.max(0.05, Math.min(0.95, (e.clientX - r.left) / c.clientWidth))
  charges.value[dragIdx].y = Math.max(0.05, Math.min(0.95, (e.clientY - r.top) / c.clientHeight))
  dirty = true
}
function onUp() { dragIdx = -1 }

onMounted(() => { loop = makeLoop(() => draw()) })
onUnmounted(() => loop?.stop())
</script>

<template>
  <LabPanel title="电场线、等势面（模型）" :graph="false"
    desc="电场线是为形象描述电场引入的假想曲线：切线方向为 E 方向，疏密表示强弱，从正电荷出发终止于负电荷。等势面处处与电场线垂直，沿等势面移动电荷不做功。"
    formula="E = kQ/r²（点电荷）　匀强电场：电场线平行等距">
    <template #controls>
      <label>场型
        <select v-model="preset" class="sel">
          <option value="pos">单个正点电荷</option>
          <option value="neg">单个负点电荷</option>
          <option value="dipole">等量异种电荷</option>
          <option value="same">等量同种电荷</option>
          <option value="uniform">匀强电场（平行板）</option>
        </select>
      </label>
      <label><input type="checkbox" v-model="showPotential" style="width:auto;margin-right:6px"> 显示等势面色带</label>
      <div class="readout">电荷数 {{ charges.length }}{{ preset !== 'uniform' ? '\n可在画布上拖动电荷观察场线变化' : '' }}</div>
      <p class="hint">等量异种：场线由正到负、两电荷连线中点场最弱处在两侧；等量同种：中点 E=0（场线避开）；平行板间：匀强场。</p>
    </template>
    <canvas ref="canvasRef" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointerleave="onUp"></canvas>
  </LabPanel>
</template>

<style scoped>
.sel { width: 100%; background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a; border-radius: 6px; padding: 6px; margin-top: 4px; }
</style>
