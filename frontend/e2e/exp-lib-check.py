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
    "gk-rail-rod": "导轨 + 导体棒",
    "gk-rod-free": "导轨 + 导体棒",
    "gk-rod-force": "导轨 + 导体棒",
    "gk-double-rod": "导轨 + 导体棒",
    "gk-rod-capacitor": "导轨 + 导体棒",
    "gk-prism-refraction": "棱镜折射",
    "gk-wave-multi-solution": "波的多解",
    "gk-vibration-wave-graphs": "振动图像 + 波动图像",
    "gk-photoelectric-ek-nu": "光电效应 + Eₖ–ν",
    "gk-hydrogen-levels": "氢原子能级跃迁",
    "gk-volt-ammeter-resistance": "伏安法测电阻",
    "gk-meter-conversion": "电表改装",
    "gk-oblique-projectile": "斜抛运动",
    "gk-weight-change": "超重与失重",
    "gk-transformer-transmission": "变压器 + 远距离输电",
    "gk-transformer-dynamic": "变压器 + 远距离输电",
    "gk-power-transmission": "变压器 + 远距离输电",
    "gk-ac-four-values": "交变电流四值",
    "gk-b-b-combo": "磁场与磁场组合",
    "gk-frame-through-b": "线框进出磁场",
    "gk-rod-incline-b": "倾斜导轨",
    "gk-liquid-seal-tube": "玻璃管液封",
    "gk-cylinder-piston": "汽缸活塞",
    "gk-variable-mass-gas": "变质量气体",
    "gk-u-tube": "U 形管",
    "gk-thin-film": "薄膜干涉",
    "gk-diffraction-vs-interference": "单缝衍射 vs 双缝干涉",
    "gk-wave-superposition": "波的叠加与干涉",
    "gk-nuclear-reaction": "核反应方程",
    "gk-bohr-collision": "玻尔模型 + 碰撞",
    "gk-matter-wave": "物质波",
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
    "gk-rail-rod", "gk-rod-free", "gk-rod-force", "gk-double-rod", "gk-rod-capacitor",
    "gk-prism-refraction", "gk-wave-multi-solution", "gk-vibration-wave-graphs", "gk-photoelectric-ek-nu", "gk-hydrogen-levels",
    "gk-volt-ammeter-resistance", "gk-meter-conversion", "gk-oblique-projectile", "gk-weight-change",
    "gk-transformer-transmission", "gk-transformer-dynamic", "gk-power-transmission", "gk-ac-four-values", "gk-b-b-combo", "gk-frame-through-b", "gk-rod-incline-b",
    "gk-liquid-seal-tube", "gk-cylinder-piston", "gk-variable-mass-gas", "gk-u-tube",
    "gk-thin-film", "gk-diffraction-vs-interference", "gk-wave-superposition",
    "gk-nuclear-reaction", "gk-bohr-collision", "gk-matter-wave",
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
    if exp_id in ("gk-rail-rod", "gk-rod-free"):
        page.wait_for_timeout(7000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"停止：x=([\d.]+) m", txt)
        x = float(m.group(1)) if m else -1.0
        ok = abs(x - 4.0) <= 0.06 and "q=" in txt
        lines.append(f"  {'✓' if ok else '✗'} 单杆无外力：停止位移 x={x} m（理论 mv₀R/(B²L²)=4.00 m），q、Q 已输出")
        if not ok:
            failures.append(f"{exp_id}: 单杆位移断言失败 {x}")
    if exp_id == "gk-rod-force":
        page.wait_for_timeout(6500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"v_m=\(F−μmg\)R/\(B²L²\)=([\d.]+)", txt)
        vm = float(m.group(1)) if m else -1.0
        ok = "达终速 99%" in txt and abs(vm - 2.0) <= 0.01
        lines.append(f"  {'✓' if ok else '✗'} 单杆恒外力：达到终速事件，v_m={vm}（理论 FR/(B²L²)=2.00 m/s）")
        if not ok:
            failures.append(f"{exp_id}: 终速断言失败 {vm}")
    if exp_id == "gk-double-rod":
        page.wait_for_timeout(5000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"共速 v=([\d.]+) m/s", txt)
        v = float(m.group(1)) if m else -1.0
        ok = abs(v - 2.0) <= 0.03 and "动量" in txt
        lines.append(f"  {'✓' if ok else '✗'} 双杆：共速 v={v} m/s（理论 m₁v₀/(m₁+m₂)=2.00），动量守恒已核对")
        if not ok:
            failures.append(f"{exp_id}: 共速断言失败 {v}")
    if exp_id == "gk-rod-capacitor":
        page.wait_for_timeout(4000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"t=2 s：v=([\d.]+) m/s", txt)
        v = float(m.group(1)) if m else -1.0
        a_th = 2 / (1 + 2 * 1)
        ok = abs(v - 2 * a_th) <= 0.03
        lines.append(f"  {'✓' if ok else '✗'} 含容单杆：t=2 s 时 v={v} m/s（理论 a·t=F/(m+CB²L²)·2={2 * a_th:.2f}）")
        if not ok:
            failures.append(f"{exp_id}: 含容匀加速断言失败 {v}")
    if exp_id == "gk-prism-refraction":
        page.wait_for_timeout(4500)
        txt = page.locator(".panel").inner_text()
        import math
        m1 = re.search(r"折射角 θ₂=([\d.]+)°", txt)
        m2 = re.search(r"偏向角 δ=([\d.]+)°", txt)
        th2 = float(m1.group(1)) if m1 else -1.0
        delta = float(m2.group(1)) if m2 else -1.0
        n, th1, A = 1.5, 40.0, 60.0
        th2_th = math.degrees(math.asin(math.sin(math.radians(th1)) / n))
        th4_th = math.degrees(math.asin(n * math.sin(math.radians(A - th2_th))))
        d_th = th1 + th4_th - A
        ok = abs(th2 - th2_th) <= 0.05 and abs(delta - d_th) <= 0.1
        lines.append(f"  {'✓' if ok else '✗'} 棱镜折射：θ₂={th2}°（理论 {th2_th:.2f}°），δ={delta}°（理论 θ₁+θ₄−A={d_th:.2f}°）")
        if not ok:
            failures.append(f"{exp_id}: 折射角/偏向角断言失败 {th2}/{delta}")
    if exp_id == "gk-wave-multi-solution":
        page.wait_for_timeout(2500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"v=([\d.]+) m/s（n=1", txt)
        v = float(m.group(1)) if m else -1.0
        ok = abs(v - 5.0) <= 0.01 and "重合" in txt
        lines.append(f"  {'✓' if ok else '✗'} 波的多解：n=1、+x 假设下 v={v} m/s（理论 (λ+Δx₀)/Δt=5.00），t=Δt 重合")
        if not ok:
            failures.append(f"{exp_id}: 多解波速断言失败 {v}")
    if exp_id == "gk-vibration-wave-graphs":
        page.wait_for_timeout(3000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"首次到达波峰 t=([\d.]+) s", txt)
        t = float(m.group(1)) if m else -1.0
        ok = abs(t - 1.0) <= 0.03 and "v=λ/T=2.00" in txt
        lines.append(f"  {'✓' if ok else '✗'} 振动+波动图像：P 首次到波峰 t={t} s（理论 T(1/4+x_P/λ)=1.00 s），v=λ/T=2.00 m/s")
        if not ok:
            failures.append(f"{exp_id}: 波峰时刻断言失败 {t}")
    if exp_id == "gk-photoelectric-ek-nu":
        page.wait_for_timeout(8500)
        txt = page.locator(".panel").inner_text()
        m1 = re.search(r"截止频率 ν₀=W₀/h=([\d.]+)", txt)
        m2 = re.search(r"拟合直线斜率=([\d.]+)", txt)
        nu0 = float(m1.group(1)) if m1 else -1.0
        k = float(m2.group(1)) if m2 else -1.0
        ok = abs(nu0 - 2.28 / 0.4136) <= 0.03 and abs(k - 0.4136) <= 0.01
        lines.append(f"  {'✓' if ok else '✗'} 光电效应：ν₀={nu0}×10¹⁴ Hz（理论 W₀/h={2.28 / 0.4136:.2f}），拟合斜率 {k}（h=0.4136）")
        if not ok:
            failures.append(f"{exp_id}: 光电效应断言失败 {nu0}/{k}")
    if exp_id == "gk-hydrogen-levels":
        page.wait_for_timeout(3000)
        txt = page.locator(".panel").inner_text()
        m1 = re.search(r"ΔE=([\d.]+) eV，λ=(\d+) nm", txt)
        dE = float(m1.group(1)) if m1 else -1.0
        lam = int(m1.group(2)) if m1 else -1
        ok = abs(dE - 1.89) <= 0.01 and abs(lam - 656) <= 2
        lines.append(f"  {'✓' if ok else '✗'} 氢原子能级：3→2 ΔE={dE} eV（理论 13.6(1/4−1/9)=1.89），λ={lam} nm（Hα 656）")
        if not ok:
            failures.append(f"{exp_id}: 能级跃迁断言失败 {dE}/{lam}")
    if exp_id == "gk-volt-ammeter-resistance":
        page.wait_for_timeout(2000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"R_测=([\d.]+) Ω", txt)
        r = float(m.group(1)) if m else -1.0
        r_th = 100 * 3000 / 3100
        ok = abs(r - r_th) <= 0.05 and "偏小" in txt
        lines.append(f"  {'✓' if ok else '✗'} 伏安法（外接）：R_测={r} Ω（理论 R_x∥R_V={r_th:.2f} Ω，偏小）")
        if not ok:
            failures.append(f"{exp_id}: 外接法读数断言失败 {r}")
    if exp_id == "gk-meter-conversion":
        page.wait_for_timeout(2000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"R_并=I_gR_g/\(I−I_g\)=([\d.]+) Ω", txt)
        r = float(m.group(1)) if m else -1.0
        r_th = 0.001 * 100 / (0.6 - 0.001)
        ok = abs(r - r_th) <= 0.002
        lines.append(f"  {'✓' if ok else '✗'} 电表改装（电流表）：R_并={r} Ω（理论 I_gR_g/(I−I_g)={r_th:.3f} Ω）")
        if not ok:
            failures.append(f"{exp_id}: 分流电阻断言失败 {r}")
    if exp_id == "gk-oblique-projectile":
        page.wait_for_timeout(3000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"θ=30° 落地：x=([\d.]+) m", txt)
        x = float(m.group(1)) if m else -1.0
        ok = abs(x - 100 * 0.8660254 / 9.8) <= 0.06
        lines.append(f"  {'✓' if ok else '✗'} 斜抛：θ=30° 射程 x={x} m（理论 v₀²sin2θ/g={100 * 0.8660254 / 9.8:.2f} m）")
        if not ok:
            failures.append(f"{exp_id}: 射程断言失败 {x}")
    if exp_id == "gk-weight-change":
        page.wait_for_timeout(3500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"N=m\(g\+a\)=([\d.]+) N", txt)
        n = float(m.group(1)) if m else -1.0
        ok = abs(n - 60 * 11.8) <= 0.5 and "N=mg=588.0" in txt
        lines.append(f"  {'✓' if ok else '✗'} 超重失重：加速上升 N={n} N（理论 m(g+a)=708.0），匀速 N=mg=588.0")
        if not ok:
            failures.append(f"{exp_id}: 视重断言失败 {n}")
    if exp_id in ("gk-transformer-transmission", "gk-power-transmission"):
        page.wait_for_timeout(1500)
        txt = page.locator(".panel").inner_text()
        m1 = re.search(r"线路电流 I=P/\(kU\)=([\d.]+) A", txt)
        m2 = re.search(r"P_损=I²r=([\d.]+) kW", txt)
        i_line = float(m1.group(1)) if m1 else -1.0
        p_loss = float(m2.group(1)) if m2 else -1.0
        ok = abs(i_line - 20.0) <= 0.05 and abs(p_loss - 2.0) <= 0.01
        lines.append(f"  {'✓' if ok else '✗'} 远距离输电：I={i_line} A（理论 P/(kU)=20.0），P_损={p_loss} kW（理论 I²r=2.00）")
        if not ok:
            failures.append(f"{exp_id}: 输电断言失败 {i_line}/{p_loss}")
    if exp_id == "gk-transformer-dynamic":
        page.wait_for_timeout(1500)
        txt = page.locator(".panel").inner_text()
        m1 = re.search(r"U₂=U₁n₂/n₁=([\d.]+) V", txt)
        m2 = re.search(r"I₁=I₂n₂/n₁=([\d.]+) A", txt)
        u2 = float(m1.group(1)) if m1 else -1.0
        i1 = float(m2.group(1)) if m2 else -1.0
        ok = abs(u2 - 55.0) <= 0.05 and abs(i1 - 0.625) <= 0.01
        lines.append(f"  {'✓' if ok else '✗'} 变压器动态：U₂={u2} V（理论 55.0），I₁={i1} A（理论 0.625）")
        if not ok:
            failures.append(f"{exp_id}: 变压器断言失败 {u2}/{i1}")
    if exp_id == "gk-ac-four-values":
        page.wait_for_timeout(1500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"E_m=NBSω=([\d.]+) V", txt)
        em = float(m.group(1)) if m else -1.0
        ok = abs(em - 31.4) <= 0.1 and "22.2" in txt
        lines.append(f"  {'✓' if ok else '✗'} 交变电流四值：E_m={em} V（理论 NBSω=31.4），有效值 22.2 V")
        if not ok:
            failures.append(f"{exp_id}: 四值断言失败 {em}")
    if exp_id == "gk-b-b-combo":
        page.wait_for_timeout(3500)
        txt = page.locator(".panel").inner_text()
        angs = [float(a) for a in re.findall(r"速度方向 (-?[\d.]+)°（都平行", txt)]
        ok = len(angs) == 5 and all(abs(a - 90) <= 1.0 for a in angs)
        lines.append(f"  {'✓' if ok else '✗'} 磁聚焦：5 条轨迹出射方向 {angs}（理论全部 90°，平行于 +y）")
        if not ok:
            failures.append(f"{exp_id}: 磁聚焦断言失败 {angs}")
    if exp_id == "gk-frame-through-b":
        page.wait_for_timeout(3000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"完全进入：v=([\d.]+) m/s", txt)
        v = float(m.group(1)) if m else -1.0
        ok = abs(v - 3.0) <= 0.03 and "q=1.000" in txt
        lines.append(f"  {'✓' if ok else '✗'} 线框进入：完全进入时 v={v} m/s（理论 v₀−B²L²a/mR=3.00），q=BLa/R=1.000 C")
        if not ok:
            failures.append(f"{exp_id}: 线框进入断言失败 {v}")
    if exp_id == "gk-rod-incline-b":
        page.wait_for_timeout(6500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"达终速 99%：v_m=([\d.]+) m/s", txt)
        vm = float(m.group(1)) if m else -1.0
        ok = abs(vm - 4.9) <= 0.01
        lines.append(f"  {'✓' if ok else '✗'} 斜面导轨：终速 v_m={vm} m/s（理论 mgR sinθ/(B²L²)=4.90）")
        if not ok:
            failures.append(f"{exp_id}: 斜面终速断言失败 {vm}")
    if exp_id in ("gk-liquid-seal-tube", "gk-cylinder-piston"):
        page.wait_for_timeout(5000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"T=360 K：L=([\d.]+) cm", txt)
        L = float(m.group(1)) if m else -1.0
        ok = abs(L - 24.0) <= 0.02
        lines.append(f"  {'✓' if ok else '✗'} 等压升温：L₂={L} cm（理论 L₁T₂/T₁=24.00 cm）")
        if not ok:
            failures.append(f"{exp_id}: 等压断言失败 {L}")
    if exp_id == "gk-variable-mass-gas":
        page.wait_for_timeout(6000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"p=p₀\(1\+nV₀/V\)=([\d.]+) p₀", txt)
        pr = float(m.group(1)) if m else -1.0
        ok = abs(pr - 1.4) <= 0.005
        lines.append(f"  {'✓' if ok else '✗'} 变质量气体：打气 8 次 p={pr} p₀（理论 1+nV₀/V=1.40）")
        if not ok:
            failures.append(f"{exp_id}: 打气断言失败 {pr}")
    if exp_id == "gk-u-tube":
        page.wait_for_timeout(5000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"左液面下降 x=([\d.]+) cm", txt)
        x = float(m.group(1)) if m else -1.0
        p1, L1, T1, T2 = 80.0, 20.0, 300.0, 360.0
        K = p1 * L1 * T2 / T1
        b, c = p1 + 2 * L1, p1 * L1 - K
        x_th = (-b + (b * b - 8 * c) ** 0.5) / 4
        ok = abs(x - x_th) <= 0.02
        lines.append(f"  {'✓' if ok else '✗'} U 形管：x={x} cm（二次方程解 {x_th:.3f} cm）")
        if not ok:
            failures.append(f"{exp_id}: U 形管断言失败 {x} vs {x_th:.3f}")
    if exp_id == "gk-thin-film":
        page.wait_for_timeout(1500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"条纹间距 Δx=λ/\(2nα\)=([\d.]+) mm", txt)
        dx = float(m.group(1)) if m else -1.0
        ok = abs(dx - 1.5) <= 0.01
        lines.append(f"  {'✓' if ok else '✗'} 薄膜干涉：Δx={dx} mm（理论 λ/(2nα)=1.50 mm）")
        if not ok:
            failures.append(f"{exp_id}: 条纹间距断言失败 {dx}")
    if exp_id == "gk-diffraction-vs-interference":
        page.wait_for_timeout(2500)
        txt = page.locator(".panel").inner_text()
        m1 = re.search(r"双缝 Δx=Lλ/d=([\d.]+) mm", txt)
        m2 = re.search(r"2Lλ/a=([\d.]+) mm", txt)
        dx = float(m1.group(1)) if m1 else -1.0
        wc = float(m2.group(1)) if m2 else -1.0
        ok = abs(dx - 3.0) <= 0.01 and abs(wc - 24.0) <= 0.01
        lines.append(f"  {'✓' if ok else '✗'} 单缝 vs 双缝：Δx={dx} mm（3.00），中央宽 {wc} mm（24.00）")
        if not ok:
            failures.append(f"{exp_id}: 条纹公式断言失败 {dx}/{wc}")
    if exp_id == "gk-wave-superposition":
        page.wait_for_timeout(3000)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"Δr=([\d.]+) m = ([\d.]+) λ → (\S+)", txt)
        dr = float(m.group(1)) if m else -1.0
        kind = m.group(3) if m else ""
        ok = abs(dr - 2.0) <= 0.01 and kind.startswith("振动加强")
        lines.append(f"  {'✓' if ok else '✗'} 波的叠加：P(1,0) Δr={dr} m = λ → {kind}")
        if not ok:
            failures.append(f"{exp_id}: 干涉判据断言失败 {dr}/{kind}")
    if exp_id == "gk-nuclear-reaction":
        page.wait_for_timeout(1500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"ΔE=([\d.]+) MeV", txt)
        de = float(m.group(1)) if m else -1.0
        de_th = (2.014102 + 3.016049 - 4.002602 - 1.008665) * 931.494
        ok = abs(de - de_th) <= 0.02 and "守恒" in txt
        lines.append(f"  {'✓' if ok else '✗'} 核反应（D+T）：ΔE={de} MeV（理论 Δmc²={de_th:.2f} MeV），A/Z 守恒")
        if not ok:
            failures.append(f"{exp_id}: 质量亏损断言失败 {de}")
    if exp_id == "gk-bohr-collision":
        page.wait_for_timeout(3000)
        txt = page.locator(".panel").inner_text()
        m1 = re.search(r"最高激发到 n=(\d)", txt)
        m2 = re.search(r"电子剩余 ([\d.]+) eV", txt)
        n = int(m1.group(1)) if m1 else -1
        rem = float(m2.group(1)) if m2 else -1.0
        ok = n == 3 and abs(rem - (12.5 - 13.6 * (1 - 1 / 9))) <= 0.01 and "C(3,2)=3" in txt
        lines.append(f"  {'✓' if ok else '✗'} 玻尔碰撞：12.5 eV 电子激发到 n={n}（理论 3），剩余 {rem} eV（理论 0.41），退激发 3 种光子")
        if not ok:
            failures.append(f"{exp_id}: 激发断言失败 {n}/{rem}")
    if exp_id == "gk-matter-wave":
        page.wait_for_timeout(1500)
        txt = page.locator(".panel").inner_text()
        m = re.search(r"λ=h/√\(2mqU\)=([\d.]+) nm", txt)
        lam = float(m.group(1)) if m else -1.0
        lam_th = 6.626e-34 / (2 * 9.109e-31 * 1.602e-19 * 100) ** 0.5 * 1e9
        ok = abs(lam - lam_th) <= 0.0005
        lines.append(f"  {'✓' if ok else '✗'} 物质波：电子 100 V λ={lam} nm（理论 {lam_th:.4f} nm=1.226/√U）")
        if not ok:
            failures.append(f"{exp_id}: 德布罗意波长断言失败 {lam}")
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
