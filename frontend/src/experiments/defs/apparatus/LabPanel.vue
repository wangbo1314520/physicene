<script setup lang="ts">
/**
 * 实验面板壳：左侧控制区（slot controls）+ 中间仪器舞台（默认 slot）+ 右侧坐标纸（可关）。
 * 各实验组件只需实现自己的仪器画布与物理，作图/记录链路统一走 loadPoints。
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
function loadPoints(pts: { x: number; y: number }[]) {
  gp.value?.loadPoints(pts)
}
defineExpose({ loadPoints })
</script>

<template>
  <div class="lab" :class="{ 'no-graph': !graph }">
    <aside class="panel">
      <h3>{{ title }}</h3>
      <p v-if="desc" class="desc">{{ desc }}</p>
      <p v-if="formula" class="formula">📐 {{ formula }}</p>
      <slot name="controls" />
    </aside>
    <section class="stage">
      <slot />
    </section>
    <GraphPaper v-if="graph" ref="gp" :series-name="title" :series-color="seriesColor"
      :initial-state="{ mode: 'auto', locked: false,
        axes: { xLabel: axes?.x ?? 'x', yLabel: axes?.y ?? 'y', xUnit: axes?.xUnit ?? '', yUnit: axes?.yUnit ?? '' },
        series: [{ id: 's1', name: title, color: props.seriesColor, points: [] }],
        fits: [], showFitLine: true, showResiduals: false, showErrorBars: false, showFormula: true }" />
  </div>
</template>

<style scoped>
/* 左：控制区（跨两行）；右上：仪器舞台；右下：坐标纸（需 ≥600px 宽，自带 240px 数据表栏） */
.lab { display: grid; grid-template-columns: 270px minmax(0, 1fr); grid-template-rows: auto auto; gap: 10px; }
.lab.no-graph { grid-template-rows: auto; }
.panel { grid-row: 1 / span 2; background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 14px; }
.lab.no-graph .panel { grid-row: 1; }
h3 { font-size: 14px; color: #b0b0cc; margin-bottom: 8px; }
.desc { font-size: 12px; color: #6c6c85; margin-bottom: 8px; line-height: 1.6; }
.formula { font: 13px Consolas; color: #4a90d9; margin-bottom: 12px; }
.stage { background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden;
  position: relative; min-height: 400px; height: 400px; }
.lab.no-graph .stage { min-height: 460px; height: 460px; }
.stage :deep(canvas) { display: block; width: 100%; height: 100%; touch-action: none; }
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
@media (max-width: 900px) {
  .lab, .lab.no-graph { grid-template-columns: 1fr; grid-template-rows: auto; }
  .panel, .lab.no-graph .panel { grid-row: auto; }
}
</style>
