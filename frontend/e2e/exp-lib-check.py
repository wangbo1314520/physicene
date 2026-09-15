"""实验库（/exp/:id）无头 E2E：登录 → 逐个打开实验 → 断言仪器画布/按钮交互/控制台无错误。
用法（Vite dev + Java 8080 已启动）：
  set PLAYWRIGHT_BROWSERS_PATH=E:\\Program\\playwright-browsers
  python frontend/e2e/exp-lib-check.py [--ids a,b,c] [--url http://localhost:5174]
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

P1_IDS = [
    "bx1-tape-velocity", "bx3-capacitor-charge", "bx3-resistivity", "xb1-refraction",
    "bx1-static-friction", "bx3-coulomb-balance", "xb1-wave-interference", "xb1-light-phenomena",
    "xb2-self-induction", "xb2-lc-ac",
]


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
    ap.add_argument("--url", default="http://localhost:5174")
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--ids", default=",".join(P1_IDS))
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
                page.wait_for_selector(".lab canvas, .exp canvas, .alt-stage canvas", timeout=12000)
            except Exception:
                failures.append(f"{exp_id}: 未找到仪器画布")
                page.screenshot(path=str(OUT / f"exp-{exp_id}.png"))
                print("  ✗ 未找到仪器画布")
                continue
            page.wait_for_timeout(700)
            canvases = page.locator(".lab canvas, .exp canvas, .alt-stage canvas").count()
            # 主动作按钮（第一个非 alt/ghost 的 .btn 或 .run）
            main_btn = page.locator(".panel .btn:not(.alt):not(.ghost), .panel .run, .panel > button:not(.rec):not(.btn)").first
            clicked_main = False
            if main_btn.count() and main_btn.is_enabled():
                main_btn.click()
                clicked_main = True
                page.wait_for_timeout(1200)
            rec_btn = page.locator(".panel .btn.alt, .panel .rec").first
            clicked_rec = False
            if rec_btn.count() and rec_btn.is_enabled():
                rec_btn.click()
                clicked_rec = True
                page.wait_for_timeout(300)
            page.screenshot(path=str(OUT / f"exp-{exp_id}.png"))
            real_errors = [e for e in errors if "favicon" not in e]
            ok = canvases >= 1 and not real_errors
            print(f"  {'✓' if ok else '✗'} 画布 {canvases} 个 | 主按钮{'已点' if clicked_main else '无/禁用'} | 记录{'已点' if clicked_rec else '无/禁用'} | 控制台错误 {len(real_errors)}")
            for e in real_errors[:3]:
                print("     ", e[:180])
            if not ok:
                failures.append(f"{exp_id}: 画布={canvases} 错误={len(real_errors)}")
        browser.close()

    print("\n结果:", "全部通过 ✅" if not failures else f"失败 {len(failures)} 项：" + "; ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
