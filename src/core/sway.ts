/**
 * Autonomous tilt.
 *
 * Every sheet is cut with a slight lean, seeded once, and then the lean itself
 * moves: very slowly, and never out of the band the lean was drawn from. You
 * are not meant to catch it happening. A sheet's corner travels about a tenth
 * of a pixel a second at the fastest, so nothing on screen reads as turning.
 * What you notice is that the composition you looked at a minute ago is not
 * quite the one in front of you, which is the same thing the colour drift does
 * and for the same reason.
 *
 * This is not the old SPIN, which integrated an angular velocity and needed a
 * restoring spring to stop slides wandering off to 20 degrees. Three properties
 * make it different, and they are the same three that make the colour drift
 * work (see core/drift.ts):
 *
 *   1. It is BOUNDED BY CONSTRUCTION, not by a clamp. Two octaves of noise, each
 *      in [-1, 1], weighted to sum to one, scaled by the room left between the
 *      sheet's resting lean and the edge of the tilt band. A clamp would put a
 *      flat spot at the limit, and at this speed a flat spot lasts half a
 *      minute: the one thing that would be visible is the sheet stopping.
 *   2. It is a PURE FUNCTION of simulation time. Nothing accumulates, so a
 *      scrub is exact for free and a dropped frame costs nothing.
 *   3. It is SEED-INDEPENDENT. The cells are hashes of the slide id, not draws
 *      from a table, so the sway is the same before and after a regenerate and
 *      the sheets do not all lurch when the palette rolls.
 *
 * A sheet seeded near the edge of the band sways less than one seeded upright,
 * because that is what "never leaves the band" means. It also happens to be
 * what you want: a set where every sheet moves by the same amount reads as one
 * hand tilting the whole table.
 */

import { SWAY_DEG, SWAY_PERIOD_S, SWAY_PERIOD_SPREAD, SWAY_RIPPLE_S, SWAY_RIPPLE_W, TILT_DEG } from './constants'
import { DEG } from './noise'
import { hash01 } from './rng'

/** Salts, so the two octaves and the rate of one slide are independent. */
const S_SLOW = 0x4c9f
const S_RIPPLE = 0xb17d
const S_RATE = 0x2e63

/**
 * Value noise with hashed cells, in [-1, 1].
 *
 * The same smoothstep interpolation as `vnoise` in core/noise, keyed on the
 * slide instead of read from a table. A table would have to be threaded through
 * the simulation runtime and reseeded with it, and this has to survive a reseed.
 */
function octave(id: number, salt: number, u: number): number {
  const k = Math.floor(u)
  const f = u - k
  const s = f * f * (3 - 2 * f)
  const a = hash01(id, salt, k) * 2 - 1
  const b = hash01(id, salt, k + 1) * 2 - 1
  return a + (b - a) * s
}

/**
 * How far this sheet is allowed to sway, in radians: the distance from its
 * resting lean to the near edge of the tilt band, capped at SWAY_DEG.
 *
 * `rest` is in radians. Returns 0 when the band is 0, so setting TILT_DEG to 0
 * for a perfect grid keeps the grid perfect rather than gently ruining it.
 */
export function swayRoom(rest: number): number {
  return Math.max(0, Math.min(SWAY_DEG * DEG, TILT_DEG * DEG - Math.abs(rest)))
}

/**
 * The offset to add to a sheet's resting lean at time `t`, in radians. Never
 * larger than `room`.
 */
export function swayOffset(id: number, t: number, room: number): number {
  if (room <= 0) return 0
  // One rate per slide, applied to both octaves, so no two sheets share a
  // period and the set never settles into a rhythm.
  const rate = SWAY_PERIOD_SPREAD[0] + (SWAY_PERIOD_SPREAD[1] - SWAY_PERIOD_SPREAD[0]) * hash01(id, S_RATE, 0)
  const slow = octave(id, S_SLOW, t / (SWAY_PERIOD_S * rate))
  const ripple = octave(id, S_RIPPLE, t / (SWAY_RIPPLE_S * rate))
  return room * (slow * (1 - SWAY_RIPPLE_W) + ripple * SWAY_RIPPLE_W)
}
