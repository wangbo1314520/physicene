# 统一实验台 · RunBridge 全 case 参数透传审计（第九轮追问 1）

方法：逐 case 对照前端发送的 properties/params 与 Java 侧 ElementBehavior 实际读取的字段。

## 一、逐 case 审计表

| case | 前端发送 properties | 前端发送 params | Java 读取 properties | Java 读取 params | 判定 |
|:--|:--|:--|:--|:--|:--|
| block | mass,friction,restitution(=0) | bullet,fixRot (白名单) | mass,friction,restitution | bullet,fixRot | ✅ |
| sphere | mass,friction(mus),restitution(e) | 同上 | 同上 | 同上 | ✅ |
| particle | mass | 同上 | 同上 | 同上 | ✅ |
| cart | mass(M),friction(mu2),rest(0) | 同上 | 同上 | 同上 | ✅ |
| slope | **friction(mu)** ✓已修 | — | friction | — | ✅ **曾漏→已修** |
| ground | friction(mu) | 同上 | friction | 同上 | ✅ |
| vwall | friction(=0) | 同上 | friction | 同上 | ✅ |
| lead_in | friction(=0) | 同上 | friction | 同上 | ✅ |
| projectile_platform | friction(=0) | 同上 | friction | 同上 | ✅ |
| belt | friction(mu) | beltSpeed,beltLength,beltRadius | friction | beltSpeed,beltLength,beltRadius | ✅ |
| loop_track | — | radius,arcA0,arcA1,arcSideCode | — | radius,arcA0,arcA1,arcSideCode | ✅ |
| rope | — | jointLength | — | jointLength | ✅ |
| spring | — | jointLength,stiffness,dampingRatio | — | jointLength,stiffness,dampingRatio | ✅ |
| pulley | — | ratio | — | ratio | ✅ |
| e_region | eFieldX,eFieldY | — | eFieldX,eFieldY | — | ✅ |
| b_region | bField,bDirection | — | bField,bDirection | — | ✅ |
| point_charge | mass,charge,friction,rest | — | mass,charge,friction,restitution | — | ✅ |
| rigid_roller | mass,friction | k | mass,friction | k | ✅ |

## 二、发现与修复

| # | 缺陷 | 状态 |
|:-:|:--|:--|
| 1 | slope μ 未透传（properties:{} → Java 默认 0） | ✅ 已修（858993f） |
| 2 | bullet/fixRot 走 params 白名单（此前全丢） | ✅ 已修+闸门 |

**结论**：除已修的 2 处外，**无其他漏传**。所有 case 的 properties/params 均显式构造，与 Java 侧一一对应。

## 三、防漂移闸门

- `wireParamsVisibleInJava`（mvn）：bullet/fixRot Java 侧生效断言 ✓
- `templates-ledger`：PLAN_COUNT/TEMPLATES 计数锁定 ✓
- 17 模板物理断言：间接覆盖参数透传（若漏传则数值断言红）✓
- **缺失**：无逐 case 参数映射的自动断言——列为重审计 v2 项（前端发 → Java 收 → 断言值一致）
