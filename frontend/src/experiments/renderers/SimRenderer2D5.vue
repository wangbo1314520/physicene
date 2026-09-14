<script setup lang="ts">
/**
 * 2.5D 实验渲染器（B0）：复用 threeScene + 仿真 WebSocket + ECharts 曲线。
 * 对 Shell 暴露事件：sim-ended（步骤 check 用）/ 数据摘要（记录按钮用）。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { createSimRenderer, type SimRenderer } from '../../sim/threeScene'
import {
  useSimulationSocket, type PhysicsElementInput,
} from '../../composables/useSimulationSocket'

const props = defineProps<{ preset: { elements: unknown[]; config: Record<string, unknown> } }>()
const emit = defineEmits<{
  (e: 'ended', summary: Record<string, unknown>): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let renderer: SimRenderer | null = null
let chart: echarts.ECharts | null = null
const { state, error, run, pause, play, end, close } = useSimulationSocket()
const busy = ['running', 'paused', 'connecting'].includes(state.status)

/** 数据摘要：极值 + 关键事件（记录步骤写入 rawData） */
function buildSummary(): Record<string, unknown> {
  const extremes: Record<string, { min: number; max: number }> = {}
  for (const s of state.vSeries) {
    for (const pt of s) {
      for (const key of ['vx', 'vy'] as const) {
        const e = (extremes[key] ??= { min: pt[key], max: pt[key] })
        e.min = Math.min(e.min, pt[key])
        e.max = Math.max(e.max, pt[key])
      }
    }
  }
  const ek = state.ekSeries.map((x) => x.v)
  return {
    totalDuration: state.endInfo?.totalDuration ?? null,
    endReason: state.endInfo?.reason ?? null,
    keyEvents: state.keyEvents,
    velocityExtremes: extremes,
    kineticEnergy: ek.length ? { min: Math.min(...ek), max: Math.max(...ek) } : null,
    frames: state.frameCount,
  }
}

async function startRun() {
  chart?.setOption({ series: [] }, { replaceMerge: ['series'] })
  await run(props.preset.elements as PhysicsElementInput[], props.preset.config)
}

watch(() => state.status, (s) => {
  if (s === 'ended') {
    emit('ended', buildSummary())
  }
})
watch(() => state.subjects, (subjects) => {
  if (subjects.length) renderer?.updateStates(subjects)
}, { deep: true })
watch(() => state.frameCount, (n) => {
  if (!chart || n % 6 !== 0) return
  const series: echarts.SeriesOption[] = []
  state.vSeries.forEach((s, i) => {
    series.push({
      name: state.vIds[i] ?? `v${i + 1}`, type: 'line', showSymbol: false,
      data: s.map((p) => [p.t, +p.vx.toFixed(3)]),
    })
    series.push({
      name: (state.vIds[i] ?? `v${i + 1}`) + '.vy', type: 'line', showSymbol: false,
      lineStyle: { type: 'dashed', opacity: 0.7 },
      data: s.map((p) => [p.t, +p.vy.toFixed(3)]),
    })
  })
  series.push({
    name: '总动能 Ek', type: 'line', showSymbol: false, yAxisIndex: 1,
    data: state.ekSeries.map((p) => [p.t, +p.v.toFixed(3)]),
  })
  chart.setOption({ series }, { replaceMerge: ['series'] })
})

defineExpose({ buildSummary, startRun })

onMounted(() => {
  if (canvasRef.value) {
    renderer = createSimRenderer(canvasRef.value)
    renderer.syncElements(JSON.parse(JSON.stringify(props.preset.elements)))
  }
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      darkMode: true, animation: false,
      grid: { left: 46, right: 52, top: 28, bottom: 26 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 0 },
      xAxis: { type: 'value', name: 't/s', axisLabel: { color: '#8a8aa0' },
        splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: [
        { type: 'value', name: 'v (m/s)', axisLabel: { color: '#8a8aa0' },
          splitLine: { lineStyle: { color: '#23233a' } } },
        { type: 'value', name: 'Ek (J)', axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
      ],
      series: [],
    })
  }
})
onUnmounted(() => {
  close()
  renderer?.dispose()
  chart?.dispose()
})
</script>

<template>
  <div class="sim25d">
    <div class="toolbar">
      <button class="primary" :disabled="busy" @click="startRun">▶ 运行实验</button>
      <button :disabled="state.status !== 'running'" @click="pause">⏸</button>
      <button :disabled="state.status !== 'paused'" @click="play">▶</button>
      <button :disabled="state.status === 'idle' || state.status === 'ended'" @click="end">■</button>
      <span class="status">{{ state.status === 'running' ? `t=${state.currentT.toFixed(2)}s` : state.status }}</span>
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div class="canvas-wrap">
      <canvas ref="canvasRef"></canvas>
      <div v-if="state.keyEvents.length" class="events">
        <div v-for="(ev, i) in state.keyEvents.slice(-3)" :key="i" class="tag">⚡ {{ ev.label }} @ {{ ev.t.toFixed(2) }}s</div>
      </div>
    </div>
    <div ref="chartRef" class="chart"></div>
  </div>
</template>

<style scoped>
.sim25d { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.toolbar { display: flex; gap: 8px; align-items: center; }
.toolbar button { background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 6px 14px; cursor: pointer; font-size: 13px; }
.toolbar .primary { background: #2b5c8f; border-color: #4a90d9; }
.toolbar button:disabled { opacity: 0.4; }
.status { color: #8a8aa0; font-size: 12px; margin-left: auto; }
.error { color: #e05555; font-size: 12px; }
.canvas-wrap { position: relative; flex: 1; min-height: 260px; background: #14142a;
  border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-wrap canvas { width: 100%; height: 100%; display: block; }
.events { position: absolute; top: 8px; left: 8px; display: flex; flex-direction: column; gap: 4px; }
.tag { background: rgba(62,207,142,.15); border: 1px solid #3ecf8e; color: #7fe3b3;
  font-size: 11px; border-radius: 4px; padding: 2px 8px; }
.chart { height: 180px; flex-shrink: 0; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; }
</style>
