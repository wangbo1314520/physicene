import { describe, it, expect } from 'vitest'
import { springTensionState, isRopeSlack } from './renderStates'

describe('渲染尾项判定（第三十四轮）', () => {
  it('弹簧：压缩/拉伸/自然长三态（1mm 容差带）', () => {
    expect(springTensionState(0.8, 1.0)).toBe('compressed')
    expect(springTensionState(1.3, 1.0)).toBe('stretched')
    expect(springTensionState(1.0, 1.0)).toBe('natural')
    expect(springTensionState(1.0005, 1.0)).toBe('natural')   // 容差带内不抖动
  })
  it('绳：锚距 < 绳长即松弛（虚线）', () => {
    expect(isRopeSlack(0.9, 1.0)).toBe(true)
    expect(isRopeSlack(1.0, 1.0)).toBe(false)
    expect(isRopeSlack(1.05, 1.0)).toBe(false)
  })
})
