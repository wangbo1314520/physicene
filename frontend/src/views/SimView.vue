<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { createSimRenderer, type SimRenderer } from '../sim/threeScene'
import {
  useSimulationSocket,
  type PhysicsElementInput,
} from '../composables/useSimulationSocket'

const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let renderer: SimRenderer | null = null
let chart: echarts.ECharts | null = null

const { state, error, run, pause, play, step, end } = useSimulationSocket()

// 预置两个实验场景（Day 14 验收：两车碰撞动量守恒；Day 8：自由落体）
const presets: Record<string, { name: string; elements: PhysicsElementInput[]; config: Record<string, unknown> }> = {
  collision: {
    name: '两车弹性碰撞（动量守恒）',
    elements: [
      { id: 'car1', type: 'cube', position: { x: -3, y: 0.5 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0, restitution: 1.0 },
        initialState: { velocity: { x: 5, y: 0 } } },
      { id: 'car2', type: 'cube', position: { x: 3, y: 0.5 }, color: '#E05555',
        properties: { mass: 1, friction: 0, restitution: 1.0 },
        initialState: { velocity: { x: -5, y: 0 } } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: 0 }, maxDuration: 3.0 },
  },
  freefall: {
    name: '自由落体（1s 下落 ≈4.9m）',
    elements: [
      { id: 'ball', type: 'sphere', position: { x: 0, y: 10 }, color: '#F5C542',
        properties: { mass: 1, friction: 0, restitution: 0.2 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -0.1 }, scale: { x: 20, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 3.0 },
  },
  slope: {
    name: '斜面滑块（slope 元件）',
    elements: [
      { id: 'slope1', type: 'slope', position: { x: -2, y: 0 }, scale: { x: 2, y: 1.2 },
        color: '#3ecf8e' },
      { id: 'block', type: 'cube', position: { x: -3.4, y: 1.6 }, color: '#4A90D9',
        properties: { mass: 1, friction: 0.1, restitution: 0.1 } },
      { id: 'ground', type: 'wall', position: { x: 0, y: -1.2 }, scale: { x: 30, y: 0.2 },
        color: '#8a8aa0' },
    ],
    config: { gravity: { x: 0, y: -9.8 }, maxDuration: 4.0 },
  },
}
const selected = ref<keyof typeof presets>('collision')

const statusText = reactive({
  get() {
    switch (state.status) {
      case 'running': return `▶ 运行中 t=${state.currentT.toFixed(2)}s`
      case 'paused': return `⏸ 已暂停 t=${state.currentT.toFixed(2)}s`
      case 'ended': return `■ 已结束 (${state.endInfo?.reason ?? ''} ${state.endInfo?.totalDuration.toFixed(2) ?? 0}s)`
      case 'connecting': return '… 连接中'
      default: return '待运行'
    }
  },
})

function startRun() {
  const preset = presets[selected.value]
  renderer?.syncElements(preset.elements)
  run(preset.elements, preset.config)
}

watch(
  () => state.subjects,
  (subjects) => renderer?.updateStates(subjects),
  { deep: true },
)

// v-t 图增量刷新（每 6 帧一次，避免 ECharts 重排压力）
watch(
  () => state.frameCount,
  (n) => {
    if (!chart || n % 6 !== 0) return
    chart.setOption({
      series: [
        ...state.vSeries.map((s, i) => ({
          name: `|v${i + 1}|`,
          type: 'line' as const,
          showSymbol: false,
          data: s.map((p) => [p.t, +p.v.toFixed(3)]),
        })),
        {
          name: 'Ek',
          type: 'line' as const,
          showSymbol: false,
          yAxisIndex: 1,
          data: state.ekSeries.map((p) => [p.t, +p.v.toFixed(3)]),
        },
        {
          name: 'p',
          type: 'line' as const,
          showSymbol: false,
          yAxisIndex: 1,
          data: state.pSeries.map((p) => [p.t, +p.v.toFixed(3)]),
        },
      ],
    })
  },
)

onMounted(() => {
  if (canvasRef.value) {
    renderer = createSimRenderer(canvasRef.value)
    renderer.syncElements(presets[selected.value].elements)
  }
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption({
      darkMode: true,
      animation: false,
      grid: { left: 50, right: 55, top: 30, bottom: 28 },
      legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 2 },
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'value', name: 't/s', nameTextStyle: { color: '#6c6c85' },
        axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
      yAxis: [
        { type: 'value', name: '|v| (m/s)', nameTextStyle: { color: '#6c6c85' },
          axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
        { type: 'value', name: 'Ek / p', nameTextStyle: { color: '#6c6c85' },
          axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
      ],
      series: [],
    })
  }
})

onUnmounted(() => {
  renderer?.dispose()
  chart?.dispose()
})
</script>

<template>
  <main class="sim-page">
    <section class="toolbar">
      <select v-model="selected" :disabled="state.status === 'running' || state.status === 'paused'">
        <option v-for="(p, k) in presets" :key="k" :value="k">{{ p.name }}</option>
      </select>
      <button class="primary" :disabled="state.status === 'running' || state.status === 'connecting'"
              @click="startRun">▶ 运行</button>
      <button :disabled="state.status !== 'running'" @click="pause">⏸ 暂停</button>
      <button :disabled="state.status !== 'paused'" @click="play">▶ 继续</button>
      <button :disabled="state.status !== 'paused'" @click="step">⏭ 单步</button>
      <button :disabled="state.status === 'ended' || state.status === 'idle'" @click="end">■ 停止</button>
      <span class="status">{{ statusText }}</span>
    </section>

    <p v-if="error" class="error">{{ error }}</p>

    <section class="content">
      <div class="canvas-wrap">
        <canvas ref="canvasRef"></canvas>
        <div v-if="state.keyEvents.length" class="events">
          <div v-for="(ev, i) in state.keyEvents" :key="i" class="event-tag">
            ⚡ {{ ev.label }} @ {{ ev.t.toFixed(2) }}s
          </div>
        </div>
      </div>
      <div class="chart-wrap">
        <div ref="chartRef" class="chart"></div>
        <div class="meta">
          <div>接收帧数: {{ state.frameCount }}</div>
          <div>关键事件: {{ state.keyEvents.length }}</div>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.sim-page { max-width: 1280px; margin: 0 auto; padding: 16px 24px; }
.toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.toolbar select, .toolbar button {
  background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 7px 14px; font-size: 13px; cursor: pointer;
}
.toolbar button:disabled { opacity: 0.4; cursor: not-allowed; }
.toolbar .primary { background: #2b5c8f; border-color: #4a90d9; }
.status { color: #8a8aa0; font-size: 13px; margin-left: 8px; }
.error { color: #e05555; font-size: 13px; }
.content { display: grid; grid-template-columns: 1.5fr 1fr; gap: 14px; }
.canvas-wrap { position: relative; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-wrap canvas { display: block; width: 100%; height: 520px; }
.events { position: absolute; top: 10px; left: 10px; display: flex; flex-direction: column; gap: 6px; }
.event-tag {
  background: rgba(62, 207, 142, 0.15); border: 1px solid #3ecf8e; color: #7fe3b3;
  font-size: 11px; border-radius: 4px; padding: 2px 8px;
}
.chart-wrap { display: flex; flex-direction: column; gap: 8px; }
.chart { height: 460px; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; }
.meta { display: flex; gap: 18px; color: #6c6c85; font-size: 12px; }
@media (max-width: 960px) { .content { grid-template-columns: 1fr; } }
</style>
