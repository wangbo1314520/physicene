# F1.4 验收证据包

## 复现命令（一条命令重抓全部）

```bash
cd frontend && PLAYWRIGHT_BROWSERS_PATH="E:/Program/playwright-browsers" python e2e/f14-evidence.py
```

前置：5173（dev server）+ 8080（Java）运行中；demo/demo1234 账号。

## 录屏规格

- 文件：`video/f14-90s.mp4`
- 时长：85.6s（85-95s 合规区间）
- 分辨率/帧率：1500x950 @ Playwright 默认录制帧率
- **连续录制不分段**
- 内容：E1 载入→模板→运行→数据面板 → 切 E2 → 矢量箭头+传感器演示→域切换→运行→keyEvents 面板 → 切回 E1 → E3 /exp→连接体运行→路由切回 E1 → 零错误终态

## 截图规格

- 全包 viewport=1500x950（与 lab-check/f13-check 一致）
- 每张对应 F1.3 矩阵已通过断言（manifest.tsv assertion_ref 列）

## E3 过渡入口声明

E3（/exp 直入）= **过渡入口**——redirect 上线后从准入矩阵移除，由 E2 承接其覆盖。E3 切回 = **路由级降级断言**（非真实切回状态复位验证）。

## 证据包结构

```
F14-验收证据/
├── README.md          ← 本文件
├── manifest.tsv       ← 逐张清单（机器可读）
├── shots/01-12.png    ← 12 张截图
├── video/f14-90s.mp4  ← 85.6s 连续录屏
└── logs/f14-capture.log ← 抓取过程日志
```
