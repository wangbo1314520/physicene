# Docker 部署指南

一条命令启动：`cp .env.example .env && docker compose up -d` → http://localhost

## 架构图

```
┌─────────────────────────────────────┐
│         用户浏览器                   │
│      http://localhost:80            │
└──────────────┬──────────────────────┘
               │
        ┌──────▼──────┐
        │  frontend   │ :80 (唯一暴露端口)
        │  (nginx)    │  静态 dist + SPA fallback
        └──────┬──────┘
               │ /api /ws（反代）
        ┌──────▼──────┐
        │  backend    │ :8080 (内网)
        │  (Java)     │  Flyway 自动建表
        └──┬───────┬──┘
           │       │
    ┌──────▼──┐ ┌─▼──────┐
    │  mysql  │ │   ai   │ :8000 (内网)
    │  :3306  │ │(Python)│  BYOK LLM 问答
    └─────────┘ └────────┘
```

## 端口分配

| 服务 | 容器端口 | 宿主暴露 |
|---|---|---|
| frontend | 80 | ${FRONTEND_PORT}（默认 80） |
| backend | 8080 | 不暴露（经前端反代） |
| ai | 8000 | 不暴露（backend 内网调用） |
| mysql | 3306 | 不暴露 |

## 环境变量清单（.env）

| 变量 | 用途 | 默认 |
|---|---|---|
| MYSQL_ROOT_PASSWORD | MySQL root 密码 | changeme_root_password（必改） |
| MYSQL_DATABASE | 数据库名 | physicene |
| MYSQL_USER / MYSQL_PASSWORD | 应用账号 | physicene / changeme_password（必改） |
| JWT_SECRET | JWT 签名密钥 | changeme…（必改） |
| AI_INTERNAL_KEY | Java↔Python 内部密钥 | changeme_internal_key（建议改） |
| DEEPSEEK_API_KEY | DeepSeek key | 空=AI 提示配置（BYOK） |
| AI_MODE | AI 档位 | slim |
| FRONTEND_PORT | 前端宿主端口 | 80 |

## AI 两档说明

| 档位 | 镜像大小 | 含 OCR | 含 RAG | 验证状态 |
|---|---|---|---|---|
| slim（默认） | ~200MB | ❌ | ❌ | ✅ 已实测（P4 全链冒烟） |
| full | ~5GB | ✅ | ✅ | ⚠️ **未完整验证**（理论支持；torch CPU 轮子+模型/知识库卷另需配置） |

切换：`.env` 改 `AI_MODE=full` → `docker compose up -d --build ai`。
full 档的 RAG 还需挂载 bge-m3 模型卷（BGE_M3_PATH）与自建 Chroma 卷（教材 PDF 有版权
不分发，用户自行 build_kb）——完整步骤见 python-ai-service/README。

## 数据持久化

数据在 named volume `physicene-mysql-data`：
- `docker compose down` → 数据保留（P4 实测：down/up 后 15 表与账号俱在）
- `docker compose down -v` → 数据清空（= ./reset.sh）
- 备份：`docker compose exec mysql mysqldump -u root -p${MYSQL_ROOT_PASSWORD} ${MYSQL_DATABASE} > backup.sql`

## 常见操作

| 操作 | 命令 |
|---|---|
| 启动 | `docker compose up -d`（或 ./start.sh） |
| 停止（留数据） | `docker compose down`（或 ./stop.sh） |
| 重置（清数据） | `docker compose down -v`（或 ./reset.sh） |
| 看日志 | `docker compose logs -f`（或 ./logs.sh） |
| 单服务日志 | `docker compose logs -f backend` |
| 进容器 | `docker compose exec backend sh` |
| 重建单个服务 | `docker compose up -d --build backend` |
| 更新代码 | `git pull && docker compose up -d --build` |

## 构建加速（国内网络，可选）

三个 Dockerfile 均支持 ARG 换源，受限网络实测有效：
```bash
docker compose build \
  --build-arg MAVEN_MIRROR=https://maven.aliyun.com/repository/public \
  --build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
  --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com
```

## 计时口径说明（不冒充）

P4 本机实测 ~4 分钟为 **override 模式**（宿主预构建 dist + 复用 maven 基底 + 国内源）。
用户默认场景 = 容器内完整构建（node 阶段 pnpm install+build），**未经本机实测**（受限
网络拉不动 node:22-alpine 基座）；README 口径"10-20 分钟（良好网络 4-10）"为估算。

## 常见问题

见 [Docker-FAQ.md](Docker-FAQ.md)
