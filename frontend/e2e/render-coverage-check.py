# -*- coding: utf-8 -*-
"""渲染覆盖静态检查（v2，2026-10-06 装置方块债后升级）：
① catalog 元件必须有专属渲染 case——豁免只允许出现在下方 ALLOWLIST（带清偿期限，学 v4 治理）；
② threeScene 不得有自己的 geometry case（方案 B 单源）。
⚠ 本检查只验'case 存在'。'case 画的内容 ≠ fallback 方块'由运行时探针 e2e/render-box-probe.py
  验证（headless 逐类型调 buildUnifiedMesh 断言几何构成）——两者互补，缺一即回到'缺失 0 但全是方块'。"""
import re, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src" / "builder" / "catalog.ts"
RENDERER = ROOT / "src" / "builder" / "render" / "Renderer.ts"
# 无刚体/由画布专属通道绘制的注记类（trail 由 updateTrail、ts 射线由 syncTsRays 等绘制）
NO_BODY = {"trail", "timeline", "vector_arrow", "graph_tag"}
# 装置类方块债（手测 2026-10-06 抓获：20 类型全为 default 方块；批A 已清偿 10）——
# 剩余为 B 类（几何是装饰，简笔符号，批B 清偿，期限 2026-10-20）
ALLOWLIST: set[str] = set()
def main() -> int:
    cat = CATALOG.read_text(encoding="utf-8")
    rend = RENDERER.read_text(encoding="utf-8")
    cat_types = set(re.findall(r"el\('(\w+)'", cat))
    switch_m = re.search(r"switch \(e\.type\)\s*\{(.*)$", rend, re.DOTALL)
    rend_cases = set(re.findall(r"case '(\w+)'", switch_m.group(1))) if switch_m else set()
    expected = cat_types - NO_BODY - ALLOWLIST
    missing = expected - rend_cases
    print(f"catalog {len(cat_types)} | 渲染 case {len(rend_cases)} | 预期 {len(expected)} | 缺失 {len(missing)} | ALLOWLIST {len(ALLOWLIST)}")
    if missing:
        print("❌ 无专属渲染分支（落 default 方块）：")
        for m in sorted(missing): print(f"  {m}")
        return 1
    # 方案 B 验证：threeScene.ts 不应有自己的 geometry case（已改调 buildUnifiedMesh）
    ts = (ROOT / "src" / "sim" / "threeScene.ts").read_text(encoding="utf-8")
    ts_cases = re.findall(r"case '(\w+)'", ts)
    # 场符号相关函数名不算 geometry case
    ts_geo_cases = [c for c in ts_cases if c in expected]
    if ts_geo_cases:
        print(f"❌ threeScene.ts 仍有独立 geometry case（应改调 buildUnifiedMesh）：{ts_geo_cases}")
        return 1
    # buildUnifiedMesh 引用确认
    if 'buildUnifiedMesh' not in ts:
        print("❌ threeScene.ts 未引用 buildUnifiedMesh（方案 B 未接入）")
        return 1
    print("✅ 所有预期渲染元件都有专属 case；threeScene 已接入 buildUnifiedMesh（方案 B）")
    return 0
if __name__ == "__main__":
    sys.exit(main())
