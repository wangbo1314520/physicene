# Sealos 前置调研（P0 · 2026-10-12 · 只调研不写代码）

## 五问答复

### 1. Sealos 支持 Java + Node + Python 三种服务吗？

**支持任意 Docker 镜像**——Sealos 是 K8s 底座的云操作系统，App Launchpad 部署的是
**镜像仓库里的现成镜像**（支持国内外所有 registry），与语言无关。另有 **DevBox**
（导入 GitHub/Gitee 仓库 → 装依赖 → 起 → 暴露预览地址）面向源码开发场景，但那是
**开发环境**，不是生产部署通道。

> ⚠️ **推翻任务包一个假设**：Sealos App Launchpad **没有"从 GitHub 直接部署"按钮**。
> "连 GitHub → 点部署"是 Railway/Render 的模式；Sealos 上从源码到生产必须先有镜像。
> 详见"部署路径裁决"节。

### 2. Sealos 的 MySQL 怎么起？

**托管数据库服务**（控制台 数据库 → 新建 → MySQL），创建后自动提供内网连接串
（host/port/user/password，内网 DNS 直连，无需暴露公网）。实测社区教程（CSDN 2025-06
Java 部署指南）流程即"先建 MySQL 实例拿连接串 → 部署应用时注入环境变量"。
计费：新用户有试用额度，长期按量计费（小规格量级约 ¥0.1-0.3/小时——**注册时以控制台
实际报价为准**，此处不作承诺）。

**本项目适配**：后端用 MySQL 8 + Flyway（首次启动自动建表），Sealos MySQL 8 完全兼容，
**零数据库改动**（符合硬约束）。Redis 为可选项（本地开发验证过后端不依赖 Redis 即可跑）。

### 3. 项目能打成 1 个 Docker 镜像吗？

**技术上可以**（三服务一镜像：Nginx 静态前端 + Java 后端 + Python AI，supervisord 同起，
暴露 80 一个端口即可——Nginx 反代 /api 与 /ws 到容器内 8080）。预估镜像 1.2-1.5GB
（JRE17 + Nginx + Python3.12 + 依赖）。

**但有一个绕不开的约束——AI 服务两块重资产不能进镜像**：
- **bge-m3 嵌入模型 ~2.3GB**（RAG 检索用）：打进镜像 = 4GB 级，推送/拉取不现实
- **教材知识库 Chroma**（源为版权 PDF，**法律上不可分发**——本项目 .gitignore 特意排除
  resources/textbooks 就是这个原因）

**结论**：一键镜像里的 AI 服务跑**降级档**——无 RAG（回答带【非教材引用】标注）、
BYOK key 由用户注入后可用真 LLM。这与我们已建成的降级链完全吻合（无 key 显式指引 /
RAG 缺失时 LLM 直答）。要完整 RAG 需挂载模型与自建 KB——超出"一键"范畴，指南里作
可选进阶节。

### 4. 需要 3 个独立服务吗？（Sealos 支持多服务组合吗）

**支持**：多个应用分别部署 + 内网 DNS 互联（教程实测模式），也可一个 Launchpad 应用
多容器。但对"注册→点部署→拿链接"的目标，**每多一个服务 = 用户多 3-5 步操作**。

**推荐：方案 A 单镜像**（前端+后端+AI 合一，supervisord）——用户只部署 1 个应用、
填 1 组环境变量、拿 1 个链接。代价仅是镜像偏大与三服务同生死（教学场景可接受；
本项目无水平扩缩需求）。

### 5. 环境变量怎么注入？

Launchpad 部署表单里逐项填写（或模板 YAML 批量注入）。本项目需要注入的：

| 变量 | 用途 | 来源 |
|---|---|---|
| SPRING_DATASOURCE_URL/USERNAME/PASSWORD | Java 连 MySQL | Sealos MySQL 连接串拆填 |
| JWT_SECRET | 登录令牌签发 | 用户自拟随机串 |
| INTERNAL_KEY | Java↔Python 内部鉴权 | 用户自拟（两侧同值，镜像内默认对齐） |
| DEEPSEEK_API_KEY | BYOK（可选） | 用户自己的 key；不填则 AI 显式降级 |
| TZ=Asia/Shanghai | 时区（回放时间戳） | 固定值 |

---

## 部署路径裁决（P1 前必须确认的决策点）

任务包步骤 3"应用 → 从 GitHub 部署"在 Sealos **不存在此入口**。三条现实路径：

| 路径 | 用户操作 | 优 | 劣 |
|---|---|---|---|
| **A. GitHub Actions 自动构建 → ghcr.io → 用户贴镜像 URL**（推荐） | 连 GitHub → 点一次 Actions Run → 复制镜像地址 → Launchpad 粘贴 | 全在用户账号内（ghcr 用内置 GITHUB_TOKEN 免配置）、仓库自含一切 | 首次构建 ~10 分钟 |
| B. 我方预构建推公共镜像仓库，用户直接贴 | 1 步 | 需要公共仓库账号推 1.5GB；后续更新依赖我方 | |
| C. DevBox 导入仓库跑 | 少 | 开发环境非生产；三服务+模型配置复杂，非"一键" | |

**推荐 A**：仓库加 Dockerfile + `.github/workflows/docker-build.yml`（ghcr.io/<owner>/physicene，
tag=branch名）+ `deploy.template.yaml`（Sealos 部署模板，可配合官方 Deploy on Sealos 扩展）。
用户流程 = 注册 Sealos → 建 MySQL → 点 Actions 构建 → Launchpad 贴镜像+环境变量 → 拿链接。

## P1 待办预告（确认后执行）

1. 全栈 Dockerfile（多阶段构建：frontend dist → nginx；java jar；python venv；supervisord）
2. nginx.conf（/、/api→8080、/ws→8080 websocket upgrade）
3. supervisord.conf（nginx + java -jar + uvicorn 三进程）
4. .github/workflows/docker-build.yml（push 到 ghcr）
5. deploy.template.yaml（Sealos 模板：镜像占位+环境变量清单）
6. 本地 Docker 构建验证（若本机有 Docker；否则 Actions 构建验证）
7. docs/Sealos-部署指南.md（截图级用户清单）+ README 顶部入口

## 已知风险

- cloud.sealos.io 试用额度与 MySQL 计费以注册时页面为准（调研无法替代实测）
- flaky 网络下 1.5GB 镜像首次拉取慢（Sealos 节点在国内，ghcr.io 拉取速度需实测；
  备选：Actions 同时推 阿里云 ACR 个人版）
- AI 降级档的预期管理须写进指南首页（避免用户以为坏了个功能）
