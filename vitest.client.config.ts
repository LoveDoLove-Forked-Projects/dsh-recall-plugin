// client 组件测试配置（A1）：与 tests/unit 的 node 环境隔离——jsdom 提供
// document/localStorage 等浏览器全局（logger 开关、clipboard、DOM 渲染都
// 依赖它）。include 只收 tests/client/，unit 与 probe 各自走自己的入口，
// 三条测试链互不串扰（CI 三家都跑）。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/client/**/*.test.ts'],
  },
})