# Docker 一键部署前置调研（P0 · 2026-10-12 · 只调研不写代码）

## 六问答复（全部代码实证）

### 1. 前端 dev 还是 build 产物？

**build 可用（今日实测首验）**：`pnpm build` 退出码 0，dist/ 共 **2.9MB**（assets+index.html）。
本项目此前从未跑过生产构建——这是 Docker 化的第一风险点，已提前排雷 ✓。
API 走**相对路径**（axios `baseURL: '/api'`），WS 用 `location.host` 同源拼 URL
（useSimulationSocket.ts:117/220）——**零硬编码**，nginx 反代即可，前端零改动。

### 2. 后端启动依赖什么？

- MySQL 连接（JDBC URL 带 `createDatabaseIfNotExist=true`）+ Flyway 自动迁移
- 环境变量（application.properties 已全部参数化，Spring 标准覆盖名）：
  `SPRING_DATASOURCE_URL/USERNAME/PASSWORD`、`JWT_SECRET`（有开发默认值）、
  `AI_INTERNAL_KEY`（默认 physicene-internal-2026-dev）、`AI_SERVICE_URL`（默认
  localhost:8000——**容器里必须覆盖为 http://ai:8000**）
- Redis：**不依赖**（本地长期未起 Redis 全功能正常）

### 3. MySQL schema 初始化方式？

**Flyway 权威**（V1 基线 14 表 + V2 种子 admin/demo/OCR，`db/migration/`）。
⚠️ **`scripts/init-db.sql` 已退役**（文件头注明"不再用于建库，保留作物证"）——
**任务包 compose 模板里挂载 init.sql 的做法必须去掉**，否则与 Flyway 双初始化冲突。
空库直接起后端 = Flyway 从零跑 V1+V2，一键路径成立。

### 4. AI 服务依赖什么？

- Python 3.12（锁版本）+ poetry（pyproject + lock，**无 requirements.txt**——Dockerfile
  用 `pip install poetry` 或 `poetry export`）
- **关键发现：重依赖全部懒加载**——`chromadb`/`sentence_transformers` 在
  `rag_retriever._ensure_loaded()` 方法内 import；`paddleocr` 在 `ocr_service.py:33`
  方法内 import。→ **镜像可分档**：
  - **slim 档（推荐默认）**：只装核心（fastapi/uvicorn/pydantic/openai/httpx/loguru
    ≈200MB）——RAG/OCR 运行时优雅降级（无 key 显式提示已有；有 key 无 RAG → LLM 直答
    带【非教材引用】标注；OCR → degraded 提示——均为既有行为，零业务改动）
  - **full 档（compose profile 可选）**：全量依赖（**注意 sentence-transformers 传递
    torch：linux 默认轮子含 CUDA，全装 ≈3-5GB**，full 档需 CPU 版 torch 索引或接受体积）
    + 挂载 bge-m3 模型卷 + 自建 Chroma 卷（版权 PDF 不可分发，只能用户自建）
- bge-m3 模型 2.3GB / 教材 KB：不入镜像（同 Sealos 调研结论）

### 5. 需要哪些环境变量？（合并清单）

| 服务 | 变量 | 默认 | 一键部署口径 |
|---|---|---|---|
| mysql | MYSQL_ROOT_PASSWORD / MYSQL_DATABASE / MYSQL_USER / MYSQL_PASSWORD | 无 | .env 必填 |
| backend | SPRING_DATASOURCE_URL/USERNAME/PASSWORD | localhost | compose 注入（host=mysql） |
| backend | JWT_SECRET | 开发默认 | .env 建议 |
| backend | AI_SERVICE_URL | localhost:8000 | **compose 固定覆盖 http://ai:8000** |
| backend+ai | AI_INTERNAL_KEY / INTERNAL_KEY | dev 默认（两侧同值） | .env 可选 |
| ai | DEEPSEEK_API_KEY | 空 | BYOK 可空（降级） |
| ai | JAVA_BASE_URL | localhost:8080 | **compose 覆盖 http://backend:8080** |
| 全局 | TZ | 系统 | Asia/Shanghai |

### 6. 前端 API 地址硬编码还是环境变量？

**都不是——相对路径**（`/api` 经当前 origin），WS 同源。这是最优形态：Docker 里由
nginx 反代 `/api`+`/ws` → backend:8080，**前端代码零改动**。

---

## 与任务包模板的 4 处必要偏差（P1 执行口径）

1. **去掉 init-db.sql 挂载**——Flyway 权威，双初始化必冲突（见问 3）
2. **AI 镜像默认 slim 档**（核心依赖子集），full 档作可选 profile——否则 torch+CUDA
   把"高中生一键装"变成 5GB 下载（见问 4）
3. **Node 基镜像用 22-alpine 非 20**——Vite 8 要求 ≥20.19/≥22.12，20-alpine 部分版本
   不满足；本机 Node 24 实测构建通过
4. **AI healthcheck 用 curl 非 wget**——python slim 无 wget（装 curl 一行）；backend
   用 temurin JRE（自带无 wget/curl 则改用 java 微探针或装 curl）

## 架构预览（P1/P2 蓝图）

```
浏览器 → :80 nginx(前端容器) ─┬─ /  → 静态 dist
                              ├─ /api → backend:8080（Java 容器）
                              └─ /ws  → backend:8080（WS upgrade）
backend → mysql:3306（Flyway 建库）    backend ⇄ ai:8000（INTERNAL_KEY）
ai(slim) → DeepSeek API（BYOK，可空降级）
卷：mysql-data 持久化；（可选 profile）model 卷 + chroma 卷
```

## 风险清单（P4 验证重点）

- `pnpm build` 产物未在 nginx 下运行过（dev 全走 Vite）——P4 冒烟覆盖
- slim 档下 warm-up 线程 import 失败是否被宽捕获（本地"模型缺失"路径已验证不崩；
  "包缺失"路径 P4 实测）
- Windows 宿主 80 端口常被占——.env FRONTEND_PORT 已参数化 + FAQ

---

## 追问答复（P1 开工前 · 代码实证）

### 追问 1：OCR 在 slim 下的行为 = 功能级不可用，但有降级链（不崩不白屏）

证据链：slim 无 paddleocr → `ocr_service._ensure_loaded()` 的方法内 `from paddleocr import`
抛 ImportError → routes_ocr 只捕 LowConfidenceError → FastAPI 500 → **Java 层兜底**
（OcrController:89-96）：非 422 FeignException → `EXTERNAL_UNAVAILABLE "识别服务暂不可用，
请稍后再试"` → **学生看到 toast「识题失败：识别服务暂不可用，请稍后再试」**。

缺陷：文案对 slim 场景**误导**（重试无效，是档位问题）——与 BYOK"繁忙 vs 配置"同型。
两个处置选项（P1 报告时裁决）：
- A. 仅 README/FAQ 说明"OCR 需 full 档"（零代码改动，误导文案保留）
- B.（推荐）Python routes_ocr 加 3 行 ImportError 守卫 → 明确返回"OCR 未安装（slim 档），
  需 AI_MODE=full"——错误处理边界改动，非业务逻辑

### 追问 2：full 档切换 = .env 的 AI_MODE 开关（build target 切换，非 --profile）

单 Dockerfile 双阶段目标（slim=默认 / full），compose `build.target: ${AI_MODE:-slim}`。
切法：`.env` 改 `AI_MODE=full` → `docker compose up -d --build`（AI 服务重建，其余不动）。
默认必为 slim ✓（未设 AI_MODE 即 slim，首次下载 ~200MB 而非 5GB）。README/FAQ 双处写明。

### 顺带修正任务包 compose 模板 2 处命名错误（P2 执行）

1. ai 服务的内部密钥环境变量名是 **INTERNAL_KEY**（非 AI_INTERNAL_KEY——那是 Java 侧名）；
   模板原样照抄会导致 Java↔Python 鉴权失败
2. ai 服务还需 **JAVA_BASE_URL=http://backend:8080**（Agent 工具回调 Java 用）

### 环境补充

本机 Docker Desktop 引擎已启动（28.0.1，F 盘安装）——P4 全链本地可测 ✓
