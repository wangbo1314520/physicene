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
        page.screenshot(path="e2e/out/ai-tutor.png", full_page=False)
        browser.close()
    print("\n结果:", "全部通过 ✅" if not fails else f"失败 {len(fails)} 项：{fails}")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
