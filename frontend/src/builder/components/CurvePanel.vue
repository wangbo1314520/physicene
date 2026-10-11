<script setup lang="ts">
/**
 * Step2·2.2：ECharts 曲线面板——从 LabView 提取为共享组件。
 * 数据源：useSimulationSocket 单例（vSeries/vIds/ekSeries/pSeries）——BuilderView/LabView 同源消费。
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import { useSimulationSocket } from '../../composables/useSimulationSocket'

const { state } = useSimulationSocket()
const chartRef = ref<HTMLDivElement>()
let chart: echarts.ECharts | null = null

onMounted(() => {
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  chart.setOption({
    darkMode: true, animation: false,
    grid: { left: 46, right: 52, top: 28, bottom: 26 },
    legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 0 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value', name: 't/s', axisLabel: { color: '#8a8aa0' },
      splitLine: { lineStyle: { color: '#23233a' } } },
    yAxis: [
      { type: 'value', name: 'v (m/s)', axisLabel: { color: '#8a8aa0' },
        splitLine: { lineStyle: { color: '#23233a' } } },
      { type: 'value', name: 'Ek/p', axisLabel: { color: '#8a8aa0' }, splitLine: { show: false } },
    ],
    series: [],
  })
})

onUnmounted(() => chart?.dispose())

watch(() => state.frameCount, (n) => {
  if (!chart || n % 6 !== 0) return
  const series: echarts.SeriesOption[] = []
  state.vSeries.forEach((s, i) => {
    const id = state.vIds[i] ?? `主体${i + 1}`
    series.push({ name: `${id}.vx`, type: 'line', showSymbol: false,
      data: s.map((p) => [p.t, +p.vx.toFixed(3)]) })
    series.push({ name: `${id}.vy`, type: 'line', showSymbol: false,
      lineStyle: { type: 'dashed', opacity: 0.7 },
      data: s.map((p) => [p.t, +p.vy.toFixed(3)]) })
  })
  series.push({ name: '总动能 Ek', type: 'line', showSymbol: false, yAxisIndex: 1,
    data: state.ekSeries.map((p) => [p.t, +p.v.toFixed(3)]) })
  series.push({ name: '总动量模 p', type: 'line', showSymbol: false, yAxisIndex: 1,
    data: state.pSeries.map((p) => [p.t, +p.v.toFixed(3)]) })
  chart.setOption({ series }, { replaceMerge: ['series'] })
})
</script>

<template>
  <div class="curve-panel">
    <h4>📈 数据曲线</h4>
    <div ref="chartRef" class="chart" style="width:100%;height:220px"></div>
  </div>
</template>

<style scoped>
.curve-panel { flex: 1; min-width: 300px; }
.curve-panel h4 { font-size: 13px; color: #b0b0cc; margin-bottom: 6px; }
.chart { background: #14142a; border-radius: 8px; }
</style>
