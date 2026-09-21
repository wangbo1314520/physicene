"""pattern lint（重审计 v2 项 9——第三十轮制度"轮询 pattern 取断言所需最后就绪内容"的静态防线）：
扫描 exp-lib-check.py 全部 wait_text 调用：若其后 6 行内出现 re.search 使用**不同 pattern**，
报 WARN 人工确认（pattern 应命中断言所需的最晚渲染行；相同=安全，不同=可能取了首个漏了后续行）。
用法：python e2e/lint_patterns.py [--strict]（strict=有 WARN 即退出 1）"""
import io, re, sys

p = io.open(r'e2e/exp-lib-check.py', encoding='utf-8').read()
lines = p.splitlines()
warns, oks = [], []
for i, ln in enumerate(lines):
    m = re.search(r'wait_text\(page,\s*(r?"[^"]+"|\'[^\']+\')', ln)
    if not m:
        continue
    wt_pat = m.group(1)[1:] if m.group(1).startswith('r') else m.group(1)
    wt_pat = wt_pat.strip('"\'')
    # 后 6 行内出现的 re.search/re.findall pattern
    uses = []
    for j in range(i + 1, min(i + 7, len(lines))):
        for um in re.finditer(r're\.(?:search|findall)\(r?"([^"]+)"', lines[j]):
            uses.append((j + 1, um.group(1)))
    if not uses:
        warns.append((i + 1, wt_pat, None))
        continue
    same = any(u[1] == wt_pat for u in uses)
    if same:
        oks.append((i + 1, wt_pat))
    else:
        warns.append((i + 1, wt_pat, uses))

print(f'wait_text 调用 {len(oks) + len(warns)} 处：同 pattern（安全）{len(oks)}；需人工确认 {len(warns)}')
for ln_no, pat, uses in warns:
    if uses is None:
        print(f'  WARN L{ln_no}: pattern={pat[:36]!r} — 后 6 行无 re.search（断言在别处？确认后到性）')
    else:
        for j, u in uses:
            print(f'  WARN L{ln_no}: wait_text={pat[:32]!r} ≠ L{j} re.search={u[:32]!r}（pattern 未覆盖该断言行——确认是否最晚就绪）')

strict = '--strict' in sys.argv
if strict and warns:
    sys.exit(1)
