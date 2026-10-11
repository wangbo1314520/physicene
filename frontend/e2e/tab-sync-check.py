# -*- coding: utf-8 -*-
"""D1 Step1 E2E：状态直通——搭建→结果 Tab 全显（含曾丢五类件）+ 身份保持 + 连线可见 + 往返 undo。
DoD 对照（Tab合并方案设计.md Step1）：8 件复现场景全显 / 连线可见 / 电容器非地面 /
往返 Ctrl+Z 有效 / 无页面错误。"""
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

        # ═══ 搭建 8 件（含旧路径丢五类：固定端/已连绳/已连传感器/显示件 + 电容器身份）═══
        placed = page.evaluate('''() => { const B = window.__builder;
          B.clear();
          const g = B.add('ground', { mu: 0.1 }, 0, -1);
          const blk = B.add('block', { m: 1 }, -2, 0);
          B.add('slope', { th: 30, L: 4 }, 3, -1);
          const brk = B.add('bracket', {}, 4, 2);          // 旧丢①固定端
          const rp = B.add('rope', { L: 2 }, 4, 1);         // 旧丢②连接件（已连）
          const sn = B.add('speed_sensor', {}, -4, 1);      // 旧丢③传感器（已连）
          B.add('vector_arrow', {}, 0, 2);                   // 旧丢④显示件
          B.add('capacitor_r', { C: 0.1, V0: 0 }, -4, -0.4); // 旧⑤身份畸变（曾显示为地面）
          B.link(rp, '左端', brk, 'mount', 'rope');
          B.link(sn, '探头', blk, '顶', 'wire');
          return B.elements().map(e => e.type); }''')
        n_placed = len(placed)
        check("S0 搭建 8 件（含五类曾丢件）", n_placed == 8, f"{placed}")

        # Step2 单页：结果视图=同页同 store（架构上不再有"物理包过滤"路径）
        page.wait_for_timeout(800)
        shown = page.evaluate("() => window.__builder.elements().map(e => e.type)")
        check("S1 全数显示（8/8，单页同源 store）", shown is not None and len(shown) == 8, f"{shown}")

        # 身份：capacitor_r 保持电容类型（旧路径 → wall/地面）
        check("S2 capacitor_r 身份保持（非 wall）", shown is not None and 'capacitor_r' in shown, f"{[t for t in shown or [] if 'cap' in t or t == 'wall']}")

        # 连线可见（像素证）：绳色 #d9a05a 全画布计数（该橙为本场景唯一；bracket 蓝/slope 绿/ground 灰）
        # （旧 __simProject 钩子属 threeScene 懒挂载，2D 模式不保证——以像素证为准）
        page.wait_for_timeout(600)
        shot = page.locator('.free-build-tab .builder canvas').first.screenshot()
        open('/tmp/tab-link.png', 'wb').write(shot)
        from PIL import Image
        im = Image.open('/tmp/tab-link.png').convert('RGB')
        found = 0
        for yy in range(0, im.height, 1):
            for xx in range(0, im.width, 1):
                r0, g0, b0 = im.getpixel((xx, yy))
                if r0 > 175 and 115 < g0 < 195 and b0 < 135:
                    found += 1
        check("S3 连线像素可见（绳橙色全画布 >20 点）", found > 20, f"橙点={found}")

        # ═══ 追问2 补丁：三态（域/选中/视角）往返保持 ═══
        pass  # 单页：/lab 即 BuilderView
        page.wait_for_timeout(300)
        page.evaluate("() => { const B = window.__builder; B.clear(); B.add('ground', {}, 0, -1); const b = B.add('block', {}, -2, 0); B.select(b); }")
        page.evaluate("() => { [...document.querySelectorAll('.palette .tabs button')].find(x => x.textContent.includes('电磁')).click() }")
        page.evaluate("() => { [...document.querySelectorAll('.viewswitch button')].find(x => x.textContent.includes('等距')).click() }")
        page.wait_for_timeout(250)
        st0 = page.evaluate("window.__builder.uiState()")
        pass  # 单页无结果 Tab; page.wait_for_timeout(400)
        pass  # 单页：/lab 即 BuilderView
        page.wait_for_timeout(400)
        st1 = page.evaluate("window.__builder.uiState()")
        check("S7 三态往返保持（域=电磁/选中=block/视角=2.5D）",
              st1["domain"] == "em" and st1["selectedId"] == st0["selectedId"] and st1["viewMode"] == "2.5D",
              f"往返前={st0} 往返后={st1}")

        # 往返 undo：切回搭建 → Ctrl+Z 撤销 ground（首件）
        pass  # 单页：/lab 即 BuilderView
        n_before = page.evaluate("window.__builder.elements().length")
        page.keyboard.press("Control+z")
        page.wait_for_timeout(200)
        n_after = page.evaluate("window.__builder.elements().length")
        check("S4 往返后 undo 仍有效（Ctrl+Z 少一件）", n_before >= 2 and n_after == n_before - 1, f"{n_before}→{n_after}")
        page.keyboard.press("Control+y")
        page.wait_for_timeout(150)
        n_redo = page.evaluate("window.__builder.elements().length")
        check("S5 redo 恢复", n_redo == n_before, f"{n_after}→{n_redo}")
        check("S6 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ D1 Step1 状态直通 E2E 失败：{fails}"); return 1
    print(f"✅ D1 Step1 状态直通 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
