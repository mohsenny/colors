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

import { DENSITY_MAX } from '../core/constants'
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

/**
 * The outer envelope a generated dye may land in, whatever its temperament.
 * These stopped being the working bands when temperaments arrived: each
 * temperament brings its own lightness, chroma and density ladders and this is
 * only their union, kept so that a dye is always a dye and so the tests have
 * one thing to assert that holds across every roll. The lightness floor dropped
 * from 0.46 to 0.27 to let `ink` be dense and dark, and the density floor from
 * 0.34 to 0.20 because a chalk wash is a 0.30 dye thinned by WASH_D.
 */
export const BANDS = {
  lMin: 0.27,
  lMax: 0.93,
  cMax: 0.33,
  dMin: 0.2,
  dMax: DENSITY_MAX,
} as const

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
/**
 * The field's chroma compensation, the same idea as `WASH_C` and for the same
 * reason: film chroma falls with density, so a sheet thin enough to read as
 * the set's ground arrives near-grey unless it is asked for more. It buys
 * less than it looks: the thinnest sheet's median film chroma goes 0.026 to
 * 0.030 and the rolls whose ground is under 0.03 go 226 in 400 to 197. That
 * is the right size. The field is the thing the set sits IN, so it wants a
 * tint rather than a colour.
 */
const FIELD_C = 1.55

/**
 * Tournament size. Doubled from 56 when the structural sheets landed: pinning
 * two slots to the temperament's `anchor` and `field` narrows what any single
 * candidate can be, and at 56 the winners were paying for their new lightness
 * range in hue spacing. The tenth-percentile nearest pair on a lightbox roll
 * went 0.053 to 0.058 and the typical tightest hue gap 37.7 to 38.6 degrees.
 * 168 adds 0.001 more for another 6ms, so this is where the curve flattens.
 * Costs 11ms, once, on Regenerate. Nothing is drawing while it runs.
 */
const CANDIDATES = 112
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

const ALL_STRATEGIES: readonly string[] = STRATEGIES.map((s) => s.name)

/**
 * The temperament: everything about a roll that is decided ONCE and then
 * constrains every slide in it.
 *
 * This exists because the instrument had almost no between-roll variety and
 * measurement said why. Every sheet was drawn independently from one fixed
 * distribution into one hard-coded architecture, and the average of N
 * independent draws is the same average every time however wide the draws are.
 * Over 400 rolls the spread of mean film lightness BETWEEN rolls was 0.016
 * while the spread WITHIN a single roll was 0.071: rolls differed from each
 * other four times less than sheets differed inside one roll. Widening the
 * bands did not help (halving the lightness floor moved the mean by 0.011) and
 * neither did deleting the tournament or the shape constraints (0.0018 and
 * under 0.006). Between-run variety can only come from a variable drawn once
 * per roll and shared by every sheet, and the one that already existed, the
 * base hue, is the one axis that already varied.
 *
 * So character lives here: lightness, chroma, density, architecture and
 * legality. NOT hue. Hue uniformity is the one thing that already works (12
 * bins of 30 degrees, all within 20% of flat) and a temperament with a warm or
 * cool bias would tilt that histogram the moment the mixture was uneven.
 *
 * Legality moves in here too, and that is the change that makes the rest real.
 * Every characterful palette trips the old universal constraints: a chalk set
 * violates tooFewSaturated and chromaFlat, an ink set violates lRangeLow, a
 * monochrome study violates minGap and tooClose. Scored against one fixed
 * rubric they came out at 4.2 to 5.6 against 9.2 for an ordinary roll, so the
 * gate threw every interesting palette away. A constraint is not a universal
 * law, it is one temperament's standard.
 *
 * The lightness and chroma ladders are DYE numbers, not film numbers. The film
 * model loses roughly half the dye chroma on its way to the surface, so these
 * look implausibly strong on paper and land correctly on the glass. Chroma is
 * absolute rather than a fraction of what sRGB can reach: at L 0.82 a green
 * reaches C 0.26 and an orange C 0.10, so the same fraction buys a vivid green
 * and a dead orange. Ask for an absolute chroma and let the LIGHTNESS follow
 * the hue, which is what dyed film does anyway.
 */
interface Temperament {
  /** For tests and for reasoning about a roll. Never shown in the UI. */
  readonly name: string
  /** Selection weight, the same idea as `Strategy.weight`. */
  readonly weight: number
  /** Its own dye lightness ladder. */
  readonly l: readonly number[]
  /** Its own dye chroma ladder, ascending: the last rung is its loudest. */
  readonly c: readonly number[]
  /** Its own dye density range, before the area thinning and the role. */
  readonly d: readonly [number, number]
  /** How bright the box is, 0.78 to 1.0. Declared here, wired by a later stage. */
  readonly lamp: number
  /** Deliberately quiet slots, absolute: this replaces a function of the count. */
  readonly quiet: number
  /**
   * The two structural sheets, as `[dye lightness, density]`.
   *
   * `anchor` is the one the set stands on and `field` is the one it sits in,
   * and every roll gets both. They carry their own DENSITY, which is the whole
   * reason they exist as a pair of numbers rather than as two rungs of `l`.
   * Measured: at density 0.30 the entire dye ladder from L 0.25 to L 0.90
   * renders between film L 0.89 and 0.97, so at chalk's densities a lightness
   * rung is very nearly a no-op and a chalk roll came back spanning 0.037 of
   * film lightness, which is eight sheets of the same colour. Density is the
   * lever; lightness only looks like one.
   */
  readonly anchor: readonly [number, number]
  readonly field: readonly [number, number]
  /** The hue skeletons it likes, by `Strategy.name`. */
  readonly strategies: readonly string[]
  /** Its own legality, merged over the defaults. See `limitsFor`. */
  readonly limits: Partial<Limits>
  /** Its own taste, merged over the defaults. See `scoreOf`. */
  readonly weights: Partial<ScoreWeights>
  /** Advisory sheet-count preference: outside it the temperament is not offered. */
  readonly count?: readonly [number, number]
}

const TEMPERAMENTS: readonly Temperament[] = [
  // The character the app had before temperaments existed, preserved as one
  // option among several rather than deleted: it is a good roll, it was just
  // the only roll.
  {
    name: 'lightbox',
    weight: 0.2,
    l: [0.56, 0.7, 0.83],
    c: [0.13, 0.19, 0.25, 0.31],
    // A plain slide's density, which for this temperament is what
    // DENSITY_MIN to DENSITY_MAX used to be. Not 0.34: that is the envelope
    // floor a WASH lands on after the 0.7 thinning, and drawing plain slides
    // from it would leave lightbox half transparent, which is the one thing
    // this entry exists not to do.
    d: [0.68, 0.95],
    lamp: 1.0,
    quiet: 2,
    anchor: [0.35, 0.94],
    field: [0.86, 0.4],
    strategies: ALL_STRATEGIES,
    limits: {},
    weights: {},
  },
  // Pale, powdery, a tight hue family. Nothing shouts, so the constraints that
  // ask for something to shout are the ones that have to go.
  {
    name: 'chalk',
    weight: 0.15,
    l: [0.7, 0.8, 0.86, 0.9],
    c: [0.05, 0.08, 0.11],
    d: [0.3, 0.66],
    lamp: 1.0,
    // Zero because EVERYTHING here is quiet. Designating one slide as the calm
    // one is meaningless when no slide is loud, and spending a slot on a gel
    // would just remove the one thing the set still has, its hue.
    quiet: 0,
    // A mid tone, not a black: chalk's anchor is the darkest thing a pale set
    // can hold without stopping being pale. It still moves the roll from 0.037
    // of film lightness to about 0.35, which is the difference between a set
    // and a swatch of one colour.
    anchor: [0.57, 0.94],
    field: [0.9, 0.3],
    strategies: ['warm-cool', 'mono-foil', 'split-comp'],
    limits: {
      // 0.012, not the 0.085 a lightbox slide has to clear. Measured: the
      // second most colourful slide of a chalk roll reaches film chroma 0.029
      // and the fifth reaches far less, so anything higher is a rule that says
      // chalk may not exist.
      satC: 0.012,
      // Pale slides sit close together in OKLab by construction. Measured
      // median nearest pair on a chalk roll is 0.017 against 0.087 on a
      // lightbox one, so the general floor would reject every chalk set.
      sep: 0.012,
      flatC: 0,
      minGap: 14,
      novelty: 12,
      // Pale slides cross pale. Grading these crossings against a saturation
      // bar written for full-strength dye condemns the whole temperament.
      greySat: 0.08,
      greyShare: 0.9,
      tripleSat: 0.01,
    },
    weights: {
      // Nothing to reward for presence or chroma spread when the ladder is
      // three rungs of near-nothing, and the tight hue family is the point,
      // so the clump penalty has to stop reading it as a fault.
      presence: 0.3,
      chromaSpread: 0.2,
      discovery: 0.8,
      clump: 0.6,
    },
  },
  // Deep, dense, high contrast. Fewer sheets, and the box dims for it.
  {
    name: 'ink',
    weight: 0.15,
    l: [0.3, 0.38, 0.47],
    c: [0.16, 0.22, 0.28],
    d: [0.9, 0.99],
    lamp: 0.82,
    quiet: 1,
    anchor: [0.25, 0.99],
    // Ink's field is the sheet that cuts through it. A dark set needs one more
    // than a pale one does, because eight deep sheets on a bright box is the
    // complaint this whole pass exists to answer.
    field: [0.84, 0.82],
    strategies: ['comp-accent', 'sweep-foil', 'warm-cool'],
    count: [4, 6],
    limits: {
      satC: 0.05,
      // Deep crossings go grey sooner. That is what this material does, not a
      // fault in the roll, so the bar moves rather than the palette failing.
      greySat: 0.1,
      greyShare: 0.6,
      tripleSat: 0.02,
    },
    weights: { presence: 1.0, grey: 0.4, separation: 1.6 },
  },
  // Two or three quiet colours and one violent accent.
  {
    name: 'siren',
    weight: 0.14,
    l: [0.62, 0.72, 0.86],
    c: [0.06, 0.09, 0.33],
    d: [0.5, 0.92],
    lamp: 0.95,
    quiet: 2,
    anchor: [0.28, 0.88],
    field: [0.88, 0.35],
    strategies: ['comp-accent', 'mono-foil'],
    limits: {
      // One loud sheet among quiet ones is the entire point, and an uneven
      // chroma spread is exactly what chromaFlat was written to require, so
      // turning it off here is not a loophole, it is the definition.
      flatC: 0,
      maxGap: 260,
      satC: 0.04,
      greySat: 0.12,
      greyShare: 0.6,
      tripleSat: 0.02,
    },
    weights: { chromaSpread: 2.0, presence: 0.5 },
  },
  // Muted mid tones, a narrow lightness range, nothing bright and no accent.
  {
    name: 'smoke',
    weight: 0.13,
    l: [0.48, 0.58, 0.68],
    c: [0.06, 0.1, 0.14],
    d: [0.58, 0.92],
    lamp: 0.92,
    quiet: 1,
    anchor: [0.38, 0.94],
    field: [0.86, 0.52],
    strategies: ['spread', 'warm-cool', 'split-comp'],
    limits: {
      flatC: 0,
      satC: 0.03,
      novelty: 12,
      greySat: 0.08,
      greyShare: 0.9,
      tripleSat: 0.01,
    },
    weights: { presence: 0.4, chromaSpread: 0.3, meanPairSat: 1.0, grey: 0.3, lightnessShape: 1.0 },
  },
  // Loud everywhere. No quiet slot at all.
  {
    name: 'acid',
    weight: 0.13,
    l: [0.66, 0.76, 0.84],
    c: [0.26, 0.3, 0.33],
    d: [0.5, 0.92],
    lamp: 1.0,
    quiet: 0,
    anchor: [0.44, 0.94],
    // Denser than the other fields. Acid has no quiet slot, so seven of its
    // eight sheets have to clear satC 0.1, and a field thin enough to read as
    // clear cannot: the one sheet of slack the rule allows is already spent.
    field: [0.86, 0.55],
    strategies: ['triad', 'spread', 'split-comp'],
    limits: {
      // There is no gel, so the neutral requirement is switched off rather than
      // merely unmet. `quiet: 0` already skips the check; this states it.
      neutralC: 1,
      // Raised over the general 0.085, but not to the 0.12 the loudest slides
      // reach: with no quiet slot the rule asks FIVE of six slides to clear
      // it, and the fifth is never the loudest.
      satC: 0.1,
      // Three rungs inside 0.07 of each other cannot produce a chroma spread,
      // and being uniformly loud is the character, not the failure mode
      // chromaFlat guards against.
      flatC: 0,
    },
    weights: { presence: 2.0, meanPairSat: 2.2, chromaSpread: 0.2 },
  },
  // One hue family down a wide lightness ladder. A monochrome study.
  {
    name: 'study',
    weight: 0.1,
    l: [0.36, 0.56, 0.76, 0.88],
    c: [0.1, 0.16, 0.22],
    d: [0.55, 0.95],
    lamp: 0.9,
    quiet: 1,
    anchor: [0.3, 0.96],
    field: [0.88, 0.32],
    strategies: ['mono-foil'],
    // One hue family does not stretch to eight sheets: at that count a study
    // roll failed minGap, tooClose and tooFewSaturated about once per roll,
    // which are three readings of the same fact. Six is where it still reads
    // as a ladder rather than as a crowd.
    count: [4, 6],
    limits: {
      // It leans on LIGHTNESS separation instead of hue, so the wide ladder is
      // doing the work the hue gaps normally do and the hue rules stand down.
      minGap: 8,
      maxGap: 320,
      sep: 0.03,
      flatC: 0,
      novelty: 10,
      greySat: 0.1,
      greyShare: 0.6,
    },
    weights: { hueBalance: 0.2, clump: 0.2, discovery: 0.4, separation: 1.8, lightnessShape: 1.2 },
  },
]

/**
 * The temperament whose standard is the old universal one, used wherever a
 * palette has to be judged without knowing which sitting produced it.
 */
const LIGHTBOX = TEMPERAMENTS[0] as Temperament

/** The table itself, for the tests: every entry must be reachable and usable. */
export { TEMPERAMENTS }
export type { Temperament }

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

function pickStrategy(rng: Rng, temperament: Temperament): Strategy {
  const pool = STRATEGIES.filter((s) => temperament.strategies.includes(s.name))
  const from = pool.length > 0 ? pool : STRATEGIES
  // Renormalised, because a temperament that likes three skeletons out of seven
  // leaves the weights summing to well under 1 and an un-normalised draw would
  // fall through to the first one most of the time.
  let total = 0
  for (const s of from) total += s.weight
  let r = rng.next() * total
  for (const s of from) {
    r -= s.weight
    if (r <= 0) return s
  }
  return from[0] as Strategy
}

/**
 * The roll's temperament. Drawn from the palette RNG so a seed reproduces a
 * sitting exactly, and drawn FIRST, before the roles and before the base hue,
 * for two reasons: the roles depend on it, and a caller holding only the seed
 * can learn a sitting's temperament by running this against a fresh Rng. The
 * tests rely on that, and so will whatever wires `lamp` to the box.
 *
 * `count` biases rather than filters. Ink wants four to six sheets and the
 * instrument's own default is eight, so excluding it outright would have made
 * a seventh of the table unreachable in the actual app while every test at six
 * sheets kept passing. Outside its range a temperament keeps a quarter of its
 * weight, and the weights are renormalised so the demoted ones do not collapse
 * onto the first entry.
 */
const COUNT_MISMATCH = 0.25

export function pickTemperament(rng: Rng, count: number): Temperament {
  const weights = TEMPERAMENTS.map((t) =>
    !t.count || (count >= t.count[0] && count <= t.count[1])
      ? t.weight
      : t.weight * COUNT_MISMATCH,
  )
  let total = 0
  for (const w of weights) total += w
  let r = rng.next() * total
  for (let i = 0; i < TEMPERAMENTS.length; i++) {
    r -= weights[i] as number
    if (r <= 0) return TEMPERAMENTS[i] as Temperament
  }
  return TEMPERAMENTS[0] as Temperament
}

/**
 * A temperament that can live with what the user pinned.
 *
 * The temperament is drawn before the pins are looked at, deliberately: making
 * selection depend on the locks would mean pinning a dark slide quietly
 * narrowed the instrument to two temperaments forever. So it adapts instead.
 * Each pinned dye adds a rung to the lightness and chroma ladders, which is the
 * difference between the free slides being able to meet the pinned one and
 * being drawn from a band that can never sit beside it: pin an ink-dark slide
 * into a chalk roll and without this every other slide stays above L 0.80 and
 * the set reads as a mistake rather than as a set.
 */
function adaptTo(temperament: Temperament, keep: (Dye | null)[], count: number): Temperament {
  const l = [...temperament.l]
  const c = [...temperament.c]
  let pinned = false
  for (let i = 0; i < count; i++) {
    const dye = keep[i]
    if (!dye) continue
    pinned = true
    l.push(clamp(dye.L, BANDS.lMin, BANDS.lMax))
    c.push(clamp(dye.C, 0, BANDS.cMax))
  }
  if (!pinned) return temperament
  l.sort((a, b) => a - b)
  c.sort((a, b) => a - b)
  return { ...temperament, l, c }
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
  /**
   * Lightness, read off the FILM colours and not off the dyes.
   *
   * These used to be measured on `dye.L`, which is the number the generator
   * asked for rather than the one the sheet shows, and the two are barely
   * related: a sheet's film lightness is `1 - d(1 - dye)` per channel, so at a
   * low density the dye ladder is almost entirely absorbed. Grading the dye
   * meant the scorer believed a chalk roll spanned 0.10 of lightness when what
   * reached the screen spanned 0.037.
   */
  lRange: number
  lStdev: number
  /**
   * How far the darkest sheet falls below the set's median and how far the
   * lightest rises above it. A range on its own can be one outlier against
   * seven twins; a set needs something to stand on AND something to sit in,
   * and these are the two halves asked separately.
   */
  anchorDrop: number
  fieldLift: number
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
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

  const Ls = lch.map((o) => o.L)
  const mean = Ls.reduce((a, b) => a + b, 0) / Math.max(1, n)
  const variance = Ls.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n)
  const mid = median(Ls)

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
    lRange: n === 0 ? 0 : Math.max(...Ls) - Math.min(...Ls),
    lStdev: Math.sqrt(variance),
    anchorDrop: n === 0 ? 0 : mid - Math.min(...Ls),
    fieldLift: n === 0 ? 0 : Math.max(...Ls) - mid,
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
  anchorDrop: number
  fieldLift: number
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

/**
 * The universal floor, the part of legality no temperament may opt out of.
 * Everything else in `Limits` turned out to be one temperament's taste dressed
 * up as a law. These two are not: a clipped dye is not the colour anyone chose,
 * and two slides this close are not two slides. `SEP_HARD` sits below the
 * lowest a temperament asks for (chalk, 0.012, whose median nearest pair
 * measures 0.017) so that a genuinely subtle set stays legal, and well above
 * zero so two literally identical sheets never are.
 */
const CLIP_SUM_MAX = 0.1
const SEP_HARD = 0.008

/**
 * The limits that are upper bounds, so the relax pass knows which way to move
 * each one. Everything not named here is a lower bound.
 */
const UPPER_BOUNDS: readonly (keyof Limits)[] = [
  'maxGap',
  'lRangeHi',
  'lStdevHi',
  'neutralC',
  'greyShare',
  'clipSum',
]

/**
 * The defaults, then the temperament's own standard over the top, then the
 * relax pass, then the universal floor. The temperament wins over the strategy
 * on `minGap` and `maxGap` too: a `study` is one hue family by construction and
 * a skeleton that says otherwise is the wrong authority on the question.
 */
function limitsFor(
  maxGap: number,
  minGap: number,
  relax: number,
  temperament: Temperament,
): Limits {
  const base: Limits = {
    minGap,
    maxGap,
    // In film lightness, so these are not the numbers they were: 0.1 to 0.4 on
    // the dye ladder is 0.04 to 0.15 on the screen. The pair also changed job.
    // The old `lRangeHi` and `lStdevHi` were the real bound and the floors were
    // nominal, which is a rule that says a set may not have contrast, and the
    // sets it produced were eight tints of one lightness. Now the floors bind
    // and the ceilings are only there to catch nonsense.
    lRangeLo: 0.3,
    lRangeHi: 0.85,
    lStdevLo: 0.075,
    lStdevHi: 0.4,
    anchorDrop: 0.1,
    fieldLift: 0.04,
    // Judged on the film colour, not the dye: a dye number is not comparable
    // across hues, and what the eye grades is the light coming off the slide.
    neutralC: 0.045,
    satC: 0.085,
    flatC: 0.026,
    // Overlaps can no longer go dark, so there is nothing left to guard
    // against there: what can still go wrong is that they all go GREY, which
    // happens when every pair in the set is a complementary one. A few grey
    // crossings are worth having, so this bounds the share of them rather than
    // forbidding any. See `mixSummary`: saturation is a fraction, not a chroma.
    greySat: 0.2,
    greyShare: 0.45,
    tripleSat: 0.05,
    clipSum: CLIP_SUM_MAX,
    novelty: 24,
    sep: SEP_FLOOR,
  }
  const merged: Limits = { ...base, ...temperament.limits }
  const lo = 1 - relax
  const hi = 1 + relax
  for (const key of Object.keys(merged) as (keyof Limits)[]) {
    merged[key] = merged[key] * (UPPER_BOUNDS.includes(key) ? hi : lo)
  }
  merged.clipSum = Math.min(merged.clipSum, CLIP_SUM_MAX * hi)
  merged.sep = Math.max(merged.sep, SEP_HARD)
  return merged
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
  wantQuiet: number,
): string[] {
  const out: string[] = []
  const n = a.dyes.length

  if (n >= 2) {
    if (a.minGap < limits.minGap) out.push('minGap')
    // From three slides up. Two hues always leave an empty arc of at least
    // 180 degrees, so on a two slide palette this rule measures the count
    // rather than the palette, and it failed most `acid` pairs for it.
    if (n >= 3 && a.maxGap > limits.maxGap) out.push('maxGap')
    // The same fault in the units the eye uses: see `sepNear`.
    if (Math.min(...a.sepNear) < limits.sep) out.push('tooClose')
  }
  if (n >= 2) {
    if (a.lRange < limits.lRangeLo) out.push('lRangeLow')
    if (a.lRange > limits.lRangeHi) out.push('lRangeHigh')
    if (a.lStdev < limits.lStdevLo) out.push('lStdevLow')
    if (a.lStdev > limits.lStdevHi) out.push('lStdevHigh')
  }
  // From three sheets up: with two, one of them IS the median and the pair of
  // rules degenerates into the range rule above.
  if (n >= 3) {
    if (a.anchorDrop < limits.anchorDrop) out.push('noAnchor')
    if (a.fieldLift < limits.fieldLift) out.push('noField')
  }
  // Only palettes big enough to spend a slot on calm are required to have one,
  // and only when the pins left a slot to spend. Asking for a gel that
  // chooseRoles was never going to assign made every candidate report a
  // violation, so the roll always fell through to the least-bad fallback.
  const quiet = quietBudget(n, keep, wantQuiet)
  if (quiet >= 1 && Math.min(...a.effC) > limits.neutralC) out.push('noNeutral')
  // Every slide that is not deliberately quiet should carry colour, less one
  // slot of slack so a single unlucky hue does not void an otherwise good roll,
  // and less the field: it is thin by construction, so it cannot hold chroma,
  // and a rule that demands it does is a rule against the field existing. That
  // was measured, not assumed: before this slack an acid roll failed here about
  // once per roll and fell through to the least-bad candidate, which quietly
  // turns the whole tournament off.
  const satNeeded = Math.max(1, n - quiet - 2)
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

/**
 * Spec 7.5. Empty means the palette is legal UNDER THE GIVEN TEMPERAMENT, and
 * legality is now a question that only makes sense with one named: an ink set
 * graded against chalk's standard fails, and so does the reverse. The default
 * is `lightbox`, whose limits are the old universal ones, so a caller that
 * does not know where a palette came from still gets the old answer.
 */
export function paletteViolations(
  dyes: Dye[],
  previous: Dye[] | null,
  temperament: Temperament = LIGHTBOX,
): string[] {
  if (dyes.length === 0) return []
  // Without the generating strategy the only defensible gap bounds are the
  // loose ones: a deliberate cluster is legal, it is just rare.
  return violationsOf(
    analyse(dyes),
    limitsFor(215, 12, 0, temperament),
    previous,
    dyes.map(() => null),
    temperament.quiet,
  )
}

// --- score (7.6) ---------------------------------------------------------------

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / xs.length)
}

/**
 * What the scorer is paying for, as a table rather than as twelve numbers
 * buried in one expression. It had to become a table because a fixed rubric
 * crowns the same kind of roll every time: scored against these defaults the
 * characterful sets came out at 4.2 to 5.6 against 9.2 for an ordinary one, so
 * the tournament threw them away before the constraints ever saw them. Each
 * temperament now brings the part of this it disagrees with.
 */
interface ScoreWeights {
  meanPairSat: number
  discovery: number
  presence: number
  separation: number
  hueBalance: number
  bestPairSat: number
  chromaSpread: number
  lightnessShape: number
  worstPairSat: number
  clump: number
  clip: number
  grey: number
}

/**
 * meanPairSat used to be the dominant term at 2.4, and dominant is exactly what
 * it should not be: it is maximised by a set of neighbours. The weight it lost
 * went to the two terms that pay for difference, discovery and hueBalance, and
 * the clump penalty puts a floor under both.
 */
const SCORE_WEIGHTS: ScoreWeights = {
  meanPairSat: 1.8,
  discovery: 1.7,
  presence: 1.4,
  separation: 1.5,
  hueBalance: 1.15,
  bestPairSat: 1.0,
  chromaSpread: 0.9,
  lightnessShape: 0.7,
  worstPairSat: 0.6,
  clump: 1.6,
  clip: 1.6,
  grey: 1.1,
}

function scoreOf(a: Analysis, temperament: Temperament): number {
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

  // Structure: something to stand on, something to sit in, and enough between
  // them to be a set rather than a pair. This used to peak at one narrow stdev
  // and fall to zero either side of it, which made "has contrast" and "has no
  // contrast" score the same, and since flat sets are far commoner the scorer
  // effectively selected for flatness. It now only ever rewards reaching.
  const lightnessShape =
    Math.min(
      clamp(a.anchorDrop / 0.16, 0, 1),
      clamp(a.fieldLift / 0.07, 0, 1),
      clamp(a.lRange / 0.42, 0, 1),
    )

  const clipPenalty = clamp(a.clipSum / 0.1, 0, 1)

  // Grey crossings are a texture, not a fault: one or two of them are what make
  // the chromatic ones read as chromatic. Only a set that is MOSTLY grey where
  // it overlaps is being penalised, and the hard limit catches the rest.
  const grey = a.pairSat.filter((s) => s < 0.2).length
  const greyPenalty = pairs === 0 ? 0 : clamp((grey / pairs - 0.25) / 0.35, 0, 1)

  const w: ScoreWeights = { ...SCORE_WEIGHTS, ...temperament.weights }
  return (
    w.meanPairSat * clamp(meanPairSat / 0.62, 0, 1) +
    w.discovery * discovery +
    w.presence * presence +
    w.separation * separation +
    w.hueBalance * hueBalance +
    w.bestPairSat * clamp(bestPairSat / 0.85, 0, 1) +
    w.chromaSpread * chromaSpread +
    w.lightnessShape * lightnessShape +
    w.worstPairSat * clamp(worstPairSat / 0.22, 0, 1) -
    w.clump * clumpPenalty -
    w.clip * clipPenalty -
    w.grey * greyPenalty
  )
}

/**
 * Spec 7.6. Higher is better; roughly 0..6. Scores from two temperaments are
 * not comparable with each other, only within one: the point of the table is
 * that they are grading different things.
 */
export function scorePalette(dyes: Dye[], temperament: Temperament = LIGHTBOX): number {
  if (dyes.length === 0) return 0
  return scoreOf(analyse(dyes), temperament)
}

// --- candidate construction (7.2 to 7.4) ----------------------------------------

interface Roles {
  neutral: number
  wash: number
  accent: number
}

/**
 * The quiet budget a roll can actually afford. `want` is the temperament's own
 * count, which is absolute rather than a function of the palette size, but two
 * things still cut it down.
 *
 * Size: two quiet out of four is a thin composition, and on a phone, where the
 * count drops to four, it left half the screen colourless. Three coloured
 * slides is the floor.
 *
 * Pins: the quiet roles are spent out of the free slots only, so with five of
 * six pinned the one regenerable slide was guaranteed to be the gel and
 * pressing Regenerate produced the same near-grey every time, which reads as a
 * broken button. At least one free slot always keeps its colour.
 */
export function quietBudget(count: number, keep: (Dye | null)[], want: number): number {
  let freeCount = 0
  for (let i = 0; i < count; i++) if (!keep[i]) freeCount++
  const afford = Math.min(want, Math.max(0, count - 3))
  return Math.min(afford, Math.max(0, freeCount - 1))
}

function chooseRoles(req: PaletteRequest, count: number, temperament: Temperament): Roles {
  const free: number[] = []
  for (let i = 0; i < count; i++) if (!req.keep[i]) free.push(i)

  const quiet = quietBudget(count, req.keep, temperament.quiet)
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
 *
 * The search is bounded by the TEMPERAMENT's lightness window, not by the
 * global envelope. Bounding it globally would let a chalk slide walk down to
 * L 0.3 in pursuit of chroma it was never meant to have, which is the one way
 * a pale set can quietly stop being pale.
 */
function lightnessFor(
  hue: number,
  targetC: number,
  want: number,
  lLo: number,
  lHi: number,
): number {
  let bestHead = maxChroma(want, hue, BANDS.cMax)
  if (bestHead >= targetC) return want
  let best = want
  for (let step = 0.02; step <= 0.4; step += 0.02) {
    for (const L of [want - step, want + step]) {
      if (L < lLo || L > lHi) continue
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

/** A rung of a temperament's ladder, drawn flat. */
function rung(rng: Rng, ladder: readonly number[]): number {
  const n = ladder.length
  if (n === 0) return 0
  return ladder[Math.min(n - 1, Math.floor(rng.next() * n))] as number
}

function buildCandidate(
  req: PaletteRequest,
  count: number,
  roles: Roles,
  strategy: Strategy,
  base: number,
  t: Temperament,
): Dye[] {
  const rng = req.rng
  const scale = rng.range(OFFSET_SCALE[0], OFFSET_SCALE[1])
  const offsets = rng.shuffle(offsetsFor(strategy, count).map((o) => o * scale))

  // The ladder's window, which is the ORDINARY sheets' window. The structural
  // pair gets its own, narrow, centred on where each was declared: widening
  // this one to admit them let every middle sheet walk up to the field's
  // lightness in pursuit of chroma, and an ink roll came back at a median film
  // lightness of 0.75 instead of 0.56, which is ink that is not dark.
  const lLo = Math.max(BANDS.lMin, (t.l[0] as number) - L_JITTER)
  const lHi = Math.min(BANDS.lMax, (t.l[t.l.length - 1] as number) + L_JITTER)
  const STRUCT_WINDOW = 0.06

  // Where the anchor and the field land. Both avoid the quiet roles, because
  // the gel and the wash overwrite density outright and the two sheets that
  // exist to own their density are the two that cannot afford to lose it.
  // The order is shuffled over every index rather than over the eligible ones
  // so the draw count does not depend on what the user pinned.
  const order = rng.shuffle([...Array(Math.max(count, 1)).keys()])
  let anchorAt = -1
  let fieldAt = -1
  if (count >= 2) {
    for (const i of order) {
      if (req.keep[i] || i === roles.neutral || i === roles.wash) continue
      if (anchorAt < 0) anchorAt = i
      else {
        fieldAt = i
        break
      }
    }
  }

  // The rungs are drawn flat: the old 22/52/26 skew over three rungs was a way
  // of saying "middles are commoner" and it moves the mean lightness by 0.006,
  // which the ladder itself now says far more loudly.
  const lBands: number[] = []
  while (lBands.length < Math.max(count, 2)) lBands.push(rung(rng, t.l))

  // Chroma. Two slots are seeded from the top of the ladder so a set always
  // carries real colour somewhere; the rest are drawn, which is what lets
  // siren put one loud rung among quiet ones instead of two.
  const top = t.c[t.c.length - 1] as number
  const next = t.c[Math.max(0, t.c.length - 2)] as number
  const cs: number[] = [next, rng.next() < 0.55 ? top : next]
  while (cs.length < Math.max(count, 2)) cs.push(rung(rng, t.c))

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
    const structural = i === anchorAt ? t.anchor : i === fieldAt ? t.field : null
    let want = (structural ? structural[0] : slot.L) + rng.spread(L_JITTER)
    let targetC = Math.max(0.02, slot.c + rng.spread(C_JITTER))
    const h = wrap360(base + (offsets[i] as number) + rng.spread(H_JITTER))
    // Big slides stay thin. A large dense slide reads as coloured paper, not
    // film. The thinning is a fixed 0.12 of density, not a fraction of the
    // temperament's range, because it models the slide's area and knows
    // nothing about the sitting.
    const dLo = t.d[0]
    const dHi = t.d[1]
    // The draw happens either way, so the stream does not depend on which slot
    // the anchor landed on. Structural sheets take half the area thinning: at
    // full thinning an anchor that drew the largest slide came back 0.12
    // lighter, which is most of the contrast it exists to provide.
    const drawn = rng.range(dLo, dHi)
    let d = structural ? structural[1] - 0.06 * areaNorm : drawn - 0.12 * areaNorm

    let neutral = false
    if (i === roles.neutral) {
      neutral = true
      // The gel has to be visibly thinner than any plain slide. A flat 0.55
      // was that under the old single density range and is denser than every
      // chalk or siren slide, so where 0.55 is not low enough the gel drops to
      // four fifths of the temperament's own floor instead.
      d = Math.min(NEUTRAL_D, dLo * 0.8)
    } else if (i === roles.wash) {
      // Thinner than a plain slide of the same temperament, which the 0.7
      // alone does not guarantee: siren draws densities up to 0.92, and 0.7 of
      // that is denser than its own 0.50 floor, so the wash came back looking
      // like an ordinary slide.
      d = Math.min(clamp(d, dLo, dHi) * WASH_D, dLo * 0.95)
      // The wash is thin on purpose. Let it keep its hue anyway, or the set
      // loses a slide to near-invisibility on top of the neutral gel.
      targetC *= WASH_C
      if (i === roles.accent) targetC *= ACCENT_C
    } else {
      if (i === roles.accent) targetC *= ACCENT_C
      if (i === fieldAt) targetC *= FIELD_C
      // A structural sheet keeps the density it was given. Clamping it back
      // into the temperament's own range is exactly the move that made every
      // roll flat: chalk's anchor would come back at 0.66 and vanish.
      if (!structural) d = clamp(d, dLo, dHi)
    }

    const wLo = structural ? Math.max(BANDS.lMin, structural[0] - STRUCT_WINDOW) : lLo
    const wHi = structural ? Math.min(BANDS.lMax, structural[0] + STRUCT_WINDOW) : lHi
    want = clamp(want, wLo, wHi)
    targetC = Math.min(targetC, BANDS.cMax)
    // Lightness follows the hue, so the slot gets the chroma it asked for rather
    // than whatever sRGB happened to have left at an arbitrary lightness.
    const L = neutral ? want : lightnessFor(h, targetC, want, wLo, wHi)
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
  t: Temperament,
): Scored[] {
  const valid: Scored[] = []
  for (let i = 0; i < CANDIDATES; i++) {
    const strategy = pickStrategy(req.rng, t)
    const dyes = buildCandidate(req, count, roles, strategy, base, t)
    const a = analyse(dyes)
    const v = violationsOf(
      a,
      limitsFor(strategy.maxGap, strategy.minGap, relax, t),
      req.previous,
      req.keep,
      t.quiet,
    )
    const scored: Scored = { dyes, score: scoreOf(a, t), violations: v.length }
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

  // The temperament is the roll's first decision and therefore the RNG's first
  // draw: the roles depend on it, and taking it first means a seed alone
  // identifies the sitting's temperament without replaying the whole roll.
  // Then it adapts to the pins, which is where a locked slide gets to widen
  // the ladders rather than veto the temperament.
  const temperament = adaptTo(pickTemperament(req.rng, count), req.keep, count)
  const roles = chooseRoles(req, count, temperament)
  const pool: Scored[] = []

  // The base hue is drawn once for the whole roll, not once per candidate. When
  // each candidate picked its own, the 56-way tournament was choosing the hue
  // family as well as the structure, and because magenta pairs multiply to high
  // chroma the score kept crowning them: the instrument developed a house colour.
  const base = req.rng.next() * 360
  let valid = sample(req, count, roles, 0, pool, base, temperament)
  if (valid.length === 0) valid = sample(req, count, roles, RELAX, pool, base, temperament)

  const ranked = (valid.length > 0 ? valid : pool).sort((a, b) =>
    a.violations !== b.violations ? a.violations - b.violations : b.score - a.score,
  )
  const chosen = lottery(req.rng, ranked)
  return chosen.dyes.map((d) => ({ ...d }))
}
