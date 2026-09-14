<script setup lang="ts">
/**
 * B2 约束实验共享面板：弹簧/单摆/圆锥摆/牛顿管/气垫/功速/作用反作用
 * 通过 mode 切换，各自有独立的仪器面板 + 数据输出（坐标纸联动）。
 */
import { computed, ref } from 'vue'
import GraphPaper from '../framework/GraphPaper.vue'
import { springOscillation, pendulum, conicalPendulum, newtonTube, gasIsotherm, workVelocity, actionReaction } from '../renderers/sim25d/simulators'

const props = defineProps<{ mode: 'spring' | 'pendulum' | 'conical' | 'newtonTube' | 'gas' | 'workV' | 'actionR' }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const gp = ref<InstanceType<typeof GraphPaper> | null>(null)

// ── 弹簧振子 ──
const springM = ref(0.1), springK = ref(20), springA = ref(0.05)
const springData = ref<ReturnType<typeof springOscillation> | null>(null)
function runSpring() {
  springData.value = springOscillation(springM.value, springK.value, springA.value, 2)
  gp.value?.loadPoints(springData.value.points.filter((_, i) => i % 10 === 0).map((p) => ({ x: +p.t.toFixed(3), y: +p.x.toFixed(5) })))
}
const springPeriod = computed(() => springData.value ? springData.value.period : 0)
const springPeriodTheory = computed(() => 2 * Math.PI * Math.sqrt(springM.value / springK.value))

// ── 单摆 ──
const pendL = ref(1.0), pendTheta = ref(10)
const pendData = ref<ReturnType<typeof pendulum> | null>(null)
const pendStopwatch = ref(0)
let pendTimer = 0
function runPendulum() {
  pendData.value = pendulum(pendL.value, pendTheta.value, 10)
  gp.value?.loadPoints(pendData.value.points.filter((_, i) => i % 20 === 0).map((p) => ({ x: +p.t.toFixed(3), y: +((p.x / pendL.value) * 180 / Math.PI).toFixed(2) })))
  pendStopwatch.value = 0
  clearInterval(pendTimer)
  pendTimer = window.setInterval(() => { pendStopwatch.value += 0.01 }, 10)
}
const pendPeriodTheory = computed(() => 2 * Math.PI * Math.sqrt(pendL.value / 9.8))
function pendMeasure() {
  clearInterval(pendTimer)
  const measuredT = pendStopwatch.value
  const nOsc = Math.floor(measuredT / pendPeriodTheory.value)
  const gMeas = nOsc > 0 ? 4 * Math.PI ** 2 * pendL.value / (measuredT / nOsc) ** 2 : null
  emit('record', { L: pendL.value, totalTime: +measuredT.toFixed(2), oscillations: nOsc,
    gMeasured: gMeas ? +gMeas.toFixed(3) : null, gTrue: 9.8 })
}

// ── 圆锥摆 ──
const conL = ref(0.5), conTheta = ref(30)
const conData = ref<ReturnType<typeof conicalPendulum> | null>(null)
function runConical() {
  conData.value = conicalPendulum(conL.value, conTheta.value)
}
function recordConical() {
  if (!conData.value) return
  emit('record', { ...conData.value, L: conL.value, theta: conTheta.value,
    formula: 'F=mg·tanθ=m·ω²·L·sinθ' })
}

// ── 牛顿管 ──
const airFrac = ref(1.0)
const tubeData = ref<ReturnType<typeof newtonTube> | null>(null)
function runTube() {
  tubeData.value = newtonTube(airFrac.value, 1.0)
  const coin = tubeData.value.coin.filter((_, i) => i % 5 === 0)
  const feather = tubeData.value.feather.filter((_, i) => i % 5 === 0)
  gp.value?.loadPoints(coin.map((p) => ({ x: +p.t.toFixed(3), y: +p.y.toFixed(4) })))
}
const tubeResult = computed(() => {
  if (!tubeData.value) return null
  const c = tubeData.value.coin[tubeData.value.coin.length - 1]
  const f = tubeData.value.feather[tubeData.value.feather.length - 1]
  return { coinTime: c?.t ?? 0, featherTime: f?.t ?? 0,
           simultaneous: Math.abs((c?.t ?? 0) - (f?.t ?? 0)) < 0.05 }
})

// ── 气体等温 ──
const gasData = ref<ReturnType<typeof gasIsotherm> | null>(null)
function runGas() {
  gasData.value = gasIsotherm()
  gp.value?.loadPoints(gasData.value.data.map((d) => ({ x: +(d.V * 1000).toFixed(1), y: +d.p.toFixed(2) })))
}

// ── 功与速度 ──
const wvData = ref<ReturnType<typeof workVelocity> | null>(null)
function runWV() {
  wvData.value = workVelocity(0.1, 50, [0.02, 0.04, 0.06, 0.08, 0.10, 0.12])
  gp.value?.loadPoints(wvData.value.map((d) => ({ x: +d.work.toFixed(4), y: +d.vSquared.toFixed(4) })))
}
const wvSlope = computed(() => {
  if (!wvData.value) return null
  const pts = wvData.value.map((d) => ({ x: d.work, y: d.vSquared }))
  const n = pts.length, sx = pts.reduce((s, p) => s + p.x, 0), sy = pts.reduce((s, p) => s + p.y, 0)
  const sxx = pts.reduce((s, p) => s + p.x * p.x, 0), sxy = pts.reduce((s, p) => s + p.x * p.y, 0)
  return (n * sxy - sx * sy) / (n * sxx - sx * sx)
})

// ── 作用力反作用力 ──
const arM1 = ref(1), arM2 = ref(2), arImpulse = ref(6)
const arResult = computed(() => actionReaction(arM1.value, arM2.value, arImpulse.value))
function recordAR() {
  emit('record', { ...arResult.value, m1: arM1.value, m2: arM2.value,
    formula: 'F₁=-F₂ → m₁v₁+m₂v₂=0' })
}
</script>

<template>
  <div class="exp">
    <div class="panel">
      <!-- 弹簧 -->
      <template v-if="mode === 'spring'">
        <h3>弹簧振子：T = 2π√(m/k)</h3>
        <label>质量 m = {{ springM.toFixed(2) }} kg<input type="range" min="0.05" max="0.5" step="0.05" v-model.number="springM"></label>
        <label>劲度系数 k = {{ springK }} N/m<input type="range" min="5" max="100" step="5" v-model.number="springK"></label>
        <label>振幅 A = {{ springA.toFixed(2) }} m<input type="range" min="0.01" max="0.1" step="0.01" v-model.number="springA"></label>
        <button @click="runSpring">▶ 运行振动</button>
        <div v-if="springData" class="res">
          <p>T(测量) = <b>{{ springPeriod.toFixed(4) }} s</b></p>
          <p>T(理论) = {{ springPeriodTheory.toFixed(4) }} s</p>
          <p>k = 4π²m/T² = <b>{{ (4 * Math.PI ** 2 * springM / springPeriod ** 2).toFixed(2) }} N/m</b></p>
          <button class="rec" @click="emit('record', { m: springM, k: springK, T: springPeriod, kMeasured: 4 * Math.PI ** 2 * springM / springPeriod ** 2 })">📏 记录</button>
        </div>
      </template>

      <!-- 单摆 -->
      <template v-else-if="mode === 'pendulum'">
        <h3>单摆测 g：T = 2π√(L/g)</h3>
        <label>摆长 L = {{ pendL.toFixed(2) }} m<input type="range" min="0.3" max="2" step="0.1" v-model.number="pendL"></label>
        <label>摆角 θ₀ = {{ pendTheta }}°<input type="range" min="3" max="20" step="1" v-model.number="pendTheta"></label>
        <button @click="runPendulum">▶ 启动计时（10s）</button>
        <div class="stopwatch">{{ pendStopwatch.toFixed(2) }} s</div>
        <p class="formula">T(理论) = {{ pendPeriodTheory.toFixed(3) }} s</p>
        <button class="rec" @click="pendMeasure">⏹ 停止并测 g</button>
      </template>

      <!-- 圆锥摆 -->
      <template v-else-if="mode === 'conical'">
        <h3>圆锥摆验证 F = mω²r</h3>
        <label>摆长 L = {{ conL.toFixed(2) }} m<input type="range" min="0.3" max="1.5" step="0.05" v-model.number="conL"></label>
        <label>夹角 θ = {{ conTheta }}°<input type="range" min="10" max="60" step="5" v-model.number="conTheta"></label>
        <button @click="runConical">▶ 计算</button>
        <div v-if="conData" class="res">
          <p>周期 T = <b>{{ conData.period.toFixed(3) }} s</b></p>
          <p>ω = {{ conData.omega.toFixed(3) }} rad/s</p>
          <p>r = L·sinθ = {{ conData.radius.toFixed(4) }} m</p>
          <p>F向心 = <b>{{ conData.centripetal.toFixed(6) }} N</b></p>
          <p class="formula">验证：mg·tanθ = {{ (9.8e-3 * 9.8 * conData.tanθ).toFixed(6) }} N</p>
          <button class="rec" @click="recordConical">📏 记录</button>
        </div>
      </template>

      <!-- 牛顿管 -->
      <template v-else-if="mode === 'newtonTube'">
        <h3>牛顿管：真空中羽毛与硬币同时落地</h3>
        <label>管内气压：{{ airFrac === 0 ? '真空' : airFrac.toFixed(1) + ' atm' }}
          <input type="range" min="0" max="1" step="0.1" v-model.number="airFrac"></label>
        <button @click="runTube">▶ 释放</button>
        <div v-if="tubeResult" class="res">
          <p>硬币落地 t = <b>{{ tubeResult.coinTime.toFixed(3) }} s</b></p>
          <p>羽毛落地 t = <b>{{ tubeResult.featherTime.toFixed(3) }} s</b></p>
          <p>{{ tubeResult.simultaneous ? '✅ 同时落地（真空）' : '❌ 羽毛更慢（有空气阻力）' }}</p>
          <button class="rec" @click="emit('record', { airFraction: airFrac, coinTime: tubeResult.coinTime, featherTime: tubeResult.featherTime, simultaneous: tubeResult.simultaneous })">📏 记录</button>
        </div>
      </template>

      <!-- 气体等温 -->
      <template v-else-if="mode === 'gas'">
        <h3>气体等温变化：pV = C</h3>
        <p class="desc">注射器缓慢压缩（保持温度不变），记录 (V, p)</p>
        <button @click="runGas">▶ 采集 pV 数据</button>
        <div v-if="gasData" class="res">
          <p>常数 C = nRT = <b>{{ gasData.constant.toFixed(4) }} J</b></p>
          <p>T = {{ gasData.T }} K, n = {{ gasData.n }} mol</p>
          <button class="rec" @click="emit('record', { constant: gasData.constant, T: gasData.T, n: gasData.n })">📏 记录</button>
        </div>
      </template>

      <!-- 功与速度 -->
      <template v-else-if="mode === 'workV'">
        <h3>功与速度：W = ½mv²</h3>
        <p class="desc">弹簧压缩不同量释放，测量获得的速度</p>
        <button @click="runWV">▶ 采集 W-v² 数据</button>
        <div v-if="wvSlope" class="res">
          <p>v²-W 图线斜率 = <b>{{ wvSlope.toFixed(3) }}</b></p>
          <p>理论 2/m = {{ (2 / 0.1).toFixed(3) }}</p>
          <button class="rec" @click="emit('record', { slope: wvSlope, theoreticalSlope: 2 / 0.1, data: wvData })">📏 记录</button>
        </div>
      </template>

      <!-- 作用力反作用力 -->
      <template v-else>
        <h3>作用力与反作用力（牛顿第三定律）</h3>
        <label>m₁ = {{ arM1 }} kg<input type="range" min="0.5" max="3" step="0.5" v-model.number="arM1"></label>
        <label>m₂ = {{ arM2 }} kg<input type="range" min="0.5" max="3" step="0.5" v-model.number="arM2"></label>
        <label>冲量 J = {{ arImpulse }} N·s<input type="range" min="2" max="10" step="1" v-model.number="arImpulse"></label>
        <div class="res">
          <p>v₁ = {{ arResult.v1.toFixed(2) }} m/s（反向）</p>
          <p>v₂ = {{ arResult.v2.toFixed(2) }} m/s</p>
          <p>m₁v₁ + m₂v₂ = <b>{{ arResult.totalMomentum.toFixed(4) }}</b>（恒为零）</p>
          <button class="rec" @click="recordAR">📏 记录</button>
        </div>
      </template>
    </div>
    <GraphPaper v-if="mode !== 'actionR' && mode !== 'conical'" ref="gp"
      :series-name="mode === 'spring' ? 'x-t' : mode === 'pendulum' ? 'θ-t' : mode === 'gas' ? 'p-V' : mode === 'workV' ? 'v²-W' : 'y-t'"
      :series-color="mode === 'spring' ? '#4A90D9' : '#F5C542'"
      :initial-state="{ mode: 'auto', locked: false,
        axes: mode === 'gas' ? { xLabel: 'V', yLabel: 'p', xUnit: 'L', yUnit: 'kPa' }
             : mode === 'workV' ? { xLabel: 'W', yLabel: 'v²', xUnit: 'J', yUnit: 'm²/s²' }
             : mode === 'spring' ? { xLabel: 't', yLabel: 'x', xUnit: 's', yUnit: 'm' }
             : { xLabel: 't', yLabel: 'θ', xUnit: 's', yUnit: '°' },
        series: [{ id: 's1', name: '数据', color: '#4A90D9', points: [] }],
        fits: [], showFitLine: true, showResiduals: false, showErrorBars: false, showFormula: true }" />
    <div v-else class="placeholder">
      <p>本实验无坐标纸，直接从仪器面板记录数据。</p>
    </div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 320px 1fr; gap: 10px; min-height: 440px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 10px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 12px; line-height: 1.5; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 10px; }
label input { width: 100%; }
button { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; margin-top: 6px; }
button.rec { background: #23402e; color: #7fe3b3; border-color: #3ecf8e; }
.res { margin-top: 12px; font: 13px Consolas; color: #8a8aa0; border-top: 1px solid #2f2f4a; padding-top: 10px; }
.res b { color: #3ecf8e; font-size: 15px; }
.formula { font: 12px Consolas; color: #6c6c85; margin-top: 6px; }
.stopwatch { font: bold 32px Consolas; color: #3ecf8e; text-align: center;
  background: #14142a; border-radius: 8px; padding: 12px; margin: 10px 0; }
.placeholder { display: flex; align-items: center; justify-content: center;
  background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; color: #6c6c85; font-size: 13px; }
</style>
