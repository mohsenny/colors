/*
 * Where the eye is. Two ways of being somewhere, both tied to a body you have
 * become, the seat:
 *
 * Looking at something else, you sit just above the seat with its horizon
 * along the bottom of the frame and the other body in the middle, the way a
 * planet's own sky would show it. Zooming in narrows the lens like a
 * telescope; zooming out backs away from the seat until whole orbits fit.
 *
 * Looking at the seat itself, you circle it as a globe.
 *
 * Everything here is in km and double precision. The renderer only ever sees
 * positions taken from the eye, so the Moon a metre away and Neptune four
 * billion km away are both drawn without the jitter single precision would
 * give them.
 */

import type { Vec3 } from '../sky/ephemeris'

export type Mat4 = Float32Array

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s]
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

export function len(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2])
}

export function norm(a: Vec3): Vec3 {
  const l = len(a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

/** `a` with its part along unit `n` taken out, made unit. Falls back to `alt` when nothing is left. */
export function across(a: Vec3, n: Vec3, alt: Vec3): Vec3 {
  const p = sub(a, scale(n, dot(a, n)))
  if (len(p) > 1e-9) return norm(p)
  const q = sub(alt, scale(n, dot(alt, n)))
  return norm(q)
}

/** Turns `v` about unit axis `k` by `a` radians. */
export function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const kv = cross(k, v)
  const d = dot(k, v) * (1 - c)
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d]
}

export const NORTH: Vec3 = [0, 0, 1]
const EQUINOX: Vec3 = [1, 0, 0]

/** Spherical interpolation between unit vectors. */
export function slerp(a: Vec3, b: Vec3, t: number): Vec3 {
  const c = Math.max(-1, Math.min(1, dot(a, b)))
  const w = Math.acos(c)
  if (w < 1e-6) return norm(add(scale(a, 1 - t), scale(b, t)))
  // Turning right round: any way round will do, so go over the top.
  if (Math.PI - w < 1e-3) return rotate(a, across(NORTH, a, EQUINOX), Math.PI * t)
  const s = Math.sin(w)
  return norm(add(scale(a, Math.sin((1 - t) * w) / s), scale(b, Math.sin(t * w) / s)))
}


/** The widest lens, vertical. */
export const FOV = (46 * Math.PI) / 180
/** The narrowest: a twentieth of a degree, about what a good amateur telescope shows. */
export const FOV_MIN = (0.05 * Math.PI) / 180
/** How far above the seat's centre you sit, in its radii, before backing away. */
export const BACK = 1.6
/** The farthest you can back away, in the seat's radii. */
export const BACK_MAX = 4e4
/** The globe view's resting distance and its nearest, in radii. */
export const GLOBE = 3.4
export const GLOBE_MIN = 1.08
export const GLOBE_MAX = 4e4

/** The zoom axis: below zero the lens narrows, above it you back away. */
export const Z_MIN = Math.log(FOV_MIN / FOV)
export const Z_MAX = Math.log(BACK_MAX / BACK)
export const ZG_MIN = Math.log(GLOBE_MIN / GLOBE)
export const ZG_MAX = Math.log(GLOBE_MAX / GLOBE)

/** How far below the middle of the frame the seat's horizon sits, as a share of half the height. */
export const LOW = 0.56
export const LOW_MIN = 0.08
export const LOW_MAX = 0.94

export interface Eye {
  at: Vec3
  forward: Vec3
  up: Vec3
  /** Vertical field of view, radians. */
  fov: number
}

export function fovOf(z: number): number {
  return FOV * Math.exp(Math.min(0, z))
}

export function backOf(z: number): number {
  return BACK * Math.exp(Math.max(0, z))
}

/**
 * Sitting on the seat looking at a target. `turn` walks the eye round the
 * line from the seat to the target, `low` sets where the horizon falls. `air`
 * is the depth of the seat's air, in radii.
 */
export function seatEye(seat: Vec3, radius: number, target: Vec3, z: number, turn: number, low: number, air = 0): Eye {
  const fov = fovOf(z)
  const back = backOf(z)
  const to = sub(target, seat)
  const u = norm(to)
  const q = rotate(across(NORTH, u, EQUINOX), u, turn)
  const limb = Math.asin(Math.min(1, 1 / back))
  const lift = Math.atan(low * Math.tan(fov / 2))
  // Air glows above the horizon. When the lens is too narrow to keep that
  // glow below the target, the horizon slips down out of the frame rather
  // than have the target seen through the air.
  const top = Math.asin(Math.min(1, (1 + air) / back))
  const g = Math.max(limb + lift, top + 0.45 * lift)
  // The target is not infinitely far: seen from beside the seat it sits a
  // little toward the seat's centre, enough to sink it below the Sun's limb
  // in a narrow lens, so step round by that much more. Taken at the nearest
  // sitting, so backing away never swings the eye about.
  const a = g + Math.asin(Math.min(1, (BACK * Math.sin(g) * radius) / len(to)))
  const e = add(scale(u, -Math.cos(a)), scale(q, Math.sin(a)))
  const at = add(seat, scale(e, back * radius))
  const forward = norm(sub(target, at))
  return { at, forward, up: across(q, forward, NORTH), fov }
}

/** Circling the seat: `yaw` round the ecliptic pole, `pitch` above the ecliptic. */
export function globeEye(seat: Vec3, radius: number, z: number, yaw: number, pitch: number): Eye {
  const back = GLOBE * Math.exp(z)
  const c = Math.cos(pitch)
  const dir: Vec3 = [c * Math.cos(yaw), c * Math.sin(yaw), Math.sin(pitch)]
  const at = add(seat, scale(dir, back * radius))
  const forward = scale(dir, -1)
  return { at, forward, up: across(NORTH, forward, EQUINOX), fov: FOV }
}

/** Rotation only: the eye is always the origin. Column-major. */
export function viewRotation(eye: Eye): Mat4 {
  const f = eye.forward
  const r = norm(cross(f, eye.up))
  const u = cross(r, f)
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
  m[15] = 1
  return m
}

export function perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
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
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = s
    }
  }
  return out
}

/** The eye's right, up and forward, for taking directions apart on the CPU. */
export interface Frame {
  right: Vec3
  up: Vec3
  forward: Vec3
  /** tan of half the field, across and up. */
  tx: number
  ty: number
}

export function frameOf(eye: Eye, aspect: number): Frame {
  const forward = eye.forward
  const right = norm(cross(forward, eye.up))
  const up = cross(right, forward)
  const ty = Math.tan(eye.fov / 2)
  return { right, up, forward, tx: ty * aspect, ty }
}

/** Where a direction from the eye lands, in CSS pixels, or null when it is behind. */
export function project(fr: Frame, d: Vec3, width: number, height: number): [number, number] | null {
  const z = dot(d, fr.forward)
  if (z <= 1e-9) return null
  const x = dot(d, fr.right) / z / fr.tx
  const y = dot(d, fr.up) / z / fr.ty
  return [((x + 1) / 2) * width, ((1 - y) / 2) * height]
}

/** The direction from the eye through a point on the screen. */
export function unproject(fr: Frame, px: number, py: number, width: number, height: number): Vec3 {
  const x = ((px / width) * 2 - 1) * fr.tx
  const y = (1 - (py / height) * 2) * fr.ty
  return norm(add(add(fr.forward, scale(fr.right, x)), scale(fr.up, y)))
}
