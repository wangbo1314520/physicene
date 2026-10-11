# -*- coding: utf-8 -*-
"""f13-check（Step2 重写 2026-10-11）：F1.3 准入矩阵——/lab 单页无 Tab + 路由重定向 + ?tab 兼容。"""
import _env; _env.banner()
import json, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
OUT = Path(__file__).resolve().parent.parent / "e2e" / "shots"
OUT.mkdir(exist_ok=True)

results = []
def check(name, ok, detail=""):
    print(f"  {'✓' if ok else '✗'} {name} {detail}")
    results.append((name, ok))

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

def main() -> int:
    auth = login_api()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1500, "height": 950})
        ctx.add_init_script(
            f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80]))

        print("== E1 单页直入 ==")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        check("E1 BuilderView 挂载", pg.locator(".free-build-tab .builder").count() == 1)
        check("E1 无 .tabbar（单页）", pg.locator(".tabbar").count() == 0)
        check("E1 无 LabView topbar 遗留", pg.locator(".lab > .topbar").count() == 0)
        check("E1 palette 可见", pg.locator(".palette .item").count() > 0)

        print("== E2 单页功能 ==")
        n_tpl = pg.evaluate("window.__builder.templates().length")
        check("E2 模板 69 项", n_tpl == 69, f"n={n_tpl}")
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.loadTemplate('gk-board-block')")
        pg.wait_for_timeout(300)
        pg.locator(".tools .primary").click()
        e2_ended = False
        for _ in range(60):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": e2_ended = True; break
        check("E2 运行 ended", e2_ended)
        kes = pg.evaluate("window.__builder.keyEvents()")
        check("E2 keyEvents>0", len(kes) > 0, f"n={len(kes)}")

        print("== E3 路由重定向 ==")
        pg.goto(f"{BASE}/exp")
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=8000)
        check("E3 /exp 重定向到 BuilderView", pg.locator(".free-build-tab .builder").count() >= 1)
        check("E3 路径为 /lab", pg.evaluate("() => location.pathname") == "/lab")
        pg.goto(f"{BASE}/lab?tab=lab")
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=8000)
        check("E3 ?tab=lab 别名兼容", pg.locator(".free-build-tab .builder").count() == 1)
        pg.goto(f"{BASE}/lab?tab=free")
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=8000)
        check("E3 ?tab=free 别名兼容", pg.locator(".free-build-tab .builder").count() == 1)

        print("== E4 面板验证（第23条）==")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=8000)
        pg.locator(".leftbar-tabs button", has_text="AI").click()
        pg.wait_for_timeout(300)
        check("E4 AI 面板切换正常", pg.locator(".ai-content").is_visible())
        pg.locator(".bottombar-tabs button", has_text="数据").click()
        pg.wait_for_timeout(300)
        check("E4 数据面板切换正常", pg.locator(".bottom").is_visible())
        check("E4 全程无页面错误", len(errs) == 0, str(errs[:1]))
        pg.screenshot(path=str(OUT / "f13-final.png"))
        b.close()

    n_pass = sum(1 for _, ok in results if ok)
    n_all = len(results)
    print(f"\nF1.3: {n_pass}/{n_all} {'ALL PASS' if n_pass == n_all else 'HAS FAIL'}")
    for name, ok in results:
        if not ok: print(f"  FAIL {name}")
    return 0 if n_pass == n_all else 1

if __name__ == "__main__":
    sys.exit(main())
