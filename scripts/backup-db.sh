#!/usr/bin/env bash
# PhysiScene 数据库备份（上线清单·方案 B，2026-10-02 审查裁定）
# 用途：每日自动备份（cron/schtasks 调用）+ 变更前手动快照；保留最近 7 天。
# 凭据：不落明文——用环境变量 MYSQL_PWD（cron 里 source 一个 600 权限的 env 文件）或 mysql_config_editor login-path。
# 用法：scripts/backup-db.sh [备份目录]（默认 /e/Program/physicene-backups；Linux 服务器改为绝对路径）
set -euo pipefail

BACKUP_DIR="${1:-/e/Program/physicene-backups}"
DB="physicene"
KEEP_DAYS=7
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR}/${DB}-${STAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"
mysqldump -uroot --single-transaction --routines --triggers --databases "${DB}" | gzip > "${OUT}"
# 完整性自检（gunzip 能解 + 含末行完成标记）
gunzip -t "${OUT}" && zcat "${OUT}" | tail -1 | grep -q "Dump completed" || { echo "❌ 备份完整性校验失败：${OUT}"; exit 1; }
# 保留窗口：删 KEEP_DAYS 天前的本库备份
find "${BACKUP_DIR}" -name "${DB}-*.sql.gz" -mtime +${KEEP_DAYS} -delete
echo "✅ 备份完成：${OUT}（$(du -h "${OUT}" | cut -f1)），保留 ${KEEP_DAYS} 天窗口已清理"
