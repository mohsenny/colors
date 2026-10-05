import { describe, expect, it } from 'vitest'
import { PRESETS, compactness, exaggeration, fieldFor, formatClock, formatExaggeration, visualCompactness } from './bodies'
import { LEVELS, buildNet, deform, levelView, radialMap } from './lattice'
import { DIST_MAX, DIST_MIN } from '../render/camera'
import { circularSpeed, clockRate, localSpeed, makeLight, makeProbe, radiusOf, step } from './motion'
import type { Mover } from './motion'

const DT = 1 / 60

function run(m: Mover, rs: number, t: number, onStep?: (m: Mover) => void): boolean {
  const n = Math.round(t / DT)
  for (let i = 0; i < n; i++) {
    if (!step(m, rs, DT)) return false
    onStep?.(m)
  }
  return true
}

describe('probes', () => {
  it('hold a circular orbit far from the mass', () => {
    const rs = 0.05
    const r = 4
    const p = makeProbe([r, 0, 0], [0, circularSpeed(r, rs), 0], rs)
    let lo = Infinity
    let hi = 0
    // Five orbits: period is about 2 pi r / v in viewer time.
    const period = (2 * Math.PI * r) / Math.sqrt(rs / (2 * r))
    run(p, rs, 5 * period, (m) => {
      const d = radiusOf(m)
      lo = Math.min(lo, d)
      hi = Math.max(hi, d)
    })
    expect(lo).toBeGreaterThan(r * 0.99)
    expect(hi).toBeLessThan(r * 1.01)
  })

  it('cannot orbit inside 3 rs, can just outside', () => {
    const rs = 1
    const inside = makeProbe([2.8, 0, 0], [0, circularSpeed(2.8, rs) * 0.995, 0], rs)
    const outside = makeProbe([3.6, 0, 0], [0, circularSpeed(3.6, rs) * 0.995, 0], rs)
    expect(run(inside, rs, 400)).toBe(false)
    expect(run(outside, rs, 400)).toBe(true)
  })

  it('speed up as they fall and their clocks slow', () => {
    const rs = 1
    const p = makeProbe([8, 0, 0], [0, 0.05, 0], rs)
    const v0 = localSpeed(p, rs)
    const c0 = clockRate(p, rs)
    run(p, rs, 20)
    expect(radiusOf(p)).toBeLessThan(8)
    expect(localSpeed(p, rs)).toBeGreaterThan(v0)
    expect(clockRate(p, rs)).toBeLessThan(c0)
  })

  it('advance the perihelion in the direction of motion', () => {
    const rs = 0.4
    const r = 5
    const p = makeProbe([r, 0, 0], [0, circularSpeed(r, rs) * 0.9, 0], rs)
    // Track the angle of each perihelion: the first after the start must sit at a positive angle.
    let prev = radiusOf(p)
    let falling = false
    let peri = -1
    let turned = 0
    let lastAngle = 0
    run(p, rs, 400, (m) => {
      const d = radiusOf(m)
      const a = Math.atan2(m.pos[1], m.pos[0])
      let da = a - lastAngle
      if (da < -Math.PI) da += 2 * Math.PI
      turned += da
      lastAngle = a
      if (d < prev) falling = true
      else if (falling && peri < 0 && turned > Math.PI) peri = turned
      prev = d
    })
        // Launched at aphelion, so Newton would put the first perihelion at exactly pi.
    expect(peri).toBeGreaterThan(Math.PI * 1.05)
  })
})

describe('light', () => {
  const shoot = (b: number, rs: number): Mover => {
    const l = makeLight([-12, b, 0], [1, 0, 0])
    run(l, rs, 200, (m) => {
      if (radiusOf(m) > 40) m.vel = [0, 0, 0]
    })
    return l
  }

  it('is captured inside an impact parameter of 2.6 rs, escapes outside', () => {
    expect(step(shoot(2.5, 1), 1, DT)).toBe(false)
    const out = makeLight([-30, 2.7, 0], [1, 0, 0])
    expect(run(out, 1, 120)).toBe(true)
  })

  it('bends by about 2 rs / b in a weak field', () => {
    const rs = 0.02
    const b = 2
    const l = makeLight([-200, b, 0], [1, 0, 0])
    run(l, rs, 400)
    const bend = Math.atan2(-l.vel[1], l.vel[0])
    expect(bend).toBeGreaterThan(((2 * rs) / b) * 0.9)
    expect(bend).toBeLessThan(((2 * rs) / b) * 1.1)
  })

  it('slows as seen from here when it falls toward the mass', () => {
    const rs = 1
    const l = makeLight([6, 0, 0], [-1, 0, 0])
    const start = radiusOf(l)
    run(l, rs, 1)
    const firstSecond = start - radiusOf(l)
    const before = radiusOf(l)
    run(l, rs, 1)
    expect(before - radiusOf(l)).toBeLessThan(firstSecond)
  })
})

describe('bodies', () => {
  it('draw every preset deeper than the one before it', () => {
    const order = PRESETS.slice(0, 5).map((p) => visualCompactness(compactness(p.mass, p.radius)))
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1])
    expect(visualCompactness(1)).toBe(1)
  })

  it('say a black hole is true to scale and the Sun is not', () => {
    const sun = PRESETS.find((p) => p.id === 'sun')!
    const hole = PRESETS.find((p) => p.id === 'sgr-a')!
    expect(formatExaggeration(exaggeration(hole.mass, hole.radius))).toBe('true to scale')
    expect(formatExaggeration(exaggeration(sun.mass, sun.radius))).toBe('×10⁵')
    expect(formatClock(Math.sqrt(1 - compactness(sun.mass, sun.radius)))).toBe('0.999998×')
  })

  it('collapse continuously into a black hole', () => {
    const m = PRESETS[2].mass
    const rs = 2 * 6.674e-11 * m / (2.998e8 * 2.998e8)
    const just = fieldFor(m, rs * 1.0001, rs)
    const past = fieldFor(m, rs * 0.5, rs)
    expect(past.hole).toBe(true)
    expect(Math.abs(just.rs - past.rs)).toBeLessThan(0.01)
  })
})

describe('lattice', () => {
  it('pulls inward and never crosses, for every preset', () => {
    for (const p of PRESETS) {
      const f = fieldFor(p.mass, p.radius, p.radius || (2 * 6.674e-11 * p.mass) / 2.998e8 ** 2)
      const map = radialMap(f.rs, f.radius)
      let prev = -Infinity
      for (let rho = 0.01; rho < 14; rho += 0.01) {
        const r = map.radius(rho)
        expect(r).toBeGreaterThanOrEqual(prev)
        // Inside the body the map only has to stay in order; it is hidden.
        if (r > f.radius) expect(r).toBeLessThanOrEqual(rho + 1e-9)
        prev = r
      }
    }
  })

  it('deforms a whole net without NaN', () => {
    const net = buildNet()
    const out = new Float32Array(net.rest.length)
    const sq = new Float32Array(net.rest.length / 3)
    deform(net, 1, 1, out, sq)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('builds every level out past where it shows, at every zoom', () => {
    for (let d = DIST_MIN; d <= DIST_MAX; d += 0.25) {
      LEVELS.forEach((level, k) => {
        const view = levelView(k, d)
        if (view.weight > 0) expect(view.reach[1]).toBeLessThanOrEqual(level.extent)
      })
    }
  })

  it('never lays the same rope twice across levels', () => {
    const seen = new Set<string>()
    const net = buildNet()
    for (const level of net.levels) {
      for (let i = 0; i < level.miss.length; i++) {
        const v = level.first + (i === 0 ? 0 : level.verts[i - 1])
        const p = Array.from(net.rest.subarray(v * 3, v * 3 + 3), (x) => x.toFixed(4))
        const key = [p.filter((_, j) => j !== i % 3).join(), i % 3].join('|')
        expect(seen.has(key)).toBe(false)
        seen.add(key)
      }
    }
  })
})
