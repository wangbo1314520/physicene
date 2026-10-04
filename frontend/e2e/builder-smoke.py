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
    # P0 后 builder 迁入 /lab「自由搭建」Tab（/exp→/lab 重定向）；选择器作用域化
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
    page.locator(".tabbar .tab", has_text="搭建").click()
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
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

    # ── 运行场景：斜面滑块（Java dyn4j 真实运行）──
    run = page.evaluate("""async () => {
      const B = window.__builder;
      B.clear();
      B.add('ground', {mu: 0.2}, 0, -3.2);
      B.add('slope', {th: 30, mu: 0, L: 6}, -4, -2.5);      // 面：(-4,0.96)→(2,-2.5)
      const blk = B.add('block', {m: 1, v0: 0, mu: 0}, -0.75, -0.34);
      B.select(blk);
      window.__builder_setAngle = null;
      B.run();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 80; i++) {   // 最长 ~16s
        await wait(200);
        if (B.simStatus() === 'ended') break;
      }
      return { status: B.simStatus(), t: B.simT(), keyEvents: B.keyEvents(), subjects: B.subjects() };
    }""")
    print(json.dumps(run, ensure_ascii=False, indent=1))
    ok = (run["status"] == "ended" and run["t"] and run["t"] > 1
          and any(s["id"].startswith("block") and s["x"] > 0.5 for s in run["subjects"]))
    print("RUN_CHECK:", "PASS" if ok else "FAIL")
    print("errors:", errors[:5])
    b.close()
    sys.exit(0 if ok else 1)
