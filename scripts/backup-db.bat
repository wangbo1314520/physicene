@echo off
rem PhysiScene 数据库备份（MySQL 周末被重置事故的教训）
rem 用法：双击运行 或 定时任务调用；备份保留最近 30 份
setlocal
set MYSQLDUMP="C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
set DIR=E:\Program\physicene\backups
set PWD=123456

if not exist %DIR% mkdir %DIR%
for /f "tokens=1-3 delims=/- " %%a in ("%date%") do set D=%%a%%b%%c
for /f "tokens=1-2 delims=:." %%a in ("%time: =0%") do set T=%%a%%b
set FILE=%DIR%\physicene_%D%_%T%.sql

%MYSQLDUMP% -uroot -p%PWD% --databases physicene --add-drop-database --routines > %FILE% 2>nul
if %errorlevel% neq 0 (
  echo 备份失败，请检查 MySQL 是否运行
  exit /b 1
)
echo 备份完成: %FILE%

for /f "skip=30 delims=" %%f in ('dir /b /o-d %DIR%\physicene_*.sql 2^>nul') do del %DIR%\%%f
endlocal
