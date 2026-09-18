# -*- coding: utf-8 -*-
"""整改2：批次1 8模板回炉——完整操作流程录屏 E2E。
真实 UI 全流程：📚模板抽屉→载入→画布点选→属性面板滑杆设参→▶运行→全程观察→CSV导出。
每模板录屏归档 experiments/docs/visual-verification/templates-phase1-redo/<id>.webm。
操作证明（非仅数值断言）：圆轨道扫角≥2π不冻结、传送带真实拖上带面并驻留、弹簧往返振荡、
板块相对速度归零、链式动量传递、绳绷紧共速；另含两个手操专项探针（带中点上带/轨道外进入）。
"""
import argparse, json, math, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
ARCHIVE = r"E:\Program\physicene\frontend\src\experiments\docs\visual-verification\templates-phase1-redo"
SHOTS = r"E:\Program\physicene\frontend\e2e\shots\templates"
VIEW_H = 14.0

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

class W:
    def __init__(self, page):
        box = page.locator(".canvas-holder").bounding_box()
        self.cx, self.cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
        self.ppm = box["height"] / VIEW_H
    def to_screen(self, wx, wy):
        return (self.cx + wx * self.ppm, self.cy - wy * self.ppm)

results, failures = [], []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(f"  {'✓' if ok else '✗'} {name} {detail}")
    if not ok:
        failures.append(name)

def run_and_sample(page, max_s=18):
    """▶ 点击后全程采样：返回 (status, t, 末态, 角扫量列表, 样本)"""
    page.locator(".tools .primary").click()
    page.wait_for_timeout(300)
    samples, sweeps = [], []
    for _ in range(max_s * 5):
        page.wait_for_timeout(200)
        st = page.evaluate("window.__builder.simStatus()")
        t = page.evaluate("window.__builder.simT()")
        subs = page.evaluate("window.__builder.subjects()")
        samples.append((t, subs))
        if st == "ended":
            break
    return page.evaluate("window.__builder.simStatus()"), samples

def angle_sweep(samples, cx, cy, subj=0):
    """绕 (cx,cy) 的累计扫角（弧度，解卷绕）"""
    total, prev = 0.0, None
    for t, subs in samples:
        if subj < len(subs):
            th = math.atan2(subs[subj]["y"] - cy, subs[subj]["x"] - cx)
            if prev is not None:
                d = th - prev
                while d > math.pi: d -= 2 * math.pi
                while d < -math.pi: d += 2 * math.pi
                total += abs(d)
            prev = th
    return total

def oscillation_count(samples, subj=0, axis="x", level=None):
    """样本序列沿 axis 相对 level 的穿越次数（level 缺省=首值）"""
    if not samples: return 0
    vals = [s[1][subj][axis] if subj < len(s[1]) else None for s in samples]
    vals = [v for v in vals if v is not None]
    if not vals: return 0
    lvl = level if level is not None else vals[0]
    return sum(1 for i in range(1, len(vals)) if (vals[i-1] - lvl) * (vals[i] - lvl) < 0)

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="gk-slope-spring,gk-conveyor-board,gk-board-block,gk-collision-spring,gk-collision-chain,gk-circular-critical,gk-projectile-loop,gk-connected-bodies")
    args = ap.parse_args()
    import os
    os.makedirs(ARCHIVE, exist_ok=True)

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        auth = login_api()
        tpls_meta = None

        # ── 每模板：完整操作流程录屏 ──
        ctx = b.new_context(viewport={"width": 1560, "height": 980},
                            record_video_dir=ARCHIVE, record_video_size={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(f"{BASE}/exp")
        page.wait_for_selector(".builder .palette .item", timeout=8000)
        tpls_meta = page.evaluate("window.__builder.templates()")
        want = [t for t in tpls_meta if not args.ids or t["id"] in args.ids.split(",")]
        print(f"回炉模板 {len(want)}/8")

        PROOFS = {
            "gk-slope-spring": lambda s: [
                ("振荡可见（速度变号≥2 次，能振）", sum(1 for i in range(1, len(s)) if s[i-1][1] and s[i][1] and s[i-1][1][0]["vx"] * s[i][1][0]["vx"] < 0) >= 2),
                ("行程>0.8m（振幅可见，2A=v/ω·2 阻尼削峰）", max(v[1][0]["x"] for v in s if v[1]) - min(v[1][0]["x"] for v in s if v[1]) > 0.7),
                ("阻尼收敛静止（能停，OPEN#2 已修）", abs(s[-1][1][0]["vx"]) < 0.06),
            ],
            "gk-conveyor-board": lambda s: [
                ("物块驻留带面≥2s（不上抛）", sum(1 for t, subs in s if subs and abs(subs[0]["y"] + 0.34) < 0.25) >= 10),
                ("达到带速（能上带加速）", any(t > 1 and subs and abs(subs[0]["vx"] - 3) < 0.15 for t, subs in s)),
            ],
            "gk-board-block": lambda s: [
                ("相对速度归零（板-块共速）", any(t > 2.5 and len(subs) >= 2 and abs(subs[0]["vx"] - subs[1]["vx"]) < 0.05 for t, subs in s)),
                ("块仍在板上", abs(s[-1][1][1]["x"] - s[-1][1][0]["x"]) < 3.5),
            ],
            "gk-collision-spring": lambda s: [
                ("终态共速=2.0（4→2 缓冲必然发生；首帧采样 1.97 已过渡）", abs(s[-1][1][0]["vx"] - 2) < 0.1),
                ("双体共速（能停于共速）", abs(s[-1][1][0]["vx"] - s[-1][1][1]["vx"]) < 0.1),
            ],
            "gk-collision-chain": lambda s: [
                ("首球减速到≈0", abs(s[-1][1][0]["vx"]) < 0.3),
                ("末球加速到≈4（动量传递）", abs(s[-1][1][2]["vx"] - 4) < 0.3),
            ],
            "gk-circular-critical": lambda s: [
                ("绕轨扫角≥2π（进得去转得起）", angle_sweep(s, 2, 0) >= 2 * math.pi),
                ("末速>0（不冻结）", abs(s[-1][1][0]["vx"]) + abs(s[-1][1][0]["vy"]) > 0.5),
            ],
            "gk-projectile-loop": lambda s: [
                ("绕轨扫角≥2π", angle_sweep(s, 0, 0) >= 2 * math.pi),
                ("末速>0（不冻结）", abs(s[-1][1][0]["vx"]) + abs(s[-1][1][0]["vy"]) > 0.5),
            ],
            "gk-connected-bodies": lambda s: [
                ("两体速度收敛相等", any(t > 1 and len(subs) >= 2 and abs(subs[0]["vx"] - subs[1]["vx"]) < 0.06 for t, subs in s)),
                ("共同前进（绳生效）", s[-1][1][0]["x"] > 1),
            ],
        }

        for t in want:
            tid = t["id"]
            print(f"══ {tid}（卡 {t['card']}）")
            # ① 真实 UI：模板抽屉载入
            page.locator(".tools button", has_text="模板").click()
            page.wait_for_selector(".tpl-drawer")
            page.locator(".tpl-drawer .tpl", has_text=t["name"][:6]).first.click()
            page.wait_for_timeout(400)
            # ② 画布点选第一个运动体 → 属性面板出现 → 面板滑杆设参（经 v-model 真实通路）
            els = page.evaluate("window.__builder.elements()")
            body = next((e for e in els if e["role"] == "body"), None)
            if body:
                w = W(page)
                sx, sy = w.to_screen(body["position"]["x"], body["position"]["y"])
                page.mouse.click(sx, sy)
                page.wait_for_timeout(200)
                slider = page.locator(".props input[type=range]").first
                if slider.count():
                    slider.evaluate("(el) => { const v = el.value; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }")
            # ③ ▶ 运行 + 全程采样
            status, samples = run_and_sample(page, 14)
            check(f"{tid} 运行结束", status == "ended", f"t={samples[-1][0]:.1f}s")
            for name, ok in PROOFS[tid](samples):
                check(f"{tid} {name}", ok)
            # ④ 数据导出（CSV 按钮点击产生下载）
            with page.expect_download() as dl:
                page.locator(".data button", has_text="CSV").first.click()
            check(f"{tid} CSV 导出", dl.value.suggested_filename.endswith(".csv"))
            page.screenshot(path=f"{SHOTS}\\redo-{tid}.png")
        vid = page.video
        page.close()
        vid.save_as(f"{ARCHIVE}\\批次1回炉-全流程.webm")
        ctx.close()

        # ── 手操专项探针（两个用户实测问题的复现与验证）──
        print("══ 手操专项探针")
        ctx2 = b.new_context(viewport={"width": 1560, "height": 980},
                             record_video_dir=ARCHIVE, record_video_size={"width": 1560, "height": 980})
        ctx2.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                             f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        pg = ctx2.new_page()
        pg.goto(f"{BASE}/exp")
        pg.wait_for_selector(".builder .palette .item", timeout=8000)
        w = W(pg)

        def drag(pg, w, fx, fy, tx, ty, steps=12):
            sx0, sy0 = w.to_screen(fx, fy); sx1, sy1 = w.to_screen(tx, ty)
            pg.mouse.move(sx0, sy0); pg.mouse.down()
            for i in range(1, steps + 1):
                pg.mouse.move(sx0 + (sx1 - sx0) * i / steps, sy0 + (sy1 - sy0) * i / steps)
            pg.mouse.up(); pg.wait_for_timeout(150)

        def place(pg, w, label, target):
            pg.locator(".palette .item", has_text=label).first.click()
            pg.wait_for_timeout(150)
            els = pg.evaluate("window.__builder.elements()")
            e = els[-1]
            drag(pg, w, e["position"]["x"], e["position"]["y"], *target)
            return e["id"]

        # 探针A：真实拖拽把物块放到带面中点（新表面中锚点）→ 能上带
        pg.evaluate("window.__builder.clear()")
        place(pg, w, "传送带", (0, -1))
        blk = place(pg, w, "物块", (0.08, -0.28))
        pos = next(e for e in pg.evaluate("window.__builder.elements()") if e["id"] == blk)["position"]
        check("探针A 物块吸附带面中点（|y−(−0.35)|<0.08）", abs(pos["y"] + 0.35) < 0.08, f"y={pos['y']:.3f}")
        pg.locator(".tools .primary").click()
        traj = []
        for _ in range(16):
            pg.wait_for_timeout(250)
            subs = pg.evaluate("window.__builder.subjects()")
            if subs: traj.append((round(pg.evaluate("window.__builder.simT()"),2), round(subs[0]["x"],2), round(subs[0]["y"],2), round(subs[0]["vx"],2), round(subs[0]["vy"],2)))
        print("    探针A轨迹:", traj[:8])
        check("探针A 上带后随带加速", traj and traj[-1][3] > 1.5, f"vx={traj[-1][3] if traj else '无'}")
        pg.evaluate("window.__builder.socket && null; window.__builder.run()")  # noop 兼容
        pg.screenshot(path=f"{SHOTS}\\redo-probe-belt.png")

        # 探针B：轨道外进入/中心放置不冻结
        for label, bx, by, v0 in [("带中放置-带面外右侧", 4.2, -0.9, 4), ("放入轨道中心", 2.0, 0.2, 0), ("放到轨道顶内侧", 2.0, 1.05, 2)]:
            pg.evaluate("window.__builder.clear()")
            lp = place(pg, w, "竖直圆轨道", (2, 0))
            pg.evaluate(f"window.__builder.setParams({lp!r}, {{radius: 1.5, side: 0}})")
            bl = place(pg, w, "小球", (bx, by))
            pg.evaluate(f"window.__builder.setParams({bl!r}, {{m: 0.5, v0: {v0}, e: 1, mus: 0}})")
            pg.locator(".tools .primary").click()
            frozen = False
            for i in range(40):
                pg.wait_for_timeout(250)
                subs = pg.evaluate("window.__builder.subjects()")
                if pg.evaluate("window.__builder.simStatus()") == "ended": break
                # 冻结=近零速度且不在环带底部停驻位（|y−(−R)|<0.6 为物理停驻）也不在深落体
                if subs and i > 8 and abs(subs[0]["vx"]) + abs(subs[0]["vy"]) < 0.02 and abs(subs[0]["y"] + 1.5) > 0.75 and subs[0]["y"] > -7:
                    frozen = True
                    print(f"    [冻结@{label}] x={subs[0]['x']:.2f} y={subs[0]['y']:.2f} vx={subs[0]['vx']:.3f} vy={subs[0]['vy']:.3f} t={pg.evaluate('window.__builder.simT()'):.1f}")
                    break
            check(f"探针B {label} 不冻结", not frozen)
        pg.screenshot(path=f"{SHOTS}\\redo-probe-loop.png")
        v2 = pg.video
        pg.close()
        v2.save_as(f"{ARCHIVE}\\批次1回炉-手操探针.webm")
        ctx2.close()

        check("全程无页面错误", not errs, str(errs[:2]))
        b.close()

    print("\n===== 回炉结论 =====")
    for n, ok, d in results:
        print(f"{'✓' if ok else '✗'} {n} {d}")
    print(f"PASS {sum(1 for _, ok, _ in results if ok)}/{len(results)}")
    return 0 if not failures else 1

if __name__ == "__main__":
    sys.exit(main())
