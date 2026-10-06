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

// --- growing up: Tehran, and a lot of games ----------------------------------

/*
 * Azadi Tower in front of the Alborz, Damavand white on the right, the sky a
 * screen's pixel grid with a pixel sun in it, and the tower picked out the way
 * a strategy game picks out a unit: a health bar over it, and the cursor.
 */

/** The sun, a disc drawn in half cells of the sky grid, outlined step by step down its right side and back up its left. */
const SUN = (() => {
  const [cx, cy, r, cell] = [20, 19, 10, 2.5]
  const rows: [number, number, number][] = []
  for (let y = cy - r; y < cy + r - 1e-6; y += cell) {
    const mid = y + cell / 2 - cy
    const half = Math.round(Math.sqrt(r * r - mid * mid) / cell) * cell
    if (half > 0) rows.push([y, y + cell, half])
  }
  const right = rows.flatMap(([y0, y1, h]): [number, number][] => [[cx + h, y0], [cx + h, y1]])
  const left = rows.flatMap(([y0, y1, h]): [number, number][] => [[cx - h, y0], [cx - h, y1]]).reverse()
  return `${line([...right, ...left])}Z`
})()

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
  `<clipPath id="cv-art-tehran-sky"><path d="${SKY}"/></clipPath>`,
  `<path class="cv-fine" clip-path="url(#cv-art-tehran-sky)" d="${grid(5, 0, 0, 100, 60)}"/>`,
  `<path class="cv-tint" d="${SUN}"/>`,
  `<path d="${SUN}"/>`,
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
 * A test run as it reads on a screen: a pipeline of stages, all passed, and
 * row after row of passing checks behind, with the one bug caught under a
 * magnifying glass.
 */

/** The log: a check and a line on every row, of a length that varies the way test names do. */
const LOG = (() => {
  const lengths = [52, 70, 38, 61, 77, 45, 66, 30, 58, 72, 49]
  let d = ''
  for (const [i, len] of lengths.entries()) {
    const y = 34 + i * 6
    d += `M5,${y}l1.5,1.5l3,-3M14,${y}h${len}`
  }
  return d
})()

/** The lens and what it hides of the log. */
const LENS = { x: 54, y: 62, r: 18 }

const automation = [
  `<clipPath id="cv-art-automation-log"><path clip-rule="evenodd" d="M0,0H100V100H0ZM${LENS.x - LENS.r},${LENS.y}a${LENS.r},${LENS.r} 0 1 0 ${2 * LENS.r},0a${LENS.r},${LENS.r} 0 1 0 ${-2 * LENS.r},0Z"/></clipPath>`,
  `<path class="cv-fine" clip-path="url(#cv-art-automation-log)" d="${LOG}"/>`,
  // The pipeline: four stages joined, each passed, the last one shipped.
  `<path d="M19.2,15H32.8M43.2,15H56.8M67.2,15H80.8"/>`,
  `<circle cx="14" cy="15" r="5.2"/><circle cx="38" cy="15" r="5.2"/><circle cx="62" cy="15" r="5.2"/><circle cx="86" cy="15" r="5.2"/>`,
  `<circle class="cv-tint" cx="86" cy="15" r="5.2"/>`,
  `<path d="M11.6,15.2l1.7,1.7l3.2,-3.4M35.6,15.2l1.7,1.7l3.2,-3.4M59.6,15.2l1.7,1.7l3.2,-3.4M83.6,15.2l1.7,1.7l3.2,-3.4"/>`,
  // The glass.
  `<circle class="cv-tint" cx="${LENS.x}" cy="${LENS.y}" r="${LENS.r}"/>`,
  `<circle cx="${LENS.x}" cy="${LENS.y}" r="${LENS.r}"/>`,
  `<circle class="cv-fine" cx="${LENS.x}" cy="${LENS.y}" r="${LENS.r - 2.4}"/>`,
  `<path class="cv-tint" d="M69.1,73.9L83.6,88.4A2.25,2.25 0 0 1 80.4,91.6L65.9,77.1Z"/>`,
  `<path d="M69.1,73.9L83.6,88.4A2.25,2.25 0 0 1 80.4,91.6L65.9,77.1"/>`,
  // The bug: head, body split into wings, six legs, two feelers.
  `<circle cx="54" cy="52.5" r="3"/>`,
  `<ellipse class="cv-tint" cx="54" cy="63" rx="6.2" ry="8"/>`,
  `<ellipse cx="54" cy="63" rx="6.2" ry="8"/>`,
  `<path d="M54,55V71M48.2,59L44,56.5M47.9,63.5H43M48.4,68L44.2,71M59.8,59L64,56.5M60.1,63.5H65M59.6,68L63.8,71M52.6,50C51.5,47.5 49.5,46.5 48,46.8M55.4,50C56.5,47.5 58.5,46.5 60,46.8"/>`,
  `<circle class="cv-solid" cx="51.3" cy="61" r="0.9"/><circle class="cv-solid" cx="56.7" cy="61" r="0.9"/><circle class="cv-solid" cx="51.5" cy="66.5" r="0.9"/><circle class="cv-solid" cx="56.5" cy="66.5" r="0.9"/>`,
].join('')

// --- leading QA: start-ups to large companies --------------------------------

/*
 * A skyline that grows from left to right: two small houses, Berlin's TV
 * tower, three Amsterdam gables on a canal, then the towers, the last one too
 * tall for the frame. The sky is hatched like an engraving and stops at the
 * roofs.
 */

/** The skyline's silhouette, left to right along the ground. */
const SKYLINE =
  'M0,90V80H2L7,73L12,80H14V78L18.5,71.5L23,78V90H28.4L29.2,36.4H30.8L31.6,90H36V62H37V59H37.8V56H38.5V52.5' +
  'H40.5V56H41.2V59H42V62H43V58C44.6,58 45,55 45,52V49Q46.75,45.5 48.5,49V52C48.5,55 48.9,58 50.5,58V63L53.75,56.5L57,63V90' +
  'H60V50H71V90H73V40H75V34H83V40H85V90H87V16H100V90Z' +
  'M24.6,31a5.4,5.4 0 1 0 10.8,0a5.4,5.4 0 1 0 -10.8,0Z'

const TOWERS = [
  // Office windows as a grid of fine lines.
  grid(2.75, 60, 50, 71, 90),
  grid(3, 73, 40, 85, 90),
  grid(3.25, 87, 16, 100, 90),
].join('')

const leadingQa = [
  `<clipPath id="cv-art-leading-qa-sky"><path clip-rule="evenodd" d="M0,0H100V100H0Z${SKYLINE}"/></clipPath>`,
  `<path class="cv-fine" clip-path="url(#cv-art-leading-qa-sky)" d="${Array.from({ length: 22 }, (_, i) => `M0,${3 + i * 4}H100`).join('')}"/>`,
  // The start-ups.
  `<path d="M2,90V80L7,73L12,80V90M14,90V78L18.5,71.5L23,78V90M5.5,90V85H8.5V90M17,81.5h3v3h-3z"/>`,
  // The Fernsehturm: shaft, ball, and the mast.
  `<path d="M28.4,90L29.3,36.5M31.6,90L30.7,36.5M30,25.8V7M29.1,17H30.9M29.4,12H30.6"/>`,
  `<circle class="cv-tint" cx="30" cy="31" r="5.2"/>`,
  `<circle cx="30" cy="31" r="5.2"/>`,
  `<path d="M24.8,31H35.2M28.6,37.2H31.4"/>`,
  // The gables: stepped, bell and spout.
  `<path d="M36,90V62H37V59H37.8V56H38.5V52.5H40.5V56H41.2V59H42V62H43V90"/>`,
  `<path d="M43,58C44.6,58 45,55 45,52V49Q46.75,45.5 48.5,49V52C48.5,55 48.9,58 50.5,58V90"/>`,
  `<path d="M50.5,63L53.75,56.5L57,63V90"/>`,
  `<path class="cv-fine" d="M38,66v4M41,66v4M38,74v4M41,74v4M38,82v4M41,82v4M45.5,61v4M48,61v4M45.5,69v4M48,69v4M45.5,77v4M48,77v4M52.5,67v4M55,67v4M52.5,75v4M55,75v4"/>`,
  `<path class="cv-fine" d="M35,94H58M39,97H54"/>`,
  // The towers.
  `<path class="cv-tint" d="M60,90V50H71V90ZM73,90V40H75V34H83V40H85V90ZM87,90V16H100V90Z"/>`,
  `<path class="cv-fine" d="${TOWERS}"/>`,
  `<path d="M60,90V50H71V90M73,90V40H75V34H83V40H85V90M79,34V28M87,90V16H100"/>`,
  `<path d="M0,90H100"/>`,
].join('')

// --- with AI: building with AI -----------------------------------------------

/*
 * The sparkle at the middle of a small system: space bent under it as in
 * Gravity, a ringed planet on its orbit as in Solar, three sheets crossing as
 * in Lightbox, and a network of nodes, the agents, chained to it.
 */

const WELL = { x: 50, y: 42 }

/** The sparkle's reach, the tallest thing on the slide after the orbit: at 12 the orbit swallowed it. */
const SPARKLE_R = 14

/** A grid line pulled toward the well, sampled every 2 units. */
function bent(points: [number, number][]): string {
  return line(
    points.map(([x, y]) => {
      const dx = WELL.x - x
      const dy = WELL.y - y
      const r = Math.hypot(dx, dy)
      if (r < 1e-6) return [x, y]
      const pull = 9 * Math.exp(-(r * r) / (2 * 20 * 20))
      return [x + (dx / r) * pull, y + (dy / r) * pull]
    }),
  )
}

const BENT = (() => {
  let d = ''
  const ticks = Array.from({ length: 52 }, (_, i) => -2 + i * 2)
  for (let k = 0; k <= 12; k++) {
    const c = k * 8.33
    d += bent(ticks.map((t) => [c, t]))
    d += bent(ticks.map((t) => [t, c]))
  }
  return d
})()

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

/** The orbit, tilted, and the planet on it, a little past its top right. */
const ORBIT = { rx: 36, ry: 11.5, tilt: -10 }
const PLANET = (() => {
  const a = (-38 * Math.PI) / 180
  const t = (ORBIT.tilt * Math.PI) / 180
  const x = ORBIT.rx * Math.cos(a)
  const y = ORBIT.ry * Math.sin(a)
  return { x: WELL.x + x * Math.cos(t) - y * Math.sin(t), y: WELL.y + x * Math.sin(t) + y * Math.cos(t), r: 6 }
})()

/** The planet's ring, an ellipse round it whose far half goes behind it. */
const RING = (() => {
  const t = (-20 * Math.PI) / 180
  const pts: [number, number, boolean][] = Array.from({ length: 73 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2
    const x = PLANET.x + 11.5 * Math.cos(a) * Math.cos(t) - 3.2 * Math.sin(a) * Math.sin(t)
    const y = PLANET.y + 11.5 * Math.cos(a) * Math.sin(t) + 3.2 * Math.sin(a) * Math.cos(t)
    const hidden = Math.sin(a) < 0 && Math.hypot(x - PLANET.x, y - PLANET.y) < PLANET.r + 0.8
    return [x, y, hidden]
  })
  let d = ''
  let run: [number, number][] = []
  for (const [x, y, hidden] of pts) {
    if (hidden) {
      if (run.length > 1) d += line(run)
      run = []
    } else run.push([x, y])
  }
  if (run.length > 1) d += line(run)
  return d
})()

/** The agents as a small network: three in, two, one, then up to the sparkle. */
const LAYER_IN: [number, number][] = [
  [8, 62],
  [8, 74],
  [8, 86],
]
const LAYER_MID: [number, number][] = [
  [22, 68],
  [22, 80],
]
const AGENT_OUT: [number, number] = [36, 74]
const NETWORK =
  LAYER_IN.flatMap((a) => LAYER_MID.map((b) => line([a, b]))).join('') +
  LAYER_MID.map((b) => line([b, AGENT_OUT])).join('') +
  line([AGENT_OUT, [WELL.x, WELL.y + SPARKLE_R]])

/** Three sheets crossing, each its own tint so the crossings come out deeper, as on the lightbox. */
const SHEETS = [
  'M63,66.5l14.8,-1.2l1.2,14.8l-14.8,1.2z',
  'M70.5,72.5l14.9,0.8l-0.8,14.9l-14.9,-0.8z',
  'M61.5,76.5l14.9,0.3l-0.3,14.9l-14.9,-0.3z',
]

const withAi = [
  `<path class="cv-fine" d="${BENT}"/>`,
  // The orbit, hidden behind the planet, and the ringed planet on it.
  `<clipPath id="cv-art-with-ai-orbit"><path clip-rule="evenodd" d="M0,0H100V100H0ZM${PLANET.x - PLANET.r - 0.8},${PLANET.y}a${PLANET.r + 0.8},${PLANET.r + 0.8} 0 1 0 ${2 * PLANET.r + 1.6},0a${PLANET.r + 0.8},${PLANET.r + 0.8} 0 1 0 ${-2 * PLANET.r - 1.6},0Z"/></clipPath>`,
  `<ellipse clip-path="url(#cv-art-with-ai-orbit)" cx="${WELL.x}" cy="${WELL.y}" rx="${ORBIT.rx}" ry="${ORBIT.ry}" transform="rotate(${ORBIT.tilt} ${WELL.x} ${WELL.y})"/>`,
  `<circle class="cv-tint" cx="${PLANET.x}" cy="${PLANET.y}" r="${PLANET.r}"/>`,
  `<circle cx="${PLANET.x}" cy="${PLANET.y}" r="${PLANET.r}"/>`,
  `<path d="${RING}"/>`,
  // The sparkle at the middle.
  `<path class="cv-tint" d="${sparkle(WELL.x, WELL.y, SPARKLE_R)}"/>`,
  `<path d="${sparkle(WELL.x, WELL.y, SPARKLE_R)}"/>`,
  // The sheets.
  ...SHEETS.map((d) => `<path class="cv-tint" d="${d}"/>`),
  `<path d="${SHEETS.join('')}"/>`,
  // The agents, chained to the sparkle.
  `<path d="${NETWORK}"/>`,
  ...[...LAYER_IN, ...LAYER_MID, AGENT_OUT].map(([x, y]) => `<circle class="cv-solid" cx="${x}" cy="${y}" r="1.9"/>`),
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
