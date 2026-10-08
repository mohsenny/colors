/**
 * The tubes behind the diffuser.
 *
 * White, all three, unless the temperature option says warm or cool, and then
 * all three move together: a lightbox is for judging colour, and a tinted lamp
 * is one more colour on the table. Each also breathes a few percent on its own
 * slow wave. Only the CSS surface shows that: the glass draws them steady.
 *
 * Pure function of simulation time, like the slide drift, for the same reason:
 * the timeline restores `t` and the lamps come back with it.
 */

import { TUBE_COOL, TUBE_COUNT, TUBE_GAIN, TUBE_PERIOD_S, TUBE_WARM } from './constants'
import { hash01 } from './rng'

export interface Lamp {
  /** sRGB bytes of the tube's own light, peaking at 255. */
  r: number
  g: number
  b: number
  /** Brightness relative to nominal, within a few percent of 1. */
  gain: number
}

const TAU = Math.PI * 2

/**
 * All three tubes at time `t`. `warmth` runs -1 (warm) to +1 (cool) and moves
 * the colour from white toward TUBE_WARM or TUBE_COOL.
 */
export function lampsAt(t: number, warmth = 0): Lamp[] {
  const w = warmth < -1 ? -1 : warmth > 1 ? 1 : warmth
  const end = w < 0 ? TUBE_WARM : TUBE_COOL
  const k = Math.abs(w)
  const r = 255 + (end[0] - 255) * k
  const g = 255 + (end[1] - 255) * k
  const b = 255 + (end[2] - 255) * k
  // Renormalised to full brightness: colour is decided here, brightness by `gain`.
  const n = 255 / Math.max(r, g, b)

  const out: Lamp[] = []
  for (let i = 0; i < TUBE_COUNT; i++) {
    // Each tube on its own period and phase, so the three never line up.
    const period = TUBE_PERIOD_S * (0.8 + (0.45 * (i + hash01(i, 0x77b1, 0))) / TUBE_COUNT)
    const phase = hash01(i, 0x5f33, 0)
    out.push({
      r: Math.round(r * n),
      g: Math.round(g * n),
      b: Math.round(b * n),
      gain: 1 + TUBE_GAIN * Math.sin(TAU * (t / period + phase)),
    })
  }
  return out
}
