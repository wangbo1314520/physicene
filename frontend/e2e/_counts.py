"""E2E 计数常量统一读（处理 3 · 制度化）：产品侧计数变更时 E2E 自动跟进，
禁止在 E2E 脚本里硬编码 TEMPLATES/PLAN_COUNT 数值。
用法：from _counts import TEMPLATES_COUNT；断言 == TEMPLATES_COUNT 而非 == 45。
数据源：src/builder/templates/templates-ledger.test.ts 的锁定值（与闸门同源）。"""
import re
from pathlib import Path

def _read_locked(pattern: str) -> int:
    ledger = Path(__file__).resolve().parent.parent / "src/builder/templates/templates-ledger.test.ts"
    txt = ledger.read_text(encoding="utf-8")
    m = re.search(pattern, txt)
    if not m:
        raise RuntimeError(f"templates-ledger.test.ts 中找不到 {pattern}——计数常量断言失败")
    return int(m.group(1))

def get_templates_count() -> int:
    return _read_locked(r"expect\(TEMPLATES\.length\)\.toBe\((\d+)\)")

def get_plan_count() -> int:
    return _read_locked(r"expect\(PLAN_COUNT\)\.toBe\((\d+)\)")

# 模块级缓存（导入时读一次）
TEMPLATES_COUNT = get_templates_count()
PLAN_COUNT = get_plan_count()
