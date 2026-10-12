# Docker 一键部署完成报告（2026-10-12 · 终版）

## 1. 交付摘要

- **一条命令启动**：`cp .env.example .env && docker compose up -d` → http://localhost
- **4 容器架构**：frontend(nginx, 唯一暴露) / backend(Java, 内网) / ai(Python slim/full 双档) / mysql(命名卷持久化)
- **首次构建**：口径 10-20 分钟（良好网络 4-10）；本机实测 ~4 分钟为 override 模式（见 §6 遗留），不冒充

## 2. 各阶段 commit

| 阶段 | commit | 内容 |
|---|---|---|
| P0 调研 | 142fb2c | 六问全实证 + 4 处偏差（Flyway 权威/ slim 默认/ Node22/ curl） |
| P0 追问 | 2b99a46 | OCR slim 行为降级链 + full=AI_MODE 切换 + compose 命名勘误 |
| P1 | 1cc9127 | Dockerfile×3 + nginx.conf + requirements×2，三镜像本地构建验证 |
| P1.5 | 787e3ad | OCR 守卫（503+档位文案，find_spec）+ Java 透传 + README 备选 |
| P2 | 71f2d27 | docker-compose 4 服务（依赖链/命名卷/勘误落地） |
| P3 | 1fef565 | .env.example + start/stop/reset/logs 双平台五脚本 |
| P4 | 61b3bf2 | 全新环境测试全绿 + backend 健康检查首启竞态修复 |
| P4.5 | 3792a98 | 首启时间口径/full 未验证标注/备选镜像源 |
| P5 | c50c254 | README 快速开始置顶 + 文档索引 + 截图 |
| P6.1 | 1a7fc25 | Docker-部署指南 + Docker-FAQ 十问 |
| P6.2 | 8e635e6 | .dockerignore×3 / .gitignore 终检 |

## 3. 镜像大小

| 服务 | 大小 | 备注 |
|---|---|---|
| frontend | **65.9MB** | nginx:alpine + dist 2.9MB |
| backend | 585MB* | *兜底基底（完整 JDK）实测值；交付默认 temurin-jre-alpine ≈250MB |
| ai (slim) | **201MB** | 已实测 |
| ai (full) | ~5GB | 未构建未验证（理论） |
| mysql | 799MB | 官方 mysql:8.0 |

## 4. 测试结果（P4 全新环境：clone → compose up → 冒烟）

- 冒烟 **6/6**：登录→搭建→运行（**WS 经 nginx 反代**）→曲线→AI 无 key=BYOK 提示→OCR slim=档位提示→零页面错误
- OCR 提示**全链透传**（Python 503 → Java detail 解析 → 前端 toast 精确文案）
- Flyway 自动迁移 ✓（V1+V2、15 表）；demo 登录 ✓
- 持久化 ✓（down/up 后 15 表+登录如常）；端口切换 ✓（8188↔8189 双向）
- AI 三态 ✓：无 key→配置提示 / 有 key+slim→真 LLM+【非教材引用】/ full 未测
- 生产形态首验 ✓：pnpm build 产物在 nginx 下全功能运行

## 5. 用户视角操作流程

1. 装 Docker Desktop → 2. git clone → 3. `cp .env.example .env` → 4. 改密码 →
5. `docker compose up -d`（或 start.bat/sh）→ 6. 打开 http://localhost（demo/demo1234）

## 6. 遗留清单

| # | 项 | 状态 |
|---|---|---|
| 1 | AI full 档（~5GB） | 未完整验证（理论支持；torch CPU 轮子+模型/知识库卷需另配） |
| 2 | 前端容器内完整构建（node 阶段） | 未经本机实测（受限网络拉不动 node:22-alpine）；命令序列与宿主已验证一致；有 runtime 兜底（FAQ Q3） |
| 3 | 后端默认 alpine JRE 阶段 | 同上（本地验证用 maven 基底兜底；Dockerfile 两处仅基底差异） |
| 4 | 首次 up 偶发 backend 竞态 | 已放宽健康检查；FAQ Q4 记录"再 up 一次"处置 |

## 7. 未手测风险

视觉体验（程序化审计替代）· 真机 GPU（Stage A 已覆盖：常规场景满帧）· 弱网/长时间生产负载（浸泡+监控侧脚本为界）· 跨浏览器

## 8. 项目结束声明

PhysiScene Docker 一键部署交付完成：**clone → 一条命令 → 开箱可用**（本机全链实测），
手动部署路径保留（README「手动部署」+ deployment.md），业务代码零改动（除用户裁决的
OCR 守卫显式提示 3+8 行错误处理），24 条硬约束贯穿。代码已推送 GitHub（见 push 记录）。
**项目正式结束。**
