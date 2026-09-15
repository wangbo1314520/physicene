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
}

ALL_IDS = list(KEYWORDS.keys())

# 动画正确性断言：点主按钮后间隔 400ms 采两帧舞台画布，必须不同（防止“动画是一张静图”）。
ANIMATED_IDS = {
    "bx3-induction-condition", "bx3-emf-factors", "bx3-lenz-law", "xb2-ampere-force",
    "xb2-lorentz-demo", "xb2-particle-bfield", "xb2-transformer", "xb3-brownian", "xb3-alpha-scatter",
    "bx1-action-reaction", "bx1-conical-pendulum", "bx2-centripetal", "bx1-newton-tube",
    "bx2-work-velocity", "xb3-gas-isotherm", "bx1-galileo-ramp", "xb2-em-oscillation",
    "bx2-circular-life", "bx2-motion-composition", "bx1-inertia", "bx2-energy", "gk-board-block", "gk-projectile-loop", "gk-accel-selector-b",
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
