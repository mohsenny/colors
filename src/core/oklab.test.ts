import { describe, expect, it } from 'vitest'
import type { Dye } from './types'
import {
  decode,
  encode,
  filmHex,
  filmLinear,
  filmRgb255,
  gamutMap,
  linearToHex,
  linearToOklch,
  mixDye,
  oklchToLinear,
  stackLinear,
} from './oklab'

function hexTo255(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]
}

function expectHexClose(actual: string, expected: string, tol = 2): void {
  const a = hexTo255(actual)
  const b = hexTo255(expected)
  for (let i = 0; i < 3; i++) {
    expect(Math.abs((a[i] as number) - (b[i] as number)), `${actual} vs ${expected}`).toBeLessThanOrEqual(tol)
  }
}

describe('oklab round trips', () => {
  it('oklch -> linear -> oklch is lossless', () => {
    for (let L = 0.2; L <= 0.95; L += 0.05) {
      for (let C = 0.01; C <= 0.2; C += 0.03) {
        for (let h = 5; h < 360; h += 37) {
          const [r, g, b] = oklchToLinear(L, C, h)
          const back = linearToOklch(r, g, b)
          expect(back.L).toBeCloseTo(L, 6)
          expect(back.C).toBeCloseTo(C, 6)
          const dh = ((back.h - h + 540) % 360) - 180
          expect(Math.abs(dh)).toBeLessThan(1e-3)
        }
      }
    }
  })

  it('encode and decode invert each other', () => {
    for (let x = 0; x <= 1.0001; x += 0.001) {
      expect(decode(encode(x))).toBeCloseTo(x, 10)
      expect(encode(decode(x))).toBeCloseTo(x, 10)
    }
    // The curve is odd-symmetric so out-of-gamut negatives never produce NaN.
    expect(decode(encode(-0.3))).toBeCloseTo(-0.3, 10)
  })
})

describe('gamutMap', () => {
  it('always lands inside sRGB with a non-negative clip', () => {
    for (let L = 0.05; L <= 0.99; L += 0.03) {
      for (let C = 0; C <= 0.36; C += 0.04) {
        for (let h = 0; h < 360; h += 23) {
          const m = gamutMap(L, C, h)
          for (const v of [m.r, m.g, m.b]) {
            expect(v).toBeGreaterThanOrEqual(0)
            expect(v).toBeLessThanOrEqual(1)
            expect(Number.isFinite(v)).toBe(true)
          }
          expect(m.clip).toBeGreaterThanOrEqual(0)
          expect(m.clip).toBeLessThanOrEqual(C + 1e-9)
        }
      }
    }
  })

  it('does not clip a colour that is already in gamut', () => {
    expect(gamutMap(0.9, 0.17, 100).clip).toBe(0)
    // A chroma no sRGB display can reach must lose some.
    expect(gamutMap(0.9, 0.36, 250).clip).toBeGreaterThan(0.1)
  })

  it('preserves hue while giving up chroma', () => {
    const m = gamutMap(0.8, 0.34, 140)
    const back = linearToOklch(m.r, m.g, m.b)
    expect(back.h).toBeCloseTo(140, 1)
    expect(back.L).toBeCloseTo(0.8, 2)
  })
})

describe('the verified film numbers', () => {
  const yellow: Dye = { L: 0.9, C: 0.17, h: 100, d: 0.62 }
  const red: Dye = { L: 0.8, C: 0.19, h: 55, d: 0.62 }

  it('matches the two documented gels', () => {
    expectHexClose(filmHex(yellow), '#FBECAC')
    expectHexClose(filmHex(red), '#FFCEB5')
    expect(filmRgb255(yellow)).toEqual(hexTo255(filmHex(yellow)))
  })

  it('stacks yellow over red into an unambiguous orange', () => {
    const a = filmLinear(yellow).map(encode)
    const b = filmLinear(red).map(encode)
    const stacked = stackLinear(a, b)
    const hex = linearToHex(...(stacked.map(decode) as [number, number, number]))
    expectHexClose(hex, '#FBBE78')

    const lch = linearToOklch(...(stacked.map(decode) as [number, number, number]))
    expect(lch.h).toBeGreaterThan(55)
    expect(lch.h).toBeLessThan(85)
    expect(lch.L).toBeGreaterThan(0.78)
  })

  it('reads a pale neutral crossing as fine and a dark one as mud', () => {
    const pale = linearToOklch(...hexTo255('#BCC3C7').map((v) => decode(v / 255)) as [number, number, number])
    const dark = linearToOklch(...hexTo255('#958D93').map((v) => decode(v / 255)) as [number, number, number])
    expect(pale.L).toBeGreaterThan(0.74)
    expect(dark.L).toBeLessThan(0.74)
  })
})

describe('a sheet has one colour', () => {
  const dye: Dye = { L: 0.86, C: 0.16, h: 210, d: 0.55 }

  it('is the transmitted film, in both modes', () => {
    // There used to be a second, opaque colour for mode B, and the tab picked
    // between them. Mode B is light through the same film now, so the hex on
    // the tab is a property of the sheet and nothing else.
    expect(filmHex(dye)).toBe(linearToHex(...filmLinear(dye)))
  })
})

describe('mixDye', () => {
  const from: Dye = { L: 0.72, C: 0.05, h: 350, d: 0.45 }
  const to: Dye = { L: 0.9, C: 0.2, h: 10, d: 0.66 }

  it('returns the endpoints exactly', () => {
    expect(mixDye(from, to, 0)).toEqual(from)
    expect(mixDye(from, to, 1)).toEqual(to)
    expect(mixDye(from, to, -1)).toEqual(from)
    expect(mixDye(from, to, 2)).toEqual(to)
  })

  it('takes the short way round 350 -> 10', () => {
    for (let t = 0.05; t < 1; t += 0.05) {
      const h = mixDye(from, to, t).h
      expect(h >= 349.9 || h <= 10.1, `t=${t} h=${h}`).toBe(true)
    }
  })

  it('takes the short way round backwards too', () => {
    const h = mixDye({ ...from, h: 20 }, { ...to, h: 340 }, 0.5).h
    expect(h >= 330 || h <= 20).toBe(true)
  })

  it('moves hue ahead of density', () => {
    const t = 0.35
    const m = mixDye({ ...from, h: 0 }, { ...to, h: 90 }, t)
    const hueProgress = m.h / 90
    const densityProgress = (m.d - from.d) / (to.d - from.d)
    expect(hueProgress).toBeGreaterThan(densityProgress + 0.2)
  })

  it('keeps L, C and d monotone between the endpoints', () => {
    let prev = mixDye(from, to, 0)
    for (let t = 0.05; t <= 1.0001; t += 0.05) {
      const m = mixDye(from, to, Math.min(t, 1))
      expect(m.L).toBeGreaterThanOrEqual(prev.L - 1e-12)
      expect(m.C).toBeGreaterThanOrEqual(prev.C - 1e-12)
      expect(m.d).toBeGreaterThanOrEqual(prev.d - 1e-12)
      prev = m
    }
  })
})
