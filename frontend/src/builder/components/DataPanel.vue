<script setup lang="ts">
/**
 * 统一搭建台 · 数据面板（规则10 薄包装）：复用 sandbox/SandboxData.vue 的记录表/坐标纸/CSV。
 * 阶段三⑤ RunBridge 接入后在此扩通道页签（力学/电路/热学/探针），SandboxData 本体不改。
 */
import SandboxData, { type RunRecord } from '../../sandbox/SandboxData.vue'

defineProps<{ records: RunRecord[] }>()
const emit = defineEmits<{ (e: 'clear'): void }>()
</script>

<template>
  <SandboxData :records="records" @clear="emit('clear')" />
</template>
