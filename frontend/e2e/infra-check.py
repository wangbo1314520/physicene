"""基础设施回归套件（第三十六轮制度化）：stress（10 学生并发+保序）+ reconnect（断线重连）。
跑的频率：每批收尾必跑（交接文档制度）；判据：两脚本各自 PASS。"""
import subprocess, sys

SUITES = ["stress-check.py", "reconnect-check.py"]

def main() -> int:
    failed = []
    for s in SUITES:
        print(f"══ {s}")
        r = subprocess.run([sys.executable, f"e2e/{s}"], capture_output=True, text=True, encoding="utf-8", errors="replace")
        tail = (r.stdout or "").strip().splitlines()[-2:]
        for line in tail:
            print(f"  {line}")
        if r.returncode != 0:
            failed.append(s)
    if failed:
        print(f"INFRA FAIL: {failed}")
        return 1
    print("INFRA PASS：并发+重连两套件全过")
    return 0

if __name__ == "__main__":
    sys.exit(main())
