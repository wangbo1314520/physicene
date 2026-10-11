# -*- coding: utf-8 -*-
"""lab-check（Step2 重写 2026-10-11）：/lab 单页（BuilderView）验证。
无 Tab 结构——左栏（元件库/AI）+ 底栏（属性/数据/回放）面板切换 + 画布 + 运行。"""
import _env; _env.banner()
import argparse, json, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
OUT = Path(__file__).resolve().parent.parent / "e2e" / "shots" / "lab"
OUT.mkdir(parents=True, exist_ok=True)

PASS = FAIL = 0
def log(label, ok, detail=""):
    global PASS, FAIL
    print(f"  {'✓' if ok else '✗'} {label} {detail}")
    if ok: PASS += 1
    else: FAIL += 1

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-run", action="store_true")
    args = ap.parse_args()
    auth = login_api()

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(
            f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))

        print("▶ S1 单页加载（/lab → BuilderView，无 Tab）")
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        page.wait_for_timeout(500)
        log("单页 BuilderView 挂载", page.locator(".free-build-tab .builder").count() == 1)
        log("无 .tabbar（Tab 结构已删）", page.locator(".tabbar").count() == 0)
        log("palette 元件可见", page.locator(".free-build-tab .palette .item").count() > 0)
        n_tpl = page.evaluate("window.__builder.templates().length")
        log(f"模板数（69）", n_tpl == 69, f"n={n_tpl}")
        log("画布 canvas 存在", page.locator(".free-build-tab .bcanvas canvas").count() > 0)
        page.screenshot(path=str(OUT / "lab-single.png"))

        print("▶ S2 左栏面板切换（元件库 ↔ AI 助教）")
        page.locator(".leftbar-tabs button", has_text="AI").click()
        page.wait_for_timeout(300)
        log("AI 面板可见", page.locator(".ai-content").is_visible())
        log("palette 隐藏", not page.locator(".palette").is_visible())
        page.locator(".leftbar-tabs button", has_text="元件库").click()
        page.wait_for_timeout(200)
        log("palette 恢复", page.locator(".palette .item").count() > 0)

        print("▶ S3 底栏面板切换（属性 ↔ 数据 ↔ 回放）")
        page.locator(".bottombar-tabs button", has_text="数据").click()
        page.wait_for_timeout(200)
        log("数据面板（DataPanel+CurvePanel）可见", page.locator(".bottom").is_visible())
        page.locator(".bottombar-tabs button", has_text="回放").click()
        page.wait_for_timeout(200)
        log("回放面板可见", page.locator(".replay-panel").is_visible())
        page.locator(".bottombar-tabs button", has_text="属性").click()
        page.wait_for_timeout(200)
        log("属性面板（右侧保留）可见", page.locator(".props").count() > 0)

        if not args.no_run:
            print("▶ S4 运行（搭场景→run→状态共享→曲线）")
            page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')].find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", "物块")
            page.wait_for_timeout(200)
            page.locator(".tools .primary").click()
            for _ in range(90):
                page.wait_for_timeout(200)
                if page.evaluate("window.__builder.simStatus()") == "ended": break
            log("运行结束", page.evaluate("window.__builder.simStatus() == 'ended'")
                if page.evaluate("window.__builder.simStatus()") == "ended" else False,
                f"st={page.evaluate('window.__builder.simStatus()')}")

            # 切到数据 tab 看曲线
            page.locator(".bottombar-tabs button", has_text="数据").click()
            page.wait_for_timeout(500)
            curve_png = page.locator(".curve-panel .chart canvas").first.screenshot()
            log("ECharts 曲线有内容", len(curve_png) > 3000, f"png={len(curve_png)}B")
            page.screenshot(path=str(OUT / "lab-after-run.png"))

            # 回放面板（recordId 应已产生）
            page.locator(".bottombar-tabs button", has_text="回放").click()
            page.wait_for_timeout(300)
            log("回放面板加载按钮存在", page.locator(".replay-panel button").count() > 0)

        log("全程零页面错误", len(errs) == 0, str(errs[:1]) if errs else "")
        b.close()

    print(f"\n结果: {PASS}/{PASS + FAIL} {'✅' if FAIL == 0 else '❌'}")
    return 0 if FAIL == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
