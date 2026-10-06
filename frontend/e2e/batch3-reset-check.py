# -*- coding: utf-8 -*-
"""批 3 起步·复位按钮（6.5）E2E：搭建→运行→结束→🔄 复位→场景保留+状态清零+可再运行。"""
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

def wait_ended(page):
    page.evaluate("window.__builder.run()")
    return page.evaluate("""async () => {
      const B = window.__builder; const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let started = false;
      for (let i = 0; i < 360; i++) {
        await wait(50);
        const st = B.simStatus();
        if (st === 'running' || st === 'connecting') started = true;
        if (started && st === 'ended') return true;
      }
      return false;
    }""")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:80]))
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

    # 搭建：官方模板（保证可运行）
    page.evaluate("window.__builder.loadTemplate('gk-board-block')")
    page.wait_for_timeout(200)
    els0 = page.evaluate("() => window.__builder.elements().map(e => ({ id: e.id, x: e.position.x, y: e.position.y }))")
    check("D1 搭建完成（模板载入）", len(els0) >= 3, f"n={len(els0)}")

    ok = wait_ended(page)
    st = page.evaluate("window.__builder.simStatus()")
    check("D2 运行结束（ended）", ok and st == "ended", f"status={st}")
    check("D3 运行态指示存在（复位前）", page.locator(".tools .runstate").count() > 0)

    page.locator(".tools button", has_text="🔄 复位").click()
    page.wait_for_timeout(300)
    st2 = page.evaluate("window.__builder.simStatus()")
    check("D4 复位后 simStatus=idle", st2 == "idle", f"status={st2}")
    check("D5 运行态指示消失", page.locator(".tools .runstate").count() == 0)
    els1 = page.evaluate("() => window.__builder.elements().map(e => ({ id: e.id, x: e.position.x, y: e.position.y }))")
    same = len(els0) == len(els1) and all(a["id"] == b2["id"] and abs(a["x"] - b2["x"]) < 1e-9 and abs(a["y"] - b2["y"]) < 1e-9 for a, b2 in zip(els0, els1))
    check("D6 场景保留（元件数/位置逐一相等）", same, f"{len(els0)}→{len(els1)}")

    # 复位后可立即再运行
    ok2 = wait_ended(page)
    st3 = page.evaluate("window.__builder.simStatus()")
    check("D7 复位后可再运行（ended）", ok2 and st3 == "ended", f"status={st3}")

    # 复位按钮禁用语义：idle 时禁用
    page.locator(".tools button", has_text="🔄 复位").click()
    page.wait_for_timeout(200)
    check("D8 idle 态复位按钮禁用", page.locator(".tools button", has_text="🔄 复位").is_disabled())
    check("D9 全程无页面错误", not errs, str(errs[:1]))

    # ═══ 追问4：运行中复位 → 服务端实例立即停（非自跑到 maxDuration）═══
    print("场景 E：运行中复位的服务端停止验证（reattach 复查）")
    page.evaluate("window.__builder.run()")
    running = False
    for _ in range(60):
        page.wait_for_timeout(100)
        if page.evaluate("window.__builder.simStatus()") == "running": running = True; break
    check("E1 运行中（running）", running, f"status={page.evaluate('window.__builder.simStatus()')}")
    page.locator(".tools button", has_text="🔄 复位").click()
    for _ in range(20):
        page.wait_for_timeout(100)
        if page.evaluate("window.__builder.simStatus()") == "idle": break
    check("E2 运行中复位 → idle", page.evaluate("window.__builder.simStatus()") == "idle")
    # reattach 到同一 simId + 主动 sync：服务端应已 ended（end 生效）且 currentT 远小于 maxDuration（早停证据）
    ok_att = page.evaluate("window.__builder.reattach()")
    page.wait_for_timeout(400)   # 等 WS open + 重放
    page.evaluate("window.__builder.syncNow()")
    srv = None
    for _ in range(30):
        page.wait_for_timeout(100)
        st = page.evaluate("() => ({ s: window.__builder.simStatus(), t: window.__builder.simT() })")
        if st["s"] == "ended":
            srv = st
            break
    check("E3 服务端实例已停（reattach+sync 见 ended）",
          srv is not None and srv["s"] == "ended", f"{srv}")
    check("E4 早停证据：服务端 currentT≪maxDuration（主动 end，非自然到时）",
          srv is not None and srv["t"] < 2.0, f"t={srv['t'] if srv else None}s（复位发起于运行 ~0.5s 内）")
    check("E5 场景E 无页面错误", not errs, str(errs[:1]))
    b.close()

print()
if fails:
    print(f"❌ 批3 复位 E2E 失败：{fails}"); sys.exit(1)
print(f"✅ 批3 复位 E2E 全过（{len(ok_all)} 项）")
