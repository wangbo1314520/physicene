<script setup lang="ts">
/**
 * AI 解题讲解器面板（B10）
 * 模式：提示（只给思路）/ 完整（分步展开全部推导与数值）/ 变式（锁定一份基线，改参数后并排对比数值）
 * 交互：按需展开、分步「下一步」、一键全部展开
 */
import { computed, ref, watch } from 'vue'
import type { SolutionTemplate } from '../../engine/solution'
import { askAgent } from '../../data/aiAgent'

const props = defineProps<{ template: SolutionTemplate; title?: string }>()
type Mode = 'hint' | 'full' | 'variant'
const open = ref(false)
const mode = ref<Mode>('hint')
const revealed = ref(1)
const baseline = ref<SolutionTemplate | null>(null)

const SECTIONS: { key: keyof SolutionTemplate; title: string; icon: string }[] = [
  { key: 'processes', title: '过程拆解', icon: '①' },
  { key: 'forces', title: '受力分析', icon: '②' },
  { key: 'laws', title: '物理规律', icon: '③' },
  { key: 'critical', title: '临界条件', icon: '④' },
  { key: 'derivation', title: '公式推导', icon: '⑤' },
  { key: 'numeric', title: '数值计算（代入当前参数）', icon: '⑥' },
  { key: 'pitfalls', title: '易错点', icon: '⑦' },
  { key: 'similar', title: '同类题（举一反三）', icon: '⑧' },
  { key: 'competition', title: '竞赛扩展', icon: '⑨' },
]
const visible = computed(() => (mode.value === 'hint' ? [] : SECTIONS.slice(0, revealed.value)))
function setMode(m: Mode) {
  mode.value = m
  if (m === 'variant') baseline.value = JSON.parse(JSON.stringify(props.template))
  if (m === 'full') revealed.value = Math.max(revealed.value, 1)
}
function lines(key: keyof SolutionTemplate): string[] { const v = props.template[key]; return Array.isArray(v) ? v : [String(v)] }
function baseLines(key: keyof SolutionTemplate): string[] { const v = baseline.value?.[key]; return Array.isArray(v) ? v : [] }
watch(() => props.template.problemType, () => { /* 参数变化时数值自动联动，无需重置 */ })

// B10 AI 深讲（2A·2026-10-11）：把模板骨架（题型/过程/受力/规律/临界/推导/数值）连同当前参数
// 打包给 DeepSeek 做自然语言展开——模板保底（离线时上方分段内容即完整讲解），AI 在线时给连贯成文
const aiReply = ref('')
const aiBusy = ref(false)
const aiOnline = ref<boolean | null>(null)
async function aiExplain() {
  if (aiBusy.value) return
  aiBusy.value = true
  const t = props.template
  const ctx = [
    '【高考物理·整题完整讲解】以下是本题的解题骨架（当前画布参数实时联动），请据此写一段连贯的完整解题讲解。',
    `题型：${t.problemType}`,
    `过程拆解：${t.processes.join('；')}`,
    `受力分析：${t.forces.join('；')}`,
    `物理规律：${t.laws.join('；')}`,
    `临界条件：${t.critical.join('；')}`,
    `公式推导：${t.derivation.join('；')}`,
    `数值计算（当前参数）：${t.numeric.join('；')}`,
    '要求：面向高中生；先给最终答案，再按过程顺序逐步推导并代入数值；公式写清楚；结尾点出本题易错点。',
  ].join('\n')
  const r = await askAgent(ctx, { sessionId: 'b10-solver' })
  aiBusy.value = false
  if (r && !r.fallback) {
    aiOnline.value = true
    aiReply.value = r.reply
  } else {
    aiOnline.value = false
    aiReply.value = '（AI 服务暂不可用——上方分段模板即为完整讲解：过程/受力/规律/临界/推导/数值/易错/同类/竞赛九段齐全）'
  }
}
</script>

<template>
  <section class="explainer">
    <button class="head" @click="open = !open">
      <span>🧠 AI 解题讲解{{ title ? `：${title}` : '' }}</span>
      <span class="tag">{{ template.problemType }}</span>
      <span class="chev">{{ open ? '▲' : '▼ 讲解本题' }}</span>
    </button>
    <div v-if="open" class="body">
      <div class="modes">
        <button :class="{ on: mode === 'hint' }" @click="setMode('hint')">💡 提示模式</button>
        <button :class="{ on: mode === 'full' }" @click="setMode('full')">📖 完整解答</button>
        <button :class="{ on: mode === 'variant' }" @click="setMode('variant')">🔁 变式训练</button>
      </div>
      <div v-if="mode !== 'hint'" class="airow">
        <button class="mini ai" :disabled="aiBusy" @click="aiExplain">🤖 AI 深讲本题（成文推导）</button>
        <span v-if="aiOnline === true" class="aiok">AI 在线</span>
        <span v-else-if="aiOnline === false" class="aioff">AI 离线（模板保底）</span>
      </div>
      <div v-if="aiBusy" class="aisay">AI 思考中…</div>
      <div v-else-if="aiReply" class="aisay" :class="{ off: aiOnline === false }">{{ aiReply }}</div>
      <div v-if="mode === 'hint'" class="sec">
        <h4>思路提示（不给答案）</h4>
        <ul><li v-for="(h, i) in template.hints" :key="i">{{ h }}</li></ul>
        <p class="note">先自己列过程、写规律、找临界，再切到「完整解答」核对。</p>
      </div>
      <template v-else>
        <div v-for="s in visible" :key="s.key" class="sec">
          <h4>{{ s.icon }} {{ s.title }}</h4>
          <template v-if="mode === 'variant' && s.key === 'numeric' && baseline">
            <div class="cmp">
              <div><b>基线（切到变式时的参数）</b><ul><li v-for="(l, i) in baseLines('numeric')" :key="i">{{ l }}</li></ul></div>
              <div><b>当前参数</b><ul><li v-for="(l, i) in lines('numeric')" :key="i" :class="{ diff: baseLines('numeric')[i] !== l }">{{ l }}</li></ul></div>
            </div>
            <p class="note">左右对照：改一个参数后哪些量变了、按什么比例变——这就是变式训练的要点。</p>
          </template>
          <ul v-else><li v-for="(l, i) in lines(s.key)" :key="i">{{ l }}</li></ul>
        </div>
        <div class="row">
          <button v-if="revealed < SECTIONS.length" class="mini primary" @click="revealed++">下一步 ▶（{{ revealed }}/{{ SECTIONS.length }}）</button>
          <button v-if="revealed < SECTIONS.length" class="mini" @click="revealed = SECTIONS.length">全部展开</button>
          <button v-else class="mini" @click="revealed = 1">收起到第一步</button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.explainer { background: #1d1d33; border: 1px solid #3a2f5c; border-radius: 10px; margin-top: 10px; overflow: hidden; }
.head { width: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; background: #251d3d; color: #d8c8ff; border: none; padding: 10px 12px; cursor: pointer; font-size: 13px; text-align: left; }
.head .tag { font-size: 11px; color: #b06ce6; background: #33183a; padding: 1px 8px; border-radius: 4px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.head .chev { margin-left: auto; color: #8a8aa0; font-size: 12px; }
.body { padding: 10px 12px; }
.modes { display: flex; gap: 6px; margin-bottom: 10px; }
.modes button { flex: 1; background: #14142a; border: 1px solid #2f2f4a; color: #b0b0cc; border-radius: 6px; padding: 6px; cursor: pointer; font-size: 12px; }
.modes button.on { background: #b06ce6; color: #1a1a2e; border-color: #b06ce6; font-weight: 600; }
.sec { margin-bottom: 10px; }
.sec h4 { font-size: 12.5px; color: #d8c8ff; margin-bottom: 4px; }
.sec ul { margin: 0 0 0 16px; padding: 0; font-size: 12px; color: #b0b0cc; line-height: 1.7; }
.sec li.diff { color: #F5C542; }
.note { font-size: 11px; color: #6c6c85; margin-top: 4px; line-height: 1.5; }
.cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 12px; color: #b0b0cc; }
.cmp b { color: #8a8aa0; font-size: 11px; }
.row { display: flex; gap: 6px; }
.mini { background: #14142a; border: 1px solid #2f2f4a; color: #b0b0cc; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; }
.mini.primary { background: #3ecf8e; color: #1a1a2e; border-color: #3ecf8e; font-weight: 600; }
.airow { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.mini.ai { background: #2b5c8f; color: #fff; border-color: #4a90d9; font-weight: 600; }
.aiok { font-size: 11px; color: #3ecf8e; } .aioff { font-size: 11px; color: #8a8aa0; }
.aisay { background: #14142a; border: 1px solid #2f2f4a; border-radius: 8px; padding: 8px 10px; font-size: 12px; color: #b0b0cc; line-height: 1.7; margin-bottom: 10px; white-space: pre-wrap; }
.aisay.off { color: #8a8aa0; }
</style>
