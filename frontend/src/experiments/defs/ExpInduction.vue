<script setup lang="ts">
/** 3D 演示（上）+ 自由接线操作舞台（下）；多根节点，record 事件手动转发给 ExperimentShell */
import Exp3D from './Exp3D.vue'
import InductionCircuit from './apparatus/InductionCircuit.vue'
defineEmits<{ (e: 'record', data: unknown): void }>()
</script>
<template>
  <div class="stack">
    <Exp3D mode="induction" />
    <InductionCircuit mode="condition" @record="$emit('record', $event)" />
  </div>
</template>
<style scoped>
.stack { display: flex; flex-direction: column; gap: 14px; }
</style>
