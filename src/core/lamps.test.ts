import { describe, expect, it } from 'vitest'
import { TUBE_COOL, TUBE_COUNT, TUBE_GAIN, TUBE_WARM } from './constants'
import { lampsAt } from './lamps'

/**
 * Warm-cool balance, the one number that says what a lamp's colour IS.
 *
 * Reading a single channel does not, and that is why these tests had to be
 * rewritten: `lampsAt` renormalises every lamp to full brightness, so the blue
 * channel moves both because the temperature changed and because the scale
 * factor did. `r - b` is monotone in temperature and the scaling barely touches
 * it, which makes it the honest way to ask "is this tube going warmer".
 */
const balance = (l: { r: number; b: number }): number => l.r - l.b

const WARM_BALANCE = TUBE_WARM[0] - TUBE_WARM[2]
const COOL_BALANCE = TUBE_COOL[0] - TUBE_COOL[2]

describe('the tubes', () => {
  it('runs every lamp at full brightness and within the warm-to-cool band', () => {
    for (let t = 0; t < 900; t += 2.5) {
      const lamps = lampsAt(t)
      expect(lamps).toHaveLength(TUBE_COUNT)
      for (const l of lamps) {
        // A lamp is never dimmer than the surface it lights, because a lamp
        // that dims is a lamp that has gone out. Interpolating two tints
        // straight passes through a dull grey at the midpoint, which is where
        // the tubes spend most of their time, so the renormalisation is the
        // whole point rather than a rounding detail. See TUBE_WARM.
        expect(Math.max(l.r, l.g, l.b)).toBe(255)
        // Colour still comes from between the two endpoints. The scaling lifts
        // every channel by the same factor, so a channel can end up above its
        // own endpoint, but the BALANCE cannot leave the band.
        expect(balance(l)).toBeGreaterThanOrEqual(Math.min(WARM_BALANCE, COOL_BALANCE) - 2)
        expect(balance(l)).toBeLessThanOrEqual(Math.max(WARM_BALANCE, COOL_BALANCE) + 2)
        // Brightness is TUBE_GAIN's job and nothing else's.
        expect(Math.abs(l.gain - 1)).toBeLessThanOrEqual(TUBE_GAIN + 1e-9)
      }
    }
  })

  it('drifts an order of magnitude slower than anything else on screen', () => {
    let worst = 0
    for (let t = 0; t < 900; t += 1) {
      const a = lampsAt(t)
      const b = lampsAt(t + 1)
      for (let i = 0; i < TUBE_COUNT; i++) {
        const l = a[i]
        const m = b[i]
        if (!l || !m) continue
        worst = Math.max(worst, Math.abs(balance(l) - balance(m)))
      }
    }
    // Under four code values of balance a second, against a band 53 wide: a
    // full warm-to-cool sweep takes the better part of a minute. The slide
    // colours move further than that in a single frame. This is meant to be
    // noticed in retrospect, never watched.
    expect(worst).toBeLessThan(4)
  })

  it('has one tube warming while another cools', () => {
    let opposed = 0
    const steps = 180
    for (let i = 0; i < steps; i++) {
      const t = i * 5
      const a = lampsAt(t)
      const b = lampsAt(t + 5)
      const deltas = a.map((l, j) => balance(b[j] as { r: number; b: number }) - balance(l))
      if (Math.max(...deltas) > 0 && Math.min(...deltas) < 0) opposed++
    }
    // Four tubes sweeping in step would just be one lamp drawn four times.
    expect(opposed / steps).toBeGreaterThan(0.6)
  })

  it('never has all four agreeing on a colour for long', () => {
    let agreed = 0
    for (let t = 0; t < 900; t += 1) {
      const lamps = lampsAt(t)
      const bs = lamps.map(balance)
      if (Math.max(...bs) - Math.min(...bs) < 3) agreed++
    }
    expect(agreed / 900).toBeLessThan(0.15)
  })
})

describe('the warmth control', () => {
  const meanBalance = (warmth: number): number => {
    let sum = 0
    let n = 0
    for (let t = 0; t < 900; t += 1) {
      for (const l of lampsAt(t, warmth)) {
        sum += balance(l)
        n++
      }
    }
    return sum / n
  }

  it('moves where the tubes sit without pinning them there', () => {
    const warm = meanBalance(-1)
    const neutral = meanBalance(0)
    const cool = meanBalance(1)
    // Warm is more red than blue, cool the other way round, so balance falls
    // as the control goes cool. Fifteen code values apart is visible on a
    // full-viewport wash; much less and the control would not be worth having.
    expect(warm).toBeGreaterThan(neutral + 7)
    expect(neutral).toBeGreaterThan(cool + 7)
  })

  it('keeps every lamp drifting at either end of the control', () => {
    for (const warmth of [-1, -0.5, 0, 0.5, 1]) {
      for (let i = 0; i < TUBE_COUNT; i++) {
        let lo = Infinity
        let hi = -Infinity
        for (let t = 0; t < 900; t += 1) {
          const l = lampsAt(t, warmth)[i]
          if (!l) continue
          lo = Math.min(lo, balance(l))
          hi = Math.max(hi, balance(l))
        }
        // The swing narrows as the bias grows, which is the point: it shifts
        // the centre and gives up range rather than clipping flat against the
        // end. A tube that stops moving is a tube that has stopped being a
        // fluorescent lamp and become a background colour.
        expect(hi - lo).toBeGreaterThan(12)
      }
    }
  })

  it('stays inside the warm-to-cool band whatever it is asked for', () => {
    for (const warmth of [-4, -1, 0, 1, 4]) {
      for (let t = 0; t < 400; t += 3) {
        for (const l of lampsAt(t, warmth)) {
          expect(Math.max(l.r, l.g, l.b)).toBe(255)
          expect(balance(l)).toBeGreaterThanOrEqual(Math.min(WARM_BALANCE, COOL_BALANCE) - 2)
          expect(balance(l)).toBeLessThanOrEqual(Math.max(WARM_BALANCE, COOL_BALANCE) + 2)
        }
      }
    }
  })

  it('is the same lamps as before when nobody has touched it', () => {
    for (let t = 0; t < 300; t += 7) {
      expect(lampsAt(t, 0)).toEqual(lampsAt(t))
    }
  })
})
