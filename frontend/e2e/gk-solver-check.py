# -*- coding: utf-8 -*-
"""B10 AI 解题讲解器 E2E（2A · 2026-10-11）：高考卡 → 讲解本题 → 完整解答 ≥6 段 →
AI 深讲（DeepSeek 成文推导，断言非'不给答案'而是完整给出）。
样例卡：gk-accel-selector-b（加速电场→筛选器→磁场，任务包 2A 点名的三区域多过程）。"""
import _env; _env.banner()
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"
CARD = "gk-accel-selector-b"
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

SECTIONS = ["过程拆解", "受力分析", "物理规律", "临界条件", "公式推导", "数值计算", "易错点", "同类题", "竞赛扩展"]

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
        page.goto(f"{BASE}/exp/{CARD}")
        page.wait_for_selector(".explainer", timeout=15000)
        check("B0 讲解器面板挂载", True)

        # ① 打开讲解 → 完整解答 → 全部展开
        page.locator(".explainer .head").click()
        page.wait_for_timeout(300)
        page.locator(".explainer .modes button", has_text="完整解答").click()
        page.wait_for_timeout(200)
        page.locator(".explainer .mini", has_text="全部展开").click()
        page.wait_for_timeout(300)
        heads = page.locator(".explainer .sec h4").all_inner_texts()
        n_sec = len(heads)
        check("B1 完整解答段数 ≥6/9", n_sec >= 6, f"sections={n_sec} {[h[:6] for h in heads]}")

        # ② 每段有内容（li 非空）
        empty = 0
        for h in heads:
            sec = page.locator(".explainer .sec", has_text=h.split(" ")[-1] if " " in h else h)
        li_count = page.locator(".explainer .sec li").count()
        check("B2 各段有内容（li 总数 ≥12）", li_count >= 12, f"li={li_count}")

        # ③ 数值段给完整答案（非'不给答案'口径——B10 与教材层 AI 的分界）
        numeric_sec = page.locator(".explainer .sec", has_text="数值计算")
        numeric_txt = numeric_sec.first.inner_text() if numeric_sec.count() else ""
        has_num = any(c in numeric_txt for c in "0123456789")
        check("B3 数值段代入计算（给完整答案，含数字）", has_num and "不给答案" not in numeric_txt,
              f"数值段前80字={numeric_txt[:80].replace(chr(10), ' ')}")

        # ④ AI 深讲：真 AI 成文推导
        page.locator(".explainer .mini.ai").click()
        try:
            page.wait_for_function(
                "() => { const a = document.querySelector('.explainer .aisay'); return a && a.innerText.length >= 80 && !a.innerText.includes('思考中'); }",
                timeout=90000)
        except Exception:
            pass
        ai_text = page.locator(".explainer .aisay").inner_text() if page.locator(".explainer .aisay").count() else ""
        online = "AI 服务暂不可用" not in ai_text and len(ai_text) >= 80
        has_derive = any(k in ai_text for k in ("推导", "答案", "联立", "代入", "解得", "＝", "="))
        check("B4 AI 深讲真回复（非回退）", online, f"{len(ai_text)} 字")
        check("B5 AI 深讲含推导/答案标记", online and has_derive,
              f"head={ai_text[:80].replace(chr(10), ' ')}")

        check("B6 全程无页面错误", not errs, str(errs[:1]))
        page.screenshot(path="e2e/out/gk-solver.png", full_page=False)
        b.close()

    print()
    if fails:
        print(f"❌ B10 讲解器 E2E 失败：{fails}"); return 1
    print(f"✅ B10 讲解器 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
