import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 代理规则（SRS 部署约束：浏览器只连 Java 8080 一个业务通道）
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Windows 外置盘（E:）文件监听不可靠，曾致模块缓存不刷新（本周 4 次事故），轮询根治
    watch: { usePolling: true, interval: 400 },
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
