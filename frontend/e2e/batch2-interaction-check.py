# -*- coding: utf-8 -*-
"""交互批 2 E2E：固定视觉 3.2（isFixed 锚钉显隐）+ 连接冲突 2.11（重复/反向/同锚两端/超容拦截）。
钩子：__builder.pickAnchor 走真实 onAnchorPick 入口（含拦截）；fixedPins/setFixed/linksOf 断言状态。
用法：python e2e/batch2-interaction-check.py（需 Vite+Java 已起）"""
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

def pick(page, a, anchor_a, b, anchor_b):
    """两次锚点点击完成一次连线尝试；返回第二次点击后的 toast 文案。
    末尾 Esc：冲突时 linkFrom 故意保留供换目标重试，测试里统一清场"""
    page.evaluate("(m) => window.__builder.pickAnchor(m.a, m.aa)", {"a": a, "aa": anchor_a})
    page.wait_for_timeout(60)
    page.evaluate("(m) => window.__builder.pickAnchor(m.b, m.ab)", {"b": b, "ab": anchor_b})
    page.wait_for_timeout(60)
    t = page.evaluate("window.__builder.toastNow()") or ""
    page.keyboard.press("Escape")
    page.wait_for_timeout(40)
    return t

def nlinks(page, eid):
    return len(page.evaluate("(id) => window.__builder.linksOf(id)", eid))

def main() -> int:
    auth = login_api()
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        pass  # 单页
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

        # ═══ 场景 A：固定视觉 3.2 ═══
        print("场景 A：固定锚钉显隐")
        page.evaluate("window.__builder.clear()")
        page.locator(".palette .tabs button", has_text="力学").click()
        g1 = place(page, "地面")
        b1 = place(page, "物块")
        page.wait_for_timeout(400)  # 等一帧 rAF（锚钉在 syncSelection 每帧同步）
        pins = page.evaluate("window.__builder.fixedPins()")
        check("地面（constraint 出厂 isFixed=true）显示锚钉", g1 in pins, f"pins={len(pins)}")
        check("物块（body 出厂 isFixed=false）无锚钉", b1 not in pins, "")
        page.evaluate("(m) => window.__builder.setFixed(m.b, true)", {"b": b1})
        page.wait_for_timeout(300)
        check("物块勾选固定 → 锚钉出现", b1 in page.evaluate("window.__builder.fixedPins()"), "")
        page.evaluate("(m) => window.__builder.setFixed(m.b, false)", {"b": b1})
        page.wait_for_timeout(300)
        check("物块取消固定 → 锚钉消失", b1 not in page.evaluate("window.__builder.fixedPins()"), "")
        page.evaluate("(m) => window.__builder.setFixed(m.b, true)", {"b": b1})
        page.wait_for_timeout(300)
        page.locator(".bcanvas canvas").first.screenshot(path="e2e-shots/batch2-fixed-pin.png")  # 视觉证据：地面+固定物块两枚红锚钉

        # ═══ 场景 B：连接冲突 2.11 ═══
        print("场景 B：连接冲突拦截（pickAnchor 走真实入口）")
        page.evaluate("window.__builder.clear()")
        r1 = place(page, "轻绳")
        p1 = place(page, "物块")
        p2 = place(page, "物块")
        p3 = place(page, "物块")
        t = pick(page, r1, "左端", p1, "顶")
        check("首连成功：轻绳·左端 ↔ 物块·顶", nlinks(page, r1) == 1 and "已连" in t, f"links={nlinks(page, r1)} toast={t!r}")
        t = pick(page, r1, "左端", p1, "顶")
        check("① 完全重复被拦截（links 不增）", nlinks(page, r1) == 1 and "已存在相同连接" in t, f"links={nlinks(page, r1)} toast={t!r}")
        t = pick(page, p1, "顶", r1, "左端")
        check("② 反向重复被拦截（不产生死链）", nlinks(page, p1) == 0 and "反向" in t, f"p1.links={nlinks(page, p1)} toast={t!r}")
        t = pick(page, r1, "右端", p1, "顶")
        check("③ 同线两端接同一锚点被拦截", nlinks(page, r1) == 1 and "两端不能接在同一锚点" in t, f"links={nlinks(page, r1)} toast={t!r}")
        t = pick(page, r1, "右端", p2, "顶")
        check("第二端连不同物块：合法", nlinks(page, r1) == 2 and "已连" in t, f"links={nlinks(page, r1)} toast={t!r}")
        t = pick(page, r1, "左端", p3, "顶")
        check("④ 轻绳第 3 条超容被拦截并说明只读前 2 条", nlinks(page, r1) == 2 and "最多连 两处" in t and "只读前 2 条" in t,
              f"links={nlinks(page, r1)} toast={t!r}")

        # 滑轮回归：单锚「悬挂点」两端连不同目标必须放行（2.11 不得破坏既有合法连线）
        page.evaluate("window.__builder.clear()")
        pu = place(page, "滑轮")
        q1 = place(page, "物块")
        q2 = place(page, "物块")
        t = pick(page, pu, "悬挂点", q1, "顶")
        check("滑轮·悬挂点 ↔ 物块1 首连放行", nlinks(page, pu) == 1 and "已连" in t, f"toast={t!r}")
        t = pick(page, pu, "悬挂点", q2, "顶")
        check("回归-滑轮同锚第二连放行（两端共用悬挂点是设计）", nlinks(page, pu) == 2 and "已连" in t,
              f"links={nlinks(page, pu)} toast={t!r}")

        # 检测器超容（links[0] 单目标）——传感器在「通用」域
        page.locator(".palette .tabs button", has_text="通用").click()
        page.wait_for_timeout(120)
        s1 = place(page, "速度传感器")
        t = pick(page, s1, "探头", q1, "顶")
        check("速度计首连放行", nlinks(page, s1) == 1 and "已连" in t, f"toast={t!r}")
        t = pick(page, s1, "探头", q2, "顶")
        check("④ 检测器第 2 连被拦截（只读前 1 条）", nlinks(page, s1) == 1 and "一个目标" in t and "只读前 1 条" in t,
              f"links={nlinks(page, s1)} toast={t!r}")

        check("全程无页面错误", not errs, f"{errs[:2]}")
        b.close()

    print()
    if fails:
        print(f"❌ 批 2 交互 E2E 失败：{fails}")
        return 1
    print(f"✅ 批 2 交互 E2E 全过（{len(ok_all)} 项）")
    return 0

if __name__ == "__main__":
    sys.exit(main())
