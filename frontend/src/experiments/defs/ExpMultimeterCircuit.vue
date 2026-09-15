<script setup lang="ts">
/**
 * 练习使用多用电表（自由接线）
 * 四个任务：①欧姆挡测未知电阻 ②电压挡测电池电压 ③电流挡测灯泡电流 ④欧姆挡判二极管极性
 * 画布里的多用电表按“红进黑出”真实极性求解；欧姆挡带电测量、未断开待测电阻都会被故障检测抓住。
 */
import { computed, ref, watch } from 'vue'
import CircuitLab from './apparatus/CircuitLab.vue'
import CircuitEditor from '../circuit/editor/CircuitEditor.vue'
import { createComponent, num, type Circuit, type CircuitTemplate, type Fault, type MeterReading } from '../circuit'

const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const ed = ref<InstanceType<typeof CircuitEditor> | null>(null)

interface Task { id: string; name: string; hint: string; mode: 'dcv' | 'dca' | 'ohm'; template: CircuitTemplate }
const TASKS: Task[] = [
  { id: 'ohm', name: '① 欧姆挡测未知电阻 Rx', mode: 'ohm',
    hint: '先把 Rx 与其他元件断开；选欧姆挡，倍率使指针落在中值附近（偏转 1/3~2/3）；红黑表笔接 Rx 两端读数×倍率',
    template: { name: '欧姆挡测电阻', roles: { M: 'multimeter', Rx: 'resistor' }, parallel: [['M', 'Rx']] } },
  { id: 'dcv', name: '② 直流电压挡测电池两端电压', mode: 'dcv',
    hint: '电池、小灯泡、开关串成回路并闭合；电压挡并联在电池两端，红表笔接电池正极，量程略大于电动势',
    template: { name: '电压挡测电压', roles: { src: 'battery', La: 'lamp', S: 'switch', M: 'multimeter' }, series: [['src', 'La', 'S']], parallel: [['M', 'src']], requireClosed: true } },
  { id: 'dca', name: '③ 直流电流挡测灯泡电流', mode: 'dca',
    hint: '电流挡串联进回路（红表笔接靠电池正极一侧），量程略大于预计电流（2.5V/0.3A 灯泡约 100 mA）',
    template: { name: '电流挡测电流', roles: { src: 'battery', La: 'lamp', S: 'switch', M: 'multimeter' }, series: [['src', 'La', 'S', 'M']], requireClosed: true } },
  { id: 'diode', name: '④ 欧姆挡判断二极管极性', mode: 'ohm',
    hint: '欧姆挡两表笔分别正接、反接二极管，各记一次：黑表笔接的是阳极时读数小（正向导通）',
    template: { name: '判二极管', roles: { M: 'multimeter', D: 'diode' }, parallel: [['M', 'D']] } },
]
const taskIdx = ref(0)
const task = computed(() => TASKS[taskIdx.value])

// 未知电阻：从标称集中随机，标签隐藏
const RX_POOL = [220, 470, 680, 1000, 2200, 4700]
const rxTrue = RX_POOL[Math.floor(Math.random() * RX_POOL.length)]
const initial: Circuit = { components: [createComponent('resistor', 420, 120, 'Rx', { R: rxTrue, hidden: true })], wires: [] }

const readings = ref<MeterReading[]>([])
const faults = ref<Fault[]>([])
function onSolved(p: { readings: MeterReading[]; faults: Fault[] }) { readings.value = p.readings; faults.value = p.faults }
const M = computed(() => readings.value.find((m) => m.kind === 'multimeter'))
const meter = computed(() => ed.value?.circuit.components.find((c) => c.kind === 'multimeter') ?? null)
const modeOk = computed(() => (meter.value?.props.mode ?? '') === task.value.mode)
const hasError = computed(() => faults.value.some((f) => f.severity === 'error'))

const log = ref<{ task: string; text: string; ok: boolean }[]>([])
const diodeReads: number[] = []
function fmtR(r: number) { return !Number.isFinite(r) ? '∞' : r >= 1000 ? `${(r / 1000).toFixed(2)} kΩ` : `${r.toFixed(0)} Ω` }
function record() {
  const m = M.value
  if (!m || !modeOk.value) return
  const t = task.value
  let text = '', ok = false
  if (t.id === 'ohm') {
    const err = Math.abs(m.value / rxTrue - 1) * 100
    const mid = m.deflection > 0.3 && m.deflection < 0.7
    ok = err < 5 && !hasError.value
    text = `读数 ${fmtR(m.value)}（真值 ${fmtR(rxTrue)}，误差 ${err.toFixed(1)}%）${mid ? '' : '；指针不在中值区，宜换倍率'}${hasError.value ? '；有故障（带电/未断开）' : ''}`
  } else if (t.id === 'dcv') {
    const b = ed.value?.circuit.components.find((c) => c.kind === 'battery')
    const trueU = ed.value?.solution()?.sources[b?.id ?? '']?.vTerm ?? 0
    ok = !hasError.value && Math.abs(m.value - trueU) < 0.05 && !m.reversed
    text = `电压挡读数 ${m.value.toFixed(2)} V（电池端电压 ${trueU.toFixed(2)} V）${m.reversed ? '；表笔接反' : ''}${m.overRange ? '；超量程' : ''}`
  } else if (t.id === 'dca') {
    const la = ed.value?.circuit.components.find((c) => c.kind === 'lamp')
    const trueI = Math.abs(ed.value?.solution()?.elements[la?.id ?? '']?.i ?? 0)
    ok = !hasError.value && Math.abs(Math.abs(m.value) - trueI) < 0.002 && !m.reversed
    text = `电流挡读数 ${(m.value * 1000).toFixed(1)} mA（灯泡电流 ${(trueI * 1000).toFixed(1)} mA）${m.reversed ? '；表笔接反' : ''}`
  } else {
    diodeReads.push(m.value)
    const fwd = diodeReads.filter((r) => r < 5000).length, rev = diodeReads.filter((r) => r > 1e5).length
    ok = fwd >= 1 && rev >= 1
    text = `本次 ${fmtR(m.value)}（${m.value < 5000 ? '正向：黑表笔接阳极' : '反向：红表笔接阳极'}）；已记 正向 ${fwd} 次、反向 ${rev} 次${ok ? ' → 极性判断完成' : ''}`
  }
  log.value.unshift({ task: t.name, text, ok })
  emit('record', { task: t.id, reading: m.value, mode: m.mode, ok, text })
}
watch(taskIdx, () => { diodeReads.length = 0 })
</script>

<template>
  <CircuitLab title="练习使用多用电表（自由接线）" :graph="false"
    desc="托盘里有多用电表（红+黑−表笔）、电池、小灯泡、开关、二极管；画布上已放一只标称值未知的电阻 Rx。按任务要求自己接线、选挡位与量程，读数后点“记录”。欧姆挡带电测量、把待测电阻留在电路里测，都会被判为错误操作。"
    formula="欧姆挡：R = 读数×倍率，指针在中值附近最准；电压挡并联，电流挡串联，红进黑出">
    <template #editor>
      <CircuitEditor ref="ed" :palette="['multimeter', 'battery', 'lamp', 'switch', 'diode', 'resistor']" :template="task.template" :initial="initial"
        :hint="task.hint" @solved="onSolved" />
    </template>
    <template #controls>
      <label>当前任务
        <select v-model.number="taskIdx"><option v-for="(t, i) in TASKS" :key="t.id" :value="i">{{ t.name }}</option></select></label>
      <div class="readout">{{ meter ? `挡位：${meter.props.mode === 'dcv' ? '直流电压' : meter.props.mode === 'dca' ? '直流电流' : '欧姆'} ${meter.props.rangeKey}` : '托盘中取出多用电表' }}
{{ M ? `读数：${M.mode === 'ohm' ? fmtR(M.value) : M.mode === 'dcv' ? M.value.toFixed(2) + ' V' : (M.value * 1000).toFixed(1) + ' mA'}　偏转 ${(M.deflection * 100).toFixed(0)}%` : '' }}
{{ meter && !modeOk ? `⚠ 本任务应使用${task.mode === 'ohm' ? '欧姆' : task.mode === 'dcv' ? '直流电压' : '直流电流'}挡（点画布上的表→参数面板改挡位）` : '' }}
{{ hasError ? '⛔ 存在错误操作，见编辑器故障提示' : '' }}</div>
      <button class="btn" :disabled="!M || !modeOk" @click="record">📏 记录读数</button>
      <div v-if="log.length" class="readout" style="color:#b0b0cc">
        <div v-for="(l, i) in log.slice(0, 6)" :key="i">{{ l.ok ? '✅' : '❌' }} {{ l.task }}：{{ l.text }}</div>
      </div>
      <p class="hint">用编辑器的「✅ 提交判分」检查接线拓扑（并联/串联/极性）；记录会同时核对读数与真值。</p>
    </template>
  </CircuitLab>
</template>
