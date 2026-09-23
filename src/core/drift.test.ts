import { describe, expect, it } from 'vitest'
import {
  DENSITY_MAX,
  DENSITY_MIN,
  DRIFT_CHROMA,
  DRIFT_HUE_DEG,
  DRIFT_L,
  SLIDE_COUNT,
} from './constants'
import { driftDye, driftPhase } from './drift'
import type { Dye } from './types'

const BASE: Dye = { L: 0.68, C: 0.17, h: 212, d: 0.86 }

function hueGap(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

describe('autonomous colour drift', () => {
  it('is a pure function of time, which is what makes it scrubbable', () => {
    const a = driftDye(BASE, 3, 41.5, 1)
    const b = driftDye(BASE, 3, 41.5, 1)
    expect(a).toEqual(b)
    // And running the clock forward and back gets the same colour again, with
    // no accumulator anywhere to have moved on in the meantime.
    for (let t = 0; t < 30; t += 1 / 60) driftDye(BASE, 3, t, 1)
    expect(driftDye(BASE, 3, 41.5, 1)).toEqual(a)
  })

  it('holds the base exactly when the gate is shut, which is what pinning does', () => {
    for (let t = 0; t < 200; t += 3.3) {
      expect(driftDye(BASE, 2, t, 0)).toEqual(BASE)
    }
  })

  it('stays inside its excursion for ten minutes', () => {
    for (let id = 0; id < SLIDE_COUNT; id++) {
      for (let t = 0; t < 600; t += 1 / 15) {
        const d = driftDye(BASE, id, t, 1)
        expect(hueGap(d.h, BASE.h)).toBeLessThanOrEqual(DRIFT_HUE_DEG + 1e-9)
        expect(Math.abs(d.L - BASE.L)).toBeLessThanOrEqual(DRIFT_L + 1e-9)
        expect(Math.abs(d.C / BASE.C - 1)).toBeLessThanOrEqual(DRIFT_CHROMA + 1e-9)
        expect(d.d).toBeGreaterThanOrEqual(DENSITY_MIN - 1e-9)
        expect(d.d).toBeLessThanOrEqual(DENSITY_MAX + 1e-9)
      }
    }
  })

  it('never steps, which is the difference between drifting and flashing', () => {
    let worst = 0
    for (let id = 0; id < SLIDE_COUNT; id++) {
      let prev = driftDye(BASE, id, 0, 1)
      for (let t = 1 / 60; t < 300; t += 1 / 60) {
        const now = driftDye(BASE, id, t, 1)
        worst = Math.max(worst, hueGap(now.h, prev.h))
        prev = now
      }
    }
    // A full excursion is 2 x DRIFT_HUE_DEG over a ~3 second dissolve, and a
    // smoothstep peaks at 1.5x the average rate, so the ceiling is around half
    // a degree per frame. The assertion is a tripwire for a discontinuity, not
    // a tuning target: a re-salt or a wrapped angle would blow straight past it.
    expect(worst).toBeLessThan(0.6)
  })

  it('spends most of its time holding still', () => {
    let still = 0
    let total = 0
    for (let id = 0; id < SLIDE_COUNT; id++) {
      for (let t = 0; t < 600; t += 1 / 10) {
        if (driftPhase(id, t).mix === 0) still++
        total++
      }
    }
    // Eight seconds still to two seconds moving, give or take each slide's own
    // spread. The hold is the state you read a palette off; the dissolve is
    // only how it gets from one to the next, and it should not be most of what
    // you are looking at. The upper bound is the other failure: a set that
    // holds 95% of the time is a static palette that occasionally glitches.
    const share = still / total
    expect(share).toBeGreaterThan(0.7)
    expect(share).toBeLessThan(0.9)
  })

  it('does not change the whole set at once', () => {
    let allMoving = 0
    let movingShare = 0
    let samples = 0
    for (let t = 0; t < 600; t += 1 / 4) {
      let moving = 0
      for (let id = 0; id < SLIDE_COUNT; id++) {
        const { mix } = driftPhase(id, t)
        if (mix > 0 && mix < 1) moving++
      }
      if (moving === SLIDE_COUNT) allMoving++
      movingShare += moving / SLIDE_COUNT
      samples++
    }
    // Overlap is wanted: the cadences are independent, so of course two slides
    // sometimes move together. What must not happen is the set turning over as
    // one block, which is what would read as a global colour change.
    expect(allMoving / samples).toBeLessThan(0.02)
    expect(movingShare / samples).toBeLessThan(0.5)
  })

  it('never couples two slides together', () => {
    /*
     * The property is that no PAIR turns over in lockstep, and the honest way
     * to ask is to measure it: how much of a quarter of an hour do these two
     * spend dissolving at the same time, against how much they would by
     * chance if they had nothing to do with each other.
     *
     * This used to compare step indices at t=6000 and demand all eight differ,
     * which is a proxy and a brittle one. Two slides can have periods a
     * hundredth of a second apart and still never move together, because the
     * phase offset is drawn separately; that is exactly what the closest pair
     * here does. The old test called that a failure and would have had the
     * cadence retuned to satisfy an assertion about nothing.
     */
    const moving: boolean[][] = []
    for (let id = 0; id < SLIDE_COUNT; id++) {
      const row: boolean[] = []
      for (let t = 0; t < 900; t += 0.05) row.push(driftPhase(id, t).mix > 0)
      moving.push(row)
    }

    let worst = 0
    for (let i = 0; i < SLIDE_COUNT; i++) {
      for (let j = i + 1; j < SLIDE_COUNT; j++) {
        const a = moving[i] as boolean[]
        const b = moving[j] as boolean[]
        let both = 0
        for (let n = 0; n < a.length; n++) if (a[n] && b[n]) both++
        worst = Math.max(worst, both / a.length)
      }
    }
    // Two slides locked together would sit near their own moving share, which
    // is 13% to 25%. Independent pairs land near the product of the two, which
    // is 2% to 6%. Anything past 12% is coupling.
    expect(worst).toBeLessThan(0.12)
  })
})
