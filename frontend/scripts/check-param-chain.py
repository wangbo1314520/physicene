"""参数链 CI 检查 v2：catalog → RunBridge / TS Runner 源码级对比（非 markdown）。
每个 catalog P()/SEL() 参数，必须在 RunBridge case 中有 p.xxx 引用，或在 TS Runner 中有 params.xxx 引用。
用法：python scripts/check-param-chain.py（pre-commit 或 CI 中跑）"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # frontend/
CATALOG = ROOT / "src" / "builder" / "catalog.ts"
BRIDGE = ROOT / "src" / "builder" / "run" / "RunBridge.ts"
PHYSICS = ROOT / "src" / "physics"
RUNNERS = ROOT / "src" / "builder" / "run"

SEL_SKIP = {"dir", "mat", "mode", "color", "len", "scale", "size"}  # SEL+显示类参数

# 合并 case 白名单（2026-09-30 追问5 机械化）：新增合并 case 必须登记 docs/参数链审计表.md ③ 节
# 并给出双类型分流证明（heater 并入 gas_cell 产生幽灵气室的前科——默认禁止）
COMBINED_CASE_ALLOW = {frozenset(s.split("|")) for s in ("rope|spring",)}

def check_combined_cases(bridge_text: str) -> list[str]:
    """RunBridge 中相邻 case 'x': case 'y': 模式（含换行/注释间隔）→ 未登记的合并即违规"""
    pairs = []
    for m in re.finditer(r"case '(\w+)':(\s*(?://[^\n]*\n)?\s*)case '(\w+)':", bridge_text):
        pairs.append((m.group(1), m.group(3)))
    return [f"{a}+{b}" for a, b in pairs if frozenset((a, b)) not in COMBINED_CASE_ALLOW]

def main() -> int:
    cat_text = CATALOG.read_text(encoding="utf-8")
    bridge_text = BRIDGE.read_text(encoding="utf-8")

    cat_params = set(re.findall(r"P\('(\w+)'", cat_text))
    cat_params |= set(re.findall(r"SEL\('(\w+)'", cat_text))

    bridge_consumed = set(re.findall(r"p\.(\w+)", bridge_text))

    ts_consumed = set()
    for d in [PHYSICS, RUNNERS]:
        if d.exists():
            for f in d.rglob("*.ts"):
                if "test" not in f.name:
                    txt = f.read_text(encoding="utf-8")
                    ts_consumed |= set(re.findall(r"params\.(\w+)", txt))

    all_consumed = bridge_consumed | ts_consumed
    missing = cat_params - all_consumed - SEL_SKIP

    if missing:
        print(f"❌ {len(missing)} 个 catalog 参数无消费点：")
        for p in sorted(missing):
            print(f"  {p}")
        return 1
    bad_combined = check_combined_cases(bridge_text)
    if bad_combined:
        print(f"❌ 未登记的合并 case：{bad_combined}——默认禁止（heater 幽灵气室前科）；须登记参数链审计表③节+分流证明")
        return 1
    print(f"✅ {len(cat_params)} 个 catalog 参数全有消费点（RunBridge {len(bridge_consumed)} + TS {len(ts_consumed)}）；合并 case 仅白名单 {sorted('|'.join(s) for s in COMBINED_CASE_ALLOW)}")
    return 0

if __name__ == "__main__":
    sys.exit(main())
