# 监控方案（阶段 3.2 · 2026-10-11）

定位：单机教学部署的**轻量观测**——不引 Prometheus 全家桶，用 Spring Boot Actuator
+ 结构化日志 + schtasks 侧脚本即可覆盖四层；升级路径附后。

## 1. 后端（Java 8080）

| 指标 | 采集 | 告警阈值建议 |
|---|---|---|
| 存活 | `GET /actuator/health`（scripts 探活 1 次/分钟） | 连续 2 次 ≠200 → 告警 |
| JVM 内存 | `/actuator/metrics/jvm.memory.used`（heap） | used>85% 持续 5 分钟 |
| DB 连接池 | `/actuator/metrics/hikaricp.connections.active` | active==maximum 持续 1 分钟 |
| API 延迟 | `/actuator/metrics/http.server.requests`（P95） | P95>1.5s 持续 5 分钟 |
| 仿真实例堆积 | 日志 `仿真结束`/`started` 差值（孤儿实例观测） | 运行中实例>50 |

## 2. 前端（Vite/dist 5173）

| 指标 | 采集 | 阈值 |
|---|---|---|
| 页面可载 | 探活 `GET /`（HTML 200） | 连续 2 次失败 |
| WS 连接数 | Java 日志 `afterConnectionEstablished` 频率侧写（或 netstat 8080 ESTABLISHED 计数脚本） | >150 |
| 前端错误率 | console.error 上报（可选：window.onerror→/api/log，未内置则抽检） | 上线后评估 |

## 3. AI（Python 8000）

| 指标 | 采集 | 阈值 |
|---|---|---|
| 存活 | `GET :8000/health`（components 三态） | 非 200 / chroma≠LOADED |
| token 消耗 | Python 日志按次记（当前记意图/耗时；**token 计数登记待加**：llm_client 响应 usage 字段落日志） | 日累计超预算（见 deployment.md §4 公式） |
| 响应时间 | 日志 `agent/chat` 耗时 | P95>15s |
| 失败率 | `fallback=True` 计数（LLM_UNAVAILABLE） | >10%/小时 |

## 4. 日志采集

- 落盘：Java `java -jar ... > java-<date>.log`（或 logback 文件 appender——当前 stdout
  重定向，**登记：logback.file 配置为上线项**）；Python uvicorn 同法；按日轮转 + 保留 14 天
- 集中式（可选升级）：单机场景无需 ELK；多机时 Filebeat→Loki 即可

## 5. 侧脚本（schtasks 每分钟，示例）

```bash
#!/usr/bin/env bash
# scripts/probe.sh —— 三端探活，失败写 /e/Program/physicene-backups/alerts.log
for u in http://localhost:8080/actuator/health http://localhost:5173/ http://127.0.0.1:8000/health; do
  curl -s -m 5 -o /dev/null -w "%{http_code} $u\n" "$u" | grep -q "^200 " || \
    echo "$(date +%F_%T) DOWN $u" >> /e/Program/physicene-backups/alerts.log
done
```
