<script setup lang="ts">
/**
 * 代表实验①：测电源电动势和内阻（必修三）
 * 仪器面板：电源(E=3.0V, r 内阻待测) + 滑动变阻器 R + 电压/电流表读数
 * 记录多组 (I, U) → 坐标纸 U-I 拟合 → 截距=E，斜率=-r
 */
import { computed, ref } from 'vue'
import GraphPaper from '../framework/GraphPaper.vue'

const emit = defineEmits<{
  (e: 'record', data: unknown): void
  (e: 'advance'): void
}>()

// 仪器参数（真值含小噪声模拟读数误差）
const E = 3.0      // 电动势真值 V
const rTrue = 0.8  // 内阻真值 Ω
const R = ref(4)   // 滑动变阻器
const records = ref<{ I: number; U: number }[]>([])
const gp = ref<InstanceType<typeof GraphPaper> | null>(null)

const I = computed(() => E / (rTrue + R.value))
const U = computed(() => E - I.value * rTrue)
/** 读数含 ±0.5% 随机误差（教学：误差分析） */
function read(): { I: number; U: number } {
  const noise = () => 1 + (Math.random() - 0.5) * 0.01
  return { I: +(I.value * noise()).toFixed(3), U: +(U.value * noise()).toFixed(3) }
}
function record() {
  const row = read()
  records.value.push(row)
  gp.value?.loadPoints(records.value.map((r) => ({ x: r.I, y: r.U })))
  emit('record', { rows: records.value, fit: gp.value?.state.fits[0] })
}
const fit = computed(() => gp.value?.state.fits[0])
</script>

<template>
  <div class="exp">
    <div class="panel">
      <h3>电路：E — (V) — r，R 滑动变阻器</h3>
      <div class="circuit">
        <div class="meters">
          <div class="meter v">
            <span class="label">电压表</span>
            <span class="val">{{ U.toFixed(2) }} V</span>
          </div>
          <div class="meter a">
            <span class="label">电流表</span>
            <span class="val">{{ I.toFixed(3) }} A</span>
          </div>
        </div>
        <label class="slider">滑动变阻器 R = {{ R.toFixed(1) }} Ω
          <input type="range" min="1" max="10" step="0.5" v-model.number="R">
        </label>
        <button class="rec" @click="record">📏 记录此组 (I, U)</button>
        <p class="count">已记录 {{ records.length }} 组（至少 6 组后拟合）</p>
      </div>
      <div v-if="fit && Number.isFinite(fit.k) && records.length >= 4" class="result">
        <p>U-I 拟合：U = {{ fit.k.toFixed(3) }}·I + {{ fit.b.toFixed(3) }}</p>
        <p>电动势 E = 截距 = <b>{{ fit.b.toFixed(3) }} V</b>（真值 3.0）</p>
        <p>内阻 r = −斜率 = <b>{{ (-fit.k).toFixed(3) }} Ω</b>（真值 0.8）</p>
      </div>
    </div>
    <GraphPaper ref="gp" series-name="U-I 数据" series-color="#4A90D9"
      :initial-state="{ mode: 'auto', locked: false,
        axes: { xLabel: 'I', yLabel: 'U', xUnit: 'A', yUnit: 'V' },
        series: [{ id: 's1', name: 'U-I 数据', color: '#4A90D9', points: [] }],
        fits: [], showFitLine: true, showResiduals: true, showErrorBars: false, showFormula: true }" />
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 300px 1fr; gap: 10px; min-height: 420px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 12px; }
.meters { display: flex; gap: 10px; margin-bottom: 12px; }
.meter { flex: 1; background: #14142a; border: 1px solid #3d3d5e; border-radius: 8px;
  padding: 10px; text-align: center; }
.meter .label { display: block; font-size: 11px; color: #6c6c85; margin-bottom: 4px; }
.meter .val { font: bold 20px Consolas; color: #3ecf8e; }
.slider { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 12px; }
.slider input { width: 100%; }
.rec { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; }
.count { font-size: 11px; color: #6c6c85; margin-top: 8px; text-align: center; }
.result { margin-top: 12px; border-top: 1px solid #2f2f4a; padding-top: 10px;
  font: 12px Consolas; color: #8a8aa0; }
.result b { color: #3ecf8e; font-size: 14px; }
</style>
