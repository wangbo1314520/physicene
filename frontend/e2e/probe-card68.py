# -*- coding: utf-8 -*-
# ⚠ 本脚本为数据采集探针：无断言，exit 0 ≠ 功能通过（正式断言在 builder-redo/p2 套件）
"""卡68 定性探针（一次性）：隔离复现 builder-check 采样循环，逐轮打 (i, wall, simT, status, tsStatus, y0)。
目的：判定 break 早退是谁——Java ended 早 / tsDone 早 / 采样循环节流。"""
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, args=["--disable-background-timer-throttling"])
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)[:100]))
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

    rows = page.evaluate("""async () => {
      const B = window.__builder;
      B.clear(); B.loadTemplate('gk-noninertial'); B.run();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      const out = [];
      let started = false, tsStarted = false, tsDone = false, maxY = -99;
      for (let i = 0; i < 360; i++) {
        await wait(50);
        const st = B.simStatus();
        const tst = B.tsStatus ? B.tsStatus() : 'idle';
        if (st === 'running' || st === 'connecting' || st === 'paused') started = true;
        if (tst === 'running') tsStarted = true;
        tsDone = tsStarted && tst === 'ended';
        const s0 = B.subjects()[0];
        if (s0) maxY = Math.max(maxY, s0.y);
        out.push({ i, wall: +(i*0.05).toFixed(2), t: +B.simT().toFixed(3), st, tst,
                   y: s0 ? +s0.y.toFixed(3) : null, vy: s0 ? +s0.vy.toFixed(3) : null });
        if ((started && st === 'ended') || tsDone) { out.push({ BREAK: true, why: tsDone ? 'tsDone' : 'ended', i }); break; }
      }
      return { rows: out, maxY: +maxY.toFixed(3) };
    }""")
    print(f"maxY={rows['maxY']}  pageErrors={errs[:2]}")
    for r in rows["rows"]:
        if r.get("BREAK"):
            print(f"  BREAK at i={r['i']} why={r['why']}")
        elif r["i"] < 6 or r["st"] != "running" or r["i"] % 4 == 0:
            print(f"  i={r['i']:>3} wall={r['wall']:.2f} t={r['t']:.3f} st={r['st']} ts={r['tst']} y={r['y']} vy={r['vy']}")
    b.close()
