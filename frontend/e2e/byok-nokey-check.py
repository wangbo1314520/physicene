# -*- coding: utf-8 -*-
"""前置·调整3 E2E：无 key（BYOK 未配置）时 UI 点 AI → 显式配置指引（含'配置'+'API key'，非'繁忙'）。"""
import _env; _env.banner()
import json, sys, urllib.request
from playwright.sync_api import sync_playwright
BASE = "http://localhost:5173"; API = "http://localhost:8080"
req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
    data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
    headers={"Content-Type": "application/json"})
auth = json.loads(urllib.request.urlopen(req, timeout=10).read().decode())["data"]
with sync_playwright() as p:
    b = p.chromium.launch(headless=True)
    ctx = b.new_context(viewport={"width": 1500, "height": 900})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:60]))
    page.goto(f"{BASE}/exp/bx1-hooke")
    page.wait_for_selector(".ai-tutor", timeout=15000)
    page.locator(".ai-tutor input").fill("弹簧的劲度系数怎么求？")
    page.locator(".ai-tutor .input-row button").click()
    try:
        page.wait_for_function("() => { const m = [...document.querySelectorAll('.ai-tutor .msg.ai')]; return m.length >= 2 && !m.slice(-1)[0].innerText.includes('思考中'); }", timeout=60000)
    except Exception:
        pass
    msgs = page.locator(".ai-tutor .msg.ai").all_inner_texts()
    last = msgs[-1] if len(msgs) >= 2 else ""
    has_cfg = "配置" in last and "API key" in last
    not_busy = "繁忙" not in last
    print(f"reply({len(last)}字): {last[:180].replace(chr(10), ' | ')}")
    print(("✅ 无 key → 显式配置指引（含'配置'+'API key'，非'繁忙'）" if (has_cfg and not_busy) else "❌ 未达口径"))
    print("✅ 无页面错误" if not errs else f"❌ {errs[:1]}")
    b.close()
sys.exit(0 if (has_cfg and not_busy and not errs) else 1)
