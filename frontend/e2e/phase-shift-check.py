# -*- coding: utf-8 -*-
"""AC 相移 E2E：RL 电流滞后 / RC 电流超前——验证相量法正确性（非纯电阻）。
频率 1Hz（30fps=30 采样/周期，充分）。
相位测量（2026-10-11 修正，两层）：
1) 同帧采样 I_resistor 与 U_ac_source 两通道取相对零交叉——不再假设"源电压 t=0 上穿零"；
2) 时间轴用引擎自身 t（B.tsT()）——此前用帧计数当 t，wall-clock 轮询在渲染负载下会
   跳帧/重复帧（转储实测：角度序列 84°→108° 跳过 96°），表观频率 1Hz→1.15Hz，
   I/U 零点间落一个跳帧时相位差被扭掉整帧（12°）——106°/123° 假偏差皆由此而来。
引擎相量本身精确（circuit-basics.test.ts「RC/RL 相量 re/im 精确对齐闭式解」1e-4 断言，
RC 峰值口径 2.9388+j4.2520，审查理论 2.938+j4.250 为对方 XC 取整）。"""
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
    """运行并返回逐帧 {t, I, U}——I=电阻电流，U=源端电压瞬时值（同帧采样）。
    t 用引擎自身时间轴 B.tsT()：wall-clock 轮询在渲染负载下会跳帧/重复帧，
    用帧计数当 t 会使表观频率漂移（实测 1Hz→1.15Hz）、相位差被扭掉整帧（12°）。"""
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
          const t = (typeof B.tsT === 'function') ? B.tsT() : frames.length / 30;
          const iKey = Object.keys(rd).find(k => k.startsWith('I_resistor') || k.startsWith('I_r'));
          const uKey = Object.keys(rd).find(k => k.startsWith('U_ac_source'));
          frames.push({ t, I: iKey ? rd[iKey] : 0, U: uKey ? rd[uKey] : 0 });
        }
        if (ts && st === 'ended') break;
      }
      return frames; }""", duration)

def find_zero_crossings(data, key):
    """找正向上穿零点的时间列表（线性插值）"""
    crossings = []
    for i in range(1, len(data)):
        if data[i-1][key] <= 0 and data[i][key] > 0:
            frac = -data[i-1][key] / (data[i][key] - data[i-1][key])
            crossings.append(data[i-1]['t'] + frac * (data[i]['t'] - data[i-1]['t']))
    return crossings

def relative_phase(frames, period=1.0, skip=3):
    """I 相对 U 的相位差（度，0..360）：第 k 个上穿零配对取 (tI−tU) mod T 均值。
    两通道同一帧采样 → 时间原点漂移抵消。>180 表示电流超前 (360−deg)。"""
    data = frames[skip:]
    i_zeros = find_zero_crossings(data, 'I')
    u_zeros = find_zero_crossings(data, 'U')
    if not i_zeros or not u_zeros:
        return None, i_zeros, u_zeros
    diffs = [(i_zeros[k] - u_zeros[k]) % period for k in range(min(len(i_zeros), len(u_zeros)))]
    return (sum(diffs) / len(diffs)) / period * 360, i_zeros, u_zeros

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
        print("场景一：AC(1Hz) + R=1Ω + L=1H → 电流滞后 φ=arctan(ωL/(R+r))≈80.1°")
        page.evaluate("window.__builder.clear()")
        ac = place(page, "交流电源")
        res = place(page, "定值电阻")
        ind = place(page, "电感")
        page.evaluate(f"window.__builder.setParams('{ac}', {{ um: 10, f: 1, r: 0.1 }})")
        page.evaluate(f"window.__builder.setParams('{res}', {{ R: 1 }})")
        page.evaluate(f"window.__builder.setParams('{ind}', {{ L: 1 }})")
        pick(page, ac, "正极", res, "左端")
        pick(page, res, "右端", ind, "左端")
        pick(page, ind, "右端", ac, "负极")
        frames = run_collect(page, 2.0)
        check("RL1 RL 电路运行有数据帧", len(frames) > 30, f"frames={len(frames)}")

        if len(frames) > 30:
            omega = 2 * math.pi * 1
            phi_deg = math.degrees(math.atan2(omega * 1, 1 + 0.1))  # ≈ 80.08°
            deg, i_zeros, u_zeros = relative_phase(frames)
            if deg is not None:
                lag = deg if deg <= 180 else deg - 360   # 正=滞后
                check("RL2 电流滞后电压（30°<φ<95°）",
                      30 < lag < 95,
                      f"理论滞后={phi_deg:.1f}° 实测滞后={lag:.1f}°")
                check("RL3 相位差在理论值±10°内",
                      abs(lag - phi_deg) < 10,
                      f"理论={phi_deg:.1f}° 实测={lag:.1f}°（I零点{len(i_zeros)}个 U零点{len(u_zeros)}个）")
            else:
                check("RL2 电流滞后电压", False,
                      f"零交叉缺失 I={len(i_zeros)} U={len(u_zeros)}")

        # ═══ 场景二：RC 串联——电流超前电压 ═══
        print("场景二：AC(1Hz) + R=1Ω + C=0.1F → 电流超前 φ=arctan(Xc/(R+r))≈55.3°")
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
            xc = 1 / (omega * 0.1)  # ≈ 1.5915Ω
            phi_rc_deg = math.degrees(math.atan2(xc, 1 + 0.1))  # ≈ 55.35° 超前
            deg2, i_zeros2, u_zeros2 = relative_phase(frames2)
            if deg2 is not None:
                lead = 360 - deg2 if deg2 > 180 else -deg2   # 正=超前
                check("RC2 电流超前电压（30°<φ<80°）",
                      30 < lead < 80,
                      f"理论超前={phi_rc_deg:.1f}° 实测超前={lead:.1f}°")
                check("RC3 相位差在理论值±10°内",
                      abs(lead - phi_rc_deg) < 10,
                      f"理论={phi_rc_deg:.1f}° 实测={lead:.1f}°（I零点{len(i_zeros2)}个 U零点{len(u_zeros2)}个）")
            else:
                check("RC2 电流超前电压", False,
                      f"零交叉缺失 I={len(i_zeros2)} U={len(u_zeros2)}")

        check("E2E 全程无页面错误", not errs, str(errs[:1]))
        b.close()

    print()
    if fails:
        print(f"❌ AC 相移 E2E 失败：{fails}"); return 1
    print(f"✅ AC 相移 E2E 全过（{len(ok_all)} 项）"); return 0

if __name__ == "__main__":
    sys.exit(main())
