# -*- coding: utf-8 -*-
"""P5b-3·free-build 器材 E2E（14 元件缺口清偿）：不经模板、直接搭场景断言器材行为。
场景一 pulley 阿特伍德：a=(m₂−m₁)g/(m₁+m₂)，t=1s 采样 |v₁|=|v₂|=a·t（绳约束+牛顿）
场景二 检测器三件：μ 滑块 v0=4 → t=0.5s 速度 v0−μgt、停距 x=v₀²/(2μg)（range_finder 末值）
场景三 显示 4 件 smoke：放置+运行无页面错误、元件仍在
场景四（单测覆盖）虚设检测器警告——vitest 侧 EngineAnalyzer 断言
用法：python e2e/free-build-elements-check.py（需 Vite+Java 已起）"""
import _env; _env.banner()
import json, math, sys, time, urllib.request
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

VIEW_W, VIEW_H = 24.0, 14.0  # 与 walkthrough 同口径（画布世界窗）

class W:
    def __init__(self, page):
        box = page.evaluate("""() => { const c = document.querySelector('.free-build-tab .builder canvas'); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } }""")
        self.cx, self.cy = box["x"] + box["w"] / 2, box["y"] + box["h"] / 2  # 页面绝对坐标（鼠标需要）
        self.ppm = box["h"] / VIEW_H
    def to_screen(self, wx, wy):
        return (self.cx + wx * self.ppm, self.cy - wy * self.ppm)

def drag(page, w, fx, fy, tx, ty, steps=10):
    sx0, sy0 = w.to_screen(fx, fy)
    sx1, sy1 = w.to_screen(tx, ty)
    page.mouse.move(sx0, sy0)
    page.mouse.down()
    for i in range(1, steps + 1):
        page.mouse.move(sx0 + (sx1 - sx0) * i / steps, sy0 + (sy1 - sy0) * i / steps)
    page.mouse.up()
    page.wait_for_timeout(120)

def place_at(page, w, label, target):
    """面板放置（默认位）→ 拖拽到世界坐标 target（精确文本匹配见 place）"""
    place(page, label)
    page.wait_for_timeout(120)
    els = page.evaluate("window.__builder.elements()")
    e = els[-1]
    drag(page, w, e["position"]["x"], e["position"]["y"], target[0], target[1])
    return e["id"]

def domain(page, label):
    page.locator(".palette .tabs button", has_text=label).click()
    page.wait_for_timeout(120)

def place(page, label):
    # 精确文本匹配（has_text 是子串匹配——"速度传感器"会撞上"加速度传感器"）
    page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')]"
                  ".find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", label)
    page.wait_for_timeout(120)
    els = page.evaluate("window.__builder.elements()")
    return els[-1]["id"]

def sample_at(page, t_target, need_probes=False):
    """轮询采样：返回 t≈t_target 的 {status,t,subjects,probes}。need_probes=True 时只收带 probes 的帧
    （probes 隔帧上值；无传感器场景传 False，否则 best 永空退化到 ended 帧）"""
    best = None
    t0 = time.time()
    while time.time() - t0 < 25:
        st = page.evaluate("() => ({ status: window.__builder.simStatus(), t: window.__builder.simT(),"
                           " s: window.__builder.subjects(), p: window.__builder.probes() ?? {} })")
        ok = abs(st["t"] - t_target) < 0.12 and ((not need_probes) or st["p"])
        if st["status"] in ("running",) and ok and best is None:
            best = st
        if st["status"] == "ended":
            return best or st
        if best and st["t"] > t_target + 0.3:
            return best
        page.wait_for_timeout(30)
    return best

def main() -> int:
    auth = login_api()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        page.locator(".tabbar .tab", has_text="自由搭建").click()
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

        # ═══ 场景一：pulley 阿特伍德 ═══
        print("场景一：滑轮阿特伍德")
        page.evaluate("window.__builder.clear()")
        domain(page, "力学")
        w = W(page)
        pul = place_at(page, w, "滑轮", (0, 4.5))
        b1 = place_at(page, w, "物块", (-1, 3))
        b2 = place_at(page, w, "物块", (1, 3))
        page.evaluate("(m) => { const B = window.__builder; B.setParams(m.b1, { m: 1.9, v0: 0, mu: 0, fixRot: 1 });"
                      " B.setParams(m.b2, { m: 2.1, v0: 0, mu: 0, fixRot: 1 }) }", {"b1": b1, "b2": b2})
        # 位置：滑轮 (0,4)，块 (−1,3)/(1,3)（place 后拖到目标——用 setParams 无位置 API，改用 elements 直改？用 drag）
        page.evaluate("(m) => { const B = window.__builder; B.link(m.pul, '悬挂点', m.b1, '顶', 'pulley-rope');"
                      " B.link(m.pul, '悬挂点', m.b2, '顶', 'pulley-rope') }", {"pul": pul, "b1": b1, "b2": b2})
        page.locator(".tools .primary").click()
        st = sample_at(page, 1.0, need_probes=False)
        a_th = (2.1 - 1.9) * 9.8 / (2.1 + 1.9)
        v_th = a_th * (st["t"] if st else 1.0)
        if st and len(st["s"]) >= 2:
            v1, v2 = st["s"][0]["vy"], st["s"][1]["vy"]
            check("阿特伍德 |v|=a·t（重物）", abs(abs(v2) - v_th) / v_th < 0.12,
                  f"v2={v2:.3f} theory={v_th:.3f}")
            check("绳约束 |v₁|=|v₂|（轻绳不可伸长）", abs(abs(v1) - abs(v2)) < 0.05, f"|v1|={abs(v1):.3f} |v2|={abs(v2):.3f}")
            check("方向相反（绳传递）", v1 * v2 < 0, f"v1={v1:.3f} v2={v2:.3f}")
        else:
            check("阿特伍德采样", False, "无 subjects")
        while page.evaluate("window.__builder.simStatus()") != "ended":
            page.wait_for_timeout(200)

        # ═══ 场景二：检测器三件（μ 滑块 + speed/accel/range）═══
        print("场景二：检测器读数")
        page.evaluate("window.__builder.clear()")
        domain(page, "力学")
        w = W(page)
        place_at(page, w, "地面", (0, -0.5))
        blk = place_at(page, w, "物块", (0, 0.1))
        page.evaluate("(m) => window.__builder.setParams(m.b, { m: 1, v0: 4, mu: 0.1, fixRot: 1 })", {"b": blk})
        page.evaluate("() => { const g = window.__builder.elements().find(e => e.type === 'ground'); if (g) window.__builder.setParams(g.id, { mu: 0.1 }) }")
        domain(page, "通用")
        w = W(page)
        for label, tgt in (("加速度传感器", (-2, 1)), ("速度传感器", (-2, 0.5)), ("距离传感器", (0, 1))):
            sid = place_at(page, w, label, tgt)
            page.evaluate("(m) => window.__builder.link(m.s, '探头', m.b, '顶', 'rope')", {"s": sid, "b": blk})
        page.locator(".tools .primary").click()
        st = sample_at(page, 0.5, need_probes=True)
        t_s = st["t"] if st else 0.5
        v_th = 4 - 0.1 * 9.8 * t_s
        spd = next((st["p"][k] for k in st["p"] if "speed_sensor" in k), None) if st else None
        check("速度传感器 t=0.5s 读数 v0−μgt", spd is not None and abs(spd[1] - v_th) / v_th < 0.1,
              f"got={spd[1] if spd else None} theory={v_th:.3f}")
        acc = next((st["p"][k] for k in st["p"] if "accel_sensor" in k), None) if st else None
        check("加速度传感器读数 −μg（滑动摩擦减速）", acc is not None and abs(acc[1] + 0.98) < 0.25,
              f"got={acc[1] if acc else None} theory=−0.98")
        while page.evaluate("window.__builder.simStatus()") != "ended":
            page.wait_for_timeout(200)
        end = page.evaluate("() => ({ p: window.__builder.probes() ?? {}, s: window.__builder.subjects() })")
        x_th = 4 * 4 / (2 * 0.1 * 9.8)
        rng = next((end["p"][k] for k in end["p"] if "range" in k or "距离" in k), None)
        check("位移传感器末值 x=v₀²/(2μg)", rng is not None and abs(rng[1] - x_th) / x_th < 0.08,
              f"got={rng[1] if rng else None} theory={x_th:.3f}")

        # ═══ 场景三b：photogate/force/energy（2026-10-01 十轮追问3——原列 P6 提前落地）═══
        print("场景三b：光电门/力/能量")
        page.evaluate("window.__builder.clear()")
        domain(page, "力学")
        w = W(page)
        place_at(page, w, "地面", (0, -0.5))
        ball = place_at(page, w, "小球", (2, 3.05))   # 静置于地面：force N=mg=9.8、energy≈0（y_ref=传感器高度）
        page.evaluate("(m) => window.__builder.setParams(m.b, { m: 1, v0: 0, mus: 0, e: 0 })", {"b": ball})
        domain(page, "通用")
        w = W(page)
        fs = place_at(page, w, "力传感器", (-2, 1))
        em = place_at(page, w, "能量条", (-2, 0.5))
        for sid in (fs, em):
            page.evaluate("(m) => window.__builder.link(m.s, '探头', m.b, '顶', 'rope')", {"s": sid, "b": ball})
        # 光电门：自由落体小球从 h 落下，门线在传感器 x——独立场景跑（同场景跑两个球会互相干扰）
        page.locator(".tools .primary").click()
        for _ in range(90):
            page.wait_for_timeout(200)
            if page.evaluate("window.__builder.simStatus()") == "ended":
                break
        end = page.evaluate("() => window.__builder.probes() ?? {}")
        fv = next((end[k] for k in end if "force_sensor" in k), None)
        check("力传感器静置 N=mg=9.8N", fv is not None and abs(fv[1] - 9.8) < 0.35,
              f"got={fv[1] if fv else None} theory=9.8")
        ev = next((end[k] for k in end if "energy_meter" in k), None)
        e_th = 9.8 * (0.1 - 0.5)  # 球从 3.05 落至地面静置（球心 0.1，半径 0.5 顶地面 −0.4+0.5）；
        # y_ref=传感器放置高度 0.5 → 末态 Ep=mg(0.1−0.5)。落地弹跳耗散后 v=0
        check("能量条末态 E=mg(y_end−y_ref)", ev is not None and abs(ev[1] - e_th) < 0.35,
              f"got={ev[1] if ev else None} theory={e_th:.2f}")
        # 光电门：竖直上抛小球越过门线（球起始 x=2 下落——门线放 x=2 竖直下方不触发穿越；
        # 改水平放置：小球 v0=0 从 x=2 自由落体，门在 (2, 1.5)——x 不变不穿越。正确测法：门线 x=2.2，
        # 给球 vx？自由落体无 vx……光电门测竖直下落需门线水平。当前门线=x 竖直线——用水平初速球：
        # 平抛小球 v0=3 从 (0,3) → 越过 x=1.5 门线于 t=0.5s（y 同时下落，门只记 x 穿越）
        page.evaluate("window.__builder.clear()")
        domain(page, "力学")
        w = W(page)
        ball2 = place_at(page, w, "小球", (0, 3))
        page.evaluate("(m) => window.__builder.setParams(m.b, { m: 1, v0: 3, ang: 0, mus: 0, e: 0 })", {"b": ball2})
        domain(page, "通用")
        w = W(page)
        pg2 = place_at(page, w, "光电门", (1.5, 2))
        page.evaluate("(m) => window.__builder.link(m.s, '探头', m.b, '顶', 'rope')", {"s": pg2, "b": ball2})
        page.locator(".tools .primary").click()
        for _ in range(90):
            page.wait_for_timeout(200)
            if page.evaluate("window.__builder.simStatus()") == "ended":
                break
        end = page.evaluate("() => window.__builder.probes() ?? {}")
        pv = next((end[k] for k in end if "photogate" in k), None)
        check("光电门平抛过门 t=x/v₀=1.5/3=0.5s", pv is not None and abs(pv[1] - 0.5) < 0.05,
              f"got={pv[1] if pv else None} theory=0.5")

        # ═══ 场景三c：lead_in 切线导入段（2026-10-02 十一轮定夺：保留+补 E2E）═══
        # 斜置导入段（θ=30°，L=2，μ=0）滑块：自洽断言 v=√(2g(y₀−y_now))——任意采样帧
        # 无摩擦机械能守恒（教材规律；理论用同帧实测 y，与放置几何解耦）
        print("场景三c：切线导入段")
        page.evaluate("window.__builder.clear()")
        domain(page, "力学")
        w = W(page)
        ramp = place_at(page, w, "切线导入段", (0, 1))
        page.evaluate("(m) => window.__builder.setAngle(m.r, m.a)", {"r": ramp, "a": -math.pi / 6})
        page.evaluate("(m) => window.__builder.setParams(m.r, { L: 2 })", {"r": ramp})
        # 放置注记：块须整体在段内（跨上端点=压尖端微抖不滑——诊断实证；段中 x=−0.3 表面 1.17+法向 0.43）
        blk4 = place_at(page, w, "物块", (-0.3, 1.66))
        page.evaluate("(m) => window.__builder.setParams(m.b, { m: 1, v0: 0, mu: 0, fixRot: 1 })", {"b": blk4})
        # y0 从首帧实测取（放置高度≠起滑高度：落座/对齐会降 ~0.1m——首版理论用放置高度即因此偏差）
        domain(page, "通用")
        w = W(page)
        sp4 = place_at(page, w, "速度传感器", (-2, 1))
        page.evaluate("(m) => window.__builder.link(m.s, '探头', m.b, '顶', 'rope')", {"s": sp4, "b": blk4})
        page.locator(".tools .primary").click()
        got4 = None
        y0 = None
        for _ in range(300):
            page.wait_for_timeout(60)
            stx = page.evaluate("() => ({ s: window.__builder.simStatus(), t: window.__builder.simT(),"
                                " sb: window.__builder.subjects(), p: window.__builder.probes() ?? {} })")
            if stx["s"] == "ended":
                break
            if stx["sb"]:
                s0 = stx["sb"][0]
                if y0 is None and stx["s"] == "running" and abs(s0["vx"]) > 0.1:
                    y0 = s0["y"]   # 起滑高度=已开始滑动的首帧（落座/吸附弹跳完成——首帧直读会引入弹跳高度漂移）
                if y0 is not None and 0.0 < s0["x"] < 0.5 and abs(s0["vx"]) > 0.5:
                    vv = next((stx["p"][k] for k in stx["p"] if "speed_sensor" in k), None)
                    if vv:
                        v_th4 = (2 * 9.8 * max(0.02, y0 - s0["y"])) ** 0.5
                        got4 = (vv[1], v_th4)
                        break
        check("导入段无摩擦下滑 v=√(2g(y₀−y))（自洽）",
              got4 is not None and abs(got4[0] - got4[1]) / got4[1] < 0.08,
              f"got={got4[0]:.3f} theory={got4[1]:.3f}" if got4 else "未采样到滑动帧")

        # ═══ 场景三：显示 4 件 smoke ═══
        print("场景三：显示元件 smoke")
        page.evaluate("window.__builder.clear()")
        domain(page, "力学")
        w = W(page)
        place_at(page, w, "地面", (0, -0.5))
        blk3 = place_at(page, w, "物块", (0, 0.1))
        page.evaluate("(m) => window.__builder.setParams(m.b, { v0: 3, mu: 0, fixRot: 1 })", {"b": blk3})
        domain(page, "通用")
        w = W(page)
        for label, tgt in (("轨迹追踪", (-3, 2)), ("时间轴", (3, 2)), ("矢量箭头", (-3, -1)), ("图上标签", (3, -1))):
            place_at(page, w, label, tgt)
        page.locator(".tools .primary").click()
        page.wait_for_timeout(1500)
        n_els = page.evaluate("window.__builder.count()")
        check("显示 4 件放置+运行无页面错误", not errs and n_els >= 5, f"elements={n_els} errs={len(errs)}")
        while page.evaluate("window.__builder.simStatus()") != "ended":
            page.wait_for_timeout(200)

        # ═══ 场景五：Tab 切换画布恢复（手测 Bug6·方案 D 验证）═══
        print("场景五：Tab 切换画布恢复")
        page.goto(f"{BASE}/lab")   # 实验台默认
        page.wait_for_selector(".workspace canvas", timeout=10000)
        page.wait_for_timeout(600)
        sz0 = page.evaluate("() => { const c = document.querySelector('.workspace canvas'); return c.width + 'x' + c.height }")
        page.locator(".tabbar .tab", has_text="自由搭建").click()
        page.wait_for_selector(".free-build-tab canvas", timeout=8000)
        page.wait_for_timeout(400)
        page.locator(".tabbar .tab", has_text="实验台").click()
        page.wait_for_timeout(600)
        info = page.evaluate("() => { const c = document.querySelector('.workspace canvas'); if (!c) return null; return { w: c.width, h: c.height } }")
        check("Tab 切回后 canvas 尺寸恢复（非 300×150 默认）",
              info is not None and info["w"] > 500 and info["h"] > 300,
              f"切前={sz0} 切回={info['w']}x{info['h']}" if info else "canvas 不存在")
        # 渲染有效性：截图非纯色（空白画布=单一背景色）
        page.locator(".canvas-wrap canvas").screenshot(path="/tmp/tabswitch-canvas.png")
        import os
        png_size = os.path.getsize("/tmp/tabswitch-canvas.png")
        check("Tab 切回后 canvas 有渲染内容（截图非空白）", png_size > 5000, f"png={png_size}B")

        b.close()

    print()
    if fails:
        print(f"❌ free-build 器材 E2E 失败：{fails}")
        return 1
    print(f"✅ free-build 器材 E2E 全过（{len(ok_all)} 项）")
    return 0

if __name__ == "__main__":
    sys.exit(main())
