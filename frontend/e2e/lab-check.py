"""实验台（/lab）三维度 E2E：维度切换 → 元件托盘按维度过滤 → 实验模板载入 → 画布存在 → 2D 模板真实运行（Java dyn4j）→ 各维度截图归档。
  python -u frontend/e2e/lab-check.py [--url http://localhost:5173] [--no-run]
"""
import argparse
import json
import sys
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)

EXPECT_PALETTE = {
    "2D 平面": ["方块", "小球", "斜面", "墙壁/地面", "点电荷", "匀强电场", "匀强磁场"],
    "2.5D 立体": ["方块", "小球", "斜面", "墙壁/地面", "传送带（实验性）", "圆轨道（实验性）", "轻绳（实验性）", "弹簧（实验性）", "滑轮（实验性）"],
    "3D 空间": ["小球", "墙壁/地面", "点电荷", "匀强电场", "匀强磁场"],
}
EXPECT_TEMPLATES = {"2D 平面": 4, "2.5D 立体": 3, "3D 空间": 4}


def login(api_base: str) -> dict:
    req = urllib.request.Request(f"{api_base}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        body = json.loads(r.read().decode())
    if body.get("code") != 0:
        raise SystemExit(f"登录失败: {body}")
    return body["data"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="http://localhost:5173")
    ap.add_argument("--api", default="http://localhost:8080")
    ap.add_argument("--no-run", action="store_true", help="跳过真实运行（无 Java 后端时）")
    args = ap.parse_args()
    auth = login(args.api)
    failures: list[str] = []

    def log(name, ok, detail=""):
        print(f"  {'✓' if ok else '✗'} {name} {detail}")
        if not ok:
            failures.append(f"{name} {detail}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1500, "height": 950})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});"
                            f"localStorage.removeItem('ps_dim'); localStorage.removeItem('ps_view');")
        page = ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "favicon" not in m.text else None)
        page.goto(f"{args.url}/lab")
        page.wait_for_selector(".canvas-wrap canvas", timeout=12000)
        page.wait_for_timeout(500)

        for label, expect_items in EXPECT_PALETTE.items():
            print(f"▶ {label}")
            page.locator(".dims .dim", has_text=label).click()
            page.wait_for_timeout(300)
            items = [s.strip() for s in page.locator(".left .palette-item").all_inner_texts()]
            items = [t.split("\n")[-1].strip().lstrip("▣●◺▬⊕⇉⊗ ").strip() for t in items]
            log("托盘元件集", items == expect_items, f"{items}")
            n_tpl = page.locator(".left .tpl").count()
            log("实验模板数量", n_tpl == EXPECT_TEMPLATES[label], f"{n_tpl}")
            # 覆盖审计修复（批次1验收追问5）：逐个载入全部模板断言元件数，不再只点最后一个
            for k in range(n_tpl):
                page.locator(".left .tpl").nth(k).click()
                page.wait_for_timeout(350)
                cnt_txt = page.locator("text=/场景元件 \\(\\d+\\)/").first.inner_text()
                n_el = int(cnt_txt.split("(")[1].rstrip(")"))
                log(f"模板[{k}] 载入后场景有元件", n_el >= 2, cnt_txt)
            log("画布存在", page.locator(".canvas-wrap canvas").count() == 1, "")
            page.screenshot(path=str(OUT / f"lab-{label.split()[0]}.png"))

        print("▶ 贴紧提示（相邻元件空隙检测）")
        page.locator(".dims .dim", has_text="2.5D 立体").click(); page.wait_for_timeout(200)
        page.locator(".left .tpl").nth(1).click()   # 两球对心碰撞：球底与地面顶齐平
        page.wait_for_timeout(300)
        page.evaluate("() => { const L = window.__lab; const b = L.scene.elements.find(e => e.id === 'ball1'); b.position.y += 0.3; L.checkSnap('ball1') }")
        page.wait_for_timeout(200)
        bar = page.locator(".snapbar")
        log("抬高小球 0.3 m 后出现“是否贴紧”提示", bar.count() == 1 and "空隙" in bar.inner_text(), bar.inner_text()[:60] if bar.count() else "无提示")
        page.locator(".snapbar button.ok").click(); page.wait_for_timeout(200)
        y_after = page.evaluate("() => window.__lab.scene.elements.find(e => e.id === 'ball1').position.y")
        log("点「贴紧」后小球回到与地面贴合（y=0.5）", abs(y_after - 0.5) < 0.02, f"y={y_after}")

        if not args.no_run:
            print("▶ 2D 真实运行（dyn4j）")
            page.locator(".dims .dim", has_text="2D 平面").click(); page.wait_for_timeout(200)
            page.locator(".left .tpl").nth(1).click()   # 平抛运动
            page.wait_for_timeout(300)
            page.locator("button.primary", has_text="运行实验").click()
            try:
                page.wait_for_function("() => /ended|实验完成/.test(document.body.innerText)", timeout=60000)
                log("平抛运动跑完（status=ended）", True, "")
            except Exception as ex:  # noqa: BLE001
                log("平抛运动跑完（status=ended）", False, str(ex)[:80])
            page.screenshot(path=str(OUT / "lab-2D-run.png"))

        # ═══ F1.2 lab-check 扩充（≥3 项，锁定 Tab/Builder 集成契约）═══
        print("▶ F1.2-1 默认态隔离（实验台激活 / 自由搭建不存在）")
        log("默认 .lab > .topbar 可见", page.locator(".lab > .topbar").is_visible(), "")
        log("默认 .free-build-tab 不存在", page.locator(".free-build-tab").count() == 0, "")

        print("▶ F1.2-2 切换隔离（自由搭建挂载 / 实验台不共存）")
        page.locator(".tabbar .tab", has_text="自由搭建").click()
        page.wait_for_selector(".free-build-tab .builder .palette .item", timeout=12000)
        log("自由搭建 BuilderView 挂载", page.locator(".free-build-tab .builder").count() == 1, "")
        log("切自由后 .lab > .topbar 不可见", not page.locator(".lab > .topbar").is_visible(), "")
        log("切自由后实验台 palette 不存在", page.locator(".lab .left .palette-item").count() == 0, "")

        print("▶ F1.2-3 共享非复制（BuilderView 整页组件引用）")
        # 运行时验证：__builder 钩子在自由搭建 Tab 内可用 = BuilderView 完整挂载（非复制的功能等价）
        has_hook = page.evaluate("typeof window.__builder === 'object' && typeof window.__builder.add === 'function'")
        log("__builder 钩子可用（BuilderView 单例）", has_hook, "")
        n_tpl = page.evaluate("window.__builder.templates().length")
        log("自由搭建模板下拉 17 项", n_tpl == 17, f"n={n_tpl}")
        pal_default = page.locator(".free-build-tab .builder .palette .items .item").all_inner_texts()
        log("自由搭建默认域=力学（含物块）", any("物块" in t for t in pal_default), f"n={len(pal_default)}")
        page.locator(".free-build-tab .builder .palette .tabs button", has_text="电磁").click()
        page.wait_for_timeout(200)
        pal_em = page.locator(".free-build-tab .builder .palette .items .item").all_inner_texts()
        log("电磁域含匀强电场", any("匀强电场" in t for t in pal_em), f"n={len(pal_em)}")
        page.locator(".free-build-tab .builder .palette .tabs button", has_text="通用").click()
        page.wait_for_timeout(200)
        pal_util = page.locator(".free-build-tab .builder .palette .items .item").all_inner_texts()
        log("通用域含矢量箭头", any("矢量箭头" in t for t in pal_util), f"n={len(pal_util)}")

        print("▶ F1.2-4 模板可跑闭环（板块模型：loadTemplate→run→ended→共速 x>0.5）")
        page.evaluate("window.__builder.clear()")
        page.evaluate("window.__builder.loadTemplate('gk-board-block')")
        page.wait_for_timeout(300)
        page.locator(".free-build-tab .tools .primary").click()
        f_ended = False
        for _ in range(60):
            page.wait_for_timeout(300)
            if page.evaluate("window.__builder.simStatus()") == "ended":
                f_ended = True
                break
        log("板块模板运行至 ended", f_ended, "")
        f_subs = page.evaluate("window.__builder.subjects()")
        f_x = f_subs[0]["x"] if f_subs else -99
        log("板块共速后位移 x>0.5", bool(f_subs) and f_x > 0.5, f"x={f_x:.3f}" if f_subs else "无采样")
        kes = page.evaluate("window.__builder.keyEvents()")
        log("keyEvents 含碰撞/共速事件", len(kes) > 0, f"n={len(kes)}")

        print("▶ F1.2-5 切回恢复（实验台顶栏/画布恢复 / 自由搭建卸载）")
        page.locator(".tabbar .tab", has_text="实验台").click()
        page.wait_for_selector(".lab > .topbar", timeout=8000)
        log("切回后 .lab > .topbar 可见", page.locator(".lab > .topbar").is_visible(), "")
        log("切回后 .free-build-tab 卸载", page.locator(".free-build-tab").count() == 0, "")
        page.wait_for_selector(".lab .left .palette-item", timeout=8000)
        log("切回后实验台 palette 恢复", page.locator(".lab .left .palette-item").count() > 0, "")
        page.screenshot(path=str(OUT / "lab-f12-roundtrip.png"))


        real_errors = [e for e in errors if "WebGL" not in e]
        log("控制台无错误", not real_errors, f"{real_errors[:2]}")
        browser.close()

    print("\n结果:", "全部通过 ✅" if not failures else f"失败 {len(failures)} 项：\n  " + "\n  ".join(failures))
    return 0 if not failures else 1


if __name__ == "__main__":
    sys.exit(main())
