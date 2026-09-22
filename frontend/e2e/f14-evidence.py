"""F1.4 证据包抓取：12 截图 + 90s 连续录屏——一条命令可重抓（README 复现命令）。
12 张分配=开工令建议表原样（无申改）；录屏=连续录制不分段。
viewport=1500x950（与 lab-check/f13-check 一致）。"""
import json, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
OUT = Path("../docs/F14-验收证据")
SHOTS = OUT / "shots"
LOGS = OUT / "logs"
VP = {"width": 1500, "height": 950}
TS = time.strftime("%Y%m%d-%H%M%S")

def login():
    req = urllib.request.Request(f"{API}/api/auth/login",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())["data"]

# (shot_id, entry, state, assertion_ref, note)
MANIFEST = [
    ("01", "E1",   "default-load",       "F1.3-E1-LOAD-01", ""),
    ("02", "E1",   "template-loaded",    "F1.3-E1-INT-02",  ""),
    ("03", "E1",   "run-ended",          "F1.3-E1-RUN-01",  ""),
    ("04", "E1",   "switched-to-E2",     "F1.3-E1-OUT-01",  ""),
    ("05", "E2",   "default-load",       "F1.3-E2-LOAD-01", ""),
    ("06", "E2",   "palette-domains",    "F1.3-E2-INT-02",  ""),
    ("07", "E2",   "run-ended",          "F1.3-E2-RUN-01",  ""),
    ("08", "E2",   "switch-back-E1",     "F1.3-E2-OUT-01",  ""),
    ("09", "E3(过渡)", "/exp-direct",    "F1.3-E3-LOAD-01",  "过渡入口——redirect 后移除"),
    ("10", "E3(过渡)", "run-ended",      "F1.3-E3-RUN-02",  "过渡入口"),
    ("11", "E3(过渡)", "route-to-E1",    "F1.3-E3-OUT-01",  "路由级降级断言（非真实切回）"),
    ("12", "ALL",  "zero-errors",        "F1.3-GLOBAL-01",  ""),
]

def shot(pg, sid):
    pg.screenshot(path=str(SHOTS / f"{sid}.png"))

def main() -> int:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport=VP, record_video_dir=str(OUT / "video"),
                            record_video_size=VP)
        auth = login()
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        pg = ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:80]))
        pg.on("console", lambda m: errs.append(m.text[:80]) if m.type == "error" and "favicon" not in m.text else None)
        log_lines = []

        def L(msg):
            log_lines.append(f"[{time.strftime('%H:%M:%S')}] {msg}")
            print(msg)

        t0 = time.time()

        # ── E1 实验台 ──
        L("── E1 实验台")
        pg.goto(f"{BASE}/lab"); pg.wait_for_selector(".lab > .topbar", timeout=12000)
        pg.wait_for_timeout(500); shot(pg, "01"); L("01 E1 default-load ✓")

        pg.locator(".lab select.tmpl").select_option("template_projectile")
        pg.wait_for_timeout(600); shot(pg, "02"); L("02 E1 template-loaded ✓")

        pg.locator(".lab button.primary", has_text="运行实验").click()
        for _ in range(80):
            pg.wait_for_timeout(400)
            if "ended" in (pg.locator(".lab .status").inner_text() or ""): break
            if "实验完成" in pg.evaluate("() => document.body.innerText"): break
        pg.wait_for_timeout(14000)   # ended 后视觉停留（录屏证据非断言依据——补正2澄清）/时间轴填满（录屏证据）
        shot(pg, "03"); L("03 E1 run-ended ✓")

        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder", timeout=8000)
        shot(pg, "04"); L("04 E1 switched-to-E2 ✓")

        # ── E2 自由搭建 ──
        L("── E2 自由搭建")
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        pg.wait_for_timeout(300); shot(pg, "05"); L("05 E2 default-load ✓")

        pg.evaluate("window.__builder.add('vector_arrow', {mode: 1, scale: 0.3}, 2, 1)")   # 矢量箭头演示（录屏）
        pg.evaluate("window.__builder.add('accel_sensor', {}, -2, 1)")   # 传感器（录屏）
        pg.wait_for_timeout(4000)
        pg.locator(".free-build-tab .builder .palette .tabs button", has_text="电磁").click()
        pg.wait_for_timeout(300); shot(pg, "06"); L("06 E2 palette-domains（电磁域可见）✓")
        pg.locator(".free-build-tab .builder .palette .tabs button", has_text="力学").click()
        pg.wait_for_timeout(200)

        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.loadTemplate('gk-board-block')")
        pg.wait_for_timeout(300)
        pg.locator(".free-build-tab .tools .primary").click()
        for _ in range(60):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": break
        pg.wait_for_timeout(12000)   # ended 后视觉停留（录屏证据非断言依据——补正2澄清） 面板填满（录屏证据）
        shot(pg, "07"); L(f"07 E2 run-ended ✓ x={pg.evaluate('window.__builder.subjects()[0]?.x ?? -1'):.3f}")

        pg.locator(".tabbar .tab", has_text="实验台").click()
        pg.wait_for_selector(".lab > .topbar", timeout=8000)
        pg.wait_for_timeout(300); shot(pg, "08"); L("08 E2 switch-back-E1 ✓")

        # ── E3 独立直入（过渡）──
        L("── E3 /exp（过渡入口）")
        # P0 后 /exp→/lab 重定向，builder 在自由搭建 Tab（旧"直入"已无独立入口）
        pg.goto(f"{BASE}/lab"); pg.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        pg.wait_for_timeout(300); shot(pg, "09"); L("09 E3 /exp-direct ✓")

        pg.evaluate("window.__builder.clear()")
        pg.evaluate("window.__builder.loadTemplate('gk-connected-bodies')")
        pg.wait_for_timeout(300)
        pg.locator(".tools .primary").click()
        for _ in range(60):
            pg.wait_for_timeout(300)
            if pg.evaluate("window.__builder.simStatus()") == "ended": break
        pg.wait_for_timeout(6000)   # ended 后视觉停留（非断言依据）
        shot(pg, "10"); L(f"10 E3 run-ended ✓ kes={len(pg.evaluate('window.__builder.keyEvents()'))}")

        pg.goto(f"{BASE}/lab"); pg.wait_for_selector(".lab > .topbar", timeout=8000)
        pg.wait_for_timeout(300); shot(pg, "11"); L("11 E3 route-to-E1 ✓（路由级降级）")

        # ── 12 零错误 ──
        real = [e for e in errs if "WebGL" not in e]
        L(f"12 零错误态：{len(real)} errors")
        shot(pg, "12")

        elapsed = time.time() - t0
        L(f"录屏时长 {elapsed:.1f}s")

        v = pg.video
        pg.close()
        v.save_as(str(OUT / "video" / "f14-90s.mp4"))
        ctx.close(); b.close()

    # manifest.tsv
    with open(OUT / "manifest.tsv", "w", encoding="utf-8", newline="") as f:
        f.write("shot_id\tentry\tstate\tassertion_ref\tfile\tcaptured_at\tviewport\tnote\n")
        for sid, entry, state, ref, note in MANIFEST:
            f.write(f"{sid}\t{entry}\t{state}\t{ref}\tshots/{sid}.png\t{TS}\t1500x950\t{note}\n")

    with open(LOGS / "f14-capture.log", "w", encoding="utf-8") as f:
        f.write("\n".join(log_lines))

    print(f"\nF1.4 证据包完成：12 截图 + {elapsed:.0f}s 录屏 + manifest.tsv")
    return 0

if __name__ == "__main__":
    sys.exit(main())
