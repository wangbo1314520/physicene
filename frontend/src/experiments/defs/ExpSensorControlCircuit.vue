<script setup lang="ts">
/**
 * 利用传感器制作简单的自动控制装置——光控路灯（自由搭建）
 * 光敏电阻与定值电阻分压 → 继电器线圈（并在光敏电阻两端）→ 天暗时线圈电压升高吸合 → 触点接通路灯。
 * 拖光照滑杆实测：亮→灯灭，暗→灯亮；“验证光控”自动做两次求解判定。
 */
import { computed, ref } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import { num, type CircuitTemplate, type Fault, type MeterReading } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const TEMPLATE: CircuitTemplate = {
  name: '光控路灯',
  roles: { src: 'dc_source', LDR: 'photoresistor', Rd: 'resistor', K: 'relay', La: 'lamp' },
  parallel: [['K', 'LDR']],   // 线圈并在光敏电阻两端（分压串联关系由“验证光控”用两种光照实测判定）
}
const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { faults.value = p.faults; refresh() }
const hasError = computed(() => faults.value.some((f) => f.severity === 'error' && f.code !== 'open'))
const parts = computed(() => {
  const cs = ed.value?.circuit.components ?? []
  return { LDR: cs.find((c) => c.kind === 'photoresistor'), K: cs.find((c) => c.kind === 'relay'), La: cs.find((c) => c.kind === 'lamp') }
})
const light = ref(1)
function setLight(v: number) {
  light.value = v
  if (parts.value.LDR && ed.value) ed.value.setProps(parts.value.LDR.id, { light: v })
}
const coilV = ref(0); const lampOn = ref(false)
function refresh() {
  const sol = ed.value?.solution()
  const p = parts.value
  coilV.value = p.K && sol ? Math.abs(sol.elements[p.K.id]?.v ?? 0) : 0
  lampOn.value = p.La && sol ? Math.abs(sol.elements[p.La.id]?.i ?? 0) > 0.01 : false
}
const verdict = ref<string | null>(null)
function verify() {
  const p = parts.value
  if (!p.LDR || !p.La || !ed.value) return
  const probe = (l: number) => { ed.value!.setProps(p.LDR!.id, { light: l }); ed.value!.solve(); return Math.abs(ed.value!.solution()?.elements[p.La!.id]?.i ?? 0) > 0.01 }
  const onDark = probe(0), onLight = probe(1)
  setLight(light.value)
  const ok = onDark && !onLight
  verdict.value = ok ? '✅ 光控成功：天暗灯亮、天亮灯灭' : onDark && onLight ? '❌ 灯一直亮：继电器一直吸合（分压偏高/阈值偏低，或触点接法错）'
    : !onDark && !onLight ? '❌ 灯一直不亮：继电器不吸合（线圈分压不足）或路灯回路未接' : '❌ 逻辑反了：天亮灯亮、天暗灯灭——线圈应并在光敏电阻两端'
  emit('record', { onDark, onLight, ok, vOn: p.K ? num(p.K, 'vOn', 2.5) : null })
}
</script>

<template>
  <CircuitLab title="利用传感器制作简单的自动控制装置（光控路灯，自由搭建）" :graph="false"
    desc="自己接：电源 → 定值电阻 → 光敏电阻 → 电源负极组成分压器；继电器线圈并联在光敏电阻两端（天暗时光敏电阻阻值大、分到电压高、继电器吸合）；继电器触点串在路灯回路里。拖动光照滑杆模拟白天/夜晚，观察路灯自动开关。"
    formula="U_LDR = E·R_LDR/(R_d + R_LDR)　R_LDR(暗) ≫ R_LDR(亮)　U_LDR ≥ U_吸合 → 触点闭合 → 灯亮">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['dc_source', 'photoresistor', 'resistor', 'relay', 'lamp', 'switch']" :template="TEMPLATE"
        hint="分压：电源+ → 定值电阻(1 kΩ) → 光敏电阻 → 电源−；继电器“线圈+/−”并在光敏电阻两端；路灯：电源+ → 触点1 → 触点2 → 灯 → 电源−" @solved="onSolved" />
    </template>
    <template #controls>
      <label>环境光照 {{ (light * 100).toFixed(0) }}%（{{ light < 0.3 ? '🌙 夜晚' : light < 0.7 ? '🌆 傍晚' : '☀️ 白天' }}）
        <input type="range" min="0" max="1" step="0.01" :value="light" @input="setLight(Number(($event.target as HTMLInputElement).value))"></label>
      <div class="readout">继电器线圈电压 {{ coilV.toFixed(2) }} V{{ parts.K ? `（吸合阈值 ${num(parts.K, 'vOn', 2.5).toFixed(1)} V）` : '' }}
路灯：{{ lampOn ? '💡 亮' : '○ 灭' }}
{{ hasError ? '⛔ 电路有故障，先排除' : '' }}</div>
      <button class="btn" :disabled="!parts.LDR || !parts.La || hasError" @click="verify">✅ 验证光控（自动测白天/夜晚两种状态）</button>
      <div v-if="verdict" class="readout" style="color:#b0b0cc">{{ verdict }}</div>
      <p class="hint">调阈值：点继电器→参数面板改吸合电压；调灵敏度：改定值电阻。思考：把线圈并在定值电阻两端会怎样？</p>
    </template>
  </CircuitLab>
</template>
