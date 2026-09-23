"""批4 收编回归：opt1/opt2 波形场景卡（58/59/60）改共享物理源后 DOM 值仍对理论。"""
import _env; _env.banner()
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
req = urllib.request.Request("http://localhost:8080/api/auth/login",
    data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
    headers={"Content-Type": "application/json"})
auth = json.loads(urllib.request.urlopen(req).read())["data"]
CARDS = [
    ("gk-wave-multi-solution", ["v=5.00 m/s", "T=λ/v=0.80"]),   # waveMultiFn
    ("gk-vibration-wave-graphs", ["v=λ/T=2.00 m/s", "t=0.99 s"]),  # firstCrestTime
    ("gk-wave-superposition", ["Δr=2.00", "加强"]),              # pathDiffFn
]
ok_all = True
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1500, "height": 900})
    pg.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});")
    for cid, needles in CARDS:
        pg.goto(f"http://localhost:5173/exp/{cid}")
        pg.wait_for_selector(".lab canvas, .exp canvas:not(.hist), .alt-stage canvas, .sim25d canvas, .clab canvas", timeout=15000)
        pg.wait_for_timeout(800)
        for btn in pg.locator("button").all()[:8]:
            t = (btn.text_content() or "").strip()
            if t and ("开始" in t or "▶" in t): btn.click(); break
        pg.wait_for_timeout(9000)
        body = pg.inner_text("body")
        missing = [n for n in needles if n not in body]
        ok = not missing; ok_all = ok_all and ok
        print(f"  {'✓' if ok else '✗'} {cid} {'' if ok else f'缺: {missing}'}")
    b.close()
print(f"批4 波形场景收编回归：{'3/3 ✅' if ok_all else '❌'}")
sys.exit(0 if ok_all else 1)
