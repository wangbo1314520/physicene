import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// 纯函数单测（fit / TapeSampler / FieldEngine / merge）无 DOM 依赖，node 环境即可；
// B12 对账测试需导入实验注册表（含 .vue 组件），故加载 Vue 插件（仅编译，不挂载）
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    css: false,
  },
})
