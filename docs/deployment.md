# 部署文档（PhysiScene）

> 状态：AI 章节先行（阶段 2·2E，2026-10-11）；环境要求/安装步骤/监控/回滚由阶段 3 补全。

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

### 2. LLM key

- `python-ai-service/.env`：`DEEPSEEK_API_KEY`（**不入库**——.gitignore 已排除 .env，
  上传 GitHub 前核对）；`INTERNAL_KEY`（Java↔Python 内部鉴权，前端不可见）
- Java 侧经环境变量/配置注入同值 INTERNAL_KEY（application.properties 不写真实值）
- 验证：`POST /agent/chat`（X-Internal-Key 头）一次调用，`fallback=false` 即 key 有效

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

**超预算限流/缓存方案（已登记 docs/待用户决策.md #2，未实现——上线后按实际用量决定）**：
1. Java 网关侧（/api/v1/agent/chat 转发前）：按 userId 日配额（建议 100 次/天）+ 全局并发
   上限（10 in-flight），超额返回明确提示（非静默），引导用内置讲解/模板（离线能力已在）
2. 缓存：同 (experimentId + 问题归一化) 命中直接复用——概念类问题 RAG 结果与画布参数无关
3. 观测：Python 端 logger 已记每次意图/耗时，接监控后按 token 计数出账（见 monitoring.md）

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
