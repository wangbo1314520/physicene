# -*- coding: utf-8 -*-
"""A2 限流 E2E：配额=2 的后端上连问 3 次——第 3 次必须【显式】提示额度用完（非静默/非通用离线文案）。"""
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
    page.goto(f"{BASE}/exp/bx1-hooke")
    page.wait_for_selector(".ai-tutor", timeout=15000)
    replies = []
    for i in range(3):
        n = page.locator(".ai-tutor .msg.ai").count()
        page.locator(".ai-tutor input").fill(f"第{i+1}问：弹簧的劲度系数怎么求？")
        page.locator(".ai-tutor .input-row button").click()
        try:
            page.wait_for_function(f"() => document.querySelectorAll('.ai-tutor .msg.ai').length > {n} && ![...document.querySelectorAll('.ai-tutor .msg.ai')].slice(-1)[0].innerText.includes('思考中')", timeout=90000)
        except Exception:
            pass
        msgs = page.locator(".ai-tutor .msg.ai").all_inner_texts()
        replies.append(msgs[-1] if len(msgs) > n else "")
    print("Q1:", len(replies[0]), "字")
    print("Q2:", len(replies[1]), "字")
    print("Q3:", len(replies[2]), "字:", replies[2][:160].replace(chr(10), " | "))
    ok = ("额度" in replies[2] or "明日" in replies[2]) and "AI 服务暂不可用" not in replies[2].split("（")[-1]
    print("✅ 第3次显式额度提示" if ok else "❌ 第3次未显式提示额度")
    b.close()
sys.exit(0 if ok else 1)
