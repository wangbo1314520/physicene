<script setup lang="ts">
/**
 * B2 打点计时器族共享面板：生成纸带 → 展示计数点 → 分析（逐差法/瞬时速度）
 * props.exp 控制实验变体：timer-practice / trolley-vt / freefall-timer
 */
import { computed, ref } from 'vue'
import { TapeSampler, type TapeAnalysis } from '../renderers/sim25d/TapeSampler'
import GraphPaper from '../framework/GraphPaper.vue'

const props = defineProps<{ exp: 'timer-practice' | 'trolley-vt' | 'freefall-timer' }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

const CONFIG = {
  'timer-practice': { a: 1.5, v0: 0, dur: 1.0, name: '练习使用打点计时器（匀加速 a=1.5）' },
  'trolley-vt': { a: 2.0, v0: 0.5, dur: 1.5, name: '小车速度随时间变化（v₀=0.5, a=2.0）' },
  'freefall-timer': { a: 9.8, v0: 0, dur: 1.5, name: '自由落体测 g（a=9.8）' },
}
const cfg = CONFIG[props.exp]
const analysis = ref<TapeAnalysis | null>(null)
const showTape = ref(false)
const gp = ref<InstanceType<typeof GraphPaper> | null>(null)

function run() {
  const ts = TapeSampler.generate(0, cfg.v0, cfg.a, cfg.dur)
  analysis.value = ts.analyze()
  showTape.value = true
  // 坐标纸：v-t 数据（瞬时速度）
  if (analysis.value && gp.value) {
    const vPts = analysis.value.instantaneousVelocities.map((v, i) => ({
      x: +((i + 1) * 0.1).toFixed(2), y: +v.toFixed(4),
    }))
    gp.value.loadPoints(vPts)
  }
}
function record() {
  if (!analysis.value) return
  emit('record', {
    tape: {
      period: 0.02, nInterval: 5,
      countingX: analysis.value.counting.map((c) => +c.x.toFixed(5)),
      intervals: analysis.value.intervals.map((i) => +i.toFixed(5)),
      acceleration: analysis.value.acceleration,
      instantaneousVelocities: analysis.value.instantaneousVelocities.map((v) => +v.toFixed(4)),
      averageVelocity: +analysis.value.averageVelocity.toFixed(4),
    },
    trueA: cfg.a,
  })
}
const aErr = computed(() => {
  if (!analysis.value?.acceleration) return null
  return (100 * Math.abs(analysis.value.acceleration - cfg.a) / cfg.a).toFixed(2)
})
</script>

<template>
  <div class="exp">
    <div class="panel">
      <h3>{{ cfg.name }}</h3>
      <p class="desc">打点计时器 50Hz（T=0.02s），每 5 个间隔取计数点（Δt=0.1s），用逐差法求加速度。</p>
      <button class="run" @click="run">🧪 打出纸带</button>
      <div v-if="analysis" class="results">
        <p>计数点：{{ analysis.counting.length }} 个</p>
        <p v-if="analysis.acceleration != null">
          逐差法 a = <b>{{ analysis.acceleration.toFixed(4) }} m/s²</b>
          <span class="err">（真值 {{ cfg.a }}，误差 {{ aErr }}%）</span>
        </p>
        <p>平均速度 = {{ analysis.averageVelocity.toFixed(4) }} m/s</p>
        <p>v(0.5s) ≈ {{ analysis.instantaneousVelocities[4]?.toFixed(4) ?? '—' }} m/s</p>
        <button class="rec" @click="record">📏 记录纸带分析</button>
      </div>
    </div>
    <div class="right">
      <div v-if="showTape && analysis" class="tape">
        <h4>纸带（0=计数点，间距=段位移）</h4>
        <div class="tape-strip">
          <div v-for="(cp, i) in analysis.counting" :key="i" class="tape-point" :style="{ left: `${Math.max(0, Math.min(96, (cp.x / (analysis.counting[analysis.counting.length-1]?.x || 1)) * 96))}%` }">
            <span class="dot"></span>
            <span class="label">{{ i }}</span>
          </div>
        </div>
        <div class="tape-table">
          <table>
            <tr><th>计数点</th><th>位置(m)</th><th>段位移(m)</th></tr>
            <tr v-for="(cp, i) in analysis.counting.slice(0, 8)" :key="i">
              <td>{{ i }}</td>
              <td>{{ cp.x.toFixed(4) }}</td>
              <td>{{ i > 0 ? (cp.x - analysis.counting[i-1].x).toFixed(4) : '—' }}</td>
            </tr>
          </table>
        </div>
      </div>
      <GraphPaper ref="gp" series-name="v-t" series-color="#F5C542"
        :initial-state="{ mode: 'auto', locked: false,
          axes: { xLabel: 't', yLabel: 'v', xUnit: 's', yUnit: 'm/s' },
          series: [{ id: 's1', name: 'v-t', color: '#F5C542', points: [] }],
          fits: [], showFitLine: true, showResiduals: false, showErrorBars: false, showFormula: true }" />
    </div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 320px 1fr; gap: 10px; min-height: 440px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 10px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 12px; line-height: 1.6; }
.run { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 10px; font-size: 14px; cursor: pointer; margin-bottom: 12px; }
.results { font: 13px Consolas; color: #8a8aa0; }
.results b { color: #3ecf8e; font-size: 16px; }
.err { font-size: 11px; color: #6c6c85; }
.rec { width: 100%; margin-top: 10px; background: #23402e; color: #7fe3b3;
  border: 1px solid #3ecf8e; border-radius: 8px; padding: 8px; font-size: 13px; cursor: pointer; }
.right { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.tape { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 12px; }
.tape h4 { font-size: 12px; color: #b0b0cc; margin-bottom: 8px; }
.tape-strip { position: relative; height: 36px; background: #f5e6c8; border-radius: 3px;
  margin-bottom: 10px; border: 1px solid #d4c4a0; }
.tape-point { position: absolute; top: 50%; transform: translate(-50%, -50%); text-align: center; }
.tape-point .dot { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: #333; }
.tape-point .label { display: block; font-size: 9px; color: #666; margin-top: 1px; }
.tape-table table { width: 100%; font: 11px Consolas; color: #8a8aa0; border-collapse: collapse; }
.tape-table th { color: #6c6c85; text-align: left; padding: 3px 6px; border-bottom: 1px solid #2f2f4a; }
.tape-table td { padding: 3px 6px; border-bottom: 1px solid #23233a; }
</style>
