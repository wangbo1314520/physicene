<script setup lang="ts">
/**
 * 统一搭建台 · AI 助手（规则10 薄包装）：复用 sandbox/SandboxAi.vue 的四模式问答/讲解框架，
 * 真 AI 通道不变（experiments/data/aiAgent → /api/v1/agent/chat）。
 * 适配层：GeoElement → sandbox Placed；识别标题由 EngineAnalyzer 提供（阶段三⑥ 接入前用引擎占位）。
 * 阶段四 §4.5 将在此升级上下文（识别标签 + 耦合链 + keyEvents + 通道尾部 + 运行复盘按钮）。
 */
import { computed } from 'vue'
import SandboxAi from '../../sandbox/SandboxAi.vue'
import { recognize } from '../../sandbox/recognizer'
import type { Recognition, Placed } from '../../sandbox/recognizer'
import type { RunRecord } from '../../sandbox/SandboxData.vue'
import type { GeoElement } from '../catalog'

const props = defineProps<{
  elements: GeoElement[]
  records: RunRecord[]
  sceneName: string
  /** EngineAnalyzer 产物标题（如「力学·dyn4j + 电路·MNA（耦合）」） */
  enginesTitle?: string
  notes?: string[]
}>()

const placed = computed<Placed[]>(() =>
  props.elements.map((e) => ({ id: e.id, type: e.type, x: e.position.x, y: e.position.y, params: e.params, links: e.links.map((l) => l.toId) })))

// 2B（2026-10-11）：真识别器替换 mock——五件套上下文齐备：
// elements（placed 映射）+ recognition（真规则识别：题型/缺件/notes）+ 引擎路由（enginesTitle）
// + 告警（notes）+ 运行读数/事件（records，SandboxAi.context 已打包）
const recognition = computed<Recognition>(() => {
  if (!props.elements.length) {
    return { family: '统一搭建台', title: '空画布', target: null, params: {}, confidence: 0, used: [], missing: [], notes: [] }
  }
  const r = recognize(placed.value)
  const extra: string[] = []
  if (props.enginesTitle) extra.push(`引擎路由：${props.enginesTitle}`)
  for (const n of props.notes ?? []) extra.push(`⚠ ${n}`)
  return { ...r, notes: [...r.notes, ...extra] }
})
</script>

<template>
  <SandboxAi :recognition="recognition" :elements="placed" :records="records" :scene-name="sceneName" />
</template>
