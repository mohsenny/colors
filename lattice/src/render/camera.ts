/*
 * An orbit camera and the few matrix helpers it needs. Column-major, as WebGL
 * wants them.
 */

import type { Vec3 } from '../physics/motion'

export type Mat4 = Float32Array

export const FOV = (38 * Math.PI) / 180
export const DIST_MIN = 4
export const DIST_MAX = 64
export const DIST_DEFAULT = 25
/** Short of straight down: past it the up vector flips and the room spins. */
const PITCH_LIMIT = 1.35

export interface Basis {
  eye: Vec3
  /** Unit vector from the eye toward the centre. */
  forward: Vec3
  right: Vec3
  up: Vec3
}

export class OrbitCamera {
  yaw = 0.62
  pitch = 0.32
  distance = DIST_DEFAULT

  turn(dYaw: number, dPitch: number): void {
    this.yaw += dYaw
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch + dPitch))
  }

  zoom(factor: number): void {
    this.distance = Math.max(DIST_MIN, Math.min(DIST_MAX, this.distance * factor))
  }

  reset(): void {
    this.yaw = 0.62
    this.pitch = 0.32
    this.distance = DIST_DEFAULT
  }

  basis(): Basis {
    const cp = Math.cos(this.pitch)
    const eye: Vec3 = [
      this.distance * cp * Math.sin(this.yaw),
      this.distance * Math.sin(this.pitch),
      this.distance * cp * Math.cos(this.yaw),
    ]
    const forward = normalize([-eye[0], -eye[1], -eye[2]])
    const right = normalize(cross(forward, [0, 1, 0]))
    const up = cross(right, forward)
    return { eye, forward, right, up }
  }

  matrices(aspect: number): { view: Mat4; proj: Mat4; viewProj: Mat4; inverse: Mat4; basis: Basis } {
    const basis = this.basis()
    const view = lookAt(basis)
    const near = Math.max(0.1, this.distance - 30)
    const proj = perspective(FOV, aspect, near, this.distance + 30)
    const viewProj = multiply(proj, view)
    return { view, proj, viewProj, inverse: invert(viewProj), basis }
  }
}

export function normalize(v: Vec3): Vec3 {
  const n = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / n, v[1] / n, v[2] / n]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function lookAt(b: Basis): Mat4 {
  const { eye, right: r, up: u, forward: f } = b
  const m = new Float32Array(16)
  m[0] = r[0]
  m[4] = r[1]
  m[8] = r[2]
  m[1] = u[0]
  m[5] = u[1]
  m[9] = u[2]
  m[2] = -f[0]
  m[6] = -f[1]
  m[10] = -f[2]
  m[12] = -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2])
  m[13] = -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2])
  m[14] = f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2]
  m[15] = 1
  return m
}

function perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fov / 2)
  const m = new Float32Array(16)
  m[0] = f / aspect
  m[5] = f
  m[10] = (far + near) / (near - far)
  m[11] = -1
  m[14] = (2 * far * near) / (near - far)
  return m
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const m = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      m[c * 4 + r] = s
    }
  }
  return m
}

export function invert(m: Mat4): Mat4 {
  const inv = new Float32Array(16)
  const a = m
  inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15] + a[9] * a[7] * a[14] + a[13] * a[6] * a[11] - a[13] * a[7] * a[10]
  inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15] - a[8] * a[7] * a[14] - a[12] * a[6] * a[11] + a[12] * a[7] * a[10]
  inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15] + a[8] * a[7] * a[13] + a[12] * a[5] * a[11] - a[12] * a[7] * a[9]
  inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14] - a[8] * a[6] * a[13] - a[12] * a[5] * a[10] + a[12] * a[6] * a[9]
  inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15] - a[9] * a[3] * a[14] - a[13] * a[2] * a[11] + a[13] * a[3] * a[10]
  inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15] + a[8] * a[3] * a[14] + a[12] * a[2] * a[11] - a[12] * a[3] * a[10]
  inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15] - a[8] * a[3] * a[13] - a[12] * a[1] * a[11] + a[12] * a[3] * a[9]
  inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14] + a[8] * a[2] * a[13] + a[12] * a[1] * a[10] - a[12] * a[2] * a[9]
  inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15] + a[5] * a[3] * a[14] + a[13] * a[2] * a[7] - a[13] * a[3] * a[6]
  inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15] - a[4] * a[3] * a[14] - a[12] * a[2] * a[7] + a[12] * a[3] * a[6]
  inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15] + a[4] * a[3] * a[13] + a[12] * a[1] * a[7] - a[12] * a[3] * a[5]
  inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14] - a[4] * a[2] * a[13] - a[12] * a[1] * a[6] + a[12] * a[2] * a[5]
  inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11] - a[5] * a[3] * a[10] - a[9] * a[2] * a[7] + a[9] * a[3] * a[6]
  inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11] + a[4] * a[3] * a[10] + a[8] * a[2] * a[7] - a[8] * a[3] * a[6]
  inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11] - a[4] * a[3] * a[9] - a[8] * a[1] * a[7] + a[8] * a[3] * a[5]
  inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10] + a[4] * a[2] * a[9] + a[8] * a[1] * a[6] - a[8] * a[2] * a[5]
  const det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12]
  const d = det === 0 ? 0 : 1 / det
  for (let i = 0; i < 16; i++) inv[i] *= d
  return inv
}

/** World point to CSS pixels. Null behind the camera. */
export function project(viewProj: Mat4, p: Vec3, width: number, height: number): [number, number, number] | null {
  const x = viewProj[0] * p[0] + viewProj[4] * p[1] + viewProj[8] * p[2] + viewProj[12]
  const y = viewProj[1] * p[0] + viewProj[5] * p[1] + viewProj[9] * p[2] + viewProj[13]
  const z = viewProj[2] * p[0] + viewProj[6] * p[1] + viewProj[10] * p[2] + viewProj[14]
  const w = viewProj[3] * p[0] + viewProj[7] * p[1] + viewProj[11] * p[2] + viewProj[15]
  if (w <= 0) return null
  return [((x / w) * 0.5 + 0.5) * width, (1 - ((y / w) * 0.5 + 0.5)) * height, z / w]
}

/** A ray from the eye through a CSS pixel. */
export function ray(inverse: Mat4, eye: Vec3, px: number, py: number, width: number, height: number): Vec3 {
  const nx = (px / width) * 2 - 1
  const ny = 1 - (py / height) * 2
  const x = inverse[0] * nx + inverse[4] * ny + inverse[8] + inverse[12]
  const y = inverse[1] * nx + inverse[5] * ny + inverse[9] + inverse[13]
  const z = inverse[2] * nx + inverse[6] * ny + inverse[10] + inverse[14]
  const w = inverse[3] * nx + inverse[7] * ny + inverse[11] + inverse[15]
  return normalize([x / w - eye[0], y / w - eye[1], z / w - eye[2]])
}
