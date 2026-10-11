# -*- coding: utf-8 -*-
"""B2 视觉截图归档：10 核心界面 → docs/视觉截图/。教师批阅页已于 2026-09-16 定位更正删除（如实注记），
第 10 席以高考卡运行器（B10 讲解器展开+AI 深讲）替补。"""
import _env; _env.banner()
import json, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
OUT = Path("../docs/视觉截图")
OUT.mkdir(parents=True, exist_ok=True)

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

def shot(page, name):
    page.screenshot(path=str(OUT / f"{name}.png"), full_page=False)
    print(f"  ✓ {name}")

def main() -> int:
    auth = login_api()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980}, device_scale_factor=2)
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()

        # ① 登录页
        page.goto(f"{BASE}/login")
        page.wait_for_timeout(1200)
        shot(page, "01-登录页")

        # ② 搭建台全览
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=15000)
        page.evaluate("""() => { const B = window.__builder;
          B.clear();
          B.add('ground', { mu: 0.1 }, 0, -1);
          B.add('block', { m: 1, v0: 3, mu: 0.1, fixRot: 1 }, 0, 0.1);
          B.add('slope', { th: 30 }, 3, -1); }""")
        page.wait_for_timeout(600)
        shot(page, "02-搭建台全览")

        # ③ 模板抽屉
        page.locator(".tools button", has_text="模板").click()
        page.wait_for_selector(".tpl-drawer", timeout=8000)
        page.wait_for_timeout(600)
        shot(page, "03-模板抽屉")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # ④ 属性面板（选中物块）
        page.evaluate("() => { const B = window.__builder; B.select(window.__builder.elements()[1].id); }")
        page.locator(".bottombar-tabs button", has_text="属性").click()
        page.wait_for_timeout(500)
        shot(page, "04-属性面板")

        # ⑤ 数据曲线（运行后）
        page.locator(".tools .primary").click()
        for _ in range(120):
            page.wait_for_timeout(250)
            if page.evaluate("window.__builder.simStatus()") == "ended": break
        page.locator(".bottombar-tabs button", has_text="数据").click()
        page.wait_for_timeout(1200)
        shot(page, "05-数据曲线")

        # ⑥ 回放时间轴
        page.locator(".bottombar-tabs button", has_text="回放").click()
        page.wait_for_timeout(400)
        btn = page.locator(".replay-panel button", has_text="加载回放")
        if btn.count() and not btn.is_disabled():
            btn.click()
            page.wait_for_timeout(2500)
        shot(page, "06-回放时间轴")

        # ⑦ AI 助教侧栏（问一句）
        page.locator(".leftbar-tabs button", has_text="AI").click()
        page.wait_for_timeout(400)
        page.locator(".ai-content .input-row input").fill("物块最后会停在哪里？为什么？")
        page.locator(".ai-content .input-row button").click()
        try:
            page.wait_for_function("() => { const m = [...document.querySelectorAll('.ai-content .msg.ai')]; return m.length >= 2 && !m.slice(-1)[0].innerText.includes('思考中'); }", timeout=90000)
        except Exception:
            pass
        page.wait_for_timeout(500)
        shot(page, "07-AI助手侧栏")
        page.locator(".leftbar-tabs button", has_text="元件库").click()
        page.wait_for_timeout(300)

        # ⑧ 我的实验
        page.goto(f"{BASE}/my-experiments")
        page.wait_for_timeout(1500)
        shot(page, "08-我的实验")

        # ⑨ 场景库
        page.goto(f"{BASE}/scenes")
        page.wait_for_timeout(1500)
        shot(page, "09-场景库")

        # ⑩ 高考卡运行器（B10 讲解器展开 + AI 深讲）
        page.goto(f"{BASE}/exp/gk-accel-selector-b")
        page.wait_for_selector(".explainer", timeout=15000)
        page.locator(".explainer .head").click()
        page.wait_for_timeout(300)
        page.locator(".explainer .modes button", has_text="完整解答").click()
        page.locator(".explainer .mini", has_text="全部展开").click()
        page.locator(".explainer .mini.ai").click()
        try:
            page.wait_for_function("() => { const a = document.querySelector('.explainer .aisay'); return a && a.innerText.length >= 80 && !a.innerText.includes('思考中'); }", timeout=90000)
        except Exception:
            pass
        page.wait_for_timeout(400)
        shot(page, "10-高考卡运行器-B10讲解器")
        b.close()
    print("\n10 张归档完成（教师批阅页已于 2026-09-16 定位更正删除，如实注记）")
    return 0

if __name__ == "__main__":
    sys.exit(main())
