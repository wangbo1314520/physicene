"""
【2026-09-19 退役存档】/sandbox 已 redirect → /exp（阶段三⑧）。本脚本不再可运行、不再纳入回归矩阵；10 场景功能覆盖映射见 docs/统一搭建台-sandbox退役功能映射.md；元件对账单测 sandbox-ledger.test.ts 保留。
B13 自由搭建 E2E：方案书 §10.2 的 10 个测试场景 —— 通过 DEV 钩子 window.__sandbox 脚本化“拖元件 → 识别 → 运行”，
断言：识别到的场景族正确、运行器挂载、动画两帧不同、物理量与解析解一致（与高考层同一套理论值）、控制台零错误。
用法：python e2e/sandbox-check.py [--url http://localhost:5173] [--only 1,4,7]
"""
import argparse
import hashlib
import json
import re
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "out"
STAGE = ".runner canvas"


def login(api: str) -> dict:
    req = urllib.request.Request(f"{api}/api/auth/login", method="POST", data=json.dumps({"username": "demo", "password": "demo1234"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = json.loads(r.read().decode())
    if body.get("code") != 0:
        raise SystemExit(f"登录失败: {body}")
    return body["data"]


# (编号, 名称, 元件列表[(type, params)], 期望 family, 期望 kind, 运行后等待 ms, 断言函数(panel_text) -> (ok, 描述))
def _rx(pat, txt, cast=float):
    m = re.search(pat, txt)
    return cast(m.group(1)) if m else None

SCENARIOS = [
    (1, "自由搭测电源电路（E、r）", [("battery", {}), ("rheostat", {}), ("ammeter", {}), ("voltmeter", {}), ("switch", {})], "circuit", "circuit", 1500,
     lambda t, page: (page.locator(".runner .ce").count() == 1 and page.locator(".runner .ce .tray").count() == 1, "电路编辑器挂载，托盘含电池/变阻器/电流表/电压表/开关")),
    (2, "自由搭平抛 + 竖直圆周", [("launcher", {}), ("loop", {"kind": 0})], "projectile-loop", "component", 3500,
     lambda t, page: ("最高点" in t or "脱离" in t or "切入轨道" in t, "独立组件运行，出现切入/最高点/脱离事件")),
    (3, "自由搭加速电场 + 筛选器 + 磁场", [("accel_field", {}), ("selector", {}), ("b_region", {}), ("screen", {})], "accel-selector-b", "component", 2500,
     lambda t, page: ("E/B" in t and "r =" in t or "r=" in t, "加速→筛选→磁场组件运行，面板给出 v、E/B、r")),
    (4, "自由搭双杆模型", [("rails", {"L": 1}), ("bar", {"m": 1, "v0": 4, "R": 1}), ("bar", {"m": 1, "v0": 0, "R": 1}), ("b_region", {"B": 1})], "rail-rod", "em", 5200,
     lambda t, page: (abs((_rx(r"共速 v=([\d.]+) m/s", t) or -1) - 2.0) <= 0.03, "双杆共速 v=m₁v₀/(m₁+m₂)=2.00 m/s（动量守恒）")),
    (5, "自由搭玻璃管液封", [("glass_tube", {"open": 0, "L1": 20}), ("liquid_col", {"h": 10}), ("gas", {"T1": 300}), ("heater", {"T2": 360})], "liquid-seal", "mech", 5200,
     lambda t, page: (abs((_rx(r"T=360 K：L=([\d.]+) cm", t) or -1) - 24.0) <= 0.02, "等压升温 L₂=L₁T₂/T₁=24.00 cm")),
    (6, "自由搭光电效应", [("phototube", {"mat": 0}), ("uv_light", {}), ("galvanometer", {})], "photoelectric", "mech", 8500,
     lambda t, page: (abs((_rx(r"截止频率 ν₀=W₀/h=([\d.]+)", t) or -1) - 2.28 / 0.4136) <= 0.03 and "拟合直线斜率=" in t, "ν₀=W₀/h=5.51×10¹⁴ Hz，扫频后拟合斜率≈h")),
    (7, "自由搭连接体（F 拉 A–B）", [("block", {"m": 2, "mu": 0.1}), ("block", {"m": 1, "mu": 0.1}), ("rope", {}), ("sensor_f", {}), ("sensor_a", {})], "connected", "mech", 2000,
     lambda t, page: (abs((_rx(r"a = ([\d.]+) m/s²", t) or -1) - (20 - 0.1 * 3 * 9.8) / 3) <= 0.01, "整体法 a=(F−μ(m₁+m₂)g)/(m₁+m₂)=5.69 m/s²，隔离法 T 同步显示")),
    (8, "自由搭传送带 + 物块", [("conveyor", {"vb": 3, "th": 0, "mu": 0.2}), ("block", {"v0": 0})], "conveyor", "mech", 3200,
     lambda t, page: (abs((_rx(r"共速 v=([\d.]+) m/s", t) or -1) - 3.0) <= 0.01, "物块被带加速到共速 v=v_带=3.00 m/s")),
    (9, "自由搭变压器（原边随副边）", [("transformer", {"N1": 200, "N2": 50}), ("ac_src", {"U": 220}), ("resistor", {"R": 22})], "transformer", "em", 1800,
     lambda t, page: (abs((_rx(r"U₂=U₁n₂/n₁=([\d.]+) V", t) or -1) - 55.0) <= 0.05 and abs((_rx(r"I₁=I₂n₂/n₁=([\d.]+) A", t) or -1) - 0.625) <= 0.01, "U₂=55 V，I₁=0.625 A，P₁=P₂")),
    (10, "自由搭多过程组合（斜面 + 弹簧 + 滑块）", [("incline", {"th": 30, "mu": 0.1}), ("spring", {"k": 60}), ("block", {"m": 1}), ("energy_bar", {}), ("timeline", {})], "slope-spring", "mech", 3200,
     lambda t, page: (abs((_rx(r"最大压缩 x=([\d.]+) m", t) or -1) - 0.592) <= 0.012, "下滑→压缩→回弹多过程，最大压缩 x=0.59 m（能量方程解）")),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--only", default="")
    ap.add_argument("--video", action="store_true", help="整段录屏到 e2e/out/video/sandbox-10-scenes.webm")
    args = ap.parse_args()
    only = {int(x) for x in args.only.split(",") if x}
    OUT.mkdir(exist_ok=True)
    auth = login(args.api)
    failures: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx_kw: dict = {"viewport": {"width": 1500, "height": 1000}}
        if args.video:
            (OUT / "video").mkdir(parents=True, exist_ok=True)
            ctx_kw.update(record_video_dir=str(OUT / "video" / "_tmp"), record_video_size={"width": 1500, "height": 1000})
        ctx = browser.new_context(**ctx_kw)
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{args.url}/sandbox")
        page.wait_for_selector(".sandbox .palette", timeout=15000)
        # 元件对账：目录六大类元件数
        counts = page.evaluate("() => { const t = [...document.querySelectorAll('.tabs button')]; return t.map(b => b.innerText) }")
        print(f"元件面板分类：{counts}")
        for no, name, els, family, kind, wait_ms, check in SCENARIOS:
            if only and no not in only:
                continue
            print(f"▶ {no}. {name}")
            page.evaluate("() => window.__sandbox.clear()")
            page.evaluate(f"() => window.__sandbox.setName({json.dumps(name)})")
            for i, (typ, params) in enumerate(els):
                page.evaluate(f"([t, p, i]) => window.__sandbox.add(t, p, 60 + i * 120, 80 + (i % 2) * 120)", [typ, params, i])
            rec = page.evaluate("() => window.__sandbox.recognize()")
            ok_rec = rec["family"] == family and rec["kind"] == kind
            print(f"  {'✓' if ok_rec else '✗'} 识别：{rec['title']}（family={rec['family']}，kind={rec['kind']}；期望 {family}/{kind}）")
            if not ok_rec:
                failures.append(f"{no}: 识别错误 {rec['family']}/{rec['kind']}")
            page.evaluate("() => window.__sandbox.run()")
            try:
                page.wait_for_selector(".runner", timeout=8000)
            except Exception:  # noqa: BLE001
                failures.append(f"{no}: 运行器未挂载")
                print("  ✗ 运行器未挂载")
                continue
            # 运行器内主按钮（MechScene/EMScene/组件需要点开始；电路编辑器无）
            btn = page.locator(".runner .btn:not(.alt):not(.ghost), .runner .run, .runner .primary").first
            if btn.count() and btn.is_enabled():
                btn.click()
            # 动画两帧
            anim = "n/a"
            if page.locator(STAGE).count():
                d = []
                for _ in range(2):
                    page.wait_for_timeout(400)
                    d.append(hashlib.md5(page.locator(STAGE).first.screenshot()).hexdigest()[:8])
                anim = "✓" if d[0] != d[1] else "✗静图"
                if d[0] == d[1] and kind != "circuit":
                    failures.append(f"{no}: 动画静止")
            page.wait_for_timeout(wait_ms)
            txt = page.locator(".runner").inner_text()
            ok, desc = check(txt, page)
            print(f"  {'✓' if ok else '✗'} 物理：{desc}")
            if not ok:
                failures.append(f"{no}: 物理断言失败")
            # 记录 → 数据面板
            rec_btn = page.locator(".runner .btn.alt, .runner .rec").first
            if rec_btn.count():
                rec_btn.click()
                page.wait_for_timeout(200)
            n_rec = page.evaluate("() => window.__sandbox.records().length")
            print(f"  · 动画 {anim} | 数据面板记录 {n_rec} 条 | 控制台错误 {len(errors)}")
            page.screenshot(path=str(OUT / f"sandbox-{no:02d}.png"))
        real_errors = [e for e in errors if "favicon" not in e and "ResizeObserver" not in e]
        if real_errors:
            failures.append(f"控制台错误 {len(real_errors)}：{real_errors[:3]}")
        video = page.video if args.video else None
        ctx.close()
        if video:
            import shutil
            dst = OUT / "video" / "sandbox-10-scenes.webm"
            shutil.move(video.path(), str(dst))
            shutil.rmtree(OUT / "video" / "_tmp", ignore_errors=True)
            print(f"录屏 → {dst}")
        browser.close()
    print("\n结果:", "全部通过 ✅" if not failures else f"失败 {len(failures)} 项：\n  " + "\n  ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
