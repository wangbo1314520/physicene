<script setup lang="ts">
/**
 * 探究电感器和电容器对交流电的影响（选必二）
 * 仪器：交流电源接两支路——L 支路（灯+电感）、C 支路（灯+电容），改变频率 f 观察灯泡亮度：
 * 感抗 X_L=2πfL 随 f 增大（L 灯变暗），容抗 X_C=1/(2πfC) 随 f 减小（C 灯变亮）。
 * 自动扫频动画；右侧曲线 X_L(f)、X_C(f) 带当前频率游标；记录 (f, X_L)。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import * as echarts from 'echarts'
import LabPanel from './apparatus/LabPanel.vue'
import { acSource, capacitor, currentDots, fitCanvas, inductor, label, lamp, makeLoop, wire } from './apparatus/circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const lab = ref<InstanceType<typeof LabPanel> | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
let loop: { stop: () => void } | null = null

const U = 20, Rlamp = 60, Lh = 0.1, Cf = 10e-6
const f = ref(200)
const sweeping = ref(false)
const XL = computed(() => 2 * Math.PI * f.value * Lh)
const XC = computed(() => 1 / (2 * Math.PI * f.value * Cf))
const IL = computed(() => U / Math.hypot(Rlamp, XL.value))
const IC = computed(() => U / Math.hypot(Rlamp, XC.value))
const records = ref<{ f: number; XL: number; XC: number }[]>([])
let phase = 0
let acPhase = 0

function record() {
  records.value.push({ f: f.value, XL: +XL.value.toFixed(1), XC: +XC.value.toFixed(1) })
  lab.value?.loadPoints(records.value.map((r) => ({ x: r.f, y: r.XL })))
  emit('record', { rows: records.value, L: Lh, C: Cf })
}

const fGrid = Array.from({ length: 40 }, (_, i) => 50 + i * 25)
function chartOption() {
  return {
    animation: false, grid: { left: 48, right: 20, top: 28, bottom: 28 },
    legend: { textStyle: { color: '#8a8aa0', fontSize: 11 }, top: 2, data: ['X_L = 2πfL', 'X_C = 1/2πfC'] },
    xAxis: { type: 'value', name: 'f/Hz', min: 50, max: 1050, nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
    yAxis: { type: 'value', name: 'X (Ω)', max: 700, nameTextStyle: { color: '#6c6c85' }, axisLabel: { color: '#8a8aa0' }, splitLine: { lineStyle: { color: '#23233a' } } },
    series: [
      { name: 'X_L = 2πfL', type: 'line', showSymbol: false, lineStyle: { color: '#b06ce6', width: 2 },
        data: fGrid.map((x) => [x, +(2 * Math.PI * x * Lh).toFixed(1)]),
        markLine: { symbol: 'none', lineStyle: { color: '#F5C542', type: 'dashed' }, label: { color: '#F5C542', formatter: `f=${f.value}Hz` }, data: [{ xAxis: f.value }] } },
      { name: 'X_C = 1/2πfC', type: 'line', showSymbol: false, lineStyle: { color: '#6cd9e8', width: 2 },
        data: fGrid.map((x) => [x, +Math.min(700, 1 / (2 * Math.PI * x * Cf)).toFixed(1)]) },
    ],
  }
}

function draw() {
  const c = canvasRef.value
  if (!c) return
  const { ctx, w, h } = fitCanvas(c)
  ctx.clearRect(0, 0, w, h)
  const left = 50, right = w - 40, top = 34, bot = h - 30, midY = (top + bot) / 2
  const xL = left + (right - left) * 0.45, xC = left + (right - left) * 0.78
  wire(ctx, left, top, right, top); wire(ctx, left, bot, right, bot)
  wire(ctx, left, top, left, midY - 28); wire(ctx, left, midY + 28, left, bot)
  acSource(ctx, left, midY)
  label(ctx, `~ ${U} V  f = ${f.value} Hz`, left, bot + 18, '#b0b0cc', 11)
  // L 支路
  wire(ctx, xL, top, xL, midY - 62); lamp(ctx, xL, midY - 38, Math.min(1, (IL.value / (U / Rlamp)) ** 2))
  wire(ctx, xL, midY - 14, xL, midY - 4); inductor(ctx, xL, midY + 28, false, 'L=0.1H')
  wire(ctx, xL, midY + 66, xL, bot)
  label(ctx, `I_L = ${(IL.value * 1000).toFixed(0)} mA`, xL, top - 16, '#b06ce6', 11)
  // C 支路
  wire(ctx, xC, top, xC, midY - 62); lamp(ctx, xC, midY - 38, Math.min(1, (IC.value / (U / Rlamp)) ** 2))
  wire(ctx, xC, midY - 14, xC, midY + 2); capacitor(ctx, xC, midY + 22, false, 'C=10μF')
  wire(ctx, xC, midY + 40, xC, bot)
  label(ctx, `I_C = ${(IC.value * 1000).toFixed(0)} mA`, xC, top - 16, '#6cd9e8', 11)
  // 交流电流动画：方向随 sin 翻转
  const dir = Math.sin(acPhase) >= 0 ? 1 : -1
  const pathL: [number, number][] = dir > 0 ? [[left, top], [xL, top], [xL, bot], [left, bot]] : [[left, bot], [xL, bot], [xL, top], [left, top]]
  currentDots(ctx, pathL, phase, 0.6 + IL.value * 2, '#b06ce6')
  const pathC: [number, number][] = dir > 0 ? [[xL, top], [xC, top], [xC, bot], [xL, bot]] : [[xL, bot], [xC, bot], [xC, top], [xL, top]]
  currentDots(ctx, pathC, phase, 0.6 + IC.value * 2, '#6cd9e8')
  label(ctx, `X_L = ${XL.value.toFixed(0)} Ω　X_C = ${XC.value.toFixed(0)} Ω${sweeping.value ? '　（扫频中）' : ''}`, w / 2, h - 10, '#7fe3b3', 12)
}

let frame = 0
onMounted(() => {
  if (chartRef.value) {
    chart = echarts.init(chartRef.value)
    chart.setOption(chartOption())
  }
  loop = makeLoop((dt) => {
    if (sweeping.value) {
      f.value = Math.round(f.value + dt * 160)
      if (f.value >= 1000) { f.value = 1000; sweeping.value = false }
    }
    phase = (phase + dt * 0.5) % 1
    acPhase += dt * 4
    draw()
    if (++frame % 6 === 0) chart?.setOption({ series: [{ markLine: { data: [{ xAxis: f.value }], label: { formatter: `f=${f.value}Hz` } } }] })
  })
})
onUnmounted(() => { loop?.stop(); chart?.dispose() })
</script>

<template>
  <LabPanel ref="lab" title="探究电感器和电容器对交流电的影响"
    desc="两支路并联在交流电源上：升高频率，电感支路灯泡变暗（感抗增大），电容支路灯泡变亮（容抗减小）——电感“通低频阻高频”，电容“通高频阻低频”。"
    formula="X_L = 2πfL　X_C = 1/(2πfC)"
    :axes="{ x: 'f', y: 'X_L', xUnit: 'Hz', yUnit: 'Ω' }">
    <template #controls>
      <label>频率 f = {{ f }} Hz<input type="range" min="50" max="1000" step="10" v-model.number="f" :disabled="sweeping"></label>
      <button class="btn" @click="f = 50; sweeping = true" :disabled="sweeping">▶ 自动扫频 50→1000 Hz</button>
      <div class="readout">X_L = 2πfL = {{ XL.toFixed(1) }} Ω → I_L = {{ (IL * 1000).toFixed(0) }} mA
X_C = 1/2πfC = {{ XC.toFixed(1) }} Ω → I_C = {{ (IC * 1000).toFixed(0) }} mA</div>
      <button class="btn alt" @click="record">📏 记录 (f, X_L)（{{ records.length }}）</button>
      <p class="hint">X_L-f 为过原点直线（斜率 2πL）；X_C-f 为双曲线。两条曲线的交点频率即 LC 谐振频率。</p>
    </template>
    <div class="stage-col">
      <canvas ref="canvasRef" class="circuit"></canvas>
      <div ref="chartRef" class="scope"></div>
    </div>
  </LabPanel>
</template>

<style scoped>
.stage-col { display: flex; flex-direction: column; height: 100%; }
.circuit { height: 230px !important; flex: 0 0 230px; }
.scope { flex: 1; min-height: 180px; }
</style>
