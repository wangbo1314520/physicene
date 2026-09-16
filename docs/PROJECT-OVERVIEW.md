# PhysiScene 项目总览（供新会话继续使用）

> 生成日期：2026-09-15　生成方式：B0-B8 实验库全批次完成后的全面总结
> 用途：新开对话或压缩上下文后，作为项目状态的唯一权威参考

---

## 一、项目是什么

**PhysiScene = AI Agent 智能物理实验平台**（本科毕业设计）

**核心初衷（2026-09-17 用户更正，权威口径）**：帮助学习。老师可以自由搭建或在库里找到实验，投屏上课讲解；学生用同一套东西自学、做题验证、探究。不会的、有疑问的、要解题思路的，**由 AI 直接解答**（不设“不给答案”的限制）。**没有“老师批阅/考试评分”这条线**——原 `/teacher-review` 教师批阅页、实验页“引导/自由/考试”三模式与考试计时评分均已删除；提交实验后的反馈由 AI 即时生成。

三大产品线：
1. **实验库**（`/exp`）——按教材章节分组的 55 个结构化实验，带学习路径（步骤只提示不阻塞）+ 真 AI 助教（直接讲解 / 逐级提示 / 分析数据 / 问答）+ 数据记录
2. **高考·竞赛题场景**（`/gaokao`）——v3.1 清单 65 卡，多过程时间轴 + AI 解题讲解器（提示 / 完整 / 变式）
3. **自由搭建实验**（`/sandbox`，B13 沙盒）——89 项元件自由拖拽、连线、设参，场景识别器把组合映射到 62 个场景求解器 / 电路引擎 / 刚体沙盒并内嵌运行，数据面板 + 坐标纸 + AI 助手；`/lab` 为刚体实验台（Java dyn4j，任意方块/小球/斜面/场组合）

## 二、技术栈

| 层 | 技术 |
|:---|:---|
| 前端 | Vue 3.5 + TypeScript + Vite 8 + Pinia + vue-router |
| 渲染 | Three.js 0.186（2.5D 正视/立体 + 3D OrbitControls）+ Canvas 2D（自研引擎） |
| 图表 | ECharts |
| Java 后端 | Spring Boot 4.1.0 + JDK 17 + Maven + OpenFeign + Resilience4j |
| 物理引擎 | dyn4j 5.0.2（2D）+ 自研 RK4（3D 场力） |
| Python AI | FastAPI + LangChain + DeepSeek API + PaddleOCR + bge-m3 + Chroma |
| 数据库 | MySQL 8.0（本机，root/123456）+ Chroma（向量，1300 片段教材库） |
| 部署 | Docker Compose 占位（尚未容器化） |

## 三、代码仓库结构

```
E:\Program\physicene\
├── java-backend/src/main/java/com/physicene/backend/
│   ├── common/     # ApiResponse/ErrorCode/全局异常/JWT/拦截器/枚举转换器
│   ├── scene/      # 场景 CRUD（SceneService/SceneController/SceneRepository）
│   ├── physics/    # 物理引擎（engine/element/template/websocket/model/record/controller）
│   ├── ai/         # AI 代理（AiServiceClient/AiProxyController/OcrController）
│   └── exp/        # 实验库后端（entity/repository/service/controller）
├── python-ai-service/src/physicene_ai/
│   ├── api/        # routes_agent/routes_ocr/routes_health
│   ├── core/       # agent_engine/intent_classifier/llm_client/rag_retriever/ocr_service/event_parser
│   ├── tools/      # 10 个 Agent 工具（JavaClient 调 Java）
│   └── models/     # Pydantic 契约（camelCase 对齐 Java）
├── frontend/src/
│   ├── views/      # LabView/SimView/LoginView/ScenesView/ExpCatalogView/
│   │               # MyExperimentsView/TeacherReviewView/HomeView
│   ├── experiments/  # ★ 实验库全部代码
│   │   ├── core/       # types.ts/processedData.ts/stepLibrary.ts/merge.ts
│   │   ├── registry/   # index.ts（55 实验）
│   │   ├── runner/     # StepEngine.ts
│   │   ├── data/       # api.ts（5 接口）/AutosaveManager
│   │   ├── framework/  # ExperimentShell/GraphPaper/AiTutor/StepBar
│   │   ├── renderers/  # canvas2d/(Engine/CoordinatePaper/fit/layers)
│   │   │               # canvas3d/(FieldEngine) sim25d/(TapeSampler/simulators)
│   │   └── defs/       # 52 个实验组件（每实验专用仪器交互）+ apparatus/（LabPanel 面板壳、circuit 电路绘制原语、ConstraintStage/HookePhotoStage 仪器舞台）
│   ├── sim/       # threeScene.ts（维度分档渲染器）+ fieldLines3d.ts（3D 电/磁场线）
│   └── api/       # http.ts/auth.ts
├── scripts/       # init-db.sql/migrations/backup-db.bat
└── docs/          # 需求/设计/开发日志/各批次验收报告/B0-B8
```

## 四、数据库（physicene 库，MySQL 8.0 本机 root/123456）

### 核心表（13+2=15 张）

| 表 | 用途 |
|:---|:---|
| user | 用户（student/teacher/admin，BCrypt） |
| experiment_scenario | 场景（scene_data JSON 列） |
| experiment_record | 仿真记录（sim_result LONGTEXT JSON） |
| report | 报告（record_id 或 session_id 二选一挂接） |
| experiment_session | ★ 实验库会话（step_state/raw_data/processed_data/ai_feedback/@Version） |
| student_profile / conversation / message / teaching_strategy | 画像/对话/策略 |
| token_usage / system_token_usage / operation_log / audit_log / ocr_type_mapping | 辅助 |

### 迁移脚本

- `scripts/init-db.sql` — 全量建库（含 experiment_session）
- `scripts/migrations/V2__experiment_session.sql` — 增量迁移
- `scripts/migrations/V2__rollback.sql` — 回滚

## 五、API 接口清单

### 实验台接口（JWT 鉴权）

| 方法 | 路径 | 功能 |
|:---|:---|:---|
| POST | /api/auth/register | 注册 |
| POST | /api/auth/login | 登录 |
| POST | /api/scenarios | 创建场景 |
| GET/PUT/DELETE | /api/scenarios/{id} | 场景 CRUD |
| GET | /api/templates | 模板列表 |
| POST | /api/templates/{id}/load | 加载模板 |
| POST | /api/simulations/run | 运行仿真（inline 或 sceneId） |
| GET | /api/records/{id} | 回放（分页帧） |
| POST | /api/ocr/upload | 拍照识题 |
| POST | /api/scenarios/from-preview | 确认 OCR 场景 |
| POST | /api/v1/agent/chat | AI 对话（Feign→Python） |
| WS | /ws/simulation/{simId}?token= | 30fps 仿真推帧 |

### 实验库接口（B0 5 个，JWT 鉴权）

| 方法 | 路径 | 功能 |
|:---|:---|:---|
| POST | /api/experiments/sessions | 开始/续做实验 |
| PUT | /api/experiments/sessions/{id} | 自动保存（乐观锁 409） |
| POST | /api/experiments/sessions/{id}/submit | 提交（挂 Report） |
| GET | /api/experiments/sessions | 我的实验列表 |
| GET | /api/experiments/sessions/class | 教师统计（403 拦截学生） |

### 错误码体系（SRS §6.4）

0 成功 / 1001 参数 / 1002 鉴权 / 1003 越权 / 1004 不存在 / 1005 冲突 / 1006 限流 / 2001 内部 / 2002 外部 / 2003 超时 / 2004 降级

## 六、实验库架构

### 55 个实验

| 批次 | 数量 | 引擎 | 代表实验 |
|:--|:--:|:---|:---|
| B0 | 5 | 2.5D | 惯性/a=F/m/机械能/库仑斥/吸 |
| B1 | 7 | 2D | 测电源/胡克/光电/力合成/平抛/双缝/油膜 |
| B2 | 12 | 2.5D | 打点×3/单摆/圆锥摆/牛顿管/气体/功速/作用反/动量守恒/多用电表/向心力 |
| B3 | 9 | 3D | 感应×3/安培力/洛伦兹/粒子磁场/变压器/布朗/α散射 |
| B8 | 22 | 2D | 第三阶段替代(12) + 补做锁定(10) |

### 40 规划实验 100% 覆盖

- 第一阶段 22/22 ✅
- 第二阶段 18/18 ✅
- 权威对账表：`frontend/src/experiments/docs/b8-closure/reconciliation-v2.1.md`（v2.1 勘误定版，取代 v2.0）

### 核心引擎

| 引擎 | 文件 | 功能 |
|:---|:---|:---|
| Canvas2DEngine | renderers/canvas2d/Engine.ts | 图层/变换/undo/pointer(鼠标+触屏+笔)/导出 |
| CoordinatePaper | renderers/canvas2d/CoordinatePaper.ts | 9+4 项完美版坐标纸 |
| fit | renderers/canvas2d/fit.ts | 最小二乘（普通/过原点/σ加权/异常剔除）单测 12/12 |
| TapeSampler | renderers/sim25d/TapeSampler.ts | 50Hz 纸带→逐差法 单测 10/10 |
| simulators | renderers/sim25d/simulators.ts | 7 个解析模拟器（弹簧RK/单摆RK4/圆锥摆/牛顿管/气体/功速/作用反） |
| FieldEngine | renderers/canvas3d/FieldEngine.ts | RK4+洛伦兹/库仑/布朗/电磁感应/变压器 单测 19/19 |
| merge | core/merge.ts | 字段级合并（2D/2.5D/3D 统一）单测 15/15 |

### 步骤引擎

- `core/types.ts` → ExperimentModule / ExperimentStep（含 aiHints/dataBinding/errorCategory）
- `runner/StepEngine.ts` → 三模式（guided/free/exam）状态机
- `core/stepLibrary.ts` → 55 条定制步骤（55:55 一一对应）

### AI 助教

- `framework/AiTutor.vue` → 阶梯提示（💡方法→📐公式→🔢方向），不跳步不直接给答案
- 拒绝给答案：问"答案是多少"→"我不能直接告诉你答案"

### 数据持久化

- `data/api.ts` → 5 接口 + AutosaveManager（2s 防抖/断网暂存/409 合并）
- `core/merge.ts` → 字段级合并策略

### 实验台（/lab，`views/LabView.vue`）：三维度元件体系与实验设计（2026-09-16）

实验台是自由沙盒（拖元件 → 调参数 → Java dyn4j 运行 → 曲线/回放）。按平台“唯一维度口径”分三档，工具栏分段控件切换，画布随之切换（`renderer.setDimension`：2D 正交 / 2.5D 等距 / 3D 透视轨道 + 空间场线带箭头），元件托盘按维度过滤，每档配一键载入的实验设计模板：

| 维度 | 画布 | 元件集（后端 dyn4j 7 种中的子集） | 实验设计模板 |
|:--|:--|:--|:--|
| 2D 平面 | 正交平面图（课本插图视角） | 方块、小球、斜面、墙壁/地面、点电荷、匀强电场、匀强磁场（⊗/⊙） | 斜面上的滑块 · 平抛运动 · 带电粒子在匀强电场中偏转 · 带电粒子在匀强磁场中回旋 |
| 2.5D 立体 | 等距立体，物理仍在竖直平面 | 方块、小球、斜面、墙壁/地面 | 小车沿斜面下滑 · 两球对心碰撞 · 自由落体与反弹 |
| 3D 空间 | 可旋转透视，空间场线带箭头 | 小球（带电粒子）、墙壁、点电荷、匀强电场、匀强磁场 | 正负点电荷的电场线 · 匀强电场中的加速与偏转 · 匀强磁场中的圆周运动 · 复合场：速度选择器 |

新增元件的参数面板：点电荷（电荷量 q、固定为场源）、匀强电场（Ex/Ey、区域宽高）、匀强磁场（B、⊙/⊗ 方向、区域宽高）；3D 下小球可设电荷量。切换维度若场景含本维度不支持的元件会提示（仍显示）。维度偏好存 `localStorage.ps_dim`。**未做**：弹簧、轨道（后端 dyn4j 无对应元件，需 Java 侧补 DistanceJoint/轨道约束后再进托盘）。

## 七、关键配置

### 环境变量

| 变量 | 位置 | 默认值 |
|:---|:---|:---|
| JWT_SECRET | Java application.properties | physicene-dev-secret-... |
| AI_INTERNAL_KEY | Java + Python .env | physicene-internal-2026-dev |
| DEEPSEEK_API_KEY | Python .env | sk-a0410b... |
| REDIS_URL | Python .env | redis://localhost:6379/0 |

### 本地路径

| 项 | 路径 |
|:---|:---|
| 代码仓库 | E:\Program\physicene |
| Python 3.12 | E:\Program\Python312 |
| Poetry | E:\Program\Python312\Scripts\poetry.exe |
| bge-m3 模型 | E:\Program\models\bge-m3 |
| Playwright 浏览器 | E:\Program\playwright-browsers |
| 教材 PDF | E:\学习\10.论文项目 |

### 服务端口

| 服务 | 端口 | 启动命令 |
|:---|:---|:---|
| Java | 8080 | cd java-backend && mvn spring-boot:run |
| Python | 8000 | cd python-ai-service && poetry run uvicorn physicene_ai.main:app --port 8000 |
| 前端 | 5173 | cd frontend && pnpm dev |
| MySQL | 3306 | 系统服务 |

## 八、Git 分支与提交历史

```
main ← feature/exp-b0 ← feature/exp-b1 ← feature/exp-b2 ← feature/exp-b3
     ← feature/exp-b6 ← feature/exp-b7 ← feature/exp-b8（当前）
```

### 关键提交（实验库 B0-B8）

| 提交 | 批次 | 内容 |
|:---|:---|:---|
| 813e1ed | B0 | 实验库地基（session/StepEngine/Report 预埋+7 实验） |
| 7c16f08 | B1 | 2D 引擎（坐标纸完美版+7 代表实验） |
| 417cad4 | B2 | 2.5D 引擎（纸带逐差法+约束模拟器+15 实验） |
| a4422fa | B3 | 3D 引擎（RK4 场力+9 个 3D 实验） |
| eb25be9 | B6 | 数据持久化（字段级合并+教师/学生端） |
| 0c2ad31 | B7 | AI 助教（阶梯提示/不跳步/考试模式+步骤库） |
| 22dcad5 | B8 | 第三阶段替代+目录收敛 |
| 2740db3 | B8 | 收尾包（α散射恢复+对账表） |
| 3aa9d22 | B8 | 补做 10 个锁定（100% 覆盖） |
| 996e8fa | 上线 | 上线评审包（5 项关闭+55 卡 E2E） |
| 817236b | 上线 | 评审复核（单测落盘 56+外部路径环境变量化+对账表 v2.1） |
| b3fe3e1 | 演示 | 演示页维度分档渲染+3D 场线带箭头+补 7 演示+实验库 3D 接入 |
| ced7e22 | 演示 | 实验库 3D 组件重写为逐帧动画+α散射 5 粒子+可折叠分组选择器 |
| ecf6426 | 质量 | P1：补做 10 实验重建为真仪器交互（替换公式壳 ExpCurvePanel） |
| 6fa7877 | 质量 | P2：替代 12 实验重建为真动画场景（替换占位壳 ExpAlt） |
| 3e05756 | 质量 | P3：约束族动画舞台+真多用电表+胡克/光电仪器舞台 |
| b0a35b1 | 质量 | 实验库质量审计记录+全 55 实验 E2E |
| 937a191 | 质量 | 内容一致性核查：E2E 标题↔内容断言+修 bx1-hooke 错位+作用反作用力箭头+snap-stage 工具 |
| 64aa94c | P0-2 | CircuitEditor 自由搭建编辑器 + 高考 6 电路实验接入 + 电路正确性 E2E |
| 07348cd | P0-2 | 继电器/感应线圈元件 + 电磁振荡/光控路灯/电磁感应接线舞台 + 静电装置操作 |
| 030c0a3 | P0-3+ | α散射 7 元件 + 有界磁场 + 贴紧提示 + 高考层/板块模型 + 方案书 v3.0 |
| 00c5644 | B9-B11 | 多过程引擎 `engine/multiProcess.ts` + AI 解题讲解器 `SolutionExplainer.vue` + 场景 2（平抛+竖直圆周）/ 9（加速→筛选→磁场） |
| e8191d1 | B9 | 通用 2.5D 力学场景运行器 `MechScene.vue` + `MechSceneDef` 接口（参数面板/开始暂停重置/记录/事件/时间轴/能量条/讲解器统一） |
| 13de02c | B11 | 力学场景组 1：斜面弹簧滑块 / 传送带+板块（模型30）/ 连接体整体隔离（模型21）/ 碰撞弹簧（模型29）/ 圆周临界五类（模型28）/ 多体碰撞链（9/20） |
| 7cccbb9 | B11 | 力学场景组 2（v3.1 补充模型）：等时圆（22）/ 晾衣绳动态平衡（23）/ 多过程直线运动+实时 v–t（25）/ 动量定理微元法（31）+ 四项物理量 E2E 断言 + 运行器只读区随仿真刷新修复（13/20） |
| 505ab99 | B9/B11 | `EMScene.vue` 通用 3D 运行器 + `EMSceneDef` 接口 + `em-kit.ts` 元件库 + #10 加速→偏转→荧光屏 / #11 磁场→电场；three-kit 文字精灵自适应宽度、透明场区不写深度 |
| fc5753b | B11 | 注册表重排为 v3.1 §7.1 总清单（`gaokao-plan.ts` 65 项 + LIVE 合并自动占位；目录页按 P0/P1/P2 显示覆盖） |
| 2896203 / d935075 / d65d076 | B11 电磁 P0 | #32 速度选择器 / #13 质谱仪 / #37 电→磁→电；#16 复合场 / #12 回旋加速器；#14 导轨导体棒 + 模型 38–41 四变体（`variantEM`） |
| 7a55c45 / 839e547 | B11 P0 收口 | 光学 #55/#58/#59、近代 #61/#62（MechScene 能量条可选）；3D 电路实验台 #49 伏安法 / #48 电表改装 → **P0 全部上线** |
| eeba9f8 / 4ea75b2 / 8dfedd1 | B11 P1 | 力学 #26 斜抛 / #24 超重失重（力学 18/18）；变压器输电族 #15/#45/#46 + #47 交变四值；#36 磁聚焦 / #42 线框进出 / #44 斜面导轨 |
| 0fbb6e6 / 7798857 / f136457 / 7189ce9 | B11 P1 | 热学 #51–54；光学 #56/#57/#60；近代 #63/#64/#65；竞赛 #66/#67/#68 |
| 19727f1 / 714ffe0 | B11 P2 收官 | #33 磁流体 / #34 流量计 / #35 霍尔；#43 导体棒弹簧 / #50 黑箱 / #69 刚体 / #70 感应 ODE → **v3.1 清单 65/65 全部上线** |
| 9673b96 | B12 | `gaokao-ledger.test.ts` 自动对账（65 卡覆盖 + 讲解模板 11 段 + 生成对账表）；力学四别名改为变体；组 1 十二卡补物理断言（65/65 均有解析解比对） |
| e39ba7a | B12 | 上线评审文档 + 65 卡截图入库 + 录屏归档脚本 `gaokao-media.py` + 方案书/总览回填 |
| a3a76c6 | 定位更正 | 删三模式与考试评分、删教师批阅页、AI 助教接真 AI（aiAgent.ts）、提交后 AI 即时反馈、Python 启动预热 RAG、ai-tutor-check.py |
| 261282e | B13 | 自由搭建 /sandbox：元件目录 89 / 识别器 58 规则 / 内嵌运行 / 数据面板+坐标纸 / AI 助手 / 十场景 E2E |
| 5982ba2 | B13 | B13 验收报告 + 元件对账表（自动） + 模块 README + 十场景截图录屏 |
| 9c9eeba | 实验台 | 三维度元件体系：2D/2.5D/3D 分段 + 7 元件按维度过滤 + 11 模板 + lab-check E2E |

### 实验库之前的里程碑

| Tag | 内容 |
|:---|:---|
| v0.1.0-skeleton | 三端骨架+通信链路 |
| v0.2.0-physics-core | dyn4j 物理引擎+30fps 推帧 |
| v0.3.0-scene-crud | 场景持久化+前端完整 UI（及格线） |
| v0.4.0-ai-agent | AI Agent"用嘴做实验"（良好线） |
| v0.5.0-rag-ocr | RAG 教材引用+OCR 拍照识题 |

## 九、测试覆盖汇总

| 测试 | 数量 | 状态 | 运行方式 |
|:---|:--:|:--:|:---|
| Java mvn test | 8 | ✅ 全过 | `cd java-backend && mvn test` |
| fit 单测 | 12 | ✅ 全过 | `renderers/canvas2d/fit.test.ts` |
| TapeSampler 单测 | 10 | ✅ 全过 | `renderers/sim25d/TapeSampler.test.ts` |
| FieldEngine 单测 | 19 | ✅ 全过 | `renderers/canvas3d/FieldEngine.test.ts` |
| merge 单测 | 15 | ✅ 全过 | `core/merge.test.ts` |
| **单测合计** | **92** | **✅ 全过** | `cd frontend && npx vitest run`（vitest 5；含 `engine/multiProcess.test.ts`、电路 MNA 单测、`registry/gaokao-ledger.test.ts` 高考层对账——覆盖 65/65 + 讲解模板 11 段 + readout 无 NaN，并生成 `docs/高考竞赛层-元件与题型对账表.md`） |
| 类型检查 | — | ✅ 0 错 | `pnpm exec vue-tsc --noEmit`（typescript 须 5.9.x，7.x 与 vue-tsc 3.3 不兼容） |
| B0-B8 E2E | 每批次 | ✅ 0 控制台错误 | Playwright（浏览器在 E:\Program\playwright-browsers） |
| 55 卡逐卡 E2E | 55 | ✅ 55/55 | 同上 |
| 演示页无头 E2E | 14 项 | ✅ 全过，0 控制台错误 | `set PLAYWRIGHT_BROWSERS_PATH=E:\Program\playwright-browsers && python frontend/e2e/sim-demo-check.py`（Vite 5173） |
| 实验库逐实验无头 E2E | **120（教材 55 + 高考层 65）** | ✅ 120/120，内容一致，动画多帧，**高考层 65 卡每卡一项与解析解比对的物理量断言**（等时圆 √(4R/g)、回旋 q²B²R²/2m、磁聚焦 90°×5、伏安法 R_x∥R_V、棱镜 δ、光电 h 斜率…），0 控制台错误 | `python -u frontend/e2e/exp-lib-check.py [--ids a,b] [--url http://localhost:5173]`（API 登录 demo 账号后逐个打开 /exp/:id，断言仪器画布、**面板标题含该实验专属关键词（标题↔内容一致）**、**应动实验点主按钮后间隔 400ms 两帧必须不同（动画正确性）**、点主按钮与记录按钮、收集控制台错误、`extra_checks()` 专项物理断言；需 Java 8080）。抓动画时间窗口帧用 `frontend/e2e/snap-stage.py --id <id> --click-main --at 600,1500,2600`（输出 ANIMATED/STATIC 判定） |
| **自由搭建 E2E** | 10 场景 × 5 断言 | ✅ 10/10（识别 / 运行器 / 动画 / 物理量 / 零错误） | `python -u frontend/e2e/sandbox-check.py [--only 4,7] [--video]`：经 DEV 钩子 `window.__sandbox` 脚本化搭元件 → 识别 → 运行 → 断言物理量与解析解一致；截图 `e2e/out/sandbox-*.png`（入库 `docs/media/sandbox/`），`--video` 整段录屏。对账 `sandbox-ledger.test.ts`（目录 / 规则 / 十场景识别，生成 `docs/自由搭建-元件对账表.md`） |
| **AI 助教真通道 E2E** | 3 断言 | ✅（真 AI 回复 809 字，直接给出 F=kx） | `python -u frontend/e2e/ai-tutor-check.py [--id]`：打开实验 → 点「直接讲解」→ 等真 AI 回复（在线灯绿、非回退文案）→ 直接问答案也回答；需 Python 8000 已启动且 RAG 预热完成 |
| **高考层媒体归档** | 65 截图 + 65 录屏 | ✅ | `python -u frontend/e2e/gaokao-media.py [--ids] [--no-video]`：逐卡运行，截图 → `docs/media/gaokao/<id>.png`（入库），录屏 → `frontend/e2e/out/video/<id>.webm`（本地） |
| **电路正确性 E2E**（P0-2 验收项） | 11 实验 / 45 断言 | ✅ 11/11 | `python -u frontend/e2e/circuit-check.py [--ids a,b]`：经 DEV 钩子 `window.__circuitEditor` 脚本化搭电路，断言正确接法读数与理论一致（伏安法拟合 E/r、外接法 R、欧姆挡读数、RC τ、自感 τ、感抗）、判分通过、典型错接被故障检测抓住（电流表并联/带电测电阻）、暂态回放两帧不同；截图归档 `e2e/out/circuit-*.png` |
| **实验台三维度 E2E** | 3 维度 / 16 断言（含贴紧提示） | ✅ 16/16 | `python -u frontend/e2e/lab-check.py [--no-run]`：登录后 /lab 逐维度切换，断言托盘元件集、模板数、模板载入后场景元件数、画布存在；2D「平抛运动」真实经 Java dyn4j 运行到 ended；截图 `e2e/out/lab-*.png` |

> 2026-09-15 上线评审复核：此前 56 个前端单测仅在会话内临时运行、未入库；本日以 vitest 正式落盘为 4 个 `*.test.ts`，
> 数量口径不变，可 `pnpm test` 复现。

## 十、当前状态与下一步

### 已完成

- ✅ 实验库 B0-B8 全部批次
- ✅ 40 规划实验 100% 覆盖
- ✅ 55 卡 / 55 可做 / 0 锁定
- ✅ 对账表 v2.1 勘误定版冻结（步骤库 55 条，与代码逐项核对一致）
- ✅ 上线评审包（5 项全关 + 2026-09-15 复核 7 项问题已修复，见 launch-review.md §评审复核记录）
- ✅ 实验库质量审计与整改（2026-09-15，见 launch-review.md §实验库质量审计与整改）：22 个“公式壳/占位壳”实验重建为真仪器交互（补做 10 + 替代 12），10 个实验补仪器动画（约束族 8 + 胡克/光电 2），修复多用电表挂错内容的 bug；55 个实验现均有专用仪器画布
- ✅ 结项评审通过
- ✅ **P0-2 CircuitEngine 修复完成（2026-09-16）**：引擎（MNA 直流/暂态/交流 + 19 种元件含多用电表/继电器/感应线圈 + 15 类故障 + 判分）、CircuitEditor 自由搭建编辑器、12/12 电路类实验接入（6 高考核心自由搭建 + 电磁感应 3 接线舞台 + 电磁振荡/光控路灯自由搭建 + 静电装置操作），电路正确性 E2E 11/11，详见 `p0-circuit/defect-report.md` 修复记录
- ✅ **实验台三维度元件体系（2026-09-16）**：/lab 2D/2.5D/3D 分段切换、7 元件按维度过滤、11 个实验设计模板、画布随维度切换（见 §六 实验台）
- ✅ **P0-3 α散射 7 类元件补全（2026-09-16）**：独立 3D 组件，26 条轨迹逐个发射、荧光屏 72 片闪烁计数、量角器、散射角直方图叠卢瑟福曲线；共享底座 `renderers/canvas3d/three-kit.ts`
- ✅ **用户三点（2026-09-16）**：Exp3D 洛伦兹/粒子磁场实验加“磁场区域半径”（有界磁场，r>R 出界直线）；实验台自由搭建**贴紧提示**（相邻实体空隙/重叠 ≤0.6 m 询问是否贴紧，一键消除）；**高考/竞赛题层**（`layer:'gaokao'`，目录 /gaokao，导航“高考竞赛”，不计入教材 55 卡）首个场景 **板块模型**（滑块冲上木板/子弹撞入/木板获初速，多过程时间轴、共速/脱离临界、能量条、v–t 双曲线）
- ✅ **B9/B10/B11 首批（2026-09-16）**：多过程引擎模块 `engine/multiProcess.ts`、AI 解题讲解器 `SolutionExplainer.vue`（提示/完整/变式）、高考场景 3/20（板块模型 · 平抛+竖直圆周 · 加速→筛选→磁场），每场景带时间轴、临界事件、能量条、十段讲解模板
- ✅ **B9 通用运行器 + B11 力学 12 场景（2026-09-16/17）**：`MechSceneDef` 接口 + `MechScene.vue` 运行器（e8191d1）后，力学场景以纯数据模块接入（`defs/gaokao/scenes/mech1–4.ts`，每个 200–300 行：init/step/draw/energy/readout/solution）。组 1（13de02c）：斜面弹簧 / 传送带+板块 / 连接体 / 碰撞弹簧 / 圆周临界五类 / 碰撞链；组 2（v3.1 补充模型）：等时圆 / 晾衣绳动态平衡 / 多过程直线运动+实时 v–t / 动量定理微元法。E2E 对每个模型做**物理量断言**（与解析解比对），不只看动画。B11 进度 13/20，剩电磁组 7 个（需 3D 运行器 EMScene）
- 🛠 **运行器缺陷修复（本轮）**：`MechScene.vue` 只读区 `readout` 原为仅依赖参数的 computed，仿真运行中不刷新（所有场景受影响）；现显式依赖 `t` 逐帧刷新。同类坑：非响应式 `state` 被 computed 引用时必须手动加依赖
- 📘 **方案书 v3.0 已落盘** `docs/实验库完整修复与扩展方案书-v3.0.md`（三层架构、P0、B9–B12、20 场景、AI 讲解器规格、验收 v3.0）；~~上线暂停至 B12 通过~~ → **B12 已通过（2026-09-17），见下条**
- ✅ **B11 全量 + B12 通过（2026-09-17）**：用户随后给出完整版 v3.1（分册清单合计 65 项，非标题所写 50）。注册表按清单重排（`gaokao-plan.ts`），新增 `EMScene.vue` 通用 3D 运行器与 `em-kit.ts`，两天内按 P0→P1→P2 交付 **65/65**：力学 18、电磁 27（含 3D 电路实验台：伏安法/电表改装/黑箱/变压器输电链路）、热学 4、光学振动波 6、近代物理 5、竞赛 5。每卡：讲解模板十一段 + 一项与解析解比对的 E2E 物理断言（`extra_checks()`）+ 截图（`docs/media/gaokao/`）+ 录屏（本地）。B12：vitest 92 / build / 实验库 120 / 电路 11 / 实验台 16 / 演示 14 全绿；`gaokao-ledger.test.ts` 自动对账并生成《高考竞赛层-元件与题型对账表》；上线评审 `docs/上线评审-v3.1-高考竞赛层.md`（结论：解除停上线，待用户人工验收）
- ⚠️ **2026-09-15 复盘发现 P0-2：自由电路搭建引擎（CircuitEngine）从未交付**——B1 开工令明确要求“自由拖元件搭电路，必须做”，B1–B8 全程缺席，上线评审未查；12 个电路类实验现为“固定电路图 + 调参 + 坐标纸”模板，自由搭建为零。已立项修复，缺陷报告/元件清单/引擎规格见 `frontend/src/experiments/docs/p0-circuit/defect-report.md`。P0-1（3D 静图）已于 ced7e22 修复并经 9/9 帧采样实证关闭

### 待做（毕设主线，非实验库）

| # | 任务 | 优先级 |
|:--|:---|:--:|
| 0 | **方案书 v3.0 B9–B12**：B9 引擎+元件库（多过程时间轴/临界求解器/能量动量跟踪 模块化；力学与电磁元件库）→ B10 AI 解题讲解器（题型识别/过程拆解/受力/规律/临界/推导/易错/变式，八套模板）→ B11 剩余 19 场景 → B12 全平台回归 + 上线评审。P0-1/2/3 均已关闭 | **最高** |
| 1 | **第六周主线**：报告生成导出(POI Word)/学生画像/教师策略/Redis/docker-compose | 高 |
| 2 | 上线评审（用户审阅上线评审包） | 高 |
| 3 | 毕设论文撰写（第 3 章复用 SRS，第 5 章写实现，第 7 章 5 个创新点） | 高 |
| 4 | 答辩 PPT（18 页/8-12 分钟/深蓝#1a1a2e） | 中 |
| 5 | 演示视频（分周递增+8 分钟完整版） | 中 |

### B4/B5 状态

B4（电路引擎）和 B5（光学引擎）未独立开工，相关实验已用 B1 引擎 2D 坐标纸覆盖（10 个补做实验）。如需完整电路/光学仿真引擎，归入毕设后续迭代。

## 十一、重要操作注意事项

1. **Poetry/Python 启动**：必须 `export PATH="/e/Program/Python312:$PATH"` 前置（否则撞 WindowsApps 假别名）
2. **Vite 缓存**：已在 vite.config.ts 开启 `usePolling: true`（根治 E 盘文件监听丢失）
3. **MySQL 备份**：`scripts/backup-db.bat`（保留最近 30 份），建议定期运行
4. **DeepSeek API Key**：已存 `.env`（gitignore 保护），不在代码中
5. **实验台零改动原则**：LabView 功能未因实验库而改变。例外：SimView（演示实验）2026-09-15 按"唯一维度口径"升级——每个演示自动按 纯2D/纯2.5D/纯3D 分档渲染（2D=正交平面图、2.5D=等距立体、3D=左键旋转+XYZ 轴+带箭头场线），实验选择器改为可折叠分组菜单（搜索筛选+维度徽标），新增 7 个 dyn4j 演示（竖直上抛/牛顿管/篮球反弹/完全非弹性/轻碰重/电场加速/速度选择器，共 25 个；α散射为 5 粒子扇面）；实验库 9 个 3D 实验组件（Exp3D）重写为逐帧动画（播放/暂停/重置 + 真实元件：磁棒/线圈/导轨/探测器环/灯泡），以演示模式接入 /sim（无步骤评分，完整版仍在 /exp）。演示页无头 E2E：`frontend/e2e/sim-demo-check.py`（Playwright，14 项断言 + 控制台错误检查）
6. **磁盘约束（硬性）**：所有新增安装、下载的资源一律放在 `E:\Program` 下，不得写入其他盘。现有落点：Python `E:\Program\Python312`、bge-m3 `E:\Program\models\bge-m3`、Playwright 浏览器 `E:\Program\playwright-browsers`、pnpm 内容仓库 `E:\.pnpm-store`（E 盘）。已知例外：pnpm 元数据缓存默认在 `C:\Users\wangbo\AppData\Local\pnpm-cache`（约 295M，用户级全局配置；项目级 .npmrc 的 cache-dir 不被 pnpm 识别，2026-09-15 实测无效已删）。按第 8 条不动全局配置；日后若要迁到 E 盘：`pnpm config set cache-dir --global E:\Program\.pnpm-cache`（须先征得同意）
7. **外部路径一律走环境变量**：bge-m3 模型路径由 `BGE_M3_PATH` 指定（默认 `E:\Program\models\bge-m3`），禁止在代码里硬编码绝对路径
8. **环境变量与配置文件不随意改动（硬性）**：`.env`、`application.properties`、`vite.config.ts`、`.npmrc` 等一律不得未经用户同意修改。需要新增可配置项时，只在代码里加带默认值的 Settings 字段并更新 `.env.example` 文档，本机 `.env` 保持原样；默认值须与原行为一致
9. **实验组件质量底线（硬性）**：每个实验必须有自己的仪器交互画布与真实物理过程（学生操作仪器→读数→作图），禁止用“滑杆+公式生成读数”的公式壳或“动画占位”的占位框冒充可做实验；共享组件只能承载共同底座（面板壳/绘制原语/舞台），不能承载实验本体。新实验用 `defs/apparatus/LabPanel.vue` 起手
10. **共享组件必须经薄包装挂载（硬性）**：`ExperimentShell` 挂载实验组件时不传任何 props。凡是带必填 `mode`/配置 prop 的共享组件（`ExpConstraint`、`Exp3D`、`ExpHookePhoto`、`ExpTape`、`ExpCanvasPanels`…），注册表**禁止直接引用**，必须通过 `ExpPendulumG.vue` 这类 6 行薄包装传参（Vue 单根组件会把 shell 的 `@record` 等监听自动透传，无需手写转发）。曾因 `bx1-hooke` 直接挂 `ExpHookePhoto` 导致胡克定律页显示光电效应；E2E 的内容一致性断言（每实验一条关键词）是这条规则的自动守卫，新增实验必须同步在 `exp-lib-check.py` 的 `KEYWORDS` 里加一条
11. **只保留一个前端 dev server**：Vite 端口被占时会自动漂到 5174，导致“改了代码但浏览器看的是旧端口的旧模块图”（2026-09-15 用户截图问题的直接原因）。开新会话前先 `netstat -ano | grep 5173`，有残留进程就先停掉再 `pnpm dev`；浏览器侧用 Ctrl+F5 强刷
12. **验收制度（永久，2026-09-15 两个 P0 复盘后确立）**：P0-1“3D 动画是静图”与 P0-2“自由电路搭建引擎从未交付”暴露同一病根——验收只看流程不看教学本质。此后每批次验收必须同时满足：① **元件清单对账**（应有元件 vs 实际元件对账表，缺一不验）；② **动画正确性 E2E**（多帧采样，已固化为 `exp-lib-check.py` 的 `ANIMATED_IDS` 两帧必须不同）；③ **电路正确性 E2E**（连线/故障/判分实测，随 CircuitEngine 交付）；④ **物理正确性抽检**（每实验 ≥1 项物理量对比理论值，阈值写进用例）；⑤ **人工验收**（每批次人工逐实验操作，不得只靠自动化）；⑥ **截图/录屏归档**（每实验 ≥1 张运行截图 + 1 段多帧采样，`e2e/out/` + `snap-stage.py`）；⑦ **教学本质检查**（每实验问“学生能不能做这个实验的核心操作”，不能只问“能不能打开”）。开工令里的每条能力要求都必须出现在对应批次 DoD 里，DoD 缺项视为验收无效
13. **高考/竞赛题层场景契约（2026-09-17，B11 全量交付后固化）**：① 清单唯一来源是 `registry/gaokao-plan.ts`（v3.1 §7.1 逐项编码；文档标题写 50 但分册合计 **65**，一律按 65 对账）；② 新场景 = 一个 `MechSceneDef`（2D/2.5D，`defs/gaokao/scenes/*.ts`）或 `EMSceneDef`（3D）数据模块 + `wrapScene/wrapEM` 薄包装 + `gaokao.ts` 的 `LIVE` 一行；同一物理模型的多个清单编号用 `variantScene/variantEM` 给不同默认搭法，禁止两个 id 直挂同一组件；③ 必须同时提交：`exp-lib-check.py` 的 `KEYWORDS`（标题关键词）+ `ANIMATED_IDS` + `extra_checks()` 里**一项与解析解比对的物理量断言**（阈值写死）；④ 讲解模板十一段全部非空、`readout(p, null)` 可用且无 NaN——`gaokao-ledger.test.ts` 会拦；⑤ 长会话写大文件曾连续三次“写入执行失败”（单次 Write 超大载荷被截断后原样重试），此后每个场景文件 ≤ 300 行、每组 2–3 场景一提交，接线用一次性 Python 补丁脚本而非十几次小编辑
16. **自由搭建的求解契约**：沙盒不是任意组合的通用 ODE 求解器，而是“元件组合 → 已验证求解器”的映射（`sandbox/recognizer.ts` 规则）。新组合三步接入见 `frontend/src/sandbox/README.md`；规则里引用的参数键必须是目标 def 的 `params[].key`，`sandbox-ledger.test.ts` 会检查标签有效性与十场景识别结果。刚体任意组合仍走 `/lab`（dyn4j），电路任意连线走 CircuitEditor
15. **AI 服务（Python 8000）是实验层“真 AI”的前提**：启动 `cd python-ai-service && .venv/Scripts/python.exe -m uvicorn physicene_ai.main:app --port 8000`（`.env` 含 DEEPSEEK_API_KEY，禁止打印）。启动时后台预热 RAG（bge-m3 + Chroma 约 40–80 s，`RAG_WARMUP=0` 可关）；预热前的首个问答会撞 Java Feign 35 s 读超时 → 前端自动回退到内置讲解并亮红灯，预热后恢复。`experiments/data/aiAgent.ts` 是实验层唯一 AI 出口（带实验上下文、LaTeX 转写、失败回退）
14. **3D 场景两条渲染坑（three.js）**：透明场区盒必须 `depthWrite=false`，否则盒内比前表面近的箭头/粒子被深度测试吃掉（表现为“电场箭头不见了”）；箭头组要沿局部 +y 建模再用四元数指向目标，`scale.y` 才沿箭头轴伸缩（沿其它方向建模再缩放会歪）。`textSprite` 已改为按文本宽度自适应画布，长中文标签不再裁切

## 十二、实验库文档索引

| 文档 | 位置 |
|:---|:---|
| **实验库完整修复与扩展方案书 v3.0**（三层架构 / P0 / B9–B12 / 20 场景 / AI 讲解器 / 验收 v3.0，含执行状态表） | docs/实验库完整修复与扩展方案书-v3.0.md |
| **上线评审 · v3.1 高考/竞赛题层（B11 65/65 + B12 全平台回归；结论：解除停上线）** | docs/上线评审-v3.1-高考竞赛层.md |
| **B13 验收报告 · 自由搭建实验（十场景 10/10，DoD 对照，架构取舍）** | docs/B13-验收报告.md；模块说明 frontend/src/sandbox/README.md |
| **自由搭建 · 元件与识别规则对账表**（自动生成：89 元件 / 58 规则 / 十场景） | docs/自由搭建-元件对账表.md；截图 docs/media/sandbox/ |
| **高考竞赛层 · 元件与题型对账表**（自动生成：65 卡 × 运行器/元件参数/E2E 物理断言/讲解模板/截图） | docs/高考竞赛层-元件与题型对账表.md（`gaokao-ledger.test.ts` 生成）；截图 docs/media/gaokao/ |
| **P0-2 缺陷报告：CircuitEngine 从未交付**（现状对账/12 元件清单/引擎规格/修复顺序/验收制度） | frontend/src/experiments/docs/p0-circuit/defect-report.md |
| 需求规格说明书 v3.4.1（冻结） | docs/01-需求规格说明书_v3.4.1.md |
| 教材实验清单 | docs/教材实验清单与平台覆盖.md |
| 优先级与维度规划 | docs/实验开发优先级与维度规划.md |
| 技术方案书 | docs/实验库技术方案书.md |
| B0 验收报告 | docs/B0-验收报告.md |
| B1 验收报告 | docs/B1-验收报告.md |
| B2 验收报告 | docs/B2-验收报告.md |
| B3 验收报告 | docs/B3-验收报告.md |
| B6 验收报告 | docs/B6-验收报告.md |
| B7 验收报告 | docs/B7-验收报告.md |
| B8 验收报告 | docs/B8-验收报告.md |
| 权威对账表 v2.1（勘误定版） | frontend/src/experiments/docs/b8-closure/reconciliation-v2.1.md |
| 对账表 v2.0（已被 v2.1 取代） | frontend/src/experiments/docs/b8-closure/reconciliation-v2.md |
| 上线评审包 | frontend/src/experiments/docs/b8-closure/launch-review.md |
| processedData v1.2 | frontend/src/experiments/docs/processedData-v1.2.md |
| 开发日志 | docs/开发日志.md |
| 第一周复盘 | docs/第一周复盘总结.md |
