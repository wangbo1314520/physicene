@echo off
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env >nul
  echo 已生成 .env 文件
  echo 请编辑 .env 修改密码后重新运行 start.bat
  pause
  exit /b 0
)
echo 启动中（首次构建 5-10 分钟）...
docker compose up -d
echo.
echo 服务已启动
echo 前端访问：http://localhost
echo 查看日志：docker compose logs -f
pause
