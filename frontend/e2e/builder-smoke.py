# -*- coding: utf-8 -*-
"""阶段三④ 冒烟：/builder-dev 画布搭建 + 吸附验证 + 连线 + 截图"""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
OUT = r"E:\Program\physicene\frontend\e2e\shots\builder-dev-smoke.png"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = json.loads(r.read().decode())
    if body.get("code") != 0:
        raise SystemExit(f"登录失败: {body}")
    return body["data"]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"{BASE}/builder-dev")
    page.wait_for_selector(".builder .palette .item", timeout=8000)
    r = page.evaluate("""() => {
      const B = window.__builder;
      // 斜面 position=直角角点：底端锚点局部(6,0)，默认 L=6 θ=30°
      const slope = B.add('slope', {th: 30, mu: 0.2, L: 6}, -5, -2.5);   // 底端世界=(1,-2.5) 顶端=(-5,0.96)
      const block = B.add('block', {m: 1, v0: 0, mu: 0.2}, 0.3, -1.6);
      const belt = B.add('belt', {vb: 3, th: 0, mu: 0.4, L: 6}, 4, -2.5);
      const loop = B.add('loop_track', {radius: 1.2, side: 0}, 6.5, 2);
      const sphere = B.add('sphere', {m: 0.5, v0: 0}, 6.5, 0.9);
      const spring = B.add('spring', {k: 100, L0: 1, zeta: 0.05}, -5.5, 2.5);
      const wall = B.add('ground', {mu: 0.3}, 0, -3.2);
      const pulley = B.add('pulley', {kind: 0}, -6.5, 4);
      B.link(spring, '左端', block, '右', 'spring');
      // 吸附验证：block 底锚点(0,-0.5) 移到斜面底端(1,-2.5) 附近
      B.move(block, 1.06, -1.97);
      const snap = B.snapOf(block);
      return { count: B.count(), snap, elements: B.elements().map(e => ({type: e.type, x: e.position.x, y: e.position.y, links: e.links.length})) };
    }""")
    print(json.dumps(r, ensure_ascii=False, indent=1))
    page.wait_for_timeout(1200)
    page.screenshot(path=OUT, full_page=False)
    print("errors:", errors[:5])
    b.close()
