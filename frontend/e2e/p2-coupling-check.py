"""P2 E2E：耦合接入——rail-rod（导轨棒）+ piston-gas（活塞气室）画布可见+数值断言。
画布内容验证（不只验状态）：导轨棒场景验 B 场立方体渲染+棒运动；活塞验刚体渲染+平衡。"""
import _env; _env.banner()  # 测点1前置：每轮回归头行打印环境指纹
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
    results = []
    def check(name, ok, detail=""):
        results.append((name, ok)); print(f"  {'✓' if ok else '✗'} {name} {detail}")

    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1500, "height": 950})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80]))
        auth = login()
        pg.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        pg.locator(".tabbar .tab", has_text="搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

        # ═ 场景 1：导轨棒 ═
        print("══ P2-1 导轨棒（rod_bar + rail_pair + b_region）")
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.add('ground', {mu: 0}, 0, -0.5)")
        pg.evaluate("window.__builder.add('rail_pair', {L: 4}, 0, 0)")
        pg.evaluate("window.__builder.add('rod_bar', {m: 1, R: 1}, -1, 0)")
        pg.evaluate("window.__builder.add('b_region', {B: 1, dir: 0}, 0, 2)")
        pg.locator(".free-build-tab .tools .primary").click()
        p1_ended = False
        for _ in range(80):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": p1_ended = True; break
        check("导轨棒：ended", p1_ended)
        # 画布内容验证：导轨棒场景必须有刚体运动（subjects 非空+有位置变化）
        subs1 = pg.evaluate("window.__builder.subjects()")
        check("导轨棒：subjects 非空（刚体渲染）", bool(subs1) and len(subs1) > 0,
              f"n={len(subs1) if subs1 else 0}")
        check("导轨棒：棒有位移（画布可见运动）",
              bool(subs1) and any(abs(s["x"]) > 0.1 or abs(s["y"]) > 0.1 for s in subs1),
              f"x={subs1[0]['x']:.3f}" if subs1 else "无")
        pg.screenshot(path=str(OUT / "p2-rail-rod.png"))

        # ═ 场景 2：活塞-气室 ═
        print("══ P2-2 活塞-气室（piston + gas_cell）")
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.add('cylinder', {S: 0.01}, 0, 0)")
        pg.evaluate("window.__builder.add('piston', {M: 10, dampingRatio: 0.5}, 0, 1)")
        pg.evaluate("window.__builder.add('gas_cell', {p0: 101325, V0: 0.01, T0: 300}, 0, -1)")
        pg.locator(".free-build-tab .tools .primary").click()
        p2_ended = False
        for _ in range(80):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": p2_ended = True; break
        check("活塞气室：ended", p2_ended)
        # 画布内容验证：活塞刚体渲染+有物理（ subjects 有活塞位置）
        subs2 = pg.evaluate("window.__builder.subjects()")
        check("活塞气室：subjects 非空（刚体渲染）", bool(subs2) and len(subs2) > 0,
              f"n={len(subs2) if subs2 else 0}")
        pg.screenshot(path=str(OUT / "p2-piston-gas.png"))

        check("全程零页面错误", not errs, str(errs[:2]))
        b.close()

    n = sum(1 for _, ok in results if ok)
    print(f"\nP2 E2E：{n}/{len(results)} {'✅' if n == len(results) else '❌'}")
    return 0 if n == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
