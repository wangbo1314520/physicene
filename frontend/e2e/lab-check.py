# -*- coding: utf-8 -*-
"""lab-check（方案 B 重写 2026-10-04）：/lab 两 Tab 语义验证。
Tab 1（实验台）= 纯查看/分析（AI/OCR/回放/曲线/运行状态）——无搭建 UI。
Tab 2（自由搭建）= BuilderView（搭建/连线/运行）。
用法：python e2e/lab-check.py [--no-run]"""
import _env; _env.banner()
import argparse, json, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
OUT = Path(__file__).resolve().parent.parent / "e2e" / "shots" / "lab"
OUT.mkdir(parents=True, exist_ok=True)

PASS = FAIL = 0
def log(label, ok, detail=""):
    global PASS, FAIL
    mark = "✓" if ok else "✗"
    print(f"  {mark} {label} {detail}")
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

        print("▶ F1.2-1 默认态（/lab → Tab 1 实验台）")
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".tabbar .tab", timeout=12000)
        page.wait_for_timeout(500)
        log("Tab 1 canvas 存在", page.locator(".workspace canvas").count() > 0)
        log("Tab 1 无 palette（方案 B：搭建在 Tab 2）", page.locator(".lab .palette-item").count() == 0)
        log("Tab 1 无模板按钮（方案 B）", page.locator(".lab .tpl").count() == 0)
        # 默认 Tab 已改为 free——先切到结果 Tab 再断言
        page.locator(".tabbar .tab", has_text="结果").click()
        page.wait_for_timeout(400)
        log("Tab 1 运行状态栏存在", page.locator(".lab .status").count() > 0)
        page.screenshot(path=str(OUT / "lab-tab1.png"))

        print("▶ F1.2-2 切换到自由搭建")
        page.locator(".tabbar .tab", has_text="搭建").click()
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        log("Tab 2 BuilderView 挂载", page.locator(".free-build-tab .builder").count() == 1)
        log("Tab 2 palette 可见", page.locator(".free-build-tab .palette .item").count() > 0)
        n_tpl = page.evaluate("window.__builder.templates().length")
        log(f"Tab 2 模板数（64 = 62+方案B迁移2）", n_tpl == 64, f"n={n_tpl}")
        page.screenshot(path=str(OUT / "lab-tab2.png"))

        if not args.no_run:
            print("▶ 方案 B Step 2：Tab 2 运行 → Tab 1 共享状态")
            page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')].find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", "物块")
            page.wait_for_timeout(200)
            page.locator(".tools .primary").click()
            for _ in range(90):
                page.wait_for_timeout(200)
                if page.evaluate("window.__builder.simStatus()") == "ended": break
            log("Tab 2 运行结束", page.evaluate("window.__builder.simStatus()") == "ended")
            page.locator(".tabbar .tab", has_text="结果").click()
            page.wait_for_timeout(500)
            status_text = page.evaluate("() => document.querySelector('.lab .status')?.textContent?.trim() ?? ''")
            log("Tab 1 显示运行结果（共享 state）", "已结束" in status_text or "ended" in status_text, f"'{status_text[:50]}'")
            chart_canvas = page.evaluate("() => document.querySelector('.lab .chart canvas') ? 1 : 0")
            log("Tab 1 图表存在", chart_canvas == 1)
            page.screenshot(path=str(OUT / "lab-tab1-after-run.png"))

        print("▶ F1.2-3 切回 Tab 1（canvas 恢复）")
        page.locator(".tabbar .tab", has_text="结果").click()
        page.wait_for_timeout(500)
        log("切回后 canvas 恢复", page.locator(".workspace canvas").count() > 0)
        log("全程零页面错误", len(errs) == 0, str(errs[:1]) if errs else "")

        b.close()

    print(f"\n结果: {PASS}/{PASS + FAIL} {'✅' if FAIL == 0 else '❌'}")
    return 0 if FAIL == 0 else 1

if __name__ == "__main__":
    sys.exit(main())
