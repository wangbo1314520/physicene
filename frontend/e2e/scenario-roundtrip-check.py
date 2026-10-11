# -*- coding: utf-8 -*-
"""场景云端往返契约 E2E（阶段1 追问2 · 2026-10-11）：UI 搭建（含连线）→ ☁️ 云端保存 →
?scene= 深链加载 → 连线还在 → 运行出 recordId → 回放帧可拉。
背景：深链丢连线 bug（typed 反序列化丢 links，387f9fa 修复）当时只做了一次性手工验证——
同类问题要靠这条常驻断言拦住。"""
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

        # ── ① UI 搭建：地面 + 物块(v0) + 速度传感器，连线用真实 pickAnchor（wire）──
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        page.evaluate("window.__builder.clear()")
        page.locator(".palette .tabs button", has_text="力学").click()
        page.wait_for_timeout(150)
        g = place(page, "地面")
        blk = place(page, "物块")
        page.evaluate(f"window.__builder.setParams('{blk}', {{ m: 1, v0: 3, mu: 0.1, fixRot: 1 }})")
        page.evaluate(f"() => {{ const e = window.__builder.elements().find(e => e.id === '{g}'); if (e) window.__builder.setParams(e.id, {{ mu: 0.1 }}) }}")
        page.locator(".palette .tabs button", has_text="通用").click()
        page.wait_for_timeout(150)
        sn = place(page, "速度传感器")
        page.locator(".tools button", has_text="连线").click()
        page.wait_for_timeout(100)
        page.locator(".linkkind").select_option("wire")
        pick(page, sn, "探头", blk, "顶")
        links0 = page.evaluate(f"window.__builder.linksOf('{sn}')")
        check("R1 搭建并连线（真实 pickAnchor）", len(links0) == 1 and links0[0]["kind"] == "wire",
              f"links={json.dumps(links0, ensure_ascii=False)}")

        # ── ② ☁️ 云端保存（真实按钮）──
        page.evaluate("window.__builder.setName('往返契约E2E')")
        page.locator("button", has_text="云端保存").first.click()
        page.wait_for_timeout(1500)
        toast = page.evaluate("window.__builder.toastNow()")
        sid = None
        if toast and "#" in toast:
            try:
                sid = int(toast.split("#")[-1].split()[0])
            except ValueError:
                sid = None
        check("R2 云端保存成功（toast 带 #id）", sid is not None, f"toast={toast!r}")

        # ── ③ API 读回：links 原样 ──
        links_api = None
        if sid:
            req = urllib.request.Request(f"{API}/api/scenarios/{sid}",
                headers={"Authorization": "Bearer " + auth["token"]})
            with urllib.request.urlopen(req, timeout=10) as r:
                els = json.loads(r.read().decode())["data"]["elements"]
            sn_back = next((e for e in els if "speed_sensor" in str(e.get("id", ""))), None)
            links_api = (sn_back or {}).get("links")
        check("R3 API 读回 links 保留", links_api == links0, f"links={json.dumps(links_api, ensure_ascii=False)}")

        # ── ④ ?scene= 深链加载：元件+连线都在，零页面错误 ──
        page.goto(f"{BASE}/lab?scene={sid}")
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        page.wait_for_timeout(1500)
        els2 = page.evaluate("window.__builder.elements()")
        sn2 = next((e for e in els2 if e["type"] == "speed_sensor"), None)
        check("R4 深链加载元件齐（含地面/物块/传感器）", len(els2) == 3 and sn2 is not None,
              f"types={[e['type'] for e in els2]}")
        check("R5 深链加载连线保留（e.links 不丢不崩）",
              sn2 is not None and sn2.get("links") == links0,
              f"links={json.dumps((sn2 or {}).get('links'), ensure_ascii=False)}")
        check("R6 深链零页面错误", not errs, str(errs[:1]))

        # ── ⑤ 运行（双轨：sceneId+elements）→ recordId → 回放帧 ──
        page.locator(".tools .primary").click()
        rec_id = None
        for _ in range(120):
            page.wait_for_timeout(250)
            st = page.evaluate("window.__builder.simStatus()")
            if st == "ended":
                break
        import time
        time.sleep(1.5)
        req = urllib.request.Request(f"{API}/api/scenarios/{sid}",
            headers={"Authorization": "Bearer " + auth["token"]})
        # recordId 从最新记录列表反查太绕——直接查该场景的记录
        req2 = urllib.request.Request(f"{API}/api/records?scenarioId={sid}&page=1&pageSize=1",
            headers={"Authorization": "Bearer " + auth["token"]})
        frames_total = 0
        try:
            with urllib.request.urlopen(req2, timeout=10) as r:
                body = json.loads(r.read().decode())["data"]
            items = body.get("content") or body.get("items") or []
            mine = [it for it in items if it.get("scenarioId") in (sid, float(sid), str(sid))] or items
            rec_id = mine[0].get("id") if mine else None
        except Exception as e:
            check("R7 运行产生回放记录", False, f"记录查询失败 {e}")
        if rec_id:
            req3 = urllib.request.Request(f"{API}/api/records/{rec_id}?page=1&pageSize=3",
                headers={"Authorization": "Bearer " + auth["token"]})
            with urllib.request.urlopen(req3, timeout=10) as r:
                data = json.loads(r.read().decode())["data"]
            frames_total = data.get("totalFrames") or len(data.get("frames") or [])
        check("R7 运行产生回放记录（recordId+帧>0）", rec_id is not None and frames_total > 0,
              f"recordId={rec_id} frames={frames_total}")

        b.close()

    print()
    if fails:
        print(f"❌ 场景往返契约 E2E 失败：{fails}"); return 1
    print(f"✅ 场景往返契约 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
