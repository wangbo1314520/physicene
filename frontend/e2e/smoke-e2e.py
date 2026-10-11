# -*- coding: utf-8 -*-
"""冒烟一条龙（阶段 6.2）：登录→搭建→运行→看曲线→问 AI→保存→加载 全程零错误。"""
import _env; _env.banner()
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173"; API = "http://localhost:8080"
req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
    data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
    headers={"Content-Type": "application/json"})
auth = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())["data"]
ok_all, fails = [], []
def check(n, ok, d=""):
    print(f"  {'✓' if ok else '✗'} {n} {d}"); (ok_all if ok else fails).append(n)
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:80]))
    # ① 登录进单页
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
    check("S1 登录+单页挂载", True)
    # ② 搭建（真实点击）
    page.evaluate("""() => { const B = window.__builder;
      B.clear();
      B.add('ground', { mu: 0.1 }, 0, -1);
      const blk = B.add('block', { m: 1, v0: 3, mu: 0.1, fixRot: 1 }, 0, 0.1);
      B.add('speed_sensor', {}, -2, 0.5);
      B.link('speed_sensor-3', '探头', blk, '顶', 'wire'); }""")
    check("S2 搭建（地面+物块+传感器连线）", page.evaluate("window.__builder.count()") == 3)
    # ③ 运行
    page.locator(".tools .primary").click()
    st = ""
    for _ in range(120):
        page.wait_for_timeout(250)
        st = page.evaluate("window.__builder.simStatus()")
        if st == "ended": break
    check("S3 运行至结束", st == "ended", f"st={st}")
    # ④ 曲线
    page.locator(".bottombar-tabs button", has_text="数据").click()
    page.wait_for_timeout(800)
    series = page.evaluate("() => (window.__builder.vSeries() ?? []).length")
    check("S4 曲线序列有数据", series > 0, f"series={series}")
    # ⑤ 问 AI（真实输入）
    page.locator(".leftbar-tabs button", has_text="AI").click()
    page.wait_for_timeout(400)
    n0 = page.locator(".ai-content .msg.ai").count()
    page.locator(".ai-content .input-row input").fill("我搭的场景对吗？物块会怎么运动？")
    page.locator(".ai-content .input-row button").click()
    try:
        page.wait_for_function(f"() => document.querySelectorAll('.ai-content .msg.ai').length > {n0} && ![...document.querySelectorAll('.ai-content .msg.ai')].slice(-1)[0].innerText.includes('思考中')", timeout=90000)
    except Exception:
        pass
    msgs = page.locator(".ai-content .msg.ai").all_inner_texts()
    ai = msgs[-1] if len(msgs) > n0 else ""
    check("S5 AI 回答场景问题", len(ai) >= 60, f"{len(ai)} 字：{ai[:60].replace(chr(10),' ')}…")
    # ⑥ 保存
    page.evaluate("window.__builder.setName('冒烟一条龙')")
    page.locator("button", has_text="云端保存").first.click()
    page.wait_for_timeout(1500)
    toast = page.evaluate("window.__builder.toastNow()")
    sid = int(toast.split("#")[-1].split()[0]) if toast and "#" in toast else None
    check("S6 云端保存", sid is not None, f"#{sid}")
    # ⑦ 加载（深链）
    page.goto(f"{BASE}/lab?scene={sid}")
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
    page.wait_for_timeout(1500)
    els = page.evaluate("window.__builder.elements()")
    check("S7 深链加载（元件+连线回来）", len(els) == 3 and els[2].get("links"),
          f"types={[e['type'] for e in els]}")
    check("S8 全程零页面错误", not errs, str(errs[:1]))
    b.close()
print()
print("✅ 冒烟一条龙全过" if not fails else f"❌ 冒烟失败：{fails}")
sys.exit(0 if not fails else 1)
