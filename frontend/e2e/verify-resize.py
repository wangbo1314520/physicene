# -*- coding: utf-8 -*-
"""子任务 B 复验（84c30c2 已修，本轮验收）：刷新 /lab → 默认搭建 Tab → 画布正常 → 拖元件 → 切结果 Tab 非 0x0。"""
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

VIEW_H = 14.0
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:80]))
    page.goto(f"{BASE}/lab")   # 刷新页面（默认 Tab 语义）
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
    check("B1 刷新后默认落在搭建 Tab（builder 挂载）", page.locator(".free-build-tab .builder").count() == 1)

    box = page.evaluate("() => { const c = document.querySelector('.free-build-tab .bcanvas canvas');"
                        " const r = c.getBoundingClientRect(); return { w: c.width, h: c.height, rw: r.width, rh: r.height } }")
    check("B2 搭建画布尺寸正常（非 0x0）", box["w"] > 500 and box["h"] > 300, f"{box['w']}x{box['h']}")

    # 能拖元件：放置地面 + 物块，拖物块到新位置
    page.evaluate("window.__builder.clear()")
    page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')]"
                  ".find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", "物块")
    page.wait_for_timeout(150)
    els = page.evaluate("window.__builder.elements()")
    bid, p0 = els[-1]["id"], els[-1]["position"]
    cb = page.evaluate("() => { const r = document.querySelector('.free-build-tab .bcanvas').getBoundingClientRect();"
                       " return { x: r.x, y: r.y, w: r.width, h: r.height } }")
    cx, cy, ppm = cb["x"] + cb["w"] / 2, cb["y"] + cb["h"] / 2, cb["h"] / VIEW_H
    sx0, sy0 = cx + p0["x"] * ppm, cy - p0["y"] * ppm
    sx1, sy1 = cx + 2.5 * ppm, cy - 1.5 * ppm
    page.mouse.move(sx0, sy0); page.mouse.down()
    for i in range(1, 11):
        page.mouse.move(sx0 + (sx1 - sx0) * i / 10, sy0 + (sy1 - sy0) * i / 10)
    page.mouse.up()
    page.wait_for_timeout(200)
    p1 = page.evaluate("(id) => window.__builder.elements().find(e => e.id === id).position", bid)
    moved = abs(p1["x"] - p0["x"]) > 0.5 or abs(p1["y"] - p0["y"]) > 0.5
    check("B3 能拖元件（物块位置改变）", moved, f"({p0['x']:.2f},{p0['y']:.2f})→({p1['x']:.2f},{p1['y']:.2f})")

    # 切结果 Tab：workspace canvas 非默认 300x150、非 0x0（追问2 修复点）
    page.locator(".tabbar .tab", has_text="结果").click()
    page.wait_for_timeout(700)
    sz = page.evaluate("() => { const c = document.querySelector('.lab .workspace canvas'); return c ? c.width + 'x' + c.height : null }")
    check("B4 切结果 Tab 画布恢复（非 0x0/非默认 300x150）", sz is not None and not sz.startswith("0x") and sz != "300x150", f"{sz}")
    check("B5 全程无页面错误", not errs, str(errs[:1]))
    b.close()

print()
if fails:
    print(f"❌ B 复验失败：{fails}"); sys.exit(1)
print(f"✅ B 复验全过（{len(ok_all)} 项）——resize/默认Tab 已在 84c30c2 落地，本轮验收确认")
