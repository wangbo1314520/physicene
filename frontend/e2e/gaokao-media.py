"""
B12 媒体归档：高考/竞赛题层 65 张卡逐个运行，保存运行中的舞台截图 + 录屏。
  截图 → docs/media/gaokao/<id>.png（宽 800，入库，供对账表/评审文档引用）
  录屏 → frontend/e2e/out/video/<id>.webm（本地归档，不入库）
用法：python e2e/gaokao-media.py [--ids a,b] [--no-video] [--shot-at 3000] [--record 6500]
前置：dev server http://localhost:5173、后端 8080（登录 demo/demo1234）
"""
import argparse
import importlib.util
import json
import shutil
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
OUT_PNG = ROOT / "docs" / "media" / "gaokao"
OUT_VID = HERE / "out" / "video"
STAGE_SEL = ".lab canvas, .exp canvas:not(.hist), .alt-stage canvas, .sim25d canvas, .clab canvas"
MAIN_BTN = ".panel .btn:not(.alt):not(.ghost), .panel .run, .panel > button:not(.rec):not(.btn), .sim25d .primary"

# 部分场景动画较长，截图时刻单独指定（ms）
SHOT_AT = {
    "gk-clothesline": 6000, "gk-cyclotron": 5000, "gk-mass-spectrometer": 6000, "gk-rail-rod": 2500, "gk-rod-free": 2500,
    "gk-rod-force": 4000, "gk-double-rod": 1200, "gk-rod-capacitor": 3000, "gk-black-box": 6000, "gk-photoelectric-ek-nu": 5000,
    "gk-variable-mass-gas": 4000, "gk-u-tube": 3500, "gk-liquid-seal-tube": 3000, "gk-cylinder-piston": 3000, "gk-weight-change": 4500,
    "gk-multistage": 4500, "gk-noninertial": 4000, "gk-small-quantity": 4000, "gk-rod-spring": 4000, "gk-frame-through-b": 1800,
    "gk-e-b-e-multi": 5000, "gk-composite-field": 3000, "gk-diffraction-vs-interference": 5000, "gk-hydrogen-levels": 1800,
    "gk-accel-deflect-screen": 5000, "gk-b-then-e": 3500, "gk-isochrone": 400, "gk-prism-refraction": 4000, "gk-impulse-micro": 1500,
    "gk-rigid-body": 2500, "gk-induction-circuit-mech": 2500, "gk-transformer-transmission": 1500, "gk-ac-four-values": 2500,
}


def load_ids() -> list[str]:
    spec = importlib.util.spec_from_file_location("exp_lib_check", HERE / "exp-lib-check.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(mod)
    return [i for i in mod.KEYWORDS if i.startswith("gk-")]


def login(api: str) -> dict:
    req = urllib.request.Request(f"{api}/api/auth/login", method="POST", data=json.dumps({"username": "demo", "password": "demo1234"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = json.loads(r.read().decode())
    if body.get("code") != 0:
        raise SystemExit(f"登录失败: {body}")
    return body["data"]


def shrink(path: Path, width: int = 800) -> None:
    try:
        from PIL import Image
    except ImportError:
        return
    im = Image.open(path)
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)))
    im.save(path, optimize=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--ids", default="")
    ap.add_argument("--no-video", action="store_true")
    ap.add_argument("--shot-at", type=int, default=3000)
    ap.add_argument("--record", type=int, default=6500, help="录屏总时长 ms（含截图前的运行）")
    args = ap.parse_args()
    ids = [i for i in args.ids.split(",") if i] or load_ids()
    OUT_PNG.mkdir(parents=True, exist_ok=True)
    OUT_VID.mkdir(parents=True, exist_ok=True)
    auth = login(args.api)
    done, failed = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for exp_id in ids:
            ctx_kwargs = {"viewport": {"width": 1500, "height": 900}}
            if not args.no_video:
                ctx_kwargs.update(record_video_dir=str(OUT_VID / "_tmp"), record_video_size={"width": 1500, "height": 900})
            ctx = browser.new_context(**ctx_kwargs)
            ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
            page = ctx.new_page()
            try:
                page.goto(f"{args.url}/exp/{exp_id}")
                page.wait_for_selector(STAGE_SEL, timeout=15000)
                page.wait_for_timeout(600)
                btn = page.locator(MAIN_BTN).first
                if btn.count() and btn.is_enabled():
                    btn.click()
                shot_at = SHOT_AT.get(exp_id, args.shot_at)
                page.wait_for_timeout(shot_at)
                png = OUT_PNG / f"{exp_id}.png"
                page.locator(STAGE_SEL).first.screenshot(path=str(png))
                shrink(png)
                if not args.no_video:
                    page.wait_for_timeout(max(0, args.record - shot_at))
                video = page.video if not args.no_video else None
                ctx.close()
                if video:
                    src = Path(video.path())
                    shutil.move(str(src), str(OUT_VID / f"{exp_id}.webm"))
                done.append(exp_id)
                print(f"✓ {exp_id}  png{'  webm' if not args.no_video else ''}")
            except Exception as e:  # noqa: BLE001
                failed.append(f"{exp_id}: {e}")
                print(f"✗ {exp_id}: {e}")
                try:
                    ctx.close()
                except Exception:  # noqa: BLE001
                    pass
        browser.close()
    shutil.rmtree(OUT_VID / "_tmp", ignore_errors=True)
    print(f"\n完成 {len(done)}/{len(ids)}；截图 → {OUT_PNG}；录屏 → {OUT_VID}")
    if failed:
        print("失败：\n  " + "\n  ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
