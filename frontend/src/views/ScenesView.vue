<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { http } from '../api/http'
import type { PhysicsElementInput } from '../composables/useSimulationSocket'

interface SceneSummary {
  id: number
  type: string
  source: string
  elementCount: number
  updatedAt: string
}

const router = useRouter()
const items = ref<SceneSummary[]>([])
const total = ref(0)
const page = ref(1)
const size = 10
const toast = ref('')

async function load() {
  const data = (await http.get('/scenarios', { params: { page: page.value, size } })) as {
    total: number
    items: SceneSummary[]
  }
  items.value = data.items
  total.value = data.total
}

async function open(id: number) {
  router.push({ name: 'lab', query: { scene: id } })
}

async function remove(id: number) {
  try {
    await http.delete(`/scenarios/${id}`)
    toast.value = `场景 #${id} 已删除`
    await load()
  } catch (e) {
    toast.value = String(e)
  }
}

const pages = () => Math.max(1, Math.ceil(total.value / size))

onMounted(load)
</script>

<template>
  <main class="scenes">
    <h1>我的场景</h1>
    <p class="sub">共 {{ total }} 个 · 点击打开进入实验台</p>
    <p v-if="toast" class="toast">{{ toast }}</p>

    <table v-if="items.length">
      <thead>
        <tr><th>#</th><th>类型</th><th>来源</th><th>元件数</th><th>更新时间</th><th></th></tr>
      </thead>
      <tbody>
        <tr v-for="s in items" :key="s.id">
          <td>{{ s.id }}</td>
          <td><code>{{ s.type }}</code></td>
          <td>{{ { manual: '手动搭建', ocr: '拍照识题', template: '模板派生' }[s.source] ?? s.source }}</td>
          <td>{{ s.elementCount }}</td>
          <td>{{ s.updatedAt.replace('T', ' ').slice(0, 19) }}</td>
          <td class="ops">
            <button class="open" @click="open(s.id)">打开</button>
            <button class="del" @click="remove(s.id)">删除</button>
          </td>
        </tr>
      </tbody>
    </table>
    <p v-else class="empty">还没有场景——去 <router-link to="/lab">实验台</router-link> 拖几个元件，或从模板开始</p>

    <div class="pager" v-if="pages() > 1">
      <button :disabled="page <= 1" @click="page--; load()">上一页</button>
      <span>{{ page }} / {{ pages() }}</span>
      <button :disabled="page >= pages()" @click="page++; load()">下一页</button>
    </div>
  </main>
</template>

<style scoped>
.scenes { max-width: 900px; margin: 0 auto; padding: 24px; }
h1 { font-size: 20px; }
.sub { color: #8a8aa0; font-size: 13px; margin: 6px 0 16px; }
.toast { color: #3ecf8e; font-size: 12px; }
table { width: 100%; border-collapse: collapse; background: #1d1d33; border-radius: 10px; overflow: hidden; }
th, td { padding: 10px 14px; text-align: left; font-size: 13px; color: #b0b0cc; border-bottom: 1px solid #2a2a45; }
th { color: #6c6c85; font-size: 12px; }
td code { color: #4a90d9; background: #23233a; padding: 1px 6px; border-radius: 4px; font-size: 11px; }
td.ops { text-align: right; white-space: nowrap; }
button { border: none; border-radius: 5px; padding: 5px 12px; font-size: 12px; cursor: pointer; margin-left: 6px; }
.open { background: #2b5c8f; color: #fff; }
.del { background: #5e2430; color: #e05555; }
.empty { color: #565675; font-size: 13px; padding: 40px 0; text-align: center; }
.empty a { color: #4a90d9; }
.pager { display: flex; align-items: center; gap: 12px; justify-content: center; margin-top: 14px; color: #8a8aa0; font-size: 13px; }
.pager button { background: #23233a; color: #e8e8f0; border: 1px solid #2f2f4a; }
.pager button:disabled { opacity: 0.4; }
</style>
