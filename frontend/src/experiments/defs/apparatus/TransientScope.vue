<script setup lang="ts">
/**
 * 暂态示波器：多条曲线各自归一化到自身峰值，图例标出峰值；用于 RC/RL/LC 的 u(t)、i(t)。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { fitCanvas } from './circuit'

export interface ScopeSeries { name: string; color: string; values: number[]; unit?: string }
const props = withDefaults(defineProps<{ t: number[]; series: ScopeSeries[]; title?: string; height?: number }>(), { height: 300 })
const canvasRef = ref<HTMLCanvasElement | null>(null)

function fmt(v: number, unit = ''): string {
  const a = Math.abs(v)
  if (unit === 'A' && a < 1) return a < 1e-3 ? `${(v * 1e6).toFixed(0)} μA` : `${(v * 1e3).toFixed(2)} mA`
  return `${v.toFixed(a < 10 ? 3 : 1)} ${unit}`
}

function draw() {
  const cv = canvasRef.value
  if (!cv) return
  const { ctx, w, h } = fitCanvas(cv)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#14142a'; ctx.fillRect(0, 0, w, h)
  const L = 56, R = 16, T = 30, B = 34
  const pw = w - L - R, ph = h - T - B
  // 网格
  ctx.strokeStyle = '#23233a'; ctx.lineWidth = 1
  for (let i = 0; i <= 10; i++) { const x = L + (pw * i) / 10; ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke() }
  for (let i = 0; i <= 8; i++) { const y = T + (ph * i) / 8; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke() }
  ctx.strokeStyle = '#8a8aa0'; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.lineTo(L + pw, T + ph); ctx.stroke()
  const zeroY = T + ph / 2
  ctx.strokeStyle = '#3d3d5c'; ctx.beginPath(); ctx.moveTo(L, zeroY); ctx.lineTo(L + pw, zeroY); ctx.stroke()
  ctx.fillStyle = '#6c6c85'; ctx.font = '11px system-ui'; ctx.textAlign = 'center'
  if (props.title) { ctx.textAlign = 'left'; ctx.fillStyle = '#b0b0cc'; ctx.fillText(props.title, L, 14) }
  const tmax = props.t.at(-1) ?? 1
  ctx.textAlign = 'center'; ctx.fillStyle = '#6c6c85'
  for (let i = 0; i <= 5; i++) ctx.fillText(`${((tmax * i) / 5).toFixed(tmax < 1 ? 2 : 1)} s`, L + (pw * i) / 5, T + ph + 16)
  // 曲线（各自归一化，双极性：0 在中线）
  let lx = L
  for (const s of props.series) {
    const peak = Math.max(1e-12, ...s.values.map((v) => Math.abs(v)))
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath()
    const n = Math.min(s.values.length, props.t.length)
    const step = Math.max(1, Math.floor(n / pw))
    for (let k = 0; k < n; k += step) {
      const x = L + (props.t[k] / tmax) * pw, y = zeroY - (s.values[k] / peak) * (ph / 2 - 4)
      k === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.fillStyle = s.color; ctx.textAlign = 'left'
    ctx.fillText(`■ ${s.name}  峰值 ${fmt(peak, s.unit ?? '')}`, lx + 90, 14 + 0)
    lx += 190
  }
}

let ro: ResizeObserver | null = null
onMounted(() => { draw(); ro = new ResizeObserver(() => draw()); if (canvasRef.value) ro.observe(canvasRef.value) })
onUnmounted(() => ro?.disconnect())
watch(() => [props.t, props.series], () => requestAnimationFrame(draw), { deep: true })
</script>

<template>
  <div class="scope" :style="{ height: height + 'px' }"><canvas ref="canvasRef"></canvas></div>
</template>

<style scoped>
.scope { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.scope canvas { display: block; width: 100%; height: 100%; }
</style>
