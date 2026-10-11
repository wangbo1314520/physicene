# GitHub 上传检查报告（阶段 5.6 · 2026-10-11）

## 六步证据

| 步 | 检查 | 结果 |
|---|---|---|
| 5.1 | .gitignore 三类排除 | ✅ 版权资料（resources/textbooks|retypeset——目录从未入库，规则已加为防御）、密钥（.env/.env.*，example 白名单）、数据（*.sql.gz/备份/日志） |
| 5.2 | 历史扫描 | ✅ `git log --all -- resources/` 空（从未跟踪）；`-S DEEPSEEK_API_KEY` 命中仅为文档**变量名**引用（deployment/security.md 合法说明）；`-S "sk-"`（py/ts/properties）空；HEAD `git grep sk-` 空。**无需 filter-repo** |
| 5.3 | LICENSE | ✅ MIT（任务包默认；如需 Apache/私有改 LICENSE 单文件即可） |
| 5.4 | README | ✅ 项目/功能/依赖/运行/目录/测试六节 + 截图 |
| 5.5 | 大文件 | ✅ 最大 3.5MB（visual-verification webm 证据）；无 >100MB，无需 LFS |
| 5.6 | 推送前核对 | ☐ 用户执行：`git remote add origin <url> && git push -u origin feature/exp-b8`（或并 main 后推） |

## 遗留风险

1. `git push` 前建议重跑 `git grep -rE "sk-[A-Za-z0-9]{20}"`（防新提交带入）
2. 教材 PDF（TEXTBOOKS_DIR）本地资源与仓库解耦 ✓，克隆方需自备教材并 build_kb
3. demo/demo1234 种子号随 V2 迁移入库（教学演示用；生产改密见 security.md §1）

**结论：可推送。**
