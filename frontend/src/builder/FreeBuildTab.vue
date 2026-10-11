<script setup lang="ts">
/**
 * Step2·2.4：单页入口——/lab 路由直接指向本组件（LabView Tab 壳已移除）。
 * ?scene=N 深链：从后端加载场景。?tab= 兼容：所有值均为别名（统一页）。
 */
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import BuilderView from './BuilderView.vue'

const route = useRoute()

onMounted(async () => {
  // ?scene=N → 从后端加载场景到画布
  const qid = route.query.scene
  if (qid) {
    try {
      const { http } = await import('../api/http')
      const resp = (await http.get(`/scenarios/${Number(qid)}`)) as { elements: any[]; name?: string }
      // 通过 workspace store 写入（BuilderView 同源）
      const { workspace, wsRestore } = await import('./workspace')
      if (resp.elements?.length) {
        wsRestore(JSON.stringify(resp.elements))
      }
    } catch { /* 深链场景加载失败不阻断 */ }
  }
  // ?tab= 兼容：lab/free/build 均为别名（统一单页，不区分）
})
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
