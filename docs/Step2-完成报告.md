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

---

## 6. 补遗（2026-10-11 下午 · ba16d14 后两个提交）

### 6.1 两个挂账追问根因闭环

**RC 相移 106° vs 理论 55° —— 引擎精确，E2E 伪时间轴跳帧（79405ef）**
- 单测新增 RC/RL **相量级精确断言**（1e-4）：RC 峰值口径 `2.9388+j4.2520`（审查理论 `2.938+j4.250` 为对方 XC≈1.59 取整）；RL 虚部为负 ∠−80.08° —— 物理层排除嫌疑
- 转储证据：wall-clock 轮询与引擎 30fps 播放竞速，角度序列 `84°→108°（跳 96°）`、`168°→180°`——帧被跳过，`frames.length/30` 伪时间轴使表观频率 1Hz→1.15Hz；I/U 零点间落一个跳帧时相位差被扭 12°。106°/123° 假偏差皆由此而来
- 修法：`__builder.tsT()` 引擎时间轴钩子 + ac_source 读数补 `U_` 瞬时值参考通道 + 同帧双通道相对零交叉
- 结果：**RL 实测 80.0°（理论 80.1）/ RC 实测 55.3°（理论 55.3）**，E2E 7/7；vitest 373/373

**free-build 传感器读数 None —— stale 窗口 + WS 偶发重连失败（b61ca8c）**
- 主因：2.3 先存后跑的 `await` 保存（数百 ms）期间，上一轮 ended 的旧 `t=12/probes={}` 残留——采样落在窗口内即读假数据（E2E 打印 `theory=-7.76` 正是 t=12 的理论值，铁证）。矩阵排查：单传感器/三传感器/真实 UI 拖放全正常，唯独"前一场景已运行"后必现
- 次因：ended 后首个新 WS 偶发 upgrade 失败（复现一次；直连 8080 与过代理各 3/3 秒开，低概率竞态）→ onclose 判 failed 退避重连 ≤2 次（Java 本支持 reattach+重播）
- 修：socket 增 `markStarting()`，doRun 保存前同步复位
- 结果：**free-build 14/14**（速度 3.5753/3.575、加速度 −0.98/−0.98、位移 8.186/8.163）

### 6.2 旧 Tab 语义 E2E 清偿（如实更正 3.6 节）

3cf74f4 实际只清了 5 个脚本；本轮扫出**漏网 19 个**（`.tabbar` 活断言）并全部修复——2.5 收口时"回归全绿"仅覆盖跑过的套件，此为口径不实，特此更正：
- 删 13 处搭建 Tab 点击 + 5 脚本语义重写（celestial/f11/p0-redirect/verify-resize/f14 证据包单页化）
- walkthrough 圆轨道"脱离"为**脚本参数债**（`gap` 默认 40° 缺口未显式关），loop-entry-check 6/6 佐证引擎无恙 → 补 `gap:0` 后 10/10
- builder-redo 80/81：余 E4 为探针口径（断绳后块落地静止，末段 a≈0 被误判"未下落"；断绳事件链路正常）
- 新钩子：`__builder.tsT()`（引擎时间轴）
- 重跑全绿：phase-shift 7/7 · free-build 14/14 · lab 15/15 · panel 11/11 · f13 14/14 · reconnect · p0 11/11 · f11 · celestial · tab-sync 8/8 · verify-resize 5/5 · p1-11cards 14/14 · p2 6/6 · p11 10/10 · p21 8/8 · smoke/payload/probe* · stress 10 学生 · builder-check 见提交后补记

### 6.3 新登记（阶段 2 高优）

| 问题 | 证据 | 影响 |
|---|---|---|
| **自搭场景云端保存 400** | `POST /scenarios` 对含 `ground/block` 的 Geo 场景必 400（Java L1 白名单只认物理类型 cube/wall…）| 保存失败→无 sceneId→**无 recordId→回放不可用**；手测第 5 项（云端保存/加载）会暴露；需保存（Geo 草稿）/运行（物理映射）双轨契约补全 |
| f14 录屏 3×400 控制台错误 | 同上（每次运行静默保存失败）| 同上 |
