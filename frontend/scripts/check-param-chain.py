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

def extract_case_reads(bridge_text: str) -> dict[str, set[str]]:
    """每个 case 内读取的 p.xxx（反向检查数据源：RunBridge 读的参数必须在 catalog 该元件参数表里）"""
    reads: dict[str, set[str]] = {}
    for m in re.finditer(r"case '(\w+)':(.*?)(?=case '|$)", bridge_text, re.DOTALL):
        reads[m.group(1)] = set(re.findall(r"p\.(\w+)", m.group(2)))
    return reads

def catalog_params_by_type(cat_text: str) -> dict[str, set[str]]:
    """每个元件类型的 catalog 参数名集合——段=el(' 到下一个 el('；参数宏（const MASS=P('m'…）先解析"""
    consts = dict(re.findall(r"(\w+)\s*=\s*(?:P|SEL)\('(\w+)'", cat_text))  # 含链式：const A=P(), B=P()
    out: dict[str, set[str]] = {}
    for m in re.finditer(r"el\('(\w+)'", cat_text):
        nxt = cat_text.find("el('", m.end())
        seg = cat_text[m.end(): nxt if nxt > 0 else len(cat_text)]
        params = set(re.findall(r"(?:P|SEL)\('(\w+)'", seg))
        for c in re.findall(r"\b([A-Z][A-Z_0-9]{1,})\b", seg):
            if c in consts:
                params.add(consts[c])
        out[m.group(1)] = params
    return out

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
    # 反向检查（2026-10-01 七轮追问2 制度化——region L/W 半虚报驱动）：RunBridge case 内读取的
    # p.X 必须是 catalog 该元件的参数（或白名单：pickWireParams 的 bullet/fixRot 经 e.params 不在此列）
    REVERSE_ALLOW = {"bullet", "fixRot", "id", "type"}
    cat_by_type = catalog_params_by_type(cat_text)
    bad_reads = []
    combined_types = set().union(*COMBINED_CASE_ALLOW) if COMBINED_CASE_ALLOW else set()
    for etype, reads in extract_case_reads(bridge_text).items():
        if etype in combined_types:
            continue  # 合并 case 体共享，reads 无法按类型归属（白名单已在③节登记分流证明）
        declared = cat_by_type.get(etype, set())
        for r in sorted(reads - declared - REVERSE_ALLOW):
            bad_reads.append(f"{etype}.{r}")
    if bad_reads:
        print(f"❌ RunBridge 读取了 catalog 未声明的参数（学生改不了=半参数化）：{bad_reads}")
        print("   补 catalog P()/SEL() 或停止读取（先例：region L/W 提交信息声称'加参数'但目录未落——v2 正向检查盲区）")
        return 1
    print(f"✅ {len(cat_params)} 个 catalog 参数全有消费点（RunBridge {len(bridge_consumed)} + TS {len(ts_consumed)}）；合并 case 仅白名单 {sorted('|'.join(s) for s in COMBINED_CASE_ALLOW)}；反向检查 RunBridge 读⊆catalog 声明 全通")
    return 0

if __name__ == "__main__":
    sys.exit(main())
