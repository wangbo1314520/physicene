# processedData 数据字典 v1.2（B3 冻结，B6 归档）

> 版本：v1.2　状态：冻结　兼容：v1.0（B0）、v1.1（B2）向后兼容
> 存储位置：`experiment_session.processed_data` JSON 列，提交时随 Report content 导出

## 版本兼容性

| 版本 | 批次 | 新增字段 | 向下兼容 |
|:--|:--|:--|:--|
| v1.0 | B0 | 基础结构：paper/vector/trajectory/optical/gridCount/fieldLines/exports | — |
| v1.1 | B2 | tape（纸带）、simulation（约束实验模拟） | ✅ v1.0 字段不变 |
| v1.2 | B3 | field3d（3D 轨迹/场参数/粒子数据） | ✅ v1.0/v1.1 字段不变 |

## v1.0 字段（B0 冻结）

```typescript
interface ProcessedData {
  version: 1
  paper?: PaperState          // 坐标纸（描点-拟合类实验）
  vector?: VectorState        // 矢量图（力的合成）
  trajectory?: TrajectoryState // 轨迹图（平抛）
  optical?: OpticalState      // 光路图（折射/双缝）
  gridCount?: GridCountState // 方格计数（油膜法）
  fieldLines?: FieldLineState // 场线渲染
  exports?: { pngDataUrl?: string; svg?: string; csv?: string }
}
```

## v1.1 新增字段（B2 冻结）

```typescript
// 纸带数据（打点计时器族）
interface TapeState {
  period: number              // 打点周期 s（0.02 = 50Hz）
  nInterval: number          // 计数点间隔数（5 → 0.1s）
  countingX: number[]        // 计数点位置 (m)
  intervals: number[]        // 段位移
  acceleration: number | null // 逐差法加速度
  instantaneousVelocities: number[] // 各计数点瞬时速度
  averageVelocity: number
}

// 约束实验模拟数据
interface SimState {
  kind: 'spring' | 'pendulum' | 'conical' | 'newtonTube' | 'gasIsotherm' | 'workVelocity' | 'actionReaction'
  params?: Record<string, number>  // 关键参数
  results?: Record<string, number> // 关键测量结果
  series?: { x: number; y: number }[] // 采样序列（供坐标纸）
}
```

## v1.2 新增字段（B3 冻结）

```typescript
// 3D 实验数据
interface Field3DState {
  kind: 'lorentz' | 'ampere' | 'alphaScatter' | 'brownian' | 'transformer' | 'induction' | 'lenz' | 'emf'
  /** 3D 轨迹点序列 */
  trajectory3d?: { t: number; pos: { x: number; y: number; z: number }; vel: { x: number; y: number; z: number } }[]
  /** 场参数 */
  fieldParams?: { B?: number; E?: number; v0?: number; q?: number; N1?: number; N2?: number; U1?: number }
  /** 计算结果 */
  results?: Record<string, number | string>
  /** 3D 导出（PNG 截图） */
  pngDataUrl?: string
}
```

## 字段级合并策略（B6 定义）

### 合并原则
1. **顶层字段独立**：paper/tape/simulation/field3d 互不干扰，各自合并
2. **标量字段**：最后写入胜出（Last-Write-Wins）
3. **数组字段**（points/intervals/trajectory3d）：取长度更长的一方（更多数据=更完整）
4. **嵌套对象**（axes/fits/params）：递归合并，冲突字段取更新时间戳

### 合并算法
```typescript
function mergeProcessed(local: ProcessedData, remote: ProcessedData): ProcessedData {
  // 1. 取 version 较大者为基础
  // 2. 遍历 top-level key：只存在于一方 → 保留；两方都有 → 按类型合并
  // 3. 标量取 remote（服务端较新）；数组取 length 更长者
  // 4. exports 取 local（本地生成的资源）
}
```

### 冲突检测
- `version` 不一致 → 版本冲突（409）
- 同一字段两方 timestamp 差 < 2s → 疑似并发写入 → 提示用户选择
- 合并后 version = max(local, remote) + 1
