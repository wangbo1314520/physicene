# -*- coding: utf-8 -*-
"""labeler 65/65 逐卡 E2E（2C · 2026-10-11）：每张高考卡 → 讲解器挂载 → 题型标签非空
→ 完整解答 ≥6 段。不抽样、逐卡全跑（solutionId→SolutionBuilder→讲解模板三链逐卡验证；
problemType 的物理正确性由 exp-lib-check 逐卡物理断言把守，二者互补）。"""
import _env; _env.banner()
import json, re, sys, io, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"
API = "http://localhost:8080"

def login_api():
    req = urllib.request.Request(f"{API}/api/auth/login", method="POST",
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read().decode())["data"]

# 65 卡 id + summary 从 registry 源码静态提取（与运行时注册同源）
src = io.open('src/experiments/registry/gaokao.ts', encoding='utf-8').read()
IDS = re.findall(r"^  '(gk-[\w-]+)':", src, re.M)
SUMMARY = {}
for m in re.finditer(r"^  '(gk-[\w-]+)': \{[^}]*?summary: '([^']+)'", src, re.M):
    SUMMARY[m.group(1)] = m.group(2)

# 追问 1（标签正确性）：13 张跨章节精确期望——期望片段从卡片【摘要】独立导出（非从标签反推），
# 即"人工抽验"的代码化：每张断言标签含摘要指向的物理关键词
EXPECTED = {
    # 力学
    'gk-slope-spring': ['斜面', '弹簧', '能量'],
    'gk-circular-critical': ['圆周', '临界'],
    'gk-conveyor-board': ['传送带'],
    'gk-collision-spring': ['碰撞'],
    # 电磁
    'gk-accel-selector-b': ['筛选', '电场', '磁场'],
    'gk-cyclotron': ['回旋'],
    'gk-rail-rod': ['导轨', '导体棒'],
    # 热
    'gk-liquid-seal-tube': ['气体'],
    # 光
    'gk-prism-refraction': ['折射'],
    'gk-thin-film': ['干涉'],
    # 近代
    'gk-photoelectric-ek-nu': ['光电'],
    'gk-hydrogen-levels': ['能级'],
    'gk-nuclear-reaction': ['核'],
    # 词表法假阳性补录（摘要为'搭法描述'不含题型名的卡——期望词仍从摘要语义导出）：
    'gk-connected-bodies': ['连接体'],      # 摘要'水平面 F 拉 A-B/斜面+定滑轮/动滑轮三搭法'
    'gk-isochrone': ['等时'],               # 摘要'沿不同光滑弦下滑时间相等'
    'gk-rod-force': ['导体棒', '终速'],      # 摘要'恒力 F 拉棒…直到 F=B²L²v/R 终速'
    'gk-bohr-collision': ['玻尔'],           # 摘要'玻尔模型：碰撞激发与光子吸收'
    'gk-variable-force': ['变力'],           # 摘要'四种 F(x) 变力做功'
    'gk-mhd-generator': ['磁流体'],          # 摘要'等离子体通道+磁场发电'
    'gk-rigid-body': ['刚体'],               # 摘要'纯滚动竞速（转动+平动）'
}

# 全 65 张域一致性：标签须与摘要共享 ≥1 个域词（防张冠李戴：力学卡挂电学标签会被抓）
LEX = ['斜面', '弹簧', '滑块', '传送带', '板块', '连接体', '碰撞', '圆周', '等时', '晾衣',
       '多过程', '冲量', '斜抛', '超重', '失重', '变力', '单摆', '小量', '非惯性', '刚体',
       '电场', '磁场', '筛选', '质谱', '回旋', '导轨', '导体棒', '双杆', '电容', '输电',
       '变压器', '交变', '磁流体', '霍尔', '流量', '黑箱', '电表', '改装', '伏安', '线框',
       '示波', '复合场', '加速',
       '气体', '液封', '汽缸', '活塞', '打气', '抽气', '形管',
       '折射', '棱镜', '干涉', '衍射', '波动', '振动', '波的多解',
       '光电', '氢', '能级', '核', '物质波', '德布罗意', '玻尔']

def main() -> int:
    assert len(IDS) == 65, f"registry gk 卡数 {len(IDS)} ≠ 65"
    auth = login_api()
    fails = []
    with sync_playwright() as p:
        b = p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={"width": 1560, "height": 980})
        ctx.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                            f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        page = ctx.new_page()
        page.on("pageerror", lambda e: None)
        for idx, cid in enumerate(IDS, 1):
            try:
                page.goto(f"{BASE}/exp/{cid}", wait_until="domcontentloaded")
                page.wait_for_selector(".explainer", timeout=12000)
                tag = page.locator(".explainer .head .tag").inner_text().strip()
                page.locator(".explainer .head").click()
                page.wait_for_timeout(200)
                page.locator(".explainer .modes button", has_text="完整解答").click()
                page.wait_for_timeout(150)
                page.locator(".explainer .mini", has_text="全部展开").click()
                page.wait_for_timeout(200)
                n = page.locator(".explainer .sec h4").count()
                ok = len(tag) >= 2 and n >= 6
                detail = ""
                # 域一致性（全 65）
                summ = SUMMARY.get(cid, '')
                kw = [t for t in LEX if t in summ]
                exact_ok = cid in EXPECTED and all(e in tag for e in EXPECTED[cid])
                domain_ok = exact_ok or (any(t in tag for t in kw) if kw else True)
                if not domain_ok:
                    ok = False
                    detail = f" 域不一致!摘要词={kw[:4]}"
                # 精确期望（13 张）
                if cid in EXPECTED:
                    miss = [e for e in EXPECTED[cid] if e not in tag]
                    if miss:
                        ok = False
                        detail += f" 缺期望词{miss}"
                status = "✓" if ok else "✗"
                if not ok:
                    fails.append(cid)
                if not ok or idx % 10 == 0 or cid in EXPECTED:
                    print(f"  {status} [{idx}/65] {cid} tag={tag[:30]!r} sec={n}{detail}")
            except Exception as e:
                fails.append(cid)
                print(f"  ✗ [{idx}/65] {cid} EXC {str(e)[:60]}")
        b.close()
    print()
    if fails:
        print(f"❌ labeler 65 卡 E2E 失败（{len(fails)}）：{fails}"); return 1
    print("✅ labeler 65/65 全过：讲解器挂载 + 题型标签 + 完整解答≥6 段逐卡验证"); return 0

if __name__ == "__main__":
    sys.exit(main())
