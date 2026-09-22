import { describe, expect, it } from 'vitest'
import { decode, filmLinear, linearToOklch } from './oklab'
import { filmToRyb, mixBytes, mixFilm, rybToSrgb, srgbToRyb, stackInk } from './pigment'
import type { Ryb } from './pigment'
import type { Dye } from './types'

/** A saturated sheet of a given OKLCh hue, at the density the palette uses. */
function sheet(h: number, C = 0.16, L = 0.72, d = 0.88): Dye {
  return { L, C, h, d }
}

function ryb(dye: Dye): Ryb {
  return filmToRyb(filmLinear(dye))
}

/** Hue of a mix, in OKLCh degrees. The claim under test is always about hue. */
function mixHue(...dyes: Dye[]): number {
  const films = dyes.map(filmLinear)
  const [r, g, b] = mixFilm(dyes.map(ryb), films)
  return linearToOklch(r, g, b).h
}

function lum(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
}

/** Shortest signed distance between two hue angles, in degrees. */
function hueGap(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

// OKLCh hue landmarks, measured from the cube's own corners rather than
// asserted from memory: the test should fail when the mixing model breaks, not
// when someone disagrees about where orange starts.
const HUE = (() => {
  const of = (c: readonly [number, number, number]): number => {
    const o = linearToOklch(c[0], c[1], c[2])
    return o.h
  }
  const lin = (r: number, y: number, b: number): [number, number, number] => {
    const s = rybToSrgb(r, y, b)
    return [decode(s[0]), decode(s[1]), decode(s[2])]
  }
  return {
    red: of(lin(1, 0, 0)),
    yellow: of(lin(0, 1, 0)),
    blue: of(lin(0, 0, 1)),
    orange: of(lin(1, 1, 0)),
    green: of(lin(0, 1, 1)),
    purple: of(lin(1, 0, 1)),
  }
})()

describe('the RYB cube', () => {
  it('reproduces its own corners', () => {
    expect(rybToSrgb(0, 0, 0)).toEqual([1, 1, 1])
    expect(rybToSrgb(1, 0, 0)).toEqual([1, 0, 0])
    expect(rybToSrgb(1, 1, 0)).toEqual([1, 0.5, 0])
    expect(rybToSrgb(0, 1, 1)).toEqual([0, 0.66, 0.2])
  })

  it('inverts to within a code value for colours pigment can reach', () => {
    for (const [r, y, b] of [
      [0.2, 0, 0],
      [0.9, 0.4, 0],
      [0, 0.55, 0.3],
      [0.35, 0.35, 0.35],
      [0.7, 0, 0.6],
    ] as const) {
      const back = srgbToRyb(rybToSrgb(r, y, b))
      const round = rybToSrgb(back[0], back[1], back[2])
      const want = rybToSrgb(r, y, b)
      for (let i = 0; i < 3; i++) {
        expect(Math.abs((round[i] as number) - (want[i] as number))).toBeLessThan(1.5 / 255)
      }
    }
  })

  it('prefers the least pigment that makes a colour', () => {
    // White is reachable only at the origin, and near-white must not be solved
    // as a large balanced dose of all three.
    const p = srgbToRyb([0.97, 0.96, 0.95])
    expect(p[0] + p[1] + p[2]).toBeLessThan(0.25)
  })
})

describe('mixing two sheets', () => {
  it('reads red over yellow as orange', () => {
    const h = mixHue(sheet(HUE.red), sheet(HUE.yellow))
    expect(hueGap(h, HUE.orange)).toBeLessThan(22)
  })

  it('reads yellow over blue as green, which multiply could not', () => {
    const h = mixHue(sheet(HUE.yellow), sheet(HUE.blue))
    expect(hueGap(h, HUE.green)).toBeLessThan(28)
  })

  it('reads red over blue as purple', () => {
    const h = mixHue(sheet(HUE.red), sheet(HUE.blue))
    expect(hueGap(h, HUE.purple)).toBeLessThan(28)
  })

  it('keeps a hue when both sheets are that hue', () => {
    const h = mixHue(sheet(HUE.red), sheet(HUE.red))
    expect(hueGap(h, HUE.red)).toBeLessThan(10)
  })

  it('does not depend on which sheet is on top', () => {
    const a = sheet(HUE.yellow)
    const b = sheet(HUE.blue)
    const c = sheet(HUE.purple, 0.12, 0.6, 0.8)
    const one = mixBytes([ryb(a), ryb(b), ryb(c)], [filmLinear(a), filmLinear(b), filmLinear(c)])
    const two = mixBytes([ryb(c), ryb(a), ryb(b)], [filmLinear(c), filmLinear(a), filmLinear(b)])
    const three = mixBytes([ryb(b), ryb(c), ryb(a)], [filmLinear(b), filmLinear(c), filmLinear(a)])
    expect(one).toEqual(two)
    expect(one).toEqual(three)
  })
})

describe('stacking depth', () => {
  it('paints a single sheet as exactly its own transmitted colour', () => {
    const d = sheet(140)
    const film = filmLinear(d)
    expect(mixFilm([ryb(d)], [film])).toEqual(film)
  })

  it('never goes darker than the darkest sheet in it, at any depth', () => {
    // The rule that replaced compounding absorption. A real stack loses light
    // once per sheet and every crowded region ends up sludge; here the pigment
    // decides the hue and the sheets decide the lightness, so a fourth layer
    // costs nothing. Lightness is measured in OKLab, which is what the model
    // sets, rather than in luminance.
    const dyes = [sheet(20), sheet(95, 0.14, 0.84), sheet(200, 0.18, 0.58), sheet(300)]
    for (let n = 2; n <= dyes.length; n++) {
      const cut = dyes.slice(0, n)
      const films = cut.map(filmLinear)
      const ls = films.map((f) => linearToOklch(f[0], f[1], f[2]).L)
      const got = mixFilm(
        cut.map(ryb),
        films,
      )
      const L = linearToOklch(got[0], got[1], got[2]).L
      expect(L).toBeGreaterThanOrEqual(Math.min(...ls) - 1e-6)
      expect(L).toBeLessThanOrEqual(ls.reduce((a, b) => a + b, 0) / n + 1e-6)
    }
  })

  it('holds a near-complementary overlap off black', () => {
    // The failure this guards against is the old multiply behaviour: two good
    // colours crossing and leaving a hole in the lightbox.
    const l = lum(mixFilm([ryb(sheet(HUE.red)), ryb(sheet(HUE.green))], [
      filmLinear(sheet(HUE.red)),
      filmLinear(sheet(HUE.green)),
    ]))
    expect(l).toBeGreaterThan(0.05)
  })

  it('stays inside the gamut for seven deep sheets', () => {
    const dyes = Array.from({ length: 7 }, (_, i) => sheet(i * 51, 0.2, 0.68, 0.95))
    const out = mixFilm(dyes.map(ryb), dyes.map(filmLinear))
    for (const c of out) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThanOrEqual(1)
    }
  })
})

describe('mode B', () => {
  it('lets the last sheet govern, which is the point of it', () => {
    const top: [number, number, number] = [0.8, 0.1, 0.1]
    const out = stackInk([[0.1, 0.1, 0.8], top], [0.7, 0.8])
    expect(out[0]).toBeGreaterThan(out[2])
  })

  it('is fully opaque at alpha 1', () => {
    expect(stackInk([[0.2, 0.4, 0.6]], [1])).toEqual([0.2, 0.4, 0.6])
  })
})
