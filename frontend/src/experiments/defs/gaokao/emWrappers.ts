/**
 * 把 EMSceneDef 包装成可注册的 Vue 组件（单根 EMScene，record 事件转发给 ExperimentShell）
 */
import { defineComponent, h } from 'vue'
import EMScene from './EMScene.vue'
import type { EMSceneDef } from '../../engine/emScene'
import { accelDeflectScreen, bThenE } from './scenes/em1'

export function wrapEM(def: EMSceneDef<any>) {
  return defineComponent({
    name: def.id,
    emits: ['record'],
    setup(_, { emit }) { return () => h(EMScene, { def, onRecord: (d: unknown) => emit('record', d) }) },
  })
}

export const GkAccelDeflectScreen = wrapEM(accelDeflectScreen)
export const GkBThenE = wrapEM(bThenE)
