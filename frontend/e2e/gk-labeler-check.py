# -*- coding: utf-8 -*-
"""labeler 65/65 逐卡 E2E（2C · 2026-10-11）：每张高考卡 → 讲解器挂载 → 题型标签非空
→ 完整解答 ≥6 段。不抽样、逐卡全跑（solutionId→SolutionBuilder→讲解模板三链逐卡验证；
problemType 的物理正确性由 exp-lib-check 逐卡物理断言把守，二者互补）。"""
import _env; _env.banner()
import json, re, sys, io, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

# 65 卡 id 从 registry 源码静态提取（与运行时注册同源）
src = io.open('src/experiments/registry/gaokao.ts', encoding='utf-8').read()
IDS = re.findall(r"^  '(gk-[\w-]+)':", src, re.M)

def main() -> int:
    assert len(IDS) == 65, f"registry gk 卡数 {len(IDS)} ≠ 65"
    auth = login_api()
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        page.on("pageerror", lambda e: None)
        for idx, cid in enumerate(IDS, 1):
            try:
                page.goto(f"{BASE}/exp/{cid}", wait_until="domcontentloaded")
                page.wait_for_selector(".explainer", timeout=12000)
                tag = page.locator(".explainer .head .tag").inner_text().strip()
                page.locator(".explainer .head").click()
                page.wait_for_timeout(200)
                page.locator(".explainer .modes button", has_text="完整解答").click()
                page.wait_for_timeout(150)
                page.locator(".explainer .mini", has_text="全部展开").click()
                page.wait_for_timeout(200)
                n = page.locator(".explainer .sec h4").count()
                ok = len(tag) >= 2 and n >= 6
                status = "✓" if ok else "✗"
                if not ok:
                    fails.append(cid)
                if not ok or idx % 10 == 0:
                    print(f"  {status} [{idx}/65] {cid} tag={tag[:24]!r} sections={n}")
            except Exception as e:
                fails.append(cid)
                print(f"  ✗ [{idx}/65] {cid} EXC {str(e)[:60]}")
        b.close()
    print()
    if fails:
        print(f"❌ labeler 65 卡 E2E 失败（{len(fails)}）：{fails}"); return 1
    print("✅ labeler 65/65 全过：讲解器挂载 + 题型标签 + 完整解答≥6 段逐卡验证"); return 0

if __name__ == "__main__":
    sys.exit(main())
