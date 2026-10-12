#!/bin/bash
cd "$(dirname "$0")"
echo "⚠️  将删除所有数据（MySQL 数据卷）"
read -p "确认？(y/N) " confirm
if [ "$confirm" = "y" ]; then
  docker compose down -v
  echo "✅ 已清空"
fi
