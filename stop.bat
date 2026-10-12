@echo off
cd /d "%~dp0"
docker compose down
echo 已停止
pause
