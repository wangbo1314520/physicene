# -*- coding: utf-8 -*-
"""P4 E2E：电流表/电压表/多用电表——真实 UI 连线 + MNA 读数断言。
场景一：电池+电流表+电阻串联回路 → I 读数≈EMF/(R+RA+r)
场景二：电压表并联电阻 → U 读数≈电阻端电压
场景三：多用电表 V 挡并联 → 同电压表"""
import _env; _env.banner()
import json, sys, urllib.request
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

def place(page, label):
    page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')]"
                  ".find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", label)
    page.wait_for_timeout(120)
    return page.evaluate("window.__builder.elements()")[-1]["id"]

def pick(page, a, aa, b, ab):
    page.evaluate("(m) => window.__builder.pickAnchor(m.a, m.aa)", {"a": a, "aa": aa})
    page.wait_for_timeout(50)
    page.evaluate("(m) => window.__builder.pickAnchor(m.b, m.ab)", {"b": b, "ab": ab})
    page.wait_for_timeout(50)
    page.keyboard.press("Escape")
    page.wait_for_timeout(40)

def run_read(page):
    return page.evaluate("""async () => {
      const B = window.__builder; B.run();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let ts = false;
      for (let i = 0; i < 200; i++) {
        await wait(50);
        const st = B.tsStatus();
        if (st === 'running') ts = true;
        if (ts && st === 'ended') break;
      }
      return B.tsReadings() ?? {}; }""")

def main() -> int:
    auth = login_api()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)[:80]))
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        page.locator(".palette .tabs button", has_text="电磁").click()
        page.wait_for_timeout(150)
        page.locator(".tools button", has_text="连线").click()
        page.wait_for_timeout(100)
        page.locator(".linkkind").select_option("wire")

        # ═══ 场景一：电流表串联 ═══
        print("场景一：电池—电流表—电阻 串联回路")
        page.evaluate("window.__builder.clear()")
        bat = place(page, "干电池")
        am = place(page, "电流表")
        res = place(page, "定值电阻")
        page.evaluate(f"window.__builder.setParams('{res}', {{ R: 10 }})")
        pick(page, bat, "负极", am, "左端")
        pick(page, am, "右端", res, "左端")
        pick(page, res, "右端", bat, "正极")
        rd = run_read(page)
        I = rd.get(f"I_{am}")
        theory_I = 1.5 / (10 + 0.125 + 0.5)
        check("M1 电流表串联读数 I≈EMF/(R+RA+r)=0.1422A",
              I is not None and abs(I - theory_I) / theory_I < 0.02, f"I={I} 理论={theory_I:.4f}")

        # ═══ 场景二：电压表并联 ═══
        print("场景二：电压表并联电阻")
        page.evaluate("window.__builder.clear()")
        bat = place(page, "干电池")
        res = place(page, "定值电阻")
        vm = place(page, "电压表")
        page.evaluate(f"window.__builder.setParams('{res}', {{ R: 10 }})")
        pick(page, bat, "负极", res, "左端")
        pick(page, res, "右端", bat, "正极")
        pick(page, vm, "左端", res, "左端")
        pick(page, vm, "右端", res, "右端")
        rd = run_read(page)
        U = rd.get(f"U_{vm}")
        theory_U = 1.5 * 10 / (10 + 0.5)
        check("M2 电压表并联读数 U≈IR≈1.429V",
              U is not None and abs(U - theory_U) / theory_U < 0.05, f"U={U} 理论={theory_U:.3f}")

        # ═══ 场景三：多用电表 V 挡 ═══
        print("场景三：多用电表 V 挡并联")
        page.evaluate("window.__builder.clear()")
        bat = place(page, "干电池")
        res = place(page, "定值电阻")
        mm = place(page, "多用电表")
        page.evaluate(f"window.__builder.setParams('{res}', {{ R: 10 }})")
        page.evaluate(f"window.__builder.setParams('{mm}', {{ mode: 0 }})")
        pick(page, bat, "负极", res, "左端")
        pick(page, res, "右端", bat, "正极")
        pick(page, mm, "左端", res, "左端")
        pick(page, mm, "右端", res, "右端")
        rd = run_read(page)
        U_mm = rd.get(f"U_{mm}")
        check("M3 多用电表 V 挡读数≈电压表", U_mm is not None and abs(U_mm - theory_U) / theory_U < 0.05,
              f"U={U_mm} 理论={theory_U:.3f}")

        check("M4 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ P4 电表 E2E 失败：{fails}"); return 1
    print(f"✅ P4 电表 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
