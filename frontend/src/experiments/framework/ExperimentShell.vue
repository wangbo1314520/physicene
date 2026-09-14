<script setup lang="ts">
/**
 * 实验页骨架（B0）：标题栏 + 渲染区 + 步骤条 + 结论 + 自动保存/提交 + AI 侧栏占位。
 * 串起：StepEngine（状态机）× AutosaveManager（2s 防抖）× expApi（5 接口）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { findExperiment } from '../registry'
import type { ExperimentModule, RunMode } from '../core/types'
import { StepEngine } from '../runner/StepEngine'
import { AutosaveManager, expApi, type ExpSession } from '../data/api'
import SimRenderer2D5 from '../renderers/SimRenderer2D5.vue'
import type { Component } from 'vue'

const route = useRoute()
const expId = route.params.id as string
const mod: ExperimentModule | undefined = findExperiment(expId)

const session = ref<ExpSession | null>(null)
const engine = ref<StepEngine | null>(null)
const simRef = ref<InstanceType<typeof SimRenderer2D5> | null>(null)
const conclusion = ref('')
const saveHint = ref('')
const submitted = ref(false)
const submitInfo = ref<ExpSession | null>(null)
const conflict = ref('')
let autosave: AutosaveManager | null = null

const stepList = computed(() => engine.value?.steps ?? [])
const currentIdx = computed(() => engine.value?.export().current ?? 0)
const doneList = computed(() => engine.value?.export().completed ?? [])
const currentStep = computed(() => stepList.value[currentIdx.value] ?? null)
const allDone = computed(() => stepList.value.length > 0 && currentIdx.value >= stepList.value.length)
const mode = computed<RunMode>(() => engine.value?.mode ?? 'guided')

function setMode(m: RunMode) {
  engine.value?.setMode(m)
  scheduleSave()
}

function onSimEnded(summary: Record<string, unknown>) {
  engine.value?.emitEvent({ type: 'sim-ended', payload: summary })
}

function recordData() {
  const summary = simRef.value?.buildSummary()
  if (summary) {
    engine.value?.record(summary)
    engine.value?.emitEvent({ type: 'data-recorded', payload: summary })
    scheduleSave()
  }
}

function nextStep() {
  const ok = engine.value?.next()
  if (ok === false) {
    saveHint.value = '考试模式：检查点未通过，不能进入下一步'
  } else {
    saveHint.value = ''
  }
  scheduleSave()
}

function scheduleSave() {
  if (!autosave || !engine.value || !session.value) {
    return
  }
  autosave.patch({
    stepState: engine.value.export() as unknown as Record<string, unknown>,
    conclusion: conclusion.value,
  })
}

async function submitExperiment() {
  if (!session.value) {
    return
  }
  await autosave?.flush()
  submitInfo.value = await expApi.submit(session.value.id, conclusion.value)
  submitted.value = true
}

onMounted(async () => {
  if (!mod?.available) {
    return
  }
  session.value = await expApi.start(mod.id)
  engine.value = StepEngine.from(mod, session.value.stepState)
  conclusion.value = session.value.conclusion ?? ''
  if (session.value.status === 'submitted') {
    submitted.value = true
  }
  autosave = new AutosaveManager(
    session.value.id,
    (msg) => (conflict.value = msg),
    (s) => {
      saveHint.value = `已自动保存 ${new Date().toLocaleTimeString()}`
      session.value = s
    },
  )
})

onUnmounted(() => {
  void autosave?.flush()
})
</script>

<template>
  <main class="shell" v-if="mod?.available">
    <header class="head">
      <div>
        <h1>{{ mod.name }}</h1>
        <p class="meta">
          <span class="badge" :class="mod.dimension === '3D' ? 'b3' : mod.dimension === '2D' ? 'b2' : 'b25'">{{ mod.dimension }}</span>
          {{ mod.book }} · {{ mod.chapter }}
        </p>
      </div>
      <div class="modes">
        <button :class="{ active: mode === 'guided' }" @click="setMode('guided')">引导模式</button>
        <button :class="{ active: mode === 'free' }" @click="setMode('free')">自由模式</button>
        <button :class="{ active: mode === 'exam' }" @click="setMode('exam')">考试模式</button>
      </div>
    </header>

    <section class="body">
      <div class="main">
        <component v-if="mod.component" :is="mod.component" @ended="onSimEnded"
                   @record="(d: unknown) => { engine?.record(d); engine?.emitEvent({ type: 'data-recorded', payload: d }); scheduleSave(); }"
                   @advance="() => { if (engine?.next() === false) saveHint = '考试模式：检查点未通过'; scheduleSave(); }" />
        <SimRenderer2D5 v-else-if="mod.preset" ref="simRef" :preset="mod.preset" @ended="onSimEnded" />
        <p class="summary">🎯 {{ mod.summary }}</p>
      </div>

      <aside class="side">
        <div class="steps">
          <h3>实验步骤</h3>
          <ol>
            <li v-for="(s, i) in stepList" :key="s.id"
                :class="{ done: doneList.includes(s.id), current: i === currentIdx }">
              <span class="idx">{{ doneList.includes(s.id) ? '✓' : i + 1 }}</span>
              <div>
                <p class="t">{{ s.title }}</p>
                <p v-if="i === currentIdx && !allDone" class="hint">{{ s.hint }}</p>
              </div>
            </li>
          </ol>
          <div v-if="allDone && !submitted" class="all-done">✅ 全部步骤完成，请填写结论并提交</div>
        </div>

        <div v-if="!submitted" class="ops">
          <button v-if="!mod.component" class="ghost" :disabled="!currentStep" @click="recordData">📋 记录数据</button>
          <button class="primary" :disabled="!currentStep" @click="nextStep">下一步 →</button>
        </div>

        <div v-if="!submitted" class="concl">
          <h3>实验结论</h3>
          <textarea v-model="conclusion" rows="3" placeholder="用自己的话总结实验验证了什么规律…"
                    @input="scheduleSave"></textarea>
          <button class="submit" :disabled="!allDone || conclusion.trim().length < 5" @click="submitExperiment">
            提交实验
          </button>
          <p class="save-hint">{{ saveHint }}</p>
          <p v-if="conflict" class="conflict">⚠ {{ conflict }}</p>
        </div>

        <div v-else class="submitted">
          <h3>✅ 实验已提交</h3>
          <p>报告编号 #{{ submitInfo?.reportId ?? session?.id }}（Report 已挂接，AI 反馈将于批阅后生成）</p>
        </div>

        <div class="ai-placeholder">
          <h3>AI 助教</h3>
          <p>B7 接入：按步骤提示 · 纠错引导 · 不跳步不给答案</p>
        </div>
      </aside>
    </section>
  </main>

  <main v-else-if="mod" class="shell locked">
    <h1>🔒 {{ mod.name }}</h1>
    <p class="meta">{{ mod.book }} · {{ mod.chapter }} · 目标批次 {{ mod.batch }}</p>
    <p>{{ mod.summary }}</p>
    <p class="dim-note">该实验将随「{{ mod.batch }}」批次开放。</p>
    <router-link to="/exp">← 返回实验库</router-link>
  </main>
</template>

<style scoped>
.shell { max-width: 1400px; margin: 0 auto; padding: 14px 20px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
h1 { font-size: 19px; }
.meta { color: #8a8aa0; font-size: 12px; margin-top: 4px; }
.badge { padding: 1px 8px; border-radius: 4px; font-size: 11px; margin-right: 6px; }
.badge.b2 { background: #1d3a2b; color: #3ecf8e; }
.badge.b25 { background: #1d2b3a; color: #4a90d9; }
.badge.b3 { background: #33183a; color: #b06ce6; }
.modes button { background: #23233a; color: #8a8aa0; border: 1px solid #2f2f4a;
  border-radius: 6px; padding: 6px 12px; margin-left: 6px; font-size: 12px; cursor: pointer; }
.modes button.active { color: #e8e8f0; border-color: #4a90d9; background: #2b5c8f44; }
.body { display: grid; grid-template-columns: 1fr 320px; gap: 12px; align-items: start; }
.main { display: flex; flex-direction: column; gap: 8px; min-height: 480px; }
.summary { color: #8a8aa0; font-size: 13px; }
.side { display: flex; flex-direction: column; gap: 10px; }
.steps, .concl, .ai-placeholder { background: #1d1d33; border: 1px solid #2f2f4a;
  border-radius: 10px; padding: 12px; }
.steps h3, .concl h3, .ai-placeholder h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 8px; }
.steps ol { list-style: none; padding: 0; margin: 0; }
.steps li { display: flex; gap: 8px; padding: 6px 4px; border-radius: 6px; font-size: 13px; }
.steps li.current { background: #2b5c8f33; }
.steps li.done { opacity: 0.55; }
.idx { width: 20px; height: 20px; border-radius: 50%; background: #2f2f4a; color: #8a8aa0;
  display: flex; align-items: center; justify-content: center; font-size: 11px; flex-shrink: 0; }
.steps li.done .idx { background: #23402e; color: #3ecf8e; }
.t { color: #e8e8f0; }
.hint { color: #6c6c85; font-size: 11px; margin-top: 2px; }
.all-done { color: #3ecf8e; font-size: 12px; padding: 8px 0 2px; }
.ops { display: flex; gap: 8px; }
.ops button { flex: 1; border-radius: 8px; padding: 8px; font-size: 13px; cursor: pointer; border: 1px solid #2f2f4a; }
.ghost { background: #23233a; color: #e8e8f0; }
.primary { background: #2b5c8f; color: #fff; border-color: #4a90d9; }
.ops button:disabled { opacity: 0.4; cursor: not-allowed; }
.concl textarea { width: 100%; background: #23233a; border: 1px solid #2f2f4a; border-radius: 6px;
  color: #e8e8f0; padding: 8px; font-size: 13px; box-sizing: border-box; }
.submit { width: 100%; margin-top: 8px; background: #23402e; color: #7fe3b3;
  border: 1px solid #3ecf8e; border-radius: 8px; padding: 9px; font-size: 14px; cursor: pointer; }
.submit:disabled { opacity: 0.4; cursor: not-allowed; }
.save-hint { color: #565675; font-size: 11px; margin-top: 6px; }
.conflict { color: #e05555; font-size: 11px; }
.submitted h3 { color: #3ecf8e; }
.submitted p { color: #8a8aa0; font-size: 13px; }
.ai-placeholder { color: #565675; font-size: 11px; }
.locked { text-align: center; padding-top: 80px; color: #b0b0cc; }
.locked .dim-note { color: #6c6c85; margin: 16px 0; }
.locked a { color: #4a90d9; }
@media (max-width: 960px) { .body { grid-template-columns: 1fr; } }
</style>
