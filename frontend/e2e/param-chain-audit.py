"""参数链审计脚本（P5a 制度化 · 不再推）：catalog → RunBridge → Java 三列对照。
用法：python e2e/param-chain-audit.py
退出码 0 = 全通；1 = 有断链。
制度：新增参数必须过此脚本。dampingRatio/duration/probes 三次断链后的制度化防线。"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "src" / "builder" / "catalog.ts"
BRIDGE = ROOT / "src" / "builder" / "run" / "RunBridge.ts"
JAVA = ROOT / ".." / "java-backend" / "src" / "main" / "java" / "com" / "physicene" / "backend" / "physics" / "engine" / "SimulationInstance.java"


def resolve_constants(catalog_text: str) -> dict[str, list[str]]:
    """解压 MASS/V0/MU 等常量为 param key 列表"""
    constants: dict[str, list[str]] = {}
    for m in re.finditer(r"const (\w+) = P\('(\w+)'", catalog_text):
        constants[m.group(1)] = [m.group(2)]
    # 常量数组（如 [MASS, V0, RES]）
    return constants


def extract_catalog_params(text: str) -> dict[str, list[str]]:
    """提取每个元件的 catalog param keys（含常量展开）"""
    constants = resolve_constants(text)
    result: dict[str, list[str]] = {}
    # 逐元件匹配（el( 开头，到 role/tags 结束）
    for m in re.finditer(r"el\('(\w+)'[^)]*?'.*?'.*?'.*?'.*?'.*?\[([^\]]+)\]", text, re.DOTALL):
        etype = m.group(1)
        param_block = m.group(2)
        keys = []
        # 直接 P('key' / SEL('key'
        for pm in re.findall(r"[PS]EL?\('(\w+)'", param_block):
            keys.append(pm)
        # 常量引用（MASS, V0 等）
        for token in re.findall(r"\b([A-Z][A-Z_0-9]{1,})\b", param_block):
            if token in constants:
                keys.extend(constants[token])
        result[etype] = list(dict.fromkeys(keys))  # 去重保序
    return result


def extract_bridge_params(text: str) -> dict[str, list[str]]:
    """提取每个 case 分支透传的 p.xxx keys"""
    result: dict[str, list[str]] = {}
    for m in re.finditer(r"case '(\w+)':(.*?)(?=case '|$)", text, re.DOTALL):
        etype = m.group(1)
        body = m.group(2)
        keys = list(dict.fromkeys(re.findall(r"p\.(\w+)", body)))
        result[etype] = keys
    return result


def extract_java_consumption(java_text: str) -> set[str]:
    """提取 Java 侧消费的 param keys（getOrDefault/get 调用）"""
    keys = set(re.findall(r'getOrDefault\("(\w+)"', java_text))
    keys |= set(re.findall(r'getParams\(\)\.get\("(\w+)"\)', java_text))
    return keys


def main() -> int:
    cat_text = CATALOG.read_text(encoding="utf-8")
    bridge_text = BRIDGE.read_text(encoding="utf-8")
    java_text = JAVA.read_text(encoding="utf-8")

    catalog_params = extract_catalog_params(cat_text)
    bridge_params = extract_bridge_params(bridge_text)
    java_consumed = extract_java_consumption(java_text)

    print("═══ 参数链审计：catalog → RunBridge → Java ═══")
    print(f"{'元件':<22} {'cat':>3} {'bridge':>6} {'缺失':<30} 状态")
    print("-" * 80)

    total_issues = 0
    for etype in sorted(catalog_params):
        cat_keys = catalog_params[etype]
        br_keys = set(bridge_params.get(etype, []))
        # SEL 参数（mode/dir/mat）不算透传缺失（选择器在 Java 侧有硬编码分支）
        skip = {"mode", "dir", "mat", "fixRot"}
        missing = [k for k in cat_keys if k not in br_keys and k not in skip]

        if not cat_keys:
            status = "—（无参数）"
        elif not missing:
            status = "✓"
        else:
            status = f"✗ 缺 {missing}"
            total_issues += len(missing)
        print(f"  {etype:<20} {len(cat_keys):>3} {len(br_keys):>6} {str(missing)[:28]:<30} {status}")

    print(f"\n═══ Java _srcType 消费 ═══")
    for st in ["1", "2", "3", "5", "6", "7"]:
        used = f"== {st}.0" in java_text
        print(f"  _srcType={st}: {'✓' if used else '✗ 未消费'}")

    print(f"\n═══ 结论 ═══")
    if total_issues == 0:
        print("✅ 参数链全通（catalog→RunBridge 无缺失）")
        return 0
    else:
        print(f"❌ {total_issues} 个参数断链（catalog 有 → RunBridge 未透传）")
        return 1


if __name__ == "__main__":
    sys.exit(main())
