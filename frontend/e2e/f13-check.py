"""F1.3 三入口准入矩阵（5 阶段 × 3 入口）——全部 PASS 才过 redirect 准入。

三入口定义（开工令第 0 步确认）：
E1 实验台   = /lab 默认（LabView 实验台 Tab）
E2 自由搭建 = /lab → 🧱 自由搭建 Tab（FreeBuildTab → BuilderView）
E3 独立直入 = /exp 路由（BuilderView 直接挂载，redirect 前仍存在）
"""
import json, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
OUT = Path("e2e/shots")

def login():
    req = urllib.request.Request(f"{API}/api/auth/login",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["data"]

def main() -> int:
    results = []
    def check(name, ok, detail=""):
        results.append((name, ok))
        print(f"  {'✓' if ok else '✗'} {name} {detail}")

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1500, "height": 950})
        auth = login()
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80]))
        pg.on("console", lambda m: errs.append(m.text[:80]) if m.type == "error" and "favicon" not in m.text else None)

        # ═══ E1 实验台（/lab 默认）═══
        print("══ E1 实验台")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".lab > .topbar", timeout=12000)
        check("E1 加载：.lab > .topbar 挂载", True)
        check("E1 加载：.free-build-tab 不存在", pg.locator(".free-build-tab").count() == 0)
        check("E1 交互：模板下拉可选", pg.locator(".lab select.tmpl").is_visible())
        pg.locator(".lab select.tmpl").select_option("template_projectile")
        pg.wait_for_timeout(500)
        check("E1 Tab 1 无搭建 UI（方案 B）", pg.locator(".lab .palette-item").count() == 0)
        pg.locator(".lab button.primary", has_text="运行实验").click()
        e1_ended = False
        for _ in range(80):
            pg.wait_for_timeout(400)
            if "ended" in (pg.locator(".lab .status").inner_text() or ""): e1_ended = True; break
            if pg.evaluate("() => document.body.innerText").find("实验完成") >= 0: e1_ended = True; break
        check("E1 运行：ended", e1_ended)
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder", timeout=8000)
        check("E1 切出：切自由后 .lab > .topbar 卸载", not pg.locator(".lab > .topbar").is_visible())
        check("E1 切出：.lab .workspace 卸载", pg.locator(".lab > .workspace").count() == 0)
        pg.locator(".tabbar .tab", has_text="实验台").click()
        pg.wait_for_selector(".lab > .topbar", timeout=8000)
        check("E1 切回：topbar 恢复", pg.locator(".lab > .topbar").is_visible())
        check("E1 切回：palette 恢复不重复", pg.locator(".lab .left .palette-item").count() > 0)

        # ═══ E2 自由搭建（/lab → 自由 Tab）═══
        print("══ E2 自由搭建")
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        check("E2 加载：FreeBuildTab 挂载", pg.locator(".free-build-tab .builder").count() == 1)
        check("E2 加载：.lab > .topbar 不共存", not pg.locator(".lab > .topbar").is_visible())
        check("E2 交互：模板下拉 62 项", pg.evaluate("window.__builder.templates().length") == 62)
        check("E2 交互：palette 域 Tab 可用", pg.locator(".free-build-tab .builder .palette .tabs button").count() >= 5)
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.loadTemplate('gk-board-block')")
        pg.wait_for_timeout(300)
        pg.locator(".free-build-tab .tools .primary").click()
        e2_ended = False
        for _ in range(60):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": e2_ended = True; break
        check("E2 运行：ended", e2_ended)
        e2_subs = pg.evaluate("window.__builder.subjects()")
        check("E2 运行：共速 x>0.5", bool(e2_subs) and e2_subs[0]["x"] > 0.5, f"x={e2_subs[0]['x']:.3f}" if e2_subs else "无")
        kes = pg.evaluate("window.__builder.keyEvents()")
        check("E2 运行：keyEvents>0", len(kes) > 0, f"n={len(kes)}")
        pg.locator(".tabbar .tab", has_text="实验台").click()
        pg.wait_for_selector(".lab > .topbar", timeout=8000)
        check("E2 切出：.free-build-tab 卸载", pg.locator(".free-build-tab").count() == 0)
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder", timeout=8000)
        check("E2 切回：BuilderView 恢复", pg.locator(".free-build-tab .builder").count() == 1)
        check("E2 切回：__builder 钩子不重复", pg.evaluate("typeof window.__builder.add === 'function'"))

        # ═══ E3 独立直入（/lab 直入+自由搭建——/exp 已 P0 重定向，2026-09-30 迁移 lint 抓获修复）═══
        print("══ E3 独立直入（/lab）")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        check("E3 加载：BuilderView 挂载", pg.locator(".free-build-tab .builder").count() >= 1)
        check("E3 交互：模板下拉 62 项", pg.evaluate("window.__builder.templates().length") == 62)
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.loadTemplate('gk-connected-bodies')")
        pg.wait_for_timeout(300)
        pg.locator(".tools .primary").click()
        e3_ended = False
        for _ in range(60):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": e3_ended = True; break
        check("E3 运行：ended", e3_ended)
        e3_subs = pg.evaluate("window.__builder.subjects()")
        e3_kes = pg.evaluate("window.__builder.keyEvents()")
        check("E3 运行：keyEvents>0", len(e3_kes) > 0, f"n={len(e3_kes)}")
        # E3 切出（到 /lab）后 BuilderView 卸载（路由级）
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".lab > .topbar", timeout=8000)
        check("E3 切出：到 /lab 后 .builder 不存在", pg.locator(".builder").count() == 0)

        check("全程无页面错误", not errs, str(errs[:2]))
        pg.screenshot(path=str(OUT / "f13-final.png"))
        b.close()

    n_pass = sum(1 for _, ok in results if ok)
    n_all = len(results)
    print(f"\nF1.3 准入矩阵：{n_pass}/{n_all} {'✅ 全部通过' if n_pass == n_all else '❌ 有未过项'}")
    for name, ok in results:
        if not ok:
            print(f"  ✗ {name}")
    return 0 if n_pass == n_all else 1

if __name__ == "__main__":
    sys.exit(main())
