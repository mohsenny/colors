import { describe, expect, it } from 'vitest'
import { DENSITY_MAX, SLIDE_COUNT } from '../core/constants'
import { filmLinear, linearToOklch } from '../core/oklab'
import { Rng } from '../core/rng'
import type { Dye } from '../core/types'
import type { Temperament } from './palette'
import {
  BANDS,
  NEUTRAL_C,
  TEMPERAMENTS,
  generatePalette,
  paletteViolations,
  pickTemperament,
  quietBudget,
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

/**
 * Sheets thinner than the temperament's own density floor. That used to be an
 * exact count of the quiet slots; since every roll also carries a field, which
 * is thin on most temperaments, it now runs one high whenever the field is.
 */
function thinSlots(dyes: Dye[], t: Temperament): number {
  return dyes.filter((d) => d.d < (t.d[0] as number)).length
}

/** The lightness the sheet actually shows, which is not `dye.L`. */
function filmL(dye: Dye): number {
  const [r, g, b] = filmLinear(dye)
  return linearToOklch(r, g, b).L
}

function arcDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/**
 * A roll and the temperament that produced it.
 *
 * Almost every assertion below had to become conditional on the temperament,
 * because that is the change: there is no longer one standard a roll can be
 * held to. The temperament is recoverable from the seed alone because it is
 * the roll's first RNG draw, so a fresh Rng on the same seed names the sitting
 * without the generator having to hand it back.
 */
interface Roll {
  dyes: Dye[]
  t: Temperament
}

function rollWith(
  seed: number,
  previous: Dye[] | null = null,
  keep: (Dye | null)[] = NO_KEEP,
  count = 6,
  areaNorm: number[] = AREA,
): Roll {
  const s = (seed * 2654435761) >>> 0
  return {
    t: pickTemperament(new Rng(s), count),
    dyes: generatePalette({ rng: new Rng(s), count, areaNorm, keep, previous }),
  }
}

/** The film chroma a temperament calls "carrying colour". */
function satFloor(t: Temperament): number {
  return t.limits.satC ?? 0.085
}

describe('generatePalette over 300 seeds', () => {
  const rolls: Roll[] = []
  let previous: Dye[] | null = null
  for (let s = 0; s < 300; s++) {
    const next = rollWith(s, previous)
    rolls.push(next)
    previous = next.dyes
  }
  const palettes = rolls.map((r) => r.dyes)

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

  it('spends exactly as many slots on quiet as its temperament asks for', () => {
    // This used to count slides thinner than DENSITY_MIN and compare that to a
    // function of the palette size. Neither half survives: the quiet count is
    // the temperament's own, and a chalk slide is thinner than DENSITY_MIN
    // without being quiet at all, so thinness is measured against the
    // temperament's own density floor instead of a global one.
    const gelSlots = new Set<number>()
    let withGel = 0
    for (const { dyes, t } of rolls) {
      const budget = quietBudget(6, NO_KEEP, t.quiet)
      // Thinner than the ladder floor no longer means "quiet". The field is
      // thin by construction on most temperaments, and it is a structural
      // sheet rather than a spent quiet slot, so it is allowed for and not
      // counted. The exact assertion moved to the gel, below.
      expect(thinSlots(dyes, t)).toBeGreaterThanOrEqual(budget)
      expect(thinSlots(dyes, t)).toBeLessThanOrEqual(budget + 1)
      // The gel is pinned to exactly NEUTRAL_C, which no drawn slide lands on.
      const gels = dyes.map((d, i) => [d, i] as const).filter(([d]) => d.C === NEUTRAL_C)
      expect(gels).toHaveLength(budget >= 1 ? 1 : 0)
      if (gels.length === 1) {
        // It lands in the middle of the size ladder: slots 2 to 4 for this
        // AREA, never on the largest or smallest.
        const slot = (gels[0] as readonly [Dye, number])[1]
        expect(slot).toBeGreaterThanOrEqual(2)
        expect(slot).toBeLessThanOrEqual(4)
        gelSlots.add(slot)
        withGel++
      }
      // Something in the set carries colour BY ITS OWN STANDARD. The old fixed
      // 0.085 threshold is chalk's entire ladder, so asserting it globally
      // would be asserting that chalk must not exist.
      expect(dyes.filter((d) => effChroma(d) >= satFloor(t)).length).toBeGreaterThanOrEqual(1)
    }
    // And the gel moves. The same slot going grey on every reroll is the
    // predictable symmetry the brief rules out.
    expect(withGel).toBeGreaterThan(50)
    expect(gelSlots.size).toBe(3)
  })

  it('keeps every slide perceptually distinct from its nearest neighbour', () => {
    // The complaint this answers was "four shades of blue/purple", and the hue
    // rules could not see it: they measure degrees, and a degree of hue at low
    // chroma is worth nothing. So this measures the film colours in OKLab, with
    // lightness at half weight so a staircase of one hue cannot pass.
    const AREAS = Array.from({ length: SLIDE_COUNT }, (_, i) => 1 - (i * 0.76) / SLIDE_COUNT)
    const nearest: number[] = []
    const everyNearest: number[] = []
    for (let s = 0; s < 300; s++) {
      const { dyes, t } = rollWith(
        s * 31 + 7,
        null,
        Array.from({ length: SLIDE_COUNT }, () => null),
        SLIDE_COUNT,
        AREAS,
      )
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
      everyNearest.push(worst)
      // The numbers below were measured on the lightbox character and belong
      // to it. A chalk roll's median nearest pair is 0.017 and a siren roll
      // holds two or three deliberately quiet colours: those are the material
      // rather than a fault, and each is held to its own floor by the
      // constraint itself. A roll that found no legal candidate is the least
      // bad of 56 rejects and promises only the universal floor. Everything
      // excluded here is still graded by `everyNearest`.
      const legal = paletteViolations(dyes, null, t).length === 0
      if (legal && t.name === 'lightbox') nearest.push(worst)
    }
    nearest.sort((a, b) => a - b)
    everyNearest.sort((a, b) => a - b)
    // The floor holds outright, and the tenth percentile sits well clear of it:
    // the scorer is supposed to pull the whole distribution up, not just clip
    // the tail. Before this existed the tenth percentile was 0.047 and a sixth
    // of all rolls contained a pair under 0.05.
    expect(nearest[0] as number).toBeGreaterThan(0.04)
    expect(nearest[Math.floor(nearest.length * 0.1)] as number).toBeGreaterThan(0.055)
    // And no temperament may opt out of two slides being two slides.
    expect(everyNearest[0] as number).toBeGreaterThan(0.006)
  })

  it('satisfies the hard constraints of its own temperament in at least 85% of rolls', () => {
    // Graded against the temperament that produced the roll. Against a single
    // fixed rubric this test measures the wrong thing twice over: an ink set
    // fails chalk's standard and a chalk set fails ink's, and both are good.
    let clean = 0
    let prev: Dye[] | null = null
    for (const { dyes, t } of rolls) {
      if (paletteViolations(dyes, prev, t).length === 0) clean++
      prev = dyes
    }
    expect(clean / rolls.length).toBeGreaterThanOrEqual(0.85)
  })

  it('produces a novel palette every time', () => {
    // The per-roll floor is the loosest temperament's novelty rule rather than
    // the old flat 20 degrees: a study leans on lightness instead of hue, so
    // demanding a big hue move from it would be demanding it stop being a
    // study. The median still has to stay wide, which is the real claim.
    const shifts: number[] = []
    for (let i = 1; i < palettes.length; i++) {
      const a = palettes[i - 1] as Dye[]
      const b = palettes[i] as Dye[]
      expect(b).not.toEqual(a)
      let shift = 0
      for (let s = 0; s < 6; s++) shift += arcDist((a[s] as Dye).h, (b[s] as Dye).h)
      shifts.push(shift / 6)
      expect(shift / 6).toBeGreaterThan(5)
    }
    shifts.sort((x, y) => x - y)
    expect(shifts[Math.floor(shifts.length / 2)] as number).toBeGreaterThan(40)
  })

  it('spends real chroma rather than returning six near-neutrals', () => {
    for (const { dyes, t } of rolls) expect(scorePalette(dyes, t)).toBeGreaterThan(0.5)
  })

  it('varies the sitting itself, not only the key it is played in', () => {
    // The measurement this whole change answers. Before temperaments the
    // between-roll spread of mean film lightness was 0.016 against a
    // within-roll spread of 0.071: every roll was the same chord in a
    // different key. The temperament is drawn once and shared by every sheet,
    // which is the only structure that can move the first number.
    const means = palettes.map((dyes) => {
      const ls = dyes.map((d) => {
        const [r, g, b] = filmLinear(d)
        return linearToOklch(r, g, b).L
      })
      return ls.reduce((a, b) => a + b, 0) / ls.length
    })
    const mean = means.reduce((a, b) => a + b, 0) / means.length
    const sd = Math.sqrt(means.reduce((a, b) => a + (b - mean) ** 2, 0) / means.length)
    expect(sd).toBeGreaterThan(0.04)
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
    const base = generatePalette({
      rng: new Rng(777),
      count: 6,
      areaNorm: AREA,
      keep: NO_KEEP,
      previous: null,
    })
    for (const freeSlot of [0, 1, 2, 3, 4, 5]) {
      const keep = base.map((d, i) => (i === freeSlot ? null : d))
      const seen = new Set<string>()
      for (let r = 0; r < 12; r++) {
        const { dyes, t } = rollWith(freeSlot * 97 + r, base, keep)
        const dye = dyes[freeSlot] as Dye
        // Neither of the two quiet roles: not the gel, which is pinned to
        // exactly NEUTRAL_C, and not the thinned wash, which is the only
        // slide that can sit below its own temperament's density floor.
        expect(dye.C).not.toBe(NEUTRAL_C)
        expect(dye.d).toBeGreaterThanOrEqual(t.d[0])
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
    const AREAS = [1, 0.7, 0.45, 0.3]
    for (let s = 0; s < 120; s++) {
      const { dyes, t } = rollWith(s * 13 + 3, null, [], 4, AREAS)
      expect(dyes).toHaveLength(4)
      // One quiet slot at most on a phone whatever the temperament asks for:
      // two of four left half the screen colourless.
      const budget = quietBudget(4, [], t.quiet)
      expect(budget).toBeLessThanOrEqual(1)
      expect(thinSlots(dyes, t)).toBeGreaterThanOrEqual(budget)
      expect(thinSlots(dyes, t)).toBeLessThanOrEqual(budget + 1)
      if (paletteViolations(dyes, null, t).length === 0) {
        expect(dyes.filter((d) => effChroma(d) >= satFloor(t)).length).toBeGreaterThanOrEqual(1)
        clean++
      }
    }
    expect(clean / 120).toBeGreaterThanOrEqual(0.85)
  })

  it('still finds a legal palette at two and three slots', () => {
    // A two or three slide palette has no slot to spare on a quiet one, so every
    // slide has to carry colour and no gel is required, whatever the
    // temperament would have liked.
    for (const count of [2, 3]) {
      let clean = 0
      for (let s = 0; s < 200; s++) {
        const { dyes, t } = rollWith(s * 29 + count, null, [], count, AREA.slice(0, count))
        expect(dyes).toHaveLength(count)
        expect(quietBudget(count, [], t.quiet)).toBe(0)
        expect(thinSlots(dyes, t)).toBeLessThanOrEqual(1)
        // Colour is asserted on the legal rolls only. A roll that found no
        // legal candidate returns the least bad of 56 rejects, and demanding
        // that a reject still meet the rule it was rejected for is asking the
        // fallback to be unnecessary.
        if (paletteViolations(dyes, null, t).length === 0) {
          expect(dyes.filter((d) => effChroma(d) >= satFloor(t)).length).toBeGreaterThanOrEqual(1)
          clean++
        }
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
  // Only the temperaments that leave the hue rules alone. A study is one hue
  // family by construction and chalk asks for a tighter one, so both would
  // fail a test whose subject is "the set should not be four shades of one
  // hue" while being exactly the sets that should. What the test still has to
  // catch, an ordinary roll quietly collapsing into a family, lives here.
  const rolls: Dye[][] = []
  for (let s = 0; s < 400; s++) {
    const r = rollWith(s * 13 + 11, null, [], SLIDE_COUNT, AREAS)
    if (r.t.limits.minGap === undefined) rolls.push(r.dyes)
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

describe('temperaments', () => {
  /** Mean lightness of the light coming off the set. */
  function meanFilmL(dyes: Dye[]): number {
    const ls = dyes.map((d) => {
      const [r, g, b] = filmLinear(d)
      return linearToOklch(r, g, b).L
    })
    return ls.reduce((a, b) => a + b, 0) / ls.length
  }

  const sample: Roll[] = []
  for (let s = 0; s < 700; s++) sample.push(rollWith(s * 7 + 1))

  it('can all come up', () => {
    // The most likely bug in this change is a temperament that can never be
    // selected: nothing else in the code would notice, and the instrument
    // would quietly keep the character it already had.
    const counts = new Map<string, number>()
    for (const { t } of sample) counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
    const missing = TEMPERAMENTS.filter((t) => (counts.get(t.name) ?? 0) < 20).map((t) => t.name)
    expect(missing).toEqual([])
    // And each one comes up at roughly its declared weight, so a table edit
    // means what it says. Within 5 points of the weight over 700 rolls.
    const off = TEMPERAMENTS.filter(
      (t) => Math.abs((counts.get(t.name) ?? 0) / sample.length - t.weight) > 0.05,
    ).map((t) => t.name)
    expect(off).toEqual([])
  })

  it('can all come up at the slide count the app actually uses', () => {
    // SLIDE_COUNT is 8 and ink asks for four to six, so a count preference
    // that excluded rather than demoted would have made a seventh of the
    // table unreachable in the real instrument while every test at six slides
    // went on passing.
    const counts = new Map<string, number>()
    for (let s = 0; s < 600; s++) {
      const t = pickTemperament(new Rng((s * 2654435761 + 5) >>> 0), SLIDE_COUNT)
      counts.set(t.name, (counts.get(t.name) ?? 0) + 1)
    }
    const missing = TEMPERAMENTS.filter((t) => (counts.get(t.name) ?? 0) < 10).map((t) => t.name)
    expect(missing).toEqual([])
  })

  it('can all produce a palette that is legal by their own standard', () => {
    // The second most likely bug: a temperament whose ladders and whose limits
    // were written by hand and disagree with each other, so every candidate
    // fails and the roll falls through to the least-bad of 56 rejects.
    const failing: string[] = []
    for (const t of TEMPERAMENTS) {
      const mine = sample.filter((r) => r.t.name === t.name)
      const clean = mine.filter((r) => paletteViolations(r.dyes, null, r.t).length === 0).length
      if (clean / mine.length < 0.6) failing.push(`${t.name} ${clean}/${mine.length}`)
    }
    expect(failing).toEqual([])
  })

  it('keeps each sitting inside its own lightness and density ladder', () => {
    // A temperament that leaks is a temperament that does not exist. The
    // tolerance is L_JITTER plus the area thinning, nothing more.
    //
    // The anchor and the field sit OUTSIDE the ladder on purpose: that is what
    // they are for, and a set confined to the ladder is the flat set this rule
    // used to guarantee. Which sheet is which cannot be recovered from the
    // output (an ordinary sheet on the top rung sits inside the field's
    // tolerance), so this asserts the invariant rather than the identity: at
    // most two sheets leave the ladder, and any that does is inside a declared
    // structural window.
    const WINDOW = 0.07
    for (const { dyes, t } of sample) {
      const lo = (t.l[0] as number) - 0.03
      const hi = (t.l[t.l.length - 1] as number) + 0.03
      const dHi = Math.min(Math.max(t.d[1], t.anchor[1]), BANDS.dMax)
      const outside = dyes.filter((d) => d.L < lo || d.L > hi)
      expect(outside.length).toBeLessThanOrEqual(2)
      for (const d of outside) {
        const structural =
          Math.abs(d.L - t.anchor[0]) <= WINDOW || Math.abs(d.L - t.field[0]) <= WINDOW
        expect(structural).toBe(true)
      }
      for (const d of dyes) expect(d.d).toBeLessThanOrEqual(dHi + 1e-9)
    }
  })

  it('gives every sitting something to stand on and something to sit in', () => {
    // The rule the flat-set complaint turned into. Measured on the FILM
    // colours, because the dye ladder is close to a no-op at low density: at
    // d 0.30 the whole range from L 0.25 to L 0.90 renders inside film L 0.89
    // to 0.97, which is how a chalk roll used to span 0.037 and look like one
    // colour eight times.
    const thin: string[] = []
    for (const t of TEMPERAMENTS) {
      const mine = sample.filter((r) => r.t.name === t.name)
      if (mine.length < 8) continue
      const ranges = mine
        .map((r) => {
          const Ls = r.dyes.map(filmL)
          return Math.max(...Ls) - Math.min(...Ls)
        })
        .sort((a, b) => a - b)
      const med = ranges[Math.floor(ranges.length / 2)] as number
      if (med < 0.3) thin.push(`${t.name} ${med.toFixed(3)}`)
    }
    expect(thin).toEqual([])
  })

  it('makes the sittings differ from each other, which is the whole point', () => {
    const byName = new Map<string, number[]>()
    for (const { dyes, t } of sample) {
      const list = byName.get(t.name) ?? []
      list.push(meanFilmL(dyes))
      byName.set(t.name, list)
    }
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length
    // Chalk against ink is the widest pair in the table, and if these two land
    // in the same place the ladders are not reaching the glass.
    expect(mean(byName.get('chalk') as number[])).toBeGreaterThan(
      mean(byName.get('ink') as number[]) + 0.2,
    )
  })

  it('does not tilt the hue histogram', () => {
    // Hue uniformity is the one axis that already worked, so no temperament
    // carries a hue window or a warm/cool bias and this is the guard that says
    // so. 12 bins of 30 degrees over every slide of every roll, each within a
    // quarter of flat.
    const bins = new Array<number>(12).fill(0)
    let total = 0
    for (const { dyes } of sample) {
      for (const d of dyes) {
        const bin = Math.min(11, Math.floor((((d.h % 360) + 360) % 360) / 30))
        bins[bin] = (bins[bin] as number) + 1
        total++
      }
    }
    const flat = total / 12
    for (const b of bins) {
      expect(b).toBeGreaterThan(flat * 0.75)
      expect(b).toBeLessThan(flat * 1.25)
    }
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
