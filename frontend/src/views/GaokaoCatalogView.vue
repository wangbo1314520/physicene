<script setup lang="ts">
/** 高考 / 竞赛题层目录（方案书 v3.1 §7.1 的 50 个场景；与教材实验库分离，不计入 55 卡台账） */
import { computed } from 'vue'
import { GAOKAO, groupedByChapter } from '../experiments/registry'

const groups = groupedByChapter(GAOKAO)
const available = computed(() => GAOKAO.filter((e) => e.available).length)
const byPrio = (p: string) => GAOKAO.filter((e) => e.tags?.includes(p))
const prioText = computed(() => ['P0', 'P1', 'P2'].map((p) => `${p} ${byPrio(p).filter((e) => e.available).length}/${byPrio(p).length}`).join(' · '))
</script>

<template>
  <main class="catalog">
    <h1>高考 · 竞赛题场景</h1>
    <p class="sub">搭场景、调参数、观察多过程、找临界，AI 讲思路与易错点。共 {{ GAOKAO.length }} 个场景（力学综合 16 · 电磁综合 20 · 热学 4 · 光学振动波 6 · 近代物理 5 · 竞赛扩展 5）· 已开放 {{ available }}（{{ prioText }}），其余按 P0→P1→P2 逐个接入。</p>
    <p class="note">与教材实验层的区别：教材实验层只给阶梯提示不给答案；这里按“过程—受力—规律—临界—公式—易错—变式”讲题（AI 解题讲解器 B10 上线后开放）。</p>

    <section v-for="(chapters, book) in groups" :key="book" class="book">
      <h2>{{ book }}</h2>
      <div class="grid">
        <template v-for="(exps, chapter) in chapters" :key="chapter">
          <router-link v-for="e in exps" :key="e.id" :to="e.available ? `/exp/${e.id}` : ''" class="card" :class="{ off: !e.available }" @click.prevent="!e.available">
            <div class="row1">
              <span class="badge" :class="e.dimension === '3D' ? 'b3' : 'b25'">纯{{ e.dimension }}</span>
              <span class="chapter">{{ chapter }}</span>
              <span v-if="!e.available" class="lock">🔒 {{ e.batch }}</span>
              <span v-else class="ok">可做</span>
            </div>
            <p class="name">{{ e.name }}</p>
            <p class="tags"><span v-for="t in e.tags" :key="t">{{ t }}</span></p>
          </router-link>
        </template>
      </div>
    </section>
  </main>
</template>

<style scoped>
.catalog { max-width: 1200px; margin: 0 auto; padding: 20px 24px 60px; }
h1 { font-size: 22px; }
.sub { color: #8a8aa0; font-size: 13px; margin: 6px 0 8px; }
.note { color: #6c6c85; font-size: 12px; margin-bottom: 18px; line-height: 1.6; }
.book { margin-bottom: 26px; }
h2 { font-size: 16px; color: #b0b0cc; margin-bottom: 10px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(270px, 1fr)); gap: 10px; }
.card { background: #1d1d33; border: 1px solid #2f2f4a; border-radius: 10px; padding: 12px 14px; text-decoration: none; display: block; }
.card:hover { border-color: #F5C542; }
.card.off { opacity: 0.55; cursor: not-allowed; }
.row1 { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.badge { padding: 1px 8px; border-radius: 4px; font-size: 11px; }
.badge.b25 { background: #1d2b3a; color: #4a90d9; }
.badge.b3 { background: #33183a; color: #b06ce6; }
.chapter { color: #6c6c85; font-size: 11px; }
.lock { color: #6c6c85; font-size: 11px; margin-left: auto; }
.ok { color: #3ecf8e; font-size: 11px; margin-left: auto; }
.name { color: #e8e8f0; font-size: 14px; }
.tags { margin-top: 6px; display: flex; flex-wrap: wrap; gap: 4px; }
.tags span { background: #14142a; border: 1px solid #2f2f4a; color: #8a8aa0; border-radius: 4px; padding: 1px 6px; font-size: 10px; }
</style>
