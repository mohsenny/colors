/*
 * The moons with no theory of their own, as plain ellipses: JPL's mean
 * elements for planetary satellites (ssd.jpl.nasa.gov/sats/elem), each orbit
 * on the plane the table refers it to, with its periapsis and node turning at
 * the published rates. The table gives an orbit's shape better than a moon's
 * place on it: its periods are rounded, and its starting angles for Hyperion
 * and Phoebe are not where Horizons has them. So where each moon is along its
 * orbit, and how fast Himalia's orbit turns, are fitted to JPL Horizons, and
 * so is the one shape the table has wrong, Epimetheus'. The moons of Mars,
 * Uranus and Neptune, Saturn's smallest and Pluto's small ones are fitted to
 * Horizons whole, over the 100 to 200 years it has them for, or the 28 it has
 * Daphnis. The swings no ellipse makes are added: Phobos falling toward Mars,
 * Janus and Epimetheus trading orbits, the moons that share Tethys's and
 * Dione's rocking about their places, Hyperion rocking in step with Titan,
 * and Miranda and Ariel in step with Umbriel. Positions are km from the
 * planet's centre, on the equator and equinox of J2000; the ephemeris turns
 * them into its own frame.
 */

export type KeplerMoon =
  | 'phobos'
  | 'deimos'
  | 'metis'
  | 'adrastea'
  | 'amalthea'
  | 'thebe'
  | 'himalia'
  | 'pan'
  | 'daphnis'
  | 'atlas'
  | 'prometheus'
  | 'pandora'
  | 'epimetheus'
  | 'janus'
  | 'telesto'
  | 'calypso'
  | 'helene'
  | 'hyperion'
  | 'phoebe'
  | 'puck'
  | 'miranda'
  | 'ariel'
  | 'umbriel'
  | 'titania'
  | 'oberon'
  | 'proteus'
  | 'triton'
  | 'nereid'
  | 'charon'
  | 'styx'
  | 'nix'
  | 'kerberos'
  | 'hydra'

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
 * for Himalia and Nereid, the plane its orbit turns round for Triton, and
 * Pluto's equator for Charon and the four beyond it.
 */
export type Row = [
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
  phobos: [9374.9, 0.015124, 216.4585, 189.5631, 1.07477, 169.1446, 0.3190330963764, 1.1316387, -2.261704, 317.7, 52.9],
  deimos: [23_457.5, 0.0002651, 195.0889, 9.9691, 1.79115, 54.3928, 1.26252020056, 27.379162, -54.561759, 316.6, 53.5],
  metis: [128_000, 0, 0, 165.963, 0, 0, 0.2947788067, 0, 0, 268.1, 64.5],
  adrastea: [129_000, 0, 0, 214.417, 0, 0, 0.2982604258, 0, 0, 268.1, 64.5],
  amalthea: [181_400, 0.003, 180.1, 310.534, 0.4, 282.9, 0.4999229485, 0.196, -0.393, 268.1, 64.5],
  thebe: [221_900, 0.018, 26.6, 182.046, 1.1, 340.4, 0.6761064969, 0.398, -0.797, 268.1, 64.5],
  himalia: [11_439_000, 0.16, 331.593, 67.472, 28.4, 64.605, 251.2103738, 139.63, -292.95, 270, 90 - 23.4392911],
  pan: [133_584.5, 0, 0, 323.4627, 0.03767, 183.1113, 0.5750507197771, 0, 0, 40.6, 83.5],
  daphnis: [136_502.8, 0, 0, 330.819, 0.03746, 182.6871, 0.5940799646787, 0, 0, 40.6, 83.5],
  atlas: [137_614.1, 0.0011151, 261.4235, 281.632, 0.03766, 183.1177, 0.6046004589373, 0.34215724, 0, 40.6, 83.5],
  prometheus: [139_400, 0.002, 341.9, 110.338, 0, 0, 0.6158836549, 0.357, 0, 40.6, 83.5],
  pandora: [141_700, 0.004, 217.9, 120.18, 0, 0, 0.6313727839, 0.379, 0, 40.6, 83.5],
  // The table has e at 0.02, but Horizons swings it in and out half as far.
  epimetheus: [151_400, 0.0098, 96.3, 179.574, 0.3, 189.8, SHARED, 0.24, -0.482, 40.6, 83.5],
  janus: [151_500, 0.007, 11.1, 114.786, 0.2, 159.9, SHARED, 0.24, -0.482, 40.6, 83.5],
  telesto: [294_673.2, 0.0002259, 119.4299, 259.7792, 1.17983, 229.171, 1.889766847979, 2.4885931, -4.9820075, 40.6, 83.5],
  calypso: [294_673.1, 0.0004911, 15.5945, 158.4592, 1.49972, 314.1993, 1.889769482688, 2.4871248, -4.9828081, 40.6, 83.5],
  helene: [377_414.9, 0.0073277, 44.2849, 32.0311, 0.21317, 163.0561, 2.738685837145, 5.8249007, -11.707718, 40.6, 83.5],
  hyperion: [1_481_500, 0.105, 131.646, 55.264, 0.6, 102.66, 21.21257682, -20.843, -257.625, 40.2, 83.6],
  phoebe: [12_929_400, 0.164, 342.297, 53.114, 175.2, 240.93, 550.9568984, 468.321, 741.483, 276, 67.5],
  puck: [86_006.5, 0.0090325, 13.9953, 343.3459, 1.05319, 272.7581, 0.7622435740675, 1.9384658, -3.8769943, 77.311, 15.175],
  miranda: [129_848, 0.00136, 155.054, 72.742, 4.4271, 100.861, 1.413783755, 8.940569, -17.78682, 77.311, 15.175],
  ariel: [190_929, 0.00145, 99.635, 119.646, 0.0117, 343.801, 2.520680757, 62.4414, 757.145, 77.311, 15.175],
  umbriel: [265_981, 0.00376, 154.505, 260.407, 0.0765, 196.337, 4.144554494, 63.55813, -129.7191, 77.311, 15.175],
  titania: [436_281, 0.00114, 216.464, 52.268, 0.1031, 12.834, 8.70666837, 349.9528, 1005.607, 77.311, 15.175],
  oberon: [583_448, 0.00139, 156.785, 157.956, 0.1717, 37.821, 13.46404996, 307.5065, -619.2602, 77.311, 15.175],
  proteus: [117_647, 0.0004903, 17.3775, 256.8725, 1.02997, 359.8627, 1.122584363917, 13.014987, 751.45277, 299.36, 43.46],
  triton: [354_759, 0, 0, 57.771, 157.211, 176.806, 5.876714377, 0, 676.247, 299.8, 43.1],
  nereid: [5_513_929.7, 0.7505827, 296.1698, 216.7047, 5.03864, 320.0116, 360.1399924661, 8318.2755, -9796.6495, 270, 66.5607089],
  charon: [19_600, 0, 0, 304.1, 0, 0, 6.387222, 0, 0, 132.993, -6.163],
  // Pluto's four small moons go round the point Pluto and Charon both go round.
  styx: [42_408.7, 0.0022909, 258.0246, 72.0255, 0.04796, 220.4661, 20.33652156886, 1.8664003, -2.6300166, 133.008, -6.245],
  nix: [48_688.9, 0.0020411, 68.9355, 305.1086, 0.02159, 78.0727, 25.18429285071, 2.4648996, -4.6863257, 133.008, -6.245],
  kerberos: [57_748, 0.0031771, 146.9797, 166.4416, 0.41964, 314.409, 32.4785566415, 4.5651355, -9.0516981, 133.008, -6.245],
  hydra: [64_719.3, 0.0055672, 143.1767, 334.8606, 0.27854, 114.9418, 38.48910795582, 6.9958848, -13.961184, 133.008, -6.245],
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
  // Phobos is falling slowly toward Mars, and so going round faster.
  phobos: (t) => 9.44238e-9 * t * t,
  deimos: (t) => 0.2714313 * Math.sin((2 * Math.PI * (t - 592.6982)) / 19901.42),
  // Pulled on and back by its neighbours, Prometheus and Pandora.
  atlas: (t) =>
    4.829197 * Math.sin((2 * Math.PI * (t + 7820.423)) / 21901.52) +
    3.438598 * Math.sin((2 * Math.PI * (t + 2015.655)) / 12289.37) +
    1.234866 * Math.sin((2 * Math.PI * (t + 779.8387)) / 1678.467),
  epimetheus: trading(-141),
  janus: trading(39.12),
  // Telesto and Calypso share Tethys's orbit, 60 degrees ahead and behind,
  // and Helene Dione's, ahead of it. Each rocks about its place, and Tethys's
  // two rock with Tethys too, as Mimas pulls it.
  telesto: (t) =>
    1.305289 * Math.sin((2 * Math.PI * (t - 259.1058)) / 696.2657) +
    2.092557 * Math.sin((2 * Math.PI * (t - 2817.055)) / 25829.04) +
    0.03591245 * Math.sin((2 * Math.PI * (t - 2782.028)) / 8597.488),
  calypso: (t) =>
    3.651147 * Math.sin((2 * Math.PI * (t + 43.40119)) / 696.803) +
    2.091643 * Math.sin((2 * Math.PI * (t - 2817.233)) / 25829.5) +
    0.05033878 * Math.sin((2 * Math.PI * (t - 43.50529)) / 348.4002) +
    0.0358474 * Math.sin((2 * Math.PI * (t - 2785.564)) / 8600.596),
  helene: (t) =>
    14.78683 * Math.sin((2 * Math.PI * (t - 292.3927)) / 767.7469) +
    0.8277759 * Math.sin((2 * Math.PI * (t + 187.2166)) / 383.8735) +
    0.07606952 * Math.sin((2 * Math.PI * (t + 91.16631)) / 255.915),
  // Held in step with Titan, three of its laps to four of Titan's.
  hyperion: (t) => 9.126 * Math.sin((2 * Math.PI * (t - 457.83)) / 640.49),
  // Miranda's laps less three of Ariel's and plus two of Umbriel's come round
  // every 12.6 years, and each time the three pull each other on and back.
  miranda: (t) => 1.4356 * Math.sin((2 * Math.PI * (t - 534.67)) / 4582.84) + 0.1759 * Math.sin((2 * Math.PI * (t - 538.15)) / 2290.37),
  ariel: (t) => 0.0985 * Math.sin((2 * Math.PI * (t - 2809.95)) / 4600.26),
  nereid: (t) => 0.7345038 * Math.sin((2 * Math.PI * (t - 6924.95)) / 30142.26),
}

export function isKepler(id: string): id is KeplerMoon {
  return id in ROWS
}

/** The round moons of Jupiter and Saturn, which have theories of their own. */
export type FarMoon = 'io' | 'europa' | 'ganymede' | 'callisto' | 'mimas' | 'enceladus' | 'tethys' | 'dione' | 'rhea' | 'titan' | 'iapetus'

/**
 * Their mean orbits, from the same JPL table, for the years past their
 * theories. The table gives its turning periods unsigned: here the nodes go
 * back, as Io's and Europa's periapses do. Where each moon is along its orbit,
 * and P, here the days of a whole lap, are fitted to its theory at either end
 * of the years it holds, so that one hands it on to the other where it is.
 */
const FAR: Record<FarMoon, Row> = {
  io: [421_800, 0.004, 49.1, 330.7, 0, 0, 1.769137775, -1.333, 0, 268.1, 64.5],
  europa: [671_100, 0.009, 45, 346.5, 0.5, 184, 3.5511810583, -1.394, -30.202, 268.1, 64.5],
  ganymede: [1_070_400, 0.001, 198.3, 324.93, 0.2, 58.5, 7.1545531832, 68.301, -137.812, 268.2, 64.6],
  callisto: [1_882_700, 0.007, 43.8, 87.49, 0.3, 309.1, 16.6890174471, 277.921, -577.264, 268.7, 64.8],
  mimas: [186_000, 0.02, 160.4, 275.62, 1.6, 66.2, 0.9424219139, 0.493, -0.986, 40.6, 83.5],
  enceladus: [238_400, 0.005, 119.5, 63.46, 0, 0, 1.3702180816, 2.916, 0, 40.6, 83.5],
  tethys: [295_000, 0.001, 335.3, 300.92, 1.1, 273, 1.8878025308, 0.005, -4.982, 40.6, 83.5],
  dione: [377_700, 0.002, 116, 61.12, 0, 0, 2.7369155441, 11.698, 0, 40.6, 83.5],
  rhea: [527_200, 0.001, 44.3, 234.11, 0.3, 133.7, 4.5175026552, 33.939, -35.775, 40.6, 83.5],
  titan: [1_221_900, 0.029, 78.3, 216.67, 0.3, 78.6, 15.9454466608, 346.68, -687.37, 36.4, 84],
  iapetus: [3_561_700, 0.028, 254.5, 147.1, 7.6, 86.5, 79.3274327941, 1662.9, -3130.302, 288.7, 78.9],
}


export function isFar(id: string): id is FarMoon {
  return id in FAR
}

/** An orbit's plane on the J2000 equator: to where it rises through it, 90 degrees on, and its pole. */
export function plane(ra: number, dec: number): number[] {
  const [a, d] = [ra * D, dec * D]
  const z = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]
  const x = [-Math.sin(a), Math.cos(a), 0]
  return [...x, z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0], ...z]
}

const PLANES = new Map([...Object.entries(ROWS), ...Object.entries(FAR)].map(([id, r]) => [id, plane(r[9], r[10])]))

/** A moon at a Julian ephemeris day: km from its planet's centre, on the J2000 equator. */
export function keplerMoon(id: KeplerMoon, jde: number): [number, number, number] {
  return ellipse(ROWS[id], PLANES.get(id) as number[], jde, SWING[id])
}

/** One of the round moons of Jupiter and Saturn on its mean orbit, as `keplerMoon`. */
export function farMoon(id: FarMoon, jde: number): [number, number, number] {
  return ellipse(FAR[id], PLANES.get(id) as number[], jde, undefined, true)
}

/**
 * A moon on a row's ellipse, its plane `m` as `plane` gives it and `swing`
 * added to M. With `whole`, P is the period of the whole lap, and M is held
 * back by as much as the periapsis and node turn on.
 */
export function ellipse(row: Row, m: readonly number[], jde: number, swing?: (t: number) => number, whole = false): [number, number, number] {
  const [a, e, w0, M0, i, node0, P, Pw, Pn] = row
  const t = jde - J2000
  // Each angle less the whole turns it has made, which keeps it fine a billion years out.
  const lap = (period: number): number => (360 * (t % period)) / period
  const dw = Pw ? lap(Pw * 365.25) : 0
  const dn = Pn ? lap(Pn * 365.25) : 0
  const w = (w0 + dw) * D
  const node = (node0 + dn) * D
  const M = (M0 + lap(P) - (whole ? dw + dn : 0) + (swing?.(t) ?? 0)) * D
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
  return [m[0] * x + m[3] * y + m[6] * z, m[1] * x + m[4] * y + m[7] * z, m[2] * x + m[5] * y + m[8] * z]
}
