<script setup lang="ts">
/**
 * 代表实验④⑤⑦：矢量（力的合成）/ 轨迹（平抛）/ 方格计数（油膜）
 * 三个轻交互实验合一个组件按 mode 分支，各自接入对应图层。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Canvas2DEngine } from '../renderers/canvas2d/Engine'
import { VectorLayer } from '../renderers/canvas2d/layers'
import { TrajectoryLayer } from '../renderers/canvas2d/layers'
import { GridCountLayer } from '../renderers/canvas2d/layers'
import { OpticalLayer } from '../renderers/canvas2d/layers'

const props = defineProps<{ mode: 'vector' | 'trajectory' | 'grid' | 'optical' }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: Canvas2DEngine | null = null
let vector: VectorLayer | null = null
let traj: TrajectoryLayer | null = null
let grid: GridCountLayer | null = null
let optical: OpticalLayer | null = null

// ── 矢量：两分力大小/夹角 → 合力 ──
const f1 = ref(3), f2 = ref(4), angleDeg = ref(90)
const resultant = computed(() => {
  const a = (angleDeg.value * Math.PI) / 180
  const x = f1.value + f2.value * Math.cos(a)
  const y = f2.value * Math.sin(a)
  return { mag: Math.hypot(x, y), x, y }
})
function syncVector() {
  if (!vector) return
  const a = (angleDeg.value * Math.PI) / 180
  vector.state.arrows = [
    { id: 'f1', name: 'F1', x1: 0, y1: 0, x2: f1.value, y2: 0, color: '#4A90D9' },
    { id: 'f2', name: 'F2', x1: 0, y1: 0, x2: f2.value * Math.cos(a), y2: f2.value * Math.sin(a), color: '#E05555' },
    { id: 'r', name: 'F合', x1: 0, y1: 0, x2: resultant.value.x, y2: resultant.value.y, color: '#3ecf8e', resultant: true },
  ]
  engine?.requestRender()
}
function recordVector() {
  emit('record', { f1: f1.value, f2: f2.value, angle: angleDeg.value,
    resultantMag: +resultant.value.mag.toFixed(3),
    formula: `√(F1²+F2²+2F1F2cosθ) = √(${f1.value}²+${f2.value}²+2·${f1.value}·${f2.value}·cos${angleDeg.value}°) = ${resultant.value.mag.toFixed(3)} N` })
}

// ── 轨迹（平抛）：v0/h 调节 → 播放采样 ──
const v0 = ref(4), h0 = ref(5), playing = ref(false)
let timer = 0
function playTrajectory() {
  if (!traj || playing.value) return
  traj.state.samples = []
  playing.value = true
  let t = 0
  timer = window.setInterval(() => {
    t += 0.05
    const x = v0.value * t
    const y = h0.value - 0.5 * 9.8 * t * t
    if (y < 0) {
      window.clearInterval(timer)
      playing.value = false
      emit('record', { samples: traj?.state.samples ?? [], v0: v0.value, h: h0.value,
        theory: `x=v₀t, y=h−½gt²（v₀=${v0.value}m/s, h=${h0.value}m）` })
      return
    }
    if (traj) traj.state.samples.push({ t, x, y })
    engine?.requestRender()
  }, 30)
}

// ── 方格计数（油膜）：点击标记格子 ──
const dropVolume = ref(0.04) // mL 稀释液含纯油酸
const dilution = ref(1 / 200)
const counted = computed(() => grid?.state.marked.length ?? 0)
const areaCm2 = computed(() => counted.value * 1) // 1 格 = 1 cm²
const diameterNm = computed(() => {
  const pureM3 = dropVolume.value * 1e-6 * dilution.value
  const areaM2 = areaCm2.value * 1e-4
  if (areaM2 <= 0) return 0
  return (pureM3 / areaM2) * 1e9
})

// ── 光路（折射）：调入射角 ──
const incidentDeg = ref(45)
const refractDeg = computed(() => {
  const n = 1.5
  const r = Math.asin(Math.sin((incidentDeg.value * Math.PI) / 180) / n)
  return +((r * 180) / Math.PI).toFixed(2)
})

onMounted(() => {
  if (!canvasRef.value) return
  engine = new Canvas2DEngine(canvasRef.value, { snap: 0 })
  if (props.mode === 'vector') {
    vector = new VectorLayer({ arrows: [], gridScale: 1 })
    engine.addLayer(vector as any)
    engine.view.scale = 30
    engine.view.ox = canvasRef.value.clientWidth / 2 - 50
    engine.view.oy = canvasRef.value.clientHeight / 2
    syncVector()
  } else if (props.mode === 'trajectory') {
    traj = new TrajectoryLayer({ samples: [] })
    engine.addLayer(traj as any)
    engine.view.scale = 25
    engine.view.ox = 60
    engine.view.oy = canvasRef.value.clientHeight - 50
  } else if (props.mode === 'grid') {
    // 椭圆油膜轮廓（1 格 = 1cm，约 40 格面积）
    const outline: { x: number; y: number }[] = []
    for (let a = 0; a < 360; a += 8) {
      const rad = (a * Math.PI) / 180
      const r = 3.6 + 0.5 * Math.sin(3 * rad) + 0.3 * Math.cos(5 * rad)
      outline.push({ x: +(r * Math.cos(rad)).toFixed(2), y: +(r * Math.sin(rad) * 0.9).toFixed(2) })
    }
    grid = new GridCountLayer({ cellSize: 1, marked: [] }, outline)
    engine.addLayer(grid as any)
    engine.view.scale = 28
    engine.view.ox = canvasRef.value.clientWidth / 2 - 28
    engine.view.oy = canvasRef.value.clientHeight / 2 + 42
    engine.onPointerDown = (e) => {
      if (e.button !== 0) return
      const cell = grid!.hitCell(engine!.snapPoint(e.world))
      grid!.toggleMark(cell)
      engine!.requestRender()
      return false
    }
  } else if (props.mode === 'optical') {
    optical = new OpticalLayer({ refraction: [{ incidentDeg: incidentDeg.value, refractDeg: refractDeg.value }] })
    optical.showSlit = false
    engine.addLayer(optical as any)
    engine.view.scale = 1
    engine.view.ox = canvasRef.value.clientWidth / 2
    engine.view.oy = canvasRef.value.clientHeight / 3
  }
  engine.requestRender()
})
onUnmounted(() => {
  window.clearInterval(timer)
  engine?.destroy()
})

function recordGrid() {
  emit('record', { cells: counted.value, areaCm2: areaCm2.value,
    pureVolumeM3: dropVolume.value * 1e-6 * dilution.value,
    diameterNm: +diameterNm.value.toFixed(3) })
}
function recordOptical() {
  if (!optical) return
  optical.state.refraction = [{ incidentDeg: incidentDeg.value, refractDeg: refractDeg.value }]
  const n = Math.sin((incidentDeg.value * Math.PI) / 180) / Math.sin((refractDeg.value * Math.PI) / 180)
  emit('record', { incidentDeg: incidentDeg.value, refractDeg: refractDeg.value, n: +n.toFixed(3) })
  engine?.requestRender()
}
</script>

<template>
  <div class="exp">
    <div class="panel">
      <template v-if="mode === 'vector'">
        <h3>探究力的合成：平行四边形定则</h3>
        <label>分力 F1 = {{ f1 }} N<input type="range" min="1" max="6" step="0.5" v-model.number="f1" @input="syncVector"></label>
        <label>分力 F2 = {{ f2 }} N<input type="range" min="1" max="6" step="0.5" v-model.number="f2" @input="syncVector"></label>
        <label>夹角 θ = {{ angleDeg }}°<input type="range" min="0" max="150" step="5" v-model.number="angleDeg" @input="syncVector"></label>
        <p class="res">合力 |F| = <b>{{ resultant.mag.toFixed(3) }} N</b></p>
        <p class="formula">√(F1²+F2²+2F1F2cosθ)</p>
        <button @click="recordVector">📏 记录验证数据</button>
      </template>

      <template v-else-if="mode === 'trajectory'">
        <h3>平抛运动：水平匀速 + 竖直自由落体</h3>
        <label>初速度 v₀ = {{ v0 }} m/s<input type="range" min="1" max="8" step="0.5" v-model.number="v0"></label>
        <label>初始高度 h = {{ h0 }} m<input type="range" min="2" max="10" step="1" v-model.number="h0"></label>
        <p class="res">轨迹应满足 y = h − (g/2v₀²)·x²</p>
        <button @click="playTrajectory" :disabled="playing">▶ 播放并采样轨迹</button>
      </template>

      <template v-else-if="mode === 'grid'">
        <h3>油膜法估测分子直径</h3>
        <p class="desc">点击轮廓内格子计数（不足半格舍去，超过半格计一格）</p>
        <label>一滴稀释液 = {{ dropVolume }} mL<input type="range" min="0.01" max="0.1" step="0.01" v-model.number="dropVolume"></label>
        <label>油酸浓度 1/{{ Math.round(1/dilution) }}<input type="range" min="0.002" max="0.01" step="0.001" v-model.number="dilution"></label>
        <p class="res">标记 {{ counted }} 格 ≈ {{ areaCm2 }} cm²</p>
        <p class="res">d = V/S = <b>{{ diameterNm.toFixed(2) }}×10⁻⁹ m</b></p>
        <button @click="recordGrid">📏 记录计数结果</button>
      </template>

      <template v-else>
        <h3>光的折射：测玻璃折射率</h3>
        <label>入射角 θ₁ = {{ incidentDeg }}°<input type="range" min="15" max="75" step="1" v-model.number="incidentDeg"></label>
        <p class="res">折射角 θ₂ = <b>{{ refractDeg }}°</b></p>
        <p class="formula">n = sinθ₁ / sinθ₂ = {{ (Math.sin(incidentDeg * Math.PI / 180) / Math.sin(refractDeg * Math.PI / 180)).toFixed(3) }}</p>
        <button @click="recordOptical">📏 记录 (θ₁, θ₂)</button>
      </template>
    </div>
    <div class="canvas-box">
      <canvas ref="canvasRef"></canvas>
      <p class="tip">滚轮缩放 · 中键/右键平移</p>
    </div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 300px 1fr; gap: 10px; min-height: 420px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 12px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 10px; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 10px; }
label input { width: 100%; }
.res { font: 14px Consolas; color: #3ecf8e; margin: 10px 0; }
.res b { font-size: 17px; }
.formula { font: 12px Consolas; color: #6c6c85; margin-bottom: 10px; }
button { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; margin-top: 8px; }
button:disabled { opacity: 0.4; }
.canvas-box { position: relative; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-box canvas { width: 100%; height: 100%; display: block; touch-action: none; min-height: 380px; }
.tip { position: absolute; bottom: 6px; left: 10px; font-size: 10px; color: #565675; }
</style>
