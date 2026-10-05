/*
 * The net, and how a mass pulls it in.
 *
 * Near a mass there is more true distance packed into less room: Flamm's
 * proper radial distance l(r) grows faster than r. Walk in from an anchor
 * outside the room and count the extra distance you have crossed by the time
 * you reach a rest point; the point moves inward by exactly that much. Far out
 * the extra is nothing and the rope stays put. Near the body it piles up, so
 * the ropes are drawn toward the mass and converge on it, which is the
 * climbing net with something heavy sitting in it.
 *
 * Inward displacement grows by at most the rest spacing per unit of rest
 * radius, so the map is monotonic and the ropes never cross.
 */

/** Past this the extra distance is a hair and the net is at rest. */
export const ANCHOR = 14
/** Rope sample spacing, as a share of the distance from the body. */
const STEP = 0.06
const STEP_MIN = 0.03
const TABLE = 2048

/**
 * The net comes in levels, each a third the spacing of the one above and
 * nested in it: a finer level's ropes fall between the coarser ones, never on
 * them, so zooming in fills in detail without moving a rope. Thirds, not
 * halves, because only thirds keep every level on the half-steps (below).
 * Each level is built out as far as `levelView` ever shows it.
 */
export const LEVELS = [
  { spacing: 3, extent: 30 },
  { spacing: 1, extent: 12.5 },
  { spacing: 1 / 3, extent: 4.9 },
  { spacing: 1 / 9, extent: 2.3 },
]

/** The camera distance at which the room shows the one-unit level and nothing finer. */
export const VIEW_AT = 25
/** Where a fully shown level starts to dissolve and where it is gone, past the body, at VIEW_AT. */
const REACH_IN = 2
const REACH_OUT = 11

export interface LevelView {
  /** 0 hidden, 1 fully in. */
  weight: number
  /** Rest radius where the level starts to dissolve, and where it is gone. */
  reach: [number, number]
}

/**
 * How much of a level shows at a camera distance. The spacing on screen stays
 * about the same at every zoom: backing off three times as far hands the room
 * to the next coarser level, and coming in grows the next finer one out of the
 * body, where the bending is. The coarsest level is always in.
 */
export function levelView(level: number, distance: number): LevelView {
  const z = distance / VIEW_AT
  const weight = level === 0 ? 1 : Math.max(0, Math.min(1, Math.log(LEVELS[level].spacing / z) / Math.log(3) + 1))
  return { weight, reach: [1 + weight * REACH_IN * z, 1 + weight * REACH_OUT * z] }
}

/**
 * The camera distance at which the net is drawn out to `rest` units from the
 * centre. For an eye that is not on the orbit, such as one riding a probe.
 */
export function detailFor(rest: number): number {
  return (VIEW_AT * Math.max(0, rest - 1)) / REACH_OUT
}

export interface Level {
  spacing: number
  /** The level's first vertex. */
  first: number
  /** The level's ropes nearest the body first: how far each misses the centre... */
  miss: Float32Array
  /** ...and the level's vertex count up to and including it. */
  verts: Uint32Array
}

export interface Net {
  /** Rest positions, xyz per vertex. */
  rest: Float32Array
  /** Which way each vertex's rope runs: 0 x, 1 y, 2 z. */
  axis: Float32Array
  /** 1 where a vertex runs on to the next one, 0 at the end of its rope. */
  link: Float32Array
  levels: Level[]
}

/**
 * Ropes sit on half-steps on purpose: none runs through the centre, so the
 * body sits inside a cell instead of skewered on three of them. Each rope is
 * sampled finely where it passes the body and coarsely far out, where it barely
 * bends. Within a level the ropes run nearest first, so the renderer can draw
 * only as far out as the level shows.
 */
export function buildNet(): Net {
  const rest: number[] = []
  const axes: number[] = []
  const links: number[] = []
  const levels = LEVELS.map(({ spacing, extent }, k): Level => {
    const ropes: [number, number, number][] = []
    const cells = Math.ceil(extent / spacing) + 1
    for (let i = -cells; i < cells; i++) {
      for (let j = -cells; j < cells; j++) {
        // Every third rope each way is already a rope of the level above.
        if (k > 0 && mod3(i) === 1 && mod3(j) === 1) continue
        const a = (i + 0.5) * spacing
        const b = (j + 0.5) * spacing
        const miss = Math.hypot(a, b)
        if (miss < extent) ropes.push([a, b, miss])
      }
    }
    ropes.sort((p, q) => p[2] - q[2])
    const first = rest.length / 3
    const miss = new Float32Array(ropes.length * 3)
    const verts = new Uint32Array(ropes.length * 3)
    let n = 0
    for (const [a, b, m] of ropes) {
      const half = Math.sqrt(extent * extent - m * m)
      const along = [0]
      while (along[along.length - 1] < half) {
        const s = along[along.length - 1]
        along.push(Math.min(half, s + Math.max(STEP_MIN, STEP * Math.hypot(m, s))))
      }
      const ts = [...along.slice(1).reverse().map((s) => -s), ...along]
      for (let axis = 0; axis < 3; axis++) {
        ts.forEach((t, s) => {
          if (axis === 0) rest.push(t, a, b)
          else if (axis === 1) rest.push(a, t, b)
          else rest.push(a, b, t)
          axes.push(axis)
          links.push(s < ts.length - 1 ? 1 : 0)
        })
        miss[n] = m
        verts[n] = rest.length / 3 - first
        n++
      }
    }
    return { spacing, first, miss, verts }
  })
  return { rest: new Float32Array(rest), axis: new Float32Array(axes), link: new Float32Array(links), levels }
}

function mod3(i: number): number {
  return ((i % 3) + 3) % 3
}

/** Flamm's proper radial distance from the horizon. */
export function properDistance(r: number, rs: number): number {
  if (rs <= 1e-9) return r
  return Math.sqrt(r * (r - rs)) + rs * Math.acosh(Math.sqrt(r / rs))
}

export interface RadialMap {
  /** Rest radius to drawn radius. */
  radius(rho: number): number
}

/**
 * Builds the inverse of l once per body, as a table, so deforming a hundred
 * thousand vertices is a binary search each rather than a root find.
 *
 * `outward` is where the rest point would sit if the extra distance were laid
 * out from the anchor inward (l(A) - l(r) = A - rho); the drawn radius moves
 * the same amount the other way. Inside a star's surface the map continues on
 * the surface slope; those points are behind the opaque body and only need to
 * be finite and in order. For a black hole anything pulled past the horizon
 * sits just inside it, hidden by the ink sphere.
 */
export function radialMap(rs: number, surface: number): RadialMap {
  if (rs <= 1e-9) return { radius: (rho) => rho }
  const lo = Math.max(rs, surface)
  const rTab = new Float64Array(TABLE)
  const lTab = new Float64Array(TABLE)
  for (let i = 0; i < TABLE; i++) {
    // Quadratic spacing: most samples near the body, where l bends hardest.
    const u = i / (TABLE - 1)
    const r = lo + (ANCHOR - lo) * u * u
    rTab[i] = r
    lTab[i] = properDistance(r, rs)
  }
  const lA = lTab[TABLE - 1]
  const lLo = lTab[0]
  const slope = Math.sqrt(Math.max(0, 1 - rs / lo))

  const hole = surface <= rs
  const floor = hole ? rs * 0.98 : 1e-3

  const outward = (rho: number): number => {
    const target = lA - (ANCHOR - rho)
    if (target <= lLo) return hole ? rs : lo - (lLo - target) * slope
    if (target >= lA) return rho
    let a = 0
    let b = TABLE - 1
    while (b - a > 1) {
      const m = (a + b) >> 1
      if (lTab[m] <= target) a = m
      else b = m
    }
    const f = (target - lTab[a]) / (lTab[b] - lTab[a])
    return rTab[a] + f * (rTab[b] - rTab[a])
  }

  return {
    radius: (rho) => Math.max(floor, 2 * rho - outward(rho)),
  }
}

/**
 * Pulls the net in. Writes drawn positions into `out` and, per vertex, how far
 * it was drawn in (0 untouched, toward 1 swallowed), which the line shader
 * turns into weight and tone, so a rope is heaviest where it is pulled hardest.
 */
export function deform(net: Net, rs: number, surface: number, out: Float32Array, squeeze: Float32Array): void {
  const map = radialMap(rs, surface)
  const { rest } = net
  const n = rest.length / 3
  for (let i = 0; i < n; i++) {
    const o = i * 3
    const x = rest[o]
    const y = rest[o + 1]
    const z = rest[o + 2]
    const rho = Math.sqrt(x * x + y * y + z * z)
    if (rho < 1e-6) {
      out[o] = x
      out[o + 1] = y
      out[o + 2] = z
      squeeze[i] = 0
      continue
    }
    const r = map.radius(rho)
    const s = r / rho
    out[o] = x * s
    out[o + 1] = y * s
    out[o + 2] = z * s
    squeeze[i] = 1 - Math.min(1, s)
  }
}
