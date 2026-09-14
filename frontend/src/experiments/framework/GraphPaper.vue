<script setup lang="ts">
/**
 * GraphPaper.vue —— 坐标纸 Vue 封装（完美版）：
 * 手动描点/拖动/删除 + 实时坐标 + 数据表双向联动 + 拟合(斜率/截距/R²/残差/过原点) +
 * 误差棒/异常点 + 自动/手动模式 + 考试锁定 + 撤销重做 + 导出 PNG/SVG/CSV。
 * 触屏/触控笔经 pointer 事件天然支持。
 */
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { Canvas2DEngine, type EnginePointerEvent } from '../renderers/canvas2d/Engine'
import { CoordinatePaperLayer } from '../renderers/canvas2d/CoordinatePaper'
import { linearFit, toPaperFit, weightedFit } from '../renderers/canvas2d/fit'
import type { PaperState, PaperPoint } from '../core/processedData'

const props = defineProps<{
  initialState?: PaperState
  /** 默认数据集名与颜色 */
  seriesName?: string
  seriesColor?: string
  /** 禁用编辑（考试锁定时传 true，仍可看） */
  lockEdit?: boolean
}>()
const emit = defineEmits<{
  (e: 'change', state: PaperState): void
  (e: 'exports', files: { pngDataUrl: string; svg: string; csv: string }): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
let engine: Canvas2DEngine | null = null
let paper: CoordinatePaperLayer | null = null

const coord = ref('')
const state = reactive<PaperState>(props.initialState ? JSON.parse(JSON.stringify(props.initialState)) : {
  mode: 'manual', locked: !!props.lockEdit,
  axes: { xLabel: 'x', yLabel: 'y' },
  series: [{ id: 's1', name: props.seriesName ?? '数据', color: props.seriesColor ?? '#4A90D9', points: [] }],
  fits: [], showFitLine: true, showResiduals: false, showErrorBars: true, showFormula: true,
})
const throughOrigin = ref(false)
const autoFit = ref(true)
const draggingKey = ref<string | null>(null)

function refit() {
  if (!autoFit.value || state.locked) return
  for (const s of state.series) {
    const pts = s.points
    const useWeighted = pts.some((p) => p.sy != null && p.sy > 0)
    const r = useWeighted
      ? weightedFit(pts, throughOrigin.value)
      : linearFit(pts, throughOrigin.value)
    const fit = toPaperFit(s.id, r, throughOrigin.value)
    const i = state.fits.findIndex((f) => f.seriesId === s.id)
    if (i >= 0) state.fits[i] = fit
    else state.fits.push(fit)
  }
  paper!.state = state as PaperState
  engine?.requestRender()
}

function notifyChange() {
  refit()
  emit('change', JSON.parse(JSON.stringify(state)))
}

// ===== 交互 =====
function onDown(e: EnginePointerEvent): boolean {
  if (state.locked) return false
  const hit = paper!.hitPoint(e.world)
  if (hit) {
    if (e.button === 2) { // 右键删除
      engine!.pushUndo()
      paper!.removePoint(hit)
      notifyChange()
      return false
    }
    if (e.shiftKey) { // shift 点击 = 标记异常点
      engine!.pushUndo()
      paper!.toggleOutlier(hit)
      notifyChange()
      return false
    }
    draggingKey.value = hit
    paper!.draggingKey = hit
    engine!.pushUndo()
    return true
  }
  if (state.mode === 'manual' && e.button === 0) {
    // 手动描点（吸附 0.1）
    engine!.pushUndo()
    const p = engine!.snapPoint({ x: e.world.x, y: e.world.y })
    paper!.addPoint(state.series[0].id, { x: round(p.x), y: round(p.y), manual: true })
    notifyChange()
  }
  return false
}
function onMove(e: EnginePointerEvent) {
  coord.value = `(${e.world.x.toFixed(2)}, ${e.world.y.toFixed(2)})`
  if (draggingKey.value && !state.locked) {
    const p = engine!.snapPoint(e.world)
    paper!.movePoint(draggingKey.value, round(p.x), round(p.y))
    state.series[0].points = [...paper!.series(state.series[0].id)!.points]
    engine!.requestRender()
  }
}
function onUp() {
  if (draggingKey.value) {
    paper!.draggingKey = null
    draggingKey.value = null
    state.series[0].points = [...paper!.series(state.series[0].id)!.points]
    notifyChange()
  }
}

// ===== 数据表（双向联动） =====
function addRow() {
  if (state.locked) return
  engine?.pushUndo()
  state.series[0].points.push({ x: NaN, y: NaN })
  paper!.series(state.series[0].id)!.points = [...state.series[0].points]
  engine?.requestRender()
}
function delRow(i: number) {
  if (state.locked) return
  engine?.pushUndo()
  state.series[0].points.splice(i, 1)
  paper!.series(state.series[0].id)!.points = [...state.series[0].points]
  notifyChange()
}
function onCell(i: number, key: 'x' | 'y' | 'sy', v: string) {
  const num = parseFloat(v)
  const pt = state.series[0].points[i]
  if (key === 'sy') pt.sy = Number.isFinite(num) ? num : undefined
  else pt[key] = Number.isFinite(num) ? num : 0
  paper!.series(state.series[0].id)!.points = [...state.series[0].points]
  notifyChange()
}
function doUndo() { engine?.undo() }
function doRedo() { engine?.redo() }
function doReset() { engine?.resetView(30) }

// ===== 外部注入数据（自动模式：仿真/仪器数据写入） =====
function loadPoints(pts: PaperPoint[], fit = true) {
  state.series[0].points = pts.map((p) => ({ ...p, manual: false }))
  paper!.series(state.series[0].id)!.points = [...state.series[0].points]
  if (fit) refit()
  const b = paper!.bounds()
  engine?.fitBounds(b.minX, b.maxX, b.minY - 1, b.maxY + 1)
  notifyChange()
}

// ===== 导出 =====
function exportPNG() { return engine!.exportPNG() }
function exportSVG() { return engine!.exportSVG() }
function exportCSV(): string {
  const s = state.series[0]
  const head = `x,y${state.series.some((x) => x.points.some((p) => p.sy != null)) ? ',sy' : ''}`
  const rows = s.points.map((p) => `${p.x},${p.y}${p.sy != null ? ',' + p.sy : ''}`)
  const fit = state.fits[0]
  const meta = fit ? [`# fit: y=${fit.k}x+${fit.b}, R2=${fit.r2}, n=${fit.n}`] : []
  return [head, ...rows, ...meta].join('\n')
}
function doExports() {
  const files = { pngDataUrl: exportPNG(), svg: exportSVG(), csv: exportCSV() }
  emit('exports', files)
  return files
}
defineExpose({ loadPoints, doExports, state })

onMounted(() => {
  if (!canvasRef.value) return
  engine = new Canvas2DEngine(canvasRef.value, { snap: 0.1 })
  engine.onPointerDown = onDown
  engine.onPointerMove = onMove
  engine.onPointerUp = onUp
  paper = new CoordinatePaperLayer(state as PaperState)
  paper.state.series[0].points = [...state.series[0].points]
  engine.addLayer(paper as any)
  // 初始视野
  engine.view.scale = 30
  engine.view.ox = 70
  engine.view.oy = canvasRef.value.clientHeight - 60
  engine.requestRender()
})
onUnmounted(() => engine?.destroy())

watch(throughOrigin, refit)
watch(() => state.showFitLine, () => { paper!.state = state as PaperState; engine?.requestRender() })
watch(() => state.showResiduals, () => { paper!.state = state as PaperState; engine?.requestRender() })
function round(v: number) { return Math.round(v * 100) / 100 }
</script>

<template>
  <div class="gp">
    <div class="toolbar">
      <button :class="{ active: state.mode === 'manual' }" :disabled="state.locked"
              @click="state.mode = 'manual'">✏️ 手动描点</button>
      <button :class="{ active: state.mode === 'auto' }" :disabled="state.locked"
              @click="state.mode = 'auto'">⚡ 自动画图</button>
      <span class="sep"></span>
      <button :disabled="state.locked" @click="doUndo" title="撤销">↶ 撤销</button>
      <button :disabled="state.locked" @click="doRedo">↷ 重做</button>
      <button :disabled="state.locked" @click="doReset">⌂ 视角</button>
      <span class="sep"></span>
      <label class="chk"><input type="checkbox" v-model="throughOrigin">过原点</label>
      <label class="chk"><input type="checkbox" v-model="state.showFitLine">拟合线</label>
      <label class="chk"><input type="checkbox" v-model="state.showErrorBars">误差棒</label>
      <label class="chk"><input type="checkbox" v-model="state.showResiduals">残差图</label>
      <span class="coord">{{ coord }}</span>
      <button class="exp" @click="doExports">📤 导出</button>
    </div>
    <div class="panes">
      <div class="canvas-box">
        <canvas ref="canvasRef"></canvas>
        <p class="tip">左键描点/拖动 · 右键删点 · Shift+点标记异常 · 滚轮缩放 · 中键平移</p>
      </div>
      <div class="table-box">
        <div class="th">
          <span>x</span><span>y</span><span>σ</span><button :disabled="state.locked" @click="addRow">＋</button>
        </div>
        <div class="rows">
          <div v-for="(p, i) in state.series[0].points" :key="i" class="tr" :class="{ out: p.outlier }">
            <input :value="p.x" @change="onCell(i, 'x', ($event.target as HTMLInputElement).value)" :disabled="state.locked">
            <input :value="p.y" @change="onCell(i, 'y', ($event.target as HTMLInputElement).value)" :disabled="state.locked">
            <input :value="p.sy ?? ''" placeholder="—" @change="onCell(i, 'sy', ($event.target as HTMLInputElement).value)" :disabled="state.locked">
            <button :disabled="state.locked" @click="delRow(i)">✕</button>
          </div>
        </div>
        <div v-if="state.fits[0] && Number.isFinite(state.fits[0].k)" class="fit-box">
          <p>y = <b>{{ state.fits[0].k.toFixed(4) }}</b>x<span v-if="!throughOrigin"> + <b>{{ state.fits[0].b.toFixed(4) }}</b></span></p>
          <p>R² = <b>{{ state.fits[0].r2.toFixed(5) }}</b>（n = {{ state.fits[0].n }}）</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gp { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
.toolbar { display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
  background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 8px; padding: 6px 10px; }
.toolbar button { background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a;
  border-radius: 5px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
.toolbar button.active { border-color: #4a90d9; background: #2b5c8f66; }
.toolbar button:disabled { opacity: 0.4; }
.toolbar .exp { background: #23402e; color: #7fe3b3; border-color: #3ecf8e; }
.sep { width: 1px; height: 18px; background: #2f2f4a; margin: 0 4px; }
.chk { font-size: 12px; color: #8a8aa0; display: flex; gap: 4px; align-items: center; }
.coord { margin-left: auto; font: 12px Consolas; color: #6c6c85; }
.panes { display: grid; grid-template-columns: 1fr 240px; gap: 8px; min-height: 0; }
.canvas-box { position: relative; background: #14142a; border: 1px solid #2f2f4a; border-radius: 10px; overflow: hidden; }
.canvas-box canvas { width: 100%; height: 100%; display: block; touch-action: none; min-height: 320px; }
.tip { position: absolute; bottom: 6px; left: 10px; font-size: 10px; color: #565675; }
.table-box { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 8px;
  display: flex; flex-direction: column; min-height: 0; }
.th { display: grid; grid-template-columns: 1fr 1fr 0.7fr 26px; gap: 4px; font-size: 11px; color: #6c6c85; margin-bottom: 4px; }
.th button { background: #23233a; color: #3ecf8e; border: none; border-radius: 4px; cursor: pointer; }
.rows { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
.tr { display: grid; grid-template-columns: 1fr 1fr 0.7fr 26px; gap: 4px; }
.tr input { background: #23233a; border: 1px solid #2f2f4a; border-radius: 4px; color: #e8e8f0;
  font: 12px Consolas; padding: 3px 5px; width: 100%; box-sizing: border-box; }
.tr.out input { border-color: #e05555; }
.tr button { background: transparent; color: #6c6c85; border: none; cursor: pointer; }
.fit-box { border-top: 1px solid #2f2f4a; margin-top: 6px; padding-top: 6px; font: 12px Consolas; color: #8a8aa0; }
.fit-box b { color: #3ecf8e; font-size: 14px; }
</style>
