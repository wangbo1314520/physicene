# PhysiScene AI 服务双档镜像（P0 调研问 4：重依赖全懒加载 → slim 可降级运行）
#   slim（默认）：核心依赖 ~250MB——LLM 问答可用（BYOK）；RAG/OCR/KB 降级
#   full：全量依赖（RAG/OCR 完整；需另挂 bge-m3 模型卷与自建 Chroma 卷）
# 切换：.env AI_MODE=full → docker compose up -d --build（compose build.target）
#
# 国内构建加速（可选）：--build-arg APT_MIRROR=mirrors.tuna.tsinghua.edu.cn \
#   --build-arg PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple

FROM python:3.12-slim AS slim
# apt 强制 https（部分网络劫持 80 明文源返回 503）；APT_MIRROR 非空时换国内源
ARG APT_MIRROR=""
RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
    && if [ -n "$APT_MIRROR" ]; then sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; fi \
    && apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home app
WORKDIR /app
ENV PYTHONPATH=/app/src \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=Asia/Shanghai
ARG PIP_INDEX_URL="https://pypi.org/simple"
COPY requirements-core.txt ./
RUN pip install -i ${PIP_INDEX_URL} -r requirements-core.txt
COPY . .
RUN mkdir -p /app/data && chown -R app:app /app/data
USER app
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD curl -fsS http://localhost:8000/health || exit 1
CMD ["uvicorn", "physicene_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]

# ── full 档：在 slim 之上补全 RAG/OCR 依赖（torch 先走 CPU 索引防 CUDA 巨轮）──
FROM slim AS full
USER root
ARG PIP_INDEX_URL="https://pypi.org/simple"
RUN pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install -i ${PIP_INDEX_URL} --no-cache-dir -r requirements.txt
USER app
CMD ["uvicorn", "physicene_ai.main:app", "--host", "0.0.0.0", "--port", "8000"]
