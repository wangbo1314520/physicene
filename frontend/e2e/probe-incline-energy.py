# -*- coding: utf-8 -*-
"""子任务 C 影响面实验v2：卡22 官方几何（slope th=60, L=chord）——cube(模板原配) vs sphere(同位替换)。
理论值用模板闭式 vx=√(2gh)cosθ（h=chord·tanθ/2），偏差即能量注入量化；sphere 替换即副作用数据。"""
import json, math, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

R, TH = 0.8, 60
CHORD = 2 * R * math.cos((90 - TH) * math.pi / 180)
H = CHORD * math.tan(TH * math.pi / 180) / 2
VTH = math.sqrt(2 * 9.8 * H) * math.cos(TH * math.pi / 180)
X0, Y0 = CHORD / 2, H + 0.65

def run_case(page, kind, angle_deg=None):
    page.evaluate("window.__builder.clear()")
    th = angle_deg or TH
    chord = CHORD if angle_deg is None else 4  # 30° 实验用 L=4
    h = (chord * math.tan(th * math.pi / 180) / 2)
    vth = math.sqrt(2 * 9.8 * h) * math.cos(th * math.pi / 180)
    page.evaluate("""(m) => { const B = window.__builder;
      B.add('slope', { th: m.th, L: m.chord, mu: 0 }, 0, 0);
      B.add('ground', { mu: 0.2 }, 0, -2);
      const id = m.kind === 'cube'
        ? B.add('block', { m: 1, v0: 0, mu: 0, fixRot: 1 }, m.x, m.y)
        : B.add('sphere', { m: 1, v0: 0, mus: 0, e: 0, fixRot: 1 }, m.x, m.y);
      return id; }""", {"th": th, "chord": chord, "x": chord / 2, "y": h + 0.65, "kind": kind})
    return page.evaluate("""async () => {
      const B = window.__builder; B.run();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let started = false;
      for (let i = 0; i < 360; i++) {
        await wait(50);
        const st = B.simStatus();
        if (st === 'running' || st === 'connecting') started = true;
        if (started && st === 'ended') break;
      }
      const vs = B.vSeries()[0];
      // 滑行段：y 单调下降、且仍在斜面上方（y > 0.55）的帧里取末 1/4 帧平均 vx
      const onSlide = vs.filter(p => p.y > 0.55);
      const tail = onSlide.slice(-Math.max(3, Math.floor(onSlide.length / 4)));
      const vx = tail.reduce((a, p) => a + p.vx, 0) / tail.length;
      return { vx, y0: vs[0].y, frames: vs.length, slideFrames: onSlide.length };
    }"""), vth

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
    page.locator(".tabbar .tab", has_text="搭建").click()
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

    print(f"卡22 官方几何：chord={CHORD:.3f} θ={TH}° h={H:.3f} 理论 vx={VTH:.3f}")
    for kind in ("cube", "sphere"):
        for trial in (1, 2):
            r, vth = run_case(page, kind)
            dev = (r["vx"] - vth) / vth * 100
            print(f"  60° {kind:6s} #{trial}: vx={r['vx']:+.3f} vs 理论 {vth:.3f} → 偏差 {dev:+.1f}%  (滑行帧 {r['slideFrames']}/{r['frames']})")
    print(f"\n对照 30°（L=4）：")
    for kind in ("cube", "sphere"):
        r, vth = run_case(page, kind, angle_deg=30)
        dev = (r["vx"] - vth) / vth * 100
        print(f"  30° {kind:6s}: vx={r['vx']:+.3f} vs 理论 {vth:.3f} → 偏差 {dev:+.1f}%  (滑行帧 {r['slideFrames']}/{r['frames']})")
    b.close()
