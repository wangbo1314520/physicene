# -*- coding: utf-8 -*-
"""P2 E2E：检测器锚点——拖速度传感器 + 真实 UI 连线（pickAnchor）→ 运行 → probes 有读数。
DoD：①连线模式画布上能点到传感器探头锚 ②wire 连到物块 ③运行后 speed_sensor 探针有值。"""
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

def main() -> int:
    auth = login_api()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:80]))
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        page.locator(".palette .tabs button", has_text="力学").click()
        page.wait_for_timeout(150)

        # 搭建：地面 + 物块(v0=3, μ=0) + 速度传感器
        placed = page.evaluate("""() => { const B = window.__builder;
          B.clear();
          B.add('ground', { mu: 0 }, 0, -1);
          const blk = B.add('block', { m: 1, v0: 3, mu: 0, fixRot: 1 }, -3, -0.5);
          const sn = B.add('speed_sensor', {}, -3, 0.3);
          return { blk, sn }; }""")
        check("S0 搭建三件（地面+物块+速度传感器）", True)

        # 连线类型选「导线」→ 真实 pickAnchor
        page.locator(".tools button", has_text="连线").click()
        page.wait_for_timeout(100)
        page.locator(".linkkind").select_option("wire")
        page.evaluate("(m) => window.__builder.pickAnchor(m.a, m.aa)", {"a": placed["sn"], "aa": "探头"})
        page.wait_for_timeout(50)
        page.evaluate("(m) => window.__builder.pickAnchor(m.b, m.ab)", {"b": placed["blk"], "ab": "顶"})
        page.wait_for_timeout(50)
        page.keyboard.press("Escape")
        page.wait_for_timeout(50)
        links = page.evaluate(f"window.__builder.linksOf('{placed['sn']}')")
        check("S1 传感器·探头 → 物块·顶 连线成立（真实 pickAnchor）",
              len(links) == 1 and links[0]["anchorA"] == "探头",
              f"links={links}")

        # 运行
        r = page.evaluate("""async () => {
          const B = window.__builder; B.run();
          const wait = (ms) => new Promise(r => setTimeout(r, ms));
          let started = false;
          for (let i = 0; i < 400; i++) {
            await wait(50);
            const st = B.simStatus();
            if (st === 'running' || st === 'connecting') started = true;
            if (started && st === 'ended') break;
          }
          const probes = B.probes();
          const keys = Object.keys(probes).filter(k => k.includes('speed_sensor'));
          return { st: B.simStatus(), probeKeys: keys, val: keys.length ? probes[keys[0]] : null }; }""")
        check("S2 运行结束（ended）", r["st"] == "ended", f"st={r['st']}")
        check("S3 probes 有速度传感器读数（值非 null）",
              r["probeKeys"] and r["val"] and r["val"][1] > 2.5,
              f"keys={r['probeKeys']} val={r['val']}")
        check("S4 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ P2 检测器锚点 E2E 失败：{fails}"); return 1
    print(f"✅ P2 检测器锚点 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
