"""迁移 lint（2026-09-30 测点4 追问制度化——'页面迁移没全量扫脚本'同类第二次后的机械防线）：
规则 1：e2e 脚本 goto 旧 builder 路由 `{BASE}/exp"`（结尾引号=精确 /exp，非 /exp/{id} 实验运行路由）
        ——仅 p0-redirect-check.py 豁免（它测的就是重定向）
规则 2：builder 相关裸选择器（wait_for_selector 以 .builder/.palette 开头但无 .free-build-tab 前缀）
        ——P0 迁移后 builder 在 /lab 自由搭建 Tab 内，非作用域选择器会撞到隐藏 Tab 超时
用法：python e2e/lint-migration.py（发现违规 exit 1；接入测点/批收尾矩阵）"""
import re
import sys
from pathlib import Path

E2E = Path(__file__).resolve().parent
EXEMPT_ROUTE = {"p0-redirect-check.py"}  # 测重定向本身

violations = []
for f in sorted(E2E.glob("*.py")):
    if f.name.startswith("_") or f.name == Path(__file__).name:
        continue
    txt = f.read_text(encoding="utf-8", errors="ignore")
    # 规则 1：精确 /exp 结尾的 goto（/exp/{id} 是活路由不算）
    for m in re.finditer(r'goto\([^)]*?["\{]BASE\}?["\}]*/exp["\']', txt):
        line = txt.count("\n", 0, m.start()) + 1
        if f.name in EXEMPT_ROUTE:
            continue
        violations.append(f"{f.name}:{line} goto 旧 builder 路由 /exp（应 /lab+自由搭建 Tab）")
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
print("✅ 迁移 lint 通过（无旧 /exp 路由、无 builder 裸选择器）")
