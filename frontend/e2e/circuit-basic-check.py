# -*- coding: utf-8 -*-
"""B1 批1 E2E：电路基础五件——真实 UI 入口（palette 放置 + pickAnchor 端子连线）+ MNA 读数断言。
场景：干电池(EMF=1.5,r=0.5) + 定值电阻(10Ω) + 开关 串成回路：
  合闸 → I=EMF/(R+r)=0.1429A；断闸 → I≈0；变阻器替换电阻 → pos 0.5/1.0 两点闭式对照；
  SPDT 双负载选通互斥。"""
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

def run_and_read(page):
    page.evaluate("window.__builder.run()")
    return page.evaluate("""async () => {
      const B = window.__builder; const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let tsStarted = false;
      for (let i = 0; i < 200; i++) {
        await wait(50);
        const tst = B.tsStatus ? B.tsStatus() : 'idle';
        if (tst === 'running') tsStarted = true;
        if (tsStarted && tst === 'ended') break;
      }
      return { st: B.tsStatus ? B.tsStatus() : null, rd: B.tsReadings ? B.tsReadings() : {} }; }""")

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
        # 连线类型选「导线」（真实工具栏下拉——pickAnchor 落线 kind 由此决定）
        page.locator(".tools button", has_text="连线").click()
        page.wait_for_timeout(100)
        page.locator(".linkkind").select_option("wire")

        # ═══ 场景一：电池+电阻+开关 回路（真实端子连线）═══
        print("场景一：电池—电阻—开关 串联回路")
        page.evaluate("window.__builder.clear()")
        bat = place(page, "干电池")
        res = place(page, "定值电阻")
        sw = place(page, "单刀单掷开关")
        pick(page, bat, "负极", res, "左端")     # 真实 onAnchorPick 连线
        pick(page, res, "右端", sw, "左端")
        pick(page, sw, "右端", bat, "正极")
        n_links = page.evaluate(f"() => window.__builder.linksOf('{bat}').length + window.__builder.linksOf('{res}').length + window.__builder.linksOf('{sw}').length")
        check("C1 三条导线端子连线成立（真实 pickAnchor 入口）", n_links == 3, f"links={n_links}")
        r = run_and_read(page)
        I = r["rd"].get(f"I_{bat}")
        check("C2 合闸回路电流 I=EMF/(R+r)=0.1429A（MNA 读数）",
              I is not None and abs(I - 1.5 / 10.5) / (1.5 / 10.5) < 0.02, f"I={I}")
        U = r["rd"].get(f"U_{res}")
        check("C3 电阻端电压 U=IR=1.429V", U is not None and abs(U - 1.4286) < 0.03, f"U={U}")

        # 断闸 → I≈0
        page.evaluate(f"window.__builder.setParams('{sw}', {{ state: 0 }})")
        r2 = run_and_read(page)
        I2 = r2["rd"].get(f"I_{bat}")
        check("C4 断闸 I≈0（R_OFF 口径 <1e-4）", I2 is not None and I2 < 1e-4, f"I={I2}")
        page.evaluate(f"window.__builder.setParams('{sw}', {{ state: 1 }})")

        # ═══ 场景二：滑动变阻器两点闭式对照 ═══
        print("场景二：滑动变阻器")
        page.evaluate("window.__builder.clear()")
        bat = place(page, "干电池")
        rhe = place(page, "滑动变阻器")
        pick(page, bat, "负极", rhe, "左端")
        pick(page, rhe, "右端", bat, "正极")
        page.evaluate(f"window.__builder.setParams('{rhe}', {{ Rmax: 20, pos: 0.5 }})")
        rA = run_and_read(page)
        IA = rA["rd"].get(f"I_{bat}")
        page.evaluate(f"window.__builder.setParams('{rhe}', {{ Rmax: 20, pos: 1.0 }})")
        rB = run_and_read(page)
        IB = rB["rd"].get(f"I_{bat}")
        check("C5 pos=0.5：I=1.5/(10+0.5)", IA is not None and abs(IA - 1.5 / 10.5) / (1.5 / 10.5) < 0.02, f"I={IA}")
        check("C6 pos=1.0：I=1.5/(20+0.5)", IB is not None and abs(IB - 1.5 / 20.5) / (1.5 / 20.5) < 0.02, f"I={IB}")

        # ═══ 场景三：SPDT 双负载互斥 ═══
        print("场景三：单刀双掷")
        page.evaluate("window.__builder.clear()")
        bat = place(page, "干电池")
        sdt = place(page, "单刀双掷开关")
        ra = place(page, "定值电阻")
        rb = place(page, "定值电阻")
        page.evaluate(f"window.__builder.setParams('{ra}', {{ R: 10 }})")
        page.evaluate(f"window.__builder.setParams('{rb}', {{ R: 20 }})")
        pick(page, bat, "负极", sdt, "刀端")
        pick(page, sdt, "掷A", ra, "左端")
        pick(page, sdt, "掷B", rb, "左端")
        pick(page, ra, "右端", bat, "正极")
        pick(page, rb, "右端", bat, "正极")
        page.evaluate(f"window.__builder.setParams('{sdt}', {{ sel: 0 }})")
        r0 = run_and_read(page)
        Ia0, Ib0 = r0["rd"].get(f"I_{ra}"), r0["rd"].get(f"I_{rb}")
        check("C7 sel=0：A 支路通 I=1.5/10", Ia0 is not None and abs(Ia0 - 1.5 / 10.5) / (1.5 / 10.5) < 0.02, f"Ia={Ia0}")
        check("C8 sel=0：B 支路断 I<1e-4", Ib0 is not None and Ib0 < 1e-4, f"Ib={Ib0}")
        page.evaluate(f"window.__builder.setParams('{sdt}', {{ sel: 1 }})")
        r1 = run_and_read(page)
        Ia1, Ib1 = r1["rd"].get(f"I_{ra}"), r1["rd"].get(f"I_{rb}")
        check("C9 sel=1：B 通 A 断（互斥翻转）", Ib1 > 0.07 and Ia1 < 1e-4, f"Ib={Ib1} Ia={Ia1}")

        # 无电源错误提示
        page.evaluate("window.__builder.clear()")
        res = place(page, "定值电阻")
        page.evaluate("window.__builder.run()")
        page.wait_for_timeout(400)
        toast = page.evaluate("window.__builder.toastNow()")
        check("C10 无电源：toast 报'缺少电源'", "缺少电源" in (toast or ""), f"toast={toast!r}")
        check("C11 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ B1 电路基础 E2E 失败：{fails}"); return 1
    print(f"✅ B1 电路基础 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
