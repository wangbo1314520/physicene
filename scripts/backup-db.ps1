# PhysiScene DB backup (Windows scheduled task path; Linux cron uses backup-db.sh)
# Retention: 7 days. Credentials via env MYSQL_PWD (prod: login-path, see 上线清单).
param([string]$BackupDir = "E:\Program\physicene-backups", [int]$KeepDays = 7)
$ErrorActionPreference = "Stop"
$db = "physicene"
$mysqldump = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $BackupDir "$db-$stamp.sql.gz"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
# dump to temp file, then gzip via .NET (no external dep)
$tmp = Join-Path $BackupDir "$db-$stamp.sql"
& $mysqldump -uroot --single-transaction --routines --triggers --databases $db | Out-File -Encoding utf8 $tmp
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed" }
$in = [System.IO.File]::OpenRead($tmp)
$gz = [System.IO.File]::Create($out)
$zs = New-Object System.IO.Compression.GZipStream($gz, [System.IO.Compression.CompressionLevel]::Optimal)
$in.CopyTo($zs); $zs.Dispose(); $in.Dispose(); $gz.Dispose()
# integrity: gzip opens + tail marker
$sr = New-Object System.IO.StreamReader((New-Object System.IO.Compression.GZipStream([System.IO.File]::OpenRead($out), [System.IO.Compression.CompressionMode]::Decompress)))
$tail = ""; while (-not $sr.EndOfStream) { $tail = $sr.ReadLine() }; $sr.Close()
if ($tail -notmatch "Dump completed") { Remove-Item $out; throw "integrity check failed" }
Remove-Item $tmp
Get-ChildItem $BackupDir -Filter "$db-*.sql.gz" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$KeepDays) } | Remove-Item -Force
Write-Output ("OK backup: {0} ({1:N1} MB), retention {2}d" -f $out, ((Get-Item $out).Length / 1MB), $KeepDays)
