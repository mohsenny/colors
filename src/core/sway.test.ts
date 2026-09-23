import { describe, expect, it } from 'vitest'
import { SLIDE_COUNT, SWAY_DEG, TILT_DEG } from './constants'
import { DEG } from './noise'
import { swayOffset, swayRoom } from './sway'

/** The leans a set of sheets might actually be cut with, edges included. */
const RESTS = [0, 1, -2.4, 3.9, 4.6, -4.99, TILT_DEG, -TILT_DEG]

describe('autonomous tilt', () => {
  it('is a pure function of time, which is what makes it scrubbable', () => {
    const room = swayRoom(0)
    const a = swayOffset(3, 88.25, room)
    expect(swayOffset(3, 88.25, room)).toBe(a)
    for (let t = 0; t < 200; t += 1 / 60) swayOffset(3, t, room)
    expect(swayOffset(3, 88.25, room)).toBe(a)
  })

  it('never leaves the tilt band, from any resting lean', () => {
    for (const restDeg of RESTS) {
      const rest = restDeg * DEG
      const room = swayRoom(rest)
      for (let id = 0; id < SLIDE_COUNT; id++) {
        for (let t = 0; t < 4000; t += 0.5) {
          const angle = (rest + swayOffset(id, t, room)) / DEG
          expect(Math.abs(angle)).toBeLessThanOrEqual(TILT_DEG + 1e-9)
        }
      }
    }
  })

  it('gives a sheet cut at the edge of the band nowhere to go', () => {
    // Not a curiosity: it is the whole reason the excursion is scaled by the
    // room left rather than clamped. A clamp would park the sheet against the
    // limit for half a minute at a time, and a sheet that stops is the one
    // thing about this that would be visible.
    expect(swayRoom(TILT_DEG * DEG)).toBe(0)
    for (let t = 0; t < 600; t += 3) expect(swayOffset(1, t, 0)).toBe(0)
  })

  it('leaves the lean fixed when the sway is switched off', () => {
    // SWAY_DEG is the documented off switch, so it has to actually be off.
    if (SWAY_DEG > 0) return
    for (let t = 0; t < 600; t += 3) expect(swayOffset(1, t, swayRoom(0))).toBe(0)
  })

  it('is too slow to read as motion', () => {
    let worst = 0
    const room = swayRoom(0)
    for (let id = 0; id < SLIDE_COUNT; id++) {
      let prev = swayOffset(id, 0, room)
      for (let t = 1 / 60; t < 3000; t += 1 / 60) {
        const now = swayOffset(id, t, room)
        worst = Math.max(worst, Math.abs(now - prev) * 60)
        prev = now
      }
    }
    // Degrees per second, at the fastest moment any sheet has in fifty minutes.
    // A tenth of a degree a second on a 400px sheet moves its corner about
    // half a pixel a second, which is the top of what still reads as still.
    // The floor is the other failure, and it is the one this actually caught:
    // at the first tuning nothing moved a third of a degree in a hundred
    // seconds, which is indistinguishable from a fixed lean.
    const peak = worst / DEG
    expect(peak).toBeLessThan(0.14)
    expect(peak).toBeGreaterThan(0.02)
  })

  it('covers a useful part of the room it is given, and both signs of it', () => {
    const room = swayRoom(0)
    for (let id = 0; id < SLIDE_COUNT; id++) {
      let lo = Infinity
      let hi = -Infinity
      for (let t = 0; t < 3000; t += 0.25) {
        const v = swayOffset(id, t, room)
        lo = Math.min(lo, v)
        hi = Math.max(hi, v)
      }
      // It must lean both ways, and it must use most of the band over time. A
      // wander stuck on one side of its rest would read as a sheet that was
      // simply cut at a different angle.
      expect(lo).toBeLessThan(-0.35 * room)
      expect(hi).toBeGreaterThan(0.35 * room)
    }
  })

  it('does not tilt the whole set the same way at once', () => {
    // The failure this guards is one hand tipping the table. Averaged across
    // the set the offsets should mostly cancel; a shared phase would show up
    // as a mean that swings as far as the individuals do.
    const room = swayRoom(0)
    let worstMean = 0
    for (let t = 0; t < 3000; t += 0.5) {
      let sum = 0
      for (let id = 0; id < SLIDE_COUNT; id++) sum += swayOffset(id, t, room)
      worstMean = Math.max(worstMean, Math.abs(sum / SLIDE_COUNT))
    }
    expect(worstMean).toBeLessThan(0.55 * room)
  })
})
