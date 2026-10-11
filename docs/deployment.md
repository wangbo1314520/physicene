# 部署文档（PhysiScene）

## 0. 环境要求（阶段 3.1 补全 · 2026-10-11）

| 组件 | 版本（实测口径） | 说明 |
|---|---|---|
| Node.js | ≥24（实测 24.14.1）+ pnpm 11 | 前端构建/Vite dev |
| Java | 17（pom release 17）+ Maven 3.9 | 后端 + dyn4j 物理 |
| MySQL | 8.0.x（实测 8.0.37） | Flyway V1 基线+V2 种子自动迁移 |
| Python | 3.12（锁版本，实测 3.12.7）+ poetry | AI 服务（bge-m3/Chroma/paddle） |
| 浏览器 | Chrome/Edge 最新 | three.js WebGL |

## 0.1 从零安装

```bash
git clone <repo> && cd physicene
# ① MySQL：建库（Flyway 自动建表）+ 应用账号（勿用 root 上线）
mysql -uroot -p -e "CREATE DATABASE physicene DEFAULT CHARSET utf8mb4;"
# ② Java 后端（application.properties 配 DB 账密）
cd java-backend && mvn package -DskipTests && java -jar target/physicene-backend-0.1.0-SNAPSHOT.jar
# ③ AI 服务（先配 python-ai-service/.env——参照 .env.example，含 DEEPSEEK_API_KEY）
cd ../python-ai-service && poetry env use <python3.12> && poetry install
.venv/Scripts/python.exe scripts/build_kb.py     # 教材 PDF 放 TEXTBOOKS_DIR 后建知识库
.venv/Scripts/python.exe -m uvicorn physicene_ai.main:app --port 8000
# ④ 前端
cd ../frontend && pnpm install && pnpm dev       # http://localhost:5173
```

## 0.2 配置说明

- `python-ai-service/.env`：DEEPSEEK_API_KEY / INTERNAL_KEY / JAVA_BASE_URL / REDIS_URL /
  LLM_MOCK / TEXTBOOKS_DIR / BGE_M3_PATH / CHROMA_DIR（.env.example 为模板，真实 .env 不入库）
- `java-backend/src/main/resources/application.properties`：DB 连接（生产改环境变量注入）、
 INTERNAL_KEY（与 Python 同值）、JWT 密钥
- 前端经 Vite 代理 /api→8080（vite.config.ts），生产部署可 dist+nginx 反代同规则

## 0.3 首次启动冒烟（顺序即验证链）

1. `curl :8080/actuator/health` → 200
2. `curl :8000/health` → 200 且 chroma/bge LOADED
3. `curl :5173/` → 200
4. 登录 demo → /lab 搭物块+地面 → ▶ 运行 → 曲线出现（对应 e2e/builder-smoke.py 可直接跑）
5. `/exp/gk-accel-selector-b` → 讲解本题 → AI 深讲（对应 e2e/gk-solver-check.py）

## 0.4 常见问题排查

| 症状 | 原因 | 处置 |
|---|---|---|
| 8080 起不来：Port in use | 旧进程未退 | `netstat -ano | findstr :8080` → taskkill /PID |
| Flyway validate 失败 | 库与迁移版本漂移 | 核对 flyway_schema_history；新库直接重建 |
| 8000 health 200 但 chroma NOT_LOADED | data/chroma 不存在 | 跑 build_kb.py；查 CHROMA_DIR 指向 |
| AI 全部 fallback（在线灯红） | DEEPSEEK_API_KEY 缺/失效 | .env 配 key 重启；验证法见 §2 |
| 页面白屏 console 404 /api | Vite 代理目标不对/Java 未起 | vite.config.ts proxy + :8080 探活 |
| WS 连接失败 toast | 代理 ws 配置/偶发竞态 | 确认 /ws 代理 ws:true；前端已有自动重连（≤2 次退避） |

---


## AI 服务（python-ai-service · 8000 端口）

### 1. 依赖与启动

```bash
cd python-ai-service
# 首次：poetry 安装（Python 锁 3.12）
poetry env use "E:\Program\Python312\python.exe"
poetry install
# 日常启动（仅内网，不对前端暴露；经 Java /api/v1/* 转发）
.venv/Scripts/python.exe -m uvicorn physicene_ai.main:app --port 8000
```

- 嵌入模型 bge-m3：`BGE_M3_PATH` 指向本地目录（当前 `E:\Program\models\bge-m3`），启动即加载
- OCR（paddle）懒加载：首次 OCR 请求时加载（health 中 paddle_ocr=NOT_LOADED 属正常）
- 健康检查：`GET /:8000/health` → 200，components 三项状态

### 2. LLM key（BYOK · 2026-10-12 定案：部署者自带，费用自付）

1. **申请 key**：https://platform.deepseek.com/ 注册 → 充值 → 创建 API key（sk-xxx）
2. **配置**：`python-ai-service/.env` 写 `DEEPSEEK_API_KEY=sk-xxx`，重启 AI 服务
   （`.env` 不入库——.gitignore 已排除；步骤详见 README「AI 配置」）
3. **费用由部署者承担**：参考 1.5-2.2k token/次；限流默认保守（每学生 50 次/天，
   `AGENT_DAILY_QUOTA` 可调；并发 10，`AGENT_MAX_CONCURRENCY`）
4. **无 key 时的行为（clone 后常态）**：AI 问答按钮 → 显式提示"请先配置 DeepSeek API
   key（见 README「AI 配置」章节）"（KEY_MISSING，非"服务繁忙"）；内置讲解/解题模板/
   仿真/回放全部可用，仅 AI 成文受限
5. `INTERNAL_KEY`（Java↔Python 内部鉴权，前端不可见）同 .env 配置；验证：
   `POST /agent/chat` 一次调用 `fallback=false` 即 key 有效

### 3. 无 key / 服务不可用时的降级

- 教材 AI 助教（AiTutor）：回退内置讲解（hint 三级 + 步骤 goal/hint），UI 标注
  "AI 服务暂不可用，以上为内置讲解"
- B10 讲解器（SolutionExplainer）：模板九段本就本地实时计算，AI 深讲按钮回退提示，
  讲解完整性不受影响
- OCR：降级提示 + 建议手动搭建（degraded/fallbackHint）
- 仿真/回放/数据面板：完全不依赖 AI 服务

### 4. 成本与限流（阶段 0·追问 4 · 2026-10-11 补全）

**单次用量的依据（估算方法）**：DeepSeek 中文约 1 token/字。实测样本——输出 250-747 字
（≈250-750 token）；输入 = 系统提示（意图分流规则 ~600 字）+ RAG 上下文（3 片段 × 200 字）
+ 问题 ≈ 1000-1500 token。合计 **1.5-2.2k token/次**（此前写的 1.5-2.5k 为上限含完整讲解）。

**100 学生 × 50 次/天 = 5000 次/天**：输入 ≈ 6M + 输出 ≈ 2.5M token/天。
按官方牌价代入公式：`日成本 ≈ 6×输入单价 + 2.5×输出单价`（单价以 DeepSeek 官网当日为准；
按历史量级 ¥1-4/M 输入、¥2-16/M 输出估算 ≈ **¥10-60/天**）。嵌入检索本地推理零 API 成本。

**限流（A2 落地；BYOK 定案后默认保守 · 2026-10-12）**：
1. **每学生日配额**：默认 **50 次/天**（BYOK 保护部署者；`agent.daily-quota` 属性 / `AGENT_DAILY_QUOTA` 环境变量 / `--agent.daily-quota=N` 启动参数可调）；按日自动重置
2. **全局并发上限**：默认 10 in-flight（`agent.max-concurrent` / `AGENT_MAX_CONCURRENCY`）
3. **超额行为（显式不静默）**：配额尽 → 回复"今日 AI 额度已用完（每学生每日 N 次，明日
   自动重置）——仍可使用「直接讲解」内置内容与解题模板"；并发满 → "AI 正忙，请几秒后重试"；
   前端经 GATEWAY 透传原样展示（E2E：ai-quota-check.py 实测第 3 问显式提示）
4. 观测：limiter 快照随日志输出（usersToday/quota/concurrentAvail）；缓存作为后续优化非必须

### 5. 知识库重建

```bash
cd python-ai-service
# 教材 PDF 放 TEXTBOOKS_DIR（.env），然后：
.venv/Scripts/python.exe scripts/build_kb.py            # 全部教材
.venv/Scripts/python.exe scripts/build_kb.py --volumes 1  # 只建必修一
```

- 产物：Chroma collection（`CHROMA_DIR`，默认 data/chroma）；换教材版本后需重建
- 验证：中文提问 3 条均出"教材出处"引用（人教版·册·章·页）——英文提问召回弱属已知
  特性（bge-m3 跨语言阈值），非故障
