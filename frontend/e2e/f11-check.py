"""F1.1 验证：/lab 页签切换 + 自由搭建页可用（BuilderView 嵌入）+ 截图 2 张"""
import json, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
OUT = Path("e2e/shots")

def login():
    req = urllib.request.Request("http://localhost:8080/api/auth/login",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["data"]

def main() -> int:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80]))
        auth = login()
        pg.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                           f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".canvas-wrap canvas", timeout=15000)   # 实验台画布就绪=顶栏已渲染
        assert pg.locator(".lab > .topbar").is_visible(), "默认应显示实验台顶栏"
        pg.screenshot(path=str(OUT / "f11-tab-lab.png"))
        # 2) 切自由搭建
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".builder .palette .item", timeout=15000)
        assert not pg.locator(".lab > .topbar").is_visible(), "自由搭建页不应显示实验台顶栏（v-if 隔离）"
        pg.screenshot(path=str(OUT / "f11-tab-free.png"))
        # 3) 1 模板可搭可跑（板块模型）
        pg.evaluate("window.__builder.clear()")
        tpls = pg.evaluate("window.__builder.templates()")
        assert any(t["id"] == "gk-board-block" for t in tpls), "模板下拉应含 gk-board-block"
        pg.evaluate("window.__builder.loadTemplate('gk-board-block')")
        pg.wait_for_timeout(300)
        pg.locator(".tools .primary").click()
        ended = False
        for _ in range(50):
            pg.wait_for_timeout(250)
            if pg.evaluate("window.__builder.simStatus()") == "ended":
                ended = True
                break
        assert ended, "模板应可运行至结束"
        subs = pg.evaluate("window.__builder.subjects()")
        assert subs and subs[0]["x"] > 0.5, f"板块共速后位移应为正（x={subs[0]['x'] if subs else '无'}）"
        # 4) 切回实验台仍可用
        pg.locator(".tabbar .tab", has_text="实验台").click()
        pg.wait_for_selector(".lab > .topbar", timeout=5000)
        assert pg.locator(".lab > .topbar").is_visible(), "切回应显示实验台顶栏"
        assert not errs, f"页面错误 {errs}"
        print("F1.1 PASS：Tab 切换 ✓ 自由搭建可搭可跑 ✓ v-if 隔离 ✓ 切回无损 ✓ 零页面错误 ✓")
        b.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
