/**
 * 把 EMSceneDef 包装成可注册的 Vue 组件（单根 EMScene，record 事件转发给 ExperimentShell）
 */
import { defineComponent, h } from 'vue'
import EMScene from './EMScene.vue'
import type { EMSceneDef } from '../../engine/emScene'
import { accelDeflectScreen, bThenE } from './scenes/em1'
import { velocitySelector, massSpectrometer, eBEMulti } from './scenes/em2'
import { compositeField, cyclotron } from './scenes/em3'
import { railRod } from './scenes/em4'
import { voltAmmeterResistance, meterConversion } from './scenes/em5'
import { transformerTransmission, acFourValues } from './scenes/em6'
import { bbCombo, frameThroughB, rodInclineB } from './scenes/em7'
import { mhdGenerator, emFlowmeter, hallEffect } from './scenes/em8'

export function wrapEM(def: EMSceneDef<any>) {
  return defineComponent({
    name: def.id,
    emits: ['record'],
    setup(_, { emit }) { return () => h(EMScene, { def, onRecord: (d: unknown) => emit('record', d) }) },
  })
}

/** 同一场景的模型编号别名：换 id 与默认搭法（薄包装，规则 10） */
export function variantEM(def: EMSceneDef<any>, id: string, defaults: Record<string, number>) {
  const v: EMSceneDef<any> = { ...def, id, params: def.params.map((d) => (d.key in defaults ? { ...d, default: defaults[d.key] } : d)) }
  return wrapEM(v)
}

export const GkAccelDeflectScreen = wrapEM(accelDeflectScreen)
export const GkBThenE = wrapEM(bThenE)
export const GkVelocitySelector = wrapEM(velocitySelector)
export const GkMassSpectrometer = wrapEM(massSpectrometer)
export const GkEBEMulti = wrapEM(eBEMulti)
export const GkCompositeField = wrapEM(compositeField)
export const GkCyclotron = wrapEM(cyclotron)
export const GkRailRod = wrapEM(railRod)
export const GkRodFree = variantEM(railRod, 'gk-rod-free', { setup: 0 })
export const GkRodForce = variantEM(railRod, 'gk-rod-force', { setup: 1 })
export const GkDoubleRod = variantEM(railRod, 'gk-double-rod', { setup: 2 })
export const GkRodCapacitor = variantEM(railRod, 'gk-rod-capacitor', { setup: 3 })
export const GkVoltAmmeterResistance = wrapEM(voltAmmeterResistance)
export const GkMeterConversion = wrapEM(meterConversion)
export const GkTransformerTransmission = wrapEM(transformerTransmission)
export const GkTransformerDynamic = variantEM(transformerTransmission, 'gk-transformer-dynamic', { setup: 0 })
export const GkPowerTransmission = variantEM(transformerTransmission, 'gk-power-transmission', { setup: 1 })
export const GkAcFourValues = wrapEM(acFourValues)
export const GkBBCombo = wrapEM(bbCombo)
export const GkFrameThroughB = wrapEM(frameThroughB)
export const GkRodInclineB = wrapEM(rodInclineB)
export const GkMhdGenerator = wrapEM(mhdGenerator)
export const GkEmFlowmeter = wrapEM(emFlowmeter)
export const GkHallEffect = wrapEM(hallEffect)
