import { describe, expect, it } from 'vitest'
import { containAxis, litArea, litRect } from './lit'

const A = 1440 / 900

describe('litRect', () => {
  it('is the whole box when no paper is in', () => {
    const r = litRect(A, 0)
    expect(r.x0).toBe(0)
    expect(r.x1).toBe(A)
    expect(r.y0).toBe(0)
    expect(r.y1).toBe(1)
  })

  it('takes width from the left and nowhere else', () => {
    for (const crowd of [0.1, 0.25, 0.5, 0.75, 1]) {
      const r = litRect(A, crowd)
      expect(r.x0).toBeCloseTo(A * crowd, 12)
      expect(r.x1).toBe(A)
      expect(r.y0).toBe(0)
      expect(r.y1).toBe(1)
    }
  })

  it('clamps, so a runaway pointer cannot invert the room', () => {
    expect(litRect(A, -3).x0).toBe(0)
    expect(litRect(A, 4).x0).toBe(A)
    expect(litRect(A, 4).x0).toBeLessThanOrEqual(litRect(A, 4).x1)
  })

  it('is bit identical to the literals it replaced at crowd 0', () => {
    // The whole feature rests on this: the wall arithmetic has to produce the
    // same floats it did when the four edges were written out by hand, or
    // trajectories diverge at 1e-17 and every seeded test drifts.
    const r = litRect(A, 0)
    expect(r.x0 + 0.06).toBe(0.06)
    expect(r.y1 - 0.04).toBe(0.96)
    expect((r.x0 + r.x1) / 2).toBe(A / 2)
    expect((r.y0 + r.y1) / 2).toBe(0.5)
  })
})

describe('litArea', () => {
  it('shrinks with the room and reaches zero, never below', () => {
    expect(litArea(litRect(A, 0))).toBeCloseTo(A, 12)
    expect(litArea(litRect(A, 0.5))).toBeCloseTo(A / 2, 12)
    expect(litArea(litRect(A, 1))).toBe(0)
    expect(litArea(litRect(A, 3))).toBe(0)
  })
})

describe('containAxis', () => {
  it('leaves a span that already fits alone', () => {
    expect(containAxis(0.5, 0.2, 0, 1)).toBe(0)
    expect(containAxis(0.2, 0.2, 0, 1)).toBe(0)
  })

  it('pushes a span back off each edge exactly', () => {
    expect(containAxis(0.1, 0.2, 0, 1)).toBeCloseTo(0.1, 12)
    expect(containAxis(0.95, 0.2, 0, 1)).toBeCloseTo(-0.15, 12)
  })

  it('centres rather than pushes when the room is narrower than the span', () => {
    // A push satisfies one edge by breaking the other, and the resolver then
    // swaps which edge is broken on every pass for as long as the paper is in.
    const d = containAxis(0.1, 0.5, 0.4, 0.8)
    expect(0.1 + d).toBeCloseTo(0.6, 12)
  })

  it('is settled after one correction, from either side', () => {
    for (const lo of [0, 0.3, 1.2]) {
      for (const h of [0.05, 0.3, 0.9]) {
        for (const c of [-1, 0.2, 0.55, 1.4, 9]) {
          const hi = lo + 0.5
          const moved = c + containAxis(c, h, lo, hi)
          expect(containAxis(moved, h, lo, hi)).toBeCloseTo(0, 12)
        }
      }
    }
  })
})
