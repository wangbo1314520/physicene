"""环境自检（测点1 前置·审查令）：每次回归前先跑，全过才允许测。
P2.1 教训清单逐条钉死：
  1. 假重启：8080 被旧进程占用，E2E 打旧二进制 → 检查监听 PID 是 java 且二进制不旧于进程启动
  2. 源码未编译：.java 比 .class 新 → 编了再测
  3. Vite 服务旧代码：dev server 内容与工作树不符 → 逐 token 比对
  4. python 解析到 WindowsApps 失效别名（exit 49 无输出）→ 显式路径
  5. PLAYWRIGHT_BROWSERS_PATH 未指 → chromium 缺失
用法：python e2e/env-check.py  （退出码 0=全过）
"""
import os
import re
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

import _env

ROOT = Path(__file__).resolve().parent.parent.parent  # repo root
JAVA_SRC = ROOT / "java-backend" / "src" / "main" / "java"
JAVA_CLASSES = ROOT / "java-backend" / "target" / "classes"

checks: list[tuple[str, bool, str]] = []


def chk(name: str, ok: bool, detail: str = ""):
    checks.append((name, ok, detail))
    print(f"  {'✓' if ok else '✗'} {name} {detail}")


def newest_mtime(root: Path, patterns: tuple[str, ...]) -> float:
    latest = 0.0
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if f.endswith(patterns):
                latest = max(latest, os.path.getmtime(os.path.join(dirpath, f)))
    return latest


def main() -> int:
    _env.banner()

    # ── A. git 状态 ──
    head, branch, dirty = _env.git_info()
    chk("git HEAD 可读", head != "?", f"{head} @ {branch}")
    chk("工作树干净（回归须在已提交状态跑）", dirty == 0, f"dirty:{dirty}")

    # ── B/C. 8080 监听进程 + 二进制新旧（假重启类） ──
    pid, name, start = _env.java_proc()
    chk("8080 已监听", bool(pid), f"PID={pid}")
    chk("8080 监听者是 java 进程", bool(pid) and "java" in name.lower(), name)
    src_new = newest_mtime(JAVA_SRC, (".java",))
    cls_new = newest_mtime(JAVA_CLASSES, (".class",))
    chk("Java 二进制不旧于源码（.class ≥ .java）", cls_new >= src_new,
        f"java={datetime.fromtimestamp(src_new):%H:%M:%S} class={datetime.fromtimestamp(cls_new):%H:%M:%S}"
        if cls_new < src_new else f"class@{datetime.fromtimestamp(cls_new):%H:%M:%S}")
    stale = False
    detail = ""
    if pid and start:
        try:
            start_t = time.mktime(time.strptime(start, "%Y-%m-%d %H:%M:%S"))
            # .class 晚于进程启动 → 服务起后又编过新类，进程内存里还是旧码
            stale = cls_new > start_t + 5  # 容差：启动后 JVM 自身少量重编译/文件系统时钟差
            detail = f"proc@{start} class@{datetime.fromtimestamp(cls_new):%H:%M:%S}"
        except ValueError:
            detail = f"启动时间解析失败: {start!r}"
    chk("服务进程启动晚于最新二进制（非旧进程）", bool(pid) and not stale, detail or "无法取进程启动时间")

    # ── D. Vite dev server 内容 = 当前工作树 ──
    marker_rel = "src/builder/run/RunBridge.ts"
    local = (ROOT / "frontend" / marker_rel).read_text(encoding="utf-8")
    # P4 追问2 修正：项目独有 token（非 TS 类型名/JS 内建——那些会被 esbuild 消掉）
    # 选 5 个本项目特有标识符，编译后保证存在
    stable = ['TS_ENGINE_TYPES', 'useRunBridge', 'runStates', 'NO_BODY', 'pickWireParams']
    tokens = re.findall(r"[A-Za-z_$][A-Za-z0-9_$]{6,}", local)
    picks = [t for t in stable if t in tokens] or [tokens[i] for i in (0, len(tokens)//4, len(tokens)//2, 3*len(tokens)//4, len(tokens)-1)]  # 回退
    try:
        served = urllib.request.urlopen(f"http://localhost:5173/{marker_rel}", timeout=8).read().decode("utf-8", "ignore")
        missing = [t for t in picks if t not in served]
        # TS→JS 转译可能消掉纯类型名（tree-shake/类型擦除），5 中 ≥4 视为同源
        chk("Vite 服务内容=工作树（5 项目独有 token ≥4 命中）", len(missing) <= 1,
            f"{5 - len(missing)}/5 命中" + (f" 缺失: {missing[:2]}" if missing else ""))
    except Exception as e:
        chk("Vite 服务内容=工作树", False, str(e)[:80])

    # ── E. Python 解释器 ──
    chk("Python 非 WindowsApps 别名", "WindowsApps" not in sys.executable, sys.executable)

    # ── F. Playwright 浏览器 ──
    pwb = os.environ.get("PLAYWRIGHT_BROWSERS_PATH")
    found = False
    detail = "未设 PLAYWRIGHT_BROWSERS_PATH"
    if pwb:
        hits = [d.name for d in Path(pwb).glob("chromium*")] if Path(pwb).exists() else []
        found = bool(hits)
        detail = f"{pwb} -> {hits[:2]}"
    chk("Playwright chromium 可用", found, detail)

    # ── G. 后端冒烟 ──
    try:
        code = urllib.request.urlopen("http://localhost:8080/actuator/health", timeout=8).getcode()
        chk("后端冒烟 /actuator/health", code == 200, f"HTTP {code}")
    except Exception as e:
        chk("后端冒烟 /actuator/health", False, str(e)[:80])

    # ── H. 前端走 dev 源码直出（无 build 产物路径）──
    try:
        html = urllib.request.urlopen("http://localhost:5173/", timeout=8).read().decode("utf-8", "ignore")
        chk("前端为 Vite dev 直出（/@vite/client，非 dist 产物）", "/@vite/client" in html,
            "dev签名" if "/@vite/client" in html else "疑似 build 产物/hmr 失效")
    except Exception as e:
        chk("前端为 Vite dev 直出", False, str(e)[:80])

    # ── I. Python 版本（3.12 为 E2E 基线）──
    chk("Python 版本 3.12.x", sys.version_info[:2] == (3, 12), sys.version.split()[0])

    # ── J. 数据库：无迁移工具（ddl-auto=validate + 无 Flyway/Liquibase）——
    #     盲区结论：schema 漂移不可版本化检测；现状钉死 = MySQL 版本 + 表数 + 健康态
    try:
        props = (ROOT / "java-backend" / "src" / "main" / "resources" / "application.properties").read_text(encoding="utf-8")
        ddl = next((l.split("=", 1)[1].strip() for l in props.splitlines() if "ddl-auto" in l), "?")
        out = subprocess.run(["mysql", "-h127.0.0.1", "-uroot", "-p123456", "-N", "-e",
                              "SELECT VERSION(); SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='physicene';"],
                             capture_output=True, text=True, timeout=10).stdout.split()
        chk("数据库可探（ddl-auto=validate，无迁移工具——漂移不可检测，列遗留）",
            len(out) >= 2, f"MySQL {out[0] if out else '?'} 表数 {out[1] if len(out) > 1 else '?'} ddl={ddl}")
    except Exception as e:
        chk("数据库可探", False, str(e)[:80])

    n_ok = sum(1 for _, ok, _ in checks if ok)
    print(f"\nENV-CHECK：{n_ok}/{len(checks)} {'✅ 允许回归' if n_ok == len(checks) else '❌ 先修环境再测'}")
    return 0 if n_ok == len(checks) else 1


if __name__ == "__main__":
    sys.exit(main())
