/*
 * How things move through the drawn field. Room units, c = 1, GM = rs / 2.
 *
 * Probes follow exact Schwarzschild geodesics, written in vector form in their
 * own proper time and converted to the viewer's time once per substep. Light
 * follows the exact null orbit shape, at the coordinate speed of light, which is
 * what a far observer sees: slower near the mass, zero at a horizon.
 */

export type Kind = 'probe' | 'light'

export type Vec3 = [number, number, number]

export interface Mover {
  kind: Kind
  pos: Vec3
  /** Probe: dx/dtau. Light: unit direction of travel. */
  vel: Vec3
  /** Probe energy per unit mass, fixed at launch. Unused for light. */
  energy: number
}

const SUBSTEPS = 8

function len(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

/** d2x/dtau2 = -(rs/2) x / r^3 (1 + 3 h^2 / r^2), h = |x cross u|. */
function probeAccel(x: Vec3, u: Vec3, rs: number): Vec3 {
  const r2 = dot(x, x)
  const r = Math.sqrt(r2)
  const h = cross(x, u)
  const h2 = dot(h, h)
  const k = (-(rs / 2) / (r2 * r)) * (1 + (3 * h2) / r2)
  return [x[0] * k, x[1] * k, x[2] * k]
}

/** Energy per unit mass: E^2 = (dr/dtau)^2 + (1 - rs/r)(1 + h^2/r^2). */
export function probeEnergy(pos: Vec3, vel: Vec3, rs: number): number {
  const r = len(pos)
  const radial = dot(vel, pos) / r
  const h = len(cross(pos, vel))
  return Math.sqrt(radial * radial + (1 - rs / r) * (1 + (h * h) / (r * r)))
}

/** Speed a static observer at the probe's position would measure. Reaches 1 at a horizon. */
export function localSpeed(m: Mover, rs: number): number {
  if (m.kind === 'light') return 1
  const r = len(m.pos)
  return Math.sqrt(Math.max(0, 1 - (1 - rs / r) / (m.energy * m.energy)))
}

/** dtau/dt: how fast the probe's own clock runs against the viewer's. */
export function clockRate(m: Mover, rs: number): number {
  if (m.kind === 'light') return 0
  const r = len(m.pos)
  return Math.max(0, (1 - rs / r) / m.energy)
}

/** Speed of light as seen from far away, at angle alpha to the radial direction. */
export function lightSpeedSeen(pos: Vec3, dir: Vec3, rs: number): number {
  const r = len(pos)
  const g = Math.max(0, 1 - rs / r)
  if (g === 0) return 0
  const c = dot(dir, pos) / r
  return Math.sqrt(g) / Math.sqrt((c * c) / g + (1 - c * c))
}

/** Speed of the drawn mover in room units per unit of viewer time. */
export function seenSpeed(m: Mover, rs: number): number {
  if (m.kind === 'light') return lightSpeedSeen(m.pos, m.vel, rs)
  return localSpeed(m, rs) * Math.sqrt(Math.max(0, 1 - rs / len(m.pos)))
}

function rk4Probe(m: Mover, rs: number, dtau: number): void {
  const x = m.pos
  const u = m.vel
  const a1 = probeAccel(x, u, rs)
  const x2: Vec3 = [x[0] + (u[0] * dtau) / 2, x[1] + (u[1] * dtau) / 2, x[2] + (u[2] * dtau) / 2]
  const u2: Vec3 = [u[0] + (a1[0] * dtau) / 2, u[1] + (a1[1] * dtau) / 2, u[2] + (a1[2] * dtau) / 2]
  const a2 = probeAccel(x2, u2, rs)
  const x3: Vec3 = [x[0] + (u2[0] * dtau) / 2, x[1] + (u2[1] * dtau) / 2, x[2] + (u2[2] * dtau) / 2]
  const u3: Vec3 = [u[0] + (a2[0] * dtau) / 2, u[1] + (a2[1] * dtau) / 2, u[2] + (a2[2] * dtau) / 2]
  const a3 = probeAccel(x3, u3, rs)
  const x4: Vec3 = [x[0] + u3[0] * dtau, x[1] + u3[1] * dtau, x[2] + u3[2] * dtau]
  const u4: Vec3 = [u[0] + a3[0] * dtau, u[1] + a3[1] * dtau, u[2] + a3[2] * dtau]
  const a4 = probeAccel(x4, u4, rs)
  for (let i = 0; i < 3; i++) {
    x[i] += (dtau / 6) * (u[i] + 2 * u2[i] + 2 * u3[i] + u4[i])
    u[i] += (dtau / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i])
  }
}

/**
 * The bend for light, by coordinate arc length: the photon "force"
 * -(3/2) rs h^2 x / r^5 with only its part across the direction of travel
 * kept, then the direction renormalised. Curvature does not depend on how
 * fast the path is traversed, so this traces the exact null orbit.
 */
function lightTurn(x: Vec3, d: Vec3, rs: number): Vec3 {
  const r2 = dot(x, x)
  const h = cross(x, d)
  const h2 = dot(h, h)
  const k = (-1.5 * rs * h2) / (r2 * r2 * Math.sqrt(r2))
  const a: Vec3 = [x[0] * k, x[1] * k, x[2] * k]
  const along = dot(a, d)
  return [a[0] - along * d[0], a[1] - along * d[1], a[2] - along * d[2]]
}

function rk4Light(m: Mover, rs: number, ds: number): void {
  const x = m.pos
  const d = m.vel
  const a1 = lightTurn(x, d, rs)
  const x2: Vec3 = [x[0] + (d[0] * ds) / 2, x[1] + (d[1] * ds) / 2, x[2] + (d[2] * ds) / 2]
  const d2: Vec3 = [d[0] + (a1[0] * ds) / 2, d[1] + (a1[1] * ds) / 2, d[2] + (a1[2] * ds) / 2]
  const a2 = lightTurn(x2, d2, rs)
  const x3: Vec3 = [x[0] + (d2[0] * ds) / 2, x[1] + (d2[1] * ds) / 2, x[2] + (d2[2] * ds) / 2]
  const d3: Vec3 = [d[0] + (a2[0] * ds) / 2, d[1] + (a2[1] * ds) / 2, d[2] + (a2[2] * ds) / 2]
  const a3 = lightTurn(x3, d3, rs)
  const x4: Vec3 = [x[0] + d3[0] * ds, x[1] + d3[1] * ds, x[2] + d3[2] * ds]
  const d4: Vec3 = [d[0] + a3[0] * ds, d[1] + a3[1] * ds, d[2] + a3[2] * ds]
  const a4 = lightTurn(x4, d4, rs)
  for (let i = 0; i < 3; i++) {
    x[i] += (ds / 6) * (d[i] + 2 * d2[i] + 2 * d3[i] + d4[i])
    d[i] += (ds / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i])
  }
  const n = len(d)
  d[0] /= n
  d[1] /= n
  d[2] /= n
}

/** Advance by `dt` of the viewer's time. Returns false once the mover is inside rs. */
export function step(m: Mover, rs: number, dt: number): boolean {
  const h = dt / SUBSTEPS
  for (let i = 0; i < SUBSTEPS; i++) {
    const r = len(m.pos)
    if (r <= rs * 1.0005) return false
    if (m.kind === 'probe') {
      const dtau = (h * (1 - rs / r)) / m.energy
      rk4Probe(m, rs, dtau)
    } else {
      rk4Light(m, rs, h * lightSpeedSeen(m.pos, m.vel, rs))
    }
  }
  return len(m.pos) > rs * 1.0005
}

/**
 * Tangential speed (dx/dtau) of a circular orbit at radius r. There is none
 * inside the photon sphere, 1.5 rs; between that and 3 rs it exists but is
 * unstable, which is exactly the plunge the instrument should show.
 */
export function circularSpeed(r: number, rs: number): number {
  if (rs <= 0) return 0
  if (r <= 1.5 * rs * 1.001) return 3
  const l2 = ((rs / 2) * r * r) / (r - 1.5 * rs)
  return Math.sqrt(l2) / r
}

export function makeProbe(pos: Vec3, vel: Vec3, rs: number): Mover {
  const p: Vec3 = [pos[0], pos[1], pos[2]]
  const v: Vec3 = [vel[0], vel[1], vel[2]]
  return { kind: 'probe', pos: p, vel: v, energy: probeEnergy(p, v, rs) }
}

export function makeLight(pos: Vec3, dir: Vec3): Mover {
  const n = len(dir) || 1
  return { kind: 'light', pos: [pos[0], pos[1], pos[2]], vel: [dir[0] / n, dir[1] / n, dir[2] / n], energy: 0 }
}

export function radiusOf(m: Mover): number {
  return len(m.pos)
}

/**
 * Where a step from `a` to `b` first crosses the sphere of `radius`, as a unit
 * vector. A step is long next to a ring a few pixels wide, so the end of it
 * would put the ring visibly past where the particle went in.
 */
export function landing(a: Vec3, b: Vec3, radius: number): Vec3 {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const qa = dot(d, d)
  const qb = dot(a, d)
  const disc = qb * qb - qa * (dot(a, a) - radius * radius)
  const t = qa > 1e-12 && disc >= 0 ? Math.max(0, Math.min(1, (-qb - Math.sqrt(disc)) / qa)) : 1
  const p: Vec3 = [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t]
  const n = len(p) || 1
  return [p[0] / n, p[1] / n, p[2] / n]
}

export { cross, dot, len }
