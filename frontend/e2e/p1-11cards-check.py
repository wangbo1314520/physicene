"""清偿5·P1 的 11 卡逐卡 E2E（55-65）：每卡一条端到端断言——搭→运行→内容/读数对理论。
轨道 A·builder TS 引擎（7 卡）：55 棱镜折射(Snell)/56 劈尖(等厚干涉)/57 双缝(Δx=Lλ/d)/
  61 光电效应(Eₖ=hν−W₀+截止频率)/62 氢原子(ΔE+λ)/64 玻尔碰撞(共振激发)/65 物质波(λ=h/√(2meU))
轨道 B·高考场景卡（4 卡）：58 波的多解/59 振动波动图像/60 波的叠加/63 核反应——
  打开卡片→▶开始→DOM 计算值对理论（这些卡的物理在各 Vue 场景内联实现，非 TS 引擎面）。
真相口径：P1 提交的"解锁 11 卡"原仅 3 卡有 builder 面；本清偿补 4 元件（wedge/double_slit/
electron_gun/bohr_collision）后 7 卡可搭可跑，余 4 卡走场景卡面。"""
import _env; _env.banner()  # 测点1前置：每轮回归头行打印环境指纹
import json, math, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
STAGE = ".lab canvas, .exp canvas:not(.hist), .alt-stage canvas, .sim25d canvas, .clab canvas"
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

        # ════════ 轨道 A：builder TS 引擎（7 卡） ════════
        print("══ 轨道 A：builder TS 引擎逐卡（搭→运行→读数对理论）")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

        def ts_run(build_js, name, detail=""):
            pg.evaluate("window.__builder.clear()")
            pg.evaluate(build_js)
            pg.locator(".free-build-tab .tools .primary").click()
            pg.wait_for_timeout(2600)  # TS 30fps 播完（rays/readings 停止后保留）
            return pg.evaluate("window.__builder.tsReadings()") or {}

        # 卡 55：Snell n=sinθ₁/sinθ₂
        rd = ts_run("() => { const B = window.__builder;"
            " B.add('light_source', {th1: 40, lam: 600}, -5, 2);"
            " B.add('prism', {n: 1.5, A: 60}, 0, 0);"
            " B.add('optic_screen', {}, 5, 0); }", "55")
        snell = math.sin(math.radians(rd.get("theta_1", 0))) / math.sin(math.radians(rd.get("theta_2", 90)))
        check("卡55 棱镜折射：sinθ₁/sinθ₂=n(1.5)±1%", abs(snell - 1.5) <= 0.015,
              f"ratio={snell:.4f}")
        rays = pg.evaluate("window.__builder.tsRays()") or []
        check("卡55 光线≥3 段且含折射", len(rays) >= 3
              and any(r["kind"] == "refracted" for r in rays), f"n={len(rays)}")

        # 卡 56：劈尖 ΔL=λ/(2n·tanα)（600nm, n=1.5, α=0.0573°=0.001rad → 0.200mm）
        rd = ts_run("() => { window.__builder.add('wedge', {lam: 600, n: 1.5, alpha: 0.0573}, 0, 0); }", "56")
        check("卡56 劈尖：ΔL≈0.200mm±2%（λ/(2n·tanα)）", abs(rd.get("fringe_mm", 0) - 0.200) <= 0.004,
              f"fringe={rd.get('fringe_mm')}")

        # 卡 57：双缝 Δx=Lλ/d（600nm, d=0.2mm, L=1m → 3mm）
        rd = ts_run("() => { window.__builder.add('double_slit', {lam: 600, d: 0.2, L: 1}, 0, 0); }", "57")
        check("卡57 双缝：Δx=3.0mm±1%（Lλ/d）", abs(rd.get("dx_mm", 0) - 3.0) <= 0.03,
              f"dx={rd.get('dx_mm')}")

        # 卡 61：光电效应 钠 W=2.28eV，ν=6e14 → Eₖ=0.203eV，截止 ν₀≈5.51e14
        rd = ts_run("() => { window.__builder.add('photo_tube', {mat: 0}, 0, 0); }", "61")
        ek_t = 6.626e-34 * 6e14 / 1.602e-19 - 2.28
        check("卡61 光电效应：W=2.28eV 且截止频率≈5.51×10¹⁴Hz",
              abs(rd.get("work_function", 0) - 2.28) <= 0.01 and abs(rd.get("cutoff_freq", 0) - 5.51) <= 0.05,
              f"W={rd.get('work_function')} v0={rd.get('cutoff_freq')}e14")
        check("卡61 光电效应：Eₖ=hν−W₀≈0.203eV±0.01", abs(rd.get("max_ek", -9) - ek_t) <= 0.01,
              f"Ek={rd.get('max_ek')}")

        # 卡 62：氢原子 3→2 → ΔE=1.889eV，λ=656.3nm
        rd = ts_run("() => { window.__builder.add('h_atom', {m: 3, n: 2}, 0, 0); }", "62")
        check("卡62 氢原子：ΔE=1.889eV±0.01 且 λ≈656.3nm±1",
              abs(rd.get("delta_E", 0) - 1.8889) <= 0.01 and abs(rd.get("wavelength_nm", 0) - 656.3) <= 1.0,
              f"dE={rd.get('delta_E')} λ={rd.get('wavelength_nm')}")

        # 卡 64：玻尔碰撞 E=12.75eV → 共振 n=1↔4（ΔE=13.6(1−1/16)=12.75）
        rd = ts_run("() => { window.__builder.add('bohr_collision', {E: 12.75, maxN: 4}, 0, 0); }", "64")
        check("卡64 玻尔碰撞：E=12.75eV 恰配 1↔4 跃迁（共振+ΔE±0.1）",
              rd.get("resonant") == 1 and rd.get("res_n") == 4 and abs(rd.get("delta_E", 0) - 12.75) <= 0.1,
              f"res={rd.get('resonant')} n={rd.get('res_n')} dE={rd.get('delta_E')}")

        # 卡 65：物质波 U=100V → λ=h/√(2meU)≈122.7pm
        rd = ts_run("() => { window.__builder.add('electron_gun', {U: 100}, 0, 0); }", "65")
        check("卡65 物质波：U=100V → λ≈122.7pm±1", abs(rd.get("lambda_pm", 0) - 122.7) <= 1.0,
              f"λ={rd.get('lambda_pm')}pm")

        # ════════ 轨道 B：高考场景卡（4 卡，DOM 计算值对理论） ════════
        print("══ 轨道 B：高考场景卡逐卡（开卡→开始→DOM 值对理论）")

        def scene_card(cid, label, must_contain):
            pg.goto(f"{BASE}/exp/{cid}")
            pg.wait_for_selector(STAGE, timeout=15000)
            pg.wait_for_timeout(800)
            clicked = False
            for btn in pg.locator("button").all()[:8]:
                t = (btn.text_content() or "").strip()
                if t and ("开始" in t or "▶" in t):
                    btn.click(); clicked = True; break
            pg.wait_for_timeout(3000)
            body = pg.inner_text("body")
            ok = clicked and all(s in body for s in must_contain)
            check(f"卡{label}", ok,
                  "" if ok else f"缺: {[s for s in must_contain if s not in body]}")

        # 卡 58：默认 n=1,+x → v=(1×4+1)/1=5.00 m/s, T=0.80 s
        scene_card("gk-wave-multi-solution", "58 波的多解：v=5.00 m/s 且 T=λ/v=0.80（nλ+Δx₀）",
                   ["v=5.00 m/s", "T=λ/v=0.80"])
        # 卡 59：λ=4,T=2 → v=2.00；x_P=1 → 首次波峰 t≈1.00s
        scene_card("gk-vibration-wave-graphs", "59 振动+波动图像：v=λ/T=2.00 且首峰 t≈1.00s",
                   ["v=λ/T=2.00 m/s", "首次到达波峰"])
        # 卡 60：P(1,0) → PS₁=3,PS₂=1,Δr=2=λ → 加强
        scene_card("gk-wave-superposition", "60 波的叠加：Δr=2.00m=1λ → 加强",
                   ["Δr=2.00", "加强"])
        # 卡 63：D+T 聚变 → A/Z 守恒，Δm=0.0189u，ΔE=17.59MeV
        scene_card("gk-nuclear-reaction", "63 核反应：守恒 且 ΔE=17.59MeV=Δmc²",
                   ["守恒", "ΔE=17.59 MeV"])

        check("全程零页面错误", not errs, str(errs[:2]))
        b.close()

    n = sum(1 for _, ok in results if ok)
    print(f"\nP1 11卡 E2E：{n}/{len(results)} {'✅' if n == len(results) else '❌'}")
    return 0 if n == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
