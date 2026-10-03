# -*- coding: utf-8 -*-
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src" / "builder" / "catalog.ts"
RENDERER = ROOT / "src" / "builder" / "render" / "Renderer.ts"
NO_BODY = {"trail", "timeline", "vector_arrow", "graph_tag", "bracket", "pole",
           "photogate", "force_sensor", "accel_sensor", "speed_sensor", "range_finder", "energy_meter"}
TS_DEVICES = {"liquid_seal", "pump_syringe", "u_tube", "transformer", "powerline",
              "ac_four_values", "transformer_powerline", "cyclotron",
              "mhd_generator", "flow_meter", "hall_slab", "meter_conversion",
              "voltammetry", "black_box", "wave_multi", "wave_graphs", "wave_super",
              "nuclear_react", "micro_integral", "elevator_scale"}
def main() -> int:
    cat = CATALOG.read_text(encoding="utf-8")
    rend = RENDERER.read_text(encoding="utf-8")
    cat_types = set(re.findall(r"el\('(\w+)'", cat))
    switch_m = re.search(r"switch \(e\.type\)\s*\{(.*)$", rend, re.DOTALL)
    rend_cases = set(re.findall(r"case '(\w+)'", switch_m.group(1))) if switch_m else set()
    expected = cat_types - NO_BODY - TS_DEVICES
    missing = expected - rend_cases
    print(f"catalog {len(cat_types)} | 渲染 case {len(rend_cases)} | 预期 {len(expected)} | 缺失 {len(missing)}")
    if missing:
        print("❌ 无专属渲染分支（落 default 方块）：")
        for m in sorted(missing): print(f"  {m}")
        return 1
    print("✅ 所有预期渲染元件都有专属 case")
    return 0
if __name__ == "__main__":
    sys.exit(main())
