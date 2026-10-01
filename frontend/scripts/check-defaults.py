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

ALLOWLIST: dict[str, str] = {}  # 当前 0 条（原 dampingRatio 条目已用更优机制消除：多元件共享 key 的 check② 跳过）
# 治理（九轮追问3+十轮追问4）：①理由非空 ②上限 5 条——达限即 exit 1 强制全量复查；
# ③条目数恒打印。上限依据：经验启发式（当前 0 条 + 预留同类签字空间），非推导值——
# 达限动作：执行方逐条给"能否修掉/重构消歧"结论，评审确认后删条或重构，不许原地续满。
# 审核链：放行单=diff 中白名单行 → 提交评审逐条审 → 测点对账（输出 vs 审计表快照）
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
    # ② RunBridge ↔ Java（同 key；Java 不分区——取该 key 的全部默认值，都不同才报）。
    # 多元件共享 key 跳过（十轮追问4：Java 全局键匹配对共享 key 天然歧义——如 dampingRatio
    # 同时是 piston(fb 0.5)与 spring(fb 0.05)的参数，静态无法归属 Java 侧读数属于谁——非真不一致）
    key_owners: dict[str, set[str]] = {}
    for m in re.finditer(r"case '(\w+)':(.*?)(?=case '|$)", BRIDGE.read_text(encoding="utf-8"), re.DOTALL):
        for n in re.finditer(r"(\w+):\s*num\(p\.\w+,\s*-?[\d.eE+]+\)", m.group(2)):
            key_owners.setdefault(n.group(1), set()).add(m.group(1))
    for (etype, param), fb in sorted(br.items()):
        if len(key_owners.get(param, {etype})) >= 2:
            continue
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
