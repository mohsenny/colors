/*
 * The small and far moons of Jupiter and Saturn, and Pluto's Charon, as plain
 * ellipses: JPL's mean elements for planetary satellites
 * (ssd.jpl.nasa.gov/sats/elem), each orbit on the plane the table refers it
 * to, with its periapsis and node turning at the published rates. The table
 * gives an orbit's shape better than a moon's place on it: its periods are
 * rounded, and its starting angles for Hyperion and Phoebe are not where
 * Horizons has them. So where each moon is along its orbit, and how fast
 * Himalia's orbit turns, are fitted to JPL Horizons, and so is the one shape
 * the table has wrong, Epimetheus'. The two swings no ellipse makes are added:
 * Janus and Epimetheus trading orbits, and Hyperion rocking in step with
 * Titan. Positions are km from the planet's centre, on the equator and equinox
 * of J2000; the ephemeris turns them into its own frame.
 */

export type KeplerMoon =
  | 'metis'
  | 'adrastea'
  | 'amalthea'
  | 'thebe'
  | 'himalia'
  | 'prometheus'
  | 'pandora'
  | 'epimetheus'
  | 'janus'
  | 'hyperion'
  | 'phoebe'
  | 'charon'

const D = Math.PI / 180

/** Julian day of J2000, which the elements are given at. */
const J2000 = 2_451_545

/**
 * A row of the table, in its order: km, degrees and days at J2000. The
 * periapsis w is counted from the node, M is the mean anomaly, and the node is
 * counted along the orbit's plane from where that plane rises through the
 * Earth's equator. P is the days M takes to go round; the periapsis and node
 * take Pw and Pn years, backward when negative. The plane is given by its
 * pole: the planet's equator, near enough, for the close moons, the ecliptic
 * for Himalia and Pluto's equator for Charon.
 */
type Row = [
  a: number,
  e: number,
  w: number,
  M: number,
  i: number,
  node: number,
  P: number,
  Pw: number,
  Pn: number,
  ra: number,
  dec: number,
]

/** Janus and Epimetheus share a lap, as they must to share an orbit. */
const SHARED = 0.69736366416

const ROWS: Record<KeplerMoon, Row> = {
  metis: [128_000, 0, 0, 165.963, 0, 0, 0.2947788067, 0, 0, 268.1, 64.5],
  adrastea: [129_000, 0, 0, 214.417, 0, 0, 0.2982604258, 0, 0, 268.1, 64.5],
  amalthea: [181_400, 0.003, 180.1, 310.534, 0.4, 282.9, 0.4999229485, 0.196, -0.393, 268.1, 64.5],
  thebe: [221_900, 0.018, 26.6, 182.046, 1.1, 340.4, 0.6761064969, 0.398, -0.797, 268.1, 64.5],
  himalia: [11_439_000, 0.16, 331.593, 67.472, 28.4, 64.605, 251.2103738, 139.63, -292.95, 270, 90 - 23.4392911],
  prometheus: [139_400, 0.002, 341.9, 110.338, 0, 0, 0.6158836549, 0.357, 0, 40.6, 83.5],
  pandora: [141_700, 0.004, 217.9, 120.18, 0, 0, 0.6313727839, 0.379, 0, 40.6, 83.5],
  // The table has e at 0.02, but Horizons swings it in and out half as far.
  epimetheus: [151_400, 0.0098, 96.3, 179.574, 0.3, 189.8, SHARED, 0.24, -0.482, 40.6, 83.5],
  janus: [151_500, 0.007, 11.1, 114.786, 0.2, 159.9, SHARED, 0.24, -0.482, 40.6, 83.5],
  hyperion: [1_481_500, 0.105, 131.646, 55.264, 0.6, 102.66, 21.21257682, -20.843, -257.625, 40.2, 83.6],
  phoebe: [12_929_400, 0.164, 342.297, 53.114, 175.2, 240.93, 550.9568984, 468.321, 741.483, 276, 67.5],
  charon: [19_600, 0, 0, 304.1, 0, 0, 6.387222, 0, 0, 132.993, -6.163],
}

/**
 * Janus and Epimetheus are on one orbit, a few tens of km apart, and trade
 * places every four years as the inner one catches the outer. Each runs ahead
 * then behind on a slow zigzag, Epimetheus the more as it is the lighter. The
 * tips are rounded, so the two never meet but turn round about 10,000 km
 * apart, as Horizons has them.
 */
const SWAP = 9_513.96 // days from J2000 to the January 2026 swap
const SWAPS = 2_922.66 // days from one swap to the second after it
const TURN = 180.12 // degrees the gap between them runs either side of half a lap: both swings added
const SHY = 5.5 // degrees the rounding takes off that gap at each tip
const trading = (amp: number) => (t: number) => {
  const u = (t - SWAP) / SWAPS
  const f = 4 * Math.abs(u - Math.floor(u) - 0.5) - 1
  return amp * (f - (Math.sign(f) * SHY * Math.exp((TURN * (Math.abs(f) - 1)) / SHY)) / TURN)
}

/** Degrees to add to M, for days from J2000. */
const SWING: Partial<Record<KeplerMoon, (t: number) => number>> = {
  epimetheus: trading(-141),
  janus: trading(39.12),
  // Held in step with Titan, three of its laps to four of Titan's.
  hyperion: (t) => 9.126 * Math.sin((2 * Math.PI * (t - 457.83)) / 640.49),
}

export function isKepler(id: string): id is KeplerMoon {
  return id in ROWS
}

/** An orbit's plane on the J2000 equator: to where it rises through it, 90 degrees on, and its pole. */
function plane(ra: number, dec: number): number[] {
  const [a, d] = [ra * D, dec * D]
  const z = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]
  const x = [-Math.sin(a), Math.cos(a), 0]
  return [...x, z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0], ...z]
}

const PLANES = new Map(Object.entries(ROWS).map(([id, r]) => [id, plane(r[9], r[10])]))

/** A moon at a Julian ephemeris day: km from its planet's centre, on the J2000 equator. */
export function keplerMoon(id: KeplerMoon, jde: number): [number, number, number] {
  const [a, e, w0, M0, i, node0, P, Pw, Pn] = ROWS[id]
  const t = jde - J2000
  const w = (w0 + (Pw ? (360 * t) / (Pw * 365.25) : 0)) * D
  const node = (node0 + (Pn ? (360 * t) / (Pn * 365.25) : 0)) * D
  const M = (M0 + (360 * t) / P + (SWING[id]?.(t) ?? 0)) * D
  let E = M + e * Math.sin(M)
  for (let k = 0; k < 4; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  // On the orbit, x toward periapsis.
  const u = a * (Math.cos(E) - e)
  const v = a * Math.sqrt(1 - e * e) * Math.sin(E)
  // Onto the orbit's plane, x toward where it rises through the equator.
  const [cw, sw, cn, sn, ci, si] = [Math.cos(w), Math.sin(w), Math.cos(node), Math.sin(node), Math.cos(i * D), Math.sin(i * D)]
  const x = u * (cn * cw - sn * sw * ci) - v * (cn * sw + sn * cw * ci)
  const y = u * (sn * cw + cn * sw * ci) + v * (cn * cw * ci - sn * sw)
  const z = (u * sw + v * cw) * si
  // And off it, onto the equator.
  const m = PLANES.get(id) as number[]
  return [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z]
}
