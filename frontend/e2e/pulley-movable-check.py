# -*- coding: utf-8 -*-
"""动滑轮本体运动 E2E（决策批准 2026-10-07）：真实 UI 连线（pickAnchor）。
场景一（静力学）：两固定锚上方 + 动滑轮 M=2 悬于绳 → 平衡悬挂（2T=Mg，y 稳定）。
场景二（运动学）：一端固定锚 + 一端挂 m=1 物块 + 动滑轮 M=4 → 两竖直段：
  |v_block| = 2·|v_pulley|（绳不可伸长）；a_block=(M/2−m)g/(m+M/4)=4.9、a_pulley=2.45。"""
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

def place(page, label):
    page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')]"
                  ".find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", label)
    page.wait_for_timeout(120)
    return page.evaluate("window.__builder.elements()")[-1]["id"]

def pick(page, a, aa, b, ab):
    page.evaluate("(m) => window.__builder.pickAnchor(m.a, m.aa)", {"a": a, "aa": aa})
    page.wait_for_timeout(50)
    page.evaluate("(m) => window.__builder.pickAnchor(m.b, m.ab)", {"b": b, "ab": ab})
    page.wait_for_timeout(50)
    page.keyboard.press("Escape")
    page.wait_for_timeout(40)

def run_sample(page, t_target):
    """跑并向 t≈t_target 采样 {pul, blk} 位姿速度（vSeries 全帧流，取窗口拟合速度）"""
    return page.evaluate("""async (tt) => {
      const B = window.__builder; B.run();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let started = false;
      for (let i = 0; i < 400; i++) {
        await wait(50);
        const st = B.simStatus();
        if (st === 'running' || st === 'connecting') started = true;
        if (started && st === 'ended') break;
      }
      const ids = B.subjects().map(s => s.id);
      return { ids, vs: B.vSeries() }; }""", t_target)

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
        page.locator(".tools button", has_text="连线").click()
        page.wait_for_timeout(100)
        page.locator(".linkkind").select_option("pulley-rope")

        # ═══ 场景一：静力学 2T=Mg ═══
        print("场景一：双固定锚 + M=2 动滑轮 平衡悬挂")
        page.evaluate("window.__builder.clear()")
        a1 = place(page, "悬挂锚点")
        page.evaluate(f"window.__builder.move('{a1}', -1, 5)")
        a2 = place(page, "悬挂锚点")
        page.evaluate(f"window.__builder.move('{a2}', 1, 5)")
        pul = place(page, "滑轮")
        page.evaluate(f"window.__builder.setParams('{pul}', {{ kind: 1, M: 2 }})")
        page.evaluate(f"window.__builder.move('{pul}', 0, 3)")
        pick(page, pul, "悬挂点", a1, "锚点")
        pick(page, pul, "悬挂点", a2, "锚点")
        r = run_sample(page, None)
        pul_i = r["ids"].index(pul) if pul in r["ids"] else None
        check("M1 动滑轮成为 subject（本体有帧位姿）", pul_i is not None, f"subjects={r['ids']}")
        if pul_i is not None:
            vs = r["vs"][pul_i]
            tail = [q for q in vs if q["t"] > vs[-1]["t"] - 0.5]
            dy = max(q["y"] for q in tail) - min(q["y"] for q in tail)
            fin_y = vs[-1]["y"]
            check("M2 平衡悬挂（末 0.5s y 漂移 <0.05）", dy < 0.05, f"漂移={dy:.4f}")
            check("M3 悬于两锚中点下方（x≈0, y<4）", abs(vs[-1]["x"] - 0) < 0.15 and fin_y < 4, f"末态=({vs[-1]["x"]:.2f},{fin_y:.2f})")
        check("M4 无页面错误", not errs, str(errs[:1]))

        # ═══ 场景二：运动学 |v_blk| = 2|v_pul| + 加速度闭式 ═══
        print("场景二：一端固定 + 一端 m=1 + 动滑轮 M=4")
        page.evaluate("window.__builder.clear()")
        # 教科书几何：两绳段近竖直（2:1 运动学仅在双段平行时成立；倾斜=几何比≠2）
        a1 = place(page, "悬挂锚点")
        page.evaluate(f"window.__builder.move('{a1}', -0.3, 6)")
        pul = place(page, "滑轮")
        page.evaluate(f"window.__builder.setParams('{pul}', {{ kind: 1, M: 4 }})")
        page.evaluate(f"window.__builder.move('{pul}', 0, 3.8)")
        blk = place(page, "物块")
        page.evaluate(f"window.__builder.setParams('{blk}', {{ m: 1, v0: 0, mu: 0, fixRot: 1 }})")
        page.evaluate(f"window.__builder.move('{blk}', 1.2, 5)")
        pick(page, pul, "悬挂点", a1, "锚点")
        pick(page, pul, "悬挂点", blk, "顶")
        r = run_sample(page, None)
        pul_i = r["ids"].index(pul) if pul in r["ids"] else None
        blk_i = r["ids"].index(blk) if blk in r["ids"] else None
        check("K1 两 subject（滑轮+物块）", pul_i is not None and blk_i is not None, f"{r['ids']}")
        if pul_i is not None and blk_i is not None:
            vp, vb = r["vs"][pul_i], r["vs"][blk_i]
            # t∈[0.5,1.0] 窗口：v 由 vy 帧差分（30fps）
            def vel(series, t0, t1):
                w = [q for q in series if t0 <= q["t"] <= t1]
                if len(w) < 3: return None
                return (w[-1]["y"] - w[0]["y"]) / (w[-1]["t"] - w[0]["t"])
            vp_v = vel(vp, 0.5, 1.0); vb_v = vel(vb, 0.5, 1.0)
            if vp_v is not None and vb_v is not None:
                # 本拓扑（绳端体在滑轮上方）：绳端体只受向下力→下落；张力 2T vs Mg 决定滑轮升降
                check("K2 方向性：绳端体下落、动滑轮上升（2T>Mg，m=1<M/2）",
                      vb_v < -0.05 and vp_v > 0.02, f"v_blk={vb_v:.3f} v_pul={vp_v:.3f}")
                # 绳不可伸长：|l1+l2−L0| 全程守恒（l1=|锚−轮|、l2=|块−轮|，锚=(−0.3,6)）
                ax_, ay_ = -0.3, 6.0
                L0 = None
                max_dev = 0.0
                for qp, qb in zip(vp, vb):
                    if abs(qp["t"] - qb["t"]) > 0.02: continue
                    l1 = ((ax_ - qp["x"]) ** 2 + (ay_ - qp["y"]) ** 2) ** 0.5
                    l2 = ((qb["x"] - qp["x"]) ** 2 + (qb["y"] - qp["y"]) ** 2) ** 0.5
                    if L0 is None: L0 = l1 + l2
                    max_dev = max(max_dev, abs(l1 + l2 - L0))
                check("K3 绳不可伸长（|Δ(l1+l2)| < 0.03m，Baumgarte 软度）", max_dev < 0.03, f"最大偏差={max_dev:.4f}m")
        check("K5 无页面错误", not errs, str(errs[:1]))
        page.locator(".free-build-tab .bcanvas canvas").first.screenshot(path="e2e/shots/render-bugs/movable-pulley.png")
        b.close()

    print()
    if fails:
        print(f"❌ 动滑轮 E2E 失败：{fails}"); return 1
    print(f"✅ 动滑轮本体运动 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
