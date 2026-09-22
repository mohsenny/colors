/**
 * Autonomous colour drift.
 *
 * Each slide holds a colour for a few seconds, dissolves over a few more, holds
 * the next one, and so on, forever, on its own clock. No two slides share a
 * cadence, so the set is never all changing at once and never all still.
 *
 * Three properties matter more than the numbers:
 *
 *   1. It is a WANDER, not a re-roll. The palette generator's whole job is the
 *      relationship between the seven colours; a slide that invented a new one
 *      every eight seconds would throw that away. Each slide orbits the colour
 *      it was given, and the excursion is bounded. What moves a long way is the
 *      overlaps, because two wandering hues compound and the crossing travels
 *      much further than either sheet.
 *   2. It is a PURE FUNCTION of simulation time. No accumulator, no stored
 *      phase, nothing to restore: `driftDye(base, id, t)` is the whole model.
 *      That is what makes it scrubbable for free, and it is why the waypoints
 *      are hashes rather than draws from the slide's PRNG, which is reserved
 *      for wall contacts.
 *   3. It is CONTINUOUS ACROSS A REGENERATE. The waypoints are keyed on the
 *      slide and the step index only, never on the palette epoch: re-salting
 *      them on a roll would snap every offset at the instant the crossfade
 *      starts, which is exactly when a snap is most visible.
 */

import {
  DRIFT_AMP,
  DRIFT_CHROMA,
  DRIFT_DENSITY,
  DRIFT_HOLD_S,
  DRIFT_HOLD_SPREAD,
  DRIFT_HUE_DEG,
  DRIFT_L,
  DRIFT_TRANS_S,
  DRIFT_TRANS_SPREAD,
  DENSITY_MAX,
  DENSITY_MIN,
} from './constants'
import { clamp, smoothstep } from './noise'
import { hash01 } from './rng'
import type { Dye } from './types'

/** Salts, so the four hashes of one slide are independent. */
const S_PHASE = 0x51ed
const S_HOLD = 0x2f19
const S_TRANS = 0x7b3d
const S_AMP = 0x1c4b
const S_HUE = 0x3ae7
const S_CHROMA = 0x6d05
const S_LIGHT = 0x9f71
const S_DENSITY = 0xc2a3

/** A slide's cadence and reach. Constant for the life of the slide. */
interface Cadence {
  hold: number
  trans: number
  amp: number
  phase: number
}

function cadenceOf(id: number): Cadence {
  const hold = DRIFT_HOLD_S * lerp(DRIFT_HOLD_SPREAD[0], DRIFT_HOLD_SPREAD[1], hash01(id, S_HOLD, 0))
  const trans = DRIFT_TRANS_S * lerp(DRIFT_TRANS_SPREAD[0], DRIFT_TRANS_SPREAD[1], hash01(id, S_TRANS, 0))
  return {
    hold,
    trans,
    amp: lerp(DRIFT_AMP[0], DRIFT_AMP[1], hash01(id, S_AMP, 0)),
    phase: hash01(id, S_PHASE, 0),
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** The offset this slide is heading for at step `k`, as ±1 in each dimension. */
function waypoint(id: number, k: number): [number, number, number, number] {
  return [
    hash01(id, S_HUE, k) * 2 - 1,
    hash01(id, S_CHROMA, k) * 2 - 1,
    hash01(id, S_LIGHT, k) * 2 - 1,
    hash01(id, S_DENSITY, k) * 2 - 1,
  ]
}

/**
 * Where slide `id` sits between its waypoints at time `t`: the step index and
 * how far into the dissolve toward the next one. Exported for the tests, which
 * need to assert the hold-then-dissolve shape without reading colours.
 */
export function driftPhase(id: number, t: number): { k: number; mix: number } {
  const c = cadenceOf(id)
  const cycle = c.hold + c.trans
  const u = t + c.phase * cycle
  const k = Math.floor(u / cycle)
  const f = u - k * cycle
  return { k, mix: f <= c.hold ? 0 : smoothstep(0, 1, (f - c.hold) / c.trans) }
}

/**
 * The colour to paint, given the colour the palette assigned.
 *
 * `gate` scales the whole excursion: 1 is free, 0 is pinned to the base exactly.
 * Locking a slide takes it to 0 at once (having first made the base the colour
 * on screen, so nothing moves), and unlocking eases it back, so a pinned hex
 * never changes under the pin and an unpinned one never snaps.
 *
 * `room` scales the HUE excursion only, and is how the caller says how close
 * this slide's neighbours are. See `hueRoom` in the simulation: without it the
 * drift quietly undoes the separation the palette generator was built to
 * produce, and two slides that started 40 degrees apart meet in the middle.
 */
export function driftDye(base: Dye, id: number, t: number, gate: number, room = 1): Dye {
  if (gate <= 0) return { L: base.L, C: base.C, h: base.h, d: base.d }

  const c = cadenceOf(id)
  const { k, mix } = driftPhase(id, t)
  const a = waypoint(id, k)
  const b = waypoint(id, k + 1)
  const reach = c.amp * clamp(gate, 0, 1)

  const dh = lerp(a[0], b[0], mix) * DRIFT_HUE_DEG * reach * clamp(room, 0, 1)
  const dc = lerp(a[1], b[1], mix) * DRIFT_CHROMA * reach
  const dl = lerp(a[2], b[2], mix) * DRIFT_L * reach
  const dd = lerp(a[3], b[3], mix) * DRIFT_DENSITY * reach

  return {
    L: clamp(base.L + dl, 0.3, 0.96),
    // Relative, because a 0.04 step is nothing on a saturated dye and the whole
    // colour on a near-neutral one.
    C: Math.max(0, base.C * (1 + dc)),
    h: ((base.h + dh) % 360 + 360) % 360,
    d: clamp(base.d + dd, DENSITY_MIN, DENSITY_MAX),
  }
}
