import { describe, expect, it } from 'vitest'
import { shoelace } from '../../src/render/paint'
import { LIFE } from './life'
import { MARGIN, MARGIN_NARROW, MARGIN_TIGHT, U_MAX, U_MIN, aim, corners, crosses, fit, length, place, toStage } from './layout'
import type { Fit, Laid } from './layout'

/** Clip a convex polygon to the inside of another, clockwise on screen. Sutherland-Hodgman. */
function clip(subject: number[], by: number[]): number[] {
  let out = subject
  const n = by.length / 2
  for (let i = 0; i < n && out.length >= 6; i++) {
    const ax = by[2 * i] as number
    const ay = by[2 * i + 1] as number
    const bx = by[(2 * i + 2) % by.length] as number
    const by2 = by[(2 * i + 3) % by.length] as number
    // Inside is to the right of a to b, which is the inside of a clockwise
    // polygon with y running down.
    const side = (x: number, y: number): number => (bx - ax) * (y - ay) - (by2 - ay) * (x - ax)
    const src = out
    out = []
    const m = src.length / 2
    for (let j = 0; j < m; j++) {
      const px = src[2 * j] as number
      const py = src[2 * j + 1] as number
      const qx = src[(2 * j + 2) % src.length] as number
      const qy = src[(2 * j + 3) % src.length] as number
      const dp = side(px, py)
      const dq = side(qx, qy)
      if (dp >= 0) out.push(px, py)
      if ((dp >= 0) !== (dq >= 0)) {
        const t = dp / (dp - dq)
        out.push(px + (qx - px) * t, py + (qy - py) * t)
      }
    }
  }
  return out
}

function overlap(a: Laid, b: Laid): number {
  const p = clip(corners(a), corners(b))
  return p.length < 6 ? 0 : shoelace(p)
}

const placed = place(LIFE.chapters, LIFE.crossings)
const len = length(placed)

const WIDE: Fit = fit({ width: 1440, height: 900, top: 260, bottom: 844 }, len)
const NARROW: Fit = fit({ width: 390, height: 844, top: 380, bottom: 794 }, len)

describe('place', () => {
  it('puts the left edges where the spacing rule says', () => {
    const lefts = placed.map((p) => Math.round((p.along - 0.5) * 100) / 100)
    expect(lefts).toEqual([0, 1.12, 2.24, 2.84, 3.96, 5.08, 6.2, 6.8])
    expect(len).toBeCloseTo(7.8, 9)
  })

  it('keeps learning on the top row and work below', () => {
    for (const [i, c] of LIFE.chapters.entries()) {
      const p = placed[i]
      expect(p?.across, c.id).toBe(c.row === 'learn' ? 0.5 : 1.2)
    }
  })
})

describe('only the declared crossings overlap', () => {
  for (const [name, f] of [
    ['across a desktop', WIDE],
    ['down a phone', NARROW],
  ] as const) {
    it(name, () => {
      const laid = placed.map((p) => toStage(f, p, aim(f, len / 2)))
      const met: string[] = []
      for (let i = 0; i < laid.length; i++) {
        for (let j = i + 1; j < laid.length; j++) {
          const area = overlap(laid[i] as Laid, laid[j] as Laid)
          const a = LIFE.chapters[i]?.id ?? ''
          const b = LIFE.chapters[j]?.id ?? ''
          if (crosses(LIFE.crossings, a, b)) {
            // 0.4 by 0.3 of a sheet, give or take what the leans turn in.
            expect(area / f.u ** 2, `${a} x ${b}`).toBeGreaterThan(0.1)
            met.push(`${a} x ${b}`)
          } else {
            expect(area, `${a} x ${b}`).toBe(0)
          }
        }
      }
      expect(met).toHaveLength(LIFE.crossings.length)
    })
  }

  it('still holds with every lean at the most it may be, either way', () => {
    for (const sign of [1, -1]) {
      const leant = placed.map((p, i) => ({ ...p, lean: (i % 2 === 0 ? sign : -sign) * 1.5 }))
      const laid = leant.map((p) => toStage(WIDE, p, aim(WIDE, len / 2)))
      for (let i = 0; i < laid.length; i++) {
        for (let j = i + 1; j < laid.length; j++) {
          const a = LIFE.chapters[i]?.id ?? ''
          const b = LIFE.chapters[j]?.id ?? ''
          if (!crosses(LIFE.crossings, a, b)) expect(overlap(laid[i] as Laid, laid[j] as Laid)).toBe(0)
        }
      }
    }
  })
})

describe('fit', () => {
  it('lays the life across the width at 1440 and down the width at 390', () => {
    expect(WIDE.narrow).toBe(false)
    expect(WIDE.u).toBeCloseTo(1360 / 7.8, 6)
    expect(NARROW.narrow).toBe(true)
    expect(NARROW.u).toBeCloseTo(366 / 1.7, 6)
  })

  it('keeps a sheet between 160 and 560px', () => {
    expect(fit({ width: 900, height: 700, top: 200, bottom: 650 }, len).u).toBe(U_MIN)
    expect(fit({ width: 8000, height: 4000, top: 200, bottom: 3950 }, len).u).toBe(U_MAX)
  })

  it('centres a life that fits, and pans one that does not only as far as its ends', () => {
    expect(aim(WIDE, 0)).toBeCloseTo(len / 2, 9)
    expect(aim(WIDE, len)).toBeCloseTo(len / 2, 9)
    const small = fit({ width: 1024, height: 768, top: 260, bottom: 712 }, len)
    const half = (small.far - small.near) / 2 / small.u
    expect(aim(small, 0)).toBeCloseTo(half, 9)
    expect(aim(small, len)).toBeCloseTo(len - half, 9)
    expect(aim(small, 4)).toBe(4)
  })

  it('gives up side margin before it pans, at 1280 all of the life in view', () => {
    const f = fit({ width: 1280, height: 800, top: 300, bottom: 744 }, len)
    expect(f.u).toBe(U_MIN)
    expect(f.far - f.near).toBeGreaterThanOrEqual(len * f.u - 0.5)
    expect(f.near).toBeGreaterThanOrEqual(MARGIN_TIGHT)
    expect(f.near).toBeLessThan(MARGIN)
    expect(aim(f, 0)).toBeCloseTo(len / 2, 9)
    // Too wide to fit even then: the full margin, and the camera pans.
    const small = fit({ width: 1024, height: 768, top: 260, bottom: 712 }, len)
    expect(small.near).toBe(MARGIN)
  })

  it('lays a phone band a half margin clear of the card and fades the life above it', () => {
    expect(NARROW.near).toBe(380 + MARGIN_NARROW)
    expect(NARROW.far).toBe(794 - MARGIN_NARROW)
    expect(NARROW.edge).toBe(380)
    expect(WIDE.edge).toBe(null)
  })

  it('keeps a phone band the right way round when the card leaves no room, and pans it', () => {
    const f = fit({ width: 320, height: 568, top: 520, bottom: 518 }, len)
    expect(f.far).toBeGreaterThanOrEqual(f.near)
    expect(aim(f, 0)).toBeCloseTo(0, 9)
    expect(aim(f, len)).toBeCloseTo(len, 9)
  })
})
