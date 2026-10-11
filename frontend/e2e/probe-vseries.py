# -*- coding: utf-8 -*-
# ⚠ 本脚本为数据采集探针：无断言，exit 0 ≠ 功能通过（正式断言在 builder-redo/p2 套件）
"""卡68 定性探针2：验证 WS 重放是否送达 t≈0 帧——读 vSeries[0] 首 6 条与 max(vy 序列)。
若 vSeries 从 t≈0 起 → 帧都在，仅轮询观测丢 → 客户端按帧累计 maxY 即可修。"""
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
    b = p.chromium.launch(headless=True)
    auth = login_api()
    ctx = b.new_context(viewport={"width": 1560, "height": 980})
    ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                        f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
    page = ctx.new_page()
    page.goto(f"{BASE}/lab")
    page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
    page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)

    r = page.evaluate("""async () => {
      const B = window.__builder;
      B.clear(); B.loadTemplate('gk-noninertial'); B.run();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let started = false;
      for (let i = 0; i < 360; i++) {
        await wait(50);
        const st = B.simStatus();
        if (st === 'running' || st === 'connecting' || st === 'paused') started = true;
        if (started && st === 'ended') break;
      }
      // vSeries 未挂 __builder——从 Vue 组件内部状态挖（__builder_xxx 钩子对象引用组件闭包不可达，
      // 改从图表数据通道：直接读 useSimulationSocket 的 sharedState 经由 __builder 暴露的最接近物）
      const probes = B.probes ? B.probes() : {};
      return { status: B.simStatus(), t: B.simT(), probesKeys: Object.keys(probes) };
    }""")
    print("probe2:", json.dumps(r, ensure_ascii=False))
    b.close()
