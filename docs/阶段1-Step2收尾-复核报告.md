# 阶段 1 · Step 2 收尾复核报告（2026-10-11）

任务包阶段 1（2.2 功能级 E2E / 2.3 保存合一+深链 / 2.4 路由清理 / 2.5 E2E 重写）主体
已于上一任务包完成（ba16d14 + 补遗 ba81ce3 + b61ca8c）。本日按新包 DoD 逐项复核，并修复
复核中发现的**深链丢连线真 bug**（牵出保存/运行双轨契约补全——原登记为阶段 2 高优，因属
2.3 完整性提前落地）。

## DoD 复核结论：**全过**

| DoD 项 | 状态 | 证据 |
|---|---|---|
| 5 子任务全绿 | ✅ | 2.1-2.5 见 docs/Step2-完成报告.md（+补遗 6 节） |
| 功能级 E2E 全过 | ✅ | panel-functional 11/11（AI 真回复 689 字/曲线渲染/回放拖动/OCR 加件——非"存在性"断言） |
| 防减少表 23 项 | ✅ | Step2 报告 §2（逐项打勾） |
| 全量回归绿 | ✅ | 本日全套重跑：builder-check 69/69 · free-build 14/14 · lab 15/15 · f13 14/14 · reconnect · stress 10 学生 · p0/f11/celestial/tab-sync/verify-resize/p1-11cards/p2/p11/p21/smoke/payload/probe* · vitest 373/373 |
| docs/Step2-完成报告.md | ✅ | ba16d14 + 补遗（含 2.5 口径不实更正） |

## 本轮新修：保存/运行双轨契约（深链复核暴露）

**Bug**：`?scene=N` 深链加载云端场景后页面崩溃（`e.links is not iterable`）。
**根因**：保存链路经 `List<PhysicsElement>` typed 反序列化——该类型无 `links` 字段，
连线在 DB 往返中静默丢失；且 L1 物理白名单校验使含 ground/block 的自搭场景保存必 400
（→无 sceneId→无 recordId→回放不可用）。
**修法（Java + 前端）**：
- SceneService：请求 DTO 改 `List<Map>`，**存原始 Geo JSON**；读接口回原始（links 保留）；
  草稿仅结构校验（id/type/数量≤500），物理白名单校验留在 run 时
- SimulationController：带 sceneId 的 run 若请求含映射后 elements 则优先（sceneId 只担
  record 归属/回放）；useSimulationSocket.run 始终同发 elements+config
- workspace 增 normalizeGeoElements（存量无 links 场景加载兜底）；loadFromBackend 接入

**验证（全链路）**：Geo 保存 200（#112，含 ground/block/sensor 连线）→ GET links 原样 →
深链载入 3 件零页面错误 → 双轨运行 recordId=161 → 回放 121 帧（block x=0.05/vx=3 物理
正确）；?tab= free/lab/build 三别名通过。
**回归**：panel-functional 11/11 · lab 15/15 · free-build 14/14 · smoke · phase-shift 7/7 ·
vue-tsc 0 错 · vitest 373/373。

## 遗留登记

1. **Java 物理单测 3 项存量红**（与本轮改动无关，stash 复核证实）：
   `UnifyPhase35Test.loopGateOutsidePassesUnaffected`（圈外球末 x=0.16 未直线飞离）、
   `UnifyPhase1Test.loopTrackDetachAngle`、`UnifyPhase1Test.movablePulleyVelocityRatio`
   （动滑轮 |vA/vB|=1.21 vs 理论 2.0）——圆轨道/动滑轮物理疑有 B8 时代回归，与 builder-redo
   E4 探针、walkthrough gap 现象同域；建议阶段 4（性能+边界）前专项排查
2. 教材 AI"不直接给答案"口径矛盾（见阶段 0 报告观察项 2）——阶段 2 开工前需用户裁决
3. 跨语言检索弱（英文查询 0 引用）——阶段 2 可选优化
