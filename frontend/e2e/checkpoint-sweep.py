# -*- coding: utf-8 -*-
"""checkpoint 巡检（2026-09-30 六轮追问3 制度化——'没跑过的脚本坏了没人知道'的机械防线）：
把不在日常回归矩阵里的 checkpoint 脚本集中跑一遍。频率：每个测点（checkpoint）必跑；
批收尾可选。任何一个 FAIL 都会暴露（exit 1）——死脚本要么被巡检出问题修掉，要么删除。

清单维护制度：新增 e2e 脚本若不在日常矩阵（builder-check/exp-lib-check/env-check/infra-check），
必须加入 SWEEP 清单；SWEEP 清单与目录差集=未登记脚本（lint 检查）。
用法：python e2e/checkpoint-sweep.py [--only f13,f11]（默认全量）
"""
import subprocess, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
# 巡检清单：日常矩阵外的全部浏览器/checkpoint 脚本（args: 脚本名 → 附加参数）
SWEEP = {
    "free-build-elements-check.py": [],  # P5b-3：器材级 E2E（pulley/检测器/显示）——每次测点跑
    "p0-redirect-check.py": [],
    "builder-smoke.py": [],
    "builder-payload-check.py": [],
    "builder-walkthrough.py": [],
    "builder-redo.py": [],
    "lab-redo.py": [],
    "f11-check.py": [],
    "f13-check.py": [],
    "f14-evidence.py": [],
    "p1-11cards-check.py": [],
    "p11-ts-render-check.py": [],
    "p2-coupling-check.py": [],
    "p21-coupling-physics-check.py": [],
    "p3b2-thermo-scenes-check.py": [],
    "p3b4-wave-scenes-check.py": [],
    "sim-demo-check.py": [],
    # 环境依赖：需 python-ai-service(8000) 已启动——AI 未起时第 1 项回退断言必红（非死脚本）
    "ai-tutor-check.py": [],
    "lab-check.py": [],
    "circuit-check.py": [],
}

# 已知失败（显式跟踪，不许静默）：修复后必须从这里删除。
# 首例 walkthrough 斜面吸附（断言过时，已修 10/10 后移除）。
# 第二例 ai-tutor：环境依赖——python-ai-service(8000) 未启动时第 1 项回退断言必红
# （回退行为本身正确）；跑 AI 路径需先起服务，非死脚本非代码缺陷
KNOWN_FAIL = {
    "ai-tutor-check.py": "环境依赖 python-ai-service(8000) 未启动——回退断言红；起服务后复跑应绿",
}

def main() -> int:
    only = []
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1].split(",")
    fails = []
    for name, args in SWEEP.items():
        if only and name not in only:
            continue
        print(f"══ {name}")
        r = subprocess.run([sys.executable, str(HERE / name), *args], capture_output=True, text=True, timeout=600)
        tail = (r.stdout + r.stderr).strip().splitlines()[-3:]
        for ln in tail:
            print("   " + ln)
        if r.returncode != 0:
            if name in KNOWN_FAIL:
                print(f"   ⚠ KNOWN_FAIL（跟踪中）: {KNOWN_FAIL[name]}")
            else:
                fails.append(name)
    print()
    if fails:
        print(f"❌ SWEEP FAIL: {fails}")
        return 1
    print("✅ SWEEP PASS：全部 checkpoint 脚本可跑且通过")
    return 0

if __name__ == "__main__":
    sys.exit(main())
