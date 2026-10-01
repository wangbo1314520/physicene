"""迁移 lint（2026-09-30 测点4 追问制度化——'页面迁移没全量扫脚本'同类第二次后的机械防线）：
规则 1：e2e 脚本 goto 旧 builder 路由 `{BASE}/exp"`（结尾引号=精确 /exp，非 /exp/{id} 实验运行路由）
        ——仅 p0-redirect-check.py 豁免（它测的就是重定向）
规则 2：builder 相关裸选择器（wait_for_selector 以 .builder/.palette 开头但无 .free-build-tab 前缀）
        ——P0 迁移后 builder 在 /lab 自由搭建 Tab 内，非作用域选择器会撞到隐藏 Tab 超时。
        范围说明（六轮追问2）：只查 builder 不是因为别的页面免疫，而是**只有 builder 经历过页内迁移
        （/exp 独立页 → /lab 内嵌 Tab）**；/sandbox(.sandbox 前缀)/实验运行页(.exp/.lab 多回退)/
        首页(.picker)的选择器本就以各自页面根类作用域。未来任何页面迁移须同步本规则的根类表。
规则 3：goto 目标必须在活路由清单 ROUTES 内（含 /exp/{id} 模式）——路由改名时本清单即迁移
        checklist：改路由必须同步此处，静态暴露所有 stale goto
规则 4（九轮追问4：第 4 次测试问题后制度化）：.palette .item 定位禁止 has_text（子串匹配会撞名
        ——'速度传感器'撞中'加速度传感器'）；必须精确文本匹配（_env.pick_item 模式）。
        Tab 按钮等无撞名风险处暂豁免（撞名即新增规则）
用法：python e2e/lint-migration.py（发现违规 exit 1；接入测点/批收尾矩阵）"""
import re
import sys
from pathlib import Path

E2E = Path(__file__).resolve().parent
EXEMPT_ROUTE = {"p0-redirect-check.py"}  # 测重定向本身
# 活路由清单（路由改名=迁移，必须同步此处并全扫脚本——2026-09-30 制度）
ROUTES = ("/lab", "/login", "/exp/{id}", "/")  # /exp、/sandbox 精确路由均已死（P0 重定向链 →/lab；sandbox-check.py 已随之删除）

violations = []
for f in sorted(E2E.glob("*.py")):
    if f.name.startswith("_") or f.name == Path(__file__).name:
        continue
    txt = f.read_text(encoding="utf-8", errors="ignore")
    # 规则 1+3：goto 目标解析（{BASE}/xxx 或 f"http://localhost:5173/xxx"）——tail 不含前导斜杠
    for m in re.finditer(r'goto\(\s*(?:f?["\'])[^"\']*?(?:\{BASE\}|localhost:\d+)/([^"\'{)]*)', txt):
        tail = m.group(1)
        line = txt.count("\n", 0, m.start()) + 1
        if f.name in EXEMPT_ROUTE:
            continue
        if tail == "exp":
            violations.append(f"{f.name}:{line} goto 旧 builder 路由 /exp（应 /lab+自由搭建 Tab）")
        elif not (tail == "" or tail in ("lab", "sandbox", "login")
                  or tail.startswith("exp/")):  # exp/ 后接 f-string 变量（{cid} 等）=实验运行路由
            violations.append(f"{f.name}:{line} goto 非清单路由 /{tail}（路由清单 ROUTES 或脚本有误）")
    # 规则 4：palette item + has_text（子串撞名）
    for m in re.finditer(r'\.palette \.item.{0,80}has_text=', txt):
        line = txt.count("\n", 0, m.start()) + 1
        violations.append(f"{f.name}:{line} palette item 用 has_text 子串匹配（撞名风险——须精确文本匹配）")
    # 规则 2：builder 裸选择器
    for m in re.finditer(r'wait_for_selector\(\s*[\'"](\.builder[^\s\'"]*|\.palette[^\s\'"]*)', txt):
        sel = m.group(1)
        if "free-build-tab" in sel:
            continue
        line = txt.count("\n", 0, m.start()) + 1
        violations.append(f"{f.name}:{line} builder 裸选择器 {sel}（须 .free-build-tab 前缀作用域化）")

if violations:
    print("❌ 迁移 lint 违规：")
    for v in violations:
        print("  " + v)
    sys.exit(1)
print("✅ 迁移 lint 通过（无旧 /exp 路由、无 builder 裸选择器、goto 全在活路由清单、无 palette has_text 撞名）")
