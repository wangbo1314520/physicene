<script setup lang="ts">
/**
 * 自由搭建 · 数据面板：记录表（每次「记录」/运行结束的快照）+ 坐标纸联动（自选 x/y 字段描点、拟合）+ CSV 导出
 * 数值字段来源：仿真时刻 t、映射参数、以及从 readout 文本中解析出的 “名=数值” 对
 */
import { computed, ref, watch } from 'vue'
import GraphPaper from '../experiments/framework/GraphPaper.vue'
import type { PaperState } from '../experiments/core/processedData'

export interface RunRecord { at: string; family: string; t: number | null; params: Record<string, number>; readout: string; events: string[] }
const props = defineProps<{ records: RunRecord[] }>()
const emit = defineEmits<{ (e: 'clear'): void }>()

const NUM_RE = /([A-Za-z\u0370-\u03ff\u2080-\u209c′ₘ_][A-Za-z0-9\u0370-\u03ff\u2080-\u209c′ₘ_]*)\s*[=＝]\s*(-?\d+(?:\.\d+)?)/g
function fields(r: RunRecord): Record<string, number> {
  const out: Record<string, number> = {}
  if (r.t !== null) out.t = +r.t.toFixed(3)
  for (const [k, v] of Object.entries(r.params ?? {})) if (typeof v === 'number') out[`p:${k}`] = v
  for (const m of r.readout.matchAll(NUM_RE)) { const k = m[1]; if (!(k in out)) out[k] = parseFloat(m[2]) }
  for (const ev of r.events.slice(-3)) for (const m of ev.matchAll(NUM_RE)) { const k = `e:${m[1]}`; if (!(k in out)) out[k] = parseFloat(m[2]) }
  return out
}
const rows = computed(() => props.records.map((r, i) => ({ i: i + 1, r, f: fields(r) })))
const allKeys = computed(() => { const s = new Set<string>(); for (const row of rows.value) Object.keys(row.f).forEach((k) => s.add(k)); return [...s] })
const xKey = ref(''), yKey = ref('')
watch(allKeys, (ks) => { if (!ks.includes(xKey.value)) xKey.value = ks.find((k) => k.startsWith('p:')) ?? ks[0] ?? ''; if (!ks.includes(yKey.value)) yKey.value = ks.find((k) => !k.startsWith('p:') && k !== xKey.value) ?? ks[1] ?? '' }, { immediate: true })
const paperKey = ref(0)
const paperState = ref<PaperState | null>(null)
function toPaper() {
  const pts = rows.value.filter((row) => Number.isFinite(row.f[xKey.value]) && Number.isFinite(row.f[yKey.value])).map((row) => ({ x: row.f[xKey.value], y: row.f[yKey.value] }))
  paperState.value = { mode: 'auto', locked: false, axes: { xLabel: xKey.value.replace(/^p:|^e:/, ''), yLabel: yKey.value.replace(/^p:|^e:/, '') }, series: [{ id: 'sandbox', name: `${yKey.value}–${xKey.value}`, color: '#F5C542', points: pts }], fits: [], showFitLine: true, showResiduals: false, showErrorBars: false, showFormula: true }
  paperKey.value++
}
function exportCsv() {
  const keys = allKeys.value
  const lines = [['#', '时间', '场景', ...keys, 'readout', 'events'].join(',')]
  for (const row of rows.value) lines.push([row.i, row.r.at, row.r.family, ...keys.map((k) => row.f[k] ?? ''), JSON.stringify(row.r.readout), JSON.stringify(row.r.events.join(' | '))].join(','))
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })); a.download = 'sandbox-data.csv'; a.click()
}
</script>

<template>
  <div class="data">
    <div class="head">
      <h4>数据面板 <small>{{ records.length }} 条记录（运行器里点「记录」或跑到结束自动记录）</small></h4>
      <span class="spacer"></span>
      <button :disabled="!records.length" @click="exportCsv">⇩ CSV</button>
      <button :disabled="!records.length" @click="emit('clear')">清空</button>
    </div>
    <div v-if="records.length" class="table-wrap">
      <table>
        <thead><tr><th>#</th><th>时刻</th><th v-for="k in allKeys" :key="k">{{ k.replace(/^p:/, '参数·').replace(/^e:/, '事件·') }}</th><th>读数/事件</th></tr></thead>
        <tbody>
          <tr v-for="row in rows" :key="row.i">
            <td>{{ row.i }}</td><td>{{ row.r.at }}</td>
            <td v-for="k in allKeys" :key="k">{{ row.f[k] ?? '' }}</td>
            <td class="ro" :title="row.r.readout + '\n' + row.r.events.join('\n')">{{ (row.r.events[row.r.events.length - 1] ?? row.r.readout).slice(0, 60) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="empty">还没有数据。运行后点运行器里的「📏 记录当前数据」，或让仿真跑到结束。</p>
    <div v-if="records.length" class="paper-row">
      <label>x：<select v-model="xKey"><option v-for="k in allKeys" :key="k" :value="k">{{ k }}</option></select></label>
      <label>y：<select v-model="yKey"><option v-for="k in allKeys" :key="k" :value="k">{{ k }}</option></select></label>
      <button class="primary" :disabled="!xKey || !yKey" @click="toPaper">📈 导出到坐标纸</button>
      <span class="hint">多次改参数运行并记录，即可在坐标纸上描点、拟合、看误差</span>
    </div>
    <div v-if="paperState" class="paper"><GraphPaper :key="paperKey" :initial-state="paperState" series-name="沙盒数据" series-color="#F5C542" /></div>
  </div>
</template>

<style scoped>
.data { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 10px; }
.head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; } .head h4 { font-size: 13px; color: #b0b0cc; } .head small { color: #565675; font-weight: normal; } .spacer { flex: 1; }
button { background: #23233a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 4px 10px; font-size: 12px; cursor: pointer; } button:disabled { opacity: 0.4; cursor: not-allowed; }
.primary { background: #2b5c8f; color: #fff; border-color: #4a90d9; }
.table-wrap { max-height: 220px; overflow: auto; border: 1px solid #2f2f4a; border-radius: 6px; }
table { width: 100%; border-collapse: collapse; font: 11px Consolas, monospace; } th, td { padding: 4px 6px; border-bottom: 1px solid #23233a; text-align: left; white-space: nowrap; } th { color: #8a8aa0; position: sticky; top: 0; background: #1d1d33; } td { color: #b0b0cc; } .ro { color: #7fe3b3; max-width: 320px; overflow: hidden; text-overflow: ellipsis; }
.empty { color: #565675; font-size: 12px; padding: 12px 4px; }
.paper-row { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 12px; color: #8a8aa0; } .paper-row select { background: #14142a; color: #b0b0cc; border: 1px solid #2f2f4a; border-radius: 6px; padding: 3px 6px; } .hint { color: #565675; font-size: 11px; }
.paper { margin-top: 8px; height: 360px; }
</style>
