/**
 * 把 MechSceneDef 包装成可注册的 Vue 组件（单根 MechScene，record 事件转发给 ExperimentShell）
 */
import { defineComponent, h } from 'vue'
import MechScene from './MechScene.vue'
import type { MechSceneDef } from '../../engine/mechScene'
import { slopeSpring, conveyorBoard, connectedBodies } from './scenes/mech1'
import { collisionSpring, circularCritical, collisionChain } from './scenes/mech2'
import { isochrone, clothesline } from './scenes/mech3'
import { multistage, impulseMicro } from './scenes/mech4'
import { prismRefraction, waveMultiSolution, vibrationWaveGraphs } from './scenes/opt1'
import { photoelectricEkNu, hydrogenLevels } from './scenes/mod1'
import { obliqueProjectile, weightChange } from './scenes/mech5'

export function wrapScene(def: MechSceneDef<any>) {
  return defineComponent({
    name: def.id,
    emits: ['record'],
    setup(_, { emit }) { return () => h(MechScene, { def, onRecord: (d: unknown) => emit('record', d) }) },
  })
}

export const GkSlopeSpring = wrapScene(slopeSpring)
export const GkConveyorBoard = wrapScene(conveyorBoard)
export const GkConnectedBodies = wrapScene(connectedBodies)
export const GkCollisionSpring = wrapScene(collisionSpring)
export const GkCircularCritical = wrapScene(circularCritical)
export const GkCollisionChain = wrapScene(collisionChain)
export const GkIsochrone = wrapScene(isochrone)
export const GkClothesline = wrapScene(clothesline)
export const GkMultistage = wrapScene(multistage)
export const GkImpulseMicro = wrapScene(impulseMicro)
export const GkPrismRefraction = wrapScene(prismRefraction)
export const GkWaveMultiSolution = wrapScene(waveMultiSolution)
export const GkVibrationWaveGraphs = wrapScene(vibrationWaveGraphs)
export const GkPhotoelectricEkNu = wrapScene(photoelectricEkNu)
export const GkHydrogenLevels = wrapScene(hydrogenLevels)
export const GkObliqueProjectile = wrapScene(obliqueProjectile)
export const GkWeightChange = wrapScene(weightChange)
