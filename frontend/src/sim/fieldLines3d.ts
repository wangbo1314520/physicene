import * as THREE from 'three'

/**
 * 3D 场线可视化（演示实验 3D 模式专用，教材画法：线 + 中段箭头示方向）：
 *   点电荷 → 从电荷出发的辐射状电场线（多电荷叠加，沿 E 方向积分流线）
 *   匀强磁场 → 沿 ±z 的带箭头平行线阵（替代 2D 模式的 ⊙/⊗ 符号）
 *   匀强电场 → 沿 E 方向的箭头线阵，分三层 z 分布营造空间感
 * 生成的 Group 作为元件 mesh 的子对象挂载，随 syncElements 统一 dispose。
 */

export interface ChargeSource { x: number; y: number; q: number }

/** 叠加场强 E(p)（电荷位于 z=0 平面，三维距离，K 归一化为 1） */
function fieldAt(charges: ChargeSource[], x: number, y: number, z: number): THREE.Vector3 {
  const e = new THREE.Vector3()
  for (const c of charges) {
    const dx = x - c.x, dy = y - c.y, dz = z
    const r2 = dx * dx + dy * dy + dz * dz
    if (r2 < 1e-8) continue
    const r = Math.sqrt(r2)
    const f = c.q / (r2 * r)
    e.x += f * dx; e.y += f * dy; e.z += f * dz
  }
  return e
}

/** 斐波那契球面近似均匀方向（种子方向用） */
function sphereDirs(n: number): THREE.Vector3[] {
  const dirs: THREE.Vector3[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < n; i++) {
    const y = n === 1 ? 0 : 1 - (2 * i) / (n - 1)
    const rad = Math.sqrt(Math.max(0, 1 - y * y))
    const th = golden * i
    dirs.push(new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad))
  }
  return dirs
}

/** 沿切线方向的锥形箭头（+Y 旋转到切线） */
function arrowHead(tangent: THREE.Vector3, pos: THREE.Vector3, size: number, color: number): THREE.Mesh {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(size * 0.42, size, 10),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }),
  )
  cone.position.copy(pos)
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent.clone().normalize())
  return cone
}

/**
 * 点电荷电场线：每个源电荷按 |q| 播种 N 条，正电荷沿 E 向外、负电荷沿 −E 汇入，
 * 步进积分到出界/命中其它电荷/场强趋零；线中部放箭头。
 */
export function buildChargeFieldLines(charges: ChargeSource[], bound: number): THREE.Group {
  const group = new THREE.Group()
  const stepLen = Math.max(0.15, bound * 0.012)
  const maxSteps = 110
  const headSize = THREE.MathUtils.clamp(bound * 0.05, 0.22, 0.55)
  for (const c of charges) {
    if (Math.abs(c.q) < 1e-6) continue
    const n = Math.round(THREE.MathUtils.clamp(7 + 3.2 * Math.abs(c.q), 8, 24))
    const color = c.q > 0 ? 0xe05555 : 0x4a90d9
    const sign = c.q > 0 ? 1 : -1
    const seeds = 0.55
    for (const dir of sphereDirs(n)) {
      const pts: THREE.Vector3[] = []
      let p = new THREE.Vector3(c.x + dir.x * seeds, c.y + dir.y * seeds, dir.z * seeds)
      let stop = false
      for (let s = 0; s < maxSteps && !stop; s++) {
        pts.push(p.clone())
        const e = fieldAt(charges, p.x, p.y, p.z)
        if (e.length() < 1e-4) break
        p = p.clone().add(e.normalize().multiplyScalar(sign * stepLen))
        if (Math.abs(p.x) > bound || Math.abs(p.y) > bound || Math.abs(p.z) > bound) {
          pts.push(p.clone())
          break
        }
        for (const o of charges) {
          if (o !== c && Math.hypot(p.x - o.x, p.y - o.y, p.z) < 0.5) {
            pts.push(p.clone())
            stop = true
            break
          }
        }
      }
      if (pts.length < 4) continue
      group.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8 }),
      ))
      const mid = Math.min(pts.length - 1, Math.max(1, Math.floor(pts.length * 0.55)))
      if (mid < pts.length - 1) {
        const tangent = pts[mid + 1].clone().sub(pts[mid - 1] ?? pts[mid])
        if (tangent.lengthSq() > 1e-8) group.add(arrowHead(tangent, pts[mid], headSize, color))
      }
    }
  }
  return group
}

/** 匀强磁场 3D 线阵：沿 ±z 的带箭头平行线（out=+z / in=−z），xy 网格分布 */
export function buildBFieldLines3D(halfX: number, halfY: number, depth: number,
                                   out: boolean, color: number): THREE.Group {
  const group = new THREE.Group()
  const dir = new THREE.Vector3(0, 0, out ? 1 : -1)
  const len = Math.max(2, depth)
  const spacing = THREE.MathUtils.clamp(Math.min(halfX, halfY) * 2 / 4, 2.2, 6)
  const cols = Math.max(2, Math.floor((halfX * 2) / spacing))
  const rows = Math.max(2, Math.floor((halfY * 2) / spacing))
  const r = Math.max(0.035, len * 0.012)
  const head = THREE.MathUtils.clamp(len * 0.22, 0.4, 0.9)
  const shaftGeo = new THREE.CylinderGeometry(r, r, len - head * 0.6, 6)
  const shaftMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5 })
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const x = -halfX + (halfX * 2 * (i + 0.5)) / cols
      const y = -halfY + (halfY * 2 * (j + 0.5)) / rows
      const shaft = new THREE.Mesh(shaftGeo, shaftMat)
      shaft.position.set(x, y, 0)
      shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
      group.add(shaft)
      group.add(arrowHead(dir, new THREE.Vector3(x, y, dir.z * (len / 2 - head * 0.3)), head, color))
    }
  }
  return group
}

/** 匀强电场 3D 箭头线阵：E 在平面内，三层 z 各一排箭头（线 + 头） */
export function buildEFieldArrows3D(dir: THREE.Vector3, alongSpan: number, perpSpan: number,
                                    depth: number, color: number): THREE.Group {
  const group = new THREE.Group()
  const len = THREE.MathUtils.clamp(alongSpan * 0.6, 1.5, 6)
  const count = THREE.MathUtils.clamp(Math.floor(perpSpan / 2.6), 2, 7)
  const gap = perpSpan / (count + 1)
  const perp = new THREE.Vector3(-dir.y, dir.x, 0)
  for (const z of [-depth / 3, 0, depth / 3]) {
    for (let i = 1; i <= count; i++) {
      const offset = -perpSpan / 2 + i * gap
      const origin = new THREE.Vector3(
        -dir.x * len / 2 + perp.x * offset,
        -dir.y * len / 2 + perp.y * offset,
        z,
      )
      group.add(new THREE.ArrowHelper(
        dir, origin, len, color, Math.min(0.5, len * 0.22), Math.min(0.32, len * 0.14)))
    }
  }
  return group
}
