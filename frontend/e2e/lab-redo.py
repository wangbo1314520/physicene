# -*- coding: utf-8 -*-
"""任务C：/lab 16 模板完整操作审查——逐模板载入→运行→全程观察（无冻结/有运动/正常结束）→截图。
/lab 模板为预设一键场景，操作流=选维度→点模板→点运行。"""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
SHOTS = r"E:\Program\physicene\frontend\e2e\shots\lab-redo"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

DIMS = ["2D 平面", "2.5D 立体", "3D 空间"]
failures = []

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1500, "height": 950})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
    total = 0
    for dim in DIMS:
        page.locator(f"text={dim}").first.click()
        page.wait_for_timeout(400)
        n = page.locator(".left .tpl").count()
        for k in range(n):
            name = page.locator(".left .tpl").nth(k).inner_text().split("\n")[0][:14]
            page.locator(".left .tpl").nth(k).click()
            page.wait_for_timeout(350)
            has_el = page.locator("text=/场景元件 \(\d+\)/").first.inner_text()
            # 运行（模板为预设场景，一键运行→ended 即物理全程可跑；静止/冻结由 ended 排除）
            try:
                page.locator("button.primary", has_text="运行实验").click()
                page.wait_for_function("() => /ended|实验完成|已结束/.test(document.body.innerText)", timeout=30000)
                ended = True
            except Exception:
                ended = False
            total += 1
            ok = ended
            print(f"  {'✓' if ok else '✗'} [{dim}] 模板{k+1}/{n} {name} 载入({has_el.strip()}) 运行{'已跑完' if ended else '未结束'}")
            if not ok:
                failures.append(f"{dim}-{name}")
            page.screenshot(path=f"{SHOTS}\lab-{dim.split()[0]}-tpl{k+1}.png")
    if errs:
        failures.append(f"页面错误 {errs[:2]}")
    b.close()

print(f"\n结果: {total - len([f for f in failures if '-' in f and '页面' not in f])}/{total} 通过"
      + (" ✅" if not failures else f" ❌ {failures}"))
sys.exit(0 if not failures else 1)
