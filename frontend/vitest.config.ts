import { defineConfig } from 'vitest/config'

// 纯函数单测（fit / TapeSampler / FieldEngine / merge），无 DOM 依赖，node 环境即可
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
