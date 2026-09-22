"""E2E 共享环境 banner（测点1 前置·审查令）：每个 E2E 脚本开头 import _env; _env.banner()。
打印 GIT 提交 / Java 进程 PID+启动时间+二进制新旧 / Vite 内容一致性 / Python 解释器 / Playwright 浏览器路径。
P2.1 教训：8080 被旧进程占用导致 E2E 打旧二进制——banner 让每一轮回归的第一行就暴露这种漂移。"""
import os
import subprocess
import sys
import urllib.request


def _run(cmd: list[str], timeout=10) -> str:
    # 中文 Windows 的 netstat/tasklist 输出 GBK；显式解码防 reader 线程崩（P2.1 后环境自检教训）
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, encoding="gbk",
                           errors="replace", timeout=timeout, shell=False)
        return (r.stdout or "") + (r.stderr or "")
    except Exception:
        return ""


def git_info() -> tuple[str, str, int]:
    head = _run(["git", "rev-parse", "--short", "HEAD"]).strip()
    branch = _run(["git", "rev-parse", "--abbrev-ref", "HEAD"]).strip()
    status = _run(["git", "status", "--porcelain"])
    dirty = len([l for l in status.splitlines() if l.strip()])
    return head or "?", branch or "?", dirty


def java_proc() -> tuple[str, str, str]:
    """(pid, name, start_time)——8080 监听进程；空串=未监听/查询失败"""
    out = _run(["netstat", "-ano"], timeout=15)
    pids = set()
    for line in out.splitlines():
        if ":8080" in line and "LISTENING" in line.upper():
            parts = line.split()
            if parts:
                pids.add(parts[-1])
    if not pids:
        return "", "", ""
    pid = sorted(pids)[0]
    name = ""
    tlist = _run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV"])
    for line in tlist.splitlines():
        if f'"{pid}"' in line:
            cols = [c.strip('"') for c in line.split('","')]
            name = cols[0] if cols else ""
            break
    start = _run(["powershell", "-NoProfile", "-Command",
                  f"(Get-Process -Id {pid}).StartTime.ToString('yyyy-MM-dd HH:mm:ss')"]).strip()
    return pid, name, start


def vite_ok(base="http://localhost:5173") -> bool:
    try:
        urllib.request.urlopen(base, timeout=5)
        return True
    except Exception:
        return False


def banner() -> None:
    head, branch, dirty = git_info()
    pid, name, start = java_proc()
    py = sys.executable
    pw = os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "(default)")
    bad_py = "WindowsApps" in py
    java_desc = f"PID={pid}({name}) start={start}" if pid else "未监听!"
    if pid and "java" not in name.lower():
        java_desc += " [非java进程!]"
    print("════════ ENV ════════")
    print(f"GIT  : {head} ({branch}, dirty:{dirty})")
    print(f"JAVA : {java_desc}")
    print(f"VITE : {'up' if vite_ok() else 'DOWN!'} :5173")
    ver = sys.version.split()[0]
    print(f"PY   : {py} (py{ver}){' [WindowsApps别名-勿用!]' if bad_py else ''}")
    print(f"WPBW : {pw}")
    print("═════════════════════")
