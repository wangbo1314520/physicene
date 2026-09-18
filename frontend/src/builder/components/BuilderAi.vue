<script setup lang="ts">
/**
 * 统一搭建台 · AI 助手（规则10 薄包装）：复用 sandbox/SandboxAi.vue 的四模式问答/讲解框架，
 * 真 AI 通道不变（experiments/data/aiAgent → /api/v1/agent/chat）。
 * 适配层：GeoElement → sandbox Placed；识别标题由 EngineAnalyzer 提供（阶段三⑥ 接入前用引擎占位）。
 * 阶段四 §4.5 将在此升级上下文（识别标签 + 耦合链 + keyEvents + 通道尾部 + 运行复盘按钮）。
 */
import { computed } from 'vue'
import SandboxAi from '../../sandbox/SandboxAi.vue'
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

const recognition = computed<Recognition>(() => ({
  family: '统一搭建台',
  title: props.enginesTitle ?? (props.elements.length ? '自由几何场景' : '空画布'),
  target: null,
  params: {},
  confidence: props.elements.length ? 0.75 : 0,
  used: [],
  missing: [],
  notes: props.notes ?? [],
}))
</script>

<template>
  <SandboxAi :recognition="recognition" :elements="placed" :records="records" :scene-name="sceneName" />
</template>
