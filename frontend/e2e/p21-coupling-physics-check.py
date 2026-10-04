"""P2.1 E2E：耦合物理闭环——导轨棒 v=2.00±0.01 + 活塞气室 p·A=Mg±1%（硬断言非"运动可见"）。
数值从 probes 通道读（Java orchestrator → couplingReadings → Frame.probes → WS frame → __builder.probes）。
理论：导轨棒 v_m = F·R/(B²L²)（F=2,R=1,B=1,L=1 → 2.00；EMF→电流→安培力减速收敛）；
     活塞气室平衡 (p−p_atm)·A = Mg（M=10,A=0.01 → p·A=98N，气弹簧+阻尼衰减到平衡）。"""
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

def wait_ended(pg, label):
    for _ in range(100):
        pg.wait_for_timeout(300)
        if pg.evaluate("window.__builder.simStatus()") == "ended":
            return True
    return False

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

        # ═ 导轨棒：F=2N 恒力推 → EMF 减速 → 终速 v_m = F·R/(B²L²) = 2.00 ═
        # 几何：rail=wall 1×1 顶面 y=0；rod=cube 1×1 置于 (0,0.5) 恰卧轨面（无重叠）；
        #      b_region 为 sensor 不碰撞。tau=mR/(B²L²)=1s，12s 末 v=2(1-e^-12)≈2.000006
        print("══ P2.1-1 导轨棒耦合（v=2.00±0.01 + I≈B·L·v/R）")
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.add('rail_pair', {L: 1}, 0, -0.5)")
        rod_id = pg.evaluate("window.__builder.add('rod_bar', {m: 1, R: 1, v0: 0, F: 2}, 0, 0.5)")
        pg.evaluate("window.__builder.add('b_region', {B: 1, dir: 0}, 0, 2)")
        pg.locator(".free-build-tab .tools .primary").click()
        check("导轨棒：ended", wait_ended(pg, "rod"))
        subs = pg.evaluate("window.__builder.subjects()")
        rod = next((s for s in subs if s["id"] == rod_id), None)
        vx = rod["vx"] if rod else -99
        check("导轨棒：终速 v=2.00±0.01（EMF→安培力平衡 F_ext）", abs(vx - 2.00) <= 0.01, f"vx={vx:.4f}")
        probes = pg.evaluate("window.__builder.probes()")
        i_key = f"I_R_{rod_id}"
        i_val = probes[i_key][1] if i_key in (probes or {}) else None
        check("导轨棒：支路电流 I=B·L·v/R≈2A±2%（耦合读数非空）",
              i_val is not None and abs(i_val - 2.0) <= 0.04, f"I={i_val}")
        v_probe = probes.get(f"v_{rod_id}", [0, None])[1]
        check("导轨棒：probes v 与 subjects vx 一致（同一物理源）",
              v_probe is not None and abs(v_probe - vx) < 1e-6, f"v_probe={v_probe}")
        pg.screenshot(path=str(OUT / "p21-rail-rod-physics.png"))

        # ═ 活塞气室：M=10, A=0.01 → 平衡 (p−p_atm)·A = Mg = 98N ═
        # 几何：cylinder=wall 1×1 顶面 y=0.5；piston=cube 1×1 置 (0,1.2) 底面 0.7 悬空
        #      （不触缸壁——触壁则由墙支撑、气压永不起作用）；气室 p0=1atm V0=0.01 等温
        print("══ P2.1-2 活塞气室平衡（p·A=Mg±1%）")
        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.add('cylinder', {S: 0.01}, 0, 0)")
        pid = pg.evaluate("window.__builder.add('piston', {M: 10, dampingRatio: 0.5}, 0, 1.2)")
        pg.evaluate("window.__builder.add('gas_cell', {p0: 101325, V0: 0.01, T0: 300, gamma: 1}, 0, -1)")
        pg.locator(".free-build-tab .tools .primary").click()
        check("活塞气室：ended", wait_ended(pg, "piston"))
        subs2 = pg.evaluate("window.__builder.subjects()")
        pis = next((s for s in subs2 if s["id"] == pid), None)
        vy = pis["vy"] if pis else -99
        check("活塞气室：平衡静止 |vy|<0.1（气弹簧+阻尼收敛）", abs(vy) < 0.1, f"vy={vy:.4f}")
        probes2 = pg.evaluate("window.__builder.probes()")
        pa = probes2.get(f"pA_{pid}", [0, None])[1]
        mg = probes2.get(f"Mg_{pid}", [0, None])[1]
        check("活塞气室：硬断言 p·A=Mg±1%（读耦合数值非运动学代理）",
              pa is not None and mg is not None and abs(pa - mg) / mg <= 0.01,
              f"pA={pa} Mg={mg}")
        pg.screenshot(path=str(OUT / "p21-piston-gas-physics.png"))

        check("全程零页面错误", not errs, str(errs[:2]))
        b.close()

    n = sum(1 for _, ok in results if ok)
    print(f"\nP2.1 E2E：{n}/{len(results)} {'✅' if n == len(results) else '❌'}")
    return 0 if n == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
