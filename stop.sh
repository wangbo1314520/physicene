#!/bin/bash
cd "$(dirname "$0")"
docker compose down
echo "✅ 已停止（数据保留在 mysql-data 卷）"
