import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '../api/auth'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: () => import('../views/LoginView.vue') },
    {
      path: '/lab',
      name: 'lab',
      component: () => import('../views/LabView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/scenes',
      name: 'scenes',
      component: () => import('../views/ScenesView.vue'),
      meta: { requiresAuth: true },
    },
    { path: '/sim', name: 'sim', component: () => import('../views/SimView.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

// 路由守卫（SRS 4.6：未登录跳 /login）
router.beforeEach((to) => {
  if (to.meta.requiresAuth && !getToken()) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
})

export default router
