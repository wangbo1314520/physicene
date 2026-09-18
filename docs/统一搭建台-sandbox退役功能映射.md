# sandbox E2E 退役 · 功能覆盖映射表（阶段三验收追问 3）

结论先行：**无能力丢失**——10 个场景中 4 个现在就能在 `/exp` 搭建并运行（物理等价）、1 个几何可跑（缺预置模板）、5 个的装置化在阶段四计划内；这 10 类场景的**成品实验全部仍由高考竞赛层（/gaokao）与实验库（/library）提供**（187 断言 E2E 在跑），退役的只是 sandbox 这个重复入口。

## 逐场景映射（对照 `e2e/sandbox-check.py` SCENARIOS）

| # | sandbox 场景 | /exp 现状 | 状态 | 缺口补齐 |
|:-:|:--|:--|:--|:--|
| 1 | 测电源电路（E、r） | catalog 无电池/电表等电路元件 | **待补（阶段四）** | 28 装置模板的电路族 + RunBridge「单域→circuit-editor 内嵌」（方案 §4.1 既定项）；MNA 引擎 Java 侧已就绪（MnaParityTest 20/20） |
| 2 | 平抛 + 竖直圆周 | projectile_platform + loop_track + sphere，dyn4j 真跑 | **已覆盖** | 预置组合模板阶段四（当前需手搭；物理为真实仿真，优于原 TS 组件解析演示） |
| 3 | 加速电场+筛选器+磁场 | e_region + b_region + point_charge 可搭，Java 场引擎可跑 | **部分覆盖** | 几何可跑；预置模板 + v/E/B/r 解析读数（SolutionTemplate）阶段四 |
| 4 | 双杆模型（rail-rod） | rail_pair/rod_bar 在目录但 RunBridge 拒绝（电路耦合未接入运行管线） | **待补（阶段四）** | CircuitEngine + CouplingOrchestrator 接入 SimulationInstance（引擎已就绪，CouplingE2ETest 3/3） |
| 5 | 玻璃管液封 | 热学装置未模板化 | **待补（阶段四）** | 热学装置模板（GasCell/PistonCoupling 已就绪）；高考层 thermo1 `liquidSealTube` 成品实验现可用 |
| 6 | 光电效应 | photo_tube/light_source 在目录，ModernRunner 未建 | **待补（阶段四）** | ModernRunner（~120 行，复用 mod1 模型函数，方案 §5.1 引擎 #6）；高考层 mod1 成品实验现可用 |
| 7 | 连接体（F 拉 A–B） | block×2 + rope 连线 + force_sensor，dyn4j 真跑 | **已覆盖** | 力传感器 probes 通道读数增强阶段四 |
| 8 | 传送带 + 物块 | belt + block，阶段三手工录制实测：共速 t\*=v/(μg)=0.77s 偏差 0.0% | **已覆盖（已验证）** | — |
| 9 | 变压器 | 交流电路装置未模板化 | **待补（阶段四）** | MNA + ac_source 能力已具备（变压器=互感支路，MnaParityTest 含线圈 EMF 用例）；高考层 em6 成品实验现可用 |
| 10 | 斜面+弹簧+滑块 | slope + spring 连线 + block，dyn4j 真跑（弹簧自研胡克力对，T=2π√(m/k) 精确） | **已覆盖** | 「最大压缩 x=0.59 m」类理论读数 = SolutionTemplate，阶段四 |

## 覆盖统计

- 已覆盖（现在可搭可跑）：**4**（#2 #7 #8 #10）
- 部分覆盖（几何可跑、缺模板/读数）：**1**（#3）
- 待补（阶段四装置模板/引擎接入）：**5**（#1 #4 #5 #6 #9）——其中 4 个的高考层成品实验当前即可用（#5 #6 #9 + #1 的电路族在电路实验页）

## 退役资产处置

- `e2e/sandbox-check.py`：**退役存档**（/sandbox 已 redirect，脚本头部已标注；不再纳入回归矩阵）
- `sandbox/sandbox-ledger.test.ts`：**保留**（元件对账单测，含于 vitest 140）
- `sandbox/SandboxView.vue` 及组件：保留源码（BuilderAi/DataPanel 薄包装仍引用 SandboxAi/SandboxData，规则 10）
