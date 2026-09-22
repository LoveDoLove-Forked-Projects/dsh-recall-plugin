# 启动预热 IIFE 的未捕获拒绝加固

> 上游文档：[improvement-plan.md](../improvement-plan.md) ｜ 状态：待实施

## 背景（为什么做）

M5 冒烟（dsh 0.1.7 适配批次）在装配门禁与 WSL 实弹中观察到：插件 `apply` 末尾的启动预热 IIFE 是
fire-and-forget（外部无法 await），若 fiber 在预热完成前停用（卸载/HMR/门禁 dispose），预热内部的
`ctx.sessions` 等服务访问会抛 `cannot get required service ... in inactive context`，变成**进程级未捕获拒绝**
（`triggerUncaughtException`，可打断宿主退出流程）。属既有行为，非 0.1.7 引入；verify-host 侧已用
「卸载前留一拍」规避（`scripts/verify-host.mjs` 新面 pass），插件侧未加固。

## 目标

预热 IIFE 的任何失败都不得产生未捕获拒绝：

1. IIFE 整体 try/catch——失败走 `recordError`（进「最近错误」）+ `console.error` 留诊断，不改变预热语义；
2. 不吞业务信号：catch 里保留错误原文（与 `recall settings namespace skipped` 同款记录风格）。

## 方案取舍

- **整体包裹（推荐）**：改动最小（一层 try/catch），失败可见、可诊断；
- 逐访问点守卫短路：需要暴露 fiber 停用状态判断，复杂度高、收益低（预热失败本就不影响主链路）。

## 改动落点

| 文件 | 改动 | 行数预算 |
|---|---|---|
| `src/host/index.ts` | 预热 IIFE 整体 try/catch + recordError | 当前 328 → ~334 |

## 验收

1. `npm run typecheck && npm test` 全绿（新增 1 例：dispose 后触发预热路径不产生未捕获拒绝——经
   `process.on('unhandledRejection')` 探针断言）；
2. `npm run verify:host` 在**移除**「卸载前留一拍」等待后仍干净退出（门禁侧规避手段可顺势删除）；
3. 真机卸载/重载插件（HMR）时宿主日志无未捕获拒绝。
