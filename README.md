# PhysiScene · AI Agent 智能物理实验平台

面向高中物理（人教版 2019）的仿真实验平台：**120 张实验卡**（教材 55 + 高考 65）+
自由搭建台 + AI 助教/解题讲解。三端架构：Vue3 前端（three.js 渲染）+ Java 后端
（dyn4j 刚体物理/电路 MNA）+ Python AI 服务（DeepSeek + 教材知识库 RAG）。

![搭建台](frontend/e2e/shots/render-bugs/loop-gap.png)

## 功能

- **实验库**（/exp）：120 卡——教材实验（步骤+AI 助教按问法分流）与高考多过程题
  （九段解题模板 + 🤖 AI 深讲成文推导）
- **自由搭建**（/lab）：85 种元件拖拽/连线/设参，多引擎路由（刚体/电磁场/电路 MNA/
  热学/光学/近代/天体/交变），云端保存/深链/回放时间轴
- **AI**：意图分流问答（问答案→答案+推理；求方法→分步；验证→纠错）、场景识别诊断
  （"我搭的对吗"）、OCR 拍照识题、教材出处引用（Chroma RAG）

## 依赖

Node ≥24 + pnpm 11 · Java 17 + Maven · MySQL 8 · Python 3.12（poetry）· DeepSeek API key

## 运行

详见 [docs/deployment.md](docs/deployment.md)（从零安装/配置/冒烟/排查）。速览：

```bash
mysql -e "CREATE DATABASE physicene"                 # ① 建库（Flyway 自动迁移）
cd java-backend && mvn package -DskipTests && java -jar target/*.jar   # ② 后端 8080
cd ../python-ai-service && poetry install && .venv/Scripts/python -m uvicorn physicene_ai.main:app --port 8000  # ③ AI（配 .env）
cd ../frontend && pnpm install && pnpm dev           # ④ 前端 5173
```

## AI 配置（BYOK——自带 DeepSeek key，费用由部署者承担）

1. 到 https://platform.deepseek.com/ 注册并充值，创建 API key（形如 `sk-xxx`）
2. 复制模板：`cp python-ai-service/.env.example python-ai-service/.env`，填入
   `DEEPSEEK_API_KEY=sk-xxx`，重启 AI 服务（`.env` 已被 .gitignore 排除，不会入库）
3. **不配 key 也能跑**：仿真/实验/内置讲解/解题模板/回放全部可用；点 AI 问答会得到
   显式提示"请先配置 DeepSeek API key"，不是静默失败
4. 费用参考：约 1.5-2.2k token/次问答；系统默认限流每学生 50 次/天 +
   全局并发 10（`AGENT_DAILY_QUOTA` / `AGENT_MAX_CONCURRENCY` 可调），超额有明确提示

## 目录

```
frontend/     Vue3 + three.js（搭建台/实验框架/TS 物理引擎/85+ E2E 脚本）
java-backend/ Spring Boot + dyn4j（物理/场景/回放/WS）
python-ai-service/ FastAPI（DeepSeek agent/OCR/RAG 知识库）
docs/         交付文档（部署/监控/安全/回滚/各阶段报告）
```

## 测试

```bash
cd frontend && npx vitest run          # 373 单测
cd java-backend && mvn test            # 117 单测
cd frontend && python e2e/builder-check.py   # 69 模板 E2E（全套清单见 docs）
```

## License

MIT（教材 PDF 等版权资料不入库，见 .gitignore）
