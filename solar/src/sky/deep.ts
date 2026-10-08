/*
 * Deep time: the sky past the few thousand years the theories are made for.
 * Beyond 2000 BC and AD 3000 the planets go round Standish's mean ellipses
 * (JPL's, fitted over 3000 BC to AD 3000), the Moon round a mean orbit with
 * its biggest swings, which the tides slowly widen, and the round moons of
 * Jupiter and Saturn round theirs from JPL's table. The theories give way to
 * these over five centuries. How far along its orbit each body can still be
 * placed is reckoned too: first by what the mean orbits leave out, then, over
 * millions of years, by the chaos no theory gets past.
 */

import { DeltaT_EspenakMeeus } from 'astronomy-engine'
import { AU_KM } from './bodies'
import type { BodyId } from './bodies'
import { isKepler } from './kepler'

type Vec3 = [number, number, number]

export const DAY_MS = 86_400_000
/** A Julian year, the year deep time is counted in. */
export const YEAR_MS = 365.25 * DAY_MS
/** Noon on 1 January 2000, UTC: the epoch the theories count from. */
export const J2000_MS = Date.UTC(2000, 0, 1, 12)

/** Years from J2000 the theories are used over, 2000 BC to AD 3000, and the years past either end they take to give way. */
export const EXACT = [-4000, 1000] as const
export const BLEND = 500

const D = Math.PI / 180

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function yearsOf(ms: number): number {
  return (ms - J2000_MS) / YEAR_MS
}

/** How far past the theories `ms` is: 0 within their years, 1 once they have given way. `from` is where they start, if later. */
export function pastTheory(ms: number, from: number = EXACT[0]): number {
  const y = yearsOf(ms)
  return smoothstep(0, BLEND, Math.max(from - y, y - EXACT[1]))
}

/** Days from J2000 where ΔT, how far the Earth's turn lags the clocks, is held: past the theories it is not known, and it no longer matters. */
const UT_HELD = [(EXACT[0] - BLEND) * 365.25, (EXACT[1] + BLEND) * 365.25] as const

/** Days from J2000 in Terrestrial Time, at `ms` UTC. */
export function ttOf(ms: number): number {
  const ut = (ms - J2000_MS) / DAY_MS
  return ut + DeltaT_EspenakMeeus(Math.max(UT_HELD[0], Math.min(UT_HELD[1], ut))) / 86_400
}

export type Planet = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto'

/**
 * Standish's mean elements, JPL's tables 2a and 2b: a in au, e, the
 * inclination, the mean longitude and the longitudes of perihelion and of the
 * node in degrees, each followed by its rate a century; then, from Jupiter
 * out, the terms added to the mean anomaly. On the ecliptic and equinox of
 * J2000. The Earth's row is the Earth and Moon's barycentre's, and Pluto's,
 * from the table's older edition, Pluto and Charon's.
 */
const MEAN: Record<Planet, number[]> = {
  mercury: [0.38709843, 0, 0.20563661, 0.00002123, 7.00559432, -0.00590158, 252.25166724, 149472.67486623, 77.45771895, 0.15940013, 48.33961819, -0.12214182],
  venus: [0.72332102, -0.00000026, 0.00676399, -0.00005107, 3.39777545, 0.00043494, 181.9797085, 58517.8156026, 131.76755713, 0.05679648, 76.67261496, -0.27274174],
  earth: [1.00000018, -0.00000003, 0.01673163, -0.00003661, -0.00054346, -0.01337178, 100.46691572, 35999.37306329, 102.93005885, 0.3179526, -5.11260389, -0.24123856],
  mars: [1.52371243, 0.00000097, 0.09336511, 0.00009149, 1.85181869, -0.00724757, -4.56813164, 19140.29934243, -23.91744784, 0.45223625, 49.71320984, -0.26852431],
  jupiter: [5.20248019, -0.00002864, 0.0485359, 0.00018026, 1.29861416, -0.00322699, 34.33479152, 3034.90371757, 14.27495244, 0.18199196, 100.29282654, 0.13024619, -0.00012452, 0.0606406, -0.35635438, 38.35125],
  saturn: [9.54149883, -0.00003065, 0.05550825, -0.00032044, 2.49424102, 0.00451969, 50.07571329, 1222.11494724, 92.86136063, 0.54179478, 113.63998702, -0.25015002, 0.00025899, -0.13434469, 0.87320147, 38.35125],
  uranus: [19.18797948, -0.00020455, 0.0468574, -0.0000155, 0.77298127, -0.00180155, 314.20276625, 428.49512595, 172.43404441, 0.09266985, 73.96250215, 0.05739699, 0.00058331, -0.97731848, 0.17689245, 7.67025],
  neptune: [30.06952752, 0.00006447, 0.00895439, 0.00000818, 1.7700552, 0.000224, 304.22289287, 218.46515314, 46.68158724, 0.01009938, 131.78635853, -0.00606302, -0.00041348, 0.68346318, -0.10162547, 7.67025],
  pluto: [39.48686035, 0.00449751, 0.24885238, 0.00006016, 17.1410426, 0.00000501, 238.96535011, 145.18042903, 224.09702598, -0.00968827, 110.30167986, -0.00809981, -0.01262724],
}

/** The centuries from J2000 the table was fitted over: its slow drifts are held at either end. */
const FITTED = [-50, 10] as const

/** A planet on its mean ellipse, km from the Sun, `tt` days from J2000. For the Earth, the Earth and Moon's barycentre. */
export function meanPlanet(id: Planet, tt: number): Vec3 {
  const T = tt / 36_525
  const c = Math.max(FITTED[0], Math.min(FITTED[1], T))
  const [a0, da, e0, de, i0, di, L0, dL, p0, dp, n0, dn, b = 0, cc = 0, s = 0, f = 0] = MEAN[id]
  const a = (a0 + da * c) * AU_KM
  const e = e0 + de * c
  const i = (i0 + di * c) * D
  const peri = p0 + dp * T
  const node = n0 + dn * T
  const M = ((L0 + dL * T - peri + b * c * c + cc * Math.cos(f * T * D) + s * Math.sin(f * T * D)) % 360) * D
  const w = ((peri - node) % 360) * D
  let E = M + e * Math.sin(M)
  for (let k = 0; k < 5; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  const u = a * (Math.cos(E) - e)
  const v = a * Math.sqrt(1 - e * e) * Math.sin(E)
  const [cw, sw, cn, sn, ci, si] = [Math.cos(w), Math.sin(w), Math.cos((node % 360) * D), Math.sin((node % 360) * D), Math.cos(i), Math.sin(i)]
  return [u * (cw * cn - sw * sn * ci) - v * (sw * cn + cw * sn * ci), u * (cw * sn + sw * cn * ci) + v * (cw * cn * ci - sw * sn), (u * sw + v * cw) * si]
}

/**
 * The Moon from the Earth's centre, km on the J2000 ecliptic, `tt` days from
 * J2000: Meeus's mean orbit with its six biggest swings in longitude and four
 * each in latitude and distance, good to a third of a degree, and `wide` times
 * as far out as it is now. The tides that slow it are kept up for 100,000
 * years either way; past that it goes on at the pace it had then.
 */
export function meanMoon(tt: number, wide: number): Vec3 {
  const T = tt / 36_525
  const c = Math.max(EXACT[0] / 100, Math.min(EXACT[1] / 100, T))
  const q = Math.max(-1000, Math.min(1000, T))
  const T2 = q * (2 * T - q)
  const [c3, c4] = [c * c * c, c * c * c * c]
  const L = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + c3 / 538_841 - c4 / 65_194_000
  const Dm = ((297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + c3 / 545_868 - c4 / 113_065_000) % 360) * D
  const M = ((357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + c3 / 24_490_000) % 360) * D
  const Mp = ((134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + c3 / 69_699 - c4 / 14_712_000) % 360) * D
  const F = ((93.272095 + 483202.0175233 * T - 0.0036539 * T2 - c3 / 3_526_000 + c4 / 863_310_000) % 360) * D
  // Less the precession of the equinoxes, from the equinox of the day to J2000's.
  const lon =
    (((L - 1.3969713 * T) % 360) +
      6.289 * Math.sin(Mp) +
      1.274 * Math.sin(2 * Dm - Mp) +
      0.658 * Math.sin(2 * Dm) +
      0.214 * Math.sin(2 * Mp) -
      0.186 * Math.sin(M) -
      0.114 * Math.sin(2 * F)) *
    D
  const lat = (5.128 * Math.sin(F) + 0.2806 * Math.sin(Mp + F) + 0.2777 * Math.sin(Mp - F) + 0.1732 * Math.sin(2 * Dm - F)) * D
  const r = wide * (385_001 - 20_905 * Math.cos(Mp) - 3_699 * Math.cos(2 * Dm - Mp) - 2_956 * Math.cos(2 * Dm) - 570 * Math.cos(2 * Mp))
  return [r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]
}

const ARCSEC = Math.PI / 648_000

/**
 * How far along its orbit a planet's mean ellipse may put it over 3000 BC to
 * AD 3000, arcsec, as JPL gives it; then how far off chaos has it at J2000,
 * radians, and in how many million years that grows e-fold: the inner
 * planets' is Laskar's five million, and Pluto starts furthest along.
 */
const ASTRAY: Record<Planet, [number, number, number]> = {
  mercury: [20, 1e-10, 4.3],
  venus: [40, 1e-10, 4.3],
  earth: [40, 1e-10, 4.3],
  mars: [100, 1e-10, 4.3],
  jupiter: [600, 1e-9, 10],
  saturn: [1000, 1e-9, 10],
  uranus: [2000, 1e-9, 10],
  neptune: [400, 1e-9, 10],
  pluto: [2000, 1e-7, 10],
}

/** Years, past the first thousand either side of J2000, in which a moon on an ellipse drifts a radian from it, where not 3000. */
const DRIFT: Partial<Record<BodyId, number>> = {
  phobos: 1000,
  daphnis: 600,
  atlas: 600,
  prometheus: 600,
  pandora: 600,
  miranda: 10_000,
  ariel: 10_000,
  umbriel: 10_000,
  titania: 10_000,
  oberon: 10_000,
  triton: 10_000,
  charon: 10_000,
}

/**
 * How far off along its orbit a body may be at `ms`, radians. A planet's
 * mean ellipse is off by what JPL gives, growing as its rate's error does,
 * by as much again every 3000 years past the table; chaos takes over in tens
 * of millions. The Moon's place is known to a radian 126,000 years out, as
 * well as the tides slowing it are; the round moons of Jupiter and Saturn
 * to 20,000.
 */
export function smearOf(id: BodyId, ms: number): number {
  if (id === 'sun') return 0
  const y = yearsOf(ms)
  const past = pastTheory(ms)
  let s: number
  if (id in ASTRAY) {
    const [off, start, efold] = ASTRAY[id as Planet]
    const out = Math.max(0, EXACT[0] - y, y - EXACT[1])
    s = past * off * ARCSEC * (1 + out / 3000) + start * Math.exp(Math.abs(y) / (efold * 1e6))
  } else if (id === 'moon') s = past * 0.005 + (y / 126_000) ** 2
  else if (isKepler(id)) s = (Math.max(0, Math.abs(y) - 1000) / (DRIFT[id] ?? 3000)) ** 2
  else s = past * 0.03 + (y / 20_000) ** 2
  return Math.min(100, s)
}

/** How much of a body is still at its place: all of it while that is known to a few degrees, none once it could be anywhere along its orbit. */
export function presenceOf(smear: number): number {
  return 1 - smoothstep(0.15, 1.2, smear)
}
