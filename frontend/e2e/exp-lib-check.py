"""实验库（/exp/:id）无头 E2E：登录 → 逐个打开实验 → 断言仪器画布/内容与标题一致/动画多帧变化/按钮交互/控制台无错误。
用法（Vite dev + Java 8080 已启动）：
  set PLAYWRIGHT_BROWSERS_PATH=E:\\Program\\playwright-browsers
  python frontend/e2e/exp-lib-check.py [--ids a,b,c] [--url http://localhost:5173]
截图输出到 frontend/e2e/out/exp-<id>.png
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)

# 内容一致性断言：页面 h3 面板标题必须包含关键词（防止“标题是 A、内容是 B”的错位）。
# None = dyn4j 预设类，无面板标题，仅做画布断言。
KEYWORDS = {
    "bx1-inertia": None, "bx1-f-ma": None, "bx2-energy": None,
    "bx3-coulomb-repulsion": None, "bx3-coulomb-attraction": None,
    "xb1-momentum-conservation": None,
    "bx3-emf-internal": "电动势和内阻",
    "bx1-hooke": "弹簧悬挂法",
    "xb3-photoelectric": "遏止电压",
    "bx1-force-composition": "力的合成",
    "bx2-projectile": "平抛运动",
    "xb1-double-slit": "双缝干涉",
    "xb3-oil-film": "油膜法",
    "bx1-timer-practice": "打点计时器",
    "bx1-tape-velocity": "瞬时速度",
    "bx1-trolley-vt": "小车速度随时间变化",
    "bx1-freefall-timer": "自由落体",
    "bx2-centripetal": "圆锥摆",
    "bx2-work-velocity": "功与速度",
    "bx3-capacitor-charge": "电容器",
    "bx3-resistivity": "电阻率",
    "bx3-multimeter": "多用电表",
    "xb1-pendulum-g": "单摆测 g",
    "xb1-refraction": "折射率",
    "xb3-gas-isotherm": "等温变化",
    "bx1-newton-tube": "牛顿管",
    "bx1-static-friction": "静摩擦力",
    "bx1-action-reaction": "作用力与反作用力",
    "bx1-conical-pendulum": "圆锥摆",
    "bx3-coulomb-balance": "库仑扭秤",
    "bx3-induction-condition": "感应电流产生的条件",
    "bx3-emf-factors": "感应电动势的大小",
    "bx3-lenz-law": "楞次定律",
    "xb1-wave-interference": "波的干涉",
    "xb1-light-phenomena": "偏振",
    "xb2-ampere-force": "安培力方向",
    "xb2-lorentz-demo": "匀强磁场",
    "xb2-particle-bfield": "匀强磁场",
    "xb2-transformer": "变压器",
    "xb2-self-induction": "自感现象",
    "xb2-lc-ac": "电感器和电容器",
    "xb3-brownian": "布朗运动",
    "xb3-alpha-scatter": "α粒子散射",
    "bx1-reaction-time": "反应时间",
    "bx1-galileo-ramp": "伽利略斜面",
    "bx1-center-of-gravity": "重心",
    "bx1-mirror-deformation": "微小形变",
    "bx2-circular-life": "圆周运动",
    "bx2-motion-composition": "运动的合成与分解",
    "bx3-static-phenomena": "静电现象",
    "bx3-field-lines-model": "电场线",
    "bx3-particle-accel": "示波管",
    "xb1-total-reflection": "全反射",
    "xb2-em-oscillation": "电磁振荡",
    "xb2-sensor-control": "光控路灯",
    # 高考/竞赛层（layer: gaokao，独立目录 /gaokao；不计入教材 55 卡）
    "gk-board-block": "板块模型",
    "gk-projectile-loop": "竖直圆周",
    "gk-accel-selector-b": "速度筛选器",
    "gk-slope-spring": "斜面 + 弹簧",
    "gk-conveyor-board": "传送带",
    "gk-connected-bodies": "连接体",
    "gk-collision-spring": "碰撞 + 弹簧",
    "gk-circular-critical": "竖直圆周临界",
    "gk-collision-chain": "碰撞链",
    "gk-isochrone": "等时圆",
    "gk-clothesline": "晾衣绳",
    "gk-multistage": "多过程直线运动",
    "gk-impulse-micro": "动量定理 + 微元法",
    "gk-accel-deflect-screen": "偏转电场",
    "gk-b-then-e": "磁场 → 电场",
    "gk-m21-whole-isolate": "整体法",
    "gk-m28-circular-five": "内轨",
    "gk-m29-collision-spring": "碰撞 + 弹簧",
    "gk-m30-conveyor-board": "传送带 + 板块",
    "gk-velocity-selector": "速度选择器",
    "gk-mass-spectrometer": "质谱仪",
    "gk-e-b-e-multi": "电场 → 磁场 → 电场",
    "gk-composite-field": "复合场",
    "gk-cyclotron": "回旋加速器",
}

ALL_IDS = list(KEYWORDS.keys())

# 动画正确性断言：点主按钮后间隔 400ms 采两帧舞台画布，必须不同（防止“动画是一张静图”）。
ANIMATED_IDS = {
    "bx3-induction-condition", "bx3-emf-factors", "bx3-lenz-law", "xb2-ampere-force",
    "xb2-lorentz-demo", "xb2-particle-bfield", "xb2-transformer", "xb3-brownian", "xb3-alpha-scatter",
    "bx1-action-reaction", "bx1-conical-pendulum", "bx2-centripetal", "bx1-newton-tube",
    "bx2-work-velocity", "xb3-gas-isotherm", "bx1-galileo-ramp", "xb2-em-oscillation",
    "bx2-circular-life", "bx2-motion-composition", "bx1-inertia", "bx2-energy", "gk-board-block", "gk-projectile-loop", "gk-accel-selector-b", "gk-slope-spring", "gk-conveyor-board", "gk-connected-bodies", "gk-collision-spring", "gk-circular-critical", "gk-collision-chain",
    "gk-isochrone", "gk-clothesline", "gk-multistage", "gk-impulse-micro",
    "gk-accel-deflect-screen", "gk-b-then-e",
    "gk-m21-whole-isolate", "gk-m28-circular-five", "gk-m29-collision-spring", "gk-m30-conveyor-board",
    "gk-velocity-selector", "gk-mass-spectrometer", "gk-e-b-e-multi", "gk-composite-field", "gk-cyclotron",
}
STAGE_SEL = ".lab canvas, .exp canvas:not(.hist), .alt-stage canvas, .sim25d canvas, .clab canvas"

ALPHA_ELEMENTS = ["① α粒子源", "② 准直狭缝", "③ 金箔", "④ 环形荧光屏", "⑤ 散射轨迹", "⑥ 散射角量角器", "⑦ 原子核"]


def extra_checks(exp_id: str, page, failures: list[str]) -> list[str]:
    """按实验的专项断言（元件对账 / 物理量），返回描述行"""
    import re
    lines: list[str] = []
    if exp_id == "xb3-alpha-scatter":
        body = page.locator("body").inner_text()
        missing = [e for e in ALPHA_ELEMENTS if e not in body]
        ok = not missing
        lines.append(f"  {'✓' if ok else '✗'} α散射 7 类元件对账 {'齐全' if ok else '缺 ' + str(missing)}")
        if not ok:
            failures.append(f"{exp_id}: 元件缺失 {missing}")
        page.wait_for_timeout(3500)
        m = re.search(r"已发射 (\d+)/(\d+)", page.locator(".panel .result").inner_text())
        emitted, total = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
        ok2 = total > 10 and emitted > 10
        lines.append(f"  {'✓' if ok2 else '✗'} 轨迹数 > 10 且已逐个发射（{emitted}/{total}）")
        if not ok2:
            failures.append(f"{exp_id}: 轨迹/发射数不足 {emitted}/{total}")
    if exp_id == "gk-board-block":
        page.wait_for_timeout(2500)
        txt = page.locator(".panel").inner_text()
        ok = "共速" in txt and "相对位移" in txt
        lines.append(f"  {'✓' if ok else '✗'} 板块模型：运行后出现共速事件与理论对照")
        if not ok:
            failures.append(f"{exp_id}: 未出现共速事件")
    if exp_id == "gk-isochrone":
        page.wait_for_timeout(2500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"到达时刻实测：([\d.]+(?: , [\d.]+)*) s", txt)
        ts = [float(x) for x in m.group(1).split(" , ")] if m else []
        t_th = (4 * 0.8 / 9.8) ** 0.5
        ok = len(ts) >= 5 and max(ts) - min(ts) <= 0.02 and abs(sum(ts) / len(ts) - t_th) <= 0.03 and "对照轨到达" in txt
        lines.append(f"  {'✓' if ok else '✗'} 等时圆：{len(ts)} 球到达时刻 {ts}，理论 √(4R/g)={t_th:.3f} s，对照轨迟到")
        if not ok:
            failures.append(f"{exp_id}: 等时性断言失败 {ts}")
    if exp_id == "gk-clothesline":
        page.wait_for_timeout(8000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"T 恒为 ([\d.]+) N", txt)
        t_meas = float(m.group(1)) if m else -1.0
        d, L, mg = 0.8 * 2.0, 2.0, 2 * 9.8
        t_th = mg * L / (2 * (L * L - d * d) ** 0.5)
        ok = "与杆高无关" in txt and abs(t_meas - t_th) <= 0.3
        lines.append(f"  {'✓' if ok else '✗'} 晾衣绳：降杆阶段 T 恒为 {t_meas} N（理论 mgL/2√(L²−d²)={t_th:.2f} N），与杆高无关")
        if not ok:
            failures.append(f"{exp_id}: 张力断言失败 {t_meas} vs {t_th:.2f}")
    if exp_id == "gk-multistage":
        page.wait_for_timeout(6500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"停止：总位移 x=([\d.]+) m", txt)
        x = float(m.group(1)) if m else -1.0
        ok = abs(x - 15.2) <= 0.15
        lines.append(f"  {'✓' if ok else '✗'} 多过程直线运动：停止时总位移 {x} m（理论 ½a₁t₁²+v_max·t₂+v_max²/2a₂=15.20 m）")
        if not ok:
            failures.append(f"{exp_id}: 总位移断言失败 {x}")
    if exp_id == "gk-impulse-micro":
        page.wait_for_timeout(4000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"Δp=m·Δv=([\d.]+)", txt)
        dp = float(m.group(1)) if m else -1.0
        i_th = 2 * 20 * 2 / 3.141592653589793
        ok = abs(dp - i_th) <= 0.3 and "解析 I=∫Fdt=" in txt
        lines.append(f"  {'✓' if ok else '✗'} 动量定理：Δp={dp} kg·m/s vs 解析冲量 2F₀T/π={i_th:.2f} N·s，微元误差行已输出")
        if not ok:
            failures.append(f"{exp_id}: 动量定理断言失败 {dp} vs {i_th:.2f}")
    if exp_id == "gk-accel-deflect-screen":
        page.wait_for_timeout(6500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"打到荧光屏：Y=(-?[\d.]+) m", txt)
        y = float(m.group(1)) if m else -99.0
        u1, u2, L, D, d = 10, 2, 4, 4, 2
        y_th = (u2 * L / (2 * d * u1)) * (L / 2 + D)
        ok = abs(y - y_th) <= 0.06
        lines.append(f"  {'✓' if ok else '✗'} 偏转电场荧光屏：Y={y} m（理论 (U₂L/2dU₁)(L/2+D)={y_th:.2f} m）")
        if not ok:
            failures.append(f"{exp_id}: 屏上侧移断言失败 {y} vs {y_th:.2f}")
    if exp_id == "gk-b-then-e":
        page.wait_for_timeout(5500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"打到屏：y=(-?[\d.]+) m", txt)
        y = float(m.group(1)) if m else -99.0
        v, B, E, W, y0 = 8.0, 0.6, 3.0, 8.0, -3.0
        r = v / B
        sin_t = W / r
        cos_t = (1 - sin_t ** 2) ** 0.5
        t_e = 8.0 / (v * cos_t)
        y_th = y0 + r * (1 - cos_t) + v * sin_t * t_e - 0.5 * E * t_e ** 2
        ok = abs(y - y_th) <= 0.1 and "穿出磁场" in txt
        lines.append(f"  {'✓' if ok else '✗'} 磁场→电场：屏上 y={y} m（理论 {y_th:.2f} m，r={r:.2f}>W 穿出 θ={__import__('math').degrees(__import__('math').asin(sin_t)):.1f}°）")
        if not ok:
            failures.append(f"{exp_id}: 组合场落点断言失败 {y} vs {y_th:.2f}")
    if exp_id == "gk-velocity-selector":
        page.wait_for_timeout(5500)
        txt = page.locator(".panel").inner_text()
        ok = "直线通过出口狭缝 ✓" in txt and "撞上极板" in txt and "撞下极板" in txt
        lines.append(f"  {'✓' if ok else '✗'} 速度选择器：v=E/B 直线通过，0.7v 撞下板（电场力侧）、1.3v 撞上板（洛伦兹力侧）")
        if not ok:
            failures.append(f"{exp_id}: 三粒子结果断言失败")
    if exp_id == "gk-mass-spectrometer":
        page.wait_for_timeout(8500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"谱线间距 Δx=([\d.]+) m", txt)
        dx = float(m.group(1)) if m else -1.0
        U, B, q, m1, m2 = 10, 1, 1, 1, 1.3
        dx_th = 2 * ((2 * m2 * U / q) ** 0.5 - (2 * m1 * U / q) ** 0.5) / B
        ok = abs(dx - dx_th) <= 0.05
        lines.append(f"  {'✓' if ok else '✗'} 质谱仪：谱线间距 Δx={dx} m（理论 (2/B)√(2U/q)(√m₂−√m₁)={dx_th:.2f} m）")
        if not ok:
            failures.append(f"{exp_id}: 谱线间距断言失败 {dx} vs {dx_th:.2f}")
    if exp_id == "gk-e-b-e-multi":
        page.wait_for_timeout(4500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"回到电场区，y=([\d.]+) m", txt)
        y = float(m.group(1)) if m else -1.0
        r_th = (2 * 8) ** 0.5 / 1.5
        ok = abs(y - 2 * r_th) <= 0.1
        lines.append(f"  {'✓' if ok else '✗'} 电→磁→电：首个半圆后上移 y={y} m（理论 2r=2·√(2qU/m)/(qB/m)={2 * r_th:.2f} m）")
        if not ok:
            failures.append(f"{exp_id}: 半圆上移断言失败 {y} vs {2 * r_th:.2f}")
    if exp_id == "gk-composite-field":
        page.wait_for_timeout(8000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"完成第 1 周：T=([\d.]+) s", txt)
        T = float(m.group(1)) if m else -1.0
        T_th = 2 * 3.141592653589793 / (1 * 2)
        ok = abs(T - T_th) <= 0.05
        lines.append(f"  {'✓' if ok else '✗'} 复合场（qE=mg 匀速圆周）：实测周期 T={T} s（理论 2πm/(qB)={T_th:.3f} s）")
        if not ok:
            failures.append(f"{exp_id}: 圆周周期断言失败 {T} vs {T_th:.3f}")
    if exp_id == "gk-cyclotron":
        page.wait_for_timeout(7500)
        txt = page.locator(".panel").inner_text()
        m1 = re.search(r"引出：E_k=([\d.]+)", txt)
        m2 = re.search(r"穿越 (\d+) 次", txt)
        ek = float(m1.group(1)) if m1 else -1.0
        n = int(m2.group(1)) if m2 else -1
        ek_th = 0.5 * (1 * 1 * 6) ** 2
        ok = abs(ek - ek_th) <= 0.6 and n == 9
        lines.append(f"  {'✓' if ok else '✗'} 回旋加速器：引出 E_k={ek}（理论 q²B²R²/2m={ek_th:.2f}），穿越 {n} 次（理论 N=E_k/qU=9）")
        if not ok:
            failures.append(f"{exp_id}: 引出能量/穿越次数断言失败 {ek}/{n}")
    return lines


def login(api_base: str) -> dict:
    req = urllib.request.Request(
        f"{api_base}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = json.loads(r.read().decode())
    if body.get("code") != 0:
        raise SystemExit(f"登录失败: {body}")
    return body["data"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--ids", default=",".join(ALL_IDS))
    args = ap.parse_args()
    ids = [s.strip() for s in args.ids.split(",") if s.strip()]

    auth = login(args.api)
    failures: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1500, "height": 900})
        ctx.add_init_script(
            f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))

        for exp_id in ids:
            errors.clear()
            print(f"▶ {exp_id}")
            page.goto(f"{args.url}/exp/{exp_id}")
            try:
                page.wait_for_selector(".lab canvas, .exp canvas:not(.hist), .alt-stage canvas, .sim25d canvas, .clab canvas", timeout=12000)
            except Exception:
                failures.append(f"{exp_id}: 未找到仪器画布")
                page.screenshot(path=str(OUT / f"exp-{exp_id}.png"))
                print("  ✗ 未找到仪器画布")
                continue
            page.wait_for_timeout(700)
            canvases = page.locator(".lab canvas, .exp canvas:not(.hist), .alt-stage canvas, .sim25d canvas, .clab canvas").count()
            # 内容一致性：面板 h3 标题必须包含本实验关键词
            headings = page.evaluate(
                "Array.from(document.querySelectorAll('h3'))"
                ".map(e => e.textContent.trim()).filter(Boolean).join(' | ')")
            kw = KEYWORDS.get(exp_id, "")
            content_ok = True
            if kw and kw not in headings:
                content_ok = False
                failures.append(f"{exp_id}: 内容与标题不符——面板标题为「{headings[:80]}」，缺少关键词「{kw}」")
            # 主动作按钮（第一个非 alt/ghost 的 .btn 或 .run）
            main_btn = page.locator(".panel .btn:not(.alt):not(.ghost), .panel .run, .panel > button:not(.rec):not(.btn), .sim25d .primary").first
            clicked_main = False
            anim_ok = True
            if main_btn.count() and main_btn.is_enabled():
                main_btn.click()
                clicked_main = True
                if exp_id in ANIMATED_IDS:
                    stage = page.locator(STAGE_SEL).first
                    page.wait_for_timeout(250)
                    frame_a = stage.screenshot()
                    page.wait_for_timeout(400)
                    frame_b = stage.screenshot()
                    anim_ok = frame_a != frame_b
                    if not anim_ok:
                        failures.append(f"{exp_id}: 动画静止——主按钮后间隔 400ms 两帧完全相同")
                    page.wait_for_timeout(550)
                else:
                    page.wait_for_timeout(1200)
            rec_btn = page.locator(".panel .btn.alt, .panel .rec").first
            clicked_rec = False
            if rec_btn.count() and rec_btn.is_enabled():
                rec_btn.click()
                clicked_rec = True
                page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / f"exp-{exp_id}.png"))
            for line in extra_checks(exp_id, page, failures):
                print(line)
            real_errors = [e for e in errors if "favicon" not in e]
            ok = canvases >= 1 and not real_errors and content_ok and anim_ok
            anim_txt = ("动画✓" if anim_ok else "动画静止!") if exp_id in ANIMATED_IDS else "动画n/a"
            print(f"  {'✓' if ok else '✗'} 画布 {canvases} 个 | 内容{'一致' if content_ok else '不符!'} | {anim_txt} | 主按钮{'已点' if clicked_main else '无/禁用'} | 记录{'已点' if clicked_rec else '无/禁用'} | 控制台错误 {len(real_errors)}")
            for e in real_errors[:3]:
                print("     ", e[:180])
            if canvases < 1 or real_errors:
                failures.append(f"{exp_id}: 画布={canvases} 错误={len(real_errors)}")
        browser.close()

    print("\n结果:", "全部通过 ✅" if not failures else f"失败 {len(failures)} 项：" + "; ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
