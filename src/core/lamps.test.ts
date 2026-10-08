import { describe, expect, it } from 'vitest'
import { TUBE_COOL, TUBE_COUNT, TUBE_GAIN, TUBE_WARM } from './constants'
import { lampsAt } from './lamps'

/** Warm-cool balance: red less blue, positive for a warm lamp. */
const balance = (l: { r: number; b: number }): number => l.r - l.b

describe('the tubes', () => {
  it('are white, all three, whenever nobody has asked for a temperature', () => {
    for (let t = 0; t < 900; t += 2.5) {
      const lamps = lampsAt(t)
      expect(lamps).toHaveLength(TUBE_COUNT)
      for (const l of lamps) expect([l.r, l.g, l.b]).toEqual([255, 255, 255])
    }
  })

  it('breathe in brightness, each on its own, never by more than TUBE_GAIN', () => {
    let apart = 0
    for (let t = 0; t < 900; t += 1) {
      const gains = lampsAt(t).map((l) => l.gain)
      for (const g of gains) expect(Math.abs(g - 1)).toBeLessThanOrEqual(TUBE_GAIN + 1e-9)
      if (Math.max(...gains) - Math.min(...gains) > 0.02) apart++
    }
    // Three tubes breathing in step would just be one lamp drawn three times.
    expect(apart / 900).toBeGreaterThan(0.6)
  })
})

describe('the temperature option', () => {
  it('turns all three tubes together, warm one way and cool the other', () => {
    const warm = lampsAt(10, -1)
    const cool = lampsAt(10, 1)
    for (let i = 0; i < TUBE_COUNT; i++) {
      expect(warm[i]).toMatchObject({ r: TUBE_WARM[0], g: TUBE_WARM[1], b: TUBE_WARM[2] })
      expect(cool[i]).toMatchObject({ r: TUBE_COOL[0], g: TUBE_COOL[1], b: TUBE_COOL[2] })
    }
    expect(balance(warm[0] as { r: number; b: number })).toBeGreaterThan(0)
    expect(balance(cool[0] as { r: number; b: number })).toBeLessThan(0)
  })

  it('keeps every lamp at full brightness and inside the warm-to-cool band', () => {
    const lo = Math.min(balance({ r: TUBE_WARM[0], b: TUBE_WARM[2] }), balance({ r: TUBE_COOL[0], b: TUBE_COOL[2] }))
    const hi = Math.max(balance({ r: TUBE_WARM[0], b: TUBE_WARM[2] }), balance({ r: TUBE_COOL[0], b: TUBE_COOL[2] }))
    for (const warmth of [-4, -1, -0.5, 0, 0.5, 1, 4]) {
      for (const l of lampsAt(33, warmth)) {
        expect(Math.max(l.r, l.g, l.b)).toBe(255)
        expect(balance(l)).toBeGreaterThanOrEqual(lo)
        expect(balance(l)).toBeLessThanOrEqual(hi)
      }
    }
  })

  it('leaves the brightness alone', () => {
    for (let t = 0; t < 300; t += 7) {
      const plain = lampsAt(t).map((l) => l.gain)
      expect(lampsAt(t, -1).map((l) => l.gain)).toEqual(plain)
      expect(lampsAt(t, 1).map((l) => l.gain)).toEqual(plain)
    }
  })
})
