#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "⚠️  已生成 .env 文件"
  echo "请编辑 .env 修改密码后重新运行 ./start.sh"
  exit 0
fi
echo "🚀 启动中（首次构建 5-10 分钟）..."
docker compose up -d
echo ""
echo "✅ 服务已启动"
echo "   前端访问：http://localhost:$(grep '^FRONTEND_PORT=' .env | cut -d= -f2 || echo 80)"
echo "   查看日志：./logs.sh"
echo "   停止服务：./stop.sh"
