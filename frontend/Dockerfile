# PhysiScene 前端镜像 —— 两个构建目标：
#   build（默认，最后一阶段）：容器内完整构建（node 阶段 pnpm build → nginx）
#   runtime（--target runtime）：直接 COPY 宿主已构建的 dist/ → nginx
#     用途：网络受限拉不动 node 基座时/本地快速验证——需先在宿主跑 `pnpm build` 产出 dist/
# 国内加速（可选）：--build-arg NPM_REGISTRY=https://registry.npmmirror.com

# ── Node 构建阶段（Vite 8 要求 ≥20.19/≥22.12，故 22-alpine）──
FROM node:22-alpine AS node-builder
ARG NPM_REGISTRY="https://registry.npmjs.org"
WORKDIR /app
RUN npm install -g pnpm@11 --registry ${NPM_REGISTRY}
# 依赖清单先行（缓存友好）：pnpm11 的 overrides 在 pnpm-workspace.yaml——必须一并拷入
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --registry ${NPM_REGISTRY}
COPY . .
RUN pnpm build

# ── runtime 目标：宿主预构建 dist（跳过 node 阶段）──
FROM nginx:alpine AS runtime
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1

# ── build 目标（默认/最终阶段）：容器内构建 dist ──
FROM nginx:alpine AS build
COPY --from=node-builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://localhost/ || exit 1
