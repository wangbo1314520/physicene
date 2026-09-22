# -*- coding: utf-8 -*-
"""
阶段四 builder-check.py：几何模板逐个载入→运行→criticalChecks 断言（§7 回归矩阵 #8）。
check.from 五类：event(payloadKey)/final(subject,pick)/max-y(subject)/max-x(subject)/no-event。
容差：|got−theory| ≤ |theory|·tol + tolAbs（交付标准 §0.1）。
用法：python e2e/builder-check.py [--ids gk-slope-spring,...] [--shot-dir ...]
"""
import _env; _env.banner()  # 测点1前置：每轮回归头行打印环境指纹
import argparse, json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ids", default="", help="逗号分隔模板 id（默认全部）")
    ap.add_argument("--shot-dir", default=r"E:\Program\physicene\frontend\e2e\shots\templates")
    args = ap.parse_args()
    failures = []

    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        auth = login_api()
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        # P0 后 builder 迁入 /lab「自由搭建」Tab（/exp→/lab 重定向）；选择器作用域化
        page.goto(f"{BASE}/lab")
        page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        page.locator(".tabbar .tab", has_text="自由搭建").click()
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        tpls = page.evaluate("window.__builder.templates()")
        want = [t for t in tpls if not args.ids or t["id"] in args.ids.split(",")]
        print(f"模板 {len(want)}/{len(tpls)} 个待验证")

        for t in want:
            tid = t["id"]
            ok_all = True
            details = []
            r = page.evaluate("""async (tid) => {
              const B = window.__builder;
              B.clear(); B.loadTemplate(tid); B.run();
              const wait = (ms) => new Promise(r => setTimeout(r, ms));
              const maxY = [], maxX = [];
              let tsDone = false;
              // 状态残留防污染：上一模板的 ended/runstate 会残留——Java 须先见 running/connecting
              // 再等 ended；TS 须 runstate 相对初始值发生变化且含"已结束"
              let started = false, tsStarted = false;
              for (let i = 0; i < 90; i++) {
                await wait(200);
                const st = B.simStatus();
                const rs = document.querySelector('.free-build-tab .runstate')?.textContent || '';
                if (st === 'running' || st === 'connecting' || st === 'paused') started = true;
                const tst = B.tsStatus ? B.tsStatus() : 'idle';
                if (tst === 'running') tsStarted = true;
                tsDone = tsStarted && tst === 'ended';
                B.subjects().forEach((s, k) => {
                  maxY[k] = Math.max(maxY[k] ?? -99, s.y);
                  maxX[k] = Math.max(maxX[k] ?? -99, s.x);
                });
                if ((started && st === 'ended') || tsDone) break;
              }
              return { status: B.simStatus(), t: B.simT(), events: B.keyEvents(),
                       subjects: B.subjects(), maxY, maxX,
                       tsDone, tsReadings: B.tsReadings ? B.tsReadings() : null,
                       probes: B.probes ? B.probes() : {} };
            }""", tid)
            page.screenshot(path=f"{args.shot_dir}\\{tid}.png")
            is_ts = any(c["from"]["kind"] == "tsreading" for c in t["checks"])
            if is_ts and not r.get("tsDone"):
                ok_all = False
                details.append("TS 引擎未结束")
            if not is_ts and r["status"] != "ended":
                ok_all = False
                details.append(f"未结束 status={r['status']} t={r['t']:.1f}")

            def within(got, c):
                lim = abs(c["theory"]) * c["tol"] + c.get("tolAbs", 0) + 1e-9
                return got is not None and abs(got - c["theory"]) <= lim, lim

            for c in t["checks"]:
                frm = c["from"]
                if frm["kind"] == "event":
                    ev = next((e for e in r["events"] if e["eventType"] == frm["eventType"]), None)
                    got = (ev or {}).get("payload", {}).get(frm.get("payloadKey")) if ev else None
                    if got is None and ev is not None and frm.get("payloadKey") is None:
                        got = 1
                    ok, lim = within(got, c)
                    d = f"event {frm['eventType']} got={got} theory={c['theory']}±{lim:.3f}"
                elif frm["kind"] == "no-event":
                    got = next((e for e in r["events"] if e["eventType"] == frm["eventType"]), None)
                    ok = got is None
                    d = f"no {frm['eventType']} got={'有' if got else '无'}"
                elif frm["kind"] == "final":
                    sb = r["subjects"][frm["subject"]] if frm["subject"] < len(r["subjects"]) else None
                    got = sb[frm["pick"]] if sb else None
                    ok, lim = within(got, c)
                    d = f"final s{frm['subject']}.{frm['pick']}={None if got is None else round(got,3)} theory={round(c['theory'],3)}±{lim:.3f}"
                elif frm["kind"] == "max-y":
                    got = r["maxY"][frm["subject"]] if frm["subject"] < len(r["maxY"]) else None
                    ok, lim = within(got, c)
                    d = f"maxY[{frm['subject']}]={None if got is None else round(got,3)} theory={round(c['theory'],3)}±{lim:.3f}"
                elif frm["kind"] == "max-x":
                    got = r["maxX"][frm["subject"]] if frm["subject"] < len(r["maxX"]) else None
                    ok, lim = within(got, c)
                    d = f"maxX[{frm['subject']}]={None if got is None else round(got,3)} theory={round(c['theory'],3)}±{lim:.3f}"
                elif frm["kind"] == "tsreading":  # P3·装置：TS 引擎读数
                    got = (r.get("tsReadings") or {}).get(frm["key"])
                    ok, lim = within(got, c)
                    d = f"ts.{frm['key']}={got} theory={round(c['theory'],4)}±{lim:.4f}"
                else:  # probe：Java probes 通道（[t, v] 取 v）
                    pv = (r.get("probes") or {}).get(frm["key"])
                    got = pv[1] if isinstance(pv, list) and len(pv) > 1 else None
                    ok, lim = within(got, c)
                    d = f"probe.{frm['key']}={got} theory={round(c['theory'],4)}±{lim:.4f}"
                if not ok:
                    ok_all = False
                details.append(("✓" if ok else "✗") + " " + c["label"] + " [" + d + "]")
            print(f"{'✅' if ok_all else '❌'} {tid}（卡 {t['card']}）")
            for d in details:
                print("   " + d)
            if not ok_all:
                failures.append(tid)

        if errs:
            failures.append(f"页面错误 {errs[:2]}")
            print("页面错误:", errs[:3])
        b.close()

    passed = len(want) - len([f for f in failures if f in [t["id"] for t in want]])
    print(f"\n结果: {passed}/{len(want)} 通过" + (" ✅" if not failures else f" ❌ 失败: {failures}"))
    return 0 if not failures else 1

if __name__ == "__main__":
    sys.exit(main())
