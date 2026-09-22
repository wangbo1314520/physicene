"""P1.1 E2E：TS 引擎渲染+内容断言——光线数量/种类（=颜色映射源）+ 读数对理论。
在 /lab 自由搭建 Tab 内：搭光学（光源+棱镜+屏）与近代（氢原子 3→2）场景，断言：
- 光学：rays ≥3 段、kinds 含 incident+refracted、mediums 含 glass+air（BuilderCanvas 按 kind 着色，
  kind 集合=颜色断言）、每段非退化；delta_min 对棱镜最小偏向角理论 2·asin(n·sin(A/2))−A=37.18°
- 近代：readings.delta_E=1.889eV、wavelength_nm≈656.3nm（巴尔末 Hα，理论 13.6×(1/2²−1/3²)）
测点1 前置：不再只验 runstate 文本（状态断言≠内容断言——P2.1 评审令）。"""
import _env; _env.banner()  # 测点1前置：每轮回归头行打印环境指纹
import json, math, sys, urllib.request
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
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

        # ═ 光学场景：光源 + 棱镜 + 屏（n=1.5, A=60°, 入射 40°） ═
        print("══ P1.1-1 光学（棱镜折射光线 + 最小偏向角理论）")
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.add('light_source', {th1: 40, lam: 600}, -5, 2)")
        pg.evaluate("window.__builder.add('prism', {n: 1.5, A: 60}, 0, 0)")
        pg.evaluate("window.__builder.add('optic_screen', {}, 5, 0)")
        pg.locator(".free-build-tab .tools .primary").click()
        pg.wait_for_timeout(2500)  # TS 引擎 30fps 播完（rays 停止后保留）
        rays = pg.evaluate("window.__builder.tsRays()") or []
        kinds = {r["kind"] for r in rays}
        mediums = {r.get("medium", "") for r in rays}
        nondeg = [r for r in rays if math.hypot(r["x1"] - r["x0"], r["y1"] - r["y0"]) > 0.1]
        check("光学：光线段数 ≥3（入射+玻璃内+出射）", len(rays) >= 3, f"n={len(rays)}")
        check("光学：kind 含 incident+refracted（颜色映射源）",
              "incident" in kinds and "refracted" in kinds, f"kinds={sorted(kinds)}")
        check("光学：medium 含 glass+air（双色以上）", "glass" in mediums and "air" in mediums,
              f"mediums={sorted(mediums)}")
        check("光学：全部光线段非退化（长度>0.1m）", len(rays) > 0 and len(nondeg) == len(rays),
              f"{len(nondeg)}/{len(rays)}")
        rd = pg.evaluate("window.__builder.tsReadings()") or {}
        dmin_theory = 2 * math.degrees(math.asin(1.5 * math.sin(math.radians(30)))) - 60  # =37.18°
        check("光学：delta_min=最小偏向角理论±0.1°",
              "delta_min" in rd and abs(rd["delta_min"] - dmin_theory) <= 0.1,
              f"got={rd.get('delta_min')} theory={dmin_theory:.2f}")
        check("光学：TS 引擎已结束（runstate）",
              "结束" in (pg.evaluate("() => document.querySelector('.free-build-tab .runstate')?.textContent || ''")),
              "")
        pg.screenshot(path=str(OUT / "p11-optics.png"))

        # ═ 近代场景：氢原子 3→2（Hα） ═
        print("══ P1.1-2 近代（能级跃迁 ΔE/λ 对理论）")
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.add('h_atom', {m: 3, n: 2}, 0, 0)")
        pg.locator(".free-build-tab .tools .primary").click()
        pg.wait_for_timeout(2500)
        rd2 = pg.evaluate("window.__builder.tsReadings()") or {}
        de_theory = 13.6 * (1 / 4 - 1 / 9)  # 1.8889 eV
        check("近代：delta_E=1.889eV±0.01（E=−13.6/n²）",
              "delta_E" in rd2 and abs(rd2["delta_E"] - de_theory) <= 0.01,
              f"got={rd2.get('delta_E')} theory={de_theory:.4f}")
        check("近代：wavelength≈656.3nm±1（巴尔末 Hα）",
              "wavelength_nm" in rd2 and abs(rd2["wavelength_nm"] - 656.3) <= 1.0,
              f"got={rd2.get('wavelength_nm')}")
        check("近代：TS 引擎已结束（runstate）",
              "结束" in (pg.evaluate("() => document.querySelector('.free-build-tab .runstate')?.textContent || ''")),
              "")
        pg.screenshot(path=str(OUT / "p11-modern.png"))

        check("全程零页面错误", not errs, str(errs[:2]))
        b.close()

    n = sum(1 for _, ok in results if ok)
    print(f"\nP1.1 E2E：{n}/{len(results)} {'✅' if n == len(results) else '❌'}")
    return 0 if n == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
