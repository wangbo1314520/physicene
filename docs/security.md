# 安全清单（阶段 3.3 · 2026-10-11）

## 1. 凭据与密钥

| 项 | 现状 | 动作 |
|---|---|---|
| admin 初始密码 | 上线前必改（SQL：`UPDATE user SET password=<bcrypt(新密码)> WHERE username='admin'`） | ☐ 上线执行 |
| demo/demo1234 | 种子演示号（V2 迁移内置） | 上线评估：保留教学演示或改随机密码 |
| DB root/123456 | 本地开发默认；生产改强密码 + 仅本机监听 | ☐ 上线执行 |
| .env（DEEPSEEK_API_KEY/INTERNAL_KEY） | .gitignore 已排除（python-ai-service/.env） | 上传前核对（见 §4） |
| application.properties | 检查无真实密钥入库（INTERNAL_KEY 等走环境变量） | 已核（本文件 §4 流程复跑） |
| MySQL_PWD | 备份脚本经环境变量传递，不落明文 | ✓ |

## 2. 注入与 XSS 防护

- SQL：全量 JPA/预编译（Repository 接口无字符串拼接）；Python 端 ORM 无裸 SQL（grep 复核）
- XSS：Vue 模板默认转义；唯一 `v-html` 在 SandboxAi 消息渲染（AI 回复文本经
  `replace(/\*\*(.+?)\*\*/g,'<b>$1</b>')` 处理——**已审：仅插入 `<b>` 标签，用户输入的
  `<script>` 经 Vue 文本插值转义后不进入 v-html 源串**；AI 回复源为 DeepSeek，风险低）
- 路径注入：OCR 上传走 multipart 临时文件；教材 PDF 路径来自 .env 配置非用户输入

## 3. JWT 与接口权限

- JWT 过期：登录签发（JwtUtil）；**过期时间核实项**——上线前确认 exp 设置（如 2h）与
  刷新策略（当前无 refresh：过期重登，教学场景可接受）
- 权限：场景/记录按 creatorId 归属校验（loadOwned 403）；WS 握手 token+simId 归属
  双校验（4001/4003）；内部接口（Python）X-Internal-Key（前端不可见）
- CORS/端口：Python 8000 仅 127.0.0.1 监听，不对公网暴露；Java 8080 为唯一入口

## 4. GitHub 上传前 secrets 清理指引（三类）

1. **密钥**：`git log --all -S "DEEPSEEK" -S "INTERNAL_KEY" -S "sk-"` 逐个复核命中
   （.env 若曾入库需 filter-repo；当前 .gitignore 已排除且历史扫描见 GitHub-上传检查报告）
2. **密码**：`git log -S "123456" --all`（DB root 密码曾出现在文档/脚本示例中的，
   以"开发默认"标注可接受；生产密码永不入库）
3. **LLM key**：`git log -S "apiKey" --all` + 上传前 `git grep -r "sk-[A-Za-z0-9]"` 复核

## 5. 依赖漏洞扫描（2026-10-11 实测）

- 前端：`pnpm audit --prod --registry=https://registry.npmjs.org` → 初扫 **1 high**
  （source-map-js@1.2.1 事件循环 DoS，@vue/compiler 构建链传递依赖）→ pnpm-workspace.yaml
  overrides 升 ≥1.2.2 → **No known vulnerabilities found** ✓（回归：vitest 373/373 · tsc 0 错）
- Java：`mvn dependency:analyze` 通过（无未声明/未用依赖告警）；OWASP dependency-check
  需下载 NVD 库（离线环境未跑）——**登记：联网环境跑一次
  `mvn org.owasp:dependency-check-maven:check`**（dyn4j/spring-boot 版本CVE 核对）
- Python：`pip-audit`（登记：venv 联网跑 `pip list --outdated` + pip-audit）

## 6. 上线前检查单

☐ admin 改密 ☐ 生产 DB 强密码 ☐ JWT exp 确认 ☐ Java 依赖 CVE 联网扫描 ☐ pip-audit
☐ HTTPS（反代终止）☐ 上传前 §4 三类历史扫描
