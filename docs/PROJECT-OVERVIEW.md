# PhysiScene 项目总览（供新会话继续使用）

> 生成日期：2026-09-15　生成方式：B0-B8 实验库全批次完成后的全面总结
> 用途：新开对话或压缩上下文后，作为项目状态的唯一权威参考

---

## 一、项目是什么

**PhysiScene = AI Agent 智能物理实验平台**（本科毕业设计）

两大产品线：
1. **实验台**（LabView `/lab`）——学生拖元件搭场景、跑仿真、AI 对话"用嘴做实验"
2. **实验库**（Experiment Library `/exp`）——按教材章节分组的 55 个结构化实验，带步骤条+AI 助教+数据记录+Report

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
| **单测合计** | **64** | **✅ 全过** | 前端 56 个：`cd frontend && pnpm test`（vitest 5） |
| 类型检查 | — | ✅ 0 错 | `pnpm exec vue-tsc --noEmit`（typescript 须 5.9.x，7.x 与 vue-tsc 3.3 不兼容） |
| B0-B8 E2E | 每批次 | ✅ 0 控制台错误 | Playwright（浏览器在 E:\Program\playwright-browsers） |
| 55 卡逐卡 E2E | 55 | ✅ 55/55 | 同上 |
| 演示页无头 E2E | 14 项 | ✅ 全过，0 控制台错误 | `set PLAYWRIGHT_BROWSERS_PATH=E:\Program\playwright-browsers && python frontend/e2e/sim-demo-check.py`（需 Vite 在 5174） |
| 实验库逐实验无头 E2E | 55 | ✅ 55/55，0 控制台错误 | `python frontend/e2e/exp-lib-check.py [--ids a,b]`（API 登录 demo 账号后逐个打开 /exp/:id，断言仪器画布、点主按钮与记录按钮、收集控制台错误；需 Java 8080） |

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

### 待做（毕设主线，非实验库）

| # | 任务 | 优先级 |
|:--|:---|:--:|
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

## 十二、实验库文档索引

| 文档 | 位置 |
|:---|:---|
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
