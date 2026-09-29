import { describe, expect, it } from 'vitest'
import { CAST_C_MAX, TUBE_COOL, TUBE_COUNT, TUBE_GAIN, TUBE_WARM } from './constants'
import { lampsAt } from './lamps'
import { oklchToLinear } from './oklab'

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

describe('the cast', () => {
  const field = (C: number, h: number): [number, number, number] => oklchToLinear(0.9, C, h)
  const HUES = [15, 75, 135, 195, 255, 315]
  /** What a real eight-sheet roll actually produces, area-weighted. */
  const REAL_C = 0.009

  it('is the lamps exactly as they were until something asks for it', () => {
    for (let t = 0; t < 300; t += 7) {
      const plain = lampsAt(t, 0)
      expect(lampsAt(t, 0, undefined)).toEqual(plain)
      expect(lampsAt(t, 0, { linear: field(0.04, 40), strength: 0 })).toEqual(plain)
      // A colourless field is a white gel, which is no gel.
      expect(lampsAt(t, 0, { linear: [1, 1, 1], strength: 1 })).toEqual(plain)
    }
  })

  it('reads, which is the whole reason it is built as a gel', () => {
    // The obvious construction, nudging the tube's own colour and
    // renormalising, is a no-op: a tube sits at L 0.986 where sRGB holds
    // 0.007 of chroma, so every cap produces the same three bytes. Measured
    // against the entire warm-to-cool control, which is what it has to beat
    // to be worth having at all.
    let plainSpread = 0
    for (const w of [-1, 0, 1]) {
      for (const l of lampsAt(12.5, w)) {
        plainSpread = Math.max(plainSpread, Math.max(l.r, l.g, l.b) - Math.min(l.r, l.g, l.b))
      }
    }
    let castSpread = Infinity
    for (const h of HUES) {
      for (const l of lampsAt(12.5, 0, { linear: field(REAL_C, h), strength: 1 })) {
        castSpread = Math.min(castSpread, Math.max(l.r, l.g, l.b) - Math.min(l.r, l.g, l.b))
      }
    }
    // The weakest hue of the cast still beats the strongest thing the warmth
    // control can do, at the chroma a real field actually carries.
    expect(castSpread).toBeGreaterThan(plainSpread)
  })

  it('keeps every tube at full brightness and keeps the four disagreeing', () => {
    let agreed = 0
    let samples = 0
    for (let t = 0; t < 600; t += 1.7) {
      for (const h of HUES) {
        const lamps = lampsAt(t, 0, { linear: field(0.012, h), strength: 1 })
        for (const l of lamps) {
          expect(Math.max(l.r, l.g, l.b)).toBe(255)
          // Brightness is TUBE_GAIN's job. A gel is colour, never wattage.
          expect(Math.abs(l.gain - 1)).toBeLessThanOrEqual(TUBE_GAIN + 1e-9)
        }
        const bs = lamps.map(balance)
        if (Math.max(...bs) - Math.min(...bs) < 3) agreed++
        samples++
      }
    }
    // One gel over four different tubes is not the same as replacing their
    // colour: they keep their own drift underneath it.
    expect(agreed / samples).toBeLessThan(0.15)
  })

  it('takes the hue of the field and ignores how dark the field is', () => {
    // A gel's colour is not its brightness. A deep red field and a pale red
    // one put the same light through a tube; only the tube says how bright.
    for (const h of HUES) {
      const pale = lampsAt(40, 0, { linear: oklchToLinear(0.95, 0.03, h), strength: 1 })
      const deep = lampsAt(40, 0, { linear: oklchToLinear(0.55, 0.03, h), strength: 1 })
      for (let i = 0; i < TUBE_COUNT; i++) {
        const a = pale[i] as { r: number; g: number; b: number }
        const b = deep[i] as { r: number; g: number; b: number }
        expect(Math.abs(balance(a) - balance(b))).toBeLessThanOrEqual(6)
      }
    }
  })

  it('goes on gradually, so a strength ramp is a ramp', () => {
    // Read across all four tubes and all hues at once. A single tube is not
    // monotone and should not be: a tube already leaning the gel's way has
    // less distance to travel than one leaning against it, and the gel partly
    // cancels its own base colour. What has to rise is how coloured the room
    // is, which is the mean, and the steps have to be steps rather than a
    // switch, which is the second assertion.
    const mean = (s: number): number => {
      let sum = 0
      let n = 0
      for (const h of HUES) {
        for (const l of lampsAt(31, 0, { linear: field(0.03, h), strength: s })) {
          sum += Math.max(l.r, l.g, l.b) - Math.min(l.r, l.g, l.b)
          n++
        }
      }
      return sum / n
    }
    const steps = [0, 0.25, 0.5, 0.75, 1].map(mean)
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i] as number).toBeGreaterThan(steps[i - 1] as number)
    }
    expect((steps[4] as number) - (steps[0] as number)).toBeGreaterThan(20)
  })

  it('refuses to become a nightclub however loud the field gets', () => {
    // CAST_C_MAX is the rail. A deliberately monochrome roll must not be able
    // to drive the tubes past it, so an absurd field lands where the cap is.
    for (const h of HUES) {
      const capped = lampsAt(55, 0, { linear: oklchToLinear(0.9, 0.3, h), strength: 1 })
      const atCap = lampsAt(55, 0, { linear: oklchToLinear(0.9, CAST_C_MAX, h), strength: 1 })
      for (let i = 0; i < TUBE_COUNT; i++) {
        const a = capped[i] as { r: number; g: number; b: number }
        const b = atCap[i] as { r: number; g: number; b: number }
        expect(Math.abs(a.r - b.r)).toBeLessThanOrEqual(1)
        expect(Math.abs(a.g - b.g)).toBeLessThanOrEqual(1)
        expect(Math.abs(a.b - b.b)).toBeLessThanOrEqual(1)
      }
    }
  })
})
