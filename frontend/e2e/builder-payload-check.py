# -*- coding: utf-8 -*-
"""⑦ 前置验证：belt_common_speed 事件 payload（v）经 WS 到达前端"""
import json, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    # P0 后 builder 迁入 /lab「自由搭建」Tab（/exp→/lab 重定向）；选择器作用域化
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
    page.locator(".tabbar .tab", has_text="自由搭建").click()
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
    r = page.evaluate("""async () => {
      const B = window.__builder;
      B.clear();
      B.add('ground', {mu: 0.2}, 0, -1.5);
      B.add('belt', {vb: 3, th: 0, mu: 0.4, L: 8}, 0, -1.0);   // 顶面 y=-0.85
      B.add('block', {m: 1, v0: 0, mu: 0.4}, 0, -0.35);         // 块底 y=-0.85 贴带面
      await B.run();
      const wait = (ms) => new Promise(r2 => setTimeout(r2, ms));
      await wait(600);
      const toast0 = B.toast();
      for (let i = 0; i < 100; i++) { await wait(200); if (B.simStatus() === 'ended') break; }
      return { toast: toast0, status: B.simStatus(), t: B.simT(), events: B.keyEvents().filter(e => e.eventType !== 'land_surface' && e.eventType !== 'leave_surface') };
    }""")
    print(json.dumps(r, ensure_ascii=False, indent=1))
    ok = any(e.get("payload") and "v" in e["payload"] for e in r["events"])
    page.screenshot(path=r"E:\Program\physicene\frontend\e2e\shots\builder-critical-panel.png")
    print("PAYLOAD_CHECK:", "PASS" if ok else "FAIL")
    b.close()
