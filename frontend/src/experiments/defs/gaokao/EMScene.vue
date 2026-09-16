<script setup lang="ts">
/**
 * 通用 3D 电磁场景运行器（B9）：three.js 底座 / 参数面板 / 播放·暂停·重置 / 记录 / 事件日志 / 时间轴 / AI 讲解器
 * 场景本体由 EMSceneDef 提供（init/step/sync/readout/solution）；面板结构与选择器（.exp/.panel/.run/.rec/.result）与教材 3D 实验一致
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import SolutionExplainer from '../apparatus/SolutionExplainer.vue'
import { makeTracker, setupThree } from '../../renderers/canvas3d/three-kit'
import { ProcessTimeline, substep } from '../../engine/multiProcess'
import type { EMSceneDef } from '../../engine/emScene'
import type { Params } from '../../engine/mechScene'

const props = defineProps<{ def: EMSceneDef<any> }>()
const emit = defineEmits<{ (e: 'record', data: unknown): void }>()
const containerRef = ref<HTMLDivElement | null>(null)

const p = reactive<Params>(Object.fromEntries(props.def.params.map((d) => [d.key, d.default])))
const tl = reactive(new ProcessTimeline()) as ProcessTimeline
const running = ref(false)
const finished = ref(false)
const t = ref(0)
let state: any = null
let three: ReturnType<typeof setupThree> | null = null
const { track, clearTracked } = makeTracker(() => three?.scene ?? null)
let animId = 0, last = 0

function init() {
  if (!three) return
  clearTracked(); t.value = 0; finished.value = false
  state = props.def.init({ ...p }, tl, { scene: three.scene, track })
  props.def.sync(state, p, 0)
}
function start() { if (!state || finished.value) init(); running.value = true }
function reset() { running.value = false; init() }
function snapshot() { return { scene: props.def.id, params: { ...p }, t: t.value, events: tl.events.map((e) => e.text), readout: props.def.readout({ ...p }, state) } }
function record() { emit('record', snapshot()) }
watch(p, () => { if (!running.value) init() })

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now
  if (running.value && state) {
    substep(dt * (props.def.timeScale ?? 1), props.def.h ?? 1 / 2000, (d) => {
      t.value += d
      const ok = props.def.step(state, p, d, t.value, tl)
      tl.advance(t.value)
      if (!ok) { running.value = false; finished.value = true; emit('record', { ...snapshot(), finishedAt: t.value }); return false }
    })
    props.def.sync(state, p, t.value)
  }
  three?.controls.update(); if (three) three.renderer.render(three.scene, three.camera)
  animId = requestAnimationFrame(loop)
}

onMounted(() => {
  if (!containerRef.value) return
  three = setupThree(containerRef.value, props.def.camera.pos, props.def.camera.target)
  init(); last = performance.now(); animId = requestAnimationFrame(loop)
})
onUnmounted(() => { cancelAnimationFrame(animId); clearTracked(); three?.dispose() })

// state 不是响应式对象：显式依赖 t，使只读区随仿真逐帧刷新
const readout = computed(() => { void t.value; void finished.value; return props.def.readout({ ...p }, state) })
const solution = computed(() => props.def.solution({ ...p }))
const fmtVal = (d: { step: number }, v: number) => (d.step >= 1 ? String(Math.round(v)) : v.toFixed(d.step < 0.1 ? 2 : 1))
const segWidth = (s: { t0: number; t1: number }) => `${Math.max(1, ((s.t1 - s.t0) / Math.max(1e-6, tl.duration)) * 100)}%`
</script>

<template>
  <div class="exp">
    <div class="panel">
      <h3>{{ def.title }}</h3>
      <p class="desc">{{ def.desc }}</p>
      <p class="formula">{{ def.formula }}</p>
      <template v-for="d in def.params" :key="d.key">
        <label v-if="d.options">{{ d.label }}
          <select v-model.number="p[d.key]" :disabled="running"><option v-for="o in d.options" :key="o.value" :value="o.value">{{ o.label }}</option></select></label>
        <label v-else>{{ d.label }} = {{ fmtVal(d, p[d.key]) }}{{ d.unit ? ' ' + d.unit : '' }}
          <input type="range" :min="d.min" :max="d.max" :step="d.step" v-model.number="p[d.key]" :disabled="running"></label>
      </template>
      <div class="result">{{ readout }}</div>
      <div class="controls">
        <button class="run" @click="running ? (running = false) : start()">{{ running ? '⏸ 暂停' : (finished ? '▶ 重新播放' : '▶ 播放实验') }}</button>
        <button class="ghost" @click="reset">⟲ 重置</button>
      </div>
      <button class="rec" @click="record">📏 记录当前数据</button>
      <div class="tlbar"><span v-for="(s, i) in tl.segments" :key="i" :style="{ width: segWidth(s), background: s.color }" :title="s.name"></span></div>
      <div class="tlcap">多过程时间轴 t={{ t.toFixed(2) }} s：{{ tl.segments.map((s) => s.name).join(' → ') }}</div>
      <div v-if="tl.events.length" class="result" style="color:#b0b0cc"><div v-for="(e, i) in tl.events" :key="i">• {{ e.text }}</div></div>
      <SolutionExplainer :template="solution" :title="def.title.split('（')[0]" />
      <p class="hint">🖱 左键旋转 · 滚轮缩放 · 右键平移</p>
    </div>
    <div ref="containerRef" class="canvas3d"></div>
  </div>
</template>

<style scoped>
.exp { display: grid; grid-template-columns: 340px 1fr; gap: 10px; min-height: 560px; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; overflow-y: auto; max-height: 82vh; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 8px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 6px; line-height: 1.5; }
.formula { font-size: 11px; color: #7fe3b3; margin-bottom: 10px; line-height: 1.5; font-family: Consolas, monospace; }
label { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 8px; }
label input, label select { width: 100%; }
label select { background: #14142a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 4px; margin-top: 2px; }
.controls { display: flex; gap: 8px; margin-top: 6px; }
.run { flex: 1; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9; border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; }
.ghost { background: transparent; color: #8a8aa0; border: 1px solid #2f2f4a; border-radius: 8px; padding: 9px 12px; cursor: pointer; }
.rec { width: 100%; margin-top: 8px; background: #1f3d2f; color: #7fe3b3; border: 1px solid #3ecf8e; border-radius: 8px; padding: 8px; font-size: 12px; cursor: pointer; }
.result { margin-top: 8px; background: #14142a; border-radius: 6px; padding: 9px 10px; font: 12px Consolas, monospace; color: #7fe3b3; line-height: 1.6; white-space: pre-line; }
.tlbar { display: flex; height: 10px; margin-top: 10px; background: #23233a; border-radius: 3px; overflow: hidden; }
.tlbar span { display: block; height: 100%; }
.tlcap { font-size: 11px; color: #8a8aa0; margin-top: 4px; line-height: 1.5; }
.hint { font-size: 11px; color: #565675; margin-top: 8px; }
.canvas3d { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; min-height: 560px; }
.canvas3d :deep(canvas) { display: block; width: 100% !important; height: 100% !important; touch-action: none; }
</style>
