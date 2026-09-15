<script setup lang="ts">
/**
 * 电路实验框架：标题区 → 全宽自由搭建编辑器（slot editor）→ 底部“任务/记录”面板（slot controls）+ 坐标纸或自定义图（slot graph）
 */
import { ref } from 'vue'
import GraphPaper from '../../framework/GraphPaper.vue'

const props = withDefaults(defineProps<{
  title: string
  desc?: string
  formula?: string
  axes?: { x: string; y: string; xUnit?: string; yUnit?: string }
  graph?: boolean
  seriesColor?: string
}>(), { graph: true, seriesColor: '#4A90D9' })

const gp = ref<InstanceType<typeof GraphPaper> | null>(null)
function loadPoints(pts: { x: number; y: number }[]) { gp.value?.loadPoints(pts) }
defineExpose({ loadPoints })
</script>

<template>
  <div class="clab">
    <header class="head">
      <h3>{{ title }}</h3>
      <p v-if="desc" class="desc">{{ desc }}</p>
      <p v-if="formula" class="formula">📐 {{ formula }}</p>
    </header>
    <section class="editor"><slot name="editor" /></section>
    <div class="bottom" :class="{ 'no-graph': !graph }">
      <aside class="panel"><slot name="controls" /></aside>
      <div class="graph">
        <slot name="graph">
          <GraphPaper v-if="graph" ref="gp" :series-name="title" :series-color="seriesColor"
            :initial-state="{ mode: 'auto', locked: false,
              axes: { xLabel: axes?.x ?? 'x', yLabel: axes?.y ?? 'y', xUnit: axes?.xUnit ?? '', yUnit: axes?.yUnit ?? '' },
              series: [{ id: 's1', name: title, color: props.seriesColor, points: [] }],
              fits: [], showFitLine: true, showResiduals: false, showErrorBars: false, showFormula: true }" />
        </slot>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clab { display: flex; flex-direction: column; gap: 10px; }
.head { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 12px 14px; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 6px; }
.desc { font-size: 12px; color: #6c6c85; line-height: 1.6; }
.formula { font: 13px Consolas; color: #4a90d9; margin-top: 6px; }
.bottom { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 10px; }
.bottom.no-graph { grid-template-columns: 1fr; }
.panel { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
.graph { min-width: 0; }
.panel :deep(label) { display: block; font-size: 12px; color: #8a8aa0; margin-bottom: 10px; }
.panel :deep(label input[type=range]) { width: 100%; }
.panel :deep(.readout) { background: #14142a; border-radius: 6px; padding: 9px 10px; margin: 8px 0;
  font: 12.5px Consolas; color: #3ecf8e; line-height: 1.7; white-space: pre-line; }
.panel :deep(.btn) { width: 100%; background: #2b5c8f; color: #fff; border: 1px solid #4a90d9;
  border-radius: 8px; padding: 9px; font-size: 13px; cursor: pointer; margin-top: 6px; }
.panel :deep(.btn.alt) { background: #23402e; color: #7fe3b3; border-color: #3ecf8e; }
.panel :deep(.btn.ghost) { background: transparent; color: #8a8aa0; border-color: #2f2f4a; }
.panel :deep(.btn:disabled) { opacity: 0.45; cursor: not-allowed; }
.panel :deep(.row) { display: flex; gap: 6px; }
.panel :deep(.hint) { font-size: 11px; color: #565675; margin-top: 8px; line-height: 1.5; }
.panel :deep(table.rows) { width: 100%; border-collapse: collapse; font: 11.5px Consolas; color: #b0b0cc; margin-top: 6px; }
.panel :deep(table.rows td), .panel :deep(table.rows th) { padding: 2px 4px; border-bottom: 1px solid #2f2f4a; text-align: right; }
.panel :deep(table.rows th) { color: #6c6c85; font-weight: normal; }
@media (max-width: 900px) { .bottom { grid-template-columns: 1fr; } }
</style>
