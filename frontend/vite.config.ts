import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 代理规则（SRS 部署约束：浏览器只连 Java 8080 一个业务通道）
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
})
