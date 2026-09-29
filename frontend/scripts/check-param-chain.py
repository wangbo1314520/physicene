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
    print(f"✅ {len(cat_params)} 个 catalog 参数全有消费点（RunBridge {len(bridge_consumed)} + TS {len(ts_consumed)}）")
    return 0

if __name__ == "__main__":
    sys.exit(main())
