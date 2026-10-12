# Docker 常见问题（FAQ）

## Q1: 前端打不开（localhost 无响应）

1. `docker compose ps` → frontend 是否 healthy？
2. `docker compose logs frontend` → 有无报错？
3. 端口被占？→ 改 `.env` 的 `FRONTEND_PORT=8080` 再 `docker compose up -d`（P4 实测切换即时生效）

## Q2: 首次构建很慢

正常。首次需拉基础镜像 + 容器内构建：良好网络 4-10 分钟，受限网络 10-20 分钟；
第二次起秒级（镜像缓存）。

## Q3: 前端构建失败（拉 node:22-alpine 超时）

**表现**（实测样本）：`docker compose up` 卡在拉取层数分钟无进展（部分层
"Download complete" 后停住），或最终 `i/o timeout` / `EOF`。

**原因**：Docker Hub 国内访问被限速；且公共镜像源只对已缓存的层快，缺层仍回源受限。

**解决**：切国内镜像源——

**Linux**：
```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<EOF
{ "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"] }
EOF
sudo systemctl restart docker
```

**Windows / Mac（Docker Desktop）**：Settings → Docker Engine → 编辑 JSON 加
`registry-mirrors` → Apply & Restart

备选镜像源：`https://docker.mirrors.ustc.edu.cn`、`https://hub-mirror.c.163.com`、
`https://docker.1ms.run`

**兜底（宿主有 Node ≥22 时）**——跳过容器内 node 构建：
```bash
cd frontend && pnpm install && pnpm build && cd ..
docker build -t physicene-frontend-local --target runtime ./frontend
# 并在 docker-compose.override.yml 里给 frontend 服务加：build: {context: ./frontend, target: runtime}
docker compose up -d
```

## Q4: 数据库启动失败 / backend 报 unhealthy

1. `docker compose logs mysql` / `logs backend` 看具体错误
2. 首次启动 MySQL 初始化约 1 分钟；若首次 `up` 报
   "dependency failed to start: backend is unhealthy"——已知竞态，
   **再跑一次 `docker compose up -d` 即可**（backend 实际已 healthy）
3. 磁盘空间：`docker system df`

## Q5: AI 功能不可用

| 现象 | 原因 | 处置 |
|---|---|---|
| 提问返回"请先配置 DeepSeek API key" | BYOK 未填 key | `.env` 填 `DEEPSEEK_API_KEY` 后 `docker compose up -d` |
| 有 key 但回答带【非教材引用】 | slim 档无 RAG（正常） | 如需教材引用 → full 档（未完整验证） |
| OCR 提示"OCR 未安装（slim 档）——需 AI_MODE=full" | slim 档限制 | `.env` 改 `AI_MODE=full` 重建（见 Q9） |
| "AI 正忙/额度已用完" | 限流（每学生 50 次/天 + 并发 10） | 次日重置或调 `AGENT_DAILY_QUOTA` |

## Q6: 端口 80 被占

`.env` 改 `FRONTEND_PORT=8080` → `docker compose up -d` → 访问 http://localhost:8080

## Q7: 数据持久化 / 重置

数据在 named volume `physicene-mysql-data`：`down` 保留 / `down -v` 清空（./reset.sh）；
备份命令见 Docker-部署指南.md

## Q8: 如何更新代码

```bash
git pull
docker compose up -d --build
```

## Q9: 如何切换 full 档

`.env` 改 `AI_MODE=full` → `docker compose up -d --build ai`。
⚠️ ~5GB、首次构建慢、**未完整验证**；RAG 还需模型/知识库卷（见 Docker-部署指南.md AI 两档）

## Q10: 完全清理

```bash
docker compose down -v     # 停服务 + 删数据
docker system prune -a     # 删未用镜像（慎用）
```
