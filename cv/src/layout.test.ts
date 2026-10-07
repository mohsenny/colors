import { describe, expect, it } from 'vitest'
import { TAB_PROUD, TAB_W } from '../../src/core/constants'
import { shoelace } from '../../src/render/paint'
import { LIFE } from './life'
import { MARGIN, PHONE_U_MIN, U_MAX, U_MIN, aim, corners, fit, length, place, toStage } from './layout'
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

/** The highest and lowest a laid sheet reaches, px. */
function reach(s: Laid): [number, number] {
  const ys = corners(s).filter((_, i) => i % 2 === 1)
  return [Math.min(...ys), Math.max(...ys)]
}

const placed = place(LIFE.chapters)
const len = length(placed)

// The story's lower edge at 1440x900 and at 390x844, as measured, and the dock's upper one.
const WIDE: Fit = fit({ width: 1440, height: 900, top: 420, bottom: 844 }, len)
const PHONE: Fit = fit({ width: 390, height: 844, top: 480, bottom: 794 }, len)

describe('place', () => {
  it('lays the six a step apart, left to right in time', () => {
    const lefts = placed.map((p) => Math.round((p.along - 0.5) * 100) / 100)
    expect(lefts).toEqual([0, 1.12, 2.24, 3.36, 4.48, 5.6])
    expect(len).toBeCloseTo(6.6, 9)
  })
})

describe('no two sheets overlap', () => {
  for (const [name, f] of [
    ['across a desktop', WIDE],
    ['along a phone', PHONE],
  ] as const) {
    it(name, () => {
      for (const current of [null, 0, 3, 5]) {
        const camera = aim(f, current === null ? len / 2 : (placed[current]?.along ?? 0))
        const laid = placed.map((p, i) => toStage(f, p, camera, i === current ? 1 : 0))
        for (let i = 0; i < laid.length - 1; i++) {
          expect(overlap(laid[i] as Laid, laid[i + 1] as Laid), `${current}: ${i} and ${i + 1}`).toBe(0)
        }
      }
    })
  }

  it('with every lean at the most it may be, either way, and one lifted', () => {
    for (const sign of [1, -1]) {
      const leant = placed.map((p, i) => ({ ...p, lean: (i % 2 === 0 ? sign : -sign) * 1.5 }))
      for (const current of [0, 2, 5]) {
        const laid = leant.map((p, i) => toStage(WIDE, p, aim(WIDE, 0), i === current ? 1 : 0))
        for (let i = 0; i < laid.length - 1; i++) expect(overlap(laid[i] as Laid, laid[i + 1] as Laid)).toBe(0)
      }
    }
  })
})

describe('fit', () => {
  it('lays the row across the width at 1440, and a phone sheet at its share of 390', () => {
    expect(WIDE.narrow).toBe(false)
    expect(WIDE.u).toBeCloseTo(1360 / 6.6, 6)
    expect(PHONE.narrow).toBe(true)
    expect(PHONE.u).toBeCloseTo(0.55 * 390, 6)
  })

  it('keeps a desktop sheet between its least and most, and a phone one over its least', () => {
    expect(fit({ width: 800, height: 700, top: 400, bottom: 650 }, len).u).toBe(U_MIN)
    expect(fit({ width: 8000, height: 4000, top: 200, bottom: 3950 }, len).u).toBe(U_MAX)
    expect(fit({ width: 320, height: 568, top: 500, bottom: 518 }, len).u).toBe(PHONE_U_MIN)
  })

  it('keeps the lifted sheet and its tab in the band', () => {
    for (const f of [WIDE, PHONE]) {
      const lifted = toStage(f, placed[2] as (typeof placed)[number], aim(f, 2), 1)
      const [top, bottom] = reach(lifted)
      const margin = f.narrow ? MARGIN / 2 : MARGIN
      expect(top - TAB_PROUD).toBeGreaterThanOrEqual((f.narrow ? 480 : 420) + margin - 0.5)
      expect(bottom).toBeLessThanOrEqual(f.narrow ? 794 : 844)
    }
  })

  it('looks at a desktop row whole when it fits, and pans one that does not only as far as its ends', () => {
    expect(aim(WIDE, 0)).toBeCloseTo(len / 2, 9)
    expect(aim(WIDE, len)).toBeCloseTo(len / 2, 9)
    // 120px sheets across 700px of band: too long to see whole.
    const small = fit({ width: 780, height: 700, top: 300, bottom: 644 }, len)
    const half = (small.far - small.near) / 2 / small.u
    expect(small.length).toBeGreaterThan(2 * half)
    expect(aim(small, 0)).toBeCloseTo(half, 9)
    expect(aim(small, len)).toBeCloseTo(len - half, 9)
    expect(aim(small, 3)).toBe(3)
  })

  it('fits the row without panning down to 1024', () => {
    const f = fit({ width: 1024, height: 768, top: 380, bottom: 712 }, len)
    expect(f.u).toBeGreaterThan(U_MIN)
    expect(aim(f, 0)).toBeCloseTo(len / 2, 9)
    expect(aim(f, len)).toBeCloseTo(len / 2, 9)
  })

  it('keeps a phone sheet in the middle, from the first to the last', () => {
    expect(aim(PHONE, 0)).toBe(0.5)
    expect(aim(PHONE, 2.74)).toBe(2.74)
    expect(aim(PHONE, len)).toBeCloseTo(len - 0.5, 9)
    const laid = toStage(PHONE, placed[3] as (typeof placed)[number], aim(PHONE, placed[3]?.along ?? 0))
    expect(laid.x).toBeCloseTo(195, 9)
  })

  it('gives a stage too short for the desktop floor what its band holds, down to a tab', () => {
    // A phone on its side, 844x390: the story's lower edge as measured, and the dock's upper one.
    const f = fit({ width: 844, height: 390, top: 192, bottom: 334 }, len)
    expect(f.narrow).toBe(false)
    expect(f.u).toBeLessThan(U_MIN)
    const lifted = toStage(f, placed[2] as (typeof placed)[number], aim(f, 2), 1)
    const [top, bottom] = reach(lifted)
    expect(top - TAB_PROUD).toBeGreaterThanOrEqual(192)
    expect(bottom).toBeLessThanOrEqual(334)
    expect(fit({ width: 844, height: 390, top: 360, bottom: 334 }, len).u).toBe(TAB_W)
  })

  it('keeps a phone band the right way round when the story leaves no room', () => {
    const f = fit({ width: 320, height: 568, top: 560, bottom: 518 }, len)
    expect(f.u).toBe(PHONE_U_MIN)
    expect(Number.isFinite(f.middle)).toBe(true)
  })
})
