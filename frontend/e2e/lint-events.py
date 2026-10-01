# -*- coding: utf-8 -*-
"""事件清单 lint（2026-10-01 七轮追问3——'两次漏计后必须成文'的机械防线）：
提取 Java 源码全部 KeyEvent 事件类型字面量，与 docs/事件清单.md 对照——
代码有而文档无 = 未登记（红）；文档"已实现"表有而代码无 = 幽灵条目（红）。
用法：python e2e/lint-events.py（测点/收尾矩阵必跑）"""
import re, sys
from pathlib import Path

JAVA = Path(__file__).resolve().parent.parent.parent / "java-backend" / "src" / "main" / "java"
DOC = Path(__file__).resolve().parent.parent.parent / "docs" / "事件清单.md"

code_events = set()
for f in JAVA.rglob("*.java"):
    txt = f.read_text(encoding="utf-8", errors="ignore")
    for m in re.finditer(r'(?:fireKeyEvent\([^,]+,\s*|new KeyEvent\([^,]+,\s*)"([a-zA-Z_]+)', txt):
        code_events.add(m.group(1))
    # 动态后缀（pendulum_pass_<ropeId>）：归一到基名
    for m in re.finditer(r'"([a-zA-Z_]+)_?"\s*\+\s*rope\.ownId', txt):
        code_events.add(m.group(1))
        code_events.discard(m.group(1) + "_")
# 基名归一（去动态后缀分歧）：两侧统一为去掉 '<...>'/'_' 尾巴
norm = lambda e: e.split("<")[0].rstrip("_")
code_norm = {norm(e) for e in code_events}

doc = DOC.read_text(encoding="utf-8")
impl_section = doc.split("## 已实现")[1].split("## 漂移")[0]
doc_events = set()
for row in impl_section.splitlines():
    if not row.startswith("|") or row.startswith("| type"):
        continue
    cell = row.split("|")[1]
    for tok in cell.split("/"):
        toks = tok.strip().strip("`").split("<")[0].rstrip("_")
        if re.fullmatch(r"[a-zA-Z_]+", toks):
            doc_events.add(toks)

undoc = code_norm - doc_events
ghost = doc_events - code_norm
if undoc or ghost:
    if undoc: print(f"❌ 代码有而事件清单未登记：{sorted(undoc)}")
    if ghost: print(f"❌ 事件清单登记但代码无（幽灵条目）：{sorted(ghost)}")
    sys.exit(1)
print(f"✅ 事件清单与代码一致（{len(doc_events)} 类已实现全部登记、无幽灵）")
