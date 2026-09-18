/**
 * 统一搭建台渲染器（方案 §4.3）
 * 6 类新元件的专用几何：belt 条纹胶囊 / loop_track 轨道环 / spring 螺旋 / rope·rod 连线 / pulley 圆盘
 * 其余类型按 role/dims 回退为通用几何。画布方（BuilderView）负责设置 mesh.position 与 rotation.z = e.angle + baseAngle。
 */
import * as THREE from 'three'
import type { GeoElement } from '../catalog'
import { byType } from '../catalog'

export interface UnifiedMeshResult {
  mesh: THREE.Mesh | THREE.Group
  /** 元件固有倾角（弧度），目前仅 belt 用 params.th 生成；画布旋转需叠加此角 */
  baseAngle: number
  /** 每帧回调（belt 条纹滚动）；dt 为帧间隔秒 */
  tick?: (dt: number) => void
}

function mat(color: string, opts: { opacity?: number; emissive?: number } = {}): THREE.MeshStandardMaterial {
  const transparent = (opts.opacity ?? 1) < 1
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: 0.45, metalness: 0.15,
    transparent, opacity: opts.opacity ?? 1, depthWrite: !transparent, // 规则14：透明件关 depthWrite 防遮挡黑块
    emissive: new THREE.Color(color).multiplyScalar(opts.emissive ?? 0),
  })
}

/** 传送带条纹贴图（Canvas 生成；运行时滚 offset.x 表现带速） */
function beltTexture(): THREE.CanvasTexture {
  const cv = document.createElement('canvas')
  cv.width = 128; cv.height = 32
  const ctx = cv.getContext('2d')!
  ctx.fillStyle = '#2a5a3a'; ctx.fillRect(0, 0, 128, 32)
  ctx.fillStyle = '#4ecf8e'; for (let i = 0; i < 4; i++) ctx.fillRect(i * 32, 4, 16, 24)
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = THREE.RepeatWrapping
  tex.repeat.set(4, 1)
  return tex
}

export function buildUnifiedMesh(e: GeoElement): UnifiedMeshResult {
  const spec = byType.get(e.type)
  const color = spec?.color ?? '#4A90D9'
  const p = e.params

  switch (e.type) {
    case 'belt': {
      // 胶囊带体（Box + 两端半圆柱）+ 顶面条纹条；th 为倾角，几何沿 +x 建造后旋转
      const len = Math.max(0.2, p.L ?? 6), r = 0.15
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, r * 2, 0.3), mat(color, { opacity: 0.9 }))
      const capGeo = new THREE.CylinderGeometry(r, r, 0.3, 16)
      const capL = new THREE.Mesh(capGeo, mat(color))
      capL.rotation.x = Math.PI / 2; capL.position.set(-len / 2, 0, 0)
      const capR = new THREE.Mesh(capGeo, mat(color))
      capR.rotation.x = Math.PI / 2; capR.position.set(len / 2, 0, 0)
      const tex = beltTexture()
      tex.repeat.set(Math.max(4, Math.round(len)), 1) // 约每米一组条纹
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.05, 0.34),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false }))
      stripe.position.set(0, r + 0.025, 0)
      g.add(body, capL, capR, stripe)
      const vb = p.vb ?? 3
      return {
        mesh: g,
        baseAngle: THREE.MathUtils.degToRad(p.th ?? 0),
        tick: (dt) => { tex.offset.x -= (vb * dt) / len * 4 },
      }
    }
    case 'loop_track': {
      // 轨道环：side 0 内轨 / 1 外轨 / 2 管道（双壁）；锚点约定 入口切点(0,-R) 顶点(0,R)
      const R = Math.max(0.1, p.radius ?? 1)
      const g = new THREE.Group()
      const tube = 0.06
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R, tube, 8, 64), mat(color, { opacity: 0.9 }))
      g.add(ring)
      if ((p.side ?? 0) === 2) {
        const inner = new THREE.Mesh(new THREE.TorusGeometry(R - tube * 2.5, tube * 0.7, 6, 64), mat(color, { opacity: 0.55 }))
        g.add(inner)
      }
      return { mesh: g, baseAngle: 0 }
    }
    case 'spring': {
      // 静态螺旋（自然长 L0）；运行态伸缩由 updateHelix 驱动
      const L0 = Math.max(0.1, p.L0 ?? 1)
      const g = new THREE.Group()
      const c = spec?.color ?? '#F5C542'
      const helix = new THREE.Line(helixGeometry(0, 0, L0, 0, 10, 0.12), new THREE.LineBasicMaterial({ color: new THREE.Color(c) }))
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 10), mat(c))
      const b = a.clone(); b.position.x = L0
      g.add(helix, a, b)
      return { mesh: g, baseAngle: 0 }
    }
    case 'pulley': {
      // 滑轮：轮缘环 + 三辐条 + 轴；kind 0 定滑轮带吊装杆，1 动滑轮带吊钩
      const r = 0.4
      const g = new THREE.Group()
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 28), mat(color))
      g.add(rim)
      for (let i = 0; i < 3; i++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.8, 0.03, 0.05), mat(color))
        spoke.rotation.z = (i * Math.PI) / 3
        g.add(spoke)
      }
      const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), mat('#8a8aa0'))
      axle.rotation.x = Math.PI / 2
      g.add(axle)
      if ((p.kind ?? 0) === 0) {
        const mount = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), mat('#8a8aa0'))
        mount.position.y = r + 0.25
        g.add(mount)
      } else {
        const hook = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12, Math.PI), mat('#8a8aa0'))
        hook.position.y = -r - 0.08; hook.rotation.z = Math.PI
        g.add(hook)
      }
      return { mesh: g, baseAngle: 0 }
    }
    case 'rod_bar': {
      // 导体棒：竖直杆 + 上下接线端子
      const h = 1
      const g = new THREE.Group()
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, h, 0.1), mat(color, { emissive: 0.3 }))
      const t1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat('#d4af37', { emissive: 0.4 }))
      t1.position.set(0, h / 2, 0)
      const t2 = t1.clone(); t2.position.set(0, -h / 2, 0)
      g.add(bar, t1, t2)
      return { mesh: g, baseAngle: 0 }
    }
    case 'sphere': case 'particle': {
      return { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), mat(color)), baseAngle: 0 }
    }
    case 'point_charge': {
      return { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), mat(color, { emissive: 0.6 })), baseAngle: 0 }
    }
    case 'block': {
      // 1×1×0.6 物块，锚点 (±0.5,0)/(0,±0.5) 与半宽一致
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.6), mat(color)), baseAngle: 0 }
    }
    case 'cart': {
      const L = Math.max(1, p.L ?? 6)
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.8), mat(color)), baseAngle: 0 }
    }
    case 'vwall': {
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(0.2, p.H ?? 6, 0.5), mat(color, { opacity: 0.7 })), baseAngle: 0 }
    }
    case 'anchor_point': {
      // 悬挂锚点：小圆环 + 十字支架线
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 8, 20), mat(color)))
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.06), mat(color))
      bar.position.set(0, 0.28, 0)
      g.add(bar)
      return { mesh: g, baseAngle: 0 }
    }
    case 'lead_in': {
      const L = Math.max(0.5, p.L ?? 2)
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, 0.2), mat(color)), baseAngle: 0 }
    }
    case 'ground': {
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 1), mat(color, { opacity: 0.55 })), baseAngle: 0 }
    }
    case 'slope': {
      // 直角三角形斜面：局部原点=直角角点（左下），底边沿 +x 长 L，高 H=L·tanθ；
      // 锚点 顶端(0,3.46)/底端(6,0) 对应默认 L=6、θ=30°
      const L = Math.max(0.5, p.L ?? 6)
      const th = THREE.MathUtils.clamp(p.th ?? 30, 0, 80)
      const H = Math.min(20, L * Math.tan(THREE.MathUtils.degToRad(th)))
      const shape = new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(L, 0),
        new THREE.Vector2(0, H),
      ])
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false })
      geo.translate(0, 0, -0.25)
      return { mesh: new THREE.Mesh(geo, mat(color, { opacity: 0.9 })), baseAngle: 0 }
    }
    // ── 整改3：物理符号渲染（场区=虚线框+符号阵列，粒子=3D球+电性符号，屏=网格矩形）──
    case 'e_region': {
      // 匀强电场区：半透明底 + 虚线边界 + 场方向箭头阵列（E=Ex î+Ey ĵ）
      const g = new THREE.Group()
      const w = 12, h = 6
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02),
        new THREE.MeshBasicMaterial({ color: 0x3ecf8e, transparent: true, opacity: 0.08, depthWrite: false })))
      g.add(dashedFrame(w, h, 0x3ecf8e))
      const ex = p.Ex ?? 0, ey = p.Ey ?? 0
      const mag = Math.hypot(ex, ey)
      if (mag > 1e-9) {
        const dir = new THREE.Vector3(ex, ey, 0).normalize()
        for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
          const a = new THREE.ArrowHelper(dir, new THREE.Vector3(gx * w * 0.3, gy * h * 0.3, 0.05), 0.8, 0x3ecf8e, 0.22, 0.12)
          g.add(a)
        }
      }
      return { mesh: g, baseAngle: 0 }
    }
    case 'b_region': {
      // 匀强磁场区：半透明底 + 虚线边界 + ⊙(out)/⊗(in) 符号阵列
      const g = new THREE.Group()
      const w = 12, h = 12
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02),
        new THREE.MeshBasicMaterial({ color: 0xb06ce6, transparent: true, opacity: 0.08, depthWrite: false })))
      g.add(dashedFrame(w, h, 0xb06ce6))
      const intoPage = (p.dir ?? 0) === 0
      const sym = intoPage ? crossCircle(0.28) : dotCircle(0.28)
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) {
        const s = sym.clone()
        s.position.set(gx * w * 0.3, gy * h * 0.3, 0.05)
        g.add(s)
      }
      return { mesh: g, baseAngle: 0 }
    }
    case 'point_charge': {
      // 3D 球 + 电性符号（qm<0 为 ⊖）
      const g = new THREE.Group()
      const r = 0.3
      const qm = p.qm ?? 1
      const c = qm >= 0 ? '#E05555' : '#4A90D9'
      g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat(c, { emissive: 0.5 })))
      const symG = qm >= 0 ? plusLines(r * 0.7, 0.03) : minusLines(r * 0.7, 0.03)
      symG.position.z = r + 0.02
      g.add(symG)
      return { mesh: g, baseAngle: 0 }
    }
    case 'optic_screen': {
      // 光屏：白色矩形 + 网格线
      const g = new THREE.Group()
      const w2 = 2, h2 = 2
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w2, h2, 0.05), mat('#d4af37', { opacity: 0.85 })))
      g.add(dashedFrame(w2, h2, 0xffffff))
      for (let k = -3; k <= 3; k++) {
        const vl = new THREE.Line(
          new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([k * w2 / 8, -h2 / 2, 0.04, k * w2 / 8, h2 / 2, 0.04], 3)),
          new THREE.LineBasicMaterial({ color: 0x8a8aa0 }))
        const hl = new THREE.Line(
          new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-w2 / 2, k * h2 / 8, 0.04, w2 / 2, k * h2 / 8, 0.04], 3)),
          new THREE.LineBasicMaterial({ color: 0x8a8aa0 }))
        g.add(vl, hl)
      }
      return { mesh: g, baseAngle: 0 }
    }
    default: {
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), mat(color, { opacity: 0.9 })), baseAngle: 0 }
    }
  }
}

/** 虚线矩形边框（居中 w×h） */
function dashedFrame(w: number, h: number, color: number): THREE.LineSegments {
  const hw = w / 2, hh = h / 2, z = 0.06
  const pts = [
    -hw, -hh, z, hw, -hh, z, hw, -hh, z, hw, hh, z, hw, hh, z, -hw, hh, z, -hw, hh, z, -hw, -hh, z,
  ]
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
  const line = new THREE.LineSegments(geo, new THREE.LineDashedMaterial({ color, dashSize: 0.25, gapSize: 0.15, transparent: true, opacity: 0.9 }))
  line.computeLineDistances()
  return line
}

/** ⊗ 符号（圆 + 叉）——返回可克隆 Group */
function crossCircle(r: number): THREE.Group {
  const g = new THREE.Group()
  g.add(ringLine(r, 0xb06ce6))
  const d = r * 0.7
  g.add(seg(-d, -d, d, d, 0xb06ce6))
  g.add(seg(-d, d, d, -d, 0xb06ce6))
  return g
}

/** ⊙ 符号（圆 + 中心点） */
function dotCircle(r: number): THREE.Group {
  const g = new THREE.Group()
  g.add(ringLine(r, 0xb06ce6))
  g.add(seg(-r * 0.5, 0, r * 0.5, 0, 0xb06ce6))
  g.add(seg(0, -r * 0.5, 0, r * 0.5, 0xb06ce6))
  return g
}

function ringLine(r: number, color: number): THREE.Line {
  const pts: number[] = []
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2
    pts.push(Math.cos(a) * r, Math.sin(a) * r, 0)
  }
  return new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)),
    new THREE.LineBasicMaterial({ color }))
}

function seg(x0: number, y0: number, x1: number, y1: number, color: number): THREE.Line {
  return new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y1, 0], 3)),
    new THREE.LineBasicMaterial({ color }))
}

/** ⊕ / ⊖ 电性符号（短线组） */
function plusLines(r: number, t: number): THREE.Group {
  const g = new THREE.Group()
  g.add(seg(-r, 0, r, 0, 0xffffff))
  g.add(seg(0, -r, 0, r, 0xffffff))
  void t
  return g
}
function minusLines(r: number, t: number): THREE.Group {
  const g = new THREE.Group()
  g.add(seg(-r, 0, r, 0, 0xffffff))
  void t
  return g
}

/** 生成 (x0,y0)→(x1,y1) 螺旋线缓冲几何 */
export function helixGeometry(x0: number, y0: number, x1: number, y1: number, coils: number, radius: number): THREE.BufferGeometry {
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1e-6
  const ux = dx / len, uy = dy / len          // 沿线方向单位向量
  const nx = -uy, ny = ux                     // 法向
  const N = Math.max(32, coils * 12)
  const pts: number[] = []
  for (let i = 0; i <= N; i++) {
    const u = i / N
    const phase = u * coils * Math.PI * 2
    const wobble = Math.sin(phase) * radius
    const z = Math.cos(phase) * radius * 0.4
    pts.push(x0 + ux * len * u + nx * wobble, y0 + uy * len * u + ny * wobble, z)
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
}

/** 运行态更新弹簧螺旋（端点为两端锚点世界坐标） */
export function updateHelix(line: THREE.Line, x0: number, y0: number, x1: number, y1: number, coils = 10, radius = 0.12): void {
  line.geometry.dispose()
  line.geometry = helixGeometry(x0, y0, x1, y1, coils, radius)
}

/** 连接线（rope/wire/pulley-rope），端点由画布渲染循环更新 */
export function buildConnectionLine(kind: 'rope' | 'rod' | 'spring' | 'wire' | 'pulley-rope'): THREE.Line {
  const color = kind === 'spring' ? '#F5C542' : kind === 'wire' ? '#4A90D9' : kind === 'rod' ? '#E05555' : '#d9a05a'
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3))
  return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: new THREE.Color(color) }))
}

/** 更新连接线端点 */
export function updateLine(line: THREE.Line, x0: number, y0: number, x1: number, y1: number): void {
  const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
  attr.setXYZ(0, x0, y0, 0)
  attr.setXYZ(1, x1, y1, 0)
  attr.needsUpdate = true
}
