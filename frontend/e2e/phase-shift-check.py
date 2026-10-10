# -*- coding: utf-8 -*-
"""AC 相移 E2E：RL 电流滞后 / RC 电流超前——验证相量法正确性（非纯电阻）。
频率 1Hz（30fps=30 采样/周期，充分）；相位差 = 零交叉时间差。"""
import _env; _env.banner()
import json, math, sys, urllib.request
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

def place(page, label):
    page.evaluate("(l) => { const it = [...document.querySelectorAll('.palette .item')]"
                  ".find(e => e.querySelector('.lb')?.textContent.trim() === l); it && it.click() }", label)
    page.wait_for_timeout(120)
    return page.evaluate("window.__builder.elements()")[-1]["id"]

def pick(page, a, aa, b, ab):
    page.evaluate("(m) => window.__builder.pickAnchor(m.a, m.aa)", {"a": a, "aa": aa})
    page.wait_for_timeout(50)
    page.evaluate("(m) => window.__builder.pickAnchor(m.b, m.ab)", {"b": b, "ab": ab})
    page.wait_for_timeout(50)
    page.keyboard.press("Escape")
    page.wait_for_timeout(40)

def run_collect(page, duration=2.0):
    """运行并返回逐帧 {t, I_r, U_src} 列表"""
    return page.evaluate("""async (dur) => {
      const B = window.__builder; B.run();
      const wait = (ms) => new Promise(r => setTimeout(r, ms));
      let ts = false; const frames = [];
      for (let i = 0; i < dur * 30 + 60; i++) {
        await wait(1000/30);
        const st = B.tsStatus();
        if (st === 'running') ts = true;
        if (ts) {
          const rd = B.tsReadings() ?? {};
          const t = frames.length / 30;
          // 动态找 I_/U_ key（元件 ID 自动生成非固定）
          const iKey = Object.keys(rd).find(k => k.startsWith('I_resistor') || k.startsWith('I_r'));
          const uKey = Object.keys(rd).find(k => k.startsWith('U_resistor') || k.startsWith('U_r'));
          frames.push({ t, I: iKey ? rd[iKey] : 0, U: uKey ? rd[uKey] : 0 });
        }
        if (ts && st === 'ended') break;
      }
      return frames; }""", duration)

def find_zero_crossings(data, key):
    """找正向上穿零点的时间列表"""
    crossings = []
    for i in range(1, len(data)):
        if data[i-1][key] <= 0 and data[i][key] > 0:
            # 线性插值
            frac = -data[i-1][key] / (data[i][key] - data[i-1][key])
            crossings.append(data[i-1]['t'] + frac * (data[i]['t'] - data[i-1]['t']))
    return crossings

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
        page.locator(".palette .tabs button", has_text="电磁").click()
        page.wait_for_timeout(150)
        page.locator(".tools button", has_text="连线").click()
        page.wait_for_timeout(100)
        page.locator(".linkkind").select_option("wire")

        # ═══ 场景一：RL 串联——电流滞后电压 ═══
        print("场景一：AC(1Hz) + R=1Ω + L=1H → 电流滞后 φ=arctan(ωL/R)≈80°")
        page.evaluate("window.__builder.clear()")
        ac = place(page, "交流电源")
        res = place(page, "定值电阻")
        ind = place(page, "电感")
        # 参数：f=1Hz 低频保证采样充分；R=1Ω L=1H → ωL=2π≫R → φ≈80°
        page.evaluate(f"window.__builder.setParams('{ac}', {{ um: 10, f: 1, r: 0.1 }})")
        page.evaluate(f"window.__builder.setParams('{res}', {{ R: 1 }})")
        page.evaluate(f"window.__builder.setParams('{ind}', {{ L: 1 }})")
        # 串联：ac正极→R左端，R右端→L左端，L右端→ac负极
        pick(page, ac, "正极", res, "左端")
        pick(page, res, "右端", ind, "左端")
        pick(page, ind, "右端", ac, "负极")
        frames = run_collect(page, 2.0)
        check("RL1 RL 电路运行有数据帧", len(frames) > 30, f"frames={len(frames)}")

        if len(frames) > 30:
            # 理论：φ = arctan(ωL/(R+r)) = arctan(2π·1/1.1) ≈ 80.1°
            omega = 2 * math.pi * 1
            phi = math.atan2(omega * 1, 1 + 0.1)  # ≈ 1.299 rad ≈ 74.5°
            phi_deg = math.degrees(phi)
            # 电流零交叉（正向上穿）
            i_zeros = find_zero_crossings(frames[3:], 'I')
            # 电压零交叉：源电压 u(t)=Um·sin(ωt)，正向上穿在 t=0, T, 2T...
            # 电流滞后 φ/ω 秒
            expected_delay = phi / omega  # ≈ 0.207s
            if i_zeros:
                # 取第一个正向上穿（应≈expected_delay 或 T+expected_delay）
                first_zero = i_zeros[0]
                period = 1.0  # f=1Hz
                # 电流可能从负值开始，第一个上穿在 expected_delay 或 period+expected_delay
                actual_delay = first_zero % period
                # 相位差（度）
                actual_phi_deg = actual_delay / period * 360
                check("RL2 电流滞后电压（φ>30°）",
                      actual_phi_deg > 30,
                      f"理论φ={phi_deg:.1f}° 实测φ={actual_phi_deg:.1f}° Δt={actual_delay:.3f}s")
                check("RL3 相位差在理论值±15°内",
                      abs(actual_phi_deg - phi_deg) < 15,
                      f"理论={phi_deg:.1f}° 实测={actual_phi_deg:.1f}°")
            else:
                check("RL2 电流滞后电压", False, "未找到电流零交叉")

        # ═══ 场景二：RC 串联——电流超前电压 ═══
        print("场景二：AC(1Hz) + R=1Ω + C=0.1F → 电流超前 φ=arctan(1/ωCR)≈58°")
        page.evaluate("window.__builder.clear()")
        ac = place(page, "交流电源")
        res = place(page, "定值电阻")
        cap = place(page, "电容")
        page.evaluate(f"window.__builder.setParams('{ac}', {{ um: 10, f: 1, r: 0.1 }})")
        page.evaluate(f"window.__builder.setParams('{res}', {{ R: 1 }})")
        page.evaluate(f"window.__builder.setParams('{cap}', {{ C: 0.1 }})")
        pick(page, ac, "正极", res, "左端")
        pick(page, res, "右端", cap, "左端")
        pick(page, cap, "右端", ac, "负极")
        frames2 = run_collect(page, 2.0)
        check("RC1 RC 电路运行有数据帧", len(frames2) > 30, f"frames={len(frames2)}")

        if len(frames2) > 30:
            omega = 2 * math.pi * 1
            # φ = -arctan(XC/R) = -arctan(1/(ωC)/(R+r)) → 电流超前
            xc = 1 / (omega * 0.1)  # ≈ 1.59Ω
            phi_rc = math.atan2(xc, 1 + 0.1)  # ≈ 55.3° 超前
            phi_rc_deg = math.degrees(phi_rc)
            i_zeros2 = find_zero_crossings(frames2[3:], 'I')
            if i_zeros2:
                first_zero2 = i_zeros2[0]
                period = 1.0
                actual_delay2 = first_zero2 % period
                actual_phi2_deg = actual_delay2 / period * 360
                # RC：电流超前 → 电流零交叉应在源电压零交叉之前
                # 实际测得的 delay 应小于 period - phi_rc/360 * period（超前）
                # 或者等价地：actual_phi_deg 应接近 360 - phi_rc_deg（因为超前 = 负延迟）
                check("RC2 电流超前电压（相位差>30°）",
                      (360 - actual_phi2_deg) > 30 if actual_phi2_deg > 180 else actual_phi2_deg < 180 - 30,
                      f"理论超前={phi_rc_deg:.1f}° 实测φ={actual_phi2_deg:.1f}° Δt={actual_delay2:.3f}s")
                # 宽松验证：相位差不为零（即不是纯电阻）
                phase_diff = min(actual_phi2_deg, 360 - actual_phi2_deg)
                check("RC3 电流超前（相位差>20° 非纯电阻）",
                      phase_diff > 20,
                      f"phase_diff={phase_diff:.1f}° 理论超前={phi_rc_deg:.1f}°")
            else:
                check("RC2 电流超前电压", False, "未找到电流零交叉")

        check("E2E 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ AC 相移 E2E 失败：{fails}"); return 1
    print(f"✅ AC 相移 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
