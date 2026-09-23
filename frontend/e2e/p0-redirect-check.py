"""P0 redirect 后单入口矩阵：原三入口断言映射到 /lab 单入口——/exp 301、/sandbox 301 链、/lab 双 Tab 全功能。"""
import _env; _env.banner()  # 测点1前置：每轮回归头行打印环境指纹
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"

def login():
    req = urllib.request.Request("http://localhost:8080/api/auth/login",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["data"]

def main() -> int:
    results = []
    def check(name, ok, detail=""):
        results.append((name, ok)); print(f"  {'✓' if ok else '✗'} {name} {detail}")

    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1500, "height": 950})
        auth = login()
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80]))

        print("══ P0-1 /exp → /lab redirect")
        pg.goto(f"{BASE}/exp")
        pg.wait_for_selector(".lab > .topbar", timeout=12000)
        url = pg.url
        check("/exp 重定向到 /lab", "/lab" in url and "/exp" not in url, f"url={url}")

        print("══ P0-2 /sandbox → /exp → /lab 链式 redirect")
        pg.goto(f"{BASE}/sandbox")
        pg.wait_for_selector(".lab > .topbar", timeout=12000)
        url2 = pg.url
        check("/sandbox 链式到 /lab", "/lab" in url2 and "/sandbox" not in url2, f"url={url2}")

        print("══ P0-3 /lab 实验台 Tab 功能（原 E1）")
        check("E1 实验台 topbar 可见", pg.locator(".lab > .topbar").is_visible())
        pg.locator(".lab select.tmpl").select_option("template_projectile")
        pg.wait_for_timeout(500)
        check("E1 模板载入", pg.locator(".lab .workspace li").count() > 0 or pg.locator(".lab .el-item").count() > 0)

        print("══ P0-4 /lab 自由搭建 Tab 功能（原 E2，承接 E3 全部覆盖）")
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        check("E2 BuilderView 挂载", pg.locator(".free-build-tab .builder").count() == 1)
        check("E2 模板下拉（与 registry 同步）", pg.evaluate("window.__builder.templates().length") == 45)  # P3 后 17→45（28 装置）
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.loadTemplate('gk-board-block')")
        pg.wait_for_timeout(300)
        pg.locator(".free-build-tab .tools .primary").click()
        ended = False
        for _ in range(60):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": ended = True; break
        check("E2 运行 ended", ended)
        subs = pg.evaluate("window.__builder.subjects()")
        check("E2 共速 x>0.5", bool(subs) and subs[0]["x"] > 0.5, f"x={subs[0]['x']:.3f}" if subs else "无")
        kes = pg.evaluate("window.__builder.keyEvents()")
        check("E2 keyEvents>0", len(kes) > 0, f"n={len(kes)}")

        print("══ P0-5 E3 过渡入口已移除（/exp 无 BuilderView 直接挂载）")
        pg.goto(f"{BASE}/exp")
        pg.wait_for_selector(".lab > .topbar", timeout=12000)
        check("/exp 不再直接挂 BuilderView", pg.locator(".builder").count() == 0 or pg.locator(".free-build-tab .builder").count() == 0)

        check("全程零页面错误", not errs, str(errs[:2]))
        b.close()

    n = sum(1 for _, ok in results if ok)
    print(f"\nP0 单入口矩阵：{n}/{len(results)} {'✅' if n == len(results) else '❌'}")
    return 0 if n == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
