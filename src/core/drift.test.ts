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
    const share = still / total
    expect(share).toBeGreaterThan(0.45)
    expect(share).toBeLessThan(0.75)
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

  it('gives each slide its own cadence', () => {
    const cycles = new Set<number>()
    for (let id = 0; id < SLIDE_COUNT; id++) {
      // The step index after a hundred minutes is the cycle length, read at a
      // horizon long enough that two slides differing by a fraction of a second
      // per cycle have visibly separated. Ten minutes was not: two slides an
      // eyeblink apart landed on the same step and the set looked shared.
      cycles.add(driftPhase(id, 6000).k)
    }
    expect(cycles.size).toBe(SLIDE_COUNT)
  })
})
