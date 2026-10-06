# Tab 合并方案设计（阶段 0 · 2026-10-06 · 只设计不实施）

## 1. 两 Tab 状态现状（实测复现：搭 8 件 → 结果 Tab 只剩 3 件）

```
┌─ 搭建 Tab (BuilderView, v-if 卸载式) ─┐   ┌─ 模块级单例（真共享）──┐   ┌─ 结果 Tab (LabView) ─┐
│ elements(reactive) ─卸载快照→ localStorage ─激活读→ scene.elements(副本，经物理包过滤) │
│ undo/redo(内存,切Tab即失)              │   │ WS: state(subjects/t/ │   │ replay(frames,REST)  │
│ selectedId/linkMode/records            │   │  keyEvents/vSeries/   │   │ ECharts 曲线         │
│ brokenRopes/我的场景(localStorage)      │   │  probes/simId) + WS   │   │ AI chat / OCR        │
│ 模板64/JSON 导入导出                    │   └───────────────────────┘   │ 后端场景(sceneId)     │
└────────────────────────────────────────┘    运行数据两侧同源 ✓         │ ?scene= 直进          │
                                                                        └──────────────────────┘
```

**共享**：WS 运行态全套（单例）。**独立（问题区）**：
- 场景本体 = localStorage 快照单向复制，且走 toPhysicsElements（物理包过滤器）——
  丢失五类：①bracket/pole/anchor_point（NO_BODY）②未连接的绳/簧/滑轮 ③未绑定传感器
  ④trail/timeline/vector_arrow/graph_tag ⑤**所有连线**（threeScene 无连线渲染通道）；
  身份畸变：capacitor_r→地面、coil_frame→方块、accelerating_platform→地面。
- undo/redo 卸载即失；两套保存体系（localStorage 我的场景 vs 后端 scenarios）。

## 2. 合并方案（页面结构）

单页 = 顶工具栏 + 中央画布 + 左侧栏（可切：元件库 / AI 助教）+ 底栏（可切：属性 / 数据曲线 / 回放时间轴）。
工具栏常驻：运行/暂停/单步/停止/复位/复位视角/维度/视角模式/保存（合并两套）/模板/导入导出。

## 3. 功能清单（防减少）——逐项落位，无一必须砍

| 原功能 | 落位 |
|---|---|
| 搭建：69 元件库/拖放/属性面板/撤销重做/快捷键/连线+冲突拦截/模板64/我的场景/JSON/运行控制/视角平移缩放/数据面板/临界事件/场景分析 | 全保留（画布=BuilderCanvas，面板=底栏/侧栏） |
| 结果：场景查看/曲线/回放时间轴/AI 助教/OCR/后端场景保存/?scene= 直进/状态读数 | 曲线+回放→底栏；AI+OCR→侧栏；保存→工具栏合并菜单；?scene=→?panel=replay |
| 重复项去重：两套维度切换/复位视角/状态读数 | 天然合一 |

## 4. 迁移路径——两步走（推荐）

- **Step 1 状态直通（1-1.5d）**：场景本体改共享 reactive 源；结果 Tab 直接渲染 GeoElement 原件
  （buildUnifiedMesh 原生支持）+ 连线渲染复用 syncLinks 逻辑进 threeScene。
  **此步即"显示不了"bug 的正确修复**，不动 Tab 结构，E2E 只增不改。
- **Step 2 UI 合并（3-4d）**：状态已通后并壳；成本大头是 f13 的 27 项 Tab 语义断言重写（~1-1.5d）。
- 反对一步到位：bug 修复与大改无法归因；门禁窗口期全项目裸奔。

## 5. 工作量

Step 1：1-1.5d；Step 2：3-4d（含 E2E 重写）；合计 4-5d。
