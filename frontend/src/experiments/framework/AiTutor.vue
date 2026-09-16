<script setup lang="ts">
/**
 * AI 助教侧栏（2026-09-17 按项目定位更正）：真 AI 问答 + 直接讲解 + 数据分析 + 可选逐级提示。
 * 通道：Java 代理 /api/v1/agent/chat → Python Agent（DeepSeek + 教材知识库）；不可用时用步骤内置提示回退，永不“拒绝回答”。
 */
import { computed, ref, watch } from 'vue'
import type { ExperimentStep, StepSnapshot } from '../core/types'
import { askAgent, withExperimentContext, type ChatTurn } from '../data/aiAgent'

const props = defineProps<{
  step: ExperimentStep | null
  snapshot: StepSnapshot
  experimentName: string
  rawData?: Record<string, unknown> | null
  sessionId?: string | number | null
}>()

const emit = defineEmits<{ (e: 'aiFeedback', feedback: string): void }>()

const messages = ref<{ role: 'ai' | 'user'; text: string; local?: boolean }[]>([])
const hintLevel = ref(0)
const question = ref('')
const busy = ref(false)
const online = ref<boolean | null>(null)

const stepTitle = computed(() => props.step?.title ?? '等待开始')
const history = computed<ChatTurn[]>(() => messages.value.filter((m) => !m.local).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })))

function pushAI(text: string, local = false) { messages.value.push({ role: 'ai', text, local }) }

/** 统一出口：先问真 AI，失败则本地回退 */
async function askAI(ask: string, fallback: () => string) {
  busy.value = true
  const prompt = withExperimentContext({ experiment: props.experimentName, step: props.step?.title, goal: props.step?.goal, records: props.snapshot.records, ask })
  const r = await askAgent(prompt, { sessionId: String(props.sessionId ?? ''), history: history.value })
  busy.value = false
  if (r && !r.fallback) { online.value = true; pushAI(r.reply); emit('aiFeedback', `agent:${ask.slice(0, 30)}`); return }
  online.value = false
  pushAI(fallback() + '\n\n（AI 服务暂不可用，以上为内置讲解；启动 python-ai-service 后可获得完整解答）', true)
}

/** 逐级提示：内置三级（方法→公式→方向），没有内置时问 AI 要“只给思路”的提示 */
function requestHint() {
  const hints = props.step?.aiHints
  if (hints) {
    hintLevel.value = Math.min(hintLevel.value + 1, 3)
    const level = hintLevel.value
    pushAI(level === 1 ? `💡 **方法提示**：${hints.level1}` : level === 2 ? `📐 **公式提示**：${hints.level2}` : `🔢 **方向提示**：${hints.level3}`, true)
    emit('aiFeedback', `hint_level_${level}_step_${props.step?.id}`)
    return
  }
  void askAI('只给这一步的解题思路和用到的规律，不要直接给数值答案。', () => `当前步骤「${stepTitle.value}」：${props.step?.hint ?? '按提示操作即可'}`)
}

/** 直接讲解：完整原理 + 方法 + 结论 + 易错点 */
function explain() {
  void askAI('请完整讲解这一步：原理、操作要点、涉及公式与推导、预期结果、常见错误。', () => {
    const h = props.step?.aiHints
    return h ? `📖 **完整讲解**\n方法：${h.level1}\n公式：${h.level2}\n结论方向：${h.level3}` : `📖 ${props.step?.goal ?? ''}\n${props.step?.hint ?? ''}`
  })
}

/** 分析数据：把已记录数据交给 AI 点评 */
function analyze() {
  void askAI('请分析我已记录的数据：是否符合理论、误差来源、下一步怎么做。', () => {
    const n = Object.keys(props.snapshot.records ?? {}).length
    return n ? `已记录 ${n} 步数据。对照本步理论值检查数量级与趋势；误差通常来自读数、摩擦与时间测量。` : '还没有记录数据——先点「记录数据」或运行一次实验。'
  })
}

function ask() {
  const q = question.value.trim()
  if (!q || busy.value) return
  messages.value.push({ role: 'user', text: q })
  question.value = ''
  void askAI(q, () => {
    const h = props.step?.aiHints
    if (h) return `关于「${stepTitle.value}」：\n方法：${h.level1}\n公式：${h.level2}\n结论方向：${h.level3}`
    return `当前步骤「${stepTitle.value}」：${props.step?.goal ?? ''} ${props.step?.hint ?? ''}`
  })
}

watch(() => props.step?.id, (id) => {
  if (id) { hintLevel.value = 0; pushAI(`📍 当前步骤：**${stepTitle.value}**\n${props.step?.goal ?? ''}`, true) }
})
</script>

<template>
  <div class="ai-tutor">
    <h3>🤖 AI 助教 <span class="dot" :class="online === true ? 'on' : online === false ? 'off' : ''" :title="online === true ? 'AI 在线' : online === false ? 'AI 服务离线，内置讲解' : '未连接'"></span></h3>
    <div class="chat">
      <div v-if="!messages.length" class="welcome">
        有不会的直接问：原理、公式、答案、解题思路都可以。<br>也可以点「直接讲解」听完整讲解，或「逐级提示」自己先想。
      </div>
      <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role]">
        <span v-html="m.text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')"></span>
      </div>
      <div v-if="busy" class="msg ai">AI 思考中…</div>
    </div>
    <div class="ops">
      <button class="explain" :disabled="busy" @click="explain">📖 直接讲解</button>
      <button class="hint" :disabled="busy" @click="requestHint">💡 逐级提示<span v-if="hintLevel > 0">({{ hintLevel }}/3)</span></button>
      <button class="ana" :disabled="busy" @click="analyze">🧮 分析数据</button>
    </div>
    <div class="input-row">
      <input v-model="question" placeholder="问任何与这个实验相关的问题…" :disabled="busy" @keyup.enter="ask">
      <button :disabled="!question.trim() || busy" @click="ask">→</button>
    </div>
    <p class="note">AI 直接讲解 · 可问答案与思路 · DeepSeek + 教材知识库（离线时内置讲解）</p>
  </div>
</template>

<style scoped>
.ai-tutor { display: flex; flex-direction: column; gap: 8px;
  background: #191930; border: 1px solid #3d3d5e; border-radius: 10px; padding: 12px; }
h3 { font-size: 13px; color: #b0b0cc; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #565675; display: inline-block; }
.dot.on { background: #3ecf8e; } .dot.off { background: #E05555; }
.chat { flex: 1; overflow-y: auto; min-height: 140px; max-height: 300px; display: flex; flex-direction: column; gap: 6px; }
.welcome { font-size: 11px; color: #565675; line-height: 1.8; padding: 10px; }
.msg { font-size: 12px; line-height: 1.55; padding: 6px 10px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; }
.msg.ai { background: #23233a; color: #b0b0cc; }
.msg.user { background: #2b5c8f; color: #e8e8f0; align-self: flex-end; max-width: 90%; }
.msg b { color: #4a90d9; }
.ops { display: flex; gap: 6px; }
.ops button { flex: 1; border-radius: 8px; padding: 7px 4px; font-size: 12px; cursor: pointer; border: 1px solid #2f2f4a; }
.explain { background: #2b5c8f; color: #fff; border-color: #4a90d9 !important; }
.hint { background: #23402e; color: #7fe3b3; border-color: #3ecf8e !important; }
.ana { background: #3a2a1a; color: #F5C542; border-color: #F5C542 !important; }
.ops button:disabled { opacity: 0.45; cursor: not-allowed; }
.input-row { display: flex; gap: 6px; }
.input-row input { flex: 1; background: #23233a; border: 1px solid #2f2f4a; border-radius: 6px; color: #e8e8f0; padding: 7px 9px; font-size: 12px; }
.input-row button { background: #2b5c8f; color: #fff; border: none; border-radius: 6px; padding: 0 12px; cursor: pointer; }
.note { font-size: 10px; color: #565675; text-align: center; }
</style>
