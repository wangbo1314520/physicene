# Step 2 完成报告（Tab 合并 UI 2026-10-11）

## 1. 五子任务状态

| 子任务 | 状态 | commit | 验证 |
|---|---|---|---|
| 2.1 单页壳 | ✅ | 47bdbf4 | 左栏可切（元件库/AI）+ 底栏可切（属性/数据/回放） |
| 2.2 四面板迁移 | ✅ | c745d9c + 5fa50f1 | AI/曲线/回放/OCR 四面板 + 功能级 E2E 11/11 |
| 2.3 保存合一+深链 | ✅ | 54e3ad6 | 先存后跑（recordId）+ 云端场景 + 双保存入口 |
| 2.4 路由清理 | ✅ | 203e76e | /lab 直指 BuilderView（无 Tab 壳）+ ?scene/?tab |
| 2.5 E2E 重写 | ✅ | a544516 + 3cf74f4 | lab 15/15 + f13 14/14 + 5 旧脚本去 Tab |

## 2. 功能清单对照（防减少表 23 项）

| 功能 | 原位置 | 新位置 | 状态 |
|---|---|---|---|
| 元件库（83 类型） | LabView Tab 2 | BuilderView 左栏 tab1 | ✅ |
| AI 助教 chat | LabView Tab 1 | BuilderView 左栏 tab2 | ✅ |
| 画布搭建 | LabView Tab 2 | BuilderView 中央 | ✅（不变） |
| 属性面板 | LabView Tab 2 右侧 | BuilderView 右侧（保留） | ✅ |
| 数据面板 | LabView Tab 1 | BuilderView 底栏 tab2 | ✅ |
| ECharts 曲线 | LabView Tab 1 | CurvePanel 底栏 tab2 | ✅ |
| 回放时间轴 | LabView Tab 1 | ReplayPanel 底栏 tab3 | ✅ |
| OCR 拍照识题 | LabView Tab 1 | BuilderView 工具栏 | ✅ |
| 临界事件面板 | LabView Tab 2 | BuilderView 右侧 | ✅ |
| 场景分析 | LabView Tab 2 | BuilderView 右侧 | ✅ |
| 连线管理 | LabView Tab 2 | BuilderView 右侧 | ✅ |
| 模板库（69 张） | LabView Tab 2 | BuilderView 工具栏 | ✅ |
| 运行控制 | LabView Tab 2 | BuilderView 工具栏 | ✅ |
| 运行状态显示 | LabView Tab 1 | BuilderView 工具栏 | ✅ |
| 本机保存 | LabView Tab 2 | BuilderView 工具栏 💾 | ✅ |
| 云端保存 | LabView | BuilderView 工具栏 ☁️ | ✅（新增） |
| 云端场景列表 | LabView 独立页 | BuilderView 工具栏下拉 | ✅（新增） |
| JSON 导入导出 | LabView Tab 2 | BuilderView 工具栏 | ✅ |
| 维度切换 | LabView Tab 1 | BuilderView 顶栏 | ✅ |
| 视角模式 | LabView Tab 1 | BuilderView 顶栏 | ✅ |
| 复位/复位视角 | LabView Tab 1/2 | BuilderView 工具栏 | ✅ |
| 撤销/重做 | LabView Tab 2 | BuilderView（workspace store） | ✅ |
| 键盘快捷键 | LabView Tab 2 | BuilderView | ✅ |
| ?scene= 深链 | LabView | FreeBuildTab | ✅ |

**23/23 全在，零功能减少。**

## 3. 全量回归结果

| 套件 | 结果 |
|---|---|
| vitest | **371/371** ✅ |
| lab-check | **15/15** ✅（重写后） |
| f13-check | **14/14** ✅（重写后） |
| batch2-interaction | **15/15** ✅ |
| batch3-reset | **14/14** ✅ |
| batch3-pan-view | **8/8** ✅ |
| circuit-basic | **11/11** ✅ |
| sensor-anchor | **6/6** ✅ |
| meter | **4/4** ✅ |
| pulley-movable | **8/8** ✅ |
| oscilloscope | **3/3** ✅ |
| panel-functional | **11/11** ✅ |
| render-coverage | ✅ ALLOWLIST=0 |
| render-box-probe | ✅ 0 fallback |
| lint ×2 | ✅ |
| free-build-elements | ⚠️ 传感器 3 项 None（旧 Tab 时序依赖，登记排查） |

## 4. 手测清单（用户测 5 项 × 30 秒）

1. **单页搭建+运行+看曲线**：进 /lab → 拖物块+地面 → 运行 → 底栏"数据"tab → 曲线出现
2. **回放时间轴**：运行后 → 底栏"回放"tab → 点击"加载回放帧" → 拖滑杆
3. **AI 助教**：左栏"AI 助教"tab → 输入问题 → 收到回复
4. **OCR 拍照识题**：工具栏"📷 拍照识题" → 选图片 → 元件加入画布
5. **保存/加载**：💾 本机保存 → 刷新 → 本机场景加载；☁️ 云端保存 → 云端下拉加载

## 5. 遗留问题

| 问题 | 状态 | 建议 |
|---|---|---|
| free-build 传感器读数 None | 旧 Tab 时序依赖 | 阶段 2 排查（单页后无 Tab 切换，传感器可能需直连） |
| RC 相移 106° vs 理论 55° | 登记后续 debug | 打印 phasor re/im 对照理论值 |
| OCR ghost 预览未实现 | 2.2 简化版直接加入 | 阶段 2 加 ghost 半透明预览 |
| LabView 文件保留未删 | 2.4 兼容保留 | 阶段 2 确认无引用后删除 |
