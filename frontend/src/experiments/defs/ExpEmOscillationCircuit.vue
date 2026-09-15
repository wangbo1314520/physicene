<script setup lang="ts">
/**
 * 观察电磁振荡（自由搭建 LC 回路）
 * K 拨 1：电源给电容充电；K 拨 2：电容接到电感 → LC 振荡（线圈电阻使其阻尼衰减）。
 * 暂态求解 + 慢速回放看电流表来回摆动，示波器显示 u_C(t)、i(t)，测周期对照 T=2π√(LC)。
 */
import { computed, ref } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import TransientScope from './apparatus/TransientScope.vue'
import { num, type CircuitTemplate, type Fault, type MeterReading, type EngineState, type TransientResult } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

const TEMPLATE: CircuitTemplate = {
  name: 'LC 振荡回路',
  roles: { src: 'dc_source', K: 'spdt_switch', C: 'capacitor', L: 'inductor', A: ['ammeter', 'galvanometer'] },
}
const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { faults.value = p.faults }
const hasError = computed(() => faults.value.some((f) => f.severity === 'error' && f.code !== 'switch_open' && f.code !== 'open'))
const parts = computed(() => {
  const cs = ed.value?.circuit.components ?? []
  return { K: cs.find((c) => c.kind === 'spdt_switch'), C: cs.find((c) => c.kind === 'capacitor'), L: cs.find((c) => c.kind === 'inductor'),
    A: cs.find((c) => c.kind === 'ammeter' || c.kind === 'galvanometer'), src: cs.find((c) => c.kind === 'dc_source') }
})
const ready = computed(() => !!parts.value.K && !!parts.value.C && !!parts.value.L && !!parts.value.src)
const T = computed(() => (parts.value.C && parts.value.L ? 2 * Math.PI * Math.sqrt(num(parts.value.L, 'L', 1) * num(parts.value.C, 'C', 1e-3)) : 0))

const t = ref<number[]>([]); const uC = ref<number[]>([]); const iL = ref<number[]>([])
let state: EngineState | undefined
const phase = ref<'idle' | 'charged' | 'oscillating'>('idle')
const Tmeas = ref<number | null>(null)

function charge() {
  const p = parts.value
  if (!ready.value || !ed.value) return
  ed.value.setProps(p.K!.id, { pos: 1 })
  const res = ed.value.runTransient({ dt: 0.002, tEnd: 0.3, state })
  if (!res.ok) return
  state = res.state; phase.value = 'charged'
  t.value = []; uC.value = []; iL.value = []; Tmeas.value = null
  ed.value.play(res, 0.3)
}
function oscillate() {
  const p = parts.value
  if (!ready.value || !ed.value || !state) return
  ed.value.setProps(p.K!.id, { pos: 2 })
  const tEnd = 4 * T.value, dt = T.value / 200
  const res: TransientResult = ed.value.runTransient({ dt, tEnd, state })
  if (!res.ok) return
  state = res.state; phase.value = 'oscillating'
  const cV = res.elements[p.C!.id].v, li = res.elements[p.L!.id].i
  t.value = [...res.t]; uC.value = [...cV]; iL.value = [...li]
  const zeros: number[] = []
  for (let k = 1; k < cV.length; k++) if ((cV[k - 1] > 0 && cV[k] <= 0) || (cV[k - 1] < 0 && cV[k] >= 0)) zeros.push(res.t[k])
  Tmeas.value = zeros.length >= 3 ? zeros[2] - zeros[0] : null
  ed.value.play(res, Math.max(0.05, tEnd / 10))   // 放慢到约 10 秒看完 4 个周期
  emit('record', { T_theory: T.value, T_measured: Tmeas.value, L: num(p.L!, 'L', 1), C: num(p.C!, 'C', 1e-3), i_peak: Math.max(...li.map(Math.abs)) })
}
const series = computed(() => [
  { name: '电容电压 u_C', color: '#4A90D9', values: uC.value, unit: 'V' },
  { name: '回路电流 i', color: '#F5C542', values: iL.value, unit: 'A' },
])
</script>

<template>
  <CircuitLab title="观察电磁振荡（自由搭建 LC 回路）" :graph="false"
    desc="自己接：单刀双掷开关 K 的公共端接电容 C 一端；触点 1 接电源正极（充电），触点 2 接电感 L；L 另一端经电流表回到 C 另一端，电源负极也接 C 该端。先 K→1 充电，再 K→2 接入电感，看电流表来回摆动、电容电压正负交替。"
    formula="T = 2π√(LC)　能量在电场能 ½CU² 与磁场能 ½LI² 间往复转化；线圈电阻使振幅衰减（阻尼振荡）">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['dc_source', 'spdt_switch', 'capacitor', 'inductor', 'ammeter', 'galvanometer']" :template="TEMPLATE"
        hint="K 公共端→C 上端；K 触点1→电源+；K 触点2→L→电流表→C 下端；电源−→C 下端。电容用非电解（4700 μF）、电感 1 H 左右，T≈0.4 s 看得清" @solved="onSolved" />
    </template>
    <template #controls>
      <div class="readout">{{ ready ? `理论周期 T = 2π√(LC) = ${T.toFixed(3)} s` : '需要：电源、单刀双掷开关、电容、电感' }}
{{ Tmeas !== null ? `实测周期（u_C 过零间隔）= ${Tmeas.toFixed(3)} s` : '' }}
{{ hasError ? '⛔ 电路有故障，先排除' : '' }}</div>
      <button class="btn" :disabled="!ready || hasError" @click="charge">① K 拨 1：给电容充电</button>
      <button class="btn alt" :disabled="phase === 'idle'" @click="oscillate">② K 拨 2：接入电感，观察振荡</button>
      <p class="hint">回放中电流表指针左右摆动、幅度逐渐减小；u_C 与 i 相差 1/4 周期。把 L 或 C 调大，周期变长。</p>
    </template>
    <template #graph>
      <TransientScope :t="t" :series="series" title="示波器：u_C(t) 与 i(t)（阻尼振荡）" :height="300" />
    </template>
  </CircuitLab>
</template>
