import * as THREE from 'three'
import type { PhysicsElementInput, SubjectState } from '../composables/useSimulationSocket'
import { buildBFieldLines3D, buildEFieldArrows3D, buildChargeFieldLines } from './fieldLines3d'
import { buildUnifiedMesh } from '../builder/render/Renderer'

/**
 * Three.js 渲染（SRS：物理 2D x/y，渲染按实验维度分三档）：
 *   纯2D  = 正交相机正视（教材插图观感，无透视变形）
 *   纯2.5D = 透视相机等距视角（2D 物理 + 立体感）
 *   纯3D  = 透视相机 + 左键轨道旋转 + 场区有厚度 + 场线/箭头三维画法
 * 坐标映射：物理 (x, y) → three (x, y, z=0)，cube 有 z 厚度。
 * LabView 交互：screenToWorld（拖放置点）/ pickElement（点击选中）。
 */

/** 实验展示维度（唯一口径：纯2D / 纯2.5D / 纯3D） */
export type SimDimension = '2D' | '2.5D' | '3D'

export interface SimRenderer {
  syncElements(elements: PhysicsElementInput[]): void
  updateStates(subjects: SubjectState[]): void
  updateElement(id: string, patch: Partial<PhysicsElementInput>): void
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null
  pickElement(clientX: number, clientY: number): string | null
  setSelected(id: string | null): void
  setGhost(ids: string[]): void
  setViewMode(mode: 'front' | 'iso'): void
  setDimension(dim: SimDimension): void
  resetView(): void
  dispose(): void
}

export function createSimRenderer(canvas: HTMLCanvasElement): SimRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x14142a)
  const fog = new THREE.Fog(0x14142a, 40, 90)
  scene.fog = fog

  const pCamera = new THREE.PerspectiveCamera(
    45, canvas.clientWidth / canvas.clientHeight, 0.1, 200,
  )
  pCamera.position.set(14, 10, 14)
  pCamera.lookAt(0, 2, 0)
  // 纯2D 正交相机（无透视变形，正对 xy 平面）
  const oCamera = new THREE.OrthographicCamera(-12, 12, 12, -12, 0.1, 500)
  let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = pCamera

  // 3D 模式方向参考轴（x红/y绿/z蓝，仅 orbit3d 可见）
  const axes = new THREE.AxesHelper(3.5)
  axes.visible = false
  scene.add(axes)

  // three r155+ 物理光照单位：强度需按新标准（旧 0.55/1.1 会渲染成深色）
  scene.add(new THREE.AmbientLight(0xffffff, 2.2))
  const dir = new THREE.DirectionalLight(0xffffff, 2.8)
  dir.position.set(10, 18, 8)
  scene.add(dir)
  const dir2 = new THREE.DirectionalLight(0xffffff, 1.2)
  dir2.position.set(-8, 6, -10)
  scene.add(dir2)

  const grid = new THREE.GridHelper(60, 60, 0x3a3a5e, 0x23233a)
  grid.rotation.x = Math.PI / 2
  scene.add(grid)

  const raycaster = new THREE.Raycaster()
  const zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)

  const meshes = new Map<string, THREE.Mesh>()
  const materials: THREE.Material[] = []
  const geometries: THREE.BufferGeometry[] = []
  let selectedId: string | null = null
  let ghostIds = new Set<string>()

  /** 渲染模式：front/iso=LabView 兼容（透视正视/等距）；flat2d=纯2D 正交；orbit3d=纯3D 可旋转 */
  type RenderMode = 'front' | 'iso' | 'flat2d' | 'orbit3d'
  let viewMode: RenderMode = 'front'

  // 用户手动视角（滚轮缩放/右键平移/3D 旋转后不再自动取景，双击或复位按钮恢复）
  let userControlled = false
  const viewTarget = new THREE.Vector3(0, 2, 0)

  // 最近一次同步的元件（模式切换需按新维度重建网格）
  let currentElements: PhysicsElementInput[] = []

  /** 自动取景：按场景包围盒调整相机（塔高 25m 的自由落体也能全看到） */
  function frameAll() {
    if (userControlled) {
      return
    }
    const asp = canvas.clientWidth / Math.max(1, canvas.clientHeight)
    if (meshes.size === 0) {
      viewTarget.set(0, 2, 0)
      if (viewMode === 'flat2d') {
        oCamera.left = -12 * asp; oCamera.right = 12 * asp
        oCamera.top = 12; oCamera.bottom = -12
        oCamera.zoom = 1
        oCamera.position.set(0, 2, 100)
        oCamera.lookAt(0, 2, 0)
        oCamera.updateProjectionMatrix()
        camera = oCamera
      } else {
        camera = pCamera
        if (viewMode === 'front') {
          camera.position.set(0, 2, 30)
          camera.lookAt(0, 2, 0)
        } else {
          camera.position.set(14, 10, 14)
          camera.lookAt(0, 2, 0)
        }
      }
      return
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const mesh of meshes.values()) {
      const p = mesh.position
      const hw = (mesh.userData.halfW as number) ?? 1
      const hh = (mesh.userData.halfH as number) ?? 1
      minX = Math.min(minX, p.x - hw)
      maxX = Math.max(maxX, p.x + hw)
      minY = Math.min(minY, p.y - hh)
      maxY = Math.max(maxY, p.y + hh)
    }
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    if (viewMode === 'flat2d') {
      // 正交正视：按包围盒直接设视锥（无透视，无"距离"概念）
      const halfH = Math.max((maxY - minY) * 0.65 + 1.5, (maxX - minX) * 0.65 / asp + 1.5)
      oCamera.left = -halfH * asp; oCamera.right = halfH * asp
      oCamera.top = halfH; oCamera.bottom = -halfH
      oCamera.zoom = 1
      oCamera.position.set(cx, cy, 100)
      viewTarget.set(cx, cy, 0)
      oCamera.lookAt(cx, cy, 0)
      oCamera.updateProjectionMatrix()
      camera = oCamera
      return
    }
    camera = pCamera
    if (viewMode === 'front') {
      // 正视图：正对 xy 平面。fov45° 垂直可视高 = 0.828d，按宽高各算所需距离取大
      const dist = Math.max((maxY - minY) * 1.3, (maxX - minX) * 1.3 / asp) + 3
      viewTarget.set(cx, cy, 0)
      camera.position.set(cx, cy, dist)
      camera.lookAt(cx, cy, 0)
    } else {
      const span = Math.max(maxX - minX, (maxY - minY) * 1.35) + 4
      const dist = span * 1.05
      viewTarget.set(cx, cy, 0)
      camera.position.set(cx + dist * 0.62, cy + dist * 0.5, dist * 0.62)
      camera.lookAt(cx, cy, 0)
    }
  }

  function buildMesh(el: PhysicsElementInput): THREE.Mesh {
    // ── 方案 B（2026-10-03）：废弃原 11 个"实验性"case，改调 buildUnifiedMesh（42 个 case）──
    // 保留：场符号叠加（buildFieldSymbols/3D）、场色/透明度、z 错层、halfW/H 自动取景
    const result = buildUnifiedMesh(el)
    const unified = result.mesh as THREE.Object3D
    // 场色覆盖（e_field/b_field 在 Renderer 中已映射到 e_region/b_region）
    const isField = el.type === 'e_field' || el.type === 'b_field'
    const sx = el.scale?.x ?? 1
    const sy = el.scale?.y ?? 1
    if (isField) {
      let color = '#4A90D9', opacity = 0.13
      if (el.type === 'e_field') color = '#3ecf8e'
      else if (el.type === 'b_field') color = (el.properties?.bDirection === 'in') ? '#6cd9e8' : '#b06ce6'
      unified.traverse((child) => {
        const m = child as THREE.Mesh
        if (m.material) {
          const mat = m.material as THREE.MeshStandardMaterial
          mat.color = new THREE.Color(color)
          mat.transparent = true
          mat.opacity = opacity
        }
      })
      unified.userData.baseOpacity = opacity
      unified.userData.baseTransparent = true
    }
    // 自动取景用的大致半尺寸
    if (el.type === 'slope') {
      unified.userData.halfW = sx; unified.userData.halfH = sy / 2
    } else if (isField || el.type === 'wall') {
      unified.userData.halfW = sx / 2; unified.userData.halfH = sy / 2
    } else {
      unified.userData.halfW = Math.max(0.5, sx / 2); unified.userData.halfH = Math.max(0.5, sy / 2)
    }
    const zOff = el.type === 'b_field' ? 0.09 : el.type === 'e_field' ? -0.09 : 0
    unified.position.set(el.position.x, el.position.y, zOff)
    unified.rotation.z = (el.angle ?? 0) + result.baseAngle
    // 场分布可视化
    if (isField) {
      unified.add(viewMode === 'orbit3d' ? buildFieldSymbols3D(el) : buildFieldSymbols(el))
    }
    return unified as THREE.Mesh
  }

  /** 3D 模式场可视化（线+箭头）：
   *  磁场 = 沿 ±z 的带箭头平行线阵（体分布）；电场 = 沿 E 的箭头线阵分三层 z */
  function buildFieldSymbols3D(el: PhysicsElementInput): THREE.Group {
    const sx = Math.max(0.1, el.scale?.x ?? 1)
    const sy = Math.max(0.1, el.scale?.y ?? 1)
    const depth = THREE.MathUtils.clamp(Math.min(sx, sy) * 0.4, 1.2, 5)
    if (el.type === 'b_field') {
      const isIn = el.properties?.bDirection === 'in'
      return buildBFieldLines3D(sx / 2, sy / 2, depth, !isIn, isIn ? 0x6cd9e8 : 0xb06ce6)
    }
    const ex = el.properties?.eFieldX ?? 0
    const ey = el.properties?.eFieldY ?? 0
    const mag = Math.hypot(ex, ey)
    if (mag < 1e-6) return new THREE.Group()
    const dir = new THREE.Vector3(ex / mag, ey / mag, 0)
    const alongSpan = Math.abs(dir.x) * sx + Math.abs(dir.y) * sy
    const perpSpan = Math.abs(dir.y) * sx + Math.abs(dir.x) * sy
    return buildEFieldArrows3D(dir, alongSpan, perpSpan, depth, 0x3ecf8e)
  }

  /** 场分布可视化（教材标准画法）：
   *  电场 = 等距平行箭头线（方向 = E 方向，长度∝场强，教材匀强电场画法）
   *  磁场 = 点阵 •（垂直纸面向外）/ 叉阵 ×（向内） */
  function buildFieldSymbols(el: PhysicsElementInput): THREE.Group {
    const group = new THREE.Group()
    const sx = Math.max(0.1, el.scale?.x ?? 1)
    const sy = Math.max(0.1, el.scale?.y ?? 1)

    if (el.type === 'e_field') {
      const ex = el.properties?.eFieldX ?? 0
      const ey = el.properties?.eFieldY ?? 0
      const mag = Math.hypot(ex, ey)
      if (mag < 1e-6) return group
      const dir = new THREE.Vector3(ex / mag, ey / mag, 0)
      const perp = new THREE.Vector3(-dir.y, dir.x, 0)
      // 矩形在"场方向/垂直方向"上的投影跨度
      const alongSpan = Math.abs(dir.x) * sx + Math.abs(dir.y) * sy
      const perpSpan = Math.abs(dir.y) * sx + Math.abs(dir.x) * sy
      const len = Math.max(1.5, Math.min(6, alongSpan * 0.7))
      const count = Math.max(2, Math.min(9, Math.floor(perpSpan / 2.6)))
      const gap = perpSpan / (count + 1)
      const color = 0x3ecf8e
      for (let i = 1; i <= count; i++) {
        const offset = -perpSpan / 2 + i * gap
        const origin = new THREE.Vector3(
          -dir.x * len / 2 + perp.x * offset,
          -dir.y * len / 2 + perp.y * offset, 0.15)
        group.add(new THREE.ArrowHelper(
          dir, origin, len, color, Math.min(0.5, len * 0.22), Math.min(0.32, len * 0.14)))
      }
    } else {
      const isIn = el.properties?.bDirection === 'in'
      const color = isIn ? 0x6cd9e8 : 0xb06ce6
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })
      materials.push(mat)
      const spacing = Math.max(2.4, Math.min(sx, sy) / 6)
      // 符号尺寸随网格间距缩放（大场区远看也清晰）
      const dotR = Math.min(0.5, Math.max(0.11, spacing * 0.09))
      const barLen = Math.min(2.2, Math.max(0.52, spacing * 0.42))
      const barW = barLen * 0.16
      const dotGeo = new THREE.CircleGeometry(dotR, 12)
      const barGeo = new THREE.PlaneGeometry(barLen, barW)
      geometries.push(dotGeo, barGeo)
      const cols = Math.max(1, Math.floor((sx - 1) / spacing))
      const rows = Math.max(1, Math.floor((sy - 1) / spacing))
      const x0 = -((cols - 1) * spacing) / 2
      const y0 = -((rows - 1) * spacing) / 2
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = x0 + c * spacing
          const cy = y0 + r * spacing
          if (isIn) {
            // × 叉阵：向内
            for (const rot of [Math.PI / 4, -Math.PI / 4]) {
              const bar = new THREE.Mesh(barGeo, mat)
              bar.position.set(cx, cy, 0.15)
              bar.rotation.z = rot
              group.add(bar)
            }
          } else {
            // • 点阵：向外
            const dot = new THREE.Mesh(dotGeo, mat)
            dot.position.set(cx, cy, 0.15)
            group.add(dot)
          }
        }
      }
    }
    return group
  }

  function applySelection() {
    for (const [id, mesh] of meshes) {
      // 方案 B：buildUnifiedMesh 可能返回 Group（无顶层 material）——遍历 children
      const targets: THREE.Mesh[] = mesh instanceof THREE.Mesh ? [mesh]
        : (mesh as THREE.Group).children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && !!c.material)
      for (const m of targets) {
        const mat = m.material as THREE.MeshStandardMaterial
        if (mat?.emissive) mat.emissive = new THREE.Color(id === selectedId ? 0x2a5c8f : 0x000000)
        mat.opacity = ghostIds.has(id) ? 0.45 : (mesh.userData.baseOpacity ?? 1)
        mat.transparent = ghostIds.has(id) || (mesh.userData.baseTransparent ?? false)
      }
    }
  }

  function ndc(clientX: number, clientY: number) {
    const rect = canvas.getBoundingClientRect()
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
  }

  let raf = 0
  const loop = () => {
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  loop()

  // 调试钩子（E2E/排障用）
  ;(window as any).__simDebug = () => ({
    meshes: meshes.size,
    ids: [...meshes.keys()],
    cam: camera.position.toArray().map((v) => +v.toFixed(1)),
    canvasSize: [canvas.clientWidth, canvas.clientHeight],
    drawSize: [renderer.domElement.width, renderer.domElement.height],
  })
  ;(window as any).__simProject = (x: number, y: number) => {
    const v = new THREE.Vector3(x, y, 0).project(camera)
    return [(v.x * 0.5 + 0.5) * canvas.clientWidth, (-v.y * 0.5 + 0.5) * canvas.clientHeight]
  }

  // ===== 视角交互：滚轮缩放 / 右键或中键平移 / 3D 模式左键（含触屏单指）旋转 / 双击复位 =====
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    userControlled = true
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
    if (camera === oCamera) {
      oCamera.zoom = THREE.MathUtils.clamp(oCamera.zoom / factor, 0.05, 20)
      oCamera.updateProjectionMatrix()
    } else {
      const dir = camera.position.clone().sub(viewTarget)
      const len = THREE.MathUtils.clamp(dir.length() * factor, 3, 400)
      camera.position.copy(viewTarget).add(dir.setLength(len))
    }
  }, { passive: false })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  let dragging: 'pan' | 'rotate' | null = null
  let lastX = 0
  let lastY = 0
  canvas.addEventListener('pointerdown', (e) => {
    const wantPan = e.button === 2 || e.button === 1
    const wantRotate = e.button === 0 && viewMode === 'orbit3d'
    if (!wantPan && !wantRotate) return
    dragging = wantPan ? 'pan' : 'rotate'
    userControlled = true
    lastX = e.clientX
    lastY = e.clientY
    canvas.setPointerCapture(e.pointerId)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    if (dragging === 'pan') {
      // 屏幕像素 → 世界距离（透视按视距与 fov、正交按视锥高度换算）
      const worldPerPx = camera === oCamera
        ? (oCamera.top - oCamera.bottom) / (oCamera.zoom * canvas.clientHeight)
        : (2 * camera.position.distanceTo(viewTarget) * Math.tan(THREE.MathUtils.degToRad(22.5))) / canvas.clientHeight
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1)
      const move = right.multiplyScalar(-dx * worldPerPx).add(up.multiplyScalar(dy * worldPerPx))
      camera.position.add(move)
      viewTarget.add(move)
    } else {
      // 轨道旋转（球坐标：theta 绕竖轴，phi 极角）
      const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(viewTarget))
      sph.theta -= dx * 0.006
      sph.phi = THREE.MathUtils.clamp(sph.phi - dy * 0.006, 0.12, Math.PI - 0.12)
      camera.position.copy(viewTarget).add(new THREE.Vector3().setFromSpherical(sph))
      camera.lookAt(viewTarget)
    }
  })
  const endDrag = () => (dragging = null)
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener('dblclick', () => {
    userControlled = false
    frameAll()
  })

  function syncElements(elements: PhysicsElementInput[]) {
    // 释放旧网格的 GPU 资源（参数编辑触发频繁重建，不释放会持续泄漏显存；含场符号子对象）
    for (const mesh of meshes.values()) {
      scene.remove(mesh)
      mesh.traverse((child: any) => {
        child.geometry?.dispose?.()
        const m = child.material
        if (Array.isArray(m)) m.forEach((x: THREE.Material) => x.dispose())
        else m?.dispose?.()
      })
    }
    meshes.clear()
    currentElements = elements
    for (const el of elements) {
      if (el.visible === false) continue
      const mesh = buildMesh(el)
      meshes.set(el.id, mesh)
      scene.add(mesh)
    }
    // 3D 模式：固定点电荷画辐射状电场线（叠加场流线；运动电荷作检验粒子不画）
    if (viewMode === 'orbit3d') {
      const sources = elements.filter((el) => el.type === 'point_charge'
        && el.fixed && Math.abs(el.properties?.charge ?? 0) > 1e-6)
      if (sources.length) {
        let bound = 12
        for (const mesh of meshes.values()) {
          bound = Math.max(bound, Math.abs(mesh.position.x) + 4, Math.abs(mesh.position.y) + 4)
        }
        const src = sources.map((s) => ({ x: s.position.x, y: s.position.y, q: s.properties!.charge! }))
        for (const el of sources) {
          meshes.get(el.id)?.add(buildChargeFieldLines(src, bound))
        }
      }
    }
    frameAll()
    applySelection()
  }

  /** 切换渲染模式：2D 关雾+正交；3D 开坐标轴；场区厚度/场线形态随模式重建网格 */
  function applyMode(next: RenderMode) {
    if (viewMode === next) return
    viewMode = next
    userControlled = false
    scene.fog = next === 'flat2d' ? null : fog
    axes.visible = next === 'orbit3d'
    if (currentElements.length) syncElements(currentElements)
    else frameAll()
  }

  return {
    syncElements,
    updateStates(subjects) {
      for (const s of subjects) {
        const mesh = meshes.get(s.id)
        if (mesh) {
          mesh.position.set(s.x, s.y, 0)
          if (s.angle !== undefined) mesh.rotation.z = s.angle
        }
      }
    },
    updateElement(id, patch) {
      const mesh = meshes.get(id)
      if (!mesh) return
      if (patch.position) mesh.position.set(patch.position.x, patch.position.y, 0)
      if (patch.angle !== undefined) mesh.rotation.z = patch.angle
      if (patch.color) (mesh.material as THREE.MeshStandardMaterial).color.set(patch.color)
    },
    screenToWorld(clientX, clientY) {
      raycaster.setFromCamera(ndc(clientX, clientY), camera)
      const point = new THREE.Vector3()
      if (!raycaster.ray.intersectPlane(zPlane, point)) return null
      return { x: +point.x.toFixed(3), y: +point.y.toFixed(3) }
    },
    pickElement(clientX, clientY) {
      raycaster.setFromCamera(ndc(clientX, clientY), camera)
      const hits = raycaster.intersectObjects([...meshes.values()])
      if (hits.length === 0) return null
      const found = [...meshes.entries()].find(([, m]) => m === hits[0].object)
      return found ? found[0] : null
    },
    setSelected(id) {
      selectedId = id
      applySelection()
    },
    setGhost(ids) {
      ghostIds = new Set(ids)
      applySelection()
    },
    setViewMode(mode) {
      applyMode(mode === 'iso' ? 'iso' : 'front')
    },
    setDimension(dim) {
      applyMode(dim === '2D' ? 'flat2d' : dim === '3D' ? 'orbit3d' : 'iso')
    },
    resetView() {
      userControlled = false
      frameAll()
    },
    dispose() {
      cancelAnimationFrame(raf)
      for (const m of materials) m.dispose()
      for (const g of geometries) g.dispose()
      renderer.dispose()
    },
  }
}
