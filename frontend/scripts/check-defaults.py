"""CI v4：默认值三处一致性（catalog P() 第6参 ↔ RunBridge num(p.X, fb) ↔ Java getOrDefault）。
防 W 默认值 12 vs fallback 6 类 bug（E 场三卡红的根因）与三处漂移。
采集：① catalog 每元件每参数默认值（P 顶层逗号分割第 6 参；SEL 无数值默认跳过）
      ② RunBridge 每 case 的 num(p.X, fallback)（复用 v3 的 case 切分）
      ③ Java 全源码 getOrDefault("X", d)
对照：catalog↔RunBridge（同元件同参数）；RunBridge↔Java（同 key，Java 全局不分区——按 key 匹配）。
放行：ALLOWLIST（key → 理由）——确有语义差异的默认值（如 Java 侧单位/安全下限不同）。
用法：python scripts/check-defaults.py（接入 npm run verify）"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src" / "builder" / "catalog.ts"
BRIDGE = ROOT / "src" / "builder" / "run" / "RunBridge.ts"
JAVA_DIR = ROOT / ".." / "java-backend" / "src" / "main" / "java"

ALLOWLIST: dict[str, str] = {
    # 签字记录（diff 可见=放行单）：Java 侧 getOrDefault 按 key 全局匹配会撞同名异元件
    "piston.dampingRatio: RunBridge fb=0.5 vs Java=[0.05]":
        "Java 0.05 是 spring.dampingRatio 的默认（同名异元件）；piston 路径用 containsKey 无默认——非真不一致",
}
# 治理（九轮追问3）：①理由非空 ②上限 5 条——达限即 exit 1 强制全量复查（防"提交时加一条没人看"）；
# ③条目数恒打印。当前 1 条。审核=提交评审（白名单行出现在 diff 即放行单）+测点对账
ALLOWLIST_CAP = 5


def split_top_args(s: str) -> list[str]:
    args, depth, cur = [], 0, ""
    for ch in s:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        if ch == "," and depth == 0:
            args.append(cur); cur = ""
        else:
            cur += ch
    if cur.strip():
        args.append(cur)
    return args


def catalog_defaults(cat_text: str) -> dict[tuple[str, str], float]:
    consts: dict[str, tuple[str, float]] = {}
    for m in re.finditer(r"(\w+)\s*=\s*P\('(\w+)'([^)]*)", cat_text):
        args = split_top_args(m.group(3).lstrip(","))  # [label, min, max, step, default, unit?]
        if len(args) >= 5:
            try:
                consts[m.group(1)] = (m.group(2), float(args[4].strip()))
            except ValueError:
                pass
    out: dict[tuple[str, str], float] = {}
    for m in re.finditer(r"el\('(\w+)'", cat_text):
        nxt = cat_text.find("el('", m.end())
        seg = cat_text[m.end(): nxt if nxt > 0 else len(cat_text)]
        for pm in re.finditer(r"P\('(\w+)'([^)]*)", seg):
            args = split_top_args(pm.group(2).lstrip(","))  # [label, min, max, step, default, unit?]
            if len(args) >= 5:
                try:
                    out[(m.group(1), pm.group(1))] = float(args[4].strip())
                except ValueError:
                    pass
        for cm in re.finditer(r"\b([A-Z][A-Z_0-9]{1,})\b", seg):
            if cm.group(1) in consts:
                name, val = consts[cm.group(1)]
                out[(m.group(1), name)] = val
    return out


def bridge_fallbacks(bridge_text: str) -> dict[tuple[str, str], float]:
    out: dict[tuple[str, str], float] = {}
    for m in re.finditer(r"case '(\w+)':(.*?)(?=case '|$)", bridge_text, re.DOTALL):
        for n in re.finditer(r"num\(p\.(\w+),\s*(-?[\d.eE+]+)\)", m.group(2)):
            out[(m.group(1), n.group(1))] = float(n.group(2))
    return out


def java_defaults() -> dict[str, set[float]]:
    out: dict[str, set[float]] = {}
    for f in JAVA_DIR.rglob("*.java"):
        txt = f.read_text(encoding="utf-8", errors="ignore")
        for n in re.finditer(r'getOrDefault\("(\w+)",\s*(-?[\d.eE+]+)\)', txt):
            out.setdefault(n.group(1), set()).add(float(n.group(2)))
    return out


def main() -> int:
    cat = catalog_defaults(CATALOG.read_text(encoding="utf-8"))
    br = bridge_fallbacks(BRIDGE.read_text(encoding="utf-8"))
    jd = java_defaults()

    print(f"catalog 默认值 {len(cat)} 项 · RunBridge fallback {len(br)} 项 · Java getOrDefault key {len(jd)} 个 · ALLOWLIST {len(ALLOWLIST)}/{ALLOWLIST_CAP} 条")
    assert all(v.strip() for v in ALLOWLIST.values()), "ALLOWLIST 条目必须带非空理由"
    assert len(ALLOWLIST) <= ALLOWLIST_CAP, f"ALLOWLIST 达上限 {ALLOWLIST_CAP}——强制全量复查（防静默膨胀）"
    issues = []
    # ① catalog ↔ RunBridge（同元件同参数）
    for (etype, param), fb in sorted(br.items()):
        cval = cat.get((etype, param))
        if cval is not None and abs(cval - fb) > 1e-9:
            key = f"{etype}.{param}: RunBridge fb={fb} vs catalog={cval}"
            if key not in ALLOWLIST:
                issues.append(key)
    # ② RunBridge ↔ Java（同 key；Java 不分区——取该 key 的全部默认值，都不同才报）
    for (etype, param), fb in sorted(br.items()):
        jvals = jd.get(param)
        if jvals and not any(abs(j - fb) < 1e-9 for j in jvals):
            key = f"{etype}.{param}: RunBridge fb={fb} vs Java={sorted(jvals)}"
            if key not in ALLOWLIST:
                issues.append(key)

    if issues:
        print("❌ 默认值三处不一致（W-bug 同类风险）：")
        for i in issues:
            print("  " + i)
        print("   修法：三处对齐（以物理正确者为准）；确有语义差异 → ALLOWLIST 写理由（diff=签字）")
        return 1
    print("✅ 默认值三处一致（catalog ↔ RunBridge ↔ Java，白名单外 0 不一致）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
