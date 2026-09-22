import { describe, expect, it } from 'vitest'
import { SIZE_FRAC_MAX, SIZE_FRAC_MIN, SIZE_PX_MAX, SIZE_PX_MIN } from './constants'
import { clampSide, fitSides, sideBand } from './size'

describe('sideBand', () => {
  it('gives a laptop the absolute floor', () => {
    const b = sideBand(813)
    expect(b.min).toBe(SIZE_PX_MIN)
    expect(b.max).toBe(Math.min(SIZE_PX_MAX, 813 * SIZE_FRAC_MAX))
  })

  it('lets a phone out of the absolute floor', () => {
    // A flat 160px on a 360px stage would be nearly half of it, so below a
    // certain viewport the relative rule has to win or eight slides cannot fit.
    const b = sideBand(360)
    expect(b.min).toBeLessThan(SIZE_PX_MIN)
    expect(b.min / 360).toBeCloseTo(0.3, 6)
  })

  it('raises the floor again on a very large monitor', () => {
    const b = sideBand(2000)
    expect(b.min).toBe(2000 * SIZE_FRAC_MIN)
    expect(b.min).toBeGreaterThan(SIZE_PX_MIN)
  })

  it('never inverts', () => {
    for (let short = 200; short <= 3000; short += 37) {
      const b = sideBand(short)
      expect(b.max).toBeGreaterThanOrEqual(b.min)
    }
  })
})

describe('clampSide', () => {
  const band = sideBand(813)

  it('holds one axis without consulting the other', () => {
    expect(clampSide(10, band)).toBe(band.min)
    expect(clampSide(9999, band)).toBe(band.max)
    expect(clampSide(300, band)).toBe(300)
  })
})

describe('fitSides', () => {
  const band = sideBand(813)

  it('gives up size rather than shape', () => {
    // The bug this exists to stop: clamping each side of a letterbox on its own
    // clips the long side and leaves the short one, which squares the slide up.
    const { w, h } = fitSides(2000, 700, band)
    expect(w / h).toBeCloseTo(2000 / 700, 10)
    expect(Math.max(w, h)).toBeLessThanOrEqual(band.max + 1e-9)
    expect(Math.min(w, h)).toBeGreaterThanOrEqual(band.min - 1e-9)
  })

  it('scales a too-small pair up, still keeping the shape', () => {
    const { w, h } = fitSides(20, 10, band)
    expect(w / h).toBeCloseTo(2, 10)
    expect(Math.min(w, h)).toBeCloseTo(band.min, 9)
  })

  it('leaves a pair that already fits alone', () => {
    const { w, h } = fitSides(300, 240, band)
    expect(w).toBeCloseTo(300, 9)
    expect(h).toBeCloseTo(240, 9)
  })

  it('compresses only an aspect the band cannot express at any size', () => {
    // Past band.max / band.min there is no uniform scale that fits, so the
    // shape has to give. Everything short of that must keep its ratio.
    const limit = band.max / band.min
    const { w, h } = fitSides(100 * limit * 4, 100, band)
    expect(w / h).toBeCloseTo(limit, 6)
  })

  it('always lands inside the band, for any shape', () => {
    for (const short of [360, 813, 1440, 2400]) {
      const b = sideBand(short)
      for (const ratio of [0.02, 0.4, 1, 2.5, 60]) {
        for (const mean of [5, 200, 4000]) {
          const { w, h } = fitSides(mean * ratio, mean / ratio, b)
          expect(Math.min(w, h)).toBeGreaterThanOrEqual(b.min - 1e-9)
          expect(Math.max(w, h)).toBeLessThanOrEqual(b.max + 1e-9)
        }
      }
    }
  })
})
