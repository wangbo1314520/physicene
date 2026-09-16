# PhysiScene · AI Agent 智能物理实验平台

面向高中物理教育的 AI Agent 智能实验平台毕业设计项目。
核心初衷（2026-09-17 定稿）：**帮助学习**——老师自由搭建或在库里找实验投屏讲解，学生用同一套东西自学、做题验证、探究；不会的问题与解题思路由 AI 直接解答。不做教师批阅 / 考试评分。

三大产品线：实验库 `/exp`（教材 55 实验 + 真 AI 助教）· 高考竞赛场景 `/gaokao`（v3.1 清单 65 卡 + AI 解题讲解器）· 自由搭建实验 `/sandbox`（89 元件 → 场景识别 → 内嵌求解器 + AI 助手；刚体实验台 `/lab`）。
核心能力：自由搭建场景 + 物理引擎仿真 + AI Agent 对话 + RAG 教材知识库 + OCR 拍照识题 + 数据/坐标纸/导出。

> 需求基线：`docs/01-需求规格说明书_v3.4.1.md`（已冻结，任何需求变更须新开版本号）

## 仓库结构（Monorepo）

```
physicene/
├── java-backend/          # Java 主后端（Spring Boot 4.1.0 + dyn4j + WebSocket）
├── python-ai-service/     # Python AI 服务（FastAPI + LangChain + DeepSeek + RAG/OCR）
├── frontend/              # 前端（Vue3 + TypeScript + Three.js 2.5D）
├── docs/                  # 设计文档（需求 / 系统设计 / 接口契约 / 任务清单）
├── scripts/               # 辅助脚本（init-db.sql、start-all 等）
├── docker-compose.yml     # 一键启动（后续周补全）
└── README.md
```

## 开发环境

| 工具 | 版本 | 调用方式 |
|---|---|---|
| JDK | 17 | `java`（系统） |
| Maven | 3.9.9 | `mvn`（系统） |
| Python | **3.12.7** | `py -3.12`（系统默认 3.14 保留不动） |
| Poetry | 2.4.3 | `E:\Program\Python312\Scripts\poetry.exe` |
| Node | 24 / pnpm 11 | `pnpm` |
| Docker | 28 | 第三周（MySQL 8.4 / Redis 7.4）起使用 |

## 启动命令（三端）

```bash
# Java 主后端（8080）
cd java-backend && mvn spring-boot:run

# Python AI 服务（8000，仅内网）
cd python-ai-service && poetry run uvicorn physicene_ai.main:app --reload --port 8000

# 前端（Vite 开发服务器）
cd frontend && pnpm dev
```

## 关键约束（来自冻结需求）

- Spring Cloud 必须 **2025.1.2+**，否则与 Spring Boot 4.1.0 启动即报错（V6 验证项）
- Python 锁 **3.12**（PaddleOCR/sentence-transformers 生态，V5 验证项）
- API 密钥一律走 `.env`（已 gitignore），不进代码
- Java 功能分包：scene/physics/analysis/report/profile/teacher/ai/common，跨包只走 DTO 与接口
