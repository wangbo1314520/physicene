# -*- coding: utf-8 -*-
"""批 3·平移 5.3 + 复位视角 5.4 E2E：中键拖平移（相机动、元件不动）→ 缩放 → 复位视角全归零。"""
import _env; _env.banner()
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
ok_all, fails = [], []

def check(name, ok, detail=""):
    print(f"  {'✓' if ok else '✗'} {name} {detail}")
    (ok_all if ok else fails).append(name)

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

def canvas_box(page):
    return page.evaluate("() => { const r = document.querySelector('.free-build-tab .bcanvas').getBoundingClientRect();"
                         " return { x: r.x, y: r.y, w: r.width, h: r.height } }")

def mid_drag(page, dx, dy):
    cb = canvas_box(page)
    cx, cy = cb["x"] + cb["w"] / 2, cb["y"] + cb["h"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down(button="middle")
    for i in range(1, 11):
        page.mouse.move(cx + dx * i / 10, cy + dy * i / 10)
    page.mouse.up(button="middle")
    page.wait_for_timeout(150)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:80]))
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

    page.evaluate("window.__builder.loadTemplate('gk-board-block')")
    page.wait_for_timeout(300)
    els0 = page.evaluate("() => window.__builder.elements().map(e => ({ id: e.id, x: e.position.x, y: e.position.y }))")
    cam0 = page.evaluate("window.__builder.camState()")
    check("P1 初始相机：pan=0/zoom=1（2D）", cam0 and cam0["panX"] == 0 and cam0["panY"] == 0 and cam0["zoom"] == 1, f"{cam0}")

    mid_drag(page, 120, -80)
    cam1 = page.evaluate("window.__builder.camState()")
    # 抓布语义：鼠标右拖+上移 → 相机左移下移（panX/panY 为负）→ 内容跟手
    check("P2 中键拖 → pan 偏移（内容跟手：拖右→panX<0）", cam1["panX"] < -0.5 and cam1["panY"] < -0.3, f"{cam1}")
    els1 = page.evaluate("() => window.__builder.elements().map(e => ({ id: e.id, x: e.position.x, y: e.position.y }))")
    same = all(a["id"] == c["id"] and abs(a["x"] - c["x"]) < 1e-9 and abs(a["y"] - c["y"]) < 1e-9 for a, c in zip(els0, els1))
    check("P3 平移不动物件（元件世界坐标逐一不变）", same, f"{len(els0)}件")

    # 元件在屏幕上的位置应随平移移动（相机动=投影动）
    cb = canvas_box(page)
    page.wait_for_timeout(100)
    # 缩放
    page.mouse.wheel(0, -240)
    page.wait_for_timeout(150)
    cam2 = page.evaluate("window.__builder.camState()")
    check("P4 滚轮缩放生效（zoom>1）", cam2["zoom"] > 1.0, f"zoom={cam2['zoom']}")

    # 中键拖与左键拖隔离：平移后左键拖元件仍正常（不被 pan 吞掉）
    page.evaluate("(id) => window.__builder.select(id)", els0[0]["id"])
    e0 = page.evaluate("(id) => window.__builder.elements().find(e => e.id === id).position", els0[0]["id"])
    cb = canvas_box(page)
    ppm = (cb["h"] / 14.0) / cam2["zoom"]
    sx = cb["x"] + cb["w"] / 2 + (e0["x"] - cam2["panX"]) * ppm
    sy = cb["y"] + cb["h"] / 2 - (e0["y"] - cam2["panY"]) * ppm
    page.mouse.move(sx, sy)
    page.mouse.down()
    for i in range(1, 9):
        page.mouse.move(sx + 60 * i / 8, sy + 40 * i / 8)
    page.mouse.up()
    page.wait_for_timeout(150)
    e1 = page.evaluate("(id) => window.__builder.elements().find(e => e.id === id).position", els0[0]["id"])
    moved = abs(e1["x"] - e0["x"]) > 0.2 or abs(e1["y"] - e0["y"]) > 0.2
    check("P5 平移后左键拖元件仍生效（通道隔离）", moved, f"({e0['x']:.2f},{e0['y']:.2f})→({e1['x']:.2f},{e1['y']:.2f})")

    # 复位视角
    page.locator(".tools button", has_text="复位视角").click()
    page.wait_for_timeout(150)
    cam3 = page.evaluate("window.__builder.camState()")
    check("P6 复位视角：pan/zoom 全归零", cam3["panX"] == 0 and cam3["panY"] == 0 and cam3["zoom"] == 1, f"{cam3}")
    els2 = page.evaluate("() => window.__builder.elements().map(e => ({ id: e.id, x: e.position.x, y: e.position.y }))")
    intact = all(a["id"] == c["id"] for a, c in zip(els0, els2))
    check("P7 复位视角不清场景", len(els2) == len(els0) and intact, f"{len(els0)}→{len(els2)}")
    check("P8 全程无页面错误", not errs, str(errs[:1]))
    b.close()

print()
if fails:
    print(f"❌ 批3 平移/复位视角 E2E 失败：{fails}"); sys.exit(1)
print(f"✅ 批3 平移/复位视角 E2E 全过（{len(ok_all)} 项）")
