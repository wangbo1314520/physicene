<script setup lang="ts">
/**
 * 自由搭建 · AI 助手：场景识别 → 规律/临界提示 → 完整讲解 → 变式（改参数重算）→ 真 AI 问答
 * 模板来自被识别场景的 SolutionTemplate（与高考层讲解器同源），问答走 aiAgent（DeepSeek + 教材知识库），离线回退到模板。
 */
import { computed, ref, watch } from 'vue'
import type { Recognition, Placed } from './recognizer'
import type { RunRecord } from './SandboxData.vue'
import type { SolutionTemplate } from '../experiments/engine/solution'
import { askAgent, type ChatTurn } from '../experiments/data/aiAgent'
import { byType } from './catalog'

const props = defineProps<{ recognition: Recognition; elements: Placed[]; records: RunRecord[]; sceneName: string }>()
type Mode = 'analyze' | 'hint' | 'explain' | 'variant'
const mode = ref<Mode>('hint')
const MODES: { key: Mode; label: string; tip: string }[] = [
  { key: 'analyze', label: '分析', tip: '只识别场景，不提示' }, { key: 'hint', label: '提示', tip: '给规律与思路，不给答案' },
  { key: 'explain', label: '讲解', tip: '完整推导与数值' }, { key: 'variant', label: '变式', tip: '改参数即时重算' },
]

const def = computed(() => { const t = props.recognition.target; return t && (t.kind === 'mech' || t.kind === 'em') ? t.def : null })
const params = computed(() => { const d = def.value; if (!d) return {}; const p: Record<string, number> = Object.fromEntries(d.params.map((x) => [x.key, x.default])); return { ...p, ...props.recognition.params } })
const sol = computed<SolutionTemplate | null>(() => { try { return def.value ? def.value.solution(params.value) : null } catch { return null } })
const readout = computed(() => { try { return def.value ? def.value.readout(params.value, null) : '' } catch { return '' } })
const elementList = computed(() => props.elements.map((e) => `${byType.get(e.type)?.label ?? e.type}(${Object.entries(e.params).map(([k, v]) => `${k}=${v}`).join(',')})`).join('；'))

const messages = ref<{ role: 'ai' | 'user'; text: string; local?: boolean }[]>([])
const question = ref(''), busy = ref(false), online = ref<boolean | null>(null)
const history = computed<ChatTurn[]>(() => messages.value.filter((m) => !m.local).map((m) => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.text })))
function push(text: string, role: 'ai' | 'user' = 'ai', local = false) { messages.value.push({ role, text, local }) }

function context(ask: string): string {
  const rec = props.recognition
  const lastRec = props.records[props.records.length - 1]
  return [
    `【自由搭建实验】场景名：${props.sceneName}`,
    `识别结果：${rec.title}（置信度 ${(rec.confidence * 100).toFixed(0)}%）`,
    rec.notes.length ? `场景诊断信息：${rec.notes.join('；').slice(0, 400)}` : '',
    `画布元件：${elementList.value || '无'}`,
    Object.keys(rec.params).length ? `映射参数：${JSON.stringify(rec.params)}` : '',
    sol.value ? `题型：${sol.value.problemType}；规律：${sol.value.laws.join('；')}` : '',
    lastRec ? `最近一次运行读数：${lastRec.readout.slice(0, 300)}；事件：${lastRec.events.slice(-3).join(' / ')}` : '尚未运行',
    `请解释并回答：${ask}`,
    '要求：面向高中生，先给结论再推理；可直接给答案与解题思路；如学生搭建有缺元件或参数不合理，直接指出。',
  ].filter(Boolean).join('\n')
}
async function askAI(ask: string, fallback: () => string) {
  busy.value = true
  const r = await askAgent(context(ask), { history: history.value })
  busy.value = false
  if (r && !r.fallback) { online.value = true; push(r.reply); return }
  online.value = false
  const gate = r && r.errorType === 'GATEWAY' ? `\n\n（${r.reply}）` : '\n\n（AI 服务暂不可用，以上为内置讲解）'
  push(fallback() + gate, 'ai', true)
}
function ask() { const q = question.value.trim(); if (!q || busy.value) return; push(q, 'user'); question.value = ''; void askAI(q, () => (sol.value ? `${sol.value.problemType}\n规律：${sol.value.laws.join('；')}\n临界：${sol.value.critical.join('；')}` : props.recognition.notes.join('\n') || '先搭出可识别的组合')) }
function explainAll() { void askAI('按“场景识别→过程拆解→受力分析→物理规律→临界条件→公式推导→易错点→同类题与竞赛扩展”八项完整讲解这个场景，并用当前参数给出数值结果。', () => (sol.value ? ['过程：' + sol.value.processes.join('；'), '受力：' + sol.value.forces.join('；'), '规律：' + sol.value.laws.join('；'), '临界：' + sol.value.critical.join('；'), '推导：' + sol.value.derivation.join('；'), '数值：' + sol.value.numeric.join('；'), '易错：' + sol.value.pitfalls.join('；'), '同类：' + sol.value.similar.join('、') + '；竞赛：' + sol.value.competition.join('、')].join('\n') : props.recognition.notes.join('\n'))) }
function analyzeRun() { void askAI('请分析我最近一次运行的读数和事件：是否符合理论、临界点在哪、下一步该改哪个参数验证什么。', () => (readout.value || '先运行并记录一次')) }
watch(() => props.recognition.title, (t, old) => { if (t !== old && props.elements.length) push(`🔎 识别：${t}${props.recognition.notes.length ? '\n' + props.recognition.notes.map((n) => '· ' + n).join('\n') : ''}`, 'ai', true) })
</script>

<template>
  <div class="ai">
    <h4>🤖 AI 助手 <span class="dot" :class="online === true ? 'on' : online === false ? 'off' : ''"></span>
      <span class="modes"><button v-for="m in MODES" :key="m.key" :class="{ active: mode === m.key }" :title="m.tip" @click="mode = m.key">{{ m.label }}</button></span></h4>
    <div class="ident">
      <p class="t">{{ elements.length ? `你搭的是：${recognition.title}` : '画布为空——拖入元件后我会识别场景' }}</p>
      <p v-if="elements.length" class="c">置信度 {{ (recognition.confidence * 100).toFixed(0) }}%<template v-if="recognition.missing.length">　缺：{{ recognition.missing.join('、') }}</template></p>
      <p v-for="(n, i) in recognition.notes" :key="i" class="n">· {{ n }}</p>
    </div>
    <div v-if="mode === 'analyze'" class="panel"><p class="n">分析模式：只识别场景与元件，不给提示。切到「提示 / 讲解」查看规律与推导。</p><p class="n">元件：{{ elementList || '—' }}</p></div>
    <div v-else-if="mode === 'hint' && sol" class="panel">
      <p class="k">题型</p><p>{{ sol.problemType }}</p>
      <p class="k">思路要点（不给答案）</p><ul><li v-for="(h, i) in sol.hints" :key="i">{{ h }}</li></ul>
      <p class="k">可能用到的规律</p><ul><li v-for="(l, i) in sol.laws" :key="i">{{ l }}</li></ul>
      <p class="k">临界条件</p><ul><li v-for="(c, i) in sol.critical" :key="i">{{ c }}</li></ul>
    </div>
    <div v-else-if="mode === 'explain' && sol" class="panel">
      <p class="k">过程拆解</p><ol><li v-for="(x, i) in sol.processes" :key="i">{{ x }}</li></ol>
      <p class="k">受力分析</p><ul><li v-for="(x, i) in sol.forces" :key="i">{{ x }}</li></ul>
      <p class="k">公式推导</p><ol><li v-for="(x, i) in sol.derivation" :key="i">{{ x }}</li></ol>
      <p class="k">数值（当前参数）</p><ul><li v-for="(x, i) in sol.numeric" :key="i">{{ x }}</li></ul>
      <p class="k">易错点</p><ul><li v-for="(x, i) in sol.pitfalls" :key="i">{{ x }}</li></ul>
      <p class="k">同类题 · 竞赛扩展</p><p>{{ sol.similar.join('、') }} ｜ {{ sol.competition.join('、') }}</p>
    </div>
    <div v-else-if="mode === 'variant' && def" class="panel">
      <p class="k">变式：当前参数下的理论结果（在画布改参数会即时重算）</p><p class="ro">{{ readout }}</p>
      <p class="n">试试：只改一个参数（如 v₀、B、θ），观察哪个结论变、哪个不变——这就是“控制变量”</p>
    </div>
    <div v-else class="panel"><p class="n">{{ recognition.target?.kind === 'component' ? '该场景为独立组件，讲解模板在运行器内的「AI 讲解」里；也可以直接问我。' : recognition.target?.kind === 'circuit' ? '自由电路：连好线后读表；问我“为什么电流表读数偏大”这类问题即可。' : recognition.target?.kind === 'dyn4j' ? '刚体沙盒：运行后可问我“碰撞后为什么两球速度交换”。' : '搭出可识别的组合后，这里会给出规律、临界与推导。' }}</p></div>
    <div class="chat">
      <div v-for="(m, i) in messages" :key="i" :class="['msg', m.role]"><span v-html="m.text.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>')"></span></div>
      <div v-if="busy" class="msg ai">AI 思考中…</div>
    </div>
    <div class="ops"><button class="explain" :disabled="busy || !elements.length" @click="explainAll">📖 AI 完整讲题</button><button class="ana" :disabled="busy || !records.length" @click="analyzeRun">🧮 分析运行结果</button></div>
    <div class="input-row"><input v-model="question" placeholder="问这个场景的任何问题（答案、思路、为什么…）" :disabled="busy" @keyup.enter="ask"><button :disabled="!question.trim() || busy" @click="ask">→</button></div>
  </div>
</template>

<style scoped>
.ai { background: #191930; border: 1px solid #3d3d5e; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
h4 { font-size: 13px; color: #b0b0cc; display: flex; align-items: center; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #565675; display: inline-block; } .dot.on { background: #3ecf8e; } .dot.off { background: #E05555; }
.modes { margin-left: auto; display: flex; gap: 4px; } .modes button { background: #23233a; color: #8a8aa0; border: 1px solid #2f2f4a; border-radius: 6px; padding: 2px 8px; font-size: 11px; cursor: pointer; } .modes button.active { color: #e8e8f0; border-color: #4a90d9; background: #2b5c8f44; }
.ident { background: #14142a; border-radius: 8px; padding: 8px; } .ident .t { color: #3ecf8e; font-size: 13px; font-weight: 600; } .ident .c { color: #8a8aa0; font-size: 11px; margin-top: 2px; }
.n { color: #8a8aa0; font-size: 11px; line-height: 1.5; margin-top: 3px; }
.panel { background: #14142a; border-radius: 8px; padding: 8px; font-size: 12px; color: #b0b0cc; max-height: 260px; overflow-y: auto; line-height: 1.55; }
.panel .k { color: #4a90d9; font-weight: 600; margin-top: 6px; font-size: 11px; } .panel ul, .panel ol { padding-left: 18px; margin: 2px 0; } .ro { white-space: pre-wrap; color: #7fe3b3; font-family: Consolas, monospace; font-size: 11px; }
.chat { display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
.msg { font-size: 12px; line-height: 1.55; padding: 6px 10px; border-radius: 8px; white-space: pre-wrap; word-break: break-word; } .msg.ai { background: #23233a; color: #b0b0cc; } .msg.user { background: #2b5c8f; color: #e8e8f0; align-self: flex-end; max-width: 90%; } .msg b { color: #4a90d9; }
.ops { display: flex; gap: 6px; } .ops button { flex: 1; border-radius: 8px; padding: 7px 4px; font-size: 12px; cursor: pointer; border: 1px solid #2f2f4a; } .explain { background: #2b5c8f; color: #fff; border-color: #4a90d9 !important; } .ana { background: #3a2a1a; color: #F5C542; border-color: #F5C542 !important; } .ops button:disabled { opacity: 0.45; cursor: not-allowed; }
.input-row { display: flex; gap: 6px; } .input-row input { flex: 1; background: #23233a; border: 1px solid #2f2f4a; border-radius: 6px; color: #e8e8f0; padding: 7px 9px; font-size: 12px; } .input-row button { background: #2b5c8f; color: #fff; border: none; border-radius: 6px; padding: 0 12px; cursor: pointer; }
</style>
