/**
 * three.js 实验底座：材质/箭头/生长轨迹/轨迹回放/资源跟踪/文字贴图/场景初始化。
 * 供 Exp3D（9 个共享模式）与独立 3D 实验组件（α散射等）共用。
 */
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Vec3 } from './FieldEngine'

export const UP = new THREE.Vector3(0, 1, 0)

export function mkMesh(geo: THREE.BufferGeometry, color: number,
                       opts: { emissive?: number; opacity?: number; basic?: boolean; side?: THREE.Side } = {}): THREE.Mesh {
  const transparent = opts.opacity !== undefined
  const mat = opts.basic
    ? new THREE.MeshBasicMaterial({ color, transparent, opacity: opts.opacity ?? 1, side: opts.side })
    : new THREE.MeshStandardMaterial({
        color, roughness: 0.4, metalness: 0.2,
        emissive: opts.emissive !== undefined ? color : 0x000000,
        emissiveIntensity: opts.emissive ?? 0,
        transparent, opacity: opts.opacity ?? 1, side: opts.side,
      })
  return new THREE.Mesh(geo, mat)
}

/** 带箭头的方向线（圆柱杆 + 锥头），以组原点为中心、沿 dir 跨 [-len/2, len/2] */
export function arrowMesh(dir: THREE.Vector3, len: number, color: number,
                          opts: { radius?: number; opacity?: number } = {}): THREE.Group {
  const g = new THREE.Group()
  const d = dir.clone().normalize()
  const r = opts.radius ?? Math.max(0.03, len * 0.03)
  const head = Math.min(len * 0.35, r * 6)
  const shaftLen = len - head
  const rot = new THREE.Quaternion().setFromUnitVectors(UP, d)
  const shaft = mkMesh(new THREE.CylinderGeometry(r, r, shaftLen, 6), color, { opacity: opts.opacity, basic: true })
  shaft.quaternion.copy(rot)
  shaft.position.copy(d.clone().multiplyScalar(-len / 2 + shaftLen / 2))
  const tip = mkMesh(new THREE.ConeGeometry(r * 2.2, head, 8), color, { opacity: opts.opacity, basic: true })
  tip.quaternion.copy(rot)
  tip.position.copy(d.clone().multiplyScalar(len / 2 - head / 2))
  g.add(shaft, tip)
  return g
}

/** 可生长轨迹线（预分配缓冲，逐点推进） */
export class GrowingTrail {
  readonly line: THREE.Line
  private readonly buf: Float32Array
  private n = 0
  constructor(color: number, private readonly cap: number) {
    this.buf = new Float32Array(cap * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.buf, 3))
    geo.setDrawRange(0, 0)
    this.line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color }))
  }
  push(p: Vec3) {
    if (this.n >= this.cap) return
    this.buf.set([p.x, p.y, p.z], this.n * 3)
    this.n++
    this.line.geometry.setDrawRange(0, this.n)
    ;(this.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true
  }
}

/** 预计算轨迹的回放器：按物理时间比例推进游标，粒子跟随、轨迹生长 */
export class TrackPlayer {
  private cursor = 0
  constructor(readonly pts: { pos: Vec3; vel?: Vec3 }[], private readonly dtPhys: number,
              private readonly trail: GrowingTrail, readonly particle: THREE.Mesh,
              private readonly speed: number) {
    trail.push(pts[0].pos)
    particle.position.set(pts[0].pos.x, pts[0].pos.y, pts[0].pos.z)
  }
  get finished() { return this.cursor >= this.pts.length - 1 }
  get index() { return this.cursor }
  tick(dt: number) {
    const target = Math.min(this.pts.length - 1, this.cursor + Math.max(1, Math.round((dt * this.speed) / this.dtPhys)))
    for (let k = this.cursor + 1; k <= target; k++) this.trail.push(this.pts[k].pos)
    this.cursor = target
    const p = this.pts[this.cursor].pos
    this.particle.position.set(p.x, p.y, p.z)
  }
}

/** 场景内可清理对象跟踪：重置/重建时统一移除并释放 GPU 资源 */
export function makeTracker(getScene: () => THREE.Scene | null) {
  let tracked: THREE.Object3D[] = []
  return {
    track<T extends THREE.Object3D>(o: T): T { tracked.push(o); getScene()?.add(o); return o },
    clearTracked() {
      for (const o of tracked) {
        getScene()?.remove(o)
        o.traverse((c: any) => { c.geometry?.dispose?.(); if (Array.isArray(c.material)) c.material.forEach((m: any) => m.dispose?.()); else c.material?.dispose?.() })
      }
      tracked = []
    },
  }
}

/** 文字贴图精灵（用于刻度、元件名） */
export function textSprite(text: string, opts: { color?: string; size?: number; scale?: number } = {}): THREE.Sprite {
  const cv = document.createElement('canvas')
  const px = opts.size ?? 28
  cv.width = 256; cv.height = 64
  const ctx = cv.getContext('2d')!
  ctx.font = `${px}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillStyle = opts.color ?? '#b0b0cc'; ctx.fillText(text, 128, 32)
  const tex = new THREE.CanvasTexture(cv)
  tex.minFilter = THREE.LinearFilter
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  const s = opts.scale ?? 1
  sp.scale.set(4 * s, 1 * s, 1)
  return sp
}

/** 初始化渲染器/场景/相机/轨道控制（鼠标+触屏），返回 dispose */
export function setupThree(container: HTMLDivElement, cameraPos: [number, number, number], target: [number, number, number] = [0, 0, 0]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setSize(container.clientWidth, container.clientHeight)
  container.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x14142a)
  const camera = new THREE.PerspectiveCamera(50, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 500)
  camera.position.set(...cameraPos)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(...target)
  controls.enableDamping = true
  scene.add(new THREE.AmbientLight(0xffffff, 0.7))
  const key = new THREE.DirectionalLight(0xffffff, 0.9); key.position.set(6, 10, 8); scene.add(key)
  const grid = new THREE.GridHelper(40, 40, 0x2f2f4a, 0x23233a); grid.position.y = -6; scene.add(grid)
  const onResize = () => {
    const w = container.clientWidth, h = Math.max(1, container.clientHeight)
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', onResize)
  return {
    renderer, scene, camera, controls,
    dispose() { window.removeEventListener('resize', onResize); controls.dispose(); renderer.dispose(); renderer.domElement.remove() },
  }
}
