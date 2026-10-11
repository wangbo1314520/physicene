# -*- coding: utf-8 -*-
"""BuilderAi 上下文 E2E（2B · 2026-10-11）：真识别器（非 mock）+ 引擎路由入上下文 +
问"我搭的对吗"答场景信息 + 缺件场景指出具体错误。"""
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

def ask(page, q):
    n = page.locator(".ai-content .msg.ai").count()
    page.locator(".ai-content .input-row input").fill(q)
    page.locator(".ai-content .input-row button").click()
    try:
        page.wait_for_function(f"() => document.querySelectorAll('.ai-content .msg.ai').length > {n} && ![...document.querySelectorAll('.ai-content .msg.ai')].slice(-1)[0].innerText.includes('思考中')", timeout=90000)
    except Exception:
        pass
    msgs = page.locator(".ai-content .msg.ai").all_inner_texts()
    return msgs[-1] if len(msgs) > n else ""

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

        # ═══ 场景一：斜面+弹簧+滑块（可识别组合）═══
        page.evaluate("window.__builder.clear()")
        page.locator(".palette .tabs button", has_text="力学").click()
        page.wait_for_timeout(150)
        place(page, "斜面")
        place(page, "弹簧")
        place(page, "物块")
        page.wait_for_timeout(400)
        page.locator(".leftbar-tabs button", has_text="AI").click()
        page.wait_for_timeout(600)
        title = page.locator(".ai-content .ident .t").inner_text()
        check("C1 真识别器生效（标题非 mock'自由几何场景'）",
              "自由几何场景" not in title and ("模型" in title or "场景" in title or "运动" in title),
              f"title={title}（规则打分自选最优：碰撞+弹簧 亦为真识别）")
        notes_txt = page.locator(".ai-content .ident").inner_text()
        check("C2 引擎路由入上下文（'引擎路由：'可见）", "引擎路由" in notes_txt,
              notes_txt[:120].replace(chr(10), " "))

        r1 = ask(page, "我搭的对吗？这个场景是干什么的？")
        scene_hit = any(k in r1 for k in ("斜面", "弹簧", "劲度", "滑块", "阻尼"))
        check("C3 问'我搭的对吗'→答含场景信息（非泛泛）", len(r1) >= 60 and scene_hit,
              f"{len(r1)} 字：{r1[:90].replace(chr(10), ' ')}…")

        # ═══ 场景二：缺弹簧（应指出具体缺件）═══
        page.locator(".leftbar-tabs button", has_text="元件库").click()
        page.wait_for_timeout(200)
        page.evaluate("""() => { const B = window.__builder;
          B.clear();
          B.add('slope', { th: 30 }, 0, -1);
          B.add('block', { m: 1 }, -1, 0); }""")
        page.locator(".leftbar-tabs button", has_text="AI").click()
        page.wait_for_timeout(600)
        ident2 = page.locator(".ai-content .ident").inner_text()
        check("C4 缺件可见（缺：弹簧）", "弹簧" in ident2, ident2[:100].replace(chr(10), " "))

        r2 = ask(page, "我搭的对吗？还缺什么才能做斜面弹簧滑块实验？")
        miss_hit = any(k in r2 for k in ("弹簧", "缺", "需要", "加上"))
        check("C5 问缺件→AI 指出具体错误", len(r2) >= 40 and miss_hit,
              f"{len(r2)} 字：{r2[:90].replace(chr(10), ' ')}…")

        check("C6 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ BuilderAi 上下文 E2E 失败：{fails}"); return 1
    print(f"✅ BuilderAi 上下文 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
