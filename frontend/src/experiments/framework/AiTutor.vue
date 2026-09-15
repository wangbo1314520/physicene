<script setup lang="ts">
/**
 * B7 AI 助教侧栏：按步骤状态提供阶梯提示（方法→公式→数值方向），不跳步、不直接给答案。
 * 读取 experiment_session 的步骤状态+原始数据，生成上下文感知的引导。
 */
import { computed, ref, watch } from 'vue'
import type { ExperimentStep, StepSnapshot } from '../core/types'

const props = defineProps<{
  step: ExperimentStep | null
  snapshot: StepSnapshot
  experimentName: string
  rawData?: Record<string, unknown> | null
}>()

const emit = defineEmits<{ (e: 'aiFeedback', feedback: string): void }>()

const messages = ref<{ role: 'ai' | 'user'; text: string }[]>([])
const hintLevel = ref(0) // 0=未提示 1=方法 2=公式 3=数值方向
const question = ref('')

const stepTitle = computed(() => props.step?.title ?? '等待开始')

/** 阶梯提示：逐级展开，不直接给答案 */
function requestHint() {
  const hints = props.step?.aiHints
  if (!hints) {
    pushAI(`当前步骤「${stepTitle.value}」：${props.step?.hint ?? '按提示操作即可'}`)
    return
  }
  hintLevel.value = Math.min(hintLevel.value + 1, 3)
  const level = hintLevel.value
  if (level === 1) pushAI(`💡 **方法提示**：${hints.level1}`)
  else if (level === 2) pushAI(`📐 **公式提示**：${hints.level2}`)
  else pushAI(`🔢 **方向提示**：${hints.level3}`)
  emit('aiFeedback', `hint_level_${level}_step_${props.step?.id}`)
}

function ask() {
  const q = question.value.trim()
  if (!q) return
  messages.value.push({ role: 'user', text: q })
  question.value = ''
  // 限定实验范围的 AI 回答（模拟——B7 完整版接后端 Agent）
  const hints = props.step?.aiHints
  if (hints) {
    if (q.includes('答案') || q.includes('结果') || q.includes('是多少')) {
      pushAI('我不能直接告诉你答案。试试先看方法提示（💡），然后自己计算——你会发现规律的！')
    } else if (q.includes('公式')) {
      pushAI(`📐 ${hints.level2}`)
    } else if (q.includes('怎么做') || q.includes('如何')) {
      pushAI(`💡 ${hints.level1}`)
    } else {
      pushAI(`这个问题与当前步骤「${stepTitle.value}」相关。试试点击「请求提示」获取引导。`)
    }
  } else {
    pushAI('这个问题超出了当前实验范围。请聚焦于实验步骤。')
  }
}

function pushAI(text: string) {
  messages.value.push({ role: 'ai', text })
}

// 步骤变化时重置提示级别并推送欢迎语
watch(() => props.step?.id, (id) => {
  if (id) {
    hintLevel.value = 0
    pushAI(`📍 当前步骤：**${stepTitle.value}**\n${props.step?.goal ?? ''}`)
  }
})
</script>

<template>
  <div class="ai-tutor">
    <h3>🤖 AI 助教</h3>
    <div class="chat">
      <div v-if="!messages.length" class="welcome">
        我会按步骤引导你完成实验。<br>遇到困难点「请求提示」，我会从方法→公式→方向逐级提示（不直接给答案）。
      </div>
      <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role]">
        <span v-html="m.text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')"></span>
      </div>
    </div>
    <div class="ops">
      <button class="hint" @click="requestHint" :disabled="!step">
        💡 请求提示 <span v-if="hintLevel > 0">({{ hintLevel }}/3)</span>
      </button>
    </div>
    <div class="input-row">
      <input v-model="question" placeholder="问与实验相关的问题…" @keyup.enter="ask">
      <button @click="ask" :disabled="!question.trim()">→</button>
    </div>
    <p class="note">提示不跳步 · 不直接给答案 · 阶梯引导</p>
  </div>
</template>

<style scoped>
.ai-tutor { display: flex; flex-direction: column; gap: 8px;
  background: #191930; border: 1px solid #3d3d5e; border-radius: 10px; padding: 12px; }
h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 4px; }
.chat { flex: 1; overflow-y: auto; min-height: 120px; max-height: 240px;
  display: flex; flex-direction: column; gap: 6px; }
.welcome { font-size: 11px; color: #565675; line-height: 1.8; padding: 10px; }
.msg { font-size: 12px; line-height: 1.5; padding: 6px 10px; border-radius: 8px;
  white-space: pre-wrap; word-break: break-word; }
.msg.ai { background: #23233a; color: #b0b0cc; }
.msg.user { background: #2b5c8f; color: #e8e8f0; align-self: flex-end; max-width: 90%; }
.msg b { color: #4a90d9; }
.ops { display: flex; }
.hint { flex: 1; background: #23402e; color: #7fe3b3; border: 1px solid #3ecf8e;
  border-radius: 8px; padding: 8px; font-size: 13px; cursor: pointer; }
.hint:disabled { opacity: 0.4; }
.input-row { display: flex; gap: 6px; }
.input-row input { flex: 1; background: #23233a; border: 1px solid #2f2f4a;
  border-radius: 6px; color: #e8e8f0; padding: 7px 9px; font-size: 12px; }
.input-row button { background: #2b5c8f; color: #fff; border: none;
  border-radius: 6px; padding: 0 12px; cursor: pointer; }
.note { font-size: 10px; color: #565675; text-align: center; }
</style>
