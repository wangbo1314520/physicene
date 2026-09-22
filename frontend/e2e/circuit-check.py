"""电路正确性 E2E（P0-2 验收项）：通过 DEV 钩子 window.__circuitEditor 脚本化搭电路，
断言：正确接法读数与理论一致 / 判分通过 / 典型错接被故障检测抓住 / 暂态回放画布两帧不同。
  python -u frontend/e2e/circuit-check.py [--url http://localhost:5173] [--ids a,b]
"""
import _env; _env.banner()  # 测点1前置：每轮回归头行打印环境指纹
import argparse
import json
import math
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)
STAGE = ".clab .board canvas"


def login(api_base: str) -> dict:
    req = urllib.request.Request(f"{api_base}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = json.loads(r.read().decode())
    if body.get("code") != 0:
        raise SystemExit(f"登录失败: {body}")
    return body["data"]


def ed(page: Page, js: str):
    """多条语句用 ; 分隔，最后一条作为返回值"""
    stmts = [s.strip() for s in js.split(";") if s.strip()]
    body = "; ".join(stmts[:-1]) + ("; " if len(stmts) > 1 else "") + "return " + stmts[-1]
    return page.evaluate(f"(() => {{ const e = window.__circuitEditor; {body}; }})()")


def settle(page: Page, ms=150):
    page.wait_for_timeout(ms)


def errors(page: Page) -> list[str]:
    return ed(page, "e.faults().filter(f => f.severity === 'error').map(f => f.code)")


def readings(page: Page) -> dict:
    return {m["compId"]: m for m in ed(page, "e.readings()")}


def two_frames_differ(page: Page, gap_ms=400) -> bool:
    st = page.locator(STAGE).first
    a = st.screenshot(); page.wait_for_timeout(gap_ms); b = st.screenshot()
    return a != b


def set_range(page: Page, selector: str, value: float):
    page.evaluate("([s, v]) => { const el = document.querySelector(s); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); }", [selector, value])


# ───────────── 用例 ─────────────
def case_emf(page: Page, log):
    ed(page, "e.clearAll()")
    for k, i in [("battery", "E"), ("voltmeter", "V"), ("ammeter", "A"), ("rheostat", "Rh"), ("switch", "S")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {{}}, '{i}')")
    ed(page, "e.setProps('S', { closed: true }); e.setProps('Rh', { pos: 0.3 })")
    # 错接：电流表并联电池 → 必须被抓住
    ed(page, "e.connect('A:0','E:0'); e.connect('A:1','E:1')"); settle(page)
    errs = errors(page)
    log("错接电流表并联电源", "ammeter_parallel" in errs or "short" in errs, f"faults={errs}")
    ed(page, "e.clearAll()")
    for k, i in [("battery", "E"), ("voltmeter", "V"), ("ammeter", "A"), ("rheostat", "Rh"), ("switch", "S")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {{}}, '{i}')")
    ed(page, "e.setProps('S', { closed: true }); e.setProps('Rh', { pos: 0.3 })")
    for a, b in [("E:0", "V:0"), ("E:1", "V:1"), ("E:0", "S:0"), ("S:1", "A:0"), ("A:1", "Rh:0"), ("Rh:2", "E:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    settle(page)
    rd = readings(page)
    I, U = rd["A"]["value"], rd["V"]["value"]
    log("伏安法读数满足 U = E − I·r", abs(U - (1.5 - I * 1.0)) < 0.01 and I > 0.1, f"I={I:.4f} U={U:.4f}")
    log("正确接法无 error 故障", not errors(page), f"faults={errors(page)}")
    g = ed(page, "e.doGrade()")
    log("判分通过", g["passed"] and g["score"] == g["max"], f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    for pos in (0.2, 0.4, 0.6, 0.8, 1.0):
        ed(page, f"e.setProps('Rh', {{ pos: {pos} }})"); settle(page)
        page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first.click(); settle(page, 80)
    txt = page.locator(".clab .panel").inner_text()
    import re
    m = re.search(r"E = ([\d.]+) V", txt); r = re.search(r"r = ([\d.]+) Ω", txt)
    log("坐标纸拟合 E≈1.5V、r≈1Ω", bool(m and r) and abs(float(m.group(1)) - 1.5) < 0.02 and abs(float(r.group(1)) - 1.0) < 0.05,
        f"E={m.group(1) if m else '?'} r={r.group(1) if r else '?'}")


def case_resistivity(page: Page, log):
    ed(page, "e.clearAll()")
    for k, i in [("dc_source", "E"), ("switch", "S"), ("ammeter", "A"), ("voltmeter", "V"), ("rheostat", "Rh"), ("wire_sample", "Rx")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {{}}, '{i}')")
    ed(page, "e.setProps('S', { closed: true }); e.setProps('Rh', { pos: 0.5 })")
    for a, b in [("E:0", "S:0"), ("S:1", "A:0"), ("A:1", "Rh:0"), ("Rh:2", "Rx:0"), ("Rx:1", "E:1"), ("V:0", "Rx:0"), ("V:1", "Rx:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    settle(page)
    rd = readings(page)
    R_true = 1.1e-6 * 0.5 / (math.pi * (0.25e-3) ** 2)
    R_meas = rd["V"]["value"] / rd["A"]["value"]
    log("外接法 R=U/I 与真值一致（偏小 <0.2%）", abs(R_meas / R_true - 1) < 0.002, f"R={R_meas:.4f} true={R_true:.4f}")
    g = ed(page, "e.doGrade()")
    log("判分通过", g["passed"], f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    for pos in (0.5, 0.7, 0.9):
        ed(page, f"e.setProps('Rh', {{ pos: {pos} }})"); settle(page)
        page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first.click(); settle(page, 80)
    import re
    txt = page.locator(".clab .panel").inner_text()
    m = re.search(r"误差 ([\d.]+)%", txt)
    log("ρ 计算误差 <1%", bool(m) and float(m.group(1)) < 1.0, f"{m.group(0) if m else txt[:80]}")


def case_multimeter(page: Page, log):
    rx = ed(page, "e.circuit.components.find(c => c.id === 'Rx').props.R")
    ed(page, "e.addComponent('multimeter', 200, 120, { mode: 'ohm', rangeKey: '×100' }, 'M')")
    ed(page, "e.connect('M:0','Rx:0'); e.connect('M:1','Rx:1')"); settle(page)
    rd = readings(page)
    log("欧姆挡读数 = 未知电阻真值", abs(rd["M"]["value"] / rx - 1) < 0.01, f"read={rd['M']['value']:.1f} true={rx}")
    log("断电单独测无 error", not errors(page), f"{errors(page)}")
    ed(page, "e.addComponent('battery', 420, 260, {}, 'E'); e.connect('E:0','Rx:0'); e.connect('E:1','Rx:1')"); settle(page)
    log("带电测电阻被抓住", "ohm_live_circuit" in errors(page), f"{errors(page)}")
    ed(page, "e.removeComponent('E'); e.addComponent('diode', 420, 260, {}, 'D'); e.removeComponent('M')")
    ed(page, "e.addComponent('multimeter', 200, 120, { mode: 'ohm', rangeKey: '×100' }, 'M'); e.connect('M:1','D:0'); e.connect('M:0','D:1')"); settle(page)
    fwd = readings(page)["M"]["value"]
    ed(page, "e.removeComponent('M'); e.addComponent('multimeter', 200, 120, { mode: 'ohm', rangeKey: '×100' }, 'M'); e.connect('M:0','D:0'); e.connect('M:1','D:1')"); settle(page)
    rev = readings(page)["M"]["value"]
    log("二极管：黑笔接阳极小阻值，红笔接阳极极大", fwd < 2000 and (rev > 1e5 or rev == float('inf')), f"fwd={fwd:.0f} rev={rev}")


def case_capacitor(page: Page, log):
    ed(page, "e.clearAll()")
    for k, i, p in [("dc_source", "E", "{}"), ("spdt_switch", "K", "{}"), ("resistor", "R", "{ R: 2000 }"), ("capacitor", "C", "{ C: 1000e-6 }"),
                    ("galvanometer", "G", "{ rangeKey: '3mA' }"), ("voltmeter", "V", "{ rangeKey: '15V' }")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {p}, '{i}')")
    for a, b in [("K:1", "E:0"), ("K:2", "E:1"), ("K:0", "R:0"), ("R:1", "G:0"), ("G:1", "C:0"), ("C:1", "E:1"), ("V:0", "C:0"), ("V:1", "C:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    ed(page, "e.setProps('K', { pos: 1 })")   # 学生把 K 拨到充电位
    settle(page)
    g = ed(page, "e.doGrade()")
    log("RC 判分：元件齐全、电压表并联电容", g["passed"], f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first.click(); settle(page, 300)
    log("充电回放中画布两帧不同（电流计摆动）", two_frames_differ(page), "")
    import re
    txt = page.locator(".clab .panel").inner_text()
    m = re.search(r"充电实测 τ\(63\.2%\) = ([\d.]+) s", txt)
    tau_eff = 1000e-6 * (2000 * 15000 / 17000)   # 电压表 15kΩ 并联电容 → τ' = C·(R∥R_V)
    log("实测 τ ≈ C·(R∥R_V)=1.765 s（电压表分流）", bool(m) and abs(float(m.group(1)) / tau_eff - 1) < 0.05, f"{m.group(0) if m else txt[:60]}")


def case_self_induction(page: Page, log):
    ed(page, "e.clearAll()")
    for k, i, p in [("dc_source", "E", "{}"), ("switch", "S", "{}"), ("inductor", "L", "{ L: 2, rw: 2 }"), ("lamp", "A", "{}"), ("lamp", "B", "{}"), ("rheostat", "Rh", "{ Rmax: 20, pos: 0.4 }")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {p}, '{i}')")
    for a, b in [("E:0", "S:0"), ("S:1", "L:0"), ("L:1", "A:0"), ("A:1", "E:1"), ("S:1", "Rh:0"), ("Rh:2", "B:0"), ("B:1", "E:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    ed(page, "e.setProps('S', { closed: true })"); settle(page)
    g = ed(page, "e.doGrade()")
    log("双灯并联电路判分通过", g["passed"], f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first.click(); settle(page, 300)
    log("通电自感回放两帧不同", two_frames_differ(page), "")
    import re
    txt = page.locator(".clab .panel").inner_text()
    th = re.search(r"理论 τ = .*?= ([\d.]+) s", txt); me = re.search(r"实测 τ.*?= ([\d.]+) s", txt)
    log("实测 τ 与理论一致（<10%）", bool(th and me) and abs(float(me.group(1)) / float(th.group(1)) - 1) < 0.1,
        f"theory={th.group(1) if th else '?'} meas={me.group(1) if me else '?'}")


def case_lc_ac(page: Page, log):
    ed(page, "e.clearAll()")
    for k, i, p in [("ac_source", "G", "{ vrms: 3, freq: 50, r: 0 }"), ("switch", "S", "{ closed: true }"), ("lamp", "La", "{}"), ("inductor", "L", "{ L: 0.05, rw: 0 }")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {p}, '{i}')")
    for a, b in [("G:0", "S:0"), ("S:1", "La:0"), ("La:1", "L:0"), ("L:1", "G:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    settle(page)
    i50 = ed(page, "e.acSolution().elements['La'].iRms")
    R = 2.5 / 0.3
    log("50Hz 串电感电流 = U/√(R²+X_L²)", abs(i50 - 3 / math.hypot(R, 2 * math.pi * 50 * 0.05)) < 0.002, f"I={i50:.4f}")
    set_range(page, ".clab .panel input[type=range]", math.log10(500)); settle(page, 250)
    i500 = ed(page, "e.acSolution().elements['La'].iRms")
    log("频率升到 500Hz 电流下降（感抗增大）", i500 < i50 * 0.6, f"I500={i500:.4f} I50={i50:.4f}")
    g = ed(page, "e.doGrade()")
    log("交流回路判分通过（用有效值验证串联）", g["passed"], f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    log("交流下电流点动画两帧不同", two_frames_differ(page), "")


def first_row(page: Page) -> str:
    return page.locator(".clab table.rows tr").nth(1).inner_text()


def case_em_oscillation(page: Page, log):
    ed(page, "e.clearAll()")
    for k, i, p in [("dc_source", "E", "{}"), ("spdt_switch", "K", "{}"), ("capacitor", "C", "{ C: 4700e-6, polarized: false }"),
                    ("inductor", "L", "{ L: 1, rw: 5 }"), ("ammeter", "A", "{ rangeKey: '0.6A' }")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {p}, '{i}')")
    for a, b in [("K:0", "C:0"), ("K:1", "E:0"), ("K:2", "L:0"), ("L:1", "A:0"), ("A:1", "C:1"), ("E:1", "C:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    settle(page)
    g = ed(page, "e.doGrade()")
    log("LC 回路判分（5 角色齐全）", g["passed"], f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first.click(); settle(page, 500)
    page.locator(".clab .panel .btn.alt").first.click(); settle(page, 400)
    log("振荡回放两帧不同（电流表来回摆）", two_frames_differ(page), "")
    import re
    txt = page.locator(".clab .panel").inner_text()
    th = re.search(r"理论周期 T = .*?= ([\d.]+) s", txt); me = re.search(r"实测周期.*?= ([\d.]+) s", txt)
    log("实测周期 ≈ 2π√(LC)（<3%）", bool(th and me) and abs(float(me.group(1)) / float(th.group(1)) - 1) < 0.03,
        f"theory={th.group(1) if th else '?'} meas={me.group(1) if me else '?'}")


def case_sensor(page: Page, log):
    ed(page, "e.clearAll()")
    for k, i, p in [("dc_source", "E", "{}"), ("resistor", "Rd", "{ R: 1000 }"), ("photoresistor", "LDR", "{}"), ("relay", "K", "{}"), ("lamp", "La", "{}")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {p}, '{i}')")
    for a, b in [("E:0", "Rd:0"), ("Rd:1", "LDR:0"), ("LDR:1", "E:1"), ("K:0", "LDR:0"), ("K:1", "LDR:1"), ("E:0", "K:2"), ("K:3", "La:0"), ("La:1", "E:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    settle(page)
    g = ed(page, "e.doGrade()")
    log("光控电路判分（线圈并联光敏电阻）", g["passed"], f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    set_range(page, ".clab .panel input[type=range]", 0); settle(page, 250)
    dark_on = ed(page, "Math.abs(e.solution().elements['La'].i) > 0.01")
    set_range(page, ".clab .panel input[type=range]", 1); settle(page, 250)
    light_on = ed(page, "Math.abs(e.solution().elements['La'].i) > 0.01")
    log("夜晚灯亮、白天灯灭", dark_on and not light_on, f"dark={dark_on} light={light_on}")
    page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first.click(); settle(page, 300)
    log("「验证光控」判定成功", "光控成功" in page.locator(".clab .panel").inner_text(), "")


def _wire_coil(page: Page):
    ed(page, "e.clearAll()")
    ed(page, "e.addComponent('coil', 150, 120, {}, 'L2'); e.addComponent('galvanometer', 330, 120, { rangeKey: '3mA' }, 'G')")
    ed(page, "e.connect('L2:0','G:0'); e.connect('L2:1','G:1')")
    settle(page)


def case_induction(page: Page, log):
    _wire_coil(page)
    for k, i, p in [("inductor", "L1", "{ L: 0.5, rw: 5 }"), ("battery", "E", "{ emf: 6, r: 0.5 }"), ("switch", "S", "{}"), ("rheostat", "Rh", "{ Rmax: 20, pos: 0.5 }")]:
        ed(page, f"e.addComponent('{k}', undefined, undefined, {p}, '{i}')")
    for a, b in [("E:0", "S:0"), ("S:1", "Rh:0"), ("Rh:2", "L1:0"), ("L1:1", "E:1")]:
        ed(page, f"e.connect('{a}','{b}')")
    settle(page)
    g = ed(page, "e.doGrade()")
    log("副线圈–电流计 + 原线圈回路判分", g["passed"] or all(i["code"] in ("not_closed", "not_series") for i in g["issues"]), f"{g['score']}/{g['max']} {[i['code'] for i in g['issues']]}")
    page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first.click(); settle(page, 250)   # 磁铁插入
    log("磁铁插入：回放两帧不同", two_frames_differ(page), "")
    r1 = first_row(page)
    log("磁铁插入：电流计偏转", "不偏转" not in r1 and "偏" in r1, r1[:60])
    page.locator(".clab .panel .btn.alt").first.click(); settle(page, 1300)   # 原线圈闭合开关
    r2 = first_row(page)
    log("原线圈闭合开关：互感产生感应电流", "开关闭合" in r2 and "不偏转" not in r2, r2[:60])


def case_emf_factors(page: Page, log):
    _wire_coil(page)
    btn = page.locator(".clab .panel .btn:not(.ghost):not(.alt)").first
    import re
    set_range(page, ".clab .panel input[type=range]", 1); settle(page, 150)
    btn.click(); settle(page, 1300)
    m1 = re.search(r"(\d+) μA", first_row(page))
    set_range(page, ".clab .panel input[type=range]", 3); settle(page, 150)
    btn.click(); settle(page, 1300)
    m2 = re.search(r"(\d+) μA", first_row(page))
    log("插拔速度 ×3 时电流计峰值更大（ε ∝ ΔΦ/Δt）", bool(m1 and m2) and int(m2.group(1)) > 2 * int(m1.group(1)),
        f"v1={m1.group(1) if m1 else '?'}μA v3={m2.group(1) if m2 else '?'}μA")
    ed(page, "e.setProps('L2', { N: 300 })"); settle(page, 150)
    set_range(page, ".clab .panel input[type=range]", 1); settle(page, 150)
    btn.click(); settle(page, 1300)
    m3 = re.search(r"(\d+) μA", first_row(page))
    log("匝数 ×3 时峰值更大（ε ∝ N）", bool(m1 and m3) and int(m3.group(1)) > 2 * int(m1.group(1)), f"N100={m1.group(1) if m1 else '?'} N300={m3.group(1) if m3 else '?'}")


def case_lenz(page: Page, log):
    _wire_coil(page)
    btns = page.locator(".clab .panel .btn:not(.ghost):not(.alt)")
    def direction() -> str:
        r = first_row(page); return "右" if "右偏" in r else "左" if "左偏" in r else "无"
    btns.nth(0).click(); settle(page, 1300); n_in = direction()
    btns.nth(1).click(); settle(page, 1300); n_out = direction()
    page.locator(".clab .panel select").first.select_option("S"); settle(page, 100)
    btns.nth(0).click(); settle(page, 1300); s_in = direction()
    log("N 极插入与拔出偏转方向相反", n_in != "无" and n_out != "无" and n_in != n_out, f"N入={n_in} N出={n_out}")
    log("S 极插入与 N 极插入方向相反（=N 极拔出）", s_in == n_out, f"S入={s_in}")


CASES = {
    "bx3-emf-internal": case_emf,
    "bx3-resistivity": case_resistivity,
    "bx3-multimeter": case_multimeter,
    "bx3-capacitor-charge": case_capacitor,
    "xb2-self-induction": case_self_induction,
    "xb2-lc-ac": case_lc_ac,
    "xb2-em-oscillation": case_em_oscillation,
    "xb2-sensor-control": case_sensor,
    "bx3-induction-condition": case_induction,
    "bx3-emf-factors": case_emf_factors,
    "bx3-lenz-law": case_lenz,
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--ids", default=",".join(CASES))
    args = ap.parse_args()
    auth = login(args.api)
    failures = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1500, "height": 1000})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        console_errors: list[str] = []
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
        for exp_id in [s.strip() for s in args.ids.split(",") if s.strip()]:
            print(f"▶ {exp_id}")
            console_errors.clear()
            page.goto(f"{args.url}/exp/{exp_id}")
            page.wait_for_selector(STAGE, timeout=12000)
            page.wait_for_function("() => !!window.__circuitEditor", timeout=5000)

            def log(name, ok, detail=""):
                print(f"  {'✓' if ok else '✗'} {name} {detail}")
                if not ok:
                    failures.append(f"{exp_id}: {name} {detail}")
            try:
                CASES[exp_id](page, log)
            except Exception as ex:  # noqa: BLE001
                failures.append(f"{exp_id}: 异常 {ex}")
                print("  ✗ 异常", str(ex)[:200])
            page.screenshot(path=str(OUT / f"circuit-{exp_id}.png"))
            if console_errors:
                failures.append(f"{exp_id}: 控制台错误 {console_errors[:2]}")
                print("  ✗ 控制台错误", console_errors[:2])
        browser.close()
    print("\n结果:", "全部通过 ✅" if not failures else f"失败 {len(failures)} 项：\n  " + "\n  ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
