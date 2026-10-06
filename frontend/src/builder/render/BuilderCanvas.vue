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
import { accelFromWindow, shouldShowArrow } from '../model/vectorArrow'
import { springTensionState, isRopeSlack } from '../model/renderStates'
import { resolveAnchors } from '../model/anchors'
import { buildUnifiedMesh, buildConnectionLine, updateLine, updateHelix } from './Renderer'

const props = defineProps<{
  elements: GeoElement[]
  selectedId: string | null
  linkMode: boolean
  /** 连线模式下已选中的第一锚点（高亮） */
  linkFrom: { id: string; anchorId: string } | null
  /** 运行态帧位姿（RunBridge.runStates）；非空时画布按帧驱动、禁用编辑 */
  runStates?: Map<string, { x: number; y: number; angle?: number }> | null
  /** D5 断绳集合（rope 元件 id）：断后连线改两段垂挂贝塞尔（纯渲染） */
  brokenRopes?: Set<string>
  /** P1.1·TS 引擎光线叠加（光学：折射/反射光线段；近代：不渲染光线只有读数） */
  tsRays?: { x0: number; y0: number; x1: number; y1: number; kind: string; medium?: string }[]
  /** 运行态主体读数（vector_arrow 跟随的速度/加速度数据源） */
  subjects?: { id: string; x: number; y: number; vx: number; vy: number; angle?: number }[] | null
  /** 手测 Bug3：观看视角（'2D'|'2.5D'|'3D'）——物理/构建恒在 x-y 平面，切换仅改相机；
      toWorld/hit 走射线对任意相机成立，拖拽/吸附/连线不受影响 */
  viewMode?: '2D' | '2.5D' | '3D'
}>()
const emit = defineEmits<{
  (e: 'select', id: string | null): void
  (e: 'dragging', id: string, x: number, y: number): void
  (e: 'drop', shiftSkip: boolean): void
  (e: 'anchor-pick', pick: { id: string; anchorId: string }): void
  (e: 'add-at', type: string, x: number, y: number): void
}>()

const rootEl = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene
let camera: THREE.OrthographicCamera
// Bug3：透视相机（2.5D/3D 观看）——orbitAzim/orbitPolar/dist 仅 3D 可调（右键拖转）
let pCamera: THREE.PerspectiveCamera | null = null
let activeCamera: THREE.Camera
const orbit = { azim: Math.PI / 4, polar: Math.PI / 3.4, dist: 26 }
let viewModeNow: '2D' | '2.5D' | '3D' = '2D'
// 批 3·5.3 平移：相机世界偏移（中键拖）。2D=正交相机平移；2.5D/3D=连同 lookAt 目标一起偏移。
const pan = { x: 0, y: 0 }
const ORBIT_HOME = { azim: Math.PI / 4, polar: Math.PI / 3.4, dist: 26 }

function applyPan2D() {
  camera.position.set(pan.x, pan.y, 30)   // 正交轴对齐：改 position 即纯平移，无需重 lookAt
}

function placePerspective() {
  if (!pCamera) return
  const y = orbit.dist * Math.cos(orbit.polar)
  const r = orbit.dist * Math.sin(orbit.polar)
  pCamera.position.set(pan.x + r * Math.cos(orbit.azim), pan.y + y, r * Math.sin(orbit.azim))
  pCamera.lookAt(pan.x, 1 + pan.y, 0)
}
function applyViewMode(mode: '2D' | '2.5D' | '3D') {
  if (mode === viewModeNow || !renderer) return
  viewModeNow = mode
  if (mode === '2D') {
    activeCamera = camera
  } else {
    if (!pCamera) {
      pCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 300)
    }
    if (mode === '2.5D') { orbit.azim = Math.PI / 4; orbit.polar = Math.PI / 3.4; orbit.dist = 26 }
    if (mode === '3D') { orbit.azim = Math.PI / 2.6; orbit.polar = Math.PI / 4.2; orbit.dist = 24 }  // 初始角异于 2.5D（可辨识），右键可继续环绕
    placePerspective()
    activeCamera = pCamera
  }
  resize()
}
watch(() => props.viewMode, (m) => applyViewMode(m ?? '2D'))
let rafId = 0
let disposed = false

const meshMap = new Map<string, { obj: THREE.Object3D; baseAngle: number; tick?: (dt: number) => void; sig: string }>()
/** vector_arrow 加速度差分的上一帧主体速度缓存 */
const velWindows = new Map<string, { vx: number; vy: number }[]>()  // vector_arrow 加速度最小二乘的速度采样窗（每主体 8 帧）
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
  activeCamera = camera

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
  if (pCamera) { pCamera.aspect = aspect; pCamera.updateProjectionMatrix() }
}

let resizeObs: ResizeObserver | null = null

/** 屏幕像素 → 世界坐标（z=0 平面） */
function toWorld(clientX: number, clientY: number): { x: number; y: number } {
  const el = rootEl.value!
  const r = el.getBoundingClientRect()
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, activeCamera)
  raycaster.ray.intersectPlane(planeZ0, worldPt)
  return { x: worldPt.x, y: worldPt.y }
}

/** 命中测试：先精确射线；未命中时回退到包围盒邻近（0.8m）——斜面等原点在角点的元件指针恰落在网格边界上 */
function hitElement(clientX: number, clientY: number): string | null {
  const el = rootEl.value!
  const r = el.getBoundingClientRect()
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, activeCamera)
  for (const [id, entry] of meshMap) {
    const hits = raycaster.intersectObject(entry.obj, true)
    if (hits.length) return id
  }
  const p = toWorld(clientX, clientY)
  let bestId: string | null = null
  let bestDist = 0.8
  const box = new THREE.Box3()
  for (const [id, entry] of meshMap) {
    box.setFromObject(entry.obj)
    const d = box.distanceToPoint(new THREE.Vector3(p.x, p.y, 0))
    if (d < bestDist) { bestDist = d; bestId = id }
  }
  return bestId
}

/** 命中锚点手柄（连线模式） */
function hitAnchor(clientX: number, clientY: number): { id: string; anchorId: string } | null {
  const el = rootEl.value!
  const r = el.getBoundingClientRect()
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  raycaster.setFromCamera(ndc, activeCamera)
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
    const sig = `${e.type}:${JSON.stringify(e.params)}`
    let entry = meshMap.get(e.id)
    if (entry && entry.sig !== sig) {
      // 参数变更 → 重建几何（尺寸类参数 L/R/k 等决定网格形状）
      scene.remove(entry.obj)
      entry.obj.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
      })
      meshMap.delete(e.id)
      entry = undefined
    }
    if (!entry) {
      const built = buildUnifiedMesh(e)
      built.mesh.userData.elemId = e.id
      scene.add(built.mesh)
      entry = { obj: built.mesh, baseAngle: built.baseAngle, tick: built.tick, sig }
      meshMap.set(e.id, entry)
    }
    const pose = poseOf(e)
    entry.obj.position.set(pose.x, pose.y, 0)
    entry.obj.rotation.z = pose.angle + entry.baseAngle
    // vector_arrow 运行态跟随（第三十轮落地、第三十一轮修正差分与滞回）：
    // 速度=subjects 直读；加速度=速度窗口最小二乘斜率（8 采样，30fps 帧距——与 accel_sensor 同法，
    // 两点差分在 60fps rAF 读 30fps subjects 时会产生 0/a 交替闪烁）；隐藏/显示滞回防边界抖动。
    if (e.type === 'vector_arrow' && e.links.length && props.runStates) {
      const target = props.runStates.get(e.links[0].toId)
      const sub = props.subjects?.find((s) => s.id === e.links[0].toId)
      if (target && sub) {
        entry.obj.position.set(target.x, target.y, 0)
        const mode = e.params.mode ?? 0
        let vx = 0, vy = 0
        if (mode === 1) { vx = sub.vx; vy = sub.vy }
        else if (mode === 2) {
          const win = velWindows.get(sub.id) ?? []
          const last = win[win.length - 1]
          if (!last || last.vx !== sub.vx || last.vy !== sub.vy) {   // 仅 subjects 真更新才采样（rAF 60fps 读 30fps 源）
            win.push({ vx: sub.vx, vy: sub.vy })
            if (win.length > 8) win.shift()
            velWindows.set(sub.id, win)
          }
          const acc = accelFromWindow(win)
          vx = acc.ax; vy = acc.ay
        }
        const sp = Math.hypot(vx, vy)
        // 滞回（第三十一轮）：显示态阈值 0.02（低于隐藏）、隐藏态阈值 0.05（高于显示）——防边界抖动闪烁
        if (shouldShowArrow(sp, entry.obj.scale.x < 0.01)) {
          entry.obj.rotation.z = Math.atan2(vy, vx)
          entry.obj.scale.set(Math.max(0.15, sp * (e.params.scale ?? 0.3)), 1, 1)
        } else {
          entry.obj.scale.set(0.001, 0.001, 0.001)
        }
      }
    }
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

/** 连接线：owner.links 一条一段线，端点 = 两锚点世界坐标（运行态跟随帧位姿）。
 *  锚点解析统一走 resolveAnchors（参数化）——第三处解析层收编（原静态目录读取漏网，第二十五轮修）。
 *  D5 断绳：rope 元件在 brokenRopes 集合内时改两段垂挂贝塞尔（下垂=√(L²−d²)/6 同式，z=0.4，纯渲染）。 */
function anchorWorldPos(e: GeoElement, anchorId: string): { x: number; y: number } {
  const pose = poseOf(e)
  const tilt = e.type === 'belt' ? (e.params.th ?? 0) * Math.PI / 180 : 0
  const a = pose.angle + tilt
  const c = Math.cos(a), s = Math.sin(a)
  const t = resolveAnchors(e).find((x) => x.id === anchorId) ?? { local: { x: 0, y: 0 } }
  return { x: pose.x + c * t.local.x - s * t.local.y, y: pose.y + s * t.local.x + c * t.local.y }
}
function updateBrokenRope(line: THREE.Line, pa: { x: number; y: number }, pb: { x: number; y: number }, len: number) {
  // 两段各 L/2 从两端垂挂：二次贝塞尔采样（下垂 = 段长/3 视觉近似，z=0.4 在物体之上吸附预览之下）
  const pts: THREE.Vector3[] = []
  const sag = len / 2
  const drop = (p: { x: number; y: number }, dir: number) =>
    new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(p.x, p.y, 0.4),
      new THREE.Vector3(p.x + 0.12 * dir, p.y - sag * 0.55, 0.4),
      new THREE.Vector3(p.x + 0.18 * dir, p.y - sag, 0.4)).getPoints(10)
  pts.push(...drop(pa, 1), ...drop(pb, -1))
  line.geometry.setFromPoints(pts)
}
function syncLinks() {
  const seen = new Set<string>()
  for (const e of props.elements) {
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
      const ta = resolveAnchors(e).find((a) => a.id === l.anchorA)
      const tb = target ? resolveAnchors(target).find((a) => a.id === l.anchorB) : undefined
      if (target && ta && tb) {
        const pa = anchorWorldPos(e, l.anchorA), pb = anchorWorldPos(target, l.anchorB)
        const dist = Math.hypot(pb.x - pa.x, pb.y - pa.y)
        if (l.kind === 'spring') {
          updateHelix(line, pa.x, pa.y, pb.x, pb.y)
          // 渲染尾项①：拉压着色（实时跟随形变）——压缩红/拉伸蓝/自然长中性黄（判定纯函数 renderStates）
          const st = springTensionState(dist, e.params.L0 ?? 1)
          const m = line.material as THREE.LineBasicMaterial
          m.color.set(st === 'compressed' ? 0xE05555 : st === 'stretched' ? 0x4A90D9 : 0xF5C542)
        } else if (l.kind === 'rope' && props.brokenRopes?.has(e.id)) {
          updateBrokenRope(line, pa, pb, e.params.L ?? 2)
        } else if (l.kind === 'rope') {
          // 渲染尾项②：松弛虚线/绷紧实线（实时切换）——锚距 < 绳长即松弛
          updateLine(line, pa.x, pa.y, pb.x, pb.y)
          const L = e.params.L ?? 2
          const slack = isRopeSlack(dist, L)
          if (slack !== ((line.material as THREE.LineDashedMaterial).isLineDashedMaterial ?? false)) {
            const mat = slack
              ? new THREE.LineDashedMaterial({ color: 0xd9a05a, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 })
              : new THREE.LineBasicMaterial({ color: 0xd9a05a })
            ;(line.material as THREE.Material).dispose()
            line.material = mat
            if (slack) line.computeLineDistances()
          } else if (slack) {
            line.computeLineDistances()   // 端点变化后虚线间距重算
          }
        } else updateLine(line, pa.x, pa.y, pb.x, pb.y)
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
      const p = anchorWorldPos(e, tmpl.id)
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
  // 批 2·3.2 固定视觉：isFixed 元件顶一枚红锚钉（学生在 2D/等距视图都能一眼分辨固定/自由件）
  const byId = new Map(props.elements.map((el) => [el.id, el]))
  for (const [id, ent] of meshMap) {
    const el = byId.get(id)
    if (!el || !ent) continue
    const pin = ent.obj.children.find((c) => c.userData?.isFixedPin)
    if (el.isFixed && !pin) {
      // 元件重建（参数变更）后首次出现时量一次包围盒：钉立在元件顶缘上方、水平居中。
      // Bug C（手测 2026-10-06）：尺寸砍半（视觉走查"太大太醒目"），语义靠悬停 tooltip 说明
      const box = new THREE.Box3().setFromObject(ent.obj)
      const maxL = ent.obj.worldToLocal(box.max.clone())
      const minL = ent.obj.worldToLocal(box.min.clone())
      const cx = (maxL.x + minL.x) / 2
      const topY = maxL.y
      const mat = new THREE.MeshBasicMaterial({ color: 0xE05555 })
      const g = new THREE.Group()
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 8), mat)
      shaft.position.set(cx, topY + 0.06, 0.42)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), mat)
      head.position.set(cx, topY + 0.15, 0.42)
      g.add(shaft, head)
      g.userData.isFixedPin = true
      ent.obj.add(g)
    } else if (!el.isFixed && pin) {
      pin.traverse((o) => {
        const m = o as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        if (m.material) (m.material as THREE.Material).dispose()
      })
      ent.obj.remove(pin)
    }
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
  const ta = resolveAnchors(draggedEl).find((a) => a.id === snap.anchorA)
  const tb = target ? resolveAnchors(target).find((a) => a.id === snap.anchorB) : undefined
  if (!target || !ta || !tb) return
  const pa = anchorWorldPos(draggedEl, snap.anchorA), pb = anchorWorldPos(target, snap.anchorB)
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
  if (!dragState.id) { updateHoverTooltip(ev.clientX, ev.clientY); return }
  const w = toWorld(ev.clientX, ev.clientY)
  emit('dragging', dragState.id, w.x + dragState.grabX, w.y + dragState.grabY)
}

// Bug C（手测 2026-10-06）：固定钉悬停提示——"红点是干嘛的"需要有答案。
// 悬停 isFixed 元件时置 canvas 根节点 title（原生 tooltip，零依赖）
let hoverTipId: string | null = null
function updateHoverTooltip(clientX: number, clientY: number) {
  const el = rootEl.value
  if (!el) return
  const id = props.runStates ? null : hitElement(clientX, clientY)
  if (id === hoverTipId) return
  hoverTipId = id
  const fixed = id ? props.elements.find((e) => e.id === id)?.isFixed : false
  el.title = fixed ? '📍 此元件固定，不随物理运动（属性面板可改）' : ''
}
function onPointerUp(ev: PointerEvent) {
  if (dragState.id) { dragState.id = null; emit('drop', ev.shiftKey) }   // 渲染尾项③：shiftKey 传出供跳过面自动对齐
}
function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  if (viewModeNow !== '2D') {
    orbit.dist = THREE.MathUtils.clamp(orbit.dist * (ev.deltaY < 0 ? 0.9 : 1.11), 8, 80)
    placePerspective()
  } else {
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * (ev.deltaY < 0 ? 1.12 : 0.89), 0.4, 4)
    camera.updateProjectionMatrix()
  }
}

// ── 批 3·5.3 平移（中键拖，任意视角模式可用；与元件拖拽 button 通道隔离）──
let panning = false, lastPx = 0, lastPy = 0
function onPanDown(ev: PointerEvent) {
  if (ev.button !== 1) return
  ev.preventDefault()   // 阻止浏览器中键自动滚动光标
  panning = true; lastPx = ev.clientX; lastPy = ev.clientY
  rootEl.value?.setPointerCapture(ev.pointerId)
  rootEl.value!.style.cursor = 'grabbing'
}
function onPanMove(ev: PointerEvent) {
  if (!panning) return
  const el = rootEl.value!
  const dxPx = ev.clientX - lastPx, dyPx = ev.clientY - lastPy
  lastPx = ev.clientX; lastPy = ev.clientY
  // 每像素世界宽度：2D 正交=可视高/画布高/zoom；透视≈2·dist·tan(fov/2)/画布高
  const wpp = viewModeNow === '2D'
    ? (camera.top - camera.bottom) / Math.max(1, el.clientHeight) / camera.zoom
    : (2 * orbit.dist * Math.tan((pCamera ? pCamera.fov : 45) * Math.PI / 360)) / Math.max(1, el.clientHeight)
  pan.x -= dxPx * wpp
  pan.y += dyPx * wpp
  if (viewModeNow === '2D') applyPan2D()
  else placePerspective()
}
function onPanUp() {
  if (!panning) return
  panning = false
  if (rootEl.value) rootEl.value.style.cursor = ''
}

/** 批 3·5.4 复位视角：pan 归零 + zoom 归一 + 环绕回初始角（不清场景、不动元件） */
function resetView() {
  pan.x = 0; pan.y = 0
  camera.zoom = 1
  camera.updateProjectionMatrix()
  applyPan2D()
  if (viewModeNow !== '2D') {
    orbit.azim = viewModeNow === '3D' ? Math.PI / 2.6 : ORBIT_HOME.azim
    orbit.polar = viewModeNow === '3D' ? Math.PI / 4.2 : ORBIT_HOME.polar
    orbit.dist = viewModeNow === '3D' ? 24 : ORBIT_HOME.dist
    placePerspective()
  }
}

// Bug3·3D 环绕：右键拖转视角（左键仍是元件拖拽——button===2 独立通道，contextmenu 屏蔽）
let orbiting = false, lastOx = 0, lastOy = 0
function onOrbitDown(ev: PointerEvent) {
  if (viewModeNow === '3D' && ev.button === 2) { orbiting = true; lastOx = ev.clientX; lastOy = ev.clientY }
}
function onOrbitMove(ev: PointerEvent) {
  if (!orbiting || !pCamera) return
  orbit.azim -= (ev.clientX - lastOx) * 0.008
  orbit.polar = THREE.MathUtils.clamp(orbit.polar - (ev.clientY - lastOy) * 0.006, 0.25, Math.PI / 2 - 0.05)
  lastOx = ev.clientX; lastOy = ev.clientY
  placePerspective()
}
function onOrbitUp() { orbiting = false }
// 合并入口：Bug3 修复过程中模板重复 @pointerdown 致 SFC 编译 500（/lab 懒加载整链中止）——单一入口分流
// 5.3：中键（button 1）→ 平移；右键（button 2）→ 3D 环绕；左键（button 0）→ 元件拖拽/选锚
function onDownAll(ev: PointerEvent) { onPanDown(ev); onOrbitDown(ev); if (!orbiting && !panning) onPointerDown(ev) }
function onMoveAll(ev: PointerEvent) { if (panning) onPanMove(ev); else if (orbiting) onOrbitMove(ev); else onPointerMove(ev) }
function onUpAll(ev: PointerEvent) { onPanUp(); onOrbitUp(); onPointerUp(ev) }

// ── HTML5 拖放（面板 → 画布） ──
function onDragOver(ev: DragEvent) { ev.preventDefault() }
function onDrop(ev: DragEvent) {
  const type = ev.dataTransfer?.getData('application/x-builder-type')
  if (!type) return
  ev.preventDefault()
  const w = toWorld(ev.clientX, ev.clientY)
  emit('add-at', type, w.x, w.y)
}

// ── 运行轨迹线（整改3：粒子/物体轨迹可视化，编辑态隐藏）──
const TRAIL_MAX = 900
let trailLine: THREE.Line | null = null
const trailPts: number[] = []
function updateTrail() {
  const st = props.runStates
  if (!st) {
    if (trailLine) { trailLine.visible = false }
    return
  }
  if (!trailLine) {
    trailLine = new THREE.Line(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Array(TRAIL_MAX * 3).fill(0), 3)),
      new THREE.LineBasicMaterial({ color: 0x7fe3b3 }))
    trailLine.frustumCulled = false
    scene.add(trailLine)
  }
  trailLine.visible = true
  const first = st.values().next().value
  if (first) {
    if (trailPts.length >= TRAIL_MAX * 3) trailPts.splice(0, 3)
    trailPts.push(first.x, first.y, 0.05)
    const attr = trailLine.geometry.getAttribute('position') as THREE.BufferAttribute
    for (let i = 0; i < TRAIL_MAX; i++) {
      const k = i * 3
      if (k < trailPts.length) attr.setXYZ(i, trailPts[k], trailPts[k + 1], trailPts[k + 2])
      else attr.setXYZ(i, 1e4, 1e4, 0) // 未用点移出视野
    }
    attr.needsUpdate = true
  }
}

// ── 渲染循环 ──
let lastT = 0
/** P1.1·TS 引擎光线叠加组 */
let tsRayGroup: THREE.Group | null = null
function syncTsRays() {
  if (!tsRayGroup) { tsRayGroup = new THREE.Group(); scene.add(tsRayGroup) }
  while (tsRayGroup.children.length) {
    const c = tsRayGroup.children[0] as THREE.Line
    tsRayGroup.remove(c); c.geometry?.dispose(); (c.material as THREE.Material)?.dispose()
  }
  if (!props.tsRays?.length) return
  for (const ray of props.tsRays) {
    const color = ray.kind === 'tir' ? 0xE05555 : ray.kind === 'reflected' ? 0xF5C542 : ray.medium === 'glass' ? 0x4A90D9 : 0x3ecf8e
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(ray.x0, ray.y0, 0.15),
      new THREE.Vector3(ray.x1, ray.y1, 0.15),
    ])
    tsRayGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color })))
  }
}

function loop(t: number) {
  if (disposed) return
  rafId = requestAnimationFrame(loop)
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0
  lastT = t
  for (const entry of meshMap.values()) entry.tick?.(dt)
  updateTrail()
  syncMeshes() // 每帧同步：运行态 runStates 帧位姿驱动网格（编辑态值不变无开销）
  syncLinks()
  syncAnchors()
  syncSelection()
  drawSnapPreview()
  syncTsRays()
  if (selectionBox) selectionBox.update()
  renderer!.render(scene, activeCamera)
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
  /** E2E：当前显示固定锚钉的元件 id 列表（批 2·3.2） */
  fixedPinIds: (): string[] =>
    [...meshMap.entries()]
      .filter(([, ent]) => ent && ent.obj.children.some((c) => c.userData?.isFixedPin))
      .map(([id]) => id),
  /** E2E（批 3）：相机状态（平移/缩放）——平移与复位视角断言用 */
  camState: () => ({ panX: +pan.x.toFixed(3), panY: +pan.y.toFixed(3), zoom: +camera.zoom.toFixed(3), mode: viewModeNow }),
  /** 批 3·5.4 复位视角（工具栏按钮调用） */
  resetView,
})
</script>

<template>
  <div
    ref="rootEl"
    class="bcanvas"
    @pointerdown="onDownAll"
    @pointermove="onMoveAll"
    @pointerup="onUpAll"
    @pointercancel="onUpAll"
    @wheel="onWheel"
    @dragover="onDragOver"
    @drop="onDrop"
    @contextmenu.prevent
  ></div>
</template>

<style scoped>
.bcanvas { position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 10px; touch-action: none; }
.bcanvas :deep(canvas) { display: block; }
</style>
