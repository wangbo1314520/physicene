/**
 * 统一搭建台渲染器（方案 §4.3）
 * 6 类新元件的专用几何：belt 条纹胶囊 / loop_track 轨道环 / spring 螺旋 / rope·rod 连线 / pulley 圆盘
 * 其余类型按 role/dims 回退为通用几何。画布方（BuilderView）负责设置 mesh.position 与 rotation.z = e.angle + baseAngle。
 */
import * as THREE from 'three'
import type { GeoElement } from '../catalog'
import { byType, BELT_RADIUS, BRACKET_POST, BRACKET_ARM, POLE_WIDTH } from '../catalog'

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
      const len = Math.max(0.2, p.L ?? 6), r = BELT_RADIUS
      const g = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(len, r * 2, 0.3), mat(color, { opacity: 0.9 }))
      const capGeo = new THREE.CylinderGeometry(r, r, 0.3, 16)
      const capL = new THREE.Mesh(capGeo, mat('#565675'))
      capL.rotation.x = Math.PI / 2; capL.position.set(-len / 2, 0, 0)
      const capR = new THREE.Mesh(capGeo, mat('#565675'))
      capR.rotation.x = Math.PI / 2; capR.position.set(len / 2, 0, 0)
      // 任务D：端部滚轮（辐条小轮）
      for (const wx of [-len / 2, len / 2]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 18), mat('#8a8aa0'))
        wheel.position.set(wx, 0, 0.18)
        g.add(wheel)
      }
      const tex = beltTexture()
      tex.repeat.set(Math.max(4, Math.round(len)), 1) // 约每米一组条纹
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(len, 0.05, 0.34),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false }))
      stripe.position.set(0, r + 0.025, 0)
      g.add(body, capL, capR, stripe)
      const vb = p.vb ?? 3
      const mu = p.mu ?? 0.4
      // Bug B（2026-10-03）：方向箭头（静止可见，指向运动方向）+ 速度/摩擦两个分开标注
      const arrowDir = vb >= 0 ? 1 : -1
      const arrowShape = new THREE.Shape()
      const ah = 0.18, aw = 0.10
      arrowShape.moveTo(-ah / 2 * arrowDir, 0)
      arrowShape.lineTo(ah / 2 * arrowDir, aw / 2)
      arrowShape.lineTo(ah / 2 * arrowDir - 0.05 * arrowDir, 0)
      arrowShape.lineTo(ah / 2 * arrowDir, -aw / 2)
      arrowShape.closePath()
      const arrow = new THREE.Mesh(
        new THREE.ShapeGeometry(arrowShape),
        new THREE.MeshBasicMaterial({ color: 0xF5C542, side: THREE.DoubleSide, depthWrite: false }))
      arrow.position.set(0, r + 0.10, 0.35)
      g.add(arrow)
      // 两个分开标注：速度 + 摩擦（参考圆轨道 textSprite 风格）
      g.add(textSprite(`v=${Math.abs(vb).toFixed(1)}m/s`, '#3ecf8e', len / 2 + 0.4, r + 0.5))
      g.add(textSprite(`μ=${mu.toFixed(2)}`, '#E05555', -len / 2 - 0.4, r + 0.5))
      return {
        mesh: g,
        baseAngle: THREE.MathUtils.degToRad(p.th ?? 0),
        tick: (dt) => { tex.offset.x -= (vb * dt) / len * 4 },
      }
    }
    case 'loop_track': {
      // Bug D（2026-10-03）：RingGeometry 平面环（无 z 厚度——透视下进出口不再错开）
      // + side 0 内轨加内侧刻线 / side 1 外轨加外侧刻线（几何级区分）/ side 2 管道双环
      const R = Math.max(0.1, p.radius ?? 1)
      const tube = 0.05
      const g = new THREE.Group()
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(R - tube, R + tube, 64),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, transparent: true, opacity: 0.9 }))
      g.add(ring)
      const side = (p.side ?? 0) as 0 | 1 | 2
      if (side === 2) {
        const inner = new THREE.Mesh(
          new THREE.RingGeometry(R - tube * 4, R - tube * 2.5, 64),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.DoubleSide, transparent: true, opacity: 0.55 }))
        g.add(inner)
      } else if (side === 0 || side === 1) {
        // 刻线：8 条短径向线，内轨朝圆心（球在内壁）/ 外轨朝外（球在外壁）
        const dir = side === 0 ? -1 : 1
        const tickLen = 0.12
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4
          const r0 = side === 0 ? R - tube : R + tube
          const r1 = r0 + dir * tickLen
          const tickGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(r0 * Math.cos(ang), r0 * Math.sin(ang), 0.01),
            new THREE.Vector3(r1 * Math.cos(ang), r1 * Math.sin(ang), 0.01)])
          g.add(new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: 0xF5C542 })))
        }
      }
      const sideName = ['内轨', '外轨', '管道'][side] ?? '内轨'
      g.add(textSprite(sideName, '#b06ce6', R + 0.55, R * 0.75))
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
      g.add(new THREE.Mesh(new THREE.TorusGeometry(r - 0.09, 0.02, 6, 28), mat('#d9a05a')))  // 绳槽
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
    case 'rigid_roller': {
      // 转动惯量滚子：k 区分外观（1=圆环环体/0.5=圆盘/0.4=球）+ 旋转轴标记
      const g = new THREE.Group()
      const r = 0.5
      const k = p.k ?? 0.5
      if (Math.abs(k - 1) < 0.05) {
        // 圆环：Torus 主体
        g.add(new THREE.Mesh(new THREE.TorusGeometry(r, 0.04, 8, 32), mat(color)))  // 细环（呼啦圈）：管径 0.04
      } else if (Math.abs(k - 0.5) < 0.05) {
        // 圆盘：薄 Cylinder + 辐条
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.1, 28), mat(color)))
        for (let i = 0; i < 4; i++) {
          const sp = new THREE.Mesh(new THREE.BoxGeometry(r * 1.9, 0.04, 0.08), mat(color))
          sp.rotation.z = (i * Math.PI) / 4
          g.add(sp)
        }
      } else {
        // 球：Sphere + 经纬线
        g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mat(color, { opacity: 0.9 })))
        g.add(new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.02, 6, 24), mat('#8a8aa0')))
      }
      // 旋转轴标记（竖线 + k 值）
      const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, r * 2.4, 6), mat('#d9a05a'))
      g.add(axis)
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
      const H = p.H ?? 6
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, H, 0.5), mat(color, { opacity: 0.7 })))
      for (let yy = -H / 2 + 0.3; yy < H / 2 - 0.2; yy += 0.45) {  // 固定端斜线阴影惯例
        g.add(seg2(-0.36, yy - 0.12, -0.1, yy + 0.12, 0x565675))
      }
      return { mesh: g, baseAngle: 0 }
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
    case 'bracket': {
      // L 形桌夹支架（卡 5/21 连接体）：局部原点=底座中心（竖杆底贴桌面），
      // 竖杆 BRACKET_POST 向上 + 横臂 BRACKET_ARM 向右；mount 锚点=横臂末端；
      // 45° 固定阴影画在底座（惯例同 vwall 的 0x565675 斜线）
      const g = new THREE.Group()
      const post = new THREE.Mesh(new THREE.BoxGeometry(POLE_WIDTH, BRACKET_POST, POLE_WIDTH), mat(color))
      post.position.set(0, BRACKET_POST / 2, 0)
      const arm = new THREE.Mesh(new THREE.BoxGeometry(BRACKET_ARM, 0.08, 0.08), mat(color))
      arm.position.set(BRACKET_ARM / 2, BRACKET_POST - 0.04, 0)
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.06, 0.24), mat(color))
      base.position.set(0, 0.03, 0)
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#d4af37', { emissive: 0.4 }))
      knob.position.set(BRACKET_ARM, BRACKET_POST, 0)
      g.add(post, arm, base, knob)
      for (let xx = -0.12; xx <= 0.12; xx += 0.08) {
        g.add(seg2(xx - 0.05, 0.0, xx + 0.05, 0.1, 0x565675))
      }
      return { mesh: g, baseAngle: 0 }
    }
    case 'pole': {
      // 竖直杆（卡 23 晾衣绳）：局部原点=杆中心（与锚点约定一致：mount=(0,H/2)=杆顶），
      // H 参数化默认 1.2；底座+45° 固定阴影在杆底
      const H = Math.max(0.6, p.H ?? 1.2)
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(POLE_WIDTH, H, POLE_WIDTH), mat(color)))
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.2), mat(color))
      base.position.set(0, -H / 2 + 0.03, 0)
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), mat('#d4af37', { emissive: 0.4 }))
      knob.position.set(0, H / 2, 0)
      g.add(base, knob)
      for (let xx = -0.1; xx <= 0.1; xx += 0.07) {
        g.add(seg2(xx - 0.04, -H / 2, xx + 0.04, -H / 2 + 0.1, 0x565675))
      }
      return { mesh: g, baseAngle: 0 }
    }
    // ── TS 光学/近代 8 件编辑态渲染（2026-10-03 逐个确认：全落 default 方块，该修）──
    // 运行态由 TS Runner 输出光线叠加（BuilderCanvas tsRays），编辑态在此画可辨识几何
    case 'light_source': {
      // 光源：圆+发散线（模拟光束发射）
      const g = new THREE.Group()
      const core = new THREE.Mesh(new THREE.CircleGeometry(0.25, 20), mat(color))
      g.add(core)
      for (let i = 0; i < 5; i++) {
        const ang = -0.6 + (i * 0.3)
        const ray = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0.25 * Math.cos(ang), 0.25 * Math.sin(ang), 0),
          new THREE.Vector3(1.2 * Math.cos(ang), 1.2 * Math.sin(ang), 0)])
        g.add(new THREE.Line(ray, new THREE.LineBasicMaterial({ color: 0xF5C542 })))
      }
      g.add(textSprite(`λ=${p.lam ?? 600}nm θ=${p.th1 ?? 40}°`, '#F5C542', 0, -0.6))
      return { mesh: g, baseAngle: 0 }
    }
    case 'prism': {
      // 棱镜：三角形
      const A = p.A ?? 60
      const tri = new THREE.Shape()
      tri.moveTo(0, 0.5); tri.lineTo(-0.45, -0.35); tri.lineTo(0.45, -0.35); tri.closePath()
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })))
      g.add(textSprite(`n=${p.n ?? 1.5} A=${A}°`, '#4A90D9', 0, 0.8))
      return { mesh: g, baseAngle: 0 }
    }
    case 'optic_screen': {
      // 光屏：竖线+刻度
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 2, 0.15), mat(color, { opacity: 0.8 })))
      for (const y of [-0.6, 0, 0.6]) {
        const tick = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0.04, y, 0), new THREE.Vector3(0.12, y, 0)])
        g.add(new THREE.Line(tick, new THREE.LineBasicMaterial({ color: 0x8a8aa0 })))
      }
      return { mesh: g, baseAngle: 0 }
    }
    case 'wedge': {
      // 劈尖：细长三角形+空气膜厚标注
      const g = new THREE.Group()
      const tri = new THREE.Shape()
      tri.moveTo(-1, 0); tri.lineTo(1, 0); tri.lineTo(1, 0.08); tri.closePath()
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(tri), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false })))
      g.add(textSprite('劈尖', '#4A90D9', 0, 0.4))
      return { mesh: g, baseAngle: 0 }
    }
    case 'double_slit': {
      // 双缝：两条竖线+缝宽标注
      const g = new THREE.Group()
      for (const x of [-0.15, 0.15]) {
        g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.5, 0.15), mat(color)))
      }
      g.add(textSprite('双缝', '#4A90D9', 0, 1.0))
      return { mesh: g, baseAngle: 0 }
    }
    case 'photo_tube': {
      // 光电管：真空管（半透明椭圆）+ 阴极/阳极标注
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })))
      g.add(textSprite(`mat=${p.mat ?? 1}`, '#E05555', 0, 0.7))
      return { mesh: g, baseAngle: 0 }
    }
    case 'h_atom': {
      // 氢原子：原子核+电子轨道环
      const g = new THREE.Group()
      const n = p.n ?? 2
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), mat('#E05555')))
      for (let i = 1; i <= n; i++) {
        g.add(new THREE.Mesh(new THREE.RingGeometry(0.2 * i - 0.02, 0.2 * i + 0.02, 32),
          new THREE.MeshBasicMaterial({ color: 0x4A90D9, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })))
      }
      g.add(textSprite(`n=${n}`, '#4A90D9', 0.5, 0.5))
      return { mesh: g, baseAngle: 0 }
    }
    case 'electron_gun': {
      // 电子枪：梯形发射器+电子束方向
      const g = new THREE.Group()
      const gun = new THREE.Shape()
      gun.moveTo(-0.3, 0.2); gun.lineTo(0.3, 0.2); gun.lineTo(0.1, -0.1); gun.lineTo(-0.1, -0.1); gun.closePath()
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(gun), mat(color)))
      const beam = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, -0.1, 0), new THREE.Vector3(0, -0.8, 0)])
      g.add(new THREE.Line(beam, new THREE.LineBasicMaterial({ color: 0x3ecf8e })))
      g.add(textSprite(`U=${p.U ?? 100}V`, '#3ecf8e', 0.4, -0.3))
      return { mesh: g, baseAngle: 0 }
    }
    case 'bohr_collision': {
      // 玻尔碰撞：原子核+入射粒子轨迹
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mat('#E05555')))
      const traj = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-1.2, 0.3, 0), new THREE.Vector3(0.15, 0, 0)])
      g.add(new THREE.Line(traj, new THREE.LineBasicMaterial({ color: 0xF5C542 })))
      g.add(textSprite(`E=${p.E ?? 25}eV`, '#F5C542', -0.6, 0.6))
      return { mesh: g, baseAngle: 0 }
    }
    case 'accelerating_platform': {
      // 平台板 + a 值标注 + frame 模式标注
      const L = Math.max(1, p.L ?? 8), a = p.a ?? 2
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(L, 0.3, 0.5), mat(color, { opacity: 0.85 })))
      g.add(textSprite(`a=${a.toFixed(1)}m/s²`, '#c9a227', L / 2 + 0.5, 0.6))
      if (p.frame === 1) g.add(textSprite('地面系', '#3ecf8e', -L / 2 - 0.5, 0.6))
      return { mesh: g, baseAngle: 0 }
    }
    case 'constant_force': {
      // 力箭头 + F/Δt 标注
      const F = p.F ?? 0, dur = p.duration ?? 2
      const g = new THREE.Group()
      const arrowShape = new THREE.Shape()
      arrowShape.moveTo(0, 0); arrowShape.lineTo(1.2, 0.12); arrowShape.lineTo(1.2, 0.05)
      arrowShape.lineTo(1.6, 0); arrowShape.lineTo(1.2, -0.05); arrowShape.lineTo(1.2, -0.12)
      arrowShape.closePath()
      g.add(new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), mat(color)))
      g.add(textSprite(`F=${F.toFixed(1)}N Δt=${dur}s`, '#F5A623', 1.0, 0.5))
      return { mesh: g, baseAngle: 0 }
    }
    case 'capacitor_r': {
      // 电容符号（两平行板）+ C/V0 标注
      const C = p.C ?? 0.1, V0 = p.V0 ?? 0
      const g = new THREE.Group()
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.8, 0.2), mat(color))
      const p2 = plate.clone(); p2.position.x = 0.3
      plate.position.x = -0.3
      g.add(plate, p2)
      g.add(textSprite(`C=${(C * 1000).toFixed(0)}mF V₀=${V0.toFixed(0)}V`, '#F5C542', 0, 0.7))
      return { mesh: g, baseAngle: 0 }
    }
    case 'coil_frame': {
      // 线框（矩形框）+ w/R 标注
      const w = p.w ?? 1, R = p.R ?? 1
      const g = new THREE.Group()
      const outline = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-w / 2, -0.3, 0), new THREE.Vector3(w / 2, -0.3, 0),
        new THREE.Vector3(w / 2, 0.3, 0), new THREE.Vector3(-w / 2, 0.3, 0),
        new THREE.Vector3(-w / 2, -0.3, 0)])
      g.add(new THREE.Line(outline, new THREE.LineBasicMaterial({ color: new THREE.Color(color) })))
      g.add(textSprite(`w=${w.toFixed(1)}m R=${R.toFixed(1)}Ω`, '#E05555', 0, 0.6))
      return { mesh: g, baseAngle: 0 }
    }
    case 'rail_pair': {
      // 双导轨（两条平行线）+ L 标注
      const L = p.L ?? 1
      const g = new THREE.Group()
      for (const y of [0.3, -0.3]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(3, 0.05, 0.1), mat('#8a8aa0'))
        rail.position.y = y
        g.add(rail)
      }
      g.add(textSprite(`轨距 L=${L.toFixed(1)}m`, '#8a8aa0', 0, 0.7))
      return { mesh: g, baseAngle: 0 }
    }
    case 'projectile_platform': {
      // 平台板（比 accelerating_platform 薄）+ v0 标注
      const v0 = p.v0 ?? 0
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 0.3), mat(color, { opacity: 0.8 })))
      if (v0) g.add(textSprite(`v₀=${v0}m/s`, '#3ecf8e', 1.8, 0.5))
      return { mesh: g, baseAngle: 0 }
    }
    case 'cylinder': {
      // 汽缸壁（U 形截面）+ S 标注
      const S = p.S ?? 0.01
      const g = new THREE.Group()
      const wallMat = mat(color, { opacity: 0.7 })
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2, 0.3), wallMat); left.position.set(-0.5, 0, 0)
      const right = left.clone(); right.position.x = 0.5
      const bottom = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.08, 0.3), wallMat); bottom.position.y = -1
      g.add(left, right, bottom)
      g.add(textSprite(`S=${(S * 1000).toFixed(0)}cm²`, '#9cc5ff', 0, 1.3))
      return { mesh: g, baseAngle: 0 }
    }
    case 'gas_cell': {
      // 气室（半透明填充矩形）+ p/V/T 标注
      const p0 = p.p0 ?? 101325, V0 = p.V0 ?? 0.01, T0 = p.T0 ?? 300
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.3), mat(color, { opacity: 0.25 })))
      g.add(textSprite(`p=${(p0 / 1000).toFixed(0)}kPa V=${(V0 * 1000).toFixed(0)}L T=${T0}K`, '#F5C542', 0, 0.8))
      return { mesh: g, baseAngle: 0 }
    }
    case 'piston': {
      // 活塞（厚板）+ M 标注
      const M = p.M ?? 10
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.3), mat(color)))
      g.add(textSprite(`M=${M.toFixed(0)}kg`, '#8a8aa0', 0, 0.5))
      return { mesh: g, baseAngle: 0 }
    }
    case 'rope': {
      // Bug C（2026-10-03）：绳自身渲染（未连线时）——直线 + 两端锚点球 + 长度标注。
      // 连线后由 buildConnectionLine 接管（松弛虚线/绷紧实线——P1.1 承诺已在 BuilderCanvas syncLinks 落地）
      const L = Math.max(0.1, p.L ?? 2)
      const g = new THREE.Group()
      const c = spec?.color ?? '#d9a05a'
      // 绳线：编辑态默认绷紧（粗实线）；L/Tmax 标注让学生知道可断
      const line = new THREE.Mesh(new THREE.BoxGeometry(L, 0.035, 0.035), mat(c))
      g.add(line)
      // 两端锚点球（与连线锚点对齐：左端 (0,0)、右端 (L,0)）
      const a = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mat('#b0b0cc'))
      const b = a.clone(); b.position.x = L
      g.add(a, b)
      // 长度标签
      g.add(textSprite(`L=${L.toFixed(1)}m`, c, L / 2, 0.3))
      return { mesh: g, baseAngle: 0 }
    }
    case 'lead_in': {
      const L = Math.max(0.5, p.L ?? 2)
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(L, 0.08, 0.2), mat(color)), baseAngle: 0 }
    }
    case 'ground': {
      const g = new THREE.Group()
      g.add(new THREE.Mesh(new THREE.BoxGeometry(20, 0.2, 1), mat(color, { opacity: 0.55 })))
      g.add(frictionMarks(6, p.mu ?? 0.3).translateY(-0.45))  // 集中一段标记（全宽过密）
      return { mesh: g, baseAngle: 0 }
    }
    case 'slope': {
      // 直角三角形斜面：局部原点=直角角点（左下），底边沿 +x 长 L，高 H=L·tanθ；
      // 锚点 顶端(0,3.46)/底端(6,0) 对应默认 L=6、θ=30°
      const L = Math.max(0.5, p.L ?? 6)
      const th = THREE.MathUtils.clamp(p.th ?? 30, 0, 80)
      const H = Math.min(20, L * Math.tan(THREE.MathUtils.degToRad(th)))
      // 底端钝化 v2（与 Java 同几何）：斜边角度不变——终点 (L−e, 线上)，竖直端面落地
      const eB = Math.min(0.25, L * 0.04)
      const shape = new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(L - eB, 0),
        new THREE.Vector2(L - eB, eB * H / L),
        new THREE.Vector2(0, H),
      ])
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false })
      geo.translate(0, 0, -0.25)
      const g = new THREE.Group()
      g.add(new THREE.Mesh(geo, mat(color, { opacity: 0.9 })))
      // 任务D：粗糙面短斜线沿斜边 + θ 标注（底角处）
      const mu = p.mu ?? 0.2
      if (mu > 1e-9) {
        const n = Math.max(3, Math.floor(L / 0.9))
        for (let i = 1; i < n; i++) {
          const t = i / n
          const px = L * t, py = H * (1 - t)
          g.add(seg2(px - 0.1, py + 0.1 * H / L + 0.02, px + 0.1, py + 0.1 * H / L + 0.22, 0x8a8aa0))
        }
      }
      g.add(textSprite(`θ=${THREE.MathUtils.clamp(p.th ?? 30, 0, 80)}°${mu > 1e-9 ? ' μ=' + mu : ' 光滑'}`, '#3ecf8e', 0.7, -0.28))
      return { mesh: g, baseAngle: 0 }
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
    case 'vector_arrow': {
      // 显示·矢量箭头（第三十轮）：静态模式画 params 方向长度；跟随模式（1 速度/2 加速度）
      // 初始按静态画、运行态由 Canvas tick 按 subjects(vx,vy / 帧差分) 重算朝向长度（updateVectorArrow）
      const g = new THREE.Group()
      g.add(buildArrowShaft(0, 0, 0, 1, modeColor(p.mode)))
      if (p.mode === 2) g.add(textSprite('≈a', '#E05555', 0.55, 0.18, 0.8))  // 差分近似标记（UI 明示显示级，第三十一轮）
      g.userData.kind = 'vector-arrow'
      return { mesh: g, baseAngle: 0 }
    }
    case 'graph_tag': {
      // 显示·图上标签：文本取 display.label（属性面板编辑），颜色按 params.color 四选一
      const colors = ['#F5C542', '#ffffff', '#E05555', '#3ecf8e']
      const txt = (e.display?.label as string | undefined) ?? '标签'
      const g = new THREE.Group()
      const sp = textSprite(txt, colors[Math.min(3, Math.max(0, p.color ?? 0))] ?? '#F5C542', 0, 0, 0.5 * (p.size ?? 1))
      g.add(sp)
      g.userData.kind = 'graph-tag'
      return { mesh: g, baseAngle: 0 }
    }
    default: {
      return { mesh: new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), mat(color, { opacity: 0.9 })), baseAngle: 0 }
    }
  }
}


/** 摩擦标记（任务D）：粗糙面=短斜线阴影排；光滑=文字「光滑」（Sprite 免引字体） */
function frictionMarks(w: number, mu: number): THREE.Group {
  const g = new THREE.Group()
  if (typeof document === 'undefined') return g
  if (mu <= 1e-9) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 24
    const c2 = cv.getContext('2d')!
    c2.fillStyle = '#7fe3b3'; c2.font = '16px sans-serif'; c2.fillText('光滑', 8, 18)
    const tex = new THREE.CanvasTexture(cv)
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
    sp.position.set(0, 0.35, 0.1); sp.scale.set(1.0, 0.38, 1)
    g.add(sp)
    return g
  }
  const n = Math.max(3, Math.floor(w / 0.8))
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + 0.4 + (i * (w - 0.8)) / Math.max(1, n - 1)
    g.add(seg2(x - 0.12, 0.02, x + 0.12, 0.22, 0x8a8aa0))
    g.add(seg2(x - 0.02, 0.02, x + 0.22, 0.22, 0x565675))
  }
  return g
}
function seg2(x0: number, y0: number, x1: number, y1: number, color: number): THREE.Line {
  return new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, 0, x1, y1, 0], 3)),
    new THREE.LineBasicMaterial({ color }))
}
/** 文字标签 Sprite（θ 标注/轨道类型标注） */
/** 文本纹理缓存（第三十一轮）：key=text|color——同文本同色的 tag 共享一张 CanvasTexture
 *  （100 个相同文本 tag=1 张纹理；SpriteMaterial 每 sprite 独立但纹理共享）。node 单测环境跳过。 */
const spriteTexCache = new Map<string, THREE.CanvasTexture>()

function textSprite(text: string, color = '#b0b0cc', x = 0, y = 0, size = 1): THREE.Sprite {
  if (typeof document === 'undefined') return new THREE.Sprite()  // node 单测环境无 canvas：空对象不抛错
  const key = `${text}|${color}`
  let tex = spriteTexCache.get(key)
  if (!tex) {
    const cv = document.createElement('canvas'); cv.width = 96; cv.height = 28
    const c2 = cv.getContext('2d')!
    c2.fillStyle = color; c2.font = '15px sans-serif'; c2.fillText(text, 4, 20)
    tex = new THREE.CanvasTexture(cv)
    spriteTexCache.set(key, tex)
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }))
  sp.position.set(x, y, 0.12); sp.scale.set(1.5 * size, 0.44 * size, 1)
  return sp
}

/** 矢量箭头（第三十轮 vector_arrow）： shaft 线段 + 三角头（沿 +x，长度 1 归一——外层按缩放/旋转摆） */
function buildArrowShaft(x0: number, y0: number, x1: number, y1: number, color: string): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(color) })
  const pts = [new THREE.Vector3(x0, y0, 0.1), new THREE.Vector3(x1, y1, 0.1)]
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat))
  // 箭头头：以 (x1,y1) 为顶点的两短线（张开 ±25°）
  const dx = x1 - x0, dy = y1 - y0
  const len = Math.max(1e-6, Math.hypot(dx, dy))
  const ux = dx / len, uy = dy / len
  const hl = Math.min(0.18, len * 0.3)
  const wing = (sign: number) => new THREE.Vector3(x1 - hl * (ux * Math.cos(sign * 0.44) - uy * Math.sin(sign * 0.44)),
      y1 - hl * (uy * Math.cos(sign * 0.44) + ux * Math.sin(sign * 0.44)), 0.1)
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, 0.1), wing(1)]), mat))
  g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x1, y1, 0.1), wing(-1)]), mat))
  return g
}

/** vector_arrow 模式配色惯例：静态黄 / 速度绿 / 加速度红（渲染规范） */
function modeColor(mode: number | undefined): string {
  return mode === 1 ? '#3ecf8e' : mode === 2 ? '#E05555' : '#F5C542'
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
