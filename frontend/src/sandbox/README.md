# 自由搭建实验（B13 沙盒）— 模块说明

入口 `/sandbox`。定位：老师自由搭场景投屏讲解、学生自由探究与做题验证；AI 在旁识别场景、讲规律与思路、直接答疑。

## 文件

| 文件 | 职责 |
|:--|:--|
| `catalog.ts` | 元件目录（89 项，六大类）。每项：`type / label / icon / domain / dims / params(规格) / tags(识别标签)`。新增元件只改这里 |
| `recognizer.ts` | 场景识别器：`RULES`（58 条）按 `need` 标签集合匹配、`forbid` 排斥、`bonus` 加分；`build(els)` 返回求解器目标与参数映射。目标五类：`mech`（MechSceneDef）/ `em`（EMSceneDef）/ `component`（独立 Vue 场景）/ `circuit`（CircuitEditor 托盘）/ `dyn4j`（交接 /lab）/ `link`（教材实验） |
| `SandboxView.vue` | 顶栏（场景名 / 维度 / 保存 / JSON / PNG）+ 元件面板 + 画布（拖拽、连线、撤销重做）+ 属性面板 + 识别卡 + 内嵌运行器 + 底部数据面板与 AI 助手；DEV 钩子 `window.__sandbox`（add/link/clear/run/recognize/records/elements/setName） |
| `SandboxData.vue` | 记录表（自动解析数值字段）、x/y 自选 → `GraphPaper` 坐标纸、CSV 导出 |
| `SandboxAi.vue` | 分析 / 提示 / 讲解 / 变式 四模式（模板来自被识别场景的 `solution(params)`）+ 真 AI 问答（`experiments/data/aiAgent.ts`） |
| `sandbox-ledger.test.ts` | 对账：目录完整性、规则标签有效性、十个验收场景识别结果；生成 `docs/自由搭建-元件对账表.md` |

## 新增一个可识别的组合（三步）

1. `catalog.ts`：确认涉及元件都有对应 `tags`（没有就加元件或加标签）。
2. `recognizer.ts` 的 `RULES`：加一条 `{ id, title, need: ['标签A','标签B'], forbid?, build: (els) => ({ target: M(someDef) | E(someDef), params: {...由元件参数映射...} }) }`。目标 def 来自 `experiments/defs/gaokao/scenes/*`，参数键必须是该 def 的 `params[].key`。
3. `e2e/sandbox-check.py` 加一个场景（元件清单 + 期望 family + 物理断言），`sandbox-ledger.test.ts` 的 `SCENARIOS` 同步一份。

## 运行链路

元件 → `recognize()` → `runnerDef`（把映射参数写成 def 的默认值）→ `<MechScene :def>` / `<EMScene :def>` / `<component :is>` / `<CircuitEditor :palette>` → `@record` 进数据面板。改任何元件参数都会停止运行并重识别，按「识别并运行」再跑。

## 已知边界

见 `docs/B13-验收报告.md` §5：最像规则取一、本机持久化、无单步/回放、3D PNG 受限。
