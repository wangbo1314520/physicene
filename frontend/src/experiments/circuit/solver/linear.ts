/**
 * 稠密线性方程组求解（带部分主元的高斯消元），实数与复数两版。
 * 电路矩阵规模小（节点 < 100），稠密法足够。
 */

export function solveReal(A: number[][], b: number[]): number[] | null {
  const n = b.length
  if (n === 0) return []
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-18) return null
    if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t }
    const p = M[col][col]
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / p
      if (f === 0) continue
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c]
    x[r] = s / M[r][r]
  }
  return x
}

export interface Cx { re: number; im: number }
export const cx = (re: number, im = 0): Cx => ({ re, im })
export const cadd = (a: Cx, b: Cx): Cx => ({ re: a.re + b.re, im: a.im + b.im })
export const csub = (a: Cx, b: Cx): Cx => ({ re: a.re - b.re, im: a.im - b.im })
export const cmul = (a: Cx, b: Cx): Cx => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re })
export const cdiv = (a: Cx, b: Cx): Cx => {
  const d = b.re * b.re + b.im * b.im
  return { re: (a.re * b.re + a.im * b.im) / d, im: (a.im * b.re - a.re * b.im) / d }
}
export const cabs = (a: Cx): number => Math.hypot(a.re, a.im)
export const cang = (a: Cx): number => Math.atan2(a.im, a.re)

export function solveComplex(A: Cx[][], b: Cx[]): Cx[] | null {
  const n = b.length
  if (n === 0) return []
  const M = A.map((row, i) => [...row.map((z) => ({ ...z })), { ...b[i] }])
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++) if (cabs(M[r][col]) > cabs(M[piv][col])) piv = r
    if (cabs(M[piv][col]) < 1e-18) return null
    if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t }
    const p = M[col][col]
    for (let r = col + 1; r < n; r++) {
      const f = cdiv(M[r][col], p)
      if (f.re === 0 && f.im === 0) continue
      for (let c = col; c <= n; c++) M[r][c] = csub(M[r][c], cmul(f, M[col][c]))
    }
  }
  const x: Cx[] = new Array(n).fill(null).map(() => cx(0))
  for (let r = n - 1; r >= 0; r--) {
    let s = { ...M[r][n] }
    for (let c = r + 1; c < n; c++) s = csub(s, cmul(M[r][c], x[c]))
    x[r] = cdiv(s, M[r][r])
  }
  return x
}
