<script setup lang="ts">
</script>

<template>
  <nav class="topbar">
    <router-link to="/" class="brand">PhysiScene</router-link>
    <router-link to="/sim">仿真实验</router-link>
    <router-link to="/">链路验收页</router-link>
  </nav>
  <router-view />
</template>

<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; margin: 0; }
body {
  font-family: 'Segoe UI', 'Microsoft YaHei', sans-serif;
  background: #1a1a2e;
  color: #e8e8f0;
  min-height: 100vh;
}
.topbar {
  display: flex; align-items: center; gap: 20px;
  padding: 10px 24px; background: #14142a;
  border-bottom: 1px solid #2f2f4a;
}
.topbar a { color: #8a8aa0; text-decoration: none; font-size: 14px; }
.topbar a.router-link-active, .topbar a:hover { color: #e8e8f0; }
.topbar .brand { color: #4a90d9; font-weight: 700; font-size: 16px; }
</style>
