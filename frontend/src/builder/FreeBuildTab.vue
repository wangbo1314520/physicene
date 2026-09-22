<script setup lang="ts">
/**
 * F1.1 薄包装（规则 10）：自由搭建 Tab 内嵌 BuilderView 整页组件——共享同一份 builder/ 代码非复制。
 * LabView 顶栏 Tab 切换时 v-if 挂载/卸载（两套时间轴/面板互不共存）。
 */
import BuilderView from './BuilderView.vue'
</script>

<template>
  <div class="free-build-tab">
    <BuilderView />
  </div>
</template>

<style scoped>
.free-build-tab {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.free-build-tab :deep(.builder) {
  flex: 1;
  min-height: 0;
}
</style>
