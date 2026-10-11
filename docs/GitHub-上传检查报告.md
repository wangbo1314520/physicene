# GitHub 上传检查报告（最终版 · 今晚包 P3 · 2026-10-12）

| 步 | 检查 | 结果 | 证据 |
|---|---|---|---|
| 1 | .gitignore 三类防御 | ✅ | 版权（resources/textbooks|retypeset，目录从未入库+规则防御）、密钥（.env/.env.* + !example 白名单）、数据（*.sql.gz/备份/日志）——5 条规则实测 |
| 2 | 历史扫描 | ✅ | `--all -- resources/` **0 命中**（从未跟踪）；`-S apiKey` 仅文档变量名引用（security/deployment 合法说明）；`-S "sk-"` 代码文件 0 命中；HEAD `git grep -rE "sk-[A-Za-z0-9]{20}"` **空**。**无需 filter-repo** |
| 3 | LICENSE | ✅ | MIT（默认口径；换 Apache/私有只需换单文件） |
| 4 | README | ✅ | 项目+截图/依赖/运行（含 AI 服务）/目录/AI 配置（BYOK）/测试——BYOK 章节含申请/填 key/无 key 表现/费用限流 |
| 5 | 大文件 | ✅ | 最大 3.5MB（visual-verification webm 证据）；无 >100MB，无需 LFS |
| 6 | 推送前复核 | ☐ 用户执行 | `git grep -rE "sk-[A-Za-z0-9]{20}"` 复跑 + push 命令见下 |

## 遗留风险

1. demo/demo1234 种子号随迁移入库（教学演示用；生产改密见 security.md §1）
2. 教材 PDF 与仓库解耦 ✓——克隆方自备教材并 build_kb（README 有步骤）
3. push 前新提交需复跑密钥 grep（防新增带入）

## 结论：**可推送**

```bash
git remote add origin <你的仓库 URL>
git push -u origin feature/exp-b8      # 或先并 main 再推
```
