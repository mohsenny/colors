import { gamutMap, linearToHex, maxChroma } from '../../src/core/oklab'
import { Rng } from '../../src/core/rng'
import type { Dye } from '../../src/core/types'

/*
 * The pictures on the films, one per chapter, drawn like an overhead
 * transparency: a pattern behind, a picture in front, printed in a deep shade
 * of the film's own hue. All six are drawn by one hand, and art.css is that
 * hand: the line, the fine line of the patterns and the flat tint are set
 * there once, so the markup here only says which is which.
 *
 *   (no class)  the drawing line
 *   cv-fine     the pattern behind it, thinner and fainter
 *   cv-tint     a flat fill at low strength, a few per picture
 *   cv-solid    a small mark filled with the full ink: a pixel, a dot
 *
 * Everything is in a 0 0 100 100 box that the mount crops square. The patterns
 * that repeat are worked out here rather than written out, and the one that
 * scatters (the snow) from a fixed seed, so every load draws the same picture.
 */

/** Two decimals at most, which keeps the markup short and is far below a pixel at any size the page draws. */
function n(v: number): string {
  return String(Math.round(v * 100) / 100)
}

/** A polyline through points, as path data. */
function line(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)},${n(y)}`).join('')
}

/** Lines every `step` over a box, as one path: graph paper, a pixel grid. */
function grid(step: number, x0: number, y0: number, x1: number, y1: number): string {
  let d = ''
  for (let x = x0; x <= x1 + 1e-6; x += step) d += `M${n(x)},${n(y0)}V${n(y1)}`
  for (let y = y0; y <= y1 + 1e-6; y += step) d += `M${n(x0)},${n(y)}H${n(x1)}`
  return d
}

/** A circle as two half turns, as path data: a field of dots is then one path, and a clip path can cut round one. */
function dot(x: number, y: number, r: number): string {
  return `M${n(x - r)},${n(y)}a${r},${r} 0 1 0 ${n(2 * r)},0a${r},${r} 0 1 0 ${n(-2 * r)},0Z`
}

// --- growing up: on video games ----------------------------------------------

/*
 * Azadi Tower with the square at its feet, in front of the Alborz, Damavand
 * white on the right, and the sky a screen's pixel grid with an old Nintendo
 * pad in it.
 */

/** The pad, a box on half cells of the sky grid with a cell cut from each corner, the way a pixel screen rounds one. The grid stops at it, as at the ridge. */
const PAD = 'M7.5,10H35V12.5H37.5V22.5H35V25H7.5V22.5H5V12.5H7.5Z'

/** Its cross, a cell to each arm. */
const DPAD = 'M11.25,13.75h2.5v2.5h2.5v2.5h-2.5v2.5h-2.5v-2.5h-2.5v-2.5h2.5Z'

/** Its two buttons side by side, as the Nintendo pad has them, as far in from the right wall as the cross is from the left. On a slant they were any icon set's pad. */
const BUTTONS = [
  [26.35, 18.25],
  [31.75, 18.25],
] as const

/** Select and start, halfway between the cross and the buttons: two short strokes the round caps make pills of. */
const PILLS = 'M18.05,19.5H19.05M21.55,19.5H22.55'

/** Its cable, slack, out of the top of the frame right of the tab, so it never reads as plugged into it: out at 46 it ran under 1989 IRAN on a 130px sheet. */
const CABLE = 'M21.25,10C21.25,4.5 33,4.5 47,7.5C62,10.5 80,9 80,0'

/** The tower's outline and its arch, from the left foot round to the right. */
const TOWER =
  'M20,86C32,79 40,66 41,52C41.4,46 40.6,43 39,40.5V39H61V40.5C59.4,43 58.6,46 59,52C60,66 68,79 80,86'
const ARCH = 'M36.5,86V80C36.5,71 44,64.5 50,59C56,64.5 63.5,71 63.5,80V86'

/** The Alborz either side of the tower, Damavand on the right. On the left a long wall of shoulders up to a summit by the tower: as even teeth it was any mountains icon. */
const RIDGE_LEFT = 'M0,58L9,54.2L11.5,55L21,47.5L23,48.2L27,45L30.5,45.4L35,47.3L40.1,46'
const RIDGE_RIGHT = 'M59.9,46L64,49L66,47L78,28.5L79,28L81,28L82,28.5L100,46'

/** The sky down to the ridge and round the tower, so the grid stops at both. */
const SKY =
  'M0,0H100V46L82,28.5L81,28L79,28L78,28.5L66,47L64,49L59.9,46L59.1,46L59.2,44L60,42L61,40.5V39H58.5' +
  'Q50,35.5 41.5,39H39V40.5L40,42L40.8,44L40.9,46L40.1,46L35,47.3L30.5,45.4L27,45L23,48.2L21,47.5' +
  'L11.5,55L9,54.2L0,58Z'

const growingUp = [
  `<clipPath id="cv-art-tehran-sky"><path clip-rule="evenodd" d="${SKY}${PAD}"/></clipPath>`,
  `<path class="cv-fine" clip-path="url(#cv-art-tehran-sky)" d="${grid(5, 0, 0, 100, 60)}"/>`,
  // The pad and its cable, the cross, the buttons, select and start.
  `<path class="cv-tint" d="${PAD}"/>`,
  `<path d="${PAD}${CABLE}"/>`,
  `<path class="cv-solid" d="${DPAD}"/>`,
  ...BUTTONS.map(([x, y]) => `<circle class="cv-solid" cx="${x}" cy="${y}" r="2"/>`),
  `<path d="${PILLS}"/>`,
  `<path d="${RIDGE_LEFT}${RIDGE_RIGHT}"/>`,
  // Damavand's snow, in streaks down the gullies from the summit: as an even zigzag it
  // was any snow-capped mountain icon.
  `<path class="cv-tint" d="M78,28.5L79,28L81,28L82,28.5L88.3,34.7L86.4,34L87.4,37.4L85.2,33.4L83.4,34.2L82.2,33.4L82.8,39.6L80.6,33.6L79.2,34.6L78.2,33.4L76.2,37.4L77,33.2L75.6,32.3Z"/>`,
  // The tower: the swept sides, the arch, the lattice and window over it, the crown. The
  // lattice stops at the window: carried into it, the lattice made the window an up arrow.
  `<path class="cv-tint" fill-rule="evenodd" d="${TOWER}Z${ARCH}Z"/>`,
  `<path d="${TOWER}${ARCH}M41.5,39Q50,35.5 58.5,39M47.9,52V48.5Q50,45.5 52.1,48.5V52Z"/>`,
  `<path class="cv-fine" d="M42.6,60L50,54.5L57.4,60M41.4,55.5L47.9,50.6M58.6,55.5L52.1,50.6M40.4,43H59.6"/>`,
  // The square in front of it.
  `<path d="M0,86H100"/>`,
  `<path class="cv-fine" d="M20,86L8,100M36.5,86L32,100M63.5,86L68,100M80,86L92,100M0,93H100"/>`,
].join('')

// --- bachelor's: physics, maths, then software -------------------------------

/*
 * Graph paper with a throw on it: the ball coming down its parabola, and the
 * area under the curve shaded between two verticals.
 */

/** The throw, from the origin at (15, 80) to (85, 80), its top at (50, 22). The origin is on the paper's lines: a unit off them, the y-axis read as doubled. */
function throwAt(x: number): number {
  const u = (x - 50) / 35
  return 80 - 58 * (1 - u * u)
}

/** The throw from a to b as one quadratic, its control point halfway across, where the tangents at the two ends meet. */
function throwFrom(a: number, b: number): string {
  const m = (a + b) / 2
  return `M${a},${n(throwAt(a))}Q${n(m)},${n(2 * throwAt(m) - (throwAt(a) + throwAt(b)) / 2)} ${b},${n(throwAt(b))}`
}

/** The ball, on the curve as it comes down, filled with the full ink: as a tinted ring it read as a chart's marker at 150px, and at a radius of 3 as a point on the curve. */
const PROJECTILE = { x: 77, y: throwAt(77), r: 3.6 }

const bachelor = [
  `<path class="cv-fine" d="${grid(5, 0, 0, 100, 100)}"/>`,
  // The area under the curve from 25 to 60, off centre under the peak: centred, the band read as a bell curve's.
  `<path class="cv-tint" d="${throwFrom(25, 60)}V80H25Z"/>`,
  `<path d="M25,80V${n(throwAt(25))}M60,80V${n(throwAt(60))}"/>`,
  // The axes.
  `<path d="M8,80H92M89,77.5L92,80L89,82.5M15,88V10M12.5,13L15,10L17.5,13"/>`,
  // The throw, one curve, and the ball on it.
  `<path d="${throwFrom(15, 85)}"/>`,
  `<circle class="cv-solid" cx="${PROJECTILE.x}" cy="${n(PROJECTILE.y)}" r="${PROJECTILE.r}"/>`,
].join('')

// --- Finland: winter, snow and sauna -----------------------------------------

/*
 * A winter night at a sauna: the aurora's curtain with its rays, spruces, the
 * log cabin with its window lit and steam drifting off its chimney, and snow
 * falling over all of it.
 */

/** Where the aurora runs, as a share of its length from its left end at x 6 to its right at x 96. */
function auroraT(x: number): number {
  return (x - 6) / 90
}

/** The aurora's lower edge, rising across the sky in a long S: drawn fine, as a full line it read as a hill. */
function auroraAt(x: number): number {
  const t = auroraT(x)
  return 36 - 18 * t + 5 * Math.sin(t * Math.PI * 2.4 + 0.2)
}

/** How tall the curtain stands over its edge, nothing at either end, so it hangs in the sky rather than standing on it. */
function auroraHeight(x: number): number {
  return 21 * Math.pow(Math.sin(Math.PI * auroraT(x)), 0.7)
}

const AURORA_EDGE: [number, number][] = Array.from({ length: 46 }, (_, i) => {
  const x = 6 + i * 2
  return [x, auroraAt(x)]
})

/** The glow along the edge, the lowest third of the curtain. */
const AURORA_GLOW = `${line(AURORA_EDGE)}${line(
  AURORA_EDGE.map(([x, y]): [number, number] => [x, y - auroraHeight(x) * 0.35]).reverse(),
).replace('M', 'L')}Z`

/** Where the rays lean to, high above the slide, so they fan as a curtain's rays do rather than stand like grass. */
const ZENITH = { x: 50, y: -140 }

/**
 * The rays, each a share of the curtain's height, in three runs that fade as
 * they rise (the opacities are the runs' own, judged at 150px so the top run
 * is just there): light frays out, a shape would close.
 */
const AURORA_RAYS = [0, 0.45, 0.75].map((from, run, runs) => {
  const to = runs[run + 1] ?? 1
  return Array.from({ length: 40 }, (_, i) => {
    const x = 8.2 + i * 2.2
    const y = auroraAt(x) - 1
    const len = auroraHeight(x) * (0.72 + 0.28 * Math.sin(i * 2.3))
    const r = Math.hypot(ZENITH.x - x, ZENITH.y - y)
    const ux = (ZENITH.x - x) / r
    const uy = (ZENITH.y - y) / r
    return `M${n(x + ux * len * from)},${n(y + uy * len * from)}L${n(x + ux * len * to)},${n(y + uy * len * to)}`
  }).join('')
})

/**
 * One spruce, its tip at (x, top) and its foot on the snow at `foot`: `tiers`
 * tiers widening evenly to `ratio` of its height either side, each drooping at
 * its ends, and a trunk. Narrow, as the spruces in Karelia stand: wide and in
 * three tiers it was the tree of every icon set.
 */
function spruce(x: number, top: number, foot: number, ratio: number, tiers: number): string {
  const h = foot - top
  const w = h * ratio
  const base = top + h * 0.9
  const left: [number, number][] = [[x, top]]
  for (let i = 1; i <= tiers; i++) {
    const y = top + ((base - top) * i) / tiers
    const reach = w * (0.25 + (0.75 * i) / tiers)
    left.push([x - reach, y + 0.6])
    if (i < tiers) left.push([x - reach * 0.45, y - 0.8])
  }
  const right = left.slice(1).map(([px, py]): [number, number] => [2 * x - px, py])
  return `${line([...left, ...right.reverse()])}ZM${n(x)},${n(base + 0.6)}V${n(foot)}`
}

/** Snow, falling: one flake in each cell of a loose grid, nudged, so it never clumps. */
const SNOW = (() => {
  const rng = new Rng(2012)
  let d = ''
  for (let row = 0; row < 12; row++) {
    for (let col = 0; col < 12; col++) {
      const x = col * 8.5 + 2 + rng.range(0, 6)
      const y = row * 8.5 + 2 + rng.range(0, 6)
      const r = rng.chance(0.25) ? 0.75 : 0.5
      d += `M${n(x - r)},${n(y)}a${r},${r} 0 1 0 ${n(2 * r)},0a${r},${r} 0 1 0 ${n(-2 * r)},0`
    }
  }
  return d
})()

/** The steam's middle, out of the chimney's mouth, straight up on the stove's draught and then off to the right on the night air. */
const STEAM = { from: [63.5, 55], bend: [63.5, 43], to: [76, 36] } as const

/**
 * A point on one side of the steam, 1 its right and -1 its left, at t from 0
 * at the chimney to 1 where it ends. It leaves just inside the chimney and
 * widens by 3.4 either side as it rises, its sides billowing out of step.
 * Widening by 4, its end swelled into a bulb.
 */
function steamAt(t: number, side: number): [number, number] {
  const [[x0, y0], [x1, y1], [x2, y2]] = [STEAM.from, STEAM.bend, STEAM.to]
  const u = 1 - t
  const [dx, dy] = [u * (x1 - x0) + t * (x2 - x1), u * (y1 - y0) + t * (y2 - y1)]
  const half = (1.4 + 3.4 * t) * (1 + t * (0.2 * Math.sin(t * 10 + side * 0.6) + 0.08 * Math.sin(t * 23 + side)))
  const k = (side * half) / Math.hypot(dx, dy)
  return [u * u * x0 + 2 * u * t * x1 + t * t * x2 - dy * k, u * u * y0 + 2 * u * t * y1 + t * t * y2 + dx * k]
}

/** The steam's body, rounded off past its end the way it is heading. */
const STEAM_BODY = (() => {
  const ts = Array.from({ length: 33 }, (_, i) => i / 32)
  const [[bx, by], [ex, ey]] = [STEAM.bend, STEAM.to]
  const k = 5 / Math.hypot(ex - bx, ey - by)
  const tip = `${n(ex + (ex - bx) * k)},${n(ey + (ey - by) * k)}`
  return `${line(ts.map((t) => steamAt(t, 1)))}Q${tip} ${line(ts.map((t) => steamAt(t, -1)).reverse()).slice(1)}Z`
})()

/** Its sides, in the rays' three runs, so it thins out as the aurora does and stays open at the end. Their ends are square in the markup: round, the caps overlapped where the runs meet and left a bead at each join. */
const STEAM_SIDES = [0, 0.45, 0.75].map((from, run, runs) => {
  const to = runs[run + 1] ?? 1
  const ts = Array.from({ length: 13 }, (_, i) => from + ((to - from) * i) / 12)
  return [1, -1].map((side) => line(ts.map((t) => steamAt(t, side)))).join('')
})

/** The spruces, two on the left, the near one in front of the far one, and one on the right, each its own width and number of tiers so they read as three trees rather than one drawn three times. The near one tops out at 59 so a branch of the far one tucks behind it: a unit lower, two tips all but touched and read as a knot. */
const FAR_SPRUCE = spruce(15, 42, 84, 0.27, 5)
const NEAR_SPRUCE = spruce(26.5, 59, 84, 0.3, 4)
const RIGHT_SPRUCE = spruce(88, 50, 84, 0.24, 6)

/** The snow's line. The spruces and the sauna stop at it: ended level at 84, the trunks and posts showed under it where it rises. */
const SNOW_LINE = 'M0,84C20,82 35,85.5 50,84S80,82.5 100,84.5'

const finland = [
  `<clipPath id="cv-art-finland-far-spruce"><path clip-rule="evenodd" d="M0,0H100V100H0Z${NEAR_SPRUCE}"/></clipPath>`,
  `<clipPath id="cv-art-finland-ground"><path d="${SNOW_LINE}V0H0Z"/></clipPath>`,
  `<path class="cv-fine cv-solid" d="${SNOW}"/>`,
  // The aurora: its edge, the glow along it and the rays.
  `<path class="cv-tint" d="${AURORA_GLOW}"/>`,
  `<path class="cv-fine" d="${AURORA_RAYS[0]}"/>`,
  `<g opacity="0.6"><path class="cv-fine" d="${AURORA_RAYS[1]}"/></g>`,
  `<g opacity="0.3"><path class="cv-fine" d="${AURORA_RAYS[2]}"/></g>`,
  `<path class="cv-fine" d="${line(AURORA_EDGE)}"/>`,
  // The spruces, the far one stopping at the near one rather than showing through it.
  `<g clip-path="url(#cv-art-finland-ground)">`,
  `<g clip-path="url(#cv-art-finland-far-spruce)"><path class="cv-tint" d="${FAR_SPRUCE}"/><path d="${FAR_SPRUCE}"/></g>`,
  `<path class="cv-tint" d="${NEAR_SPRUCE}${RIGHT_SPRUCE}"/>`,
  `<path d="${NEAR_SPRUCE}${RIGHT_SPRUCE}"/>`,
  // The sauna: snow on the roof, the logs with their ends standing out at the corners, the door, the lit window, the chimney and its steam.
  `<path class="cv-tint" d="M45,69L58,58L71,69L70,66.4L58,56.5L46,66.4Z"/>`,
  `<path d="M45,69L58,58L71,69M48,69V84M68,69V84M46,73H48M68,73H70M46,77H48M68,77H70M46,81H48M68,81H70M51,84V75H56V84M62,61.4V55H65V63.9"/>`,
  `</g>`,
  `<path class="cv-fine" d="M48,73H51M56,73H68M48,77H51M56,77H60M65,77H68M48,81H51M56,81H68"/>`,
  `<rect class="cv-tint" x="60" y="72" width="5" height="5"/>`,
  `<rect x="60" y="72" width="5" height="5"/>`,
  `<path class="cv-tint" d="${STEAM_BODY}"/>`,
  `<g stroke-linecap="butt">`,
  `<path class="cv-fine" d="${STEAM_SIDES[0]}"/>`,
  `<g opacity="0.6"><path class="cv-fine" d="${STEAM_SIDES[1]}"/></g>`,
  `<g opacity="0.3"><path class="cv-fine" d="${STEAM_SIDES[2]}"/></g>`,
  `</g>`,
  // The snow underfoot.
  `<path d="${SNOW_LINE}"/>`,
].join('')

// --- automation: Berlin, and testing as a craft ------------------------------

/*
 * Berlin at start-up scale: a street of Altbau roofs, none of them high, with
 * the Fernsehturm over them and an S-Bahn running past on the Stadtbahn's
 * viaduct. The sky is hatched like an engraving and stops at the roofs and the
 * tower.
 */

/** The tower's ball. */
const BALL = { x: 30, y: 31, r: 6 }

/** The mast over the ball, its tip and two bars clear of the hatching's rows: on the rows, the bars were lost in the ruling and the tip hung from it. */
const MAST = 'M30,25V7.5M29.1,17.5H30.9M29.4,12.5H30.6'

/**
 * The sky the hatching leaves round the mast, as it leaves the ball: a unit
 * clear of the bars and the tip, which still reads as a gap at 150px. It stops
 * on the ball's own curve, since the clip is even-odd and an overlap would let
 * the hatching back in.
 */
const MAST_CLEAR = (() => {
  const [half, top] = [2.5, 6]
  const y = BALL.y - Math.sqrt(BALL.r * BALL.r - half * half)
  return `M${BALL.x - half},${top}H${BALL.x + half}V${n(y)}A${BALL.r},${BALL.r} 0 0 0 ${BALL.x - half},${n(y)}Z`
})()

/**
 * The roofline along the street, left to right: a mansard, a pitched roof with
 * the tower's shaft rising behind it, a low house under a bare firewall, and
 * three more. The shaft widens toward the roofs: of even width it read as a
 * pin at 150px.
 */
const ROOFLINE =
  'M0,63L2,57H5V54H7V57H13L15,63V61L18,54H27.6L28.9,37H31.1L32.4,54H33L36,61V67H39V63.5H41V67H47' +
  'V58L49,53H61L63,58V62L66,57.5H70V52.5H72V57.5H77L80,62V64L82,59H91V52.5H93V59H100'

/** The houses under it: where each starts and ends, and its eave. */
const HOUSES: [number, number, number][] = [
  [0, 15, 63],
  [15, 36, 61],
  [36, 47, 67],
  [47, 63, 58],
  [63, 80, 62],
  [80, 100, 64],
]

/** The roofs over the eaves, all but the flat one. */
const ROOFS = 'M0,63L2,57H13L15,63ZM15,61L18,54H33L36,61ZM47,58L49,53H61L63,58ZM63,62L66,57.5H77L80,62ZM80,64L82,59H100V64Z'

/** Each house's windows, tall as an Altbau's, a column every 4 or so and a floor every 6, the ground floor left to the shops. */
const WINDOWS = HOUSES.map(([x0, x1, eave]) => {
  const cols = Math.floor((x1 - x0) / 4)
  let d = ''
  for (let y = eave + 4; y + 3 <= 82; y += 6) {
    for (let i = 0; i < cols; i++) d += `M${n(x0 + ((i + 0.5) * (x1 - x0)) / cols)},${y}v3`
  }
  return d
}).join('')

/**
 * The sky's hatching, cut at the roofs by the clip: a row every 5 from the
 * roofs up to 40 and every 10 over it. Even all the way up, it was the next
 * film's ruling drawn twice. Every roof and chimney tops out at least 2 under a
 * row: a unit under one, the ruling ran into its edge.
 */
const SKY_LINES = [65, 60, 55, 50, 45, 40, 30, 20, 10].map((y) => `M0,${y}H100`).join('')

/**
 * The S-Bahn, in from the right: two cars at the houses' scale, the roof just
 * under their lowest windows, the nose leaning back and the lower half tinted
 * for the trains' second colour. The nose stands 6 clear of the party wall at
 * 47: at 3 the two read as one doubled wall at 150px.
 */
const TRAIN = { top: 82.5, belt: 85, foot: 88, nose: 53, joint: 74.5 }
const TRAIN_CARS =
  `M${TRAIN.joint - 0.8},${TRAIN.top}H${TRAIN.nose + 3}L${TRAIN.nose},${TRAIN.belt}V${TRAIN.foot}H${TRAIN.joint - 0.8}Z` +
  `M101,${TRAIN.top}H${TRAIN.joint + 0.8}V${TRAIN.foot}H101`
const TRAIN_SKIRT = `M${TRAIN.nose},${TRAIN.belt}H101V${TRAIN.foot}H${TRAIN.nose}Z`
const TRAIN_WINDOWS = Array.from({ length: 11 }, (_, i) => TRAIN.nose + 5 + i * 3.8)
  .filter((x) => Math.abs(x - TRAIN.joint) > 2)
  .map((x) => `M${n(x)},${TRAIN.top + 1}h2.4v1.4h-2.4z`)
  .join('')

/**
 * The viaduct's arches under the deck, a bay every 20 on piers 3 wide, each a
 * low segment of a circle as the brick arches are. The viaduct runs off both
 * edges, a third of an arch showing at the left and two thirds at the right:
 * with the bays fitted to the frame it read as a border. One pier stands under
 * the party wall at 47, the rest clear of the walls. Drawn fine: in the full
 * line they outweighed the houses.
 */
const ARCHES = Array.from({ length: 6 }, (_, i) => {
  const [x0, x1, rise] = [i * 20 - 11.5, i * 20 + 5.5, 3.5]
  const r = n(((x1 - x0) ** 2 / 4 + rise * rise) / (2 * rise))
  return `M${x0},100V95A${r},${r} 0 0 1 ${x1},95V100`
}).join('')

const automation = [
  `<clipPath id="cv-art-automation-sky"><path clip-rule="evenodd" d="M0,0H100V100H0Z${ROOFLINE}V100H0Z${dot(BALL.x, BALL.y, BALL.r)}${MAST_CLEAR}"/></clipPath>`,
  `<path class="cv-fine" clip-path="url(#cv-art-automation-sky)" d="${SKY_LINES}"/>`,
  // The Fernsehturm: the ball with its band of windows, curved, since a bar straight across read as a theta; the collar under it, the mast.
  `<circle class="cv-tint" cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}"/>`,
  `<circle cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}"/>`,
  `<path d="M24.05,30.2Q30,33.6 35.95,30.2M28.2,38.6H31.8${MAST}"/>`,
  `<path class="cv-fine" d="M24.42,33.2Q30,36.4 35.58,33.2"/>`,
  // The street: the roofs, the eaves and the party walls, the windows. The ridge runs on over the shaft's foot, since the house stands in front of the tower: left open, the roof read as broken. The two walls behind the train stop at its roof.
  `<path class="cv-tint" d="${ROOFS}"/>`,
  `<path class="cv-fine" d="${WINDOWS}"/>`,
  `<path d="${ROOFLINE}${HOUSES.map(([x0, x1, eave]) => `M${x0},${eave}H${x1}`).join('')}M27.6,54H32.4M15,61V88M36,61V88M47,58V88M63,58V${TRAIN.top}M80,62V${TRAIN.top}"/>`,
  // The S-Bahn: its lower half and the arches' shadow, the cars, their windows; the deck and its arches.
  `<path class="cv-tint" d="${TRAIN_SKIRT}${ARCHES}"/>`,
  `<path d="${TRAIN_CARS}"/>`,
  `<path class="cv-fine" d="${TRAIN_WINDOWS}"/>`,
  `<path d="M0,88H100"/>`,
  `<path class="cv-fine" d="M0,90.5H100${ARCHES}"/>`,
].join('')

// --- leading QA: start-ups to large companies --------------------------------

/*
 * A skyline that grows from left to right: two small houses, three Amsterdam
 * gables on a canal, then three office towers, each taller than the last and
 * standing behind it, the last nearly as tall as the frame. The sky is hatched
 * like an engraving and stops at the roofs.
 */

/** The skyline's silhouette, left to right along the ground. */
const SKYLINE =
  'M0,90V81H2L7,73L12,81H14V77L18.5,69L23,77V90H25V58H26V55H26.8V52H27.5V48.5H29.5V52H30.2V55H31V58H32V54' +
  'C33.6,54 34,51 34,48V45Q35.75,39 37.5,45V48C37.5,51 37.9,54 39.5,54V59L42.75,52.5L46,59V90' +
  'H49V42H61V29H63.5V22H74V5H100V90Z'

/**
 * The towers, as much of each as shows: the first whole, the others behind the
 * one before. Side by side at even gaps, the three read as a bar chart.
 */
const TOWERS = ['M49,90V42H65V90Z', 'M61,42V29H63.5V22H76.5V29H79V90H65V42Z', 'M74,22V5H100V90H79V29H76.5V22Z']

/** Office windows as a grid of fine lines, a step of its own to each tower. */
const OFFICE_WINDOWS = [grid(4, 49, 42, 65, 90), grid(3.5, 61, 29, 79, 90), grid(3.75, 74, 5, 100, 90)]

const leadingQa = [
  `<clipPath id="cv-art-leading-qa-sky"><path clip-rule="evenodd" d="M0,0H100V100H0Z${SKYLINE}"/></clipPath>`,
  ...TOWERS.map((d, i) => `<clipPath id="cv-art-leading-qa-tower-${i}"><path d="${d}"/></clipPath>`),
  // The sky, a row every 4. The houses, the bell's cap and the towers top out at least 2 under a row:
  // a unit under one, the ruling ran into the edge and doubled it.
  `<path class="cv-fine" clip-path="url(#cv-art-leading-qa-sky)" d="${Array.from({ length: 22 }, (_, i) => `M0,${3 + i * 4}H100`).join('')}"/>`,
  // The start-ups, the door to one side and the second roof steeper: alike, the two read as one icon twice.
  `<path d="M2,90V81L7,73L12,81V90M14,90V77L18.5,69L23,77V90M4,90V85H6.5V90M17,81.5h3v3h-3z"/>`,
  // The gables: stepped, bell and spout.
  `<path d="M25,90V58H26V55H26.8V52H27.5V48.5H29.5V52H30.2V55H31V58H32V90"/>`,
  `<path d="M32,54C33.6,54 34,51 34,48V45Q35.75,39 37.5,45V48C37.5,51 37.9,54 39.5,54V90"/>`,
  `<path d="M39.5,59L42.75,52.5L46,59V90"/>`,
  `<path class="cv-fine" d="M27,62v4M30,62v4M27,70v4M30,70v4M27,78v4M30,78v4M34.5,57v4M37,57v4M34.5,65v4M37,65v4M34.5,73v4M37,73v4M41.5,63v4M44,63v4M41.5,71v4M44,71v4"/>`,
  `<path class="cv-fine" d="M24,94H47M28,97H43"/>`,
  // The towers, each tower's windows stopped at the one in front.
  `<path class="cv-tint" d="${TOWERS.join('')}"/>`,
  ...OFFICE_WINDOWS.map((d, i) => `<path class="cv-fine" clip-path="url(#cv-art-leading-qa-tower-${i})" d="${d}"/>`),
  `<path d="M49,90V42H65V90M61,42V29H63.5V22H76.5V29H79V90M70,22V17M74,22V5H100"/>`,
  `<path d="M0,90H100"/>`,
].join('')

// --- with AI: building with AI -----------------------------------------------

/*
 * A workflow as the hub's builder draws it, cards on a dotted canvas: a
 * ticket, a page and a design frame go into an agent, a person reviews what it
 * made and either sends it back (the dashed loop) or approves it, and a second
 * agent turns it into a table of test cases. The agents are the builder's
 * nodes, a header over input and output, and the review is the run page's
 * decision bar, request changes and approve.
 */

type Point = readonly [number, number]
type Box = { x: number; y: number; w: number; h: number }

/** A card with rounded corners round a box. */
function card({ x, y, w, h }: Box, r: number): string {
  return (
    `M${n(x + r)},${n(y)}H${n(x + w - r)}A${r},${r} 0 0 1 ${n(x + w)},${n(y + r)}V${n(y + h - r)}` +
    `A${r},${r} 0 0 1 ${n(x + w - r)},${n(y + h)}H${n(x + r)}A${r},${r} 0 0 1 ${n(x)},${n(y + h - r)}` +
    `V${n(y + r)}A${r},${r} 0 0 1 ${n(x + r)},${n(y)}Z`
  )
}

/** A card's header, its top `depth` with the card's corners: a band for the tint, and the rule under it. */
function header({ x, y, w }: Box, r: number, depth: number): { band: string; rule: string } {
  return {
    band: `M${n(x)},${n(y + depth)}V${n(y + r)}A${r},${r} 0 0 1 ${n(x + r)},${n(y)}H${n(x + w - r)}A${r},${r} 0 0 1 ${n(x + w)},${n(y + r)}V${n(y + depth)}Z`,
    rule: `M${n(x)},${n(y + depth)}H${n(x + w)}`,
  }
}

/** The sides the edges meet a box on. */
const leftOf = ({ x, y, h }: Box): Point => [x, y + h / 2]
const rightOf = ({ x, y, w, h }: Box): Point => [x + w, y + h / 2]
const topOf = ({ x, y, w }: Box): Point => [x + w / 2, y]

/** An edge as the canvas draws one, leaving and landing level: across, or down when `down` is set. */
function edge([ax, ay]: Point, [bx, by]: Point, down = false): string {
  const d = Math.max(Math.abs(down ? by - ay : bx - ax) / 2, 3)
  const c1 = down ? `${n(ax)},${n(ay + d)}` : `${n(ax + d)},${n(ay)}`
  const c2 = down ? `${n(bx)},${n(by - d)}` : `${n(bx - d)},${n(by)}`
  return `M${n(ax)},${n(ay)}C${c1} ${c2} ${n(bx)},${n(by)}`
}

/** The head of an arrow landing on a point, pointing right, or down when `down` is set. */
function arrive([x, y]: Point, down = false, s = 1.8): string {
  return down
    ? `M${n(x - s)},${n(y - s)}L${n(x)},${n(y)}L${n(x + s)},${n(y - s)}`
    : `M${n(x - s)},${n(y - s)}L${n(x)},${n(y)}L${n(x - s)},${n(y + s)}`
}

/**
 * The inputs down the left: a ticket, a page and a design frame, the frame
 * with its crop marks 1.8 out past its corners and a layout in it, a bar over
 * two panels. Empty, the marks read as a hash at 150px.
 */
const TICKET: Box = { x: 5, y: 9, w: 12, h: 10 }
const PAGE: Box = { x: 5.5, y: 24, w: 11, h: 14 }
const FRAME: Box = { x: 6, y: 44, w: 12, h: 10 }
const MARK = 1.8
const INPUTS = [
  `<path class="cv-tint" d="${card(TICKET, 1.2)}M5.5,24H16.5V38H5.5ZM6,44H18V54H6Z"/>`,
  `<path d="${card(TICKET, 1.2)}M7.5,12.2H13M5.5,24H16.5V38H5.5ZM6,44H18V54H6Z"/>`,
  `<path class="cv-fine" d="M7.5,15.6H14.5M7.5,17H11.5M8,27.8H14M8,30.5H14M8,33.2H14M8,35.9H11.5M6,47H18M8,49H11.4V52H8ZM12.6,49H16V52H12.6Z"/>`,
  `<path d="M4.2,44H6M6,42.2V44M18,42.2V44M19.8,44H18M4.2,54H6M6,55.8V54M19.8,54H18M18,55.8V54"/>`,
].join('')

/** The cards: the first agent and the review on the top row, the second agent under the first. */
const AGENT_A: Box = { x: 27, y: 22, w: 20, h: 18 }
const REVIEW: Box = { x: 63, y: 22, w: 20, h: 18 }
const AGENT_B: Box = { x: 16, y: 66, w: 20, h: 18 }
const CARD_R = 2.2
const CARDS = [AGENT_A, REVIEW, AGENT_B].map((b) => card(b, CARD_R)).join('')

/** How deep the agents' header is: at 5 its title has room and the band still reads as a header over the fields at 150px. */
const HEAD_DEPTH = 5

/**
 * An agent as the builder draws its node: a header with its title over two
 * zones, input and output, each with a field, the input's to the left and the
 * output's to the right. Its ports are on those sides, level with their
 * zones. The builder's settings zone is left out: with it the output port sat
 * on the card's corner.
 */
function agent(box: Box): { band: string; lines: string; fields: string; input: Point; output: Point } {
  const { x, y, w, h } = box
  const head = header(box, CARD_R, HEAD_DEPTH)
  const zone = (h - HEAD_DEPTH) / 2
  const mid = (i: number) => y + HEAD_DEPTH + zone * (i + 0.5)
  return {
    band: head.band,
    lines: `${head.rule}M${n(x + 3)},${n(y + HEAD_DEPTH / 2)}h8`,
    fields: `M${n(x)},${n(y + HEAD_DEPTH + zone)}H${n(x + w)}M${n(x + 3)},${n(mid(0))}h8M${n(x + w - 3)},${n(mid(1))}h-8`,
    input: [x, mid(0)],
    output: [x + w, mid(1)],
  }
}
const A = agent(AGENT_A)
const B = agent(AGENT_B)

/**
 * The review as the run page shows it, not a node: the draft over the
 * decision bar, request changes and the filled approve to its right. The
 * approved work leaves from under approve. With a header like the agents'
 * and pill buttons, it read as a bank card at 150px.
 */
const DRAFT = `M${REVIEW.x + 3},${REVIEW.y + 3.5}h14M${REVIEW.x + 3},${REVIEW.y + 6}h14M${REVIEW.x + 3},${REVIEW.y + 8.5}h9`
const BUTTON = { y: REVIEW.y + 11.5, h: 4 }
const CHANGES: Box = { x: REVIEW.x + 3, y: BUTTON.y, w: 7, h: BUTTON.h }
const APPROVE: Box = { x: REVIEW.x + 11.5, y: BUTTON.y, w: 5.5, h: BUTTON.h }
const APPROVED: Point = [APPROVE.x + APPROVE.w / 2, REVIEW.y + REVIEW.h]

/** Sent back for changes: up from the review, over the arrow between them, and down onto the first agent. */
const LOOP = (() => {
  const [ax, ay] = topOf(AGENT_A)
  const [rx, ry] = topOf(REVIEW)
  return `M${n(rx)},${n(ry)}C${n(rx)},${n(ry - 14)} ${n(ax)},${n(ay - 14)} ${n(ax)},${n(ay - 1)}`
})()

/**
 * The test cases, a table under a header: a key and a name on every row, both
 * in the fine line, the names of a length that varies as test names do. With
 * the keys in the drawing line they read as a column of bullets at 150px.
 */
const CASES: Box = { x: 54, y: 62, w: 38, h: 30.5 }
const CASES_R = 1.8
const CASES_DEPTH = 6
const CASES_HEAD = header(CASES, CASES_R, CASES_DEPTH)
const CASE_ROWS = [32, 26, 32, 24].map((len, i) => ({ y: CASES.y + CASES_DEPTH + 3.5 + i * 5.8, len }))

/** Where the cases take the second agent's output, level with its port. */
const CASES_IN: Point = [CASES.x, B.output[1]]

/**
 * The canvas: a dot every 5, the step of the other slides' grids, at a size
 * that reads as a canvas at 150px without pulling at the cards. It stops short
 * of everything on it, as the grids stop at the tower and the roofs.
 */
const CANVAS = (() => {
  const clear: Box[] = [
    TICKET,
    PAGE,
    { x: FRAME.x - MARK, y: FRAME.y - MARK, w: FRAME.w + 2 * MARK, h: FRAME.h + 2 * MARK },
    AGENT_A,
    REVIEW,
    AGENT_B,
    CASES,
  ]
  const covered = (px: number, py: number) =>
    clear.some(({ x, y, w, h }) => px > x - 1.2 && px < x + w + 1.2 && py > y - 1.2 && py < y + h + 1.2)
  let d = ''
  for (let y = 2.5; y < 100; y += 5) for (let x = 2.5; x < 100; x += 5) if (!covered(x, y)) d += dot(x, y, 0.45)
  return d
})()

const withAi = [
  `<path class="cv-fine cv-solid" d="${CANVAS}"/>`,
  INPUTS,
  `<path d="${[TICKET, PAGE, FRAME].map((b) => edge(rightOf(b), A.input)).join('')}"/>`,
  // The cards, the agents' headers a second tint over them; the review's draft and its two buttons.
  `<path class="cv-tint" d="${CARDS}"/>`,
  `<path class="cv-tint" d="${A.band}${B.band}"/>`,
  `<path d="${CARDS}${A.lines}${B.lines}${card(CHANGES, 1)}"/>`,
  `<path class="cv-fine" d="${A.fields}${B.fields}${DRAFT}"/>`,
  `<path class="cv-solid" d="${card(APPROVE, 1)}"/>`,
  // The ports, where the edges leave the agents and the review, and where the three inputs join.
  `<path class="cv-solid" d="${dot(...A.input, 1.3)}${dot(...A.output, 1.3)}${dot(...B.output, 1.3)}${dot(...APPROVED, 1.3)}"/>`,
  // Into the review, and back to the agent when it asks for changes.
  `<path d="${edge(A.output, leftOf(REVIEW))}${arrive(leftOf(REVIEW))}${arrive(topOf(AGENT_A), true, 1.6)}"/>`,
  `<path stroke-dasharray="2 2" d="${LOOP}"/>`,
  // Approved: down to the second agent, and on to the cases.
  `<path d="${edge(APPROVED, topOf(AGENT_B), true)}${arrive(topOf(AGENT_B), true)}"/>`,
  `<path d="${edge(B.output, CASES_IN)}${arrive(CASES_IN)}"/>`,
  // The cases: the card, its header and title, a key and a name on each row.
  `<path class="cv-tint" d="${card(CASES, CASES_R)}"/>`,
  `<path class="cv-tint" d="${CASES_HEAD.band}"/>`,
  `<path d="${card(CASES, CASES_R)}${CASES_HEAD.rule}M${CASES.x + 3.2},${CASES.y + CASES_DEPTH / 2}h10"/>`,
  `<path class="cv-fine" d="${CASE_ROWS.map(({ y, len }) => `M${CASES.x + 3.2},${n(y)}h4M${CASES.x + 11},${n(y)}h${len - 11}`).join('')}"/>`,
].join('')

/** Each chapter's picture on its film, by chapter id: inner SVG markup for a 0 0 100 100 viewBox, in currentColor. */
export const ART: Record<string, string> = {
  'growing-up': growingUp,
  bachelor,
  finland,
  automation,
  'leading-qa': leadingQa,
  'with-ai': withAi,
}

/**
 * How light the ink is, in OKLab: between 6.2 and 6.9 to 1 against the six
 * films before art.css softens it, and still light enough to stay the film's
 * hue rather than go brown or black.
 */
const INK_L = 0.38

/** The most chroma the ink takes, so the violet and the red, which reach it, do not shout over the teal, which stops at 0.06. */
const INK_C = 0.13

/** The colour a chapter's picture is printed in on its film, from the film's own dye. */
export function inkOf(dye: Dye): string {
  // A tenth inside the gamut's edge, where the hue still holds once it is rounded to a hex.
  const C = Math.min(maxChroma(INK_L, dye.h, 0.4) * 0.9, INK_C)
  const g = gamutMap(INK_L, C, dye.h)
  return linearToHex(g.r, g.g, g.b)
}
