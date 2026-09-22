import { describe, expect, it } from 'vitest'
import { DENSITY_MAX, DENSITY_MIN, SLIDE_COUNT } from '../core/constants'
import { filmLinear, linearToOklch } from '../core/oklab'
import { Rng } from '../core/rng'
import type { Dye } from '../core/types'
import {
  BANDS,
  NEUTRAL_C,
  generatePalette,
  paletteViolations,
  quietSlots,
  scorePalette,
} from './palette'

/** A plausible size ladder: one big slide down to one small one. */
const AREA = [1, 0.72, 0.55, 0.42, 0.31, 0.22]
const NO_KEEP: (Dye | null)[] = [null, null, null, null, null, null]

/**
 * Chroma of the light coming off the slide. Dye chroma is not comparable across
 * hues: sRGB gives blue roughly twice what it gives yellow at the same
 * lightness, so a fixed dye threshold would call every yellow palette washed
 * out. What the eye grades is the film colour, so that is what these count.
 */
function effChroma(dye: Dye): number {
  const [r, g, b] = filmLinear(dye)
  return linearToOklch(r, g, b).C
}

function arcDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

function roll(seed: number, previous: Dye[] | null = null, keep: (Dye | null)[] = NO_KEEP): Dye[] {
  return generatePalette({
    rng: new Rng((seed * 2654435761) >>> 0),
    count: 6,
    areaNorm: AREA,
    keep,
    previous,
  })
}

describe('generatePalette over 300 seeds', () => {
  const palettes: Dye[][] = []
  let previous: Dye[] | null = null
  for (let s = 0; s < 300; s++) {
    const next = roll(s, previous)
    palettes.push(next)
    previous = next
  }

  it('always returns exactly six usable dyes', () => {
    for (const dyes of palettes) {
      expect(dyes).toHaveLength(6)
      for (const dye of dyes) {
        expect(Number.isFinite(dye.L)).toBe(true)
        expect(Number.isFinite(dye.C)).toBe(true)
        expect(Number.isFinite(dye.h)).toBe(true)
        expect(Number.isFinite(dye.d)).toBe(true)
      }
    }
  })

  it('keeps every dye inside the documented bands', () => {
    for (const dyes of palettes) {
      for (const dye of dyes) {
        expect(dye.L).toBeGreaterThanOrEqual(BANDS.lMin)
        expect(dye.L).toBeLessThanOrEqual(BANDS.lMax)
        expect(dye.C).toBeGreaterThanOrEqual(0)
        expect(dye.C).toBeLessThanOrEqual(BANDS.cMax)
        expect(dye.d).toBeGreaterThanOrEqual(BANDS.dMin)
        expect(dye.d).toBeLessThanOrEqual(DENSITY_MAX)
        expect(dye.h).toBeGreaterThanOrEqual(0)
        expect(dye.h).toBeLessThanOrEqual(360)
      }
    }
  })

  it('spends exactly as many slots on quiet as the palette size allows', () => {
    const gelSlots = new Set<number>()
    for (const dyes of palettes) {
      // The gel and the wash are the only slides thinner than a plain slide can
      // be, which makes density the reliable way to count them.
      expect(dyes.filter((d) => d.d < DENSITY_MIN).length).toBe(quietSlots(6))
      // Exactly one near-neutral gel, and it lands in the middle of the size
      // ladder: slots 2 to 4 for this AREA, never on the largest or smallest.
      const gels = dyes.map((d, i) => [d, i] as const).filter(([d]) => d.C <= NEUTRAL_C + 1e-9)
      expect(gels).toHaveLength(1)
      const slot = (gels[0] as readonly [Dye, number])[1]
      expect(slot).toBeGreaterThanOrEqual(2)
      expect(slot).toBeLessThanOrEqual(4)
      gelSlots.add(slot)
      // At least two slides carry real colour.
      expect(dyes.filter((d) => effChroma(d) >= 0.085).length).toBeGreaterThanOrEqual(2)
    }
    // And it moves. The same slot going grey on every reroll is the predictable
    // symmetry the brief rules out.
    expect(gelSlots.size).toBe(3)
  })

  it('keeps every slide perceptually distinct from its nearest neighbour', () => {
    // The complaint this answers was "four shades of blue/purple", and the hue
    // rules could not see it: they measure degrees, and a degree of hue at low
    // chroma is worth nothing. So this measures the film colours in OKLab, with
    // lightness at half weight so a staircase of one hue cannot pass.
    const AREAS = Array.from({ length: SLIDE_COUNT }, (_, i) => 1 - (i * 0.76) / SLIDE_COUNT)
    const nearest: number[] = []
    for (let s = 0; s < 200; s++) {
      const dyes = generatePalette({
        rng: new Rng((s * 2654435761 + 7) >>> 0),
        count: SLIDE_COUNT,
        areaNorm: AREAS,
        keep: Array.from({ length: SLIDE_COUNT }, () => null),
        previous: null,
      })
      const pts = dyes.map((d) => {
        const [r, g, b] = filmLinear(d)
        const o = linearToOklch(r, g, b)
        const rad = (o.h * Math.PI) / 180
        return [0.5 * o.L, o.C * Math.cos(rad), o.C * Math.sin(rad)] as const
      })
      let worst = 1
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const p = pts[i] as readonly [number, number, number]
          const q = pts[j] as readonly [number, number, number]
          worst = Math.min(worst, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]))
        }
      }
      nearest.push(worst)
    }
    nearest.sort((a, b) => a - b)
    // The floor holds outright, and the tenth percentile sits well clear of it:
    // the scorer is supposed to pull the whole distribution up, not just clip
    // the tail. Before this existed the tenth percentile was 0.047 and a sixth
    // of all rolls contained a pair under 0.05.
    expect(nearest[0] as number).toBeGreaterThan(0.04)
    expect(nearest[Math.floor(nearest.length * 0.1)] as number).toBeGreaterThan(0.055)
  })

  it('satisfies the hard constraints in at least 85% of rolls', () => {
    let clean = 0
    let prev: Dye[] | null = null
    for (const dyes of palettes) {
      if (paletteViolations(dyes, prev).length === 0) clean++
      prev = dyes
    }
    expect(clean / palettes.length).toBeGreaterThanOrEqual(0.85)
  })

  it('produces a novel palette every time', () => {
    for (let i = 1; i < palettes.length; i++) {
      const a = palettes[i - 1] as Dye[]
      const b = palettes[i] as Dye[]
      expect(b).not.toEqual(a)
      let shift = 0
      for (let s = 0; s < 6; s++) shift += arcDist((a[s] as Dye).h, (b[s] as Dye).h)
      expect(shift / 6).toBeGreaterThanOrEqual(20)
    }
  })

  it('spends real chroma rather than returning six near-neutrals', () => {
    for (const dyes of palettes) expect(scorePalette(dyes)).toBeGreaterThan(0.5)
  })
})

describe('locked slots', () => {
  it('come back verbatim and still constrain the rest', () => {
    for (let s = 0; s < 120; s++) {
      const rng = new Rng((s * 104729 + 17) >>> 0)
      const first = generatePalette({ rng, count: 6, areaNorm: AREA, keep: NO_KEEP, previous: null })
      const keep: (Dye | null)[] = [first[0] ?? null, null, first[2] ?? null, null, first[4] ?? null, null]
      const next = generatePalette({ rng, count: 6, areaNorm: AREA, keep, previous: first })

      expect(next[0]).toEqual(first[0])
      expect(next[2]).toEqual(first[2])
      expect(next[4]).toEqual(first[4])
      // Unlocked slots really moved.
      expect(next[1]).not.toEqual(first[1])
    }
  })

  it('survives every slot being locked', () => {
    const rng = new Rng(5)
    const base = generatePalette({ rng, count: 6, areaNorm: AREA, keep: NO_KEEP, previous: null })
    const all = generatePalette({ rng, count: 6, areaNorm: AREA, keep: base, previous: base })
    expect(all).toEqual(base)
    // A copy, not the caller's objects.
    expect(all[0]).not.toBe(base[0])
  })

  it('still gives the last free slot a colour when five of six are pinned', () => {
    // The quiet roles are spent out of the free slots, so an uncapped budget
    // made the single regenerable slide the gel every time: pressing Regenerate
    // produced the same near-grey on every press, which reads as a dead button.
    const rng = new Rng(777)
    const base = generatePalette({ rng, count: 6, areaNorm: AREA, keep: NO_KEEP, previous: null })
    for (const freeSlot of [0, 1, 2, 3, 4, 5]) {
      const keep = base.map((d, i) => (i === freeSlot ? null : d))
      const seen = new Set<string>()
      for (let r = 0; r < 12; r++) {
        const out = generatePalette({ rng, count: 6, areaNorm: AREA, keep, previous: base })
        const dye = out[freeSlot] as Dye
        // Neither of the two quiet roles: not the near-neutral gel, and not
        // the thinned wash. Dye chroma is the right scale here because that is
        // what the gel is pinned to, hue-independent.
        expect(dye.C).toBeGreaterThanOrEqual(0.06)
        expect(dye.d).toBeGreaterThanOrEqual(DENSITY_MIN)
        seen.add(`${Math.round(dye.h)}`)
      }
      // And it is not the same colour every press.
      expect(seen.size).toBeGreaterThan(1)
    }
  })

  it('survives a locked set that cannot satisfy the constraints', () => {
    // Six identical dark-ish gels: minGap, neutrals, saturation and mud all fail.
    const bad: Dye[] = Array.from({ length: 6 }, () => ({ L: 0.7, C: 0.2, h: 30, d: 0.7 }))
    const out = generatePalette({
      rng: new Rng(9),
      count: 6,
      areaNorm: AREA,
      keep: bad,
      previous: bad,
    })
    expect(out).toHaveLength(6)
    expect(paletteViolations(out, bad).length).toBeGreaterThan(0)
  })
})

describe('smaller viewports and odd input', () => {
  it('scales down to four slots', () => {
    let clean = 0
    for (let s = 0; s < 120; s++) {
      const dyes = generatePalette({
        rng: new Rng((s * 7919 + 3) >>> 0),
        count: 4,
        areaNorm: [1, 0.7, 0.45, 0.3],
        keep: [],
        previous: null,
      })
      expect(dyes).toHaveLength(4)
      expect(dyes.filter((d) => d.d < DENSITY_MIN).length).toBe(quietSlots(4))
      expect(dyes.filter((d) => effChroma(d) >= 0.085).length).toBeGreaterThanOrEqual(2)
      if (paletteViolations(dyes, null).length === 0) clean++
    }
    expect(clean / 120).toBeGreaterThanOrEqual(0.85)
  })

  it('still finds a legal palette at two and three slots', () => {
    // A two or three slide palette has no slot to spare on a quiet one, so every
    // slide has to carry colour and no gel is required.
    for (const count of [2, 3]) {
      let clean = 0
      for (let s = 0; s < 200; s++) {
        const dyes = generatePalette({
          rng: new Rng((s * 7919 + count) >>> 0),
          count,
          areaNorm: AREA.slice(0, count),
          keep: [],
          previous: null,
        })
        expect(dyes).toHaveLength(count)
        expect(quietSlots(count)).toBe(0)
        expect(dyes.filter((d) => d.d < DENSITY_MIN).length).toBe(0)
        expect(dyes.filter((d) => effChroma(d) >= 0.085).length).toBeGreaterThanOrEqual(1)
        if (paletteViolations(dyes, null).length === 0) clean++
      }
      expect(clean / 200).toBeGreaterThanOrEqual(0.85)
    }
  })

  it('never throws on missing areas, keeps or counts', () => {
    const rng = new Rng(77)
    expect(generatePalette({ rng, count: 0, areaNorm: [], keep: [], previous: null })).toEqual([])
    expect(
      generatePalette({ rng, count: 3, areaNorm: [], keep: [], previous: null }),
    ).toHaveLength(3)
    expect(
      generatePalette({ rng, count: 5, areaNorm: [0.5], keep: [null], previous: [] }),
    ).toHaveLength(5)
    expect(
      generatePalette({ rng, count: 7, areaNorm: AREA, keep: NO_KEEP, previous: null }),
    ).toHaveLength(7)
  })
})

describe('hue separation at the real slide count', () => {
  // Reads SLIDE_COUNT, because the whole point of the arcs is that the spacing
  // is a consequence of the count. Adding two slides once silently narrowed the
  // families and nobody noticed until it was on screen.
  const AREAS = Array.from({ length: SLIDE_COUNT }, (_, i) => 1 - (i * 0.76) / SLIDE_COUNT)
  const rolls: Dye[][] = []
  for (let s = 0; s < 200; s++) {
    rolls.push(
      generatePalette({
        rng: new Rng((s * 2246822519 + 11) >>> 0),
        count: SLIDE_COUNT,
        areaNorm: AREAS,
        keep: [],
        previous: null,
      }),
    )
  }

  /** Every slide's distance to its nearest hue neighbour. */
  function nearest(dyes: Dye[]): number[] {
    return dyes.map((d) => {
      let best = 180
      for (const o of dyes) if (o !== d) best = Math.min(best, arcDist(d.h, o.h))
      return best
    })
  }

  it('does not put four shades of one hue on the table', () => {
    // The skeletons used to be lists of angles for six slides, resampled for
    // seven, and the resampling packed three slides into 33 degrees: 60% of
    // slides sat within 24 degrees of another and most rolls showed a run of
    // near-identical blues. Arcs plus the clump penalty take that to a few
    // percent, which is the occasional deliberate pair, not a family.
    let clumped = 0
    let total = 0
    for (const dyes of rolls) {
      for (const d of nearest(dyes)) {
        if (d < 24) clumped++
        total++
      }
    }
    expect(clumped / total).toBeLessThan(0.1)
  })

  it('keeps the typical roll wide, not merely legal', () => {
    // The tightest pair in a roll, medianed over the rolls. A hard floor alone
    // would sit this right on top of the 19 degree floor; it is the score and
    // the arc stretching that pull it up to most of the ideal even spacing.
    const tightest = rolls.map((dyes) => Math.min(...nearest(dyes))).sort((a, b) => a - b)
    const ideal = 360 / SLIDE_COUNT
    expect(tightest[Math.floor(tightest.length / 2)] as number).toBeGreaterThan(ideal * 0.65)
  })
})

describe('the constraint and score functions themselves', () => {
  it('flags a palette with no hue separation', () => {
    const flat: Dye[] = Array.from({ length: 6 }, (_, i) => ({
      L: 0.82,
      C: 0.12,
      h: 40 + i * 2,
      d: 0.6,
    }))
    expect(paletteViolations(flat, null)).toContain('minGap')
    expect(paletteViolations(flat, null)).toContain('maxGap')
  })

  it('flags a set that goes grey wherever it crosses, not one that goes deep', () => {
    // Two low-chroma gels on opposing hues. Their one crossing is the whole
    // set's worth of crossings, so a set like this has nothing to show.
    const grey: Dye[] = [
      { L: 0.62, C: 0.04, h: 250, d: 0.95 },
      { L: 0.7, C: 0.04, h: 70, d: 0.95 },
    ]
    // The same opposition, carrying real colour. Opposed hues are no longer a
    // fault in themselves: under the pigment model they cross to a deep green,
    // and it was forbidding them that made every roll analogous.
    const rich: Dye[] = [
      { L: 0.62, C: 0.22, h: 250, d: 0.95 },
      { L: 0.8, C: 0.2, h: 70, d: 0.95 },
    ]
    expect(paletteViolations(grey, null)).toContain('mostlyGrey')
    expect(paletteViolations(rich, null)).not.toContain('mostlyGrey')
  })

  it('prefers the palette whose overlaps keep their colour', () => {
    const colourful: Dye[] = [
      { L: 0.9, C: 0.17, h: 100, d: 0.62 },
      { L: 0.8, C: 0.19, h: 55, d: 0.62 },
      { L: 0.86, C: 0.16, h: 200, d: 0.5 },
      { L: 0.82, C: 0.035, h: 320, d: 0.34 },
      { L: 0.9, C: 0.2, h: 280, d: 0.55 },
      { L: 0.74, C: 0.15, h: 150, d: 0.45 },
    ]
    const washedOut: Dye[] = colourful.map((d) => ({ ...d, C: 0.02 }))
    expect(scorePalette(colourful)).toBeGreaterThan(scorePalette(washedOut))
  })

  it('scores a spread set above the same set collapsed into one family', () => {
    // Same lightnesses, same chromas, same densities. The only difference is
    // that the second one is four blues and a stray, which is the set the
    // scorer used to prefer: near hues mix at high saturation, and saturation
    // was the heaviest term.
    const spread: Dye[] = [
      { L: 0.83, C: 0.18, h: 30, d: 0.86 },
      { L: 0.7, C: 0.2, h: 95, d: 0.9 },
      { L: 0.78, C: 0.16, h: 160, d: 0.8 },
      { L: 0.62, C: 0.22, h: 225, d: 0.92 },
      { L: 0.74, C: 0.19, h: 290, d: 0.84 },
    ]
    const clumped: Dye[] = [
      { L: 0.83, C: 0.18, h: 246, d: 0.86 },
      { L: 0.7, C: 0.2, h: 258, d: 0.9 },
      { L: 0.78, C: 0.16, h: 270, d: 0.8 },
      { L: 0.62, C: 0.22, h: 282, d: 0.92 },
      { L: 0.74, C: 0.19, h: 60, d: 0.84 },
    ]
    expect(scorePalette(spread)).toBeGreaterThan(scorePalette(clumped))
  })

  it('treats an empty palette as inert rather than an error', () => {
    expect(scorePalette([])).toBe(0)
    expect(paletteViolations([], null)).toEqual([])
  })
})

describe('cost', () => {
  it('rolls 200 palettes well inside the frame budget', () => {
    const rng = new Rng(12345)
    const t0 = performance.now()
    let previous: Dye[] | null = null
    for (let i = 0; i < 200; i++) {
      previous = generatePalette({ rng, count: 6, areaNorm: AREA, keep: NO_KEEP, previous })
    }
    const elapsed = performance.now() - t0
    expect(elapsed).toBeLessThan(2000)
  })
})
