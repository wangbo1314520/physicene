<script setup lang="ts">
/**
 * 临界分析面板（方案 §4.4 ⑦）：keyEvents 时间轴 + 内置理论对照（差值>2% 标黄）。
 * 模板级 criticalChecks（§6 SolutionTemplate）在阶段四接入；本版对 belt_common_speed/
 * spring_natural/apex_pass/detach 四类做元件参数级对照。
 */
import { computed } from 'vue'
import type { GeoElement } from '../catalog'

export interface CriticalEvent {
  t: number
  label: string
  eventType: string
  payload?: Record<string, number | string>
}

const props = defineProps<{ keyEvents: CriticalEvent[]; elements: GeoElement[] }>()

/** 去抖：相邻同类型同主体事件 0.15s 内折叠（接触抖动） */
const timeline = computed(() => {
  const out: CriticalEvent[] = []
  for (const ev of [...props.keyEvents].sort((a, b) => a.t - b.t)) {
    const last = out[out.length - 1]
    if (last && last.eventType === ev.eventType && last.label === ev.label && ev.t - last.t < 0.15) continue
    out.push(ev)
  }
  return out
})

interface Check { theory: string; actual: string; dev: number; bad: boolean }
const pct = (a: number, b: number) => (b === 0 ? Math.abs(a - b) : Math.abs(a - b) / Math.abs(b))

/** 内置理论对照：事件 payload vs 元件参数 */
function checkOf(ev: CriticalEvent): Check | null {
  const belts = props.elements.filter((e) => e.type === 'belt')
  const springs = props.elements.filter((e) => e.type === 'spring')
  const loops = props.elements.filter((e) => e.type === 'loop_track')
  const p = ev.payload ?? {}
  if (ev.eventType === 'belt_common_speed' && p.v !== undefined && belts.length === 1) {
    const vb = belts[0].params.vb ?? 3
    return { theory: `共速 v* = 带速 vb = ${vb.toFixed(2)} m/s`, actual: `实测 v = ${Number(p.v).toFixed(2)} m/s`, dev: pct(Number(p.v), vb), bad: pct(Number(p.v), vb) > 0.02 }
  }
  if (ev.eventType === 'spring_natural' && p.length !== undefined && springs.length >= 1) {
    const L0 = springs[0].params.L0 ?? 1
    return { theory: `原长 L₀ = ${L0.toFixed(2)} m`, actual: `实测 L = ${Number(p.length).toFixed(3)} m`, dev: pct(Number(p.length), L0), bad: pct(Number(p.length), L0) > 0.02 }
  }
  if (ev.eventType === 'apex_pass' && p.y !== undefined && loops.length === 1) {
    // payload.y = 球心过顶时刻 y = 圆心 y + (R − r球)；builder 球半径 0.5
    const hasSphere = props.elements.some((e) => e.type === 'sphere' || e.type === 'particle')
    const top = loops[0].position.y + (loops[0].params.radius ?? 1) - (hasSphere ? 0.5 : 0)
    return { theory: `球心过顶 y = ${top.toFixed(2)} m（圆心+R−r）`, actual: `实测 y = ${Number(p.y).toFixed(2)} m`, dev: pct(Number(p.y), top), bad: pct(Number(p.y), top) > 0.02 * (loops[0].params.radius ?? 1) }
  }
  if (ev.eventType === 'detach' && p.theta !== undefined) {
    return { theory: '内轨脱离临界：顶点 v = √(gR)（低于此值此前已脱离）', actual: `脱离角 θ = ${Number(p.theta).toFixed(1)}°`, dev: 0, bad: false }
  }
  return null
}

const TYPE_LABEL: Record<string, string> = {
  belt_common_speed: '带共速', common_speed: '共速', apex_pass: '过顶点', detach: '脱离轨道',
  rope_taut: '绳绷紧', rope_slack: '绳松弛', spring_natural: '弹簧原长',
  land_surface: '落面', leave_surface: '离面', collision: '碰撞',
}
</script>

<template>
  <div class="crit" v-if="timeline.length">
    <h4>🎯 临界事件 <small>{{ timeline.length }} 条（含理论对照，偏差&gt;2% 标黄）</small></h4>
    <div class="rows">
      <div v-for="(ev, i) in timeline" :key="i" class="row">
        <span class="tt">{{ ev.t.toFixed(2) }}s</span>
        <span class="chip" :class="ev.eventType">{{ TYPE_LABEL[ev.eventType] ?? ev.eventType }}</span>
        <span class="lb">{{ ev.label }}</span>
        <template v-if="checkOf(ev)">
          <span class="cmp" :class="{ bad: checkOf(ev)!.bad }">
            {{ checkOf(ev)!.theory }} ｜ {{ checkOf(ev)!.actual }}（偏差 {{ (checkOf(ev)!.dev * 100).toFixed(1) }}%）
          </span>
        </template>
      </div>
    </div>
  </div>
  <!-- 2026-10-06：根类名去掉 empty——与 BuilderView 作用域 .empty（画布空态提示：
       position:absolute + left/right:20 + top:45%）碰撞。Vue scoped 的子组件根节点
       继承父作用域 data-v 属性，父规则命中本面板 → 编辑态整页横带盖住画布中心
       （有元件未运行时必现；BugA/B 验证时的"球消失/单轮"皆此遮挡） -->
  <div class="crit crit-empty" v-else-if="elements.length">
    <h4>🎯 临界事件</h4>
    <p class="hint">运行后这里列出关键时刻（共速/过顶/脱离/绷紧/原长…）并与理论对照</p>
  </div>
</template>

<style scoped>
.crit { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 10px; }
.crit h4 { font-size: 13px; color: #b0b0cc; margin-bottom: 6px; } .crit h4 small { color: #565675; font-weight: normal; }
.rows { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; align-items: baseline; gap: 8px; font-size: 11px; flex-wrap: wrap; }
.tt { color: #3ecf8e; font-family: Consolas, monospace; min-width: 46px; }
.chip { padding: 0 6px; border-radius: 4px; background: #23233a; color: #8a8aa0; font-size: 10px; white-space: nowrap; }
.chip.belt_common_speed, .chip.common_speed { color: #4a90d9; } .chip.apex_pass, .chip.detach { color: #b06ce6; }
.chip.rope_taut, .chip.spring_natural { color: #F5C542; } .chip.collision { color: #E05555; }
.lb { color: #b0b0cc; }
.cmp { color: #6c6c85; } .cmp.bad { color: #F5C542; font-weight: 600; }
.hint { color: #565675; font-size: 11px; line-height: 1.5; }
</style>
