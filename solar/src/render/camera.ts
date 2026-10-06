/*
 * Where the eye is. Two ways of being somewhere, both tied to a body you have
 * become, the seat:
 *
 * Looking at something else, you sit just above the seat with its horizon
 * along the bottom of the frame and the other body in the middle, the way a
 * planet's own sky would show it. Dragging the sky swings the eye round the
 * seat, so it stays under you while the sky turns; dragging the ground takes
 * you round the seat, the target staying put. Zooming in narrows the lens like a
 * telescope; zooming out backs away from the seat until whole orbits fit.
 *
 * Looking at the seat itself, you circle it as a globe, and zoom toward the
 * ground under the pointer.
 *
 * Everything here is in km and double precision. The renderer only ever sees
 * positions taken from the eye, so the Moon a metre away and Neptune four
 * billion km away are both drawn without the jitter single precision would
 * give them.
 */

import { AU_KM } from '../sky/bodies'
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
/** The farthest you can back away from any seat, km: Neptune's whole orbit fits, with room round it. */
export const FAR = 100 * AU_KM
/** The globe view's resting distance and its nearest, in radii. */
export const GLOBE = 3.4
export const GLOBE_MIN = 1.08

/** The zoom axis: below zero the lens narrows, above it you back away. */
export const Z_MIN = Math.log(FOV_MIN / FOV)
export const ZG_MIN = Math.log(GLOBE_MIN / GLOBE)

/** The far end of the zoom axis on a seat this big, where backing away reaches `FAR`. */
export function zMax(radius: number): number {
  return Math.log(FAR / (BACK * radius))
}

export function zgMax(radius: number): number {
  return Math.log(FAR / (GLOBE * radius))
}

/** How far below the middle of the frame the seat's horizon sits, as a share of half the height. */
export const LOW = 0.56
/** As high as taking hold of the ground brings the horizon, a little under the target, and as low, just above the bottom edge. */
export const LOW_MIN = 0.1
export const LOW_MAX = 0.92
/** How far above or below the ecliptic you can turn to face, radians. */
export const RISE_MAX = 1.4
/** How far toward a pole the globe can be turned, radians: over the pole itself north has no way to be up. */
export const PITCH_MAX = 1.45

export interface Eye {
  at: Vec3
  forward: Vec3
  up: Vec3
  /** Vertical field of view, radians. */
  fov: number
}

/**
 * Part way from facing as `a` does to facing as `b` does: forward the shortest
 * way round, and up carried round with it, rolling steadily about the forward
 * from one up to the other. Up turned on its own would swing through almost
 * anywhere when the two ups are nearly opposite.
 */
export function turnTo(a: Eye, b: Eye, t: number): [Vec3, Vec3] {
  const forward = slerp(a.forward, b.forward, t)
  const carry = (up: Vec3, from: Vec3): Vec3 => {
    const k = cross(from, forward)
    const s = len(k)
    return s < 1e-9 ? up : rotate(up, scale(k, 1 / s), Math.atan2(s, dot(from, forward)))
  }
  const ua = carry(a.up, a.forward)
  const ub = carry(b.up, b.forward)
  const roll = Math.atan2(dot(cross(ua, ub), forward), dot(ua, ub))
  return [forward, rotate(ua, forward, roll * t)]
}

export function fovOf(z: number): number {
  return FOV * Math.exp(Math.min(0, z))
}

export function backOf(z: number): number {
  return BACK * Math.exp(Math.max(0, z))
}

/**
 * The way you face: the way to the target, swung round a pole by `swing` and
 * raised toward it by `rise`. The pole is the ecliptic's unless you have gone
 * round the seat.
 */
export function facing(to: Vec3, swing: number, rise: number, pole = NORTH): Vec3 {
  const d = norm(to)
  if (swing === 0 && rise === 0) return d
  const flat = rotate(across(d, pole, EQUINOX), pole, swing)
  const lat = Math.max(-RISE_MAX, Math.min(RISE_MAX, Math.asin(Math.max(-1, Math.min(1, dot(d, pole)))) + rise))
  return add(scale(flat, Math.cos(lat)), scale(pole, Math.sin(lat)))
}

/**
 * Sitting on the seat facing a target, or turned away from it by `swing` and
 * `rise`: the eye goes round the seat, which stays under you. `air` is the
 * depth of the seat's air and `low` where its horizon falls. `side` takes you
 * round the seat from over its north, turning its sky about the way to the
 * target, which stays where it was.
 */
export function seatEye(
  seat: Vec3,
  radius: number,
  target: Vec3,
  z: number,
  swing: number,
  rise: number,
  air = 0,
  low = LOW,
  side = 0,
): Eye {
  const fov = fovOf(z)
  const back = backOf(z)
  const to = sub(target, seat)
  const reach = len(to)
  const pole = side === 0 ? NORTH : rotate(NORTH, norm(to), side)
  const u = facing(to, swing, rise, pole)
  const aim = add(seat, scale(u, reach))
  const q = across(pole, u, EQUINOX)
  const limb = Math.asin(Math.min(1, 1 / back))
  const lift = 2 * Math.atan(low * Math.tan(fov / 4))
  // Air glows above the horizon. When the lens is too narrow to keep that
  // glow below the target, the horizon slips down out of the frame rather
  // than have the target seen through the air.
  const top = Math.asin(Math.min(1, (1 + air) / back))
  const g = Math.max(limb + lift, top + 0.45 * lift)
  // The target is not infinitely far: seen from beside the seat it sits a
  // little toward the seat's centre, enough to sink it below the Sun's limb
  // in a narrow lens, so step round by that much more. Taken at the nearest
  // sitting, so backing away never swings the eye about.
  const a = g + Math.asin(Math.min(1, (BACK * Math.sin(g) * radius) / reach))
  const e = add(scale(u, -Math.cos(a)), scale(q, Math.sin(a)))
  const at = add(seat, scale(e, back * radius))
  const forward = norm(sub(aim, at))
  return { at, forward, up: across(q, forward, pole), fov }
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

/** Where a ray from `from`, in radii from a globe's centre, first meets its ground, or null if it misses. */
export function meet(from: Vec3, ray: Vec3): Vec3 | null {
  const b = dot(from, ray)
  const q = b * b - dot(from, from) + 1
  if (q < 0) return null
  const t = -b - Math.sqrt(q)
  return t < 0 ? null : norm(add(from, scale(ray, t)))
}

/**
 * The yaw and pitch that show the ground at `n` from `back` radii out, `off`
 * radians from the middle of the frame and `toward` radians round from its
 * right, moving the eye as little as it can from `yaw` and `pitch`. The globe
 * keeps north up, which leaves some places near a pole out of reach; there the
 * eye goes as near as it can.
 */
export function overSpot(n: Vec3, off: number, toward: number, back: number, yaw: number, pitch: number): [number, number] {
  // How far round the globe from under the eye the ground is.
  const g = Math.asin(Math.min(1, back * Math.sin(off))) - off
  // Right is east and up is north, so from under the eye the ground lies g
  // away on a bearing whose northward part is sin(toward): the sine of its
  // latitude is cos g sin(pitch) + sin g sin(toward) cos(pitch).
  const lat = Math.asin(n[2])
  const a = Math.cos(g)
  const b = Math.sin(g) * Math.sin(toward)
  const s = Math.max(-1, Math.min(1, Math.sin(lat) / Math.hypot(a, b)))
  // Seen from over the pole, the ground then lies a cos(pitch) - b sin(pitch)
  // out along the eye's meridian and sin g cos(toward) east of it.
  const lon = Math.atan2(n[1], n[0])
  const at = (p: number): [number, number] => [lon - Math.atan2(Math.sin(g) * Math.cos(toward), a * Math.cos(p) - b * Math.sin(p)), p]
  // Two pitches do it, one each side of the one that would carry the ground
  // highest. Near a pole they put the eye on either side of it, half way round
  // the globe from each other, so take the one nearer where the eye is.
  const phi = Math.atan2(b, a)
  const top = Math.asin(s)
  const near = at(top - phi)
  const far = at((top + phi > 0 ? Math.PI : -Math.PI) - top - phi)
  const close = ([y, p]: [number, number]): number => Math.sin(p) * Math.sin(pitch) + Math.cos(p) * Math.cos(pitch) * Math.cos(y - yaw)
  const [y, p] = close(near) >= close(far) ? near : far
  // Past the pole the pitch stops short, the eye staying on its side. Turning
  // there to bring the ground round toward the pointer lands it nearer, unless
  // that spins the globe further round than the yaw for the pitch it wanted.
  const q = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, p))
  const [round] = at(q)
  const spin = (v: number): number => Math.abs(Math.atan2(Math.sin(v - yaw), Math.cos(v - yaw)))
  return q === p || spin(y) < spin(round) ? [y, q] : [round, q]
}

/**
 * Taking hold of the ground and moving across: the way round the seat that
 * brings the ground at `ground` (km) to the hand at `x`, found by Newton's
 * method from `side`. `view` is the eye gone round by a side. Only across, as
 * the ground curves up or down on its way round and following that too would
 * walk the horizon off. A hand past where the ground can reach gets it as
 * near as it will come, but not past where it turns back: from there it
 * would come back toward the hand the far way round, and a hand coming back
 * would turn you on the way it went.
 */
export function grip(
  view: (side: number) => Eye,
  ground: Vec3,
  x: number,
  width: number,
  height: number,
  side: number,
): number {
  const spot = (s: number): number | null => {
    const eye = view(s)
    return project(frameOf(eye, width / height), norm(sub(ground, eye.at)), width, height)?.[0] ?? null
  }
  const miss = (p: number | null): number => (p === null ? Infinity : Math.abs(x - p))
  const h = 1e-6
  let s = side
  let p = spot(s)
  for (let i = 0; i < 8 && p !== null && miss(p) > 0.01; i++) {
    const ps = spot(s + h)
    if (ps === null) break
    const slope = (ps - p) / h
    if (Math.abs(slope) < 1e-9) break
    // No more than a few degrees at a time, then halved until it helps and the
    // ground still moves the way it did, so a hand past its reach can neither
    // fling you round nor carry the ground past where it turns back.
    const ds = Math.max(-0.1, Math.min(0.1, (x - p) / slope))
    let t = 1
    let next: number | null = null
    for (; t > 1 / 64; t /= 2) {
      next = spot(s + t * ds)
      const on = spot(s + t * ds + h)
      if (next !== null && on !== null && miss(next) < miss(p) && (on - next) * slope > 0) break
    }
    if (t <= 1 / 64) break
    s += t * ds
    p = next
  }
  return s
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

/**
 * The eye's right, up and forward, for taking directions apart on the CPU.
 *
 * The sky is drawn stereographically: a direction lands on the plane at its
 * offset across and up over one plus its depth. It is the projection that
 * keeps every circle a circle, so a body at the edge of a wide lens is as
 * round as one in the middle, where an ordinary camera would stretch it into
 * an oval. Through a narrow lens the two are the same.
 */
export interface Frame {
  right: Vec3
  up: Vec3
  forward: Vec3
  /** Half the screen's width and height on that plane: the tangent of a quarter of the field. */
  sx: number
  sy: number
}

export function frameOf(eye: Eye, aspect: number): Frame {
  const forward = eye.forward
  const right = norm(cross(forward, eye.up))
  const up = cross(right, forward)
  const sy = Math.tan(eye.fov / 4)
  return { right, up, forward, sx: sy * aspect, sy }
}

/** Where a direction from the eye lands, in CSS pixels, or null when it is straight behind. */
export function project(fr: Frame, d: Vec3, width: number, height: number): [number, number] | null {
  const k = 1 + dot(d, fr.forward)
  if (k <= 1e-9) return null
  const x = dot(d, fr.right) / k / fr.sx
  const y = dot(d, fr.up) / k / fr.sy
  return [((x + 1) / 2) * width, ((1 - y) / 2) * height]
}

/** The direction from the eye through a point on the screen. */
export function unproject(fr: Frame, px: number, py: number, width: number, height: number): Vec3 {
  const x = ((px / width) * 2 - 1) * fr.sx
  const y = (1 - (py / height) * 2) * fr.sy
  const r2 = x * x + y * y
  return scale(add(add(scale(fr.right, 2 * x), scale(fr.up, 2 * y)), scale(fr.forward, 1 - r2)), 1 / (1 + r2))
}

/** How much sky a pixel covers in a direction: a little less toward the edges, the same every way round. */
export function pixelAngle(fr: Frame, d: Vec3, height: number): number {
  return ((2 * fr.sy) / height) * (1 + dot(d, fr.forward))
}

/**
 * Where the patch of sky within `ang` of direction `d` lands: a circle, as
 * centre and radius on the plane. Null when it reaches round behind the eye,
 * where it would cover everything outside a circle instead.
 */
export function circleOf(fr: Frame, d: Vec3, ang: number): { x: number; y: number; r: number } | null {
  const a = dot(d, fr.right)
  const b = dot(d, fr.up)
  const s = Math.hypot(a, b)
  const th = Math.atan2(s, dot(d, fr.forward))
  if (th + ang >= Math.PI - 1e-3) return null
  const near = Math.tan((th - ang) / 2)
  const far = Math.tan((th + ang) / 2)
  const mid = s > 0 ? (near + far) / 2 / s : 0
  return { x: a * mid, y: b * mid, r: (far - near) / 2 }
}
