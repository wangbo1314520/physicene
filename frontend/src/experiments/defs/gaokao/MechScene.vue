<script setup lang="ts">
/**
 * 通用 2.5D 力学场景运行器（B9）：参数面板 / 开始·暂停·重置 / 记录 / 事件日志 / 时间轴 / 能量条 / AI 讲解器
 * 场景本体由 MechSceneDef 提供（init/step/draw/energy/readout/solution）
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import LabPanel from '../apparatus/LabPanel.vue'
import SolutionExplainer from '../apparatus/SolutionExplainer.vue'
import { fitCanvas, makeLoop, label as labelFn } from '../apparatus/circuit'
import { ProcessTimeline, EnergyMomentumTracker, substep } from '../../engine/multiProcess'
import type { MechSceneDef, Params } from '../../engine/mechScene'

const props = defineProps<{ def: MechSceneDef<any> }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)

const p = reactive<Params>(Object.fromEntries(props.def.params.map((d) => [d.key, d.default])))
const tl = reactive(new ProcessTimeline()) as ProcessTimeline
const tracker = new EnergyMomentumTracker()
const running = ref(false)
const finished = ref(false)
const t = ref(0)
let state: any = null
let loop: { stop: () => void } | null = null

function init() { t.value = 0; finished.value = false; state = props.def.init({ ...p }, tl) }
function start() { if (!state || finished.value) init(); running.value = true }
function reset() { running.value = false; init(); draw() }
function record() { emit('record', { scene: props.def.id, params: { ...p }, t: t.value, events: tl.events.map((e) => e.text), readout: props.def.readout({ ...p }, state) }) }
watch(p, () => { if (!running.value) { init(); draw() } })

function step(dt: number) {
  substep(dt, props.def.h ?? 1 / 800, (d) => {
    t.value += d
    const ok = props.def.step(state, p, d, t.value, tl)
    tl.advance(t.value)
    if (!ok) { running.value = false; finished.value = true; emit('record', { scene: props.def.id, params: { ...p }, finishedAt: t.value, events: tl.events.map((e) => e.text) }); return false }
  })
}

function draw() {
  const cv = canvasRef.value; if (!cv || !state) return
  const { ctx, w, h } = fitCanvas(cv)
  ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#14142a'; ctx.fillRect(0, 0, w, h)
  const arrow = (x0: number, y0: number, dx: number, dy: number, color: string, text?: string) => {
    const L = Math.hypot(dx, dy); if (L < 1) return
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx, y0 + dy); ctx.stroke()
    const ux = dx / L, uy = dy / L
    ctx.beginPath(); ctx.moveTo(x0 + dx, y0 + dy); ctx.lineTo(x0 + dx - 8 * ux + 4 * uy, y0 + dy - 8 * uy - 4 * ux); ctx.lineTo(x0 + dx - 8 * ux - 4 * uy, y0 + dy - 8 * uy + 4 * ux); ctx.fill()
    if (text) labelFn(ctx, text, x0 + dx * 0.55 - 12 * uy, y0 + dy * 0.55 + 12 * ux - 10, color, 11)
  }
  props.def.draw({ ctx, w, h, label: (tx, x, y, c, s) => labelFn(ctx, tx, x, y, c ?? '#8a8aa0', s ?? 11), arrow }, state, p, t.value)
  // 时间轴
  tl.draw(ctx, 60, h - 30, w - 120, 10)
  labelFn(ctx, `多过程时间轴 t=${t.value.toFixed(2)} s：${tl.segments.map((s) => s.name).join(' → ')}`, w / 2, h - 40, '#8a8aa0', 11)
  // 能量条
  const en = props.def.energy(state, p)
  tracker.drawBars(ctx, 16, 16, en.items, en.E0)
  if (en.momentum) { ctx.fillStyle = '#8a8aa0'; ctx.font = '11px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(en.momentum, 16, 16 + en.items.length * 18 + 5) }
}

onMounted(() => { init(); loop = makeLoop((dt) => { if (running.value) step(dt); draw() }) })
onUnmounted(() => loop?.stop())
// state 不是响应式对象：显式依赖 t，使只读区随仿真逐帧刷新
const readout = computed(() => { void t.value; void finished.value; return props.def.readout({ ...p }, state) })
const solution = computed(() => props.def.solution({ ...p }))
const fmtVal = (d: { step: number }, v: number) => (d.step >= 1 ? String(Math.round(v)) : v.toFixed(d.step < 0.1 ? 2 : 1))
</script>

<template>
  <LabPanel :title="def.title" :desc="def.desc" :formula="def.formula" :graph="false">
    <template #controls>
      <template v-for="d in def.params" :key="d.key">
        <label v-if="d.options">{{ d.label }}
          <select v-model.number="p[d.key]" :disabled="running"><option v-for="o in d.options" :key="o.value" :value="o.value">{{ o.label }}</option></select></label>
        <label v-else>{{ d.label }} = {{ fmtVal(d, p[d.key]) }}{{ d.unit ? ' ' + d.unit : '' }}
          <input type="range" :min="d.min" :max="d.max" :step="d.step" v-model.number="p[d.key]" :disabled="running"></label>
      </template>
      <div class="readout">{{ readout }}</div>
      <div class="row">
        <button class="btn" @click="running ? (running = false) : start()">{{ running ? '⏸ 暂停' : (finished ? '▶ 重新开始' : '▶ 开始') }}</button>
        <button class="btn ghost" @click="reset">⟲ 重置</button>
      </div>
      <button class="btn alt" @click="record">📏 记录当前数据</button>
      <div v-if="tl.events.length" class="readout" style="color:#b0b0cc"><div v-for="(e, i) in tl.events" :key="i">• {{ e.text }}</div></div>
      <SolutionExplainer :template="solution" :title="def.title.split('（')[0]" />
    </template>
    <canvas ref="canvasRef" class="scene"></canvas>
  </LabPanel>
</template>

<style scoped>
.scene { display: block; width: 100%; height: 100%; }
</style>
