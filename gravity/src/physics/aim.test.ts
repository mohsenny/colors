import { describe, expect, it } from 'vitest'
import {
  CIRCLE_PX,
  FORECAST_TICKS,
  ISCO_MARGIN,
  SNAP_PX,
  circleDrag,
  circleOffered,
  circleVelocity,
  dotsAlong,
  fateOf,
  probeFate,
  runTrace,
  snapTo,
  startTrace,
  tangentAt,
} from './aim'
import { PRESETS, effectiveRadius, fieldFor, schwarzschild } from './bodies'
import { circularSpeed, dot, len, makeLight, makeProbe, probeEnergy } from './motion'
import type { Mover, Vec3 } from './motion'
import { DT, ESCAPE_R, World } from '../sim/world'

/** As the instrument sets it: a circle at 4 takes ten seconds, capped at 9. */
function rateFor(rs: number): number {
  return Math.min(9, (2 * Math.PI * 4) / Math.sqrt(rs / 8) / 10)
}

function buffer(): Float32Array {
  return new Float32Array(3 * (FORECAST_TICKS + 1))
}

function circle(r: number, rs: number, k = 1): Mover {
  return makeProbe([r, 0, 0], [0, circularSpeed(r, rs) * k, 0], rs)
}

function trace(m: Mover, rs: number, surface: number, rate: number, chunk = FORECAST_TICKS + 1) {
  const t = startTrace(m, buffer())
  while (!runTrace(t, rs, surface, ESCAPE_R, DT * rate, chunk));
  return t
}

const at = (t: { path: Float32Array }, i: number): Vec3 => [t.path[3 * i], t.path[3 * i + 1], t.path[3 * i + 2]]

function toSegment(p: Vec3, a: Vec3, b: Vec3): number {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const w: Vec3 = [p[0] - a[0], p[1] - a[1], p[2] - a[2]]
  const k = Math.max(0, Math.min(1, dot(w, d) / (dot(d, d) || 1)))
  return Math.hypot(w[0] - d[0] * k, w[1] - d[1] * k, w[2] - d[2] * k)
}

/** Tangential speed at r 6 (rs 1), in circular units, whose periapsis is 2.7: found once from V(6) = V(2.7). */
const PERI_27 = (() => {
  const v = (r: number, l2: number) => (1 - 1 / r) * (1 + l2 / (r * r))
  // Linear in L^2: solve V(6) = V(2.7).
  const a = v(6, 0) - v(2.7, 0)
  const b = v(2.7, 1) - v(2.7, 0) - (v(6, 1) - v(6, 0))
  const l = Math.sqrt(a / b)
  return l / 6 / circularSpeed(6, 1)
})()

describe('probeFate', () => {
  const fate = (r: number, k: number, rs = 1, surface = rs) => {
    const m = circle(r, rs, k)
    return probeFate(m.pos, m.vel, rs, surface, ESCAPE_R)
  }

  it('orbits on a circle outside 3 rs, falls from one inside', () => {
    for (const r of [3.01, 3.5, 6, 11.9]) expect(fate(r, 1)).toBe('orbit')
    for (const r of [2, 2.9, 2.99]) expect(fate(r, 1)).toBe('fall')
  })

  it('reads slow, bound-but-wide and unbound releases at r 4', () => {
    expect(fate(4, 0.5)).toBe('fall')
    expect(fate(4, 0.92)).toBe('fall')
    const loose = circle(4, 1, 1.2)
    expect(probeEnergy(loose.pos, loose.vel, 1)).toBeLessThan(1)
    expect(fate(4, 1.2)).toBe('escape')
    const free = circle(4, 1, 1.35)
    expect(probeEnergy(free.pos, free.vel, 1)).toBeGreaterThan(1)
    expect(fate(4, 1.35)).toBe('escape')
  })

  it('counts a periapsis under the surface as a fall', () => {
    expect(fate(2.4, 0.5, 0.004, 0.8)).toBe('fall')
    expect(fate(2.4, 0.92, 0.004, 0.8)).toBe('orbit')
  })

  it('reads which way it is heading', () => {
    const rs = 1
    const out = makeProbe([6, 0, 0], [0.9 / Math.sqrt(1 - 0.81), 0, 0], rs)
    expect(probeFate(out.pos, out.vel, rs, rs, ESCAPE_R)).toBe('escape')
    const into = makeProbe([6, 0, 0], [-0.1, 0, 0], rs)
    expect(probeFate(into.pos, into.vel, rs, rs, ESCAPE_R)).toBe('fall')
  })
})

describe('the circle', () => {
  const forward: Vec3 = [0, 0, -1]
  const right: Vec3 = [1, 0, 0]
  const up: Vec3 = [0, 1, 0]

  it('is offered only outside 3 rs by the margin', () => {
    const at = (r: number) => circleOffered([r, 0, 0], tangentAt([r, 0, 0], forward, right), 1, 1, ESCAPE_R)
    expect(at(2.9)).toBe(false)
    expect(at(3.05)).toBe(false)
    expect(at(3.07)).toBe(true)
  })

  it('is offered and holds for every preset', () => {
    for (const p of PRESETS) {
      const radius = Math.max(p.radius, schwarzschild(p.mass))
      const f = fieldFor(p.mass, radius, effectiveRadius(p.mass, radius))
      const rate = rateFor(f.rs)
      const nearest = Math.max(3 * f.rs * (1 + ISCO_MARGIN) + 0.05, f.radius * 1.25, f.rs * 1.6)
      for (const r of [nearest, 4, 8]) {
        const pos: Vec3 = [0, r, 0]
        const t = tangentAt(pos, forward, right)
        if (r !== nearest) expect(circleOffered(pos, t, f.rs, f.radius, ESCAPE_R), `${p.id} at ${r}`).toBe(true)
        const tr = trace(makeProbe(pos, circleVelocity(pos, t, 1, f.rs), f.rs), f.rs, f.radius, rate)
        expect(tr.end, `${p.id} at ${r}`).toBe('turn')
        for (let i = 0; i < tr.count; i++) expect(Math.abs(len(at(tr, i)) / r - 1)).toBeLessThan(0.005)
        // The loop closes on the release: some step of its second half passes within 1%.
        let gap = Infinity
        for (let i = tr.count >> 1; i + 1 < tr.count; i++) gap = Math.min(gap, toSegment(pos, at(tr, i), at(tr, i + 1)))
        expect(gap / r, `${p.id} at ${r}`).toBeLessThan(0.01)
      }
    }
  })

  it('has its drag where a perfect hand drag lands', () => {
    const p: Vec3 = [3, 0, 0]
    const t = tangentAt(p, forward, right)
    const [dx, dy] = circleDrag(t, right, up)
    expect(Math.hypot(dx, dy)).toBeCloseTo(CIRCLE_PX, 9)
    // As the instrument maps a drag to a direction.
    const dir = (x: number, y: number): Vec3 => {
      const v: Vec3 = [right[0] * x - up[0] * y, right[1] * x - up[1] * y, right[2] * x - up[2] * y]
      const n = len(v)
      return [v[0] / n, v[1] / n, v[2] / n]
    }
    dir(dx, dy).forEach((v, i) => expect(v).toBeCloseTo(t[i], 9))
    dir(-dx, -dy).forEach((v, i) => expect(v).toBeCloseTo(-t[i], 9))
  })

  it('moves at circular speed, square to the radius', () => {
    const p: Vec3 = [2.5, 1.5, 0]
    const t = tangentAt(p, forward, right)
    const v = circleVelocity(p, t, -1, 0.3)
    expect(len(v)).toBeCloseTo(circularSpeed(len(p), 0.3), 12)
    expect(dot(v, p)).toBeCloseTo(0, 12)
  })
})

describe('snapTo', () => {
  const one = [[70, 0]] as const
  it('enters and lets go at the mouse radii', () => {
    const [enter, leave] = SNAP_PX.mouse
    expect(snapTo(70 + 11, 0, one, -1, enter, leave)).toBe(0)
    expect(snapTo(70 + 13, 0, one, -1, enter, leave)).toBe(-1)
    expect(snapTo(70 + 18, 0, one, 0, enter, leave)).toBe(0)
    expect(snapTo(70 + 21, 0, one, 0, enter, leave)).toBe(-1)
  })
  it('enters and lets go at the touch radii', () => {
    const [enter, leave] = SNAP_PX.touch
    expect(snapTo(70 - 23, 0, one, -1, enter, leave)).toBe(0)
    expect(snapTo(70 - 25, 0, one, -1, enter, leave)).toBe(-1)
    expect(snapTo(70 - 33, 0, one, 0, enter, leave)).toBe(0)
    expect(snapTo(70 - 35, 0, one, 0, enter, leave)).toBe(-1)
  })
  it('takes the nearest of two, and never a short drag', () => {
    const two = [
      [10, 0],
      [-10, 0],
    ] as const
    expect(snapTo(-7, 0, two, -1, 30, 40)).toBe(1)
    expect(snapTo(5, 0, two, -1, 30, 40)).toBe(-1)
  })
})

describe('the trace', () => {
  it('ends on the surface, at the edge, and leaves its input alone', () => {
    const m = circle(4, 1, 0.5)
    const before = JSON.stringify(m)
    const fall = trace(m, 1, 1.2, rateFor(1))
    expect(fall.end).toBe('fall')
    expect(len(at(fall, fall.count - 1))).toBeCloseTo(1.2, 6)
    expect(JSON.stringify(m)).toBe(before)
    expect(trace(circle(4, 1, 2), 1, 1, rateFor(1)).end).toBe('edge')
  })

  it('is what the world does', () => {
    const rs = 0.5
    const rate = rateFor(rs)
    const cases: [Mover, number][] = [
      [circle(5, rs, 0.9), 240],
      [makeLight([8, 0, 0], [-1, 0.25, 0]), 60],
    ]
    for (const [m, n] of cases) {
      const t = trace(m, rs, rs, rate)
      expect(t.count).toBeGreaterThan(n)
      const w = new World()
      const p = w.add(m)
      for (let i = 0; i < n; i++) w.tick({ rs, radius: rs, rate })
      expect(at(t, n)).toEqual(p.pos.map(Math.fround))
    }
  })

  it('comes out the same in chunks', () => {
    const rs = 1
    const one = trace(circle(5, rs, 0.97), rs, rs, rateFor(rs))
    const chunked = trace(circle(5, rs, 0.97), rs, rs, rateFor(rs), 7)
    expect(chunked.count).toBe(one.count)
    expect(chunked.end).toBe(one.end)
    expect(Array.from(chunked.path.subarray(0, 3 * one.count))).toEqual(Array.from(one.path.subarray(0, 3 * one.count)))
    expect(fateOf(chunked, rs, rs, ESCAPE_R)).toBe(fateOf(one, rs, rs, ESCAPE_R))
  })
})

describe('fateOf', () => {
  const rs = 1
  const rate = rateFor(rs)

  it('never promises an orbit to a hand-made circle inside 3 rs', () => {
    const t = trace(circle(2.5, rs), rs, rs, rate)
    expect(['unstable', 'fall']).toContain(fateOf(t, rs, rs, ESCAPE_R))
  })

  it('allows an orbit that dips inside 3 rs and comes back', () => {
    // From r 6, periapsis about 2.7 rs.
    const t = trace(circle(6, rs, PERI_27), rs, rs, rate)
    expect(fateOf(t, rs, rs, ESCAPE_R)).toBe('orbit')
  })

  it('never says orbit or unstable for a photon', () => {
    for (const d of [
      [-1, 0, 0],
      [-1, 0.3, 0],
      [0, 1, 0],
    ] as Vec3[]) {
      const t = trace(makeLight([6, 0, 0], d), rs, rs, rate)
      expect(['escape', 'fall']).toContain(fateOf(t, rs, rs, ESCAPE_R))
    }
  })
})

describe('dotsAlong', () => {
  const line = (n: number) => {
    const s = new Float32Array(2 * n)
    for (let i = 0; i < n; i++) s[2 * i] = 10 * i
    return s
  }

  it('lays dots evenly in screen distance', () => {
    const ix = dotsAlong(line(11), 11, 6, 10)
    expect(ix.map((i) => Math.round(i * 10 * 1e6) / 1e6)).toEqual([10, 16, 22, 28, 34, 40, 46, 52, 58, 64, 70, 76, 82, 88, 94, 100])
  })

  it('leaves no dot across a gap', () => {
    const s = line(11)
    s[10] = NaN
    s[11] = NaN
    const ix = dotsAlong(s, 11, 6, 0)
    expect(ix.some((i) => i > 4 && i < 6)).toBe(false)
    expect(ix).toContain(6)
  })
})
