import * as THREE from 'three'
import type { PhysicsElementInput, SubjectState } from '../composables/useSimulationSocket'

/**
 * Three.js 2.5D 渲染（SRS：物理 2D x/y，等距视角营造立体感）。
 * 坐标映射：物理 (x, y) → three (x, y, z=0)，cube 有 z 厚度。
 * LabView 交互：screenToWorld（拖放置点）/ pickElement（点击选中）。
 */
export interface SimRenderer {
  syncElements(elements: PhysicsElementInput[]): void
  updateStates(subjects: SubjectState[]): void
  updateElement(id: string, patch: Partial<PhysicsElementInput>): void
  screenToWorld(clientX: number, clientY: number): { x: number; y: number } | null
  pickElement(clientX: number, clientY: number): string | null
  setSelected(id: string | null): void
  setGhost(ids: string[]): void
  setViewMode(mode: 'front' | 'iso'): void
  resetView(): void
  dispose(): void
}

export function createSimRenderer(canvas: HTMLCanvasElement): SimRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x14142a)
  scene.fog = new THREE.Fog(0x14142a, 40, 90)

  const camera = new THREE.PerspectiveCamera(
    45, canvas.clientWidth / canvas.clientHeight, 0.1, 200,
  )
  camera.position.set(14, 10, 14)
  camera.lookAt(0, 2, 0)

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

  /** 视角模式：front=正视图（物理教辅标准，正对纸面）；iso=等距 2.5D */
  let viewMode: 'front' | 'iso' = 'front'

  // 用户手动视角（滚轮缩放/右键平移后不再自动取景，双击或复位按钮恢复）
  let userControlled = false
  const viewTarget = new THREE.Vector3(0, 2, 0)

  /** 自动取景：按场景包围盒调整相机（塔高 25m 的自由落体也能全看到） */
  function frameAll() {
    if (userControlled) {
      return
    }
    if (meshes.size === 0) {
      viewTarget.set(0, 2, 0)
      if (viewMode === 'front') {
        camera.position.set(0, 2, 30)
        camera.lookAt(0, 2, 0)
      } else {
        camera.position.set(14, 10, 14)
        camera.lookAt(0, 2, 0)
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
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight)
    if (viewMode === 'front') {
      // 正视图：正对 xy 平面。fov45° 垂直可视高 = 0.828d，按宽高各算所需距离取大
      const dist = Math.max((maxY - minY) * 1.3, (maxX - minX) * 1.3 / aspect) + 3
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
    let geometry: THREE.BufferGeometry
    const sx = el.scale?.x ?? 1
    const sy = el.scale?.y ?? 1
    switch (el.type) {
      case 'sphere': {
        const r = 0.5 * ((sx + sy) / 2)
        geometry = new THREE.SphereGeometry(Math.max(0.05, r), 24, 16)
        break
      }
      case 'point_charge': {
        const r = 0.25 * ((sx + sy) / 2)
        geometry = new THREE.SphereGeometry(Math.max(0.08, r), 24, 16)
        break
      }
      case 'e_field':
      case 'b_field': {
        // 场区域：薄板半透明显示（绿=电场，紫=B 向外，青=B 向内）
        geometry = new THREE.BoxGeometry(Math.max(0.1, sx), Math.max(0.1, sy), 0.05)
        break
      }
      case 'slope': {
        const w = 2 * sx, h = 1 * sy
        const shape = new THREE.Shape([
          new THREE.Vector2(-w / 2, -h / 2),
          new THREE.Vector2(w / 2, -h / 2),
          new THREE.Vector2(-w / 2, h / 2),
        ])
        geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false })
        geometry.translate(0, 0, -0.25)
        break
      }
      case 'wall':
      case 'cube':
      default: {
        geometry = new THREE.BoxGeometry(Math.max(0.05, sx), Math.max(0.05, sy), Math.max(0.05, sx))
        break
      }
    }
    const isField = el.type === 'e_field' || el.type === 'b_field'
    let color = el.color ?? '#4A90D9'
    let opacity = 1
    if (el.type === 'e_field') {
      color = '#3ecf8e'
      opacity = 0.13
    } else if (el.type === 'b_field') {
      color = (el.properties?.bDirection === 'in') ? '#6cd9e8' : '#b06ce6'
      opacity = 0.13
    }
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color),
      roughness: 0.45,
      metalness: 0.15,
      transparent: isField || el.type === 'wall',
      opacity: isField ? opacity : el.type === 'wall' ? 0.55 : 1,
      emissive: el.type === 'point_charge' ? new THREE.Color(color).multiplyScalar(0.7)
        : new THREE.Color(0x000000),
    })
    geometries.push(geometry)
    materials.push(material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.baseOpacity = isField ? opacity : el.type === 'wall' ? 0.55 : 1
    mesh.userData.baseTransparent = isField || el.type === 'wall'
    // 自动取景用的大致半尺寸（元件几何跨度，非仅中心点）
    if (el.type === 'slope') {
      mesh.userData.halfW = sx; mesh.userData.halfH = sy / 2
    } else if (isField || el.type === 'wall') {
      mesh.userData.halfW = sx / 2; mesh.userData.halfH = sy / 2
    } else {
      mesh.userData.halfW = Math.max(0.5, sx / 2); mesh.userData.halfH = Math.max(0.5, sy / 2)
    }
    mesh.position.set(el.position.x, el.position.y, 0)
    mesh.rotation.z = el.angle ?? 0
    // 场分布可视化（教材标准画法）：电场=方向箭头阵列，磁场=⊙/⊗ 符号阵列
    if (isField) {
      mesh.add(buildFieldSymbols(el))
    }
    return mesh
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
      const mat = mesh.material as THREE.MeshStandardMaterial
      mat.emissive = new THREE.Color(id === selectedId ? 0x2a5c8f : 0x000000)
      mat.opacity = ghostIds.has(id) ? 0.45 : (mesh.userData.baseOpacity ?? 1)
      mat.transparent = ghostIds.has(id) || (mesh.userData.baseTransparent ?? false)
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

  // ===== 视角交互：滚轮缩放 / 右键或中键拖拽平移 / 双击复位 =====
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    userControlled = true
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12
    const dir = camera.position.clone().sub(viewTarget)
    const len = THREE.MathUtils.clamp(dir.length() * factor, 3, 400)
    camera.position.copy(viewTarget).add(dir.setLength(len))
  }, { passive: false })

  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  let panning = false
  let panX = 0
  let panY = 0
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button === 2 || e.button === 1) {
      panning = true
      userControlled = true
      panX = e.clientX
      panY = e.clientY
      canvas.setPointerCapture(e.pointerId)
    }
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!panning) return
    const dx = e.clientX - panX
    const dy = e.clientY - panY
    panX = e.clientX
    panY = e.clientY
    // 屏幕像素 → 世界距离（按当前视距与 fov 换算）
    const dist = camera.position.distanceTo(viewTarget)
    const worldPerPx = (2 * dist * Math.tan(THREE.MathUtils.degToRad(22.5))) / canvas.clientHeight
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1)
    const move = right.multiplyScalar(-dx * worldPerPx).add(up.multiplyScalar(dy * worldPerPx))
    camera.position.add(move)
    viewTarget.add(move)
  })
  const endPan = () => (panning = false)
  canvas.addEventListener('pointerup', endPan)
  canvas.addEventListener('pointercancel', endPan)
  canvas.addEventListener('dblclick', () => {
    userControlled = false
    frameAll()
  })

  return {
    syncElements(elements) {
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
      for (const el of elements) {
        if (el.isVisible === false) continue
        const mesh = buildMesh(el)
        meshes.set(el.id, mesh)
        scene.add(mesh)
      }
      frameAll()
      applySelection()
    },
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
      if (viewMode === mode) return
      viewMode = mode
      userControlled = false
      frameAll()
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
