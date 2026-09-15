"""按指定时刻抓取某实验舞台画布的帧（用于核验有时间窗口的动画阶段）。
  python frontend/e2e/snap-stage.py --id bx1-action-reaction --at 700,950,1050
输出 frontend/e2e/out/stage-<id>-<ms>.png
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)
STAGE_SEL = ".lab canvas, .exp canvas, .alt-stage canvas, .sim25d canvas"


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
    ap.add_argument("--id", required=True)
    ap.add_argument("--at", default="700,950,1050", help="页面就绪后的毫秒时刻列表")
    args = ap.parse_args()
    ats = [int(s) for s in args.at.split(",") if s.strip()]

    auth = login(args.api)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1500, "height": 900})
        ctx.add_init_script(
            f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        page.goto(f"{args.url}/exp/{args.id}")
        page.wait_for_selector(STAGE_SEL, timeout=12000)
        stage = page.locator(STAGE_SEL).first
        elapsed = 0
        for ms in ats:
            page.wait_for_timeout(max(0, ms - elapsed))
            elapsed = ms
            path = OUT / f"stage-{args.id}-{ms}.png"
            stage.screenshot(path=str(path))
            print("saved", path)
        browser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
