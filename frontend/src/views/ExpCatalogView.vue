<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { EXPERIMENTS, groupedByChapter } from '../experiments/registry'

const groups = groupedByChapter()
const availableCount = ref(0)
onMounted(() => {
  const all = Object.values(groups).flatMap((c) => Object.values(c)).flat()
  availableCount.value = all.filter((e) => e.available).length
})
</script>

<template>
  <main class="catalog">
    <h1>实验库</h1>
    <p class="sub">人教版 6 册教材实验 {{ EXPERIMENTS.length }} 个（规划 40 + 先行版 3）· {{ availableCount }} 个已开放，其余按批次陆续上线</p>

    <section v-for="(chapters, book) in groups" :key="book" class="book">
      <h2>{{ book }}</h2>
      <template v-for="(exps, chapter) in chapters" :key="chapter">
        <h3>{{ chapter }}</h3>
        <div class="grid">
          <router-link v-for="e in exps" :key="e.id" :to="`/exp/${e.id}`" class="card" :class="{ off: !e.available }">
            <div class="row1">
              <span class="badge" :class="e.dimension === '3D' ? 'b3' : e.dimension === '2D' ? 'b2' : 'b25'">{{ e.dimension }}</span>
              <span v-if="!e.available" class="lock">🔒 {{ e.batch }}</span>
              <span v-else class="ok">可做</span>
            </div>
            <p class="name">{{ e.name }}</p>
            <p class="summary">{{ e.summary }}</p>
          </router-link>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.catalog { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; }
h1 { font-size: 22px; }
.sub { color: #8a8aa0; font-size: 13px; margin: 6px 0 18px; }
.book { margin-bottom: 26px; }
h2 { font-size: 16px; color: #4a90d9; margin: 14px 0 4px; }
h3 { font-size: 13px; color: #6c6c85; margin: 12px 0 8px; font-weight: 500; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.card { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 12px 14px;
  text-decoration: none; display: block; transition: border-color 0.2s; }
.card:hover { border-color: #4a90d9; }
.card.off { opacity: 0.55; }
.row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.badge { padding: 1px 8px; border-radius: 4px; font-size: 11px; }
.badge.b2 { background: #1d3a2b; color: #3ecf8e; }
.badge.b25 { background: #1d2b3a; color: #4a90d9; }
.badge.b3 { background: #33183a; color: #b06ce6; }
.lock { color: #6c6c85; font-size: 11px; margin-left: auto; }
.ok { color: #3ecf8e; font-size: 11px; margin-left: auto; }
.name { color: #e8e8f0; font-size: 14px; }
.summary { color: #6c6c85; font-size: 11px; margin-top: 4px; }
</style>
