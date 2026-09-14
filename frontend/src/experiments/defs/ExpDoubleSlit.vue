<script setup lang="ts">
/**
 * 代表实验⑥：双缝干涉测量光的波长
 * 光路图（双缝条纹图样）+ 测 Δy → λ = Δy·d/L。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Canvas2DEngine } from '../renderers/canvas2d/Engine'
import { OpticalLayer } from '../renderers/canvas2d/layers'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

const lambdaNm = ref(550)
const dMm = ref(0.2)
const Lm = ref(1.0)
const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: Canvas2DEngine | null = null
let optical: OpticalLayer | null = null

/** 理论条纹间距 Δy = λL/d（mm） */
const fringeTheory = computed(() => ((lambdaNm.value * 1e-9 * Lm.value) / (dMm.value * 1e-3)) * 1000)
/** 学生测量值（游标模拟） */
const measuredMm = ref(2.7)
const measuredLambda = computed(() =>
  +((measuredMm.value * 1e-3 * dMm.value * 1e-3) / Lm.value * 1e9).toFixed(1))

function refresh() {
  if (!optical) return
  optical.state.doubleSlit = { lambdaNm: lambdaNm.value, dMm: dMm.value, Lm: Lm.value }
  engine?.requestRender()
}
function record() {
  emit('record', {
    lambdaTrue: lambdaNm.value, dMm: dMm.value, Lm: Lm.value,
    measuredFringeMm: measuredMm.value,
    lambdaMeasuredNm: measuredLambda.value,
    error: +(100 * Math.abs(measuredLambda.value - lambdaNm.value) / lambdaNm.value).toFixed(2),
  })
}

onMounted(() => {
  if (!canvasRef.value) return
  engine = new Canvas2DEngine(canvasRef.value)
  optical = new OpticalLayer({ doubleSlit: { lambdaNm: lambdaNm.value, dMm: dMm.value, Lm: Lm.value } })
  optical.showSlit = true
  engine.addLayer(optical as any)
  engine.view.scale = 1
  engine.view.ox = 0
  engine.view.oy = 0
  refresh()
})
onUnmounted(() => engine?.destroy())
</script>

<template>
  <div class="exp">
    <div class="panel">
      <h3>双缝干涉：λ = Δy·d / L</h3>
      <label>波长 λ = {{ lambdaNm }} nm
        <input type="range" min="400" max="700" step="10" v-model.number="lambdaNm" @input="refresh"></label>
      <label>缝间距 d = {{ dMm.toFixed(2) }} mm
        <input type="range" min="0.1" max="0.5" step="0.05" v-model.number="dMm" @input="refresh"></label>
      <label>缝屏距 L = {{ Lm.toFixed(1) }} m
        <input type="range" min="0.5" max="2" step="0.1" v-model.number="Lm" @input="refresh"></label>
      <p class="theory">理论条纹间距 Δy = λL/d = <b>{{ fringeTheory.toFixed(3) }} mm</b></p>
      <label>测量值 Δy（游标）= {{ measuredMm.toFixed(2) }} mm
        <input type="range" :min="(fringeTheory * 0.8).toFixed(2)" :max="(fringeTheory * 1.2).toFixed(2)"
               step="0.05" v-model.number="measuredMm"></label>
      <p class="res">测得 λ = Δy·d/L = <b>{{ measuredLambda }} nm</b>（真值 {{ lambdaNm }}）</p>
      <button @click="record">📏 记录测量结果</button>
    </div>
    <div class="canvas-box">
      <canvas ref="canvasRef"></canvas>
    </div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 300px 1fr; gap: 10px; min-height: 420px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 12px; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 10px; }
label input { width: 100%; }
.theory, .res { font: 13px Consolas; color: #3ecf8e; margin: 10px 0; }
.theory b, .res b { font-size: 16px; }
button { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; margin-top: 8px; }
.canvas-box { background: #0a0a14; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-box canvas { width: 100%; height: 100%; display: block; min-height: 380px; }
</style>
