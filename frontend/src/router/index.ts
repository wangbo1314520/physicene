import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/sim',
      name: 'sim',
      component: () => import('../views/SimView.vue'),
    },
  ],
})

export default router
