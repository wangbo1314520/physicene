"""P3 批 2 收编回归：thermo1/thermo2 场景卡改用共享物理源后，DOM 计算值仍对理论。"""
import _env; _env.banner()
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

req = urllib.request.Request("http://localhost:8080/api/auth/login",
    data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
    headers={"Content-Type": "application/json"})
auth = json.loads(urllib.request.urlopen(req).read())["data"]

CARDS = [
    ("gk-liquid-seal-tube", ["p₁=p₀+h=86.0", "L₂=L₁T₂/T₁=24.00"]),  # 默认等压升温：初态 86.0（共享 p51）+ L₂=20×360/300=24.00
    ("gk-variable-mass-gas", ["n=8 时 1.40 p₀"]),             # 场景默认 V=10 V0=0.5 n=8 → 1+8×0.5/10=1.40
    ("gk-u-tube", ["p₁=p₀+Δh₀=80", "p₂L₂/T₂"]),              # dh0=4 → 80
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
            if t and ("开始" in t or "▶" in t):
                btn.click(); break
        pg.wait_for_timeout(9000)
        body = pg.inner_text("body")
        missing = [n for n in needles if n not in body]
        ok = not missing
        ok_all = ok_all and ok
        print(f"  {'✓' if ok else '✗'} {cid} {'' if ok else f'缺: {missing}'}")
    b.close()
print(f"热学场景卡收编回归：{'3/3 ✅' if ok_all else '❌'}")
sys.exit(0 if ok_all else 1)
