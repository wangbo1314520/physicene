# 回滚方案（阶段 3.4 · 2026-10-11 · 含实弹演练记录）

## 回滚三层

### 1. 代码回滚（git tag）

```bash
# 发布打点（已打：rollback-r1）
git tag rollback-rN && git push origin rollback-rN
# 回滚到某 tag（服务停机窗口内）
git checkout rollback-r1
cd java-backend && mvn -q package -DskipTests && # 重启 jar
cd ../frontend && pnpm install && pnpm build     # 若为 dist 部署
```

### 2. 数据库回滚（mysqldump 快照恢复）

```bash
export MYSQL_PWD=<强密码>
zcat /e/Program/physicene-backups/physicene-<STAMP>.sql.gz | mysql -uroot   # 全库恢复（覆盖）
# 或恢复到新库核对后切换（更稳）：
mysql -uroot -e "CREATE DATABASE physicene_verify;"
zcat <备份>.sql.gz | sed 's/`physicene`/`physicene_verify`/g' | mysql -uroot
```

### 3. 前端产物回滚

dist 部署模式：按 tag 重建 `pnpm build` 后替换目录；开发模式（Vite 直出）随代码
checkout 自动回滚，无独立产物层。

## 演练记录（2026-10-11 实弹）

| 步骤 | 结果 |
|---|---|
| `bash scripts/backup-db.sh` | ✅ 6.1M 快照落 `/e/Program/physicene-backups/physicene-20261011-193538.sql.gz`，完整性自检（gunzip -t + Dump completed 标记）通过 |
| 恢复到 scratch 库（sed 改库名法） | ✅ `physicene_scratch` 建库→灌入→核对：**experiment_scenario 121 行 == 生产 121；experiment_record 178 行**；抽样记录分布一致（scenario 137×39 条等）；核对后 DROP 清理 |
| git tag 打点 | ✅ `rollback-r1` @ 当前 HEAD |
| 历史 commit 可检出（worktree @ 4eca25b） | ✅ worktree checkout 成功（构建能力由该 commit 当日全量回归背书：tsc/vitest/E2E 全绿） |

## 备份验证（阶段 3.5）

- 脚本：`scripts/backup-db.sh`（bash）/ `backup-db.ps1`（Windows 计划任务）——每日
  schtasks 已在文档建议（保留 7 天窗口自动清理）
- 恢复测试：见上表 scratch 演练 ✅（**生产环境实测**：本机即生产开发一体环境）
- 建议节奏：每日 03:00 自动 + 大变更（迁移/批量改数据）前手动
