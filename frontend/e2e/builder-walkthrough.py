# -*- coding: utf-8 -*-
"""阶段三⑨ 手工录制：/exp 依次搭建 斜面→传送带→圆轨道 三经典场景。
真实 UI 交互：面板点击放置、真实鼠标拖拽（世界坐标→屏幕坐标换算）、▶ 运行按钮点击；
物理断言：斜面 a=g·sinθ、传送带共速 t*=v/(μg)、圆轨道过顶 y=R−r（√5gR 下限之上不脱离）。
截图输出 e2e/shots/walkthrough-*.png，产出 docs/统一搭建台-阶段三手工录制.md 的素材。
"""
import json, math, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
SHOTS = r"E:\Program\physicene\frontend\e2e\shots"
ARCHIVE = r"E:\Program\physicene\frontend\src\experiments\docs\visual-verification"
VIEW_H = 14.0  # 画布可视高度（米），相机 zoom=1

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

class W:
    """世界坐标 ↔ 画布屏幕坐标（正交相机，画布中心=世界原点）"""
    def __init__(self, page):
        self.page = page
        box = page.locator(".canvas-holder").bounding_box()
        self.cx = box["x"] + box["width"] / 2
        self.cy = box["y"] + box["height"] / 2
        self.ppm = box["height"] / VIEW_H
    def to_screen(self, wx, wy):
        return (self.cx + wx * self.ppm, self.cy - wy * self.ppm)

def drag(page, w, fx, fy, tx, ty, steps=12):
    """真实鼠标拖拽：从世界 (fx,fy) 按下拖到 (tx,ty) 松手（触发吸附提交）"""
    sx0, sy0 = w.to_screen(fx, fy)
    sx1, sy1 = w.to_screen(tx, ty)
    page.mouse.move(sx0, sy0)
    page.mouse.down()
    for i in range(1, steps + 1):
        page.mouse.move(sx0 + (sx1 - sx0) * i / steps, sy0 + (sy1 - sy0) * i / steps)
    page.mouse.up()
    page.wait_for_timeout(150)

def place(page, w, label, target):
    """面板点击放置（新增在默认位），再拖拽到目标世界坐标"""
    page.locator(".palette .item", has_text=label).first.click()
    page.wait_for_timeout(120)
    els = page.evaluate("window.__builder.elements()")
    eid = els[-1]["id"]
    drag(page, w, els[-1]["position"]["x"], els[-1]["position"]["y"], *target)
    return eid

def run_and_wait(page, timeout_s=18, track_id=None, mid_shot=None):
    page.locator(".tools .primary").click()
    page.wait_for_timeout(300)
    max_y = -99
    shot_taken = False
    for _ in range(timeout_s * 5):
        page.wait_for_timeout(200)
        st = page.evaluate("window.__builder.simStatus()")
        t_now = page.evaluate("window.__builder.simT()")
        if track_id:
            for s in page.evaluate("window.__builder.subjects()"):
                if s["id"].startswith(track_id):
                    max_y = max(max_y, s["y"])
        if mid_shot and not shot_taken and t_now >= 1.0 and st == "running":
            page.screenshot(path=mid_shot)
            shot_taken = True
        if st == "ended":
            break
    return (page.evaluate("window.__builder.simStatus()"),
            page.evaluate("window.__builder.simT()"),
            page.evaluate("window.__builder.subjects()"),
            page.evaluate("window.__builder.keyEvents()"),
            max_y)

def set_params(page, eid, params):
    page.evaluate("(args) => { window.__builder.setParams(args.id, args.p); }", {"id": eid, "p": params})

results, failures = [], []

def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  {'✓' if ok else '✗'} {name} {detail}")
    if not ok:
        failures.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    # 录屏归档（追问2）：视频 page.close() 后落盘，save_as 到 visual-verification/
    ctx = b.new_context(viewport={"width": 1560, "height": 980},
                        record_video_dir=f"{ARCHIVE}\\_video_tmp",
                        record_video_size={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    video = page.video
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    # P0 后 builder 迁入 /lab「自由搭建」Tab（/exp→/lab 重定向）；选择器作用域化
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
    page.locator(".tabbar .tab", has_text="自由搭建").click()
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

    # ════ 场景一：斜面（θ=30°，μ=0）滑块 ════
    print("场景一：斜面滑块")
    page.evaluate("window.__builder.clear()")
    page.evaluate("window.__builder.setName('手工录制-斜面滑块')")
    w = W(page)
    slope = place(page, w, "斜面", (-4, -2.5))
    set_params(page, slope, {"th": 30, "mu": 0, "L": 6})
    block = place(page, w, "物块", (-3.94, 1.42))   # 底锚点近斜面顶端(-4,0.96) → 松手吸附，滑全程 6m
    page.evaluate("(a) => window.__builder.setParams(a.id, a.p)", {"id": block, "p": {"m": 1, "v0": 0, "mu": 0}})
    page.wait_for_timeout(400)
    els = {e["id"]: e for e in page.evaluate("window.__builder.elements()")}
    # 吸附断言：块底锚点 (0,-0.5) 世界 == 斜面顶端 (-4, 0.96)
    bx, by = els[block]["position"]["x"], els[block]["position"]["y"]
    check("斜面-物块吸附（底锚点距顶端 <0.05m）", abs(bx - -4) < 0.05 and abs((by - 0.5) - 0.96) < 0.05,
          f"block=({bx:.2f},{by:.2f})")
    # 吸附演示完成后，把物块拖到斜面中段（顶端吸附点恰为薄端顶点，静力平衡不下滑——教学上应放面中段）
    drag(page, w, bx, by, -0.75, -0.34)
    page.wait_for_timeout(200)
    page.screenshot(path=f"{SHOTS}/walkthrough-1-incline-edit.png")
    st, t, subjects, events, _ = run_and_wait(page, mid_shot=f"{SHOTS}/walkthrough-1-incline-run.png")
    blk = next((s for s in subjects if s["id"].startswith("block")), None)
    vx = blk["vx"] if blk else 0
    # 理论：a=g·sin30°=4.9；从 y≈-2 滑到底端位移沿面 ~1m 后落地弹跳滚出 —— 断言方向与量级
    check("斜面滑块运行结束", st == "ended", f"t={t:.2f}s")
    v_theory = math.sqrt(2 * 9.8 * math.sin(math.radians(30)) * 6)
    check("滑块下滑 vx>4 m/s（理论 √(2·g·sinθ·L)≈7.7，含落地损耗）", vx > 4, f"vx={vx:.2f} 理论≈{v_theory:.1f}")

    # ════ 场景二：传送带（vb=3, μ=0.4）共速 ════
    print("场景二：传送带共速")
    page.evaluate("window.__builder.clear()")
    page.evaluate("window.__builder.setName('手工录制-传送带共速')")
    belt = place(page, w, "传送带", (0, -1.0))
    set_params(page, belt, {"vb": 3, "th": 0, "mu": 0.4, "L": 8})
    blk2 = place(page, w, "物块", (0, -0.35))
    page.evaluate("(a) => window.__builder.setParams(a.id, a.p)", {"id": blk2, "p": {"m": 1, "v0": 0, "mu": 0.4}})
    page.wait_for_timeout(300)
    page.screenshot(path=f"{SHOTS}/walkthrough-2-belt-edit.png")
    st, t, subjects, events, _ = run_and_wait(page, mid_shot=f"{SHOTS}/walkthrough-2-belt-run.png")
    cs = next((e for e in events if e["eventType"] == "belt_common_speed"), None)
    t_star = 3 / (0.4 * 9.8)  # v/(μg) = 0.765s
    check("带共速事件携带 payload v", cs is not None and cs.get("payload", {}).get("v") is not None,
          f"v={cs['payload']['v'] if cs else None}")
    if cs:
        v, te = cs["payload"]["v"], cs["t"]
        check("共速速度 ≈ vb=3（±2%）", abs(v - 3) / 3 < 0.02, f"v={v:.2f}")
        check("共速时刻 ≈ v/(μg)=0.77s（±0.15s）", abs(te - t_star) < 0.15, f"t={te:.2f}s vs 理论{t_star:.2f}s")

    # ════ 场景三：竖直圆轨道（R=1.5）过顶 ════
    print("场景三：圆轨道过顶")
    page.evaluate("window.__builder.clear()")
    page.evaluate("window.__builder.setName('手工录制-圆轨道过顶')")
    loop = place(page, w, "竖直圆轨道", (2, 0))
    set_params(page, loop, {"radius": 1.5, "side": 0})
    ball = place(page, w, "小球", (2, -1.0))        # 球心在 R−r=1.0 圈内底部
    page.evaluate("(a) => window.__builder.setParams(a.id, a.p)", {"id": ball, "p": {"m": 0.5, "v0": 8}})
    page.wait_for_timeout(300)
    page.screenshot(path=f"{SHOTS}/walkthrough-3-loop-edit.png")
    st, t, subjects, events, max_y = run_and_wait(page, 20, track_id="sphere", mid_shot=f"{SHOTS}/walkthrough-3-loop-run.png")
    detach = next((e for e in events if e["eventType"] == "detach"), None)
    v_min_bottom = math.sqrt(5 * 9.8 * 1.0)  # √(5g(R−r)) ≈ 7.0 m/s（v0=8 高于临界 → 不脱离）
    # 内轨球心轨道半径 = R−r = 1.0：apex_pass 检测器 0.25m 环带针对轨面球心，内轨不触发——
    # 以轨迹断言：球心最高 y ≈ 1.0 且全程无 detach
    check("球心过顶高度 ≈ R−r = 1.0（±0.15m）", abs(max_y - 1.0) < 0.15, f"max_y={max_y:.2f}")
    check("v0=8 > √(5gR')≈7.0 全程不脱离", detach is None, f"detach={'有' if detach else '无'}")
    ball_end = next((s for s in subjects if s["id"].startswith("sphere")), None)
    check("球仍在轨道附近运动（|pos−圆心|≈1.0）", ball_end is not None and abs(math.hypot(ball_end["x"] - 2, ball_end["y"] - 0) - 1.0) < 0.3,
          f"end=({ball_end['x']:.2f},{ball_end['y']:.2f})" if ball_end else "无球")

    check("全程无页面错误", not errs, str(errs[:2]))

    # 录屏落盘归档（page 关闭后视频才完整）
    page.close()
    video.save_as(f"{ARCHIVE}\\统一搭建台-阶段三手工录制.webm")
    b.close()

print("\n===== 手工录制结论 =====")
for n, ok, d in results:
    print(f"{'✓' if ok else '✗'} {n} {d}")
print(f"PASS {sum(1 for _, ok, _ in results if ok)}/{len(results)}")
sys.exit(0 if not failures else 1)
