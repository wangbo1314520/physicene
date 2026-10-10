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

def env_gate() -> bool:
    """P4 制度化：回归前 env-check 强制门禁——失败则不启动回归"""
    import _env, sys
    _env.banner()
    _, _, dirty = _env.git_info()
    if dirty > 0:
        print("❌ env-check: 工作树不干净，先提交再回归"); return False
    pid, name, start = _env.java_proc()
    if not pid or 'java' not in name.lower():
        print("❌ env-check: 8080 无 java 进程"); return False
    import os, time, datetime
    from pathlib import Path
    # 修复（2026-09-29）：原 parent.parent 指 frontend/java-backend（不存在）→ 此项检查一直空转，
    # 第 4 次假重启正是从此漏过。正确路径 = 仓库根/java-backend
    cls = Path(__file__).resolve().parent.parent.parent / 'java-backend' / 'target' / 'classes'
    if not cls.exists():
        print(f"❌ env-check: class 目录不存在 {cls}"); return False
    cls_new = 0.0
    for dp, _, fs in os.walk(cls):
        for f in fs:
            if f.endswith('.class'): cls_new = max(cls_new, os.path.getmtime(os.path.join(dp, f)))
    if start:
        try:
            st = time.mktime(time.strptime(start, '%Y-%m-%d %H:%M:%S'))
            if cls_new > st + 5:
                print(f"❌ env-check: backend 未重启（class@{datetime.datetime.fromtimestamp(cls_new):%H:%M:%S} > proc@{start}）——先重启再回归")
                return False
        except ValueError: pass
    # Vite dev 直出签名（第 4 项——日常回归最高频环境风险）
    try:
        import urllib.request
        html = urllib.request.urlopen('http://localhost:5173/', timeout=5).read().decode('utf-8', 'ignore')
        if '/@vite/client' not in html:
            print("❌ env-check: Vite 非 dev 直出（疑似 build 产物）"); return False
    except Exception:
        print("❌ env-check: Vite 5173 不可达"); return False
    print("✅ env-check 门禁通过（4 项）")
    return True

def main() -> int:
    if not env_gate():
        return 1
    _init_pid, _, _ = __import__("_env").java_proc()
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
        # 清 workspace 持久化（自查 1.5 修复可能引入旧场景干扰）
        page.evaluate("() => localStorage.removeItem('ps_builder_workspace')")
        page.reload()
        page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        page.locator(".tabbar .tab", has_text="搭建").click()
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        tpls = page.evaluate("window.__builder.templates()")
        want = [t for t in tpls if not args.ids or t["id"] in args.ids.split(",")]
        print(f"模板 {len(want)}/{len(tpls)} 个待验证")

        results_pairs = []  # C·动画扫描存储（第23条）
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
              let animP1 = null, animP2 = null;
              let animStartI = -1;
              // 状态残留防污染：上一模板的 ended/runstate 会残留——Java 须先见 running/connecting
              // 再等 ended；TS 须 runstate 相对初始值发生变化且含"已结束"
              let started = false, tsStarted = false;
              // 采样 50ms（2026-09-30 追问2 根因修复）：原 200ms 轮询相位随机错过抛体峰值——
              // 卡26 案例：容差 ±0.089m，轮询相位误差 0.065m，消耗比例 73%（剩余 0.024m）。
              // 术语统一（五轮追问1）：报告一律用"消耗比例"（误差/容差），不用"余量"
              for (let i = 0; i < 360; i++) {
                await wait(50);
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
                // C·画布动画采样 v3：首帧 subjects 非空时才采 P1（WS started 后首帧延迟 ~0.1s，
                // 空 subjects 会产生 truthy 空数组→永不重试→假报"未动"——采样 bug 非渲染断链）
                if (animP1 === null && started && B.subjects().length > 0) {
                  animP1 = B.subjects().map(s => ({ id: s.id, x: s.x, y: s.y }));
                  const tsp = B.tsPoses ? B.tsPoses() : [];
                  if (tsp.length) animP1 = tsp.map(p => ({ id: p.id, x: p.x, y: p.y }));
                  animStartI = i;
                }
                if (animP1 && !animP2 && i >= animStartI + 15 && started) {
                  animP2 = B.subjects().map(s => ({ id: s.id, x: s.x, y: s.y }));
                  const tsp = B.tsPoses ? B.tsPoses() : [];
                  if (tsp.length) animP2 = tsp.map(p => ({ id: p.id, x: p.x, y: p.y }));
                }
                if ((started && st === 'ended') || tsDone) break;
              }
              // C·动画判定：任一 subject 位移 >0.02 单位（含 TS 天体/Java 力学）
              let animMoved = false;
              let animDetail = '';
              if (animP1 && animP2) {
                for (const a of animP1) {
                  const b2 = animP2.find(q => q.id === a.id);
                  if (b2) {
                    const dx = Math.abs(b2.x - a.x), dy = Math.abs(b2.y - a.y);
                    if (dx > 0.02 || dy > 0.02) { animMoved = true; animDetail = `${a.id}: d=(${dx.toFixed(3)},${dy.toFixed(3)})`; break; }
                  }
                }
              }
              // 卡68 定性正修（2026-10-05）：max-y/max-x 改读 WS 帧流真值（vSeries 按帧累计）。
              // 根因：socket.run() POST 后才建 WS，attach 时服务端 lastFrames(150) 重放突发，
              // subjects 只留最新帧——隔离首跑顶点帧（t_apex=0.254s < 握手 ~0.35s）在两次轮询间
              // 被覆盖，轮询 max 只见上升段（0.52~0.69 离散簇）；全量跑因预热握手快而"偶发"通过。
              // 禁 timer 节流参数对照 5 跑无效已证伪原归因。vSeries 无数据（TS 路径）时回退轮询 max。
              // 卡68 定性正修（2026-10-05）：max-y/max-x 改读 WS 帧流真值（vSeries 按帧累计）——
              // 追问1 系统性扫描后 max-x 同病同修（唯一用户卡36 双磁场）。
              // 根因：socket.run() POST 后才建 WS，attach 时服务端 lastFrames(150) 重放突发，
              // subjects 只留最新帧——隔离首跑顶点帧（t_apex=0.254s < 握手 ~0.35s）在两次轮询间
              // 被覆盖，轮询 max 只见上升段（0.52~0.69 离散簇）；全量跑因预热握手快而"偶发"通过。
              // 禁 timer 节流参数对照 5 跑无效已证伪原归因。vSeries 无数据（TS 路径）时回退轮询 max。
              const vs = B.vSeries ? B.vSeries() : [];
              vs.forEach((series, k) => {
                for (const p of series) {
                  maxY[k] = Math.max(maxY[k] ?? -99, p.y);
                  if (p.x !== undefined) maxX[k] = Math.max(maxX[k] ?? -99, p.x);
                }
              });
              return { status: B.simStatus(), t: B.simT(), events: B.keyEvents(),
                       subjects: B.subjects(), maxY, maxX,
                       tsDone, tsReadings: B.tsReadings ? B.tsReadings() : null,
                       probes: B.probes ? B.probes() : {},
                       animMoved, animDetail,
                       animDebug: { p1: animP1 ? animP1.slice(0, 3) : null,
                                   p2: animP2 ? animP2.slice(0, 3) : null,
                                   subCount: (B.subjects() || []).length } };
            }""", tid)
            page.screenshot(path=f"{args.shot_dir}\\{tid}.png")
            is_ts = any(c["from"]["kind"] == "tsreading" for c in t["checks"])
            if is_ts and not r.get("tsDone"):
                ok_all = False
                details.append("TS 引擎未结束")
            if not is_ts and r["status"] != "ended":
                ok_all = False
                details.append(f"未结束 status={r['status']} t={r['t']:.1f}")

            # C·画布动画报告（2026-10-10·第23条）：物体应动但没动 → ⚠️（不阻断物理断言，扫描用）
            has_subjects = len(r.get("subjects") or []) > 0 or r.get("animMoved") is not None
            if has_subjects and not r.get("animMoved") and not r.get("animDetail"):
                details.append("⚠️ 动画：有主体但未见位移（静态/装置/或渲染断链）")
            elif r.get("animMoved"):
                pass  # 动画正常，不打印（减少噪声）——汇总表统一报告

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
            results_pairs.append((t, r))  # C·动画扫描存储

            # C·3 件日志（定性：真断链 vs 采样假报）——subjects 数据在但画布不动？
            if tid in ("gk-slope-spring-on-slope", "gk-conveyor-board", "gk-projectile-loop"):
                dbg = r.get("animDebug") or {}
                print(f"   🔍 [{tid}] subCount={dbg.get('subCount')} animMoved={r.get('animMoved')}")
                if dbg.get("p1"):
                    for q in dbg["p1"][:2]:
                        print(f"      P1: {q['id'][:20]} x={q['x']:.3f} y={q['y']:.3f}")
                else:
                    print(f"      P1: NULL（started 时 subjects 空=WS 未上帧）")
                if dbg.get("p2"):
                    for q in dbg["p2"][:2]:
                        print(f"      P2: {q['id'][:20]} x={q['x']:.3f} y={q['y']:.3f}")
                else:
                    print(f"      P2: NULL（15 帧后仍未采到=运行过短或提前 ended）")
            if not ok_all:
                failures.append(tid)

        if errs:
            failures.append(f"页面错误 {errs[:2]}")
            print("页面错误:", errs[:3])

        # ── notes 通道 E2E（2026-09-30 追问2/3）：未连接绳 + 物块 → 运行成功但 toast 提示"未连接"——
        # pkg.notes 曾长期无人消费（heater 取证发现），现已经 lastNotes 上屏；heater 元件本身已删（僵尸，0 卡引用）
        page.evaluate("window.__builder.clear()")
        page.locator(".palette .tabs button", has_text="力学").click()
        ok1 = page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')].find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", "物块")
        page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')].find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", "轻绳")
        page.locator(".tools .primary").click()
        page.wait_for_timeout(800)
        toast = page.evaluate("window.__builder.toast()")
        notes_ok = "未连接" in (toast or "")
        print(f"{'✅' if notes_ok else '❌'} notes 通道上屏（未连接绳 toast={'有' if toast else '无'}）")
        if not notes_ok:
            failures.append("notes-toast")

        # ── P5b-2 地面系双视角全栈 E2E：platform frame=1 + 质点 → relY 探针键到达浏览器 ──
        # （值断言在 GroundFrameTest：absPeak=普通抛体 0.28%、relPeak=参考系不变性 0.46%）
        page.evaluate("window.__builder.clear()")
        page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')].find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", "加速平台")
        page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')].find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", "质点")
        els2 = page.evaluate("window.__builder.elements()")
        plat_id = next(e["id"] for e in els2 if e["type"] == "accelerating_platform")
        par_id = next(e["id"] for e in els2 if e["type"] == "particle")
        page.evaluate("(m) => window.__builder.setParams(m.p, { a: 2, frame: 1 })", {"p": plat_id})
        page.evaluate("(m) => window.__builder.setParams(m.p, { v0: 6, ang: 30 })", {"p": par_id})
        page.locator(".tools .primary").click()
        for _ in range(80):
            page.wait_for_timeout(200)
            if page.evaluate("window.__builder.simStatus()") == "ended":
                break
        probes = page.evaluate("window.__builder.probes()") or {}
        rel_keys = [k for k in probes if k.startswith("relY_")]
        gf_ok = len(rel_keys) > 0
        print(f"{'✅' if gf_ok else '❌'} 地面系 relY 探针全栈（catalog frame 参数→RunBridge→Java→浏览器，键={rel_keys[:1]}）")
        if not gf_ok:
            failures.append("ground-frame-relY")

        b.close()

    passed = len(want) - len([f for f in failures if f in [t["id"] for t in want]])
    # C·动画扫描汇总（2026-10-10）：分类报告所有模板的画布动画状态
    print("\n── C·画布动画扫描（第23条：必须验渲染不只验数据）──")
    anim_ok, anim_warn, anim_skip = [], [], []
    for t, r in results_pairs:
        tid = t["id"]
        if r.get("animMoved"):
            anim_ok.append(tid)
        elif r.get("subjects") and len(r["subjects"]) > 0:
            anim_warn.append(tid)
        else:
            anim_skip.append(tid)
    print(f"  动画确认: {len(anim_ok)} | 有主体未动(⚠️): {len(anim_warn)} | 无主体/装置: {len(anim_skip)}")
    if anim_warn:
        print(f"  ⚠️ 未动清单: {anim_warn}")

    print(f"\n结果: {passed}/{len(want)} 通过" + (" ✅" if not failures else f" ❌ 失败: {failures}"))
    # P5a after-test：PID 一致性（E2E 中途重启→结果不可信）
    _now_pid, _, _ = __import__("_env").java_proc()
    if _init_pid and _now_pid != _init_pid:
        print(f"❌ after-test: backend PID 变化 ({_init_pid}→{_now_pid})——E2E 中途重启，结果不可信")
        failures.append("after-test PID changed")
    else:
        print(f"✅ after-test: PID 一致 ({_init_pid})")

    return 0 if not failures else 1

if __name__ == "__main__":
    sys.exit(main())
