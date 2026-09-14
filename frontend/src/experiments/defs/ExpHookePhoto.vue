<script setup lang="ts">
/**
 * 代表实验②③：胡克定律（F-x）与光电效应（Uc-ν）
 * 共用"档位选择 → 读数记录 → 坐标纸拟合"骨架，参数由 props 注入。
 */
import { computed, ref } from 'vue'
import GraphPaper from '../framework/GraphPaper.vue'

const props = defineProps<{
  mode: 'hooke' | 'photo'
}>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()

// ── 胡克：砝码 m（50g 步进）→ F=mg → x 读数（k=25 N/m 真值 + 噪声）
// ── 光电：频率 ν 档（×10¹⁴Hz）→ 遏止电压 Uc = (h/e)ν − W/e（钨 W=4.54eV 近似，真值 h=6.626e-34）
const HOOKE_STEPS = [50, 100, 150, 200, 250, 300]        // g
const PHOTO_STEPS = [6.0, 7.0, 8.0, 9.0, 10.0, 11.0]     // ×10^14 Hz
const stepIdx = ref(0)
const gp = ref<InstanceType<typeof GraphPaper> | null>(null)
const records = ref<{ label: string; x: number; y: number }[]>([])

const isHooke = computed(() => props.mode === 'hooke')
const steps = computed(() => (isHooke.value ? HOOKE_STEPS : PHOTO_STEPS))
const current = computed(() => steps.value[stepIdx.value])

/** 当前档位的仪表读数（含噪声） */
function reading(): { label: string; x: number; y: number } {
  const noise = () => 1 + (Math.random() - 0.5) * 0.02
  if (isHooke.value) {
    const m = current.value / 1000
    const F = m * 9.8
    const k = 25 // N/m 真值
    const x = (F / k) * noise() * 100 // cm
    return { label: `${current.value}g`, x: +(x * 0.01).toFixed(4), y: +F.toFixed(2) } // x 米, F 牛
  }
  const nu = current.value
  const h = 6.626e-34, e = 1.602e-19, W = 4.0 // eV 简化功函数
  const uc = ((h * nu * 1e14) / e - W) * noise()
  return { label: `${nu.toFixed(1)}×10¹⁴Hz`, x: +nu.toFixed(2), y: +Math.max(0, uc).toFixed(3) }
}
const preview = computed(() => reading())
function record() {
  const r = reading()
  records.value.push(r)
  gp.value?.loadPoints(records.value.map((p) => ({ x: p.x, y: p.y })))
  emit('record', { rows: records.value, fit: gp.value?.state.fits[0] })
  if (stepIdx.value < steps.value.length - 1) stepIdx.value++
}
const fit = computed(() => gp.value?.state.fits[0])
</script>

<template>
  <div class="exp">
    <div class="panel">
      <template v-if="isHooke">
        <h3>弹簧悬挂法：逐个加砝码，读伸长量</h3>
        <p class="big">当前砝码：<b>{{ current }} g</b>（F = {{ (current / 1000 * 9.8).toFixed(2) }} N）</p>
        <p class="read">伸长量 x ≈ <b>{{ (preview.x * 100).toFixed(2) }} cm</b>（刻度尺读数）</p>
      </template>
      <template v-else>
        <h3>光电效应：调频率，测遏止电压</h3>
        <p class="big">入射频率 ν：<b>{{ current.toFixed(1) }}×10¹⁴ Hz</b></p>
        <p class="read">遏止电压 Uc ≈ <b>{{ preview.y.toFixed(3) }} V</b></p>
      </template>
      <label class="slider">{{ isHooke ? '砝码' : '频率' }}档位
        <input type="range" min="0" :max="steps.length - 1" step="1" v-model.number="stepIdx">
      </label>
      <button class="rec" @click="record">📏 记录读数</button>
      <p class="count">已记录 {{ records.length }} 组</p>
      <div v-if="fit && Number.isFinite(fit.k) && records.length >= 4" class="result">
        <template v-if="isHooke">
          <p>F-x 拟合：斜率 k = <b>{{ fit.k.toFixed(2) }} N/m</b>（真值 25.0）</p>
        </template>
        <template v-else>
          <p>Uc-ν 拟合：斜率 = <b>{{ (fit.k * 1.602e-19 * 1e-14).toExponential(3) }} J·s</b></p>
          <p>（普朗克常量 h 真值 6.626×10⁻³⁴）</p>
          <p>截距 −W/e = {{ fit.b.toFixed(3) }} V</p>
        </template>
        <p>R² = {{ fit.r2.toFixed(5) }}</p>
      </div>
    </div>
    <GraphPaper ref="gp" :series-name="isHooke ? 'F-x' : 'Uc-ν'" :series-color="isHooke ? '#F5C542' : '#E05555'"
      :initial-state="{ mode: 'auto', locked: false,
        axes: isHooke ? { xLabel: 'x', yLabel: 'F', xUnit: 'm', yUnit: 'N' }
                      : { xLabel: 'ν', yLabel: 'Uc', xUnit: '×10¹⁴Hz', yUnit: 'V' },
        series: [{ id: 's1', name: isHooke ? 'F-x' : 'Uc-ν', color: isHooke ? '#F5C542' : '#E05555', points: [] }],
        fits: [], showFitLine: true, showResiduals: true, showErrorBars: false, showFormula: true }" />
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 300px 1fr; gap: 10px; min-height: 420px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 12px; }
.big { font-size: 14px; color: #e8e8f0; margin-bottom: 8px; }
.big b { color: #4a90d9; }
.read { font: 16px Consolas; color: #3ecf8e; margin-bottom: 12px; }
.slider { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 12px; }
.slider input { width: 100%; }
.rec { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; }
.count { font-size: 11px; color: #6c6c85; margin-top: 8px; text-align: center; }
.result { margin-top: 12px; border-top: 1px solid #2f2f4a; padding-top: 10px;
  font: 12px Consolas; color: #8a8aa0; }
.result b { color: #3ecf8e; font-size: 14px; }
</style>
