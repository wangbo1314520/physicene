@echo off
set MYSQL_PWD=123456
powershell -NoProfile -ExecutionPolicy Bypass -File E:\Program\physicene\scripts\backup-db.ps1 >> E:\Program\physicene-backups\backup.log 2>&1
