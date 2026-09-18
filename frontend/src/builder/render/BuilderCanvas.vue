<script setup lang="ts">
/**
 * 统一搭建台画布（阶段三④）：正交相机俯视 XY 物理平面（1 单位 = 1 m）。
 * 职责：元件网格同步渲染（buildUnifiedMesh）、锚点手柄（选中件常显 / 连线模式全显）、
 * 拖拽 + 吸附预览（findSnap 实时、松手由父级提交）、连线渲染、HTML5 拖放落点换算、滚轮缩放。
 * 元件状态全部由父级持有（单向数据流），本组件无本地业务状态。
 */
import { onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import * as THREE from 'three'
import type { GeoElement, AnchorTemplate } from '../catalog'
import { byType } from '../catalog'
import { findSnap } from '../model/snap'
import { buildUnifiedMesh, buildConnectionLine, updateLine, updateHelix } from './Renderer'

const props = defineProps<{
  elements: GeoElement[]
  selectedId: string | null
  linkMode: boolean
  /** 连线模式下已选中的第一锚点（高亮） */
  linkFrom: { id: string; anchorId: string } | null
  /** 运行态帧位姿（RunBridge.runStates）；非空时画布按帧驱动、禁用编辑 */
  runStates?: Map<string, { x: number; y: number; angle?: number }> | null
}>()
const emit = defineEmits<{
  (e: 'select', id: string | null): void
  (e: 'dragging', id: string, x: number, y: number): void
  (e: 'drop'): void
  (e: 'anchor-pick', pick: { id: string; anchorId: string }): void
  (e: 'add-at', type: string, x: number, y: number): void
}>()

const rootEl = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.OrthographicCamera
let rafId = 0
let disposed = false

const meshMap = new Map<string, { obj: THREE.Object3D; baseAngle: number; tick?: (dt: number) => void }>()
const lineMap = new Map<string, THREE.Line>()
let anchorGroup: THREE.Group
let overlayGroup: THREE.Group   // 吸附预览（黄线 + 锚点圈）
let selectionBox: THREE.BoxHelper | null = null

const raycaster = new THREE.Raycaster()
const ndc = new THREE.Vector2()
const planeZ0 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
const worldPt = new THREE.Vector3()
const dragState = reactive<{ id: string | null; grabX: number; grabY: number }>({ id: null, grabX: 0, grabY: 0 })

const VIEW_H = 14 // 可视高度（米），宽度随纵横比

function setup() {
  const el = rootEl.value!
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x14142a, 1)
  el.appendChild(renderer.domElement)

  scene = new THREE.Scene()
  camera = new THREE.OrthographicCamera(-10, 10, VIEW_H / 2, -VIEW_H / 2, 0.1, 100)
  camera.position.set(0, 0, 30)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.75))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(6, 10, 20)
  scene.add(dir)

  const grid = new THREE.GridHelper(40, 40, 0x2a2a4a, 0x1f1f38)
  grid.rotation.x = Math.PI / 2 // XZ → XY 物理平面
  scene.add(grid)

  anchorGroup = new THREE.Group()
  overlayGroup = new THREE.Group()
  scene.add(anchorGroup, overlayGroup)

  resize()
}

function resize() {
  const el = rootEl.value
  if (!el || !renderer) return
  const w = el.clientWidth || 800, h = el.clientHeight || 560
  renderer.setSize(w, h)
  const aspect = w / h
  camera.left = (-VIEW_H * aspect) / 2
  camera.right = (VIEW_H * aspect) / 2
  camera.top = VIEW_H / 2
  camera.bottom = -VIEW_H / 2
  camera.updateProjectionMatrix()
}

let resizeObs: ResizeObserver | null = null

/** 屏幕像素 → 世界坐标（z=0 平面） */
function toWorld(clientX: number, clientY: number): { x: number; y: number } {
  const el = rootEl.value!
  const r = el.getBoundingClientRect()
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  raycaster.ray.intersectPlane(planeZ0, worldPt)
  return { x: worldPt.x, y: worldPt.y }
}

/** 命中测试：返回元件 id（含子网格向上回溯） */
function hitElement(clientX: number, clientY: number): string | null {
  const el = rootEl.value!
  const r = el.getBoundingClientRect()
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  for (const [id, entry] of meshMap) {
    const hits = raycaster.intersectObject(entry.obj, true)
    if (hits.length) return id
  }
  return null
}

/** 命中锚点手柄（连线模式） */
function hitAnchor(clientX: number, clientY: number): { id: string; anchorId: string } | null {
  const el = rootEl.value!
  const r = el.getBoundingClientRect()
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObjects(anchorGroup.children, false)
  for (const h of hits) {
    const u = h.object.userData as { anchorOf?: string; anchorId?: string }
    if (u.anchorOf && u.anchorId) return { id: u.anchorOf, anchorId: u.anchorId }
  }
  return null
}

// ── 网格同步 ──
/** 元件有效位姿：运行态取帧位姿，编辑态取元件状态 */
function poseOf(e: GeoElement): { x: number; y: number; angle: number } {
  const r = props.runStates?.get(e.id)
  return r ? { x: r.x, y: r.y, angle: r.angle ?? e.angle } : { x: e.position.x, y: e.position.y, angle: e.angle }
}
function syncMeshes() {
  const seen = new Set<string>()
  for (const e of props.elements) {
    seen.add(e.id)
    let entry = meshMap.get(e.id)
    if (!entry) {
      const built = buildUnifiedMesh(e)
      built.mesh.userData.elemId = e.id
      scene.add(built.mesh)
      entry = { obj: built.mesh, baseAngle: built.baseAngle, tick: built.tick }
      meshMap.set(e.id, entry)
    }
    const pose = poseOf(e)
    entry.obj.position.set(pose.x, pose.y, 0)
    entry.obj.rotation.z = pose.angle + entry.baseAngle
  }
  for (const [id, entry] of meshMap) {
    if (!seen.has(id)) {
      scene.remove(entry.obj)
      entry.obj.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
      meshMap.delete(id)
    }
  }
  syncLinks()
}

/** 连接线：owner.links 一条一段线，端点 = 两锚点世界坐标（运行态跟随帧位姿） */
function anchorWorldPos(e: GeoElement, tmpl: AnchorTemplate): { x: number; y: number } {
  const pose = poseOf(e)
  const c = Math.cos(pose.angle), s = Math.sin(pose.angle)
  return { x: pose.x + c * tmpl.local.x - s * tmpl.local.y, y: pose.y + s * tmpl.local.x + c * tmpl.local.y }
}
function syncLinks() {
  const seen = new Set<string>()
  for (const e of props.elements) {
    const spec = byType.get(e.type)
    for (const l of e.links) {
      const key = `${e.id}:${l.anchorA}->${l.toId}:${l.anchorB}`
      seen.add(key)
      let line = lineMap.get(key)
      if (!line) {
        line = buildConnectionLine(l.kind === 'pulley-rope' ? 'pulley-rope' : l.kind)
        scene.add(line)
        lineMap.set(key, line)
      }
      const target = props.elements.find((t) => t.id === l.toId)
      const ta = spec?.anchors?.find((a) => a.id === l.anchorA)
      const tb = target ? byType.get(target.type)?.anchors?.find((a) => a.id === l.anchorB) : undefined
      if (target && ta && tb) {
        const pa = anchorWorldPos(e, ta), pb = anchorWorldPos(target, tb)
        if (l.kind === 'spring') updateHelix(line, pa.x, pa.y, pb.x, pb.y)
        else updateLine(line, pa.x, pa.y, pb.x, pb.y)
      }
    }
  }
  for (const [key, line] of lineMap) {
    if (!seen.has(key)) { scene.remove(line); line.geometry.dispose(); (line.material as THREE.Material).dispose(); lineMap.delete(key) }
  }
}

/** 锚点手柄：选中件常显（蓝），连线模式全显（暗），已选第一锚点高亮（黄）；运行态隐藏 */
function syncAnchors() {
  if (props.runStates) {
    while (anchorGroup.children.length) {
      const c = anchorGroup.children.pop()!
      ;(c as THREE.Mesh).geometry.dispose()
    }
    return
  }
  while (anchorGroup.children.length) {
    const c = anchorGroup.children.pop()!
    ;(c as THREE.Mesh).geometry.dispose()
  }
  for (const e of props.elements) {
    const spec = byType.get(e.type)
    if (!spec?.anchors) continue
    const isSel = e.id === props.selectedId
    if (!isSel && !props.linkMode) continue
    for (const tmpl of spec.anchors) {
      const p = anchorWorldPos(e, tmpl)
      const fromLink = props.linkFrom?.id === e.id && props.linkFrom.anchorId === tmpl.id
      const color = fromLink ? 0xf5c542 : isSel ? 0x4a90d9 : 0x565675
      const size = props.linkMode ? 0.11 : 0.07
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(size, 10, 8),
        new THREE.MeshBasicMaterial({ color, depthWrite: false, transparent: true, opacity: props.linkMode || fromLink || isSel ? 1 : 0.5 }))
      dot.position.set(p.x, p.y, 0.3)
      dot.userData = { anchorOf: e.id, anchorId: tmpl.id }
      anchorGroup.add(dot)
    }
  }
}

function syncSelection() {
  if (selectionBox) { scene.remove(selectionBox); selectionBox.geometry.dispose(); selectionBox = null }
  const e = props.elements.find((x) => x.id === props.selectedId)
  const entry = e ? meshMap.get(e.id) : null
  if (entry) {
    selectionBox = new THREE.BoxHelper(entry.obj, 0xf5c542)
    scene.add(selectionBox)
  }
}

/** 吸附预览：拖拽中实时画锚点对连线 */
function drawSnapPreview() {
  while (overlayGroup.children.length) {
    const c = overlayGroup.children.pop()!
    ;(c as THREE.Mesh).geometry.dispose()
  }
  if (!dragState.id) return
  const dragged = props.elements.find((x) => x.id === dragState.id)
  if (!dragged) return
  const snap = findSnap(dragged, props.elements)
  if (!snap) return
  const draggedEl = dragged
  const target = props.elements.find((x) => x.id === snap.targetId)
  const ta = byType.get(draggedEl.type)?.anchors?.find((a) => a.id === snap.anchorA)
  const tb = target ? byType.get(target.type)?.anchors?.find((a) => a.id === snap.anchorB) : undefined
  if (!target || !ta || !tb) return
  const pa = anchorWorldPos(draggedEl, ta), pb = anchorWorldPos(target, tb)
  const line = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([pa.x, pa.y, 0.4, pb.x, pb.y, 0.4], 3)),
    new THREE.LineBasicMaterial({ color: 0xf5c542 }))
  overlayGroup.add(line)
  for (const p of [pa, pb]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.14, 20), new THREE.MeshBasicMaterial({ color: 0xf5c542, side: THREE.DoubleSide, depthWrite: false, transparent: true, opacity: 0.9 }))
    ring.position.set(p.x, p.y, 0.4)
    overlayGroup.add(ring)
  }
}

// ── 指针交互 ──
function onPointerDown(ev: PointerEvent) {
  if (ev.button !== 0 || props.runStates) return
  if (props.linkMode) {
    const a = hitAnchor(ev.clientX, ev.clientY)
    if (a) { emit('anchor-pick', a); return }
  }
  const id = hitElement(ev.clientX, ev.clientY)
  emit('select', id)
  if (id) {
    const w = toWorld(ev.clientX, ev.clientY)
    const e = props.elements.find((x) => x.id === id)
    if (e) {
      dragState.id = id
      dragState.grabX = e.position.x - w.x
      dragState.grabY = e.position.y - w.y
      ;(ev.target as HTMLElement).setPointerCapture(ev.pointerId)
    }
  }
}
function onPointerMove(ev: PointerEvent) {
  if (!dragState.id) return
  const w = toWorld(ev.clientX, ev.clientY)
  emit('dragging', dragState.id, w.x + dragState.grabX, w.y + dragState.grabY)
}
function onPointerUp() {
  if (dragState.id) { dragState.id = null; emit('drop') }
}
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  camera.zoom = THREE.MathUtils.clamp(camera.zoom * (ev.deltaY < 0 ? 1.12 : 0.89), 0.4, 4)
  camera.updateProjectionMatrix()
}

// ── HTML5 拖放（面板 → 画布） ──
function onDragOver(ev: DragEvent) { ev.preventDefault() }
function onDrop(ev: DragEvent) {
  const type = ev.dataTransfer?.getData('application/x-builder-type')
  if (!type) return
  ev.preventDefault()
  const w = toWorld(ev.clientX, ev.clientY)
  emit('add-at', type, w.x, w.y)
}

// ── 渲染循环 ──
let lastT = 0
function loop(t: number) {
  if (disposed) return
  rafId = requestAnimationFrame(loop)
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0
  lastT = t
  for (const entry of meshMap.values()) entry.tick?.(dt)
  syncLinks()
  syncAnchors()
  syncSelection()
  drawSnapPreview()
  if (selectionBox) selectionBox.update()
  renderer!.render(scene, camera)
}

onMounted(() => {
  setup()
  resizeObs = new ResizeObserver(() => resize())
  resizeObs.observe(rootEl.value!)
  syncMeshes()
  rafId = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(rafId)
  resizeObs?.disconnect()
  renderer?.dispose()
  renderer = null
})

watch(() => props.elements, () => syncMeshes(), { deep: true })

defineExpose({
  /** E2E：当前拖拽态下的吸附提案 */
  snapOf: (id: string) => {
    const e = props.elements.find((x) => x.id === id)
    return e ? findSnap(e, props.elements) : null
  },
})
</script>

<template>
  <div
    ref="rootEl"
    class="bcanvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
    @dragover="onDragOver"
    @drop="onDrop"
  ></div>
</template>

<style scoped>
.bcanvas { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 10px; touch-action: none; }
.bcanvas :deep(canvas) { display: block; }
</style>
