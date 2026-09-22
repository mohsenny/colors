/**
 * The tubes behind the diffuser.
 *
 * A lightbox is not a white rectangle. It is a row of fluorescent tubes seen
 * through frosted acrylic, and what tells you so is that the light is not even:
 * there are faint vertical cores, the gaps between them are a shade deeper, and
 * no two tubes are quite the same colour, because tubes age at their own rate.
 *
 * So each one carries its own colour temperature and drifts, slowly: two
 * periods per tube that are not harmonics of each other, so the four never line
 * up the same way twice and one is always warming while another cools. The
 * slowest thing on screen by an order of magnitude. The slides change colour in
 * seconds; the room changes over a minute and a half, and should only ever be
 * noticed in retrospect.
 *
 * Pure function of simulation time, like the slide drift, for the same reason:
 * the timeline restores `t` and the lamps come back with it.
 */

import {
  TUBE_COOL,
  TUBE_COUNT,
  TUBE_FAST_S,
  TUBE_GAIN,
  TUBE_SLOW_S,
  TUBE_WARM,
  TUBE_WARMTH_BIAS,
} from './constants'
import { hash01 } from './rng'

export interface Lamp {
  /** sRGB bytes of the tube's own light, warm to cool. */
  r: number
  g: number
  b: number
  /** Brightness relative to nominal, within a few percent of 1. */
  gain: number
}

const TAU = Math.PI * 2

/**
 * All four tubes at time `t`. Allocates a small array per call: the renderer
 * calls this at most a few times a second, because nothing here moves fast
 * enough to be worth a style write on every frame.
 *
 * `warmth` runs -1 (warm) to +1 (cool) and shifts the centre of the drift
 * without stopping it. The swing is squeezed by however much the shift used up,
 * so a tube pushed all the way warm still moves, just over a shorter arc, and
 * never clips flat against the end of the range.
 */
export function lampsAt(t: number, warmth = 0): Lamp[] {
  const bias = clampUnit(warmth) * TUBE_WARMTH_BIAS
  const centre = 0.5 + 0.5 * bias
  const swing = 0.5 * (1 - Math.abs(bias))

  const out: Lamp[] = []
  for (let i = 0; i < TUBE_COUNT; i++) {
    // Rates differ per tube, so the phase relationship between any two of them
    // keeps sliding. Equal rates would just be four copies of one lamp.
    const slow = TUBE_SLOW_S * (0.78 + 0.5 * hash01(i, 0x41d7, 0))
    const fast = TUBE_FAST_S * (0.8 + 0.45 * hash01(i, 0x77b1, 0))
    const p1 = hash01(i, 0x2c9e, 0)
    const p2 = hash01(i, 0x5f33, 0)

    const wave = 0.68 * Math.sin(TAU * (t / slow + p1)) + 0.32 * Math.sin(TAU * (t / fast + p2))
    const temp = centre + swing * clampUnit(wave)

    // Renormalised to full brightness: see TUBE_WARM. The interpolation decides
    // the tube's colour, never how bright it is, which is what `gain` is for.
    const r = lerp(TUBE_WARM[0], TUBE_COOL[0], temp)
    const g = lerp(TUBE_WARM[1], TUBE_COOL[1], temp)
    const b = lerp(TUBE_WARM[2], TUBE_COOL[2], temp)
    const k = 255 / Math.max(r, g, b)

    out.push({
      r: Math.round(r * k),
      g: Math.round(g * k),
      b: Math.round(b * k),
      // Brightness rides on the other wave, so a tube going cool is not also
      // reliably going bright: that correlation is what would read as a pulse.
      gain: 1 + TUBE_GAIN * Math.sin(TAU * (t / (fast * 1.37) + p2 + 0.31)),
    })
  }
  return out
}

function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
