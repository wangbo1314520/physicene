# -*- coding: utf-8 -*-
"""渲染内容运行时探针（2026-10-06 装置方块债根治配套）：
headless 里逐 catalog 类型调 buildUnifiedMesh，断言"几何构成 ≠ 单一 fallback Box(1,1,0.5)"。
静态 render-coverage-check 只验 case 存在；本探针验 case 画的内容——防"缺失 0 但全是方块"复发。
ALLOWLIST 与 render-coverage-check 同源（批B 待清偿，期限 2026-10-20）。
用法：python e2e/render-box-probe.py（需 Vite 已起；Java 供登录）"""
import _env; _env.banner()
import json, sys, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"

# 注记类走画布专属通道（buildUnifiedMesh 不适用）+ 批B 方块债（同 render-coverage ALLOWLIST）
SKIP = {"trail", "timeline", "vector_arrow", "graph_tag",
        "powerline", "ac_four_values", "transformer_powerline",
        "wave_multi", "wave_graphs", "wave_super", "nuclear_react", "micro_integral",
        "elevator_scale", "energy_meter"}

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

def main() -> int:
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        auth = login_api()
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        pg = ctx.new_page()
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        r = pg.evaluate("""async (skip) => {
          const cat = await import('/src/builder/catalog.ts');
          const R = await import('/src/builder/render/Renderer.ts');
          const out = [];
          for (const spec of cat.CATALOG) {
            if (skip.includes(spec.type)) continue;
            const m = R.buildUnifiedMesh({ id: 'x', type: spec.type, position: { x: 0, y: 0 }, angle: 0,
              params: {}, isFixed: false, role: spec.role, links: [] });
            let parts = 0, boxParams = null;
            m.mesh.traverse(o => {
              if (!o.geometry) return;
              parts++;
              if (o.geometry.type === 'BoxGeometry') {
                const pr = o.geometry.parameters;
                if (pr && pr.width === 1 && pr.height === 1 && pr.depth === 0.5) boxParams = pr;
              }
            });
            const loneFallback = parts === 1 && boxParams !== null;
            out.push({ t: spec.type, parts, loneFallback });
          }
          return out; }""", sorted(SKIP))
        b.close()
    bad = [x for x in r if x["loneFallback"]]
    print(f"检查 {len(r)} 类型（skip {len(SKIP)}）：fallback 方块 {len(bad)}")
    for x in bad:
        print(f"  ✗ {x['t']} —— 单一 Box(1,1,0.5)，case 缺失或内容偷懒")
        fails.append(x["t"])
    if fails:
        print(f"❌ 渲染内容探针失败：{fails}")
        return 1
    print("✅ 全部类型非 fallback 方块（ALLOWLIST 外）")
    return 0

if __name__ == "__main__":
    sys.exit(main())
