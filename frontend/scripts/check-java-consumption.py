"""CI v3：RunBridge params 输出 key → Java 消费 key 跨语言对照（BLOCKING + 白名单制）。
防 dampingRatio 类 bug（RunBridge 透传但 Java 不消费 → 值静默丢失）。

采集（TS 侧，RunBridge.ts 的 Java 路径 toPhysicsElements）：
  - params: { key: ... } 内联形式 与 .params = { key: ... } 赋值形式（rope/spring/pulley）
  - key 提取用单组 (\\w+):（本文件 prettier 风格对象键冒号前无空格，三元冒号前有空格，不会误配）
  - _ 前缀 key（_srcType 内部标记）跳过；pickWireParams 的 bullet/fixRot 走 getOrDefault 也覆盖
  - TS 引擎路径的 params: e.params（展开透传）无字面量 key，不涉及 Java，天然不匹配
对照（Java 侧全源码 grep 四种消费形式）：
  getOrDefault("key" / param("key" / getParams().get("key" / containsKey("key"
  —— 覆盖 SimulationInstance 直接读、BeltElement 等 param() 助手、SceneValidator 局部变量 pr.getOrDefault

执行规则（2026-09-30 追问2 制度化，替代 WARNING 放行制）：
  未消费 key → exit 1（阻断提交）。白名单 ALLOWLIST 是唯一放行通道：
  - 条目 = key → 理由（必须写明经哪条非字符串路径消费）
  - 白名单条目出现在 git diff 中 = 放行签字记录，评审可审计
  - v3 每次运行恒打印白名单条目数——增长必出现在 diff，防静默膨胀
用法：python scripts/check-java-consumption.py（已接入 npm run verify，BLOCKING 层）"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent  # frontend/
BRIDGE = ROOT / "src" / "builder" / "run" / "RunBridge.ts"
JAVA_DIR = ROOT / ".." / "java-backend" / "src" / "main" / "java"

# 唯一放行通道：key → 消费路径理由。新增条目须经评审（diff 可见 = 签字记录）
ALLOWLIST: dict[str, str] = {}


def extract_bridge_param_keys(bridge_text: str) -> list[tuple[str, int, str]]:
    """→ [(case归属, 行号, key)]。归属取最近 case 标签；若其间有 if (e.type === 'X') 守卫则用守卫名
    （rope/spring 同 case 体内按类型分流 params）；相邻 case 标签（合并 case）合并显示。"""
    case_labels = [(m.start(), m.group(1)) for m in re.finditer(r"case '(\w+)':", bridge_text)]
    # 合并相邻 case（标签之间只有空白 → 共享 case 体）
    merged: list[tuple[int, str]] = []
    for pos, name in case_labels:
        if merged:
            between = bridge_text[merged[-1][0]:pos]
            if re.fullmatch(r"(?:\s*case '\w+':\s*)+", between):
                merged[-1] = (merged[-1][0], merged[-1][1] + "|" + name)
                continue
        merged.append((pos, name))

    out: list[tuple[str, int, str]] = []
    for form in (r"params:\s*\{([^}]*)\}", r"\.params\s*=\s*\{([^}]*)\}"):
        for m in re.finditer(form, bridge_text):
            keys = re.findall(r"(\w+):", m.group(1))
            line = bridge_text.count("\n", 0, m.start()) + 1
            enclosing = [name for pos, name in merged if pos < m.start()]
            owner = enclosing[-1] if enclosing else "(顶层)"
            # if (e.type === 'X') 守卫比最近 case 更近 → 归属守卫类型
            guard = [g for g in re.finditer(r"if \(e\.type === '(\w+)'\)", bridge_text[:m.start()])]
            if guard and enclosing:
                last_case_pos = max(pos for pos, _ in merged if pos < m.start())
                if guard[-1].start() > last_case_pos:
                    owner = guard[-1].group(1)
            for k in keys:
                if not k.startswith("_"):
                    out.append((owner, line, k))
    return out


def extract_java_consumed_keys() -> set[str]:
    """Java 全源码四种消费形式的 key 并集"""
    keys: set[str] = set()
    patterns = [
        r'getOrDefault\("(\w+)"',
        r'\bparam\("(\w+)"',
        r'getParams\(\)\.get\("(\w+)"',
        r'containsKey\("(\w+)"',
    ]
    for f in JAVA_DIR.rglob("*.java"):
        txt = f.read_text(encoding="utf-8", errors="ignore")
        for pat in patterns:
            keys |= set(re.findall(pat, txt))
    return keys


def main() -> int:
    bridge_text = BRIDGE.read_text(encoding="utf-8")
    bridge_keys = extract_bridge_param_keys(bridge_text)
    java_keys = extract_java_consumed_keys()

    print(f"RunBridge params 输出 {len(bridge_keys)} 个 key（含跨 case 重复），Java 消费 {len(java_keys)} 个 key，白名单 {len(ALLOWLIST)} 条")
    breaks = 0
    for owner, line, key in sorted(set(bridge_keys), key=lambda t: (t[1], t[2])):
        if key in java_keys:
            continue
        if key in ALLOWLIST:
            print(f"⚪ {owner}.{key} → 白名单放行：{ALLOWLIST[key]}")
        else:
            print(f'❌ L{line} {owner}.{key} → RunBridge 透传但 Java 无消费（dampingRatio 类断链）')
            print("   修复：Java 补 getOrDefault/param 消费；或确经非字符串路径消费 → 加 ALLOWLIST 条目（须写明路径，diff=签字）")
            breaks += 1

    if breaks > 0:
        print(f"\n❌ {breaks} 个 RunBridge→Java 断链——阻断（BLOCKING）")
        return 1
    print("✅ RunBridge params → Java 消费 全通（白名单外 0 断链）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
