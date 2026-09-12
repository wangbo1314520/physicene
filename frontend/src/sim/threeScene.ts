import * as THREE from 'three'
import type { PhysicsElementInput, SubjectState } from '../composables/useSimulationSocket'

/**
 * Three.js 2.5D 渲染（SRS：物理 2D x/y，等距视角营造立体感）。
 * 坐标映射：物理 (x, y) → three (x, y, z=0)，cube 有 z 厚度。
 */
export interface SimRenderer {
  syncElements(elements: PhysicsElementInput[]): void
  updateStates(subjects: SubjectState[]): void
  dispose(): void
}

export function createSimRenderer(canvas: HTMLCanvasElement): SimRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x14142a)
  scene.fog = new THREE.Fog(0x14142a, 40, 90)

  // 等距视角（isometric，默认 2.5D）
  const camera = new THREE.PerspectiveCamera(
    45, canvas.clientWidth / canvas.clientHeight, 0.1, 200,
  )
  camera.position.set(14, 10, 14)
  camera.lookAt(0, 2, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.55))
  const dir = new THREE.DirectionalLight(0xffffff, 1.1)
  dir.position.set(10, 18, 8)
  scene.add(dir)

  // 参考地面网格
  const grid = new THREE.GridHelper(60, 60, 0x3a3a5e, 0x23233a)
  grid.rotation.x = Math.PI / 2 // GridHelper 默认在 xz 平面，旋到 xy
  scene.add(grid)

  const meshes = new Map<string, THREE.Mesh>()
  const materials: THREE.Material[] = []
  const geometries: THREE.BufferGeometry[] = []

  function disposeObj(obj: THREE.Object3D) {
    scene.remove(obj)
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
      case 'slope': {
        // 基准三角形：底 2×高 1（与后端 SlopeElement 一致），挤出厚度
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
    mesh.position.set(el.position.x, el.position.y, 0)
    mesh.rotation.z = el.angle ?? 0
    return mesh
  }

  let raf = 0
  const loop = () => {
    renderer.render(scene, camera)
    raf = requestAnimationFrame(loop)
  }
  loop()

  return {
    syncElements(elements) {
      for (const mesh of meshes.values()) disposeObj(mesh)
      meshes.clear()
      for (const el of elements) {
        if (el.isVisible === false) continue
        const mesh = buildMesh(el)
        meshes.set(el.id, mesh)
        scene.add(mesh)
      }
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
    dispose() {
      cancelAnimationFrame(raf)
      for (const m of materials) m.dispose()
      for (const g of geometries) g.dispose()
      renderer.dispose()
    },
  }
}
