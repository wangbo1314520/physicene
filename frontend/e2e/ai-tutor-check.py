"""
AI 助教真通道 E2E：打开一个教材实验 → 点「直接讲解」→ 等待真 AI 回复（经 Java /api/v1/agent/chat → Python Agent）。
断言：出现非本地（不含“AI 服务暂不可用”）的 AI 消息且长度 ≥ 40；在线指示灯为绿；再问一个问题也能得到回复。
用法：python e2e/ai-tutor-check.py [--id bx1-hooke] [--url http://localhost:5173]
"""
import argparse
import json
import sys
import urllib.request

from playwright.sync_api import sync_playwright


def login(api: str) -> dict:
    req = urllib.request.Request(f"{api}/api/auth/login", method="POST", data=json.dumps({"username": "demo", "password": "demo1234"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = json.loads(r.read().decode())
    if body.get("code") != 0:
        raise SystemExit(f"登录失败: {body}")
    return body["data"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--id", default="bx1-hooke")
    args = ap.parse_args()
    auth = login(args.api)
    fails: list[str] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1500, "height": 900})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        page.goto(f"{args.url}/exp/{args.id}")
        page.wait_for_selector(".ai-tutor", timeout=15000)
        # 三模式按钮必须已删除
        modes = page.locator(".modes").count() + page.get_by_text("引导模式").count() + page.get_by_text("考试模式").count()
        print(f"  {'✓' if modes == 0 else '✗'} 三模式切换已删除（残留 {modes}）")
        if modes:
            fails.append("三模式残留")
        page.locator(".ai-tutor .explain").click()
        try:
            page.wait_for_function(
                "() => [...document.querySelectorAll('.ai-tutor .msg.ai')].some(m => m.innerText.length >= 40 && !m.innerText.includes('当前步骤：') && m.innerText !== 'AI 思考中…')",
                timeout=60000)
        except Exception:  # noqa: BLE001
            pass
        msgs = page.locator(".ai-tutor .msg.ai").all_inner_texts()
        last = msgs[-1] if msgs else ""
        online = page.locator(".ai-tutor .dot.on").count() == 1
        real = online and "AI 服务暂不可用" not in last and len(last) >= 40
        print(f"  {'✓' if real else '✗'} 直接讲解：{'真 AI 回复' if real else '回退/失败'}（{len(last)} 字）：{last[:110].replace(chr(10), ' ')}…")
        if not real:
            fails.append("直接讲解未得到真 AI 回复")
        page.locator(".ai-tutor input").fill("这个实验的结论公式是什么？直接告诉我")
        page.locator(".ai-tutor .input-row button").click()
        n0 = len(msgs)
        try:
            page.wait_for_function(f"() => document.querySelectorAll('.ai-tutor .msg.ai').length > {n0} && ![...document.querySelectorAll('.ai-tutor .msg.ai')].slice(-1)[0].innerText.includes('思考中')", timeout=60000)
        except Exception:  # noqa: BLE001
            pass
        msgs2 = page.locator(".ai-tutor .msg.ai").all_inner_texts()
        ans = msgs2[-1] if len(msgs2) > n0 else ""
        ok2 = len(ans) >= 30 and "不能直接告诉你答案" not in ans
        print(f"  {'✓' if ok2 else '✗'} 直接问答案：{'已回答' if ok2 else '无回复/拒答'}：{ans[:110].replace(chr(10), ' ')}…")
        if not ok2:
            fails.append("问答未回答")

        # ═══ 意图分流（2026-10-11 裁决 A+C）：问答案→答案+推理；求方法→分步；验证→确认/纠正 ═══
        def ask(q: str) -> str:
            n = page.locator(".ai-tutor .msg.ai").count()
            page.locator(".ai-tutor input").fill(q)
            page.locator(".ai-tutor .input-row button").click()
            try:
                page.wait_for_function(f"() => document.querySelectorAll('.ai-tutor .msg.ai').length > {n} && ![...document.querySelectorAll('.ai-tutor .msg.ai')].slice(-1)[0].innerText.includes('思考中')", timeout=60000)
            except Exception:  # noqa: BLE001
                pass
            m = page.locator(".ai-tutor .msg.ai").all_inner_texts()
            return m[-1] if len(m) > n else ""

        # ① 问答案 → 先答案后完整推理（不是裸答案）
        a1 = ask("这个实验测出的劲度系数 k 应该是多少？直接告诉我答案")
        has_reason = any(k in a1 for k in ("因为", "根据", "推导", "步骤", "由", "计算", "＝", "=", "比例"))
        ok3 = len(a1) >= 60 and has_reason
        print(f"  {'✓' if ok3 else '✗'} 意图①问答案→答案+推理（{len(a1)} 字，含推理标记={has_reason}）：{a1[:80].replace(chr(10), ' ')}…")
        if not ok3:
            fails.append("问答案未带推理")

        # ② 求方法 → 分步引导（不替学生算到底）
        a2 = ask("我想自己求出 k，给我思路就好，先别告诉我答案")
        has_steps = any(k in a2 for k in ("第一", "步骤", "先", "①", "1.", "1、"))
        ok4 = len(a2) >= 40 and has_steps
        print(f"  {'✓' if ok4 else '✗'} 意图②求方法→分步引导（含分步标记={has_steps}）：{a2[:80].replace(chr(10), ' ')}…")
        if not ok4:
            fails.append("求方法未分步引导")

        # ③ 验证对错 → 明确确认或纠正
        a3 = ask("我算出来 k = 980 N/m，我算的对吗？")
        confirmed = any(k in a3 for k in ("正确", "对的", "没错", "确认", "准确"))
        corrected = any(k in a3 for k in ("不对", "不正确", "错", "偏大", "偏小", "应该", "单位", "数量级"))
        ok5 = len(a3) >= 30 and (confirmed or corrected)
        print(f"  {'✓' if ok5 else '✗'} 意图③验证对错→确认/纠正（确认={confirmed} 纠正={corrected}）：{a3[:80].replace(chr(10), ' ')}…")
        if not ok5:
            fails.append("验证对错未明确表态")

        page.screenshot(path="e2e/out/ai-tutor.png", full_page=False)
        browser.close()
    print("\n结果:", "全部通过 ✅" if not fails else f"失败 {len(fails)} 项：{fails}")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
