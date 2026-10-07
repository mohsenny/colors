/*
 * Becoming another body: the eye turns to it, then goes straight at it, the
 * body held in the middle of the frame and growing steadily, and comes to rest
 * over its globe on the side it came from. A side in the body's night is
 * swapped for a lit one on the way in, the eye swinging round the body as it
 * slows. When the body you leave stands in the way, the eye goes round it
 * first.
 *
 * Bodies move while you travel, so a travel holds only what was fixed when it
 * started, and the eye at any moment is reckoned from where the two bodies are
 * then.
 */

import type { Vec3 } from '../sky/ephemeris'
import { FOV, GLOBE, NORTH, PITCH_MAX, across, add, cross, dot, len, norm, rotate, scale, slerp, sub } from './camera'
import type { Eye } from './camera'

/** The side you came from is kept while the Sun is this near it, seen from the body: most of the disc lit. */
export const LIT = 1.15
/** Otherwise you arrive where a globe is first shown: this far round from the Sun, toward where you came from, */
export const AIM = 0.75
/** and this far over the ecliptic. */
export const HIGH = 0.32
/** The swing to a lit side starts this far into the approach, */
export const SWING = 0.35
/** and is given this long a radian, ms, so it stays a slow arc round the body. */
export const SWING_MS = 1100
/** How near the old seat's centre the way out passes when it has to go round, in its radii. A way that already misses the ground goes straight, over the horizon. */
export const ROUND_KEEP = 1.26
/** The longest a travel takes, ms. */
export const TRAVEL_MAX = 5000

const EQUINOX: Vec3 = [1, 0, 0]

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t))
}

function angle(a: Vec3, b: Vec3): number {
  return Math.atan2(len(cross(a, b)), dot(a, b))
}

/** 0 to 1 with no speed or acceleration at either end. */
export function smoother(t: number): number {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** As smoother, but leaving 0 at slope `v`, in whole moves per whole time. Never turns back for `v` up to 1.8. */
export function launch(s: number, v: number): number {
  const x = clamp01(s)
  return smoother(x) + v * x * (1 - x) ** 3 * (1 + 3 * x)
}

export interface Travel {
  /** The eye at the start, and where it was from the old seat's centre. */
  from: Eye
  rel: Vec3
  /** Round the old seat first, about `axis` by `angle`, over `round` ms. None when the way is clear. */
  axis: Vec3
  angle: number
  round: number
  /** How far the view leaned from north up at the start, radians about the way it faced. */
  lean: number
  /** The turn to face the body, over `turn` ms, leaving at `v` as `launch` takes it. None when it is already in the middle. */
  turn: number
  v: number
  /** The share of the change of lens made while turning: a telescope opens as it swings, so the sky never streams past. */
  widen: number
  /** The approach, from `go` ms for `goMs` ms, setting off `h` km from the old seat's centre. */
  go: number
  goMs: number
  h: number
  /** Where it ends: the side of the body the eye comes to rest on, how far out, km, and the lens. */
  side: Vec3
  reach: number
  fov: number
  ms: number
}

/** How many powers of e the approach covers: away from the old seat, `h` out of it at the start, and in to the body, from `d0` to `reach` km. */
export function span(d0: number, reach: number, h: number): number {
  if (d0 <= reach) return Math.log(reach / d0)
  return Math.log(d0 / h) + Math.log((d0 - reach + h) / reach)
}

/** The approach's length, ms: longer by the power of ten, and long enough to swing `swing` radians round the body slowly. */
export function travelMs(d0: number, reach: number, h: number, swing = 0): number {
  return Math.max(1500, 900 + 230 * (span(d0, reach, h) / Math.LN10), (SWING_MS * swing) / (1 - SWING))
}

/** Where on a body to arrive, coming from unit `from` out of it, with the Sun the unit way `sun`, or null for the Sun itself. */
export function arrivalSide(from: Vec3, sun: Vec3 | null): Vec3 {
  let yaw = Math.atan2(from[1], from[0])
  let pitch = Math.asin(Math.max(-1, Math.min(1, from[2])))
  if (sun && angle(from, sun) > LIT) {
    // Out of its night: the view a globe is first shown at, on your side of the Sun.
    const ys = Math.atan2(sun[1], sun[0])
    const off = Math.atan2(Math.sin(yaw - ys), Math.cos(yaw - ys))
    yaw = ys + (off < -1e-3 ? -AIM : AIM)
    pitch = HIGH
  }
  pitch = Math.max(-PITCH_MAX + 0.02, Math.min(PITCH_MAX - 0.02, pitch))
  return [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)]
}

/**
 * A travel from eye `from`, its forward turning at `spin` (an axis times
 * radians a ms), off the old seat at `seat` to the body at `target`, to rest
 * `reach` km out. `sun` is the Sun's place, null when the Sun is the target.
 */
export function planTravel(
  from: Eye,
  spin: Vec3,
  seat: Vec3,
  seatRadius: number,
  target: Vec3,
  sun: Vec3 | null,
  reach: number,
): Travel {
  const rel = sub(from.at, seat)
  // Round the old seat, never through it, until the body is in sight.
  const n = norm(rel)
  const u = norm(sub(target, seat))
  const th = angle(n, u)
  const past = (keep: number): number => Math.PI - Math.asin(Math.min(1, (keep * seatRadius) / len(rel)))
  let axis: Vec3 = NORTH
  let turnRound = 0
  let round = 0
  if (th > past(1)) {
    const thMax = past(ROUND_KEEP)
    const k = cross(n, u)
    axis = len(k) > 1e-9 ? norm(k) : norm(cross(n, across(NORTH, n, EQUINOX)))
    turnRound = th - thMax + 0.05
    round = 500 + 450 * turnRound
  }
  // Turn to face it, carrying on at the speed the view was already turning.
  // The further round, the longer: right round takes nearly two seconds.
  const aim = norm(sub(target, from.at))
  const off = angle(from.forward, aim)
  let turn = 0
  let v = 0
  // Under about a pixel off, through whatever lens, it is already there.
  if (off > 1e-3 * from.fov) {
    turn = 350 + 1450 * Math.sqrt(off / Math.PI)
    const w = dot(spin, norm(cross(from.forward, aim)))
    if (w > 0) {
      turn = Math.max(60, Math.min(turn, (1.8 * off) / w))
      v = Math.max(0, Math.min(1.8, (w * turn) / off))
    }
  }
  const widen = turn > 0 ? 0.6 * (off / Math.PI) : 0
  const go = Math.max(round, 0.4 * turn)
  const out = sub(add(seat, rotate(rel, axis, turnRound)), target)
  const side = arrivalSide(norm(out), sun ? norm(sub(sun, target)) : null)
  const h = len(rel)
  const goMs = Math.max(400, Math.min(travelMs(len(out), reach, h, angle(norm(out), side)), TRAVEL_MAX - go))
  const level = across(NORTH, from.forward, EQUINOX)
  const lean = Math.atan2(dot(cross(level, from.up), from.forward), dot(level, from.up))
  return { from, rel, axis, angle: turnRound, round, lean, turn, v, widen, go, goMs, h, side, reach, fov: FOV, ms: go + goMs }
}

/** The eye `t` ms into a travel, with the old seat and the body where they are now. */
export function travelEye(tr: Travel, t: number, seat: Vec3, target: Vec3): Eye {
  if (t >= tr.ms) {
    const forward = scale(tr.side, -1)
    return { at: add(target, scale(tr.side, tr.reach)), forward, up: across(NORTH, forward, EQUINOX), fov: tr.fov }
  }
  const p = tr.round > 0 ? add(seat, rotate(tr.rel, tr.axis, tr.angle * smoother(t / tr.round))) : add(seat, tr.rel)
  const s = sub(p, target)
  const d0 = len(s)
  const q = (t - tr.go) / tr.goMs
  const g = smoother(q)
  // In along the line, a power of ten at a time: out of the old seat's
  // neighbourhood at first, then into the body's, slowing as it comes. When
  // it starts nearer than it ends, it backs off the same way.
  const side = slerp(scale(s, 1 / d0), tr.side, smoother((q - SWING) / (1 - SWING)))
  let d = Math.exp(Math.log(d0) + (Math.log(tr.reach) - Math.log(d0)) * g)
  // How far in it has come, in powers of ten of the body's own distance.
  let closed = g
  if (d0 > tr.reach) {
    const u0 = Math.log(tr.h / d0)
    const u1 = Math.log((d0 - tr.reach + tr.h) / tr.reach)
    d = (d0 + tr.h) / (1 + Math.exp(u0 + (u1 - u0) * g))
    closed = Math.max(0, Math.min(1, Math.log(d0 / d) / Math.log(d0 / tr.reach)))
  }
  const at = add(target, scale(side, d))
  const aim = scale(side, -1)
  const forward = t < tr.turn ? slerp(tr.from.forward, aim, launch(t / tr.turn, tr.v)) : aim
  // North stays up. Any lean the view started with eases out over the way.
  const level = across(NORTH, forward, EQUINOX)
  const up = rotate(level, forward, tr.lean * (1 - smoother(t / tr.ms)))
  // The lens opens some as it turns, and the rest as the body comes in, so
  // once in the middle the body only ever grows.
  const l = (tr.turn > 0 ? tr.widen * smoother(t / tr.turn) : 0) + (1 - tr.widen) * closed
  const fov = Math.exp(Math.log(tr.from.fov) + (Math.log(tr.fov) - Math.log(tr.from.fov)) * l)
  return { at, forward, up, fov }
}

/** The yaw, pitch and zoom that put a globe eye at `at` round a body: globeEye backwards. */
export function globeAngles(seat: Vec3, radius: number, at: Vec3): { yaw: number; pitch: number; zg: number } {
  const d = scale(sub(at, seat), 1 / radius)
  const l = len(d)
  return {
    yaw: Math.atan2(d[1], d[0]),
    pitch: Math.asin(Math.max(-1, Math.min(1, d[2] / l))),
    zg: Math.log(l / GLOBE),
  }
}
