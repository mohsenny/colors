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

// --- growing up: Tehran, and a lot of games ----------------------------------

/*
 * Azadi Tower in front of the Alborz, Damavand white on the right, the sky a
 * screen's pixel grid with a game pad in front of it, and the tower picked out
 * the way a strategy game picks out a unit: a health bar over it, and the
 * cursor.
 */

/** The pad, a box on half cells of the sky grid with a cell cut from each corner, the way a pixel screen rounds one. The grid stops at it, as at the ridge. */
const PAD = 'M7.5,10H35V12.5H37.5V22.5H35V25H7.5V22.5H5V12.5H7.5Z'

/** Its cross, a cell to each arm. */
const DPAD = 'M11.25,13.75h2.5v2.5h2.5v2.5h-2.5v2.5h-2.5v-2.5h-2.5v-2.5h2.5Z'

/** Its two buttons, as far right of the pad's middle as the cross is left of it. */
const BUTTONS = [
  [27.5, 19.25],
  [32.5, 15.75],
] as const

/** Its cable, out of the top of the frame right of the tab, so it never reads as plugged into it. */
const CABLE = 'M21.25,10C21.25,4 46,6.5 46,0'

/** The tower's outline and its arch, from the left foot round to the right. */
const TOWER =
  'M20,86C32,79 40,66 41,52C41.4,46 40.6,43 39,40.5V39H61V40.5C59.4,43 58.6,46 59,52C60,66 68,79 80,86'
const ARCH = 'M36.5,86V80C36.5,71 44,64.5 50,59C56,64.5 63.5,71 63.5,80V86'

/** The Alborz either side of the tower, Damavand on the right. */
const RIDGE_LEFT = 'M0,58L5,54L9,56L14,48.5L18,51.5L23,45L27,48L31,44.5L35,47.5L40.1,46'
const RIDGE_RIGHT = 'M59.9,46L64,49L66,47L78,28.5L79,28L81,28L82,28.5L100,46'

/** The sky down to the ridge and round the tower, so the grid stops at both. */
const SKY =
  'M0,0H100V46L82,28.5L81,28L79,28L78,28.5L66,47L64,49L59.9,46L59.1,46L59.2,44L60,42L61,40.5V39H58.5' +
  'Q50,35.5 41.5,39H39V40.5L40,42L40.8,44L40.9,46L40.1,46L35,47.5L31,44.5L27,48L23,45L18,51.5L14,48.5' +
  'L9,56L5,54L0,58Z'

const growingUp = [
  `<clipPath id="cv-art-tehran-sky"><path clip-rule="evenodd" d="${SKY}${PAD}"/></clipPath>`,
  `<path class="cv-fine" clip-path="url(#cv-art-tehran-sky)" d="${grid(5, 0, 0, 100, 60)}"/>`,
  // The pad and its cable.
  `<path class="cv-tint" d="${PAD}"/>`,
  `<path d="${PAD}${CABLE}"/>`,
  `<path class="cv-solid" d="${DPAD}"/>`,
  ...BUTTONS.map(([x, y]) => `<circle class="cv-solid" cx="${x}" cy="${y}" r="2.3"/>`),
  `<path d="${RIDGE_LEFT}${RIDGE_RIGHT}"/>`,
  `<path class="cv-tint" d="M78,28.5L79,28L81,28L82,28.5L90,36.5L87,34.5L84.5,37L81.5,34.5L79,37L76,34.5L72.5,36Z"/>`,
  // The tower: the swept sides, the arch, the lattice and window over it, the crown.
  `<path class="cv-tint" fill-rule="evenodd" d="${TOWER}Z${ARCH}Z"/>`,
  `<path d="${TOWER}${ARCH}M41.5,39Q50,35.5 58.5,39M47.9,52V48.5Q50,45.5 52.1,48.5V52Z"/>`,
  `<path class="cv-fine" d="M42.6,60L50,54.5L57.4,60M41.4,55.5L50,49M58.6,55.5L50,49M40.4,43H59.6"/>`,
  // The square in front of it.
  `<path d="M0,86H100"/>`,
  `<path class="cv-fine" d="M20,86L8,100M36.5,86L32,100M63.5,86L68,100M80,86L92,100M0,93H100"/>`,
  // Picked, as a unit is: a health bar over it, and the cursor.
  `<rect x="40" y="30" width="20" height="3" rx="0.8"/>`,
  `<path class="cv-solid" d="M41.2,31.2h13.5v0.6h-13.5z"/>`,
  `<path class="cv-tint" d="M72,58V73L75.5,69.5L78.5,76L81,75L78,68.5H83Z"/>`,
  `<path d="M72,58V73L75.5,69.5L78.5,76L81,75L78,68.5H83Z"/>`,
].join('')

// --- bachelor's: physics, maths, then software -------------------------------

/*
 * Graph paper with a throw on it: the ball on its parabola with its velocity,
 * the area under the curve counted off in strips, a pendulum swinging, and an
 * integral sign.
 */

/** The throw, from the origin at (14, 80) to (86, 80), its top at (50, 22). */
function throwAt(x: number): number {
  const u = (x - 50) / 36
  return 80 - 58 * (1 - u * u)
}

/** The strips under the curve from 30 to 70, each as tall as the curve at its middle: their tops as one staircase, their sides fine. */
const STRIP_TOPS = Array.from({ length: 8 }, (_, i) => throwAt(30 + i * 5 + 2.5))
const STAIRS = `M30,80${STRIP_TOPS.map((y, i) => `V${n(y)}H${30 + (i + 1) * 5}`).join('')}V80`
const STRIP_SIDES = STRIP_TOPS.slice(1)
  .map((y, i) => `M${35 + i * 5},80V${n(Math.max(y, STRIP_TOPS[i] as number))}`)
  .join('')

const bachelor = [
  `<path class="cv-fine" d="${grid(5, 0, 0, 100, 100)}"/>`,
  `<path class="cv-tint" d="${STAIRS}Z"/>`,
  `<path class="cv-fine" d="${STRIP_SIDES}"/>`,
  `<path d="${STAIRS}"/>`,
  // The axes.
  `<path d="M8,80H92M89,77.5L92,80L89,82.5M14,88V10M11.5,13L14,10L16.5,13"/>`,
  // The throw, and the ball on it with its velocity.
  `<path d="M14,80Q50,-36 86,80"/>`,
  `<circle class="cv-solid" cx="22" cy="${n(throwAt(22))}" r="2.2"/>`,
  `<path d="M22,${n(throwAt(22))}L27.2,44.6M24,46.3L27.2,44.6L28.4,48"/>`,
  // The pendulum, its swing dashed.
  `<path d="M71,8H89"/>`,
  `<path class="cv-fine" d="M73,8L75,5M77,8L79,5M81,8L83,5M85,8L87,5"/>`,
  `<path d="M80,8L90.3,31.6"/>`,
  `<circle class="cv-tint" cx="91.3" cy="34" r="3"/>`,
  `<circle cx="91.3" cy="34" r="3"/>`,
  `<path class="cv-fine" stroke-dasharray="1.6 1.8" d="M68.7,34A26,26 0 0 0 91.3,34"/>`,
  // The integral sign.
  `<path d="M32,12.5C31,10.5 28,10.8 27.6,14L26.6,27C26.3,30.2 23.4,30.6 22.4,28.6"/>`,
].join('')

// --- Finland: winter, snow and sauna -----------------------------------------

/*
 * A winter night at a sauna: the aurora's curtain with its rays, pines, the
 * cabin with its window lit and steam going up, and snow falling over all of
 * it.
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

/** One pine, its tip at (x, top) and its foot on the snow at `foot`: three tiers that droop at the ends, and a trunk. */
function pine(x: number, top: number, foot: number): string {
  const h = foot - top
  const w = h * 0.36
  const tier = (t: number) => top + h * t
  const p: [number, number][] = [
    [x, top],
    [x - w * 0.42, tier(0.34)],
    [x - w * 0.22, tier(0.31)],
    [x - w * 0.7, tier(0.62)],
    [x - w * 0.36, tier(0.59)],
    [x - w, tier(0.88)],
    [x + w, tier(0.88)],
    [x + w * 0.36, tier(0.59)],
    [x + w * 0.7, tier(0.62)],
    [x + w * 0.22, tier(0.31)],
    [x + w * 0.42, tier(0.34)],
  ]
  return `${line(p)}ZM${n(x)},${n(tier(0.88))}V${n(foot)}`
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

/** A six-armed flake with a V near the end of each arm. */
function flake(cx: number, cy: number, r: number): string {
  let d = ''
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 - Math.PI / 2
    const ex = cx + r * Math.cos(a)
    const ey = cy + r * Math.sin(a)
    const bx = cx + r * 0.6 * Math.cos(a)
    const by = cy + r * 0.6 * Math.sin(a)
    const s = r * 0.32
    d += `M${n(cx)},${n(cy)}L${n(ex)},${n(ey)}`
    d += `M${n(bx + s * Math.cos(a + 2.4))},${n(by + s * Math.sin(a + 2.4))}L${n(bx)},${n(by)}`
    d += `L${n(bx + s * Math.cos(a - 2.4))},${n(by + s * Math.sin(a - 2.4))}`
  }
  return d
}

const finland = [
  `<path class="cv-fine cv-solid" d="${SNOW}"/>`,
  // The aurora: its edge, the glow along it and the rays.
  `<path class="cv-tint" d="${AURORA_GLOW}"/>`,
  `<path class="cv-fine" d="${AURORA_RAYS[0]}"/>`,
  `<g opacity="0.6"><path class="cv-fine" d="${AURORA_RAYS[1]}"/></g>`,
  `<g opacity="0.3"><path class="cv-fine" d="${AURORA_RAYS[2]}"/></g>`,
  `<path class="cv-fine" d="${line(AURORA_EDGE)}"/>`,
  `<path d="${flake(78, 44, 5)}"/>`,
  `<path d="${flake(34, 48, 3.2)}"/>`,
  // Pines either side.
  `<path class="cv-tint" d="${pine(15, 46, 84)}${pine(26.5, 62, 84)}${pine(88, 52, 84)}"/>`,
  `<path d="${pine(15, 46, 84)}${pine(26.5, 62, 84)}${pine(88, 52, 84)}"/>`,
  // The sauna: snow on the roof, logs, the door, the lit window, the chimney and its steam.
  `<path class="cv-tint" d="M45,69L58,58L71,69L70,66.4L58,56.5L46,66.4Z"/>`,
  `<path d="M45,69L58,58L71,69M48,69V84M68,69V84M51,84V75H56V84M62,61.4V55H65V63.9"/>`,
  `<path class="cv-fine" d="M48,73H51M56,73H68M48,77H51M56,77H60M65,77H68M48,81H51M56,81H68"/>`,
  `<rect class="cv-tint" x="60" y="72" width="5" height="5"/>`,
  `<rect x="60" y="72" width="5" height="5"/>`,
  `<path d="M63.5,52C60.5,48.5 66.5,45.5 63.5,42C60.5,38.5 66,35.5 64,32"/>`,
  // The snow underfoot, and a frozen lake.
  `<path d="M0,84C20,82 35,85.5 50,84S80,82.5 100,84.5"/>`,
  `<path class="cv-fine" d="M8,90H40M56,93H92M18,96H34"/>`,
].join('')

// --- automation: Berlin, and testing as a craft ------------------------------

/*
 * Berlin at start-up scale: a street of Altbau roofs, none of them high, with
 * the Fernsehturm over them and a pipeline of four stages in the sky, all
 * passed. The sky is hatched as an engraving is, and every line of the
 * hatching is a passing check.
 */

/** The tower's ball. */
const BALL = { x: 30, y: 31, r: 6 }

/** The mast over the ball, its tip and two bars between the hatching's rows: on the rows, the bars were lost in the ruling and the tip hung from it. */
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
 * the tower's shaft standing out of it, a low house under a bare firewall, and
 * three more. The shaft widens toward the roofs: of even width it read as a
 * pin at 150px.
 */
const ROOFLINE =
  'M0,63L2,57H5V54H7V57H13L15,63V61L18,54H27.6L28.9,37H31.1L32.4,54H33L36,61V67H39V63.5H41V67H47' +
  'V58L49,53H61L63,58V62L66,56H70V52.5H72V56H77L80,62V64L82,59H91V55.5H93V59H100'

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
const ROOFS = 'M0,63L2,57H13L15,63ZM15,61L18,54H33L36,61ZM47,58L49,53H61L63,58ZM63,62L66,56H77L80,62ZM80,64L82,59H100V64Z'

/** Each house's windows, tall as an Altbau's, a column every 4 or so and a floor every 6, the ground floor left to the shops. */
const WINDOWS = HOUSES.map(([x0, x1, eave]) => {
  const cols = Math.floor((x1 - x0) / 4)
  let d = ''
  for (let y = eave + 4; y + 3 <= 82; y += 6) {
    for (let i = 0; i < cols; i++) d += `M${n(x0 + ((i + 0.5) * (x1 - x0)) / cols)},${y}v3`
  }
  return d
}).join('')

/** The pipeline's stages, a step apart along the top: at 4.2 the four fit between the mast and the edge. */
const STAGE = { y: 15, r: 4.2, step: 14 }
const STAGES = Array.from({ length: 4 }, (_, i) => 50 + i * STAGE.step)

/**
 * The sky's hatching, a row every 5 in two columns as a test run prints them:
 * each a passing check and a line after it, of a length that varies the way
 * test names do. Scattered at random, the checks read as birds at 150px. The
 * right column starts under the pipeline, so the stages have clear sky round
 * them.
 */
const SKY_CHECKS = (() => {
  const rng = new Rng(2016)
  let d = ''
  for (let y = 5; y < 70; y += 5) {
    for (const x of [5, 53]) {
      if (x > 5 && y < 25) continue
      d += `M${x},${y}l1.5,1.5l3,-3M${x + 7},${y}h${n(rng.range(22, 39))}`
    }
  }
  return d
})()

const automation = [
  `<clipPath id="cv-art-automation-sky"><path clip-rule="evenodd" d="M0,0H100V100H0Z${ROOFLINE}V100H0Z${dot(BALL.x, BALL.y, BALL.r)}${MAST_CLEAR}${STAGES.map((x) => dot(x, STAGE.y, STAGE.r)).join('')}"/></clipPath>`,
  `<path class="cv-fine" clip-path="url(#cv-art-automation-sky)" d="${SKY_CHECKS}"/>`,
  // The pipeline: four stages joined, each passed, the last one shipped.
  `<path d="${STAGES.slice(0, -1)
    .map((x) => `M${n(x + STAGE.r)},${STAGE.y}H${n(x + STAGE.step - STAGE.r)}`)
    .join('')}"/>`,
  ...STAGES.map((x) => `<circle cx="${x}" cy="${STAGE.y}" r="${STAGE.r}"/>`),
  `<circle class="cv-tint" cx="${STAGES.at(-1)}" cy="${STAGE.y}" r="${STAGE.r}"/>`,
  `<path d="${STAGES.map((x) => `M${n(x - 1.9)},${n(STAGE.y + 0.2)}l1.4,1.4l2.6,-2.8`).join('')}"/>`,
  // The Fernsehturm: the ball with its band of windows, curved, since a bar straight across read as a theta; the collar under it, the mast.
  `<circle class="cv-tint" cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}"/>`,
  `<circle cx="${BALL.x}" cy="${BALL.y}" r="${BALL.r}"/>`,
  `<path d="M24.05,30.2Q30,33.6 35.95,30.2M28.2,38.6H31.8${MAST}"/>`,
  `<path class="cv-fine" d="M24.42,33.2Q30,36.4 35.58,33.2"/>`,
  // The street: the roofs, the eaves and the party walls, the windows.
  `<path class="cv-tint" d="${ROOFS}"/>`,
  `<path class="cv-fine" d="${WINDOWS}"/>`,
  `<path d="${ROOFLINE}${HOUSES.map(([x0, x1, eave]) => `M${x0},${eave}H${x1}`).join('')}M15,61V88M36,61V88M47,58V88M63,58V88M80,62V88"/>`,
  `<path d="M0,88H100"/>`,
  `<path class="cv-fine" d="M0,92H100M6,96h7M22,96h7M38,96h7M54,96h7M70,96h7M86,96h7"/>`,
].join('')

// --- leading QA: start-ups to large companies --------------------------------

/*
 * A skyline that grows from left to right: two small houses, three Amsterdam
 * gables on a canal, then three towers, the last one too tall for the frame.
 * A magnifying glass is held over the first tower's windows, with a bug caught
 * in it. The sky is hatched like an engraving and stops at the roofs.
 */

/** The skyline's silhouette, left to right along the ground. */
const SKYLINE =
  'M0,90V80H2L7,73L12,80H14V78L18.5,71.5L23,78V90H25V58H26V55H26.8V52H27.5V48.5H29.5V52H30.2V55H31V58H32V54' +
  'C33.6,54 34,51 34,48V45Q35.75,41.5 37.5,45V48C37.5,51 37.9,54 39.5,54V59L42.75,52.5L46,59V90' +
  'H49V42H65V90H68V28H70V22H80V28H82V90H85V4H100V90Z'

const TOWERS = [
  // Office windows as a grid of fine lines.
  grid(4, 49, 42, 65, 90),
  grid(3.5, 68, 28, 82, 90),
  grid(3.75, 85, 4, 100, 90),
].join('')

/**
 * The glass, over the first tower, clearing the gables and the second tower
 * at radius 10. Over the middle tower it left the left half of the slide bare,
 * and at 11 it cut into the gables and hid the tower it was over.
 */
const GLASS = { x: 57, y: 64, r: 10 }

/** The glass's handle, out from just past its rim at 45 degrees, as an outline from one side round to the other. */
const HANDLE = (() => {
  const [u, h, from, to] = [Math.SQRT1_2, 2.25, GLASS.r + 0.8, GLASS.r + 13]
  const at = (d: number, side: number) => `${n(GLASS.x + u * d + u * h * side)},${n(GLASS.y + u * d - u * h * side)}`
  return `M${at(from, 1)}L${at(to, 1)}A${h},${h} 0 0 1 ${at(to, -1)}L${at(from, -1)}`
})()

/** The bug, centred on (x, y) and drawn at scale s: head, body split into wings, six legs, two feelers. */
function bug(x: number, y: number, s: number): string[] {
  const p = (dx: number, dy: number) => `${n(x + dx * s)},${n(y + dy * s)}`
  const legs = [-1, 1]
    .map((k) => `M${p(5.8 * k, -3)}L${p(10 * k, -5.5)}M${p(6.1 * k, 1.5)}L${p(11 * k, 1.5)}M${p(5.6 * k, 6)}L${p(9.8 * k, 9)}`)
    .join('')
  const feelers = [-1, 1].map((k) => `M${p(1.4 * k, -12)}C${p(2.5 * k, -14.5)} ${p(4.5 * k, -15.5)} ${p(6 * k, -15.2)}`).join('')
  return [
    `<circle cx="${n(x)}" cy="${n(y - 9.5 * s)}" r="${n(3 * s)}"/>`,
    `<ellipse class="cv-tint" cx="${n(x)}" cy="${n(y + s)}" rx="${n(6.2 * s)}" ry="${n(8 * s)}"/>`,
    `<ellipse cx="${n(x)}" cy="${n(y + s)}" rx="${n(6.2 * s)}" ry="${n(8 * s)}"/>`,
    `<path d="M${p(0, -7)}L${p(0, 9)}${legs}${feelers}"/>`,
  ]
}

const leadingQa = [
  `<clipPath id="cv-art-leading-qa-sky"><path clip-rule="evenodd" d="M0,0H100V100H0Z${SKYLINE}"/></clipPath>`,
  `<clipPath id="cv-art-leading-qa-glass"><path clip-rule="evenodd" d="M0,0H100V100H0Z${dot(GLASS.x, GLASS.y, GLASS.r)}${HANDLE}Z"/></clipPath>`,
  // Everything behind the glass, cut round it.
  `<g clip-path="url(#cv-art-leading-qa-glass)">`,
  `<path class="cv-fine" clip-path="url(#cv-art-leading-qa-sky)" d="${Array.from({ length: 22 }, (_, i) => `M0,${3 + i * 4}H100`).join('')}"/>`,
  // The start-ups.
  `<path d="M2,90V80L7,73L12,80V90M14,90V78L18.5,71.5L23,78V90M5.5,90V85H8.5V90M17,81.5h3v3h-3z"/>`,
  // The gables: stepped, bell and spout.
  `<path d="M25,90V58H26V55H26.8V52H27.5V48.5H29.5V52H30.2V55H31V58H32V90"/>`,
  `<path d="M32,54C33.6,54 34,51 34,48V45Q35.75,41.5 37.5,45V48C37.5,51 37.9,54 39.5,54V90"/>`,
  `<path d="M39.5,59L42.75,52.5L46,59V90"/>`,
  `<path class="cv-fine" d="M27,62v4M30,62v4M27,70v4M30,70v4M27,78v4M30,78v4M34.5,57v4M37,57v4M34.5,65v4M37,65v4M34.5,73v4M37,73v4M41.5,63v4M44,63v4M41.5,71v4M44,71v4"/>`,
  `<path class="cv-fine" d="M24,94H47M28,97H43"/>`,
  // The towers.
  `<path class="cv-tint" d="M49,90V42H65V90ZM68,90V28H70V22H80V28H82V90ZM85,90V4H100V90Z"/>`,
  `<path class="cv-fine" d="${TOWERS}"/>`,
  `<path d="M49,90V42H65V90M68,90V28H70V22H80V28H82V90M75,22V16M85,90V4H100"/>`,
  `</g>`,
  `<path d="M0,90H100"/>`,
  // The glass and its inner rim, the bug as large as fits inside the rim, the handle. The bug
  // sits a little low, since its feelers reach further up than its legs down. At 0.6 its legs
  // and feelers crossed the rim.
  `<circle class="cv-tint" cx="${GLASS.x}" cy="${GLASS.y}" r="${GLASS.r}"/>`,
  `<circle class="cv-fine" cx="${GLASS.x}" cy="${GLASS.y}" r="${GLASS.r - 2.2}"/>`,
  ...bug(GLASS.x, GLASS.y + 0.8, 0.46),
  `<circle cx="${GLASS.x}" cy="${GLASS.y}" r="${GLASS.r}"/>`,
  `<path class="cv-tint" d="${HANDLE}Z"/>`,
  `<path d="${HANDLE}"/>`,
].join('')

// --- with AI: building with AI -----------------------------------------------

/*
 * A workflow as the hub's builder draws it, cards on a dotted canvas: a
 * ticket, a page and a design frame go into an agent, a person reviews what it
 * made and either sends it back (the dashed loop) or approves it, and a second
 * agent turns it into a ticked list of test cases. The agents carry a
 * sparkle with a small one by it; the person's card is the one without.
 */

/** The four-point sparkle: four tips joined by curves that bow in. */
function sparkle(cx: number, cy: number, r: number): string {
  const k = r * 0.16
  return (
    `M${n(cx)},${n(cy - r)}Q${n(cx + k)},${n(cy - k)} ${n(cx + r)},${n(cy)}` +
    `Q${n(cx + k)},${n(cy + k)} ${n(cx)},${n(cy + r)}` +
    `Q${n(cx - k)},${n(cy + k)} ${n(cx - r)},${n(cy)}` +
    `Q${n(cx - k)},${n(cy - k)} ${n(cx)},${n(cy - r)}Z`
  )
}

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

/** The middle of a box, and of the sides the edges meet it on. */
const middleOf = ({ x, y, w, h }: Box): Point => [x + w / 2, y + h / 2]
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

/** The inputs down the left: a ticket, a page with its corner folded, and a design frame, its crop marks 1.8 out past its corners. */
const TICKET: Box = { x: 5, y: 9, w: 12, h: 10 }
const PAGE: Box = { x: 5.5, y: 24, w: 11, h: 14 }
const FRAME: Box = { x: 6, y: 44, w: 12, h: 10 }
const MARK = 1.8
const INPUTS = [
  `<path class="cv-tint" d="${card(TICKET, 1.2)}M5.5,24H13L16.5,27.5V38H5.5ZM6,44H18V54H6Z"/>`,
  `<path d="${card(TICKET, 1.2)}M10.2,12.2H14.8M5.5,24H13L16.5,27.5V38H5.5ZM13,24V27.5H16.5M6,44H18V54H6Z"/>`,
  `<path class="cv-fine" d="M7,15.6H15M7,17H12M8,30.5H14M8,33.2H14M8,35.9H11.5"/>`,
  `<rect class="cv-solid" x="7" y="11" width="2.4" height="2.4" rx="0.4"/>`,
  // The frame's crop marks, and the picture in it.
  `<path d="M4.2,44H6M6,42.2V44M18,42.2V44M19.8,44H18M4.2,54H6M6,55.8V54M19.8,54H18M18,55.8V54"/>`,
  `<path d="M7.8,52.2L11,48.5L13.4,51L14.6,49.8L16.2,52.2"/>`,
  `<circle class="cv-solid" cx="14.6" cy="46.9" r="1"/>`,
].join('')

/** The cards: the first agent and the person's on the top row, the second agent under the first. */
const AGENT_A: Box = { x: 27, y: 22, w: 20, h: 18 }
const REVIEW: Box = { x: 63, y: 22, w: 20, h: 18 }
const AGENT_B: Box = { x: 16, y: 66, w: 20, h: 18 }
const CARDS = [AGENT_A, REVIEW, AGENT_B].map((b) => card(b, 2.2)).join('')

/**
 * The agents' mark: a sparkle low and left of the card's middle and a small
 * one up by its corner, the pair AI features carry. One four-point star alone
 * is Gemini's logo, and these agents are Claude. The large one reaches 5.2,
 * still the first thing to read at 150px, and the pair stay clear of the
 * card's sides and of each other.
 */
const SPARKLE_R = 5.2
function agentMark(box: Box): string {
  const [cx, cy] = middleOf(box)
  return sparkle(cx - 1.5, cy + 1.5, SPARKLE_R) + sparkle(cx + 5, cy - 4.5, SPARKLE_R * 0.42)
}

/** The person, a head and shoulders that end level with the chin, in the middle of the card. */
const PERSON = (() => {
  const [cx, cy] = middleOf(REVIEW)
  const shoulders = `M${n(cx - 5.2)},${n(cy + 6)}C${n(cx - 5.2)},${n(cy + 0.6)} ${n(cx + 5.2)},${n(cy + 0.6)} ${n(cx + 5.2)},${n(cy + 6)}`
  return `${dot(cx, cy - 2.6, 2.6)}${shoulders}`
})()

/** The approval, a check in a ring on the way out of the review: at a radius of 3.4 the check still reads at 150px. */
const STAMP = { x: middleOf(REVIEW)[0], y: REVIEW.y + REVIEW.h + 6.5, r: 3.4 }

/** Sent back for changes: up from the review, over the arrow between them, and down onto the first agent. */
const LOOP = (() => {
  const [ax, ay] = topOf(AGENT_A)
  const [rx, ry] = topOf(REVIEW)
  return `M${n(rx)},${n(ry)}C${n(rx)},${n(ry - 14)} ${n(ax)},${n(ay - 14)} ${n(ax)},${n(ay - 1)}`
})()

/** The test cases: a check and a name on every row, the names of a length that varies as test names do. */
const CASES: Box = { x: 54, y: 62, w: 38, h: 30.5 }
const CASE_ROWS = [32, 26, 32, 24].map((len, i) => ({ y: CASES.y + 6 + i * 6.5, len }))

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
    { x: STAMP.x - STAMP.r, y: STAMP.y - STAMP.r, w: 2 * STAMP.r, h: 2 * STAMP.r },
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
  `<path d="${[TICKET, PAGE, FRAME].map((b) => edge(rightOf(b), leftOf(AGENT_A))).join('')}"/>`,
  // A port where the three meet the agent, so they join there rather than cross.
  `<path class="cv-solid" d="${dot(...leftOf(AGENT_A), 1.3)}"/>`,
  // The cards, the agents' sparkles and the person.
  `<path class="cv-tint" d="${CARDS}"/>`,
  `<path d="${CARDS}${PERSON}"/>`,
  `<path class="cv-solid" d="${agentMark(AGENT_A)}${agentMark(AGENT_B)}"/>`,
  // Into the review, and back to the agent when it asks for changes.
  `<path d="${edge(rightOf(AGENT_A), leftOf(REVIEW))}${arrive(leftOf(REVIEW))}${arrive(topOf(AGENT_A), true, 1.6)}"/>`,
  `<path stroke-dasharray="2 2" d="${LOOP}"/>`,
  // Approved: the stamp, down to the second agent, and on to the cases.
  `<circle class="cv-tint" cx="${STAMP.x}" cy="${STAMP.y}" r="${STAMP.r}"/>`,
  `<path d="${dot(STAMP.x, STAMP.y, STAMP.r)}M${n(STAMP.x - 1.7)},${n(STAMP.y + 0.1)}l1.2,1.2l2.3,-2.4M${STAMP.x},${REVIEW.y + REVIEW.h}V${n(STAMP.y - STAMP.r)}"/>`,
  `<path d="${edge([STAMP.x, STAMP.y + STAMP.r], topOf(AGENT_B), true)}${arrive(topOf(AGENT_B), true)}"/>`,
  `<path d="${edge(rightOf(AGENT_B), leftOf(CASES))}${arrive(leftOf(CASES))}"/>`,
  `<path class="cv-tint" d="${card(CASES, 1.8)}"/>`,
  `<path d="${card(CASES, 1.8)}${CASE_ROWS.map(({ y }) => `M${CASES.x + 3.2},${n(y)}l1.5,1.5l3,-3`).join('')}"/>`,
  `<path class="cv-fine" d="${CASE_ROWS.map(({ y, len }) => `M${CASES.x + 11},${n(y)}h${len - 11}`).join('')}"/>`,
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
