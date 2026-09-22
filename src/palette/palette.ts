/**
 * The palette generator.
 *
 * The dyes have to work as a set *after* the motion has crossed them in every
 * combination, so the generator does not judge the seven swatches: it judges
 * their overlaps. Structure comes from a strategy (a hue skeleton) plus three
 * fixed slot roles; the hard constraints throw away the combinations that fail;
 * the score ranks what survives; a small lottery keeps two consecutive rolls
 * from feeling like the same palette twice.
 *
 * What counts as failure changed when the mixing model did. Under `multiply`
 * every cross-family pair collapsed to sludge, so the constraints had to forbid
 * them, so the rolls came back analogous and every overlap read as a darker
 * version of the slide on top. Pigment mixing does not have that failure, and
 * it cannot go dark at all now, so the old dark and mud rules are gone. Two
 * things replace them: overlaps should mostly carry colour, and they should
 * land on hues the set does not already contain, which is the only reason to
 * cross two slides rather than put them side by side.
 *
 * Single-slot properties (L band, C band, clip) are judged on the DYE.
 * Everything involving more than one slide goes through `mixSummary`, the same
 * model the painter uses.
 */

import { DENSITY_MAX, DENSITY_MIN } from '../core/constants'
import { decode, encode, gamutMap, linearToOklch, maxChroma } from '../core/oklab'
import { filmStat, filmToRyb, mixSummary } from '../core/pigment'
import type { Ryb, SheetStat } from '../core/pigment'
import type { Rng } from '../core/rng'
import type { Dye } from '../core/types'

export interface PaletteRequest {
  rng: Rng
  /** 4 on small viewports, 6 normally. */
  count: number
  /** Per slot, slide area / largest slide area, 0..1. */
  areaNorm: number[]
  /** Non-null entries are locked and come back unchanged. */
  keep: (Dye | null)[]
  /** The palette being replaced, for the novelty constraint. */
  previous: Dye[] | null
}

/** The bands every generated dye lands in, after roles and clamping. */
export const BANDS = {
  lMin: 0.46,
  lMax: 0.9,
  cMax: 0.33,
  /** A wash is `d * 0.7` and the neutral gel is a flat 0.55, so both sit below DENSITY_MIN. */
  dMin: 0.34,
  dMax: DENSITY_MAX,
} as const

// The film model loses roughly half the dye chroma on its way to the surface, so
// these bands look implausibly strong on paper and land correctly on the glass.
const L_BANDS = [0.56, 0.70, 0.83] as const
/**
 * Target dye chroma, absolute. This was a fraction of what sRGB could reach at
 * the slot's lightness, which sounds right and is not: at L 0.82 a green reaches
 * C 0.26 and an orange C 0.10, so the same fraction buys a vivid green and a dead
 * orange, and four slides in six came out as tints. Ask for an absolute chroma
 * and let the LIGHTNESS follow the hue instead. That is what dyed film does
 * anyway: a deep orange gel is darker than a deep yellow one, because dark is the
 * only place an orange that saturated exists.
 */
const C_BANDS = [0.13, 0.19, 0.25, 0.31] as const
const L_JITTER = 0.025
const C_JITTER = 0.018
/**
 * Hue jitter and the overall stretch of a skeleton. Both were wider, and
 * between them they could close a 28 degree designed gap down to 14: the
 * skeletons said "three hue families" and the roll showed four shades of one
 * blue. They are narrow now because the structure has to survive the noise.
 */
const H_JITTER = 5
const OFFSET_SCALE = [0.92, 1.1] as const

/**
 * Two hues closer than this read as the same colour twice rather than as two
 * colours. Used by the scorer, a little above the hard floor so that the last
 * few degrees cost something before they become illegal.
 */
const CLUMP_DEG = 26

/**
 * Perceptual separation, the same question `CLUMP_DEG` asks in degrees.
 *
 * `SEP_FLOOR` is the closest two slides may end up in OKLab and `SEP_GOOD` the
 * distance at which the scorer stops paying for more. Measured, not guessed: on
 * 400 rolls the nearest pair was 0.063 apart at the median and 0.047 at the
 * tenth percentile, and the tenth percentile is where the complaint lives. The
 * floor sits just under it so the genuinely indistinguishable rolls are thrown
 * away, and the score term pulls the median up toward what the good rolls
 * already reach.
 *
 * `SEP_L_WEIGHT` is why lightness only half counts: see `sepNear`.
 */
const SEP_FLOOR = 0.044
const SEP_GOOD = 0.082
const SEP_L_WEIGHT = 0.5

/**
 * The gel's dye chroma. Exported because the tests identify the gel by it, and
 * a test that restates the number instead of reading it stops being a test of
 * the generator the moment the number moves: this one was written against 0.045
 * and silently found nothing when the bands were lifted.
 *
 * 0.085 on the dye is about 0.032 on the glass. The old 0.045 landed at 0.021,
 * which is not a quiet colour, it is grey: at that chroma the hue the skeleton
 * worked to place is simply not visible, so the gel and the wash read as the
 * same dusty nothing whatever the wheel said about them.
 */
export const NEUTRAL_C = 0.085
const NEUTRAL_D = 0.55
const WASH_D = 0.7
const WASH_C = 1.3
const ACCENT_C = 1.2

const CANDIDATES = 56
const RELAX = 0.15
const LOTTERY = [0.27, 0.22, 0.18, 0.14, 0.11, 0.08] as const

/**
 * Hue skeletons, written as the ARCS the family occupies rather than as a list
 * of angles. A strategy says "two families 84 degrees wide, opposed"; how many
 * slides land in each and how far apart they sit is then a consequence of the
 * slide count, not a separate number that has to be re-tuned every time the
 * count changes.
 *
 * It used to be a list of angles per count, resampled for anything else, and
 * that is what produced the complaint this rewrite answers: seven slides
 * resampled from a six-angle skeleton put three of them inside 33 degrees, so
 * a third of the set was one hue family wearing three hats. Arcs make the
 * spacing a property of the family, and `step` makes it a property that
 * survives a change of slide count: see `fitArcs`.
 *
 * `maxGap` is the largest empty arc the family may leave, `minGap` the closest
 * two of its hues may end up after jitter, `step` the spacing inside a family
 * it will widen itself to keep. The concentrated families (one long sweep, one
 * tight cluster) are the exceptions on all three, and they are rare on purpose.
 */
interface Strategy {
  readonly name: string
  readonly weight: number
  readonly maxGap: number
  readonly minGap: number
  readonly step: number
  /** `[start, span]` per hue family, degrees from the roll's base hue. */
  readonly arcs: readonly (readonly [number, number])[]
}

const STRATEGIES: readonly Strategy[] = [
  { name: 'spread', weight: 0.22, maxGap: 150, minGap: 19, step: 31, arcs: [[0, 300]] },
  { name: 'warm-cool', weight: 0.18, maxGap: 150, minGap: 19, step: 31, arcs: [[0, 84], [168, 84]] },
  { name: 'triad', weight: 0.16, maxGap: 150, minGap: 19, step: 31, arcs: [[0, 56], [120, 56], [240, 56]] },
  { name: 'comp-accent', weight: 0.15, maxGap: 150, minGap: 19, step: 31, arcs: [[0, 78], [150, 52], [265, 0]] },
  { name: 'sweep-foil', weight: 0.13, maxGap: 215, minGap: 19, step: 31, arcs: [[0, 170], [250, 0]] },
  { name: 'split-comp', weight: 0.11, maxGap: 150, minGap: 19, step: 31, arcs: [[0, 56], [140, 46], [214, 46]] },
  { name: 'mono-foil', weight: 0.05, maxGap: 215, minGap: 12, step: 13, arcs: [[0, 96], [230, 0]] },
]

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

function wrap360(h: number): number {
  return ((h % 360) + 360) % 360
}

function arcDist(a: number, b: number): number {
  const d = Math.abs(wrap360(a) - wrap360(b))
  return d > 180 ? 360 - d : d
}

/**
 * How many slides each arc receives. Every arc gets one, the remainder goes by
 * width (largest remainder), and a count below the number of arcs drops the
 * narrowest ones rather than squeezing everything in: at three slides a triad
 * is three slides, not two crowded plus one.
 */
function allocate(spans: readonly number[], count: number): number[] {
  const n = spans.length
  const take = spans.map(() => 0)
  if (count <= n) {
    const widest = [...spans.keys()].sort((a, b) => (spans[b] as number) - (spans[a] as number))
    for (let i = 0; i < count; i++) take[widest[i] as number] = 1
    return take
  }
  const total = spans.reduce((a, b) => a + b, 0)
  const extra = count - n
  const want = spans.map((s) => (total > 0 ? (extra * s) / total : extra / n))
  for (let i = 0; i < n; i++) take[i] = 1 + Math.floor(want[i] as number)
  const order = [...want.keys()].sort(
    (a, b) => ((want[b] as number) % 1) - ((want[a] as number) % 1),
  )
  let used = take.reduce((a, b) => a + b, 0)
  for (let i = 0; used < count; i++, used++) {
    const slot = order[i % n] as number
    take[slot] = (take[slot] as number) + 1
  }
  return take
}

/**
 * The skeleton, widened to hold the slides it was actually given.
 *
 * An arc was drawn at a width that spaced seven slides well. Add two and every
 * family holds one more at the same width, which is tighter spacing: at nine
 * slides `warm-cool` packed five into 84 degrees, 21 apart, and five shades of
 * one warm is precisely the fault the arcs exist to prevent. So a family
 * STRETCHES to `step` per slide and the other families slide outward to make
 * room. The designed gaps BETWEEN families absorb the growth first, because a
 * family reading as a family matters more than the exact distance to the next
 * one; only when the circle is genuinely full does everything scale down and
 * the `minGap` floor take over.
 *
 * `mono-foil` keeps its character through the same rule rather than an
 * exception to it: its step is 13, so its one tight cluster stays tight.
 */
function fitArcs(strategy: Strategy, take: readonly number[]): [number, number][] {
  const arcs = strategy.arcs
  const n = arcs.length
  const spans = arcs.map((a, i) =>
    Math.max(a[1], Math.max(0, (take[i] as number) - 1) * strategy.step),
  )
  // n gaps: one after each family, the last one closing the circle.
  const gaps: number[] = []
  for (let i = 0; i < n; i++) {
    const end = (arcs[i] as readonly [number, number])[0] + (arcs[i] as readonly [number, number])[1]
    const next = i + 1 < n ? (arcs[i + 1] as readonly [number, number])[0] : 360
    gaps.push(Math.max(0, next - end))
  }

  const spanSum = spans.reduce((a, b) => a + b, 0)
  const gapSum = gaps.reduce((a, b) => a + b, 0)
  // Squeeze the gaps between families to at most half their designed width...
  const g = gapSum > 0 ? clamp((360 - spanSum) / gapSum, 0.5, 1) : 1
  // ...and only then the families themselves.
  const total = spanSum + gapSum * g
  const s = total > 360 ? 360 / total : 1

  const out: [number, number][] = []
  let at = 0
  for (let i = 0; i < n; i++) {
    const span = (spans[i] as number) * s
    out.push([at, span])
    at += span + (gaps[i] as number) * g * s
  }
  return out
}

function offsetsFor(strategy: Strategy, count: number): number[] {
  if (count <= 0) return []
  if (count === 1) return [0]
  const take = allocate(
    strategy.arcs.map((a) => a[1]),
    count,
  )
  const fitted = fitArcs(strategy, take)
  const out: number[] = []
  for (let i = 0; i < fitted.length; i++) {
    const [start, span] = fitted[i] as [number, number]
    const k = take[i] as number
    if (k <= 0) continue
    // A lone slide sits in the middle of its arc, so an arc that loses its
    // neighbours does not also drift to one edge of the family.
    if (k === 1) {
      out.push(start + span / 2)
      continue
    }
    for (let j = 0; j < k; j++) out.push(start + (span * j) / (k - 1))
  }
  return out
}

function pickStrategy(rng: Rng): Strategy {
  let r = rng.next()
  for (const s of STRATEGIES) {
    r -= s.weight
    if (r <= 0) return s
  }
  return STRATEGIES[0] as Strategy
}

// --- effective colour --------------------------------------------------------

interface Effective {
  /** Encoded sRGB 0..1 of the film colour: what the slide actually paints. */
  enc: [number, number, number]
  clip: number
}

function effective(dye: Dye): Effective {
  const g = gamutMap(dye.L, dye.C, dye.h)
  const d = clamp(dye.d, 0, 1)
  const lin: [number, number, number] = [1 - d * (1 - g.r), 1 - d * (1 - g.g), 1 - d * (1 - g.b)]
  return { enc: [encode(lin[0]), encode(lin[1]), encode(lin[2])], clip: g.clip }
}

function lchOfEncoded(enc: readonly number[]): { L: number; C: number; h: number } {
  return linearToOklch(decode(enc[0] as number), decode(enc[1] as number), decode(enc[2] as number))
}

interface Analysis {
  dyes: Dye[]
  eff: Effective[]
  /**
   * Per pair, in index order (0,1), (0,2)... `pairSat` is the mix's saturation
   * as a fraction of what is available at its lightness, which is the unit the
   * mixing model works in; `pairNew` is how far the mix's hue lands from the
   * nearest hue already in the set, which is the whole reason to overlap two
   * slides rather than look at them side by side.
   */
  pairSat: number[]
  pairNew: number[]
  /** Least saturated triple, same units. Triples are rarer, so they only bound. */
  worstTripleSat: number
  clipSum: number
  /** Chroma of each slide's own film colour, i.e. what a single slide shows. */
  effC: number[]
  /**
   * Per slide, the distance to its nearest neighbour in OKLab, measured on the
   * FILM colours, with lightness at half weight.
   *
   * `minGap` is degrees of hue, and a degree is not a distance. At chroma 0.20
   * a 26 degree gap is a clear step from one colour to another; at chroma 0.06
   * the same gap is two greys. So a set could satisfy every hue rule in this
   * file and still come back as four shades of one blue, because the spacing
   * was legal and invisible. This is the same question asked in the units the
   * eye uses.
   *
   * Lightness counts for half. A pale blue over a deep blue genuinely is two
   * colours and the brief asks for that contrast, but at full weight lightness
   * alone would buy a passing score for a set that is one hue on a staircase.
   */
  sepNear: number[]
  minGap: number
  maxGap: number
  lRange: number
  lStdev: number
}

function analyse(dyes: Dye[]): Analysis {
  const n = dyes.length
  const eff = dyes.map(effective)
  // What the painter will actually do with these, asked once per dye.
  const films = eff.map(
    (e) =>
      [decode(e.enc[0]), decode(e.enc[1]), decode(e.enc[2])] as [number, number, number],
  )
  const rybs = films.map(filmToRyb)
  const stats = films.map(filmStat)
  const hues = dyes.map((d) => wrap360(d.h))

  /** How far a mixed hue is from every hue already on the table. */
  const novelty = (h: number): number => {
    let nearest = 180
    for (const own of hues) nearest = Math.min(nearest, arcDist(h, own))
    return nearest
  }

  const pairSat: number[] = []
  const pairNew: number[] = []
  let worstTripleSat = 1
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const pair = mixSummary(
        [rybs[i] as Ryb, rybs[j] as Ryb],
        [stats[i] as SheetStat, stats[j] as SheetStat],
      )
      pairSat.push(pair.sat)
      pairNew.push(novelty(pair.h))
      for (let k = j + 1; k < n; k++) {
        const triple = mixSummary(
          [rybs[i] as Ryb, rybs[j] as Ryb, rybs[k] as Ryb],
          [stats[i] as SheetStat, stats[j] as SheetStat, stats[k] as SheetStat],
        )
        worstTripleSat = Math.min(worstTripleSat, triple.sat)
      }
    }
  }

  const sorted = [...hues].sort((a, b) => a - b)
  let minGap = 360
  let maxGap = 0
  if (n >= 2) {
    for (let i = 0; i < n; i++) {
      const next = i === n - 1 ? (sorted[0] as number) + 360 : (sorted[i + 1] as number)
      const gap = next - (sorted[i] as number)
      minGap = Math.min(minGap, gap)
      maxGap = Math.max(maxGap, gap)
    }
  } else {
    minGap = 360
    maxGap = 0
  }

  // The film colours in OKLab, so "how different are these two" is one distance
  // rather than three separate rules about hue, chroma and lightness.
  const lch = eff.map((e) => lchOfEncoded(e.enc))
  const coords = lch.map((o) => {
    const rad = (o.h * Math.PI) / 180
    return [SEP_L_WEIGHT * o.L, o.C * Math.cos(rad), o.C * Math.sin(rad)] as const
  })
  const sepNear = coords.map((p, i) => {
    let best = 1
    for (let j = 0; j < n; j++) {
      if (j === i) continue
      const q = coords[j] as readonly [number, number, number]
      best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]))
    }
    return best
  })

  const Ls = dyes.map((d) => d.L)
  const mean = Ls.reduce((a, b) => a + b, 0) / Math.max(1, n)
  const variance = Ls.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n)

  return {
    dyes,
    eff,
    pairSat,
    pairNew,
    worstTripleSat,
    clipSum: eff.reduce((a, e) => a + e.clip, 0),
    effC: lch.map((o) => o.C),
    sepNear,
    minGap,
    maxGap,
    lRange: Math.max(...Ls) - Math.min(...Ls),
    lStdev: Math.sqrt(variance),
  }
}

// --- hard constraints (7.5) ---------------------------------------------------

interface Limits {
  minGap: number
  maxGap: number
  lRangeLo: number
  lRangeHi: number
  lStdevLo: number
  lStdevHi: number
  neutralC: number
  satC: number
  flatC: number
  greySat: number
  greyShare: number
  tripleSat: number
  clipSum: number
  novelty: number
  sep: number
}

function limitsFor(maxGap: number, minGap: number, relax: number): Limits {
  const lo = 1 - relax
  const hi = 1 + relax
  return {
    minGap: minGap * lo,
    maxGap: maxGap * hi,
    lRangeLo: 0.1 * lo,
    lRangeHi: 0.4 * hi,
    lStdevLo: 0.038 * lo,
    lStdevHi: 0.12 * hi,
    // Judged on the film colour, not the dye: a dye number is not comparable
    // across hues, and what the eye grades is the light coming off the slide.
    neutralC: 0.045 * hi,
    satC: 0.085 * lo,
    flatC: 0.026 * lo,
    // Overlaps can no longer go dark, so there is nothing left to guard
    // against there: what can still go wrong is that they all go GREY, which
    // happens when every pair in the set is a complementary one. A few grey
    // crossings are worth having, so this bounds the share of them rather than
    // forbidding any. See `mixSummary`: saturation is a fraction, not a chroma.
    greySat: 0.2 * lo,
    greyShare: 0.45 * hi,
    tripleSat: 0.05 * lo,
    clipSum: 0.1 * hi,
    novelty: 24 * lo,
    sep: SEP_FLOOR * lo,
  }
}

function noveltyDeg(dyes: Dye[], previous: Dye[] | null, keep: (Dye | null)[]): number {
  if (!previous || previous.length === 0) return 360
  let total = 0
  let n = 0
  for (let i = 0; i < dyes.length; i++) {
    // A locked slot is unchanged by definition; asking it to be novel is a contradiction.
    if (keep[i]) continue
    const prev = previous[i]
    if (!prev) continue
    total += arcDist((dyes[i] as Dye).h, prev.h)
    n++
  }
  return n === 0 ? 360 : total / n
}

function violationsOf(
  a: Analysis,
  limits: Limits,
  previous: Dye[] | null,
  keep: (Dye | null)[],
): string[] {
  const out: string[] = []
  const n = a.dyes.length

  if (n >= 2) {
    if (a.minGap < limits.minGap) out.push('minGap')
    if (a.maxGap > limits.maxGap) out.push('maxGap')
    // The same fault in the units the eye uses: see `sepNear`.
    if (Math.min(...a.sepNear) < limits.sep) out.push('tooClose')
  }
  if (n >= 2) {
    if (a.lRange < limits.lRangeLo) out.push('lRangeLow')
    if (a.lRange > limits.lRangeHi) out.push('lRangeHigh')
    if (a.lStdev < limits.lStdevLo) out.push('lStdevLow')
    if (a.lStdev > limits.lStdevHi) out.push('lStdevHigh')
  }
  // Only palettes big enough to spend a slot on calm are required to have one,
  // and only when the pins left a slot to spend. Asking for a gel that
  // chooseRoles was never going to assign made every candidate report a
  // violation, so the roll always fell through to the least-bad fallback.
  const quiet = quietBudget(n, keep)
  if (quiet >= 1 && Math.min(...a.effC) > limits.neutralC) out.push('noNeutral')
  // Every slide that is not deliberately quiet should carry colour, less one
  // slot of slack so a single unlucky hue does not void an otherwise good roll.
  const satNeeded = Math.max(1, n - quiet - 1)
  if (a.effC.filter((c) => c >= limits.satC).length < satNeeded) out.push('tooFewSaturated')
  // Six slides at the same saturation is a named failure mode, not a style.
  if (n >= 4 && stdev(a.effC) < limits.flatC) out.push('chromaFlat')

  const pairs = a.pairSat.length
  if (pairs > 0) {
    const grey = a.pairSat.filter((s) => s < limits.greySat).length
    if (grey / pairs > limits.greyShare) out.push('mostlyGrey')
  }
  if (n >= 3 && a.worstTripleSat < limits.tripleSat) out.push('tripleGrey')
  if (a.clipSum > limits.clipSum) out.push('clip')
  if (noveltyDeg(a.dyes, previous, keep) < limits.novelty) out.push('novelty')

  return out
}

/** Spec 7.5. Empty means the palette is legal. */
export function paletteViolations(dyes: Dye[], previous: Dye[] | null): string[] {
  if (dyes.length === 0) return []
  // Without the generating strategy the only defensible gap bounds are the
  // loose ones: a deliberate cluster is legal, it is just rare.
  return violationsOf(analyse(dyes), limitsFor(215, 12, 0), previous, dyes.map(() => null))
}

// --- score (7.6) ---------------------------------------------------------------

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length)
}

function scoreOf(a: Analysis): number {
  const n = a.dyes.length
  if (n === 0) return 0
  const pairs = a.pairSat.length

  const meanPairSat = pairs === 0 ? 0 : a.pairSat.reduce((x, y) => x + y, 0) / pairs
  const worstPairSat = pairs === 0 ? 0 : Math.min(...a.pairSat)
  // The single best crossing is what people point at, so it is scored directly
  // rather than being averaged away by the twenty quiet ones.
  const bestPairSat = pairs === 0 ? 0 : Math.max(...a.pairSat)

  // The payoff of the whole instrument: crossing two slides shows a colour
  // that is not on either of them. A set whose overlaps land back on hues the
  // set already has is a set with nothing to discover, however pretty it is.
  const meanNew = pairs === 0 ? 0 : a.pairNew.reduce((x, y) => x + y, 0) / pairs
  const discovery = clamp(meanNew / 34, 0, 1)

  // How much of the set is actually carrying colour. Without this the scorer
  // happily picks six balanced tints, which is the palette the brief forbids.
  const present = a.effC.filter((c) => c >= 0.075).length / n
  const presence = clamp((present - 0.3) / 0.45, 0, 1)

  // An even spread of hue reads as a considered set; one clump plus a stray does not.
  const ideal = 360 / n
  const hues = a.dyes.map((d) => wrap360(d.h)).sort((x, y) => x - y)
  const gaps: number[] = []
  for (let i = 0; i < n; i++) {
    const next = i === n - 1 ? (hues[0] as number) + 360 : (hues[i + 1] as number)
    gaps.push(next - (hues[i] as number))
  }
  const gapError = gaps.reduce((acc, g) => acc + Math.abs(g - ideal), 0)
  const hueBalance = n < 2 ? 0 : clamp(1 - gapError / n / ideal, 0, 1)

  // Four shades of one blue. None of the terms above can see it, and one of
  // them rewards it: near-hue pairs always mix at high saturation, so a clump
  // scores WELL on meanPairSat. This is the counterweight, and it reads every
  // slide's nearest neighbour rather than the single tightest pair, because a
  // set with three tight pairs is three times the fault of a set with one.
  let tight = 0
  for (let i = 0; i < n; i++) {
    const nearest = Math.min(gaps[i] as number, gaps[(i + n - 1) % n] as number)
    tight += clamp(1 - nearest / CLUMP_DEG, 0, 1)
  }
  const clumpPenalty = n < 2 ? 0 : tight / n

  // How far apart the set actually looks. Read per slide and averaged, for the
  // same reason as clumpPenalty: three slides with a near-twin is three times
  // the fault of one, and the minimum alone cannot tell those apart.
  const separation =
    n < 2
      ? 1
      : a.sepNear.reduce((acc, d) => acc + clamp((d - SEP_FLOOR) / (SEP_GOOD - SEP_FLOOR), 0, 1), 0) /
        n

  const chromaSpread = clamp(stdev(a.effC) / 0.05, 0, 1)

  // Peaks in the middle of the legal stdev window: some structure, not a staircase.
  const lightnessShape = clamp(1 - Math.abs(a.lStdev - 0.07) / 0.07, 0, 1)

  const clipPenalty = clamp(a.clipSum / 0.1, 0, 1)

  // Grey crossings are a texture, not a fault: one or two of them are what make
  // the chromatic ones read as chromatic. Only a set that is MOSTLY grey where
  // it overlaps is being penalised, and the hard limit catches the rest.
  const grey = a.pairSat.filter((s) => s < 0.2).length
  const greyPenalty = pairs === 0 ? 0 : clamp((grey / pairs - 0.25) / 0.35, 0, 1)

  // meanPairSat used to be the dominant term at 2.4, and dominant is exactly
  // what it should not be: it is maximised by a set of neighbours. The weight
  // it lost went to the two terms that pay for difference, discovery and
  // hueBalance, and the clump penalty puts a floor under both.
  return (
    1.8 * clamp(meanPairSat / 0.62, 0, 1) +
    1.7 * discovery +
    1.4 * presence +
    1.5 * separation +
    1.15 * hueBalance +
    1.0 * clamp(bestPairSat / 0.85, 0, 1) +
    0.9 * chromaSpread +
    0.7 * lightnessShape +
    0.6 * clamp(worstPairSat / 0.22, 0, 1) -
    1.6 * clumpPenalty -
    1.6 * clipPenalty -
    1.1 * greyPenalty
  )
}

/** Spec 7.6. Higher is better; roughly 0..6. */
export function scorePalette(dyes: Dye[]): number {
  if (dyes.length === 0) return 0
  return scoreOf(analyse(dyes))
}

// --- candidate construction (7.2 to 7.4) ----------------------------------------

interface Roles {
  neutral: number
  wash: number
  accent: number
}

/**
 * How many slides are deliberately quiet, as a function of palette size. Two out
 * of six is a composition. Two out of four is a thin one, and on a phone, where
 * the count drops to four, it left half the screen colourless.
 */
export function quietSlots(count: number): number {
  return count >= 6 ? 2 : count >= 4 ? 1 : 0
}

/**
 * The quiet budget a roll can actually afford, given what is pinned. The quiet
 * roles are spent out of the free slots only, so with five of six pinned the
 * one regenerable slide was guaranteed to be the gel: pressing Regenerate
 * produced the same near-grey every time, which reads as a broken button. At
 * least one free slot always keeps its colour.
 */
export function quietBudget(count: number, keep: (Dye | null)[]): number {
  let freeCount = 0
  for (let i = 0; i < count; i++) if (!keep[i]) freeCount++
  return Math.min(quietSlots(count), Math.max(0, freeCount - 1))
}

function chooseRoles(req: PaletteRequest, count: number): Roles {
  const free: number[] = []
  for (let i = 0; i < count; i++) if (!req.keep[i]) free.push(i)

  const quiet = quietBudget(count, req.keep)
  const byArea = [...Array(count).keys()].sort(
    (a, b) => (req.areaNorm[a] ?? 0.5) - (req.areaNorm[b] ?? 0.5),
  )
  // Near the median area, not always on it. A gel on the biggest slide reads as
  // grey paper and kills the film illusion, so it stays off the top of the
  // ladder. Putting it on the median slide every single time is the predictable
  // symmetry the brief rules out: the same slot went grey on every reroll.
  const medianRank = Math.floor((count - 1) / 2)
  const ranks: number[] = []
  for (let r = Math.max(0, medianRank - 1); r <= Math.min(count - 1, medianRank + 1); r++) {
    ranks.push(r)
  }
  req.rng.shuffle(ranks)

  let neutral = -1
  if (quiet >= 1) {
    for (const rank of ranks) {
      const slot = byArea[rank]
      if (slot !== undefined && !req.keep[slot]) {
        neutral = slot
        break
      }
    }
    // Every middle slide is locked, so take any free slot rather than no gel.
    if (neutral < 0) neutral = free[0] ?? -1
  }

  const rest = free.filter((s) => s !== neutral)
  const wash = quiet >= 2 && rest.length > 0 ? (req.rng.pick(rest) as number) : -1
  const forAccent = rest.filter((s) => s !== wash)
  const accent =
    forAccent.length > 0 ? (req.rng.pick(forAccent) as number) : rest.length > 0 ? wash : -1

  return { neutral, wash, accent }
}

/**
 * The lightness closest to `want` at which `hue` can actually hold `targetC`.
 * Searches outward, so a yellow (chroma peaks high) moves up and an orange
 * (chroma peaks low) moves down. Returns `want` untouched when the hue already
 * has the headroom, which is the common case for the quiet slots.
 */
function lightnessFor(hue: number, targetC: number, want: number): number {
  let bestHead = maxChroma(want, hue, BANDS.cMax)
  if (bestHead >= targetC) return want
  let best = want
  for (let step = 0.02; step <= 0.4; step += 0.02) {
    for (const L of [want - step, want + step]) {
      if (L < BANDS.lMin || L > BANDS.lMax) continue
      const head = maxChroma(L, hue, BANDS.cMax)
      if (head >= targetC) return L
      if (head > bestHead) {
        bestHead = head
        best = L
      }
    }
  }
  return best
}

function buildCandidate(
  req: PaletteRequest,
  count: number,
  roles: Roles,
  strategy: Strategy,
  base: number,
): Dye[] {
  const rng = req.rng
  const scale = rng.range(OFFSET_SCALE[0], OFFSET_SCALE[1])
  const offsets = rng.shuffle(offsetsFor(strategy, count).map((o) => o * scale))

  // Lightness: the set needs a floor and a ceiling, the rest sits in the middle.
  const lBands: number[] = [L_BANDS[0], L_BANDS[2]]
  for (let i = 2; i < count; i++) {
    const r = rng.next()
    lBands.push((r < 0.22 ? L_BANDS[0] : r < 0.74 ? L_BANDS[1] : L_BANDS[2]) as number)
  }

  // Chroma: at least two slots must carry real colour, one slot is the neutral gel.
  const cs: number[] = [C_BANDS[2], rng.next() < 0.55 ? C_BANDS[3] : C_BANDS[2]]
  for (let i = 2; i < count; i++) {
    const r = rng.next()
    cs.push(
      (r < 0.14 ? C_BANDS[0] : r < 0.46 ? C_BANDS[1] : r < 0.78 ? C_BANDS[2] : C_BANDS[3]) as number,
    )
  }

  const slots = lBands.map((L, i) => ({ L, c: cs[i] as number }))
  rng.shuffle(slots)

  const out: Dye[] = []
  for (let i = 0; i < count; i++) {
    const locked = req.keep[i]
    if (locked) {
      out.push({ ...locked })
      // Keep the draw count per slot constant so the stream does not depend on locks.
      rng.next()
      rng.next()
      rng.next()
      rng.next()
      continue
    }

    const areaNorm = clamp(req.areaNorm[i] ?? 0.5, 0, 1)
    const slot = slots[i] as { L: number; c: number }
    let want = slot.L + rng.spread(L_JITTER)
    let targetC = Math.max(0.02, slot.c + rng.spread(C_JITTER))
    const h = wrap360(base + (offsets[i] as number) + rng.spread(H_JITTER))
    // Big slides stay thin. A large dense slide reads as coloured paper, not film.
    let d = rng.range(0.74, 0.96) - 0.12 * areaNorm

    let neutral = false
    if (i === roles.neutral) {
      neutral = true
      d = NEUTRAL_D
    } else if (i === roles.wash) {
      d = clamp(d, DENSITY_MIN, DENSITY_MAX) * WASH_D
      // The wash is thin on purpose. Let it keep its hue anyway, or the set
      // loses a slide to near-invisibility on top of the neutral gel.
      targetC *= WASH_C
      if (i === roles.accent) targetC *= ACCENT_C
    } else {
      if (i === roles.accent) targetC *= ACCENT_C
      d = clamp(d, DENSITY_MIN, DENSITY_MAX)
    }

    want = clamp(want, BANDS.lMin, BANDS.lMax)
    targetC = Math.min(targetC, BANDS.cMax)
    // Lightness follows the hue, so the slot gets the chroma it asked for rather
    // than whatever sRGB happened to have left at an arbitrary lightness.
    const L = neutral ? want : lightnessFor(h, targetC, want)
    const C = neutral ? NEUTRAL_C : clamp(Math.min(targetC, maxChroma(L, h, BANDS.cMax)), 0, BANDS.cMax)
    d = clamp(d, BANDS.dMin, BANDS.dMax)

    out.push({ L, C, h, d })
  }
  return out
}

// --- selection (7.7) --------------------------------------------------------------

interface Scored {
  dyes: Dye[]
  score: number
  violations: number
}

function sample(
  req: PaletteRequest,
  count: number,
  roles: Roles,
  relax: number,
  pool: Scored[],
  base: number,
): Scored[] {
  const valid: Scored[] = []
  for (let i = 0; i < CANDIDATES; i++) {
    const strategy = pickStrategy(req.rng)
    const dyes = buildCandidate(req, count, roles, strategy, base)
    const a = analyse(dyes)
    const v = violationsOf(
      a,
      limitsFor(strategy.maxGap, strategy.minGap, relax),
      req.previous,
      req.keep,
    )
    const scored: Scored = { dyes, score: scoreOf(a), violations: v.length }
    pool.push(scored)
    if (v.length === 0) valid.push(scored)
  }
  return valid
}

function lottery(rng: Rng, ranked: Scored[]): Scored {
  const top = ranked.slice(0, LOTTERY.length)
  let total = 0
  for (let i = 0; i < top.length; i++) total += LOTTERY[i] as number
  let r = rng.next() * total
  for (let i = 0; i < top.length; i++) {
    r -= LOTTERY[i] as number
    if (r <= 0) return top[i] as Scored
  }
  return top[0] as Scored
}

/**
 * Never throws, always returns exactly `count` dyes, always terminates: at worst
 * it falls back to the least-bad of the 56 candidates it already built.
 */
export function generatePalette(req: PaletteRequest): Dye[] {
  const count = Math.max(0, Math.floor(req.count))
  if (count === 0) return []

  const roles = chooseRoles(req, count)
  const pool: Scored[] = []

  // The base hue is drawn once for the whole roll, not once per candidate. When
  // each candidate picked its own, the 56-way tournament was choosing the hue
  // family as well as the structure, and because magenta pairs multiply to high
  // chroma the score kept crowning them: the instrument developed a house colour.
  const base = req.rng.next() * 360
  let valid = sample(req, count, roles, 0, pool, base)
  if (valid.length === 0) valid = sample(req, count, roles, RELAX, pool, base)

  const ranked = (valid.length > 0 ? valid : pool).sort((a, b) =>
    a.violations !== b.violations ? a.violations - b.violations : b.score - a.score,
  )
  const chosen = lottery(req.rng, ranked)
  return chosen.dyes.map((d) => ({ ...d }))
}
