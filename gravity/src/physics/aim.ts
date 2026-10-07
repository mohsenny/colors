/*
 * The aim: where a particle let go now will go, and the help toward a circle.
 *
 * The forecast steps a copy with the world's own step and tick, so it is what
 * will happen, not a model of it. The fate is read off that path, and from
 * the effective potential where one turn or the clock does not settle it.
 */

import { circularSpeed, cross, dot, landing, len, probeEnergy, step } from './motion'
import type { Mover, Vec3 } from './motion'

export type Fate = 'orbit' | 'escape' | 'fall' | 'unstable'
export type End = 'turn' | 'fall' | 'edge' | 'time'

/** A drag this long along the tangent releases at exactly circular speed. */
export const CIRCLE_PX = 70
/** A circle is only offered this far outside 3 rs. */
export const ISCO_MARGIN = 0.02
/** Snap radii in CSS px, entering and leaving. A finger needs more. */
export const SNAP_PX = { mouse: [12, 20], touch: [24, 34] } as const
/** A drag this short is no direction, and never snaps. */
export const DRAG_MIN_PX = 6
/** A forecast stops here: a minute of viewer time. */
export const FORECAST_TICKS = 3600
/** Once round, and a little, so the ends meet. */
const TURN = 2 * Math.PI + 0.05
/** Steps of the search for a turning point, each way. */
const GRID = 512

/** Unit tangent at p in the plane facing the viewer; `right` if p is on the line of sight. */
export function tangentAt(p: Vec3, forward: Vec3, right: Vec3): Vec3 {
  const t = cross(forward, p)
  const n = len(t)
  if (n <= 1e-6 * Math.max(1, len(p))) return [right[0], right[1], right[2]]
  return [t[0] / n, t[1] / n, t[2] / n]
}

/** The drag (dx, dy; y down) that releases along t at exactly circular speed. */
export function circleDrag(t: Vec3, right: Vec3, up: Vec3): [number, number] {
  return [CIRCLE_PX * dot(t, right), -CIRCLE_PX * dot(t, up)]
}

/** Exact circular velocity at p, one way round. */
export function circleVelocity(p: Vec3, t: Vec3, way: 1 | -1, rs: number): Vec3 {
  const v = way * circularSpeed(len(p), rs)
  return [t[0] * v, t[1] * v, t[2] * v]
}

/** Whether a circle is offered at p: outside 3 rs by the margin, and probeFate says orbit. */
export function circleOffered(p: Vec3, t: Vec3, rs: number, surface: number, edge: number): boolean {
  if (len(p) < 3 * rs * (1 + ISCO_MARGIN)) return false
  return probeFate(p, circleVelocity(p, t, 1, rs), rs, surface, edge) === 'orbit'
}

/** The target the drag holds: its index, or -1. Enters inside `enter`, lets go past `leave`; nearest wins. */
export function snapTo(
  dx: number,
  dy: number,
  targets: readonly (readonly [number, number])[],
  was: number,
  enter: number,
  leave: number,
): number {
  if (Math.hypot(dx, dy) <= DRAG_MIN_PX) return -1
  let best = -1
  let bestD = Infinity
  targets.forEach(([tx, ty], i) => {
    const d = Math.hypot(dx - tx, dy - ty)
    if (d <= (i === was ? leave : enter) && d < bestD) {
      best = i
      bestD = d
    }
  })
  return best
}

/**
 * Orbit, escape or fall, from the effective potential. Never 'unstable'.
 * V(r) = (1 - rs/r)(1 + L^2/r^2); the probe turns where V reaches E^2. With
 * nowhere to turn on the way in it falls, on the way out it leaves. Level
 * counts as in, so a circle balanced on the peak is a fall, never an orbit.
 */
export function probeFate(pos: Vec3, vel: Vec3, rs: number, surface: number, edge: number): Fate {
  const r0 = len(pos)
  const e2 = probeEnergy(pos, vel, rs) ** 2
  const l2 = dot(cross(pos, vel), cross(pos, vel))
  const turns = (to: number): boolean => {
    if (to === r0) return false
    const k = Math.pow(to / r0, 1 / GRID)
    let r = r0
    for (let i = 0; i < GRID; i++) {
      r *= k
      if ((1 - rs / r) * (1 + l2 / (r * r)) >= e2) return true
    }
    return false
  }
  const inner = turns(Math.max(surface, rs))
  const outer = edge > r0 && turns(edge)
  if (dot(pos, vel) > 0) {
    if (!outer) return 'escape'
    return inner ? 'orbit' : 'fall'
  }
  if (!inner) return 'fall'
  return outer ? 'orbit' : 'escape'
}

/** A forecast in progress. Positions packed three floats a tick, the release point first. */
export interface Trace {
  /** The release, untouched. */
  from: Mover
  /** The copy being stepped. */
  mover: Mover
  r0: number
  path: Float32Array
  count: number
  swept: number
  end: End | null
}

/** Starts a trace of a copy of `m`, reusing `path` (3 * (FORECAST_TICKS + 1)). */
export function startTrace(m: Mover, path: Float32Array): Trace {
  const copy = (v: Vec3): Vec3 => [v[0], v[1], v[2]]
  const from: Mover = { kind: m.kind, pos: copy(m.pos), vel: copy(m.vel), energy: m.energy }
  const mover: Mover = { kind: m.kind, pos: copy(m.pos), vel: copy(m.vel), energy: m.energy }
  path[0] = m.pos[0]
  path[1] = m.pos[1]
  path[2] = m.pos[2]
  return { from, mover, r0: len(m.pos), path, count: 1, swept: 0, end: null }
}

/**
 * Steps up to `ticks` world ticks exactly as the world will. Stops once round
 * (probe, swept 2 pi + 0.05), on the surface (last point put on it), past `edge`,
 * or at FORECAST_TICKS. Returns true once ended. Resumable.
 */
export function runTrace(t: Trace, rs: number, surface: number, edge: number, dt: number, ticks: number): boolean {
  const m = t.mover
  for (let i = 0; i < ticks && t.end === null; i++) {
    const from: Vec3 = [m.pos[0], m.pos[1], m.pos[2]]
    const ok = step(m, rs, dt)
    const r = len(m.pos)
    let at: Vec3 = m.pos
    if (!ok || r <= surface) {
      const n = landing(from, m.pos, surface)
      at = [n[0] * surface, n[1] * surface, n[2] * surface]
      t.end = 'fall'
    } else if (r > edge) t.end = 'edge'
    else {
      t.swept += Math.atan2(len(cross(from, at)), dot(from, at))
      if (m.kind === 'probe' && t.swept >= TURN) t.end = 'turn'
    }
    const o = 3 * t.count
    t.path[o] = at[0]
    t.path[o + 1] = at[1]
    t.path[o + 2] = at[2]
    t.count++
    if (t.end === null && t.count > FORECAST_TICKS) t.end = 'time'
  }
  return t.end !== null
}

/**
 * The fate of an ended trace. The path decides a fall or a leave. Once round
 * is an orbit, unless it is a circle made by hand inside 3 rs that held for a
 * turn on the peak: that is no promise. On the clock, the potential decides.
 */
export function fateOf(t: Trace, rs: number, surface: number, edge: number): Fate {
  if (t.end === 'fall') return 'fall'
  if (t.end === 'edge') return 'escape'
  if (t.from.kind === 'light') return 'escape'
  const fate = probeFate(t.from.pos, t.from.vel, rs, surface, edge)
  if (t.end === 'turn') return fate === 'fall' && t.r0 < 3 * rs * (1 + ISCO_MARGIN) ? 'unstable' : 'orbit'
  return fate
}

/**
 * Where to drop dots `pitch` px apart along a projected path (xy per sample,
 * NaN where off the view), skipping the first `skip` px: fractional sample
 * indices. A NaN breaks the run, and the next starts with a dot.
 */
export function dotsAlong(screen: Float32Array, count: number, pitch: number, skip: number): number[] {
  const out: number[] = []
  if (!(pitch > 0)) return out
  let walked = 0
  let next = skip
  let broken = false
  for (let i = 0; i + 1 < count; i++) {
    const ax = screen[2 * i]
    const ay = screen[2 * i + 1]
    const bx = screen[2 * i + 2]
    const by = screen[2 * i + 3]
    if (Number.isNaN(ax) || Number.isNaN(ay) || Number.isNaN(bx) || Number.isNaN(by)) {
      broken = true
      continue
    }
    if (broken) {
      walked = 0
      next = 0
      broken = false
    }
    const d = Math.hypot(bx - ax, by - ay)
    while (next <= walked + d + 1e-9) {
      out.push(i + (d > 0 ? Math.min(1, (next - walked) / d) : 0))
      next += pitch
    }
    walked += d
  }
  return out
}
