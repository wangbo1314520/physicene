# -*- coding: utf-8 -*-
"""A+B E2E：天体动画——搭建 Tab 卫星网格运动 + 结果 Tab 帧位姿更新。
判据：运行中取 2 帧的 mesh.position，断言 x 变化 > 0.1 单位（C 条款前置）。"""
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

        # 载入天体卡（T1 圆轨道）
        page.evaluate("window.__builder.clear()")
        page.evaluate("window.__builder.loadTemplate('cel-satellite-t1')")
        page.wait_for_timeout(300)

        # 获取卫星 id
        els = page.evaluate("window.__builder.elements()")
        sat_id = next((e["id"] for e in els if e["type"] == "satellite"), None)
        check("T0 模板载入，卫星存在", sat_id is not None, f"sat_id={sat_id}")
        if not sat_id:
            b.close(); return 1

        # 搭建 Tab：运行中取 2 帧 position
        page.evaluate("window.__builder.run()")
        poses1 = page.evaluate(f"""async () => {{
          const B = window.__builder;
          const wait = (ms) => new Promise(r => setTimeout(r, ms));
          // 运行后 1s 取第一帧
          await wait(1000);
          const p1 = B.tsPoses ? B.tsPoses().find(q => q.id === '{sat_id}') : null;
          await wait(1000);
          const p2 = B.tsPoses ? B.tsPoses().find(q => q.id === '{sat_id}') : null;
          return {{ p1, p2, st: B.tsStatus() }};
        }}""")
        check("T1 TS 引擎运行中（tsStatus=running）", poses1["st"] == "running", f"st={poses1['st']}")
        if poses1["p1"] and poses1["p2"]:
            dx = abs(poses1["p2"]["x"] - poses1["p1"]["x"])
            check("T2 卫星 x 在 1s 内变化 >0.1 单位（动画在动）", dx > 0.1,
                  f"dx={dx:.3f} p1.x={poses1['p1']['x']:.2f} p2.x={poses1['p2']['x']:.2f}")
        else:
            check("T2 卫星 x 在 1s 内变化 >0.1 单位", False,
                  f"p1={poses1['p1']} p2={poses1['p2']}（poses 通道空）")

        # 画布网格位置验证：BuilderCanvas poseOf 是否消费 TS poses
        # 通过截图比较（运行前后像素差异）
        shot1 = page.locator(".free-build-tab .bcanvas canvas").first.screenshot()
        page.wait_for_timeout(500)
        shot2 = page.locator(".free-build-tab .bcanvas canvas").first.screenshot()
        diff = len(shot1) != len(shot2) or shot1 != shot2
        check("T3 搭建 Tab 画布内容随时间变化（截图差异）", diff,
              f"len1={len(shot1)} len2={len(shot2)} same={shot1 == shot2}")

        # 等运行结束
        page.evaluate("""async () => {
          const B = window.__builder; const wait = (ms) => new Promise(r => setTimeout(r, ms));
          let ts = false;
          for (let i = 0; i < 400; i++) { await wait(50); const st = B.tsStatus();
            if (st === 'running') ts = true; if (ts && st === 'ended') break; }
        }""")

        # Step2 单页：无结果 Tab——直接断言 TS 末态位姿已入共享 store（threeScene watch 消费同源）
        page.wait_for_timeout(800)
        n_poses = page.evaluate("() => { const p = window.__builder.tsPoses(); return p ? Object.keys(p).length : 0 }")
        check("T4 TS 末态位姿入 store（单页直读）", n_poses > 0, f"poses={n_poses}")
        check("T5 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ A+B 天体动画 E2E 失败：{fails}"); return 1
    print(f"✅ A+B 天体动画 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
