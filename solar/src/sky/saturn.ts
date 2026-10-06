/*
 * Saturn's seven round moons, from the theory in chapter 46 of Meeus's
 * Astronomical Algorithms (after the port in astronomia, MIT). Only where each
 * moon is on its orbit: the light-time and the view from the Earth that the
 * book goes on to add are left out. Positions are from Saturn's centre, in
 * Saturn radii, on the ecliptic and equinox of B1950; the ephemeris turns them
 * into its own frame.
 */

export type SaturnMoon = 'mimas' | 'enceladus' | 'tethys' | 'dione' | 'rhea' | 'titan' | 'iapetus'

const D = Math.PI / 180

/** Saturn's equator on the B1950 ecliptic: its tilt, and where it rises through it. */
const TILT = 28.0817 * D
const RISE = 168.8112 * D
const S1 = Math.sin(TILT)
const C1 = Math.cos(TILT)
const S2 = Math.sin(RISE)
const C2 = Math.cos(RISE)

/** The time arguments the moons share, for a Julian ephemeris day. */
function args(jde: number) {
  const t1 = jde - 2411093
  const t2 = t1 / 365.25
  const t3 = (jde - 2433282.423) / 365.25 + 1950
  const t4 = jde - 2411368
  const t5 = t4 / 365.25
  const t7 = (jde - 2415020) / 36525
  const t10 = jde - 2409786
  const t11 = t10 / 36525
  const e1 = 0.05589 - 0.000346 * t7
  return {
    t1,
    t2,
    t4,
    t7,
    t10,
    t11,
    e1,
    W0: 5.095 * D * (t3 - 1866.39),
    W1: 74.4 * D + 32.39 * D * t2,
    W2: 134.3 * D + 92.62 * D * t2,
    W3: 42 * D - 0.5118 * D * t5,
    W4: 276.59 * D + 0.5118 * D * t5,
    W5: 267.2635 * D + 1222.1136 * D * t7,
    W6: 175.4762 * D + 1221.5515 * D * t7,
    W7: 2.4891 * D + 0.002435 * D * t7,
    W8: 113.35 * D - 0.2597 * D * t7,
  }
}

type Args = ReturnType<typeof args>

/** A moon on its orbit: its longitude along it and its distance, and the orbit's tilt to Saturn's equator and node on it. */
interface Orbit {
  lon: number
  r: number
  tilt: number
  node: number
}

/**
 * An orbit given against the ecliptic, as Rhea's, Titan's and Iapetus's are,
 * carried onto Saturn's equator.
 */
function onEquator(lon: number, peri: number, e: number, a: number, node: number, inc: number): Orbit {
  const M = lon - peri
  const e2 = e * e
  const e3 = e2 * e
  const e4 = e2 * e2
  const e5 = e3 * e2
  const C =
    (2 * e - 0.25 * e3 + 0.0520833333 * e5) * Math.sin(M) +
    (1.25 * e2 - 0.458333333 * e4) * Math.sin(2 * M) +
    (1.083333333 * e3 - 0.671875 * e5) * Math.sin(3 * M) +
    1.072917 * e4 * Math.sin(4 * M) +
    1.142708 * e5 * Math.sin(5 * M)
  const g = node - RISE
  const a1 = Math.sin(inc) * Math.sin(g)
  const a2 = C1 * Math.sin(inc) * Math.cos(g) - S1 * Math.cos(inc)
  const u = Math.atan2(a1, a2)
  const psi = Math.atan2(S1 * Math.sin(g), C1 * Math.sin(inc) - S1 * Math.cos(inc) * Math.cos(g))
  return {
    lon: lon + C + u - g - psi,
    r: (a * (1 - e2)) / (1 + e * Math.cos(M + C)),
    tilt: Math.asin(Math.hypot(a1, a2)),
    node: RISE + u,
  }
}

const ORBITS: Record<SaturnMoon, (q: Args) => Orbit> = {
  mimas(q) {
    const L =
      127.64 * D +
      381.994497 * D * q.t1 -
      43.57 * D * Math.sin(q.W0) -
      0.72 * D * Math.sin(3 * q.W0) -
      0.02144 * D * Math.sin(5 * q.W0)
    const M = L - (106.1 * D + 365.549 * D * q.t2)
    const C = 2.18287 * D * Math.sin(M) + 0.025988 * D * Math.sin(2 * M) + 0.00043 * D * Math.sin(3 * M)
    return { lon: L + C, r: 3.06879 / (1 + 0.01905 * Math.cos(M + C)), tilt: 1.563 * D, node: 54.5 * D - 365.072 * D * q.t2 }
  },
  enceladus(q) {
    const L = 200.317 * D + 262.7319002 * D * q.t1 + 0.25667 * D * Math.sin(q.W1) + 0.20883 * D * Math.sin(q.W2)
    const M = L - (309.107 * D + 123.44121 * D * q.t2)
    const C = 0.55577 * D * Math.sin(M) + 0.00168 * D * Math.sin(2 * M)
    return { lon: L + C, r: 3.94118 / (1 + 0.00485 * Math.cos(M + C)), tilt: 0.0262 * D, node: 348 * D - 151.95 * D * q.t2 }
  },
  tethys(q) {
    const lon =
      285.306 * D +
      190.69791226 * D * q.t1 +
      2.063 * D * Math.sin(q.W0) +
      0.03409 * D * Math.sin(3 * q.W0) +
      0.001015 * D * Math.sin(5 * q.W0)
    return { lon, r: 4.880998, tilt: 1.0976 * D, node: 111.33 * D - 72.2441 * D * q.t2 }
  },
  dione(q) {
    const L = 254.712 * D + 131.53493193 * D * q.t1 - 0.0215 * D * Math.sin(q.W1) - 0.01733 * D * Math.sin(q.W2)
    const M = L - (174.8 * D + 30.82 * D * q.t2)
    const C = 0.24717 * D * Math.sin(M) + 0.00033 * D * Math.sin(2 * M)
    return { lon: L + C, r: 6.24871 / (1 + 0.002157 * Math.cos(M + C)), tilt: 0.0139 * D, node: 232 * D - 30.27 * D * q.t2 }
  },
  rhea(q) {
    const p = 342.7 * D + 10.057 * D * q.t2
    const a1 = 0.000265 * Math.sin(p) + 0.001 * Math.sin(q.W4)
    const a2 = 0.000265 * Math.cos(p) + 0.001 * Math.cos(q.W4)
    const N = 345 * D - 10.057 * D * q.t2
    return onEquator(
      359.244 * D + 79.6900472 * D * q.t1 + 0.086754 * D * Math.sin(N),
      Math.atan2(a1, a2),
      Math.hypot(a1, a2),
      8.725924,
      168.8034 * D + 0.736936 * D * Math.sin(N) + 0.041 * D * Math.sin(q.W3),
      28.0362 * D + 0.346898 * D * Math.cos(N) + 0.0193 * D * Math.cos(q.W3),
    )
  },
  titan(q) {
    const L = 261.1582 * D + 22.57697855 * D * q.t4 + 0.074025 * D * Math.sin(q.W3)
    const i0 = 27.45141 * D + 0.295999 * D * Math.cos(q.W3)
    const node0 = 168.66925 * D + 0.628808 * D * Math.sin(q.W3)
    const a1 = Math.sin(q.W7) * Math.sin(node0 - q.W8)
    const a2 = Math.cos(q.W7) * Math.sin(i0) - Math.sin(q.W7) * Math.cos(i0) * Math.cos(node0 - q.W8)
    const g0 = 102.8623 * D
    const psi = Math.atan2(a1, a2)
    const s = Math.hypot(a1, a2)
    let g = q.W4 - node0 - psi
    let peri0 = 0
    for (let k = 0; k < 3; k++) {
      peri0 = q.W4 + 0.37515 * D * (Math.sin(2 * g) - Math.sin(2 * g0))
      g = peri0 - node0 - psi
    }
    const e0 = 0.029092 + 0.00019048 * (Math.cos(2 * g) - Math.cos(2 * g0))
    const qq = 2 * (q.W5 - peri0)
    const b1 = Math.sin(i0) * Math.sin(node0 - q.W8)
    const b2 = Math.cos(q.W7) * Math.sin(i0) * Math.cos(node0 - q.W8) - Math.sin(q.W7) * Math.cos(i0)
    const theta = Math.atan2(b1, b2) + q.W8
    const u = 2 * q.W5 - 2 * theta + psi
    const h = 0.9375 * e0 * e0 * Math.sin(qq) + 0.1875 * s * s * Math.sin(2 * (q.W5 - theta))
    return onEquator(
      L - 0.254744 * D * (q.e1 * Math.sin(q.W6) + 0.75 * q.e1 * q.e1 * Math.sin(2 * q.W6) + h),
      peri0 + 0.159215 * D * Math.sin(qq),
      e0 + 0.002778797 * e0 * Math.cos(qq),
      20.216193,
      node0 + (0.031843 * D * s * Math.sin(u)) / Math.sin(i0),
      i0 + 0.031843 * D * s * Math.cos(u),
    )
  },
  iapetus(q) {
    const L = 261.1582 * D + 22.57697855 * D * q.t4
    const peri1 = 91.796 * D + 0.562 * D * q.t7
    const psi = 4.367 * D - 0.195 * D * q.t7
    const theta = 146.819 * D - 3.198 * D * q.t7
    const phi = 60.47 * D + 1.521 * D * q.t7
    const Phi = 205.055 * D - 2.091 * D * q.t7
    const e0 = 0.028298 + 0.001156 * q.t11
    const peri0 = 352.91 * D + 11.71 * D * q.t11
    const mu = 76.3852 * D + 4.53795125 * D * q.t10
    const t = q.t11
    const i0 = (18.4602 + t * (-0.9518 + t * (-0.072 + t * 0.0054))) * D
    const node0 = (143.198 + t * (-3.919 + t * (0.116 + t * 0.008))) * D
    const l = mu - peri0
    const g = peri0 - node0 - psi
    const g1 = peri0 - node0 - phi
    const ls = q.W5 - peri1
    const gs = peri1 - theta
    const lT = L - q.W4
    const gT = q.W4 - Phi
    const u1 = 2 * (l + g - ls - gs)
    const u2 = l + g1 - lT - gT
    const u3 = l + 2 * (g - ls - gs)
    const u4 = lT + gT - g1
    const u5 = 2 * (ls + gs)
    const v = l + g1 + lT + gT + phi
    const e =
      e0 -
      0.0014097 * Math.cos(g1 - gT) +
      0.0003733 * Math.cos(u5 - 2 * g) +
      0.000118 * Math.cos(u3) +
      0.0002408 * Math.cos(l) +
      0.0002849 * Math.cos(l + u2) +
      0.000619 * Math.cos(u4)
    const w =
      0.08077 * D * Math.sin(g1 - gT) +
      0.02139 * D * Math.sin(u5 - 2 * g) -
      0.00676 * D * Math.sin(u3) +
      0.0138 * D * Math.sin(l) +
      0.01632 * D * Math.sin(l + u2) +
      0.03547 * D * Math.sin(u4)
    const lon =
      mu -
      0.04299 * D * Math.sin(u2) -
      0.00789 * D * Math.sin(u1) -
      0.06312 * D * Math.sin(ls) -
      0.00295 * D * Math.sin(2 * ls) -
      0.02231 * D * Math.sin(u5) +
      0.0065 * D * Math.sin(u5 + psi)
    const inc = i0 + 0.04204 * D * Math.cos(u5 + psi) + 0.00235 * D * Math.cos(v) + 0.0036 * D * Math.cos(u2 + phi)
    const turn = 0.04204 * D * Math.sin(u5 + psi) + 0.00235 * D * Math.sin(v) + 0.00358 * D * Math.sin(u2 + phi)
    return onEquator(lon, peri0 + w / e0, e, 58.935028 + 0.004638 * Math.cos(u1) + 0.058222 * Math.cos(u2), node0 + turn / Math.sin(i0), inc)
  },
}

/** A moon of Saturn at a Julian ephemeris day: Saturn radii from its centre, on the B1950 ecliptic. */
export function saturnMoon(id: SaturnMoon, jde: number): [number, number, number] {
  const o = ORBITS[id](args(jde))
  const u = o.lon - o.node
  const w = o.node - RISE
  const su = Math.sin(u)
  const cu = Math.cos(u)
  const sw = Math.sin(w)
  const cw = Math.cos(w)
  // On Saturn's equator, x where it rises through the ecliptic.
  const x = o.r * (cu * cw - su * Math.cos(o.tilt) * sw)
  const y = o.r * (su * cw * Math.cos(o.tilt) + cu * sw)
  const z = o.r * su * Math.sin(o.tilt)
  // Tipped down onto the ecliptic, then turned to its equinox.
  const b = C1 * y - S1 * z
  return [C2 * x - S2 * b, S2 * x + C2 * b, S1 * y + C1 * z]
}
