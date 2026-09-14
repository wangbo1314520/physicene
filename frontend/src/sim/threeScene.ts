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

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(10, 18, 8)
  scene.add(dir)

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
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(el.color ?? '#4A90D9'),
      roughness: 0.45,
      metalness: 0.15,
      transparent: el.type === 'wall',
      opacity: el.type === 'wall' ? 0.55 : 1,
    })
    geometries.push(geometry)
    materials.push(material)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.baseOpacity = el.type === 'wall' ? 0.55 : 1
    mesh.userData.baseTransparent = el.type === 'wall'
    mesh.position.set(el.position.x, el.position.y, 0)
    mesh.rotation.z = el.angle ?? 0
    return mesh
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

  return {
    syncElements(elements) {
      // 释放旧网格的 GPU 资源（参数编辑触发频繁重建，不释放会持续泄漏显存）
      for (const mesh of meshes.values()) {
        scene.remove(mesh)
        mesh.geometry.dispose()
        ;(mesh.material as THREE.Material).dispose()
      }
      meshes.clear()
      for (const el of elements) {
        if (el.isVisible === false) continue
        const mesh = buildMesh(el)
        meshes.set(el.id, mesh)
        scene.add(mesh)
      }
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
    dispose() {
      cancelAnimationFrame(raf)
      for (const m of materials) m.dispose()
      for (const g of geometries) g.dispose()
      renderer.dispose()
    },
  }
}
