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

### 4. 成本预估（估算值，按 2026-10 实测样本）

- 单次问答：输入（RAG 上下文+系统提示）约 1.0-1.5k token，输出约 300-700 token
  （完整讲解 600-900）；合计约 1.5-2.5k token/次
- DeepSeek 现行定价量级下 ≈ 每次不到 1 分钱；50 学生×每课时 20 问 ≈ 数元/课时
- 嵌入检索（bge-m3）本地推理，零 API 成本；Chroma 本地持久（data/chroma）

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
