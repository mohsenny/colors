import { describe, expect, it } from 'vitest'
import { AU_KM } from '../sky/bodies'
import type { Vec3 } from '../sky/ephemeris'
import { FOV, NORTH, PITCH_MAX, ZG_MIN, across, add, cross, dot, globeEye, len, norm, rotate, scale, seatEye, sub } from './camera'
import type { Eye } from './camera'
import { AIM, HIGH, LIT, SWING, TRAVEL_MAX, arrivalSide, globeAngles, launch, planTravel, travelEye, travelMs } from './travel'
import type { Travel } from './travel'

const EARTH: Vec3 = [AU_KM, 0, 0]
const R_EARTH = 6371
const SUN: Vec3 = [0, 0, 0]
const MARS: Vec3 = [1.2 * AU_KM, 0.9 * AU_KM, 0.01 * AU_KM]
const R_MARS = 3390

function angle(a: Vec3, b: Vec3): number {
  return Math.atan2(len(cross(a, b)), dot(a, b))
}

/** A travel sampled every 16 ms to its end, the bodies moving as `seat` and `target` say. */
function fly(tr: Travel, seat: (t: number) => Vec3 = () => EARTH, target: (t: number) => Vec3 = () => MARS) {
  const out: { t: number; eye: Eye; target: Vec3 }[] = []
  for (let t = 0; t < tr.ms + 16; t += 16) out.push({ t, eye: travelEye(tr, t, seat(t), target(t)), target: target(t) })
  return out
}

/** Sitting on the Earth looking at Mars, turned off it by `swing`. */
function onEarth(swing = 0, z = 0): Eye {
  return seatEye(EARTH, R_EARTH, MARS, z, swing, 0)
}

const reachMars = 3.4 * R_MARS

describe('the launch ease', () => {
  it('goes from 0 to 1 leaving at the speed asked, and never turns back', () => {
    for (const v of [0, 0.5, 1.8]) {
      expect(launch(0, v)).toBe(0)
      expect(launch(1, v)).toBeCloseTo(1, 12)
      expect(launch(1e-6, v) / 1e-6).toBeCloseTo(v, 4)
      let last = 0
      for (let i = 1; i <= 200; i++) {
        const y = launch(i / 200, v)
        expect(y).toBeGreaterThanOrEqual(last - 1e-12)
        last = y
      }
    }
  })
})

describe('landing on a globe', () => {
  it('finds the yaw, pitch and zoom that globeEye turns into the same place', () => {
    const c: Vec3 = [3e8, -2e7, 4e5]
    for (const yaw of [-3, -1.2, 0, 0.7, 2.9]) {
      for (const pitch of [-PITCH_MAX + 0.01, -0.4, 0, 0.32, PITCH_MAX - 0.01]) {
        for (const zg of [ZG_MIN, 0, 1.5, 3]) {
          const a = globeAngles(c, 1737, globeEye(c, 1737, zg, yaw, pitch).at)
          expect(Math.cos(a.yaw - yaw)).toBeCloseTo(1, 9)
          expect(a.pitch).toBeCloseTo(pitch, 6)
          expect(a.zg).toBeCloseTo(zg, 9)
        }
      }
    }
  })
})

describe('travelling to a body', () => {
  const from = onEarth(0.3)
  const tr = planTravel(from, [0, 0, 0], EARTH, R_EARTH, MARS, SUN, reachMars)
  const frames = fly(tr)

  it('starts from the eye as it was', () => {
    const e = travelEye(tr, 0, EARTH, MARS)
    expect(len(sub(e.at, from.at))).toBeLessThan(1e-6)
    expect(dot(e.forward, from.forward)).toBeCloseTo(1, 12)
    expect(dot(e.up, from.up)).toBeCloseTo(1, 12)
    expect(e.fov).toBeCloseTo(from.fov, 12)
  })

  it('ends on the globe view that its yaw, pitch and zoom describe', () => {
    const end = travelEye(tr, tr.ms, EARTH, MARS)
    const a = globeAngles(MARS, R_MARS, add(MARS, scale(tr.side, tr.reach)))
    const g = globeEye(MARS, R_MARS, a.zg, a.yaw, a.pitch)
    expect(len(sub(end.at, g.at)) / tr.reach).toBeLessThan(1e-9)
    expect(dot(end.forward, g.forward)).toBeCloseTo(1, 12)
    expect(dot(end.up, g.up)).toBeCloseTo(1, 12)
    expect(end.fov).toBe(FOV)
    // And the frame before it is all but there.
    const last = travelEye(tr, tr.ms - 1, EARTH, MARS)
    expect(len(sub(last.at, g.at)) / tr.reach).toBeLessThan(1e-6)
  })

  it('holds the body in the middle once turned, while it moves', () => {
    const moving = (t: number): Vec3 => add(MARS, [3000 * t, -1000 * t, 20 * t])
    for (const f of fly(tr, () => EARTH, moving)) {
      if (f.t < tr.turn) continue
      expect(angle(f.eye.forward, norm(sub(f.target, f.eye.at)))).toBeLessThan(1e-6)
    }
  })

  it('never rolls: up stays square to the view and turns only a little a frame', () => {
    for (let i = 1; i < frames.length; i++) {
      const { forward, up } = frames[i].eye
      expect(Math.abs(dot(up, forward))).toBeLessThan(1e-9)
      expect(angle(up, frames[i - 1].eye.up)).toBeLessThan(0.05)
      // Against north, up leans by no more than it did at the start.
      expect(dot(up, across(NORTH, forward, [1, 0, 0]))).toBeGreaterThan(0.9)
    }
  })

  it('eases a leaning view back to north up, without turning back', () => {
    const leant = seatEye(EARTH, R_EARTH, MARS, 0, 0.3, 0, 0, 0.56, 0.8)
    const t2 = planTravel(leant, [0, 0, 0], EARTH, R_EARTH, MARS, SUN, reachMars)
    expect(Math.abs(t2.lean)).toBeGreaterThan(0.1)
    let last = Infinity
    for (const f of fly(t2)) {
      const level = across(NORTH, f.eye.forward, [1, 0, 0])
      const lean = Math.abs(Math.atan2(dot(cross(level, f.eye.up), f.eye.forward), dot(level, f.eye.up)))
      expect(lean).toBeLessThanOrEqual(last + 1e-9)
      last = lean
    }
    expect(last).toBeLessThan(1e-9)
  })

  it('turns a little each frame, without a jolt', () => {
    let top = 0
    for (let i = 1; i < frames.length; i++) top = Math.max(top, angle(frames[i].eye.forward, frames[i - 1].eye.forward))
    expect(top).toBeLessThan(0.03)
  })

  it('only closes in, slowing a power of ten at a time', () => {
    let last = Infinity
    for (const f of frames) {
      const d = len(sub(f.eye.at, f.target))
      expect(d).toBeLessThanOrEqual(last * (1 + 1e-12))
      expect(d).toBeGreaterThanOrEqual(tr.reach * (1 - 1e-9))
      last = d
    }
  })

  it('moves the lens one way only, some of it while turning', () => {
    for (const swing of [0, 0.3, 2.5]) {
      const tele = onEarth(swing, -3)
      const t2 = planTravel(tele, [0, 0, 0], EARTH, R_EARTH, MARS, SUN, reachMars)
      let last = 0
      for (const f of fly(t2)) {
        if (swing === 0 && f.t <= t2.go) expect(f.eye.fov).toBeCloseTo(tele.fov, 12)
        expect(f.eye.fov).toBeGreaterThanOrEqual(last)
        last = f.eye.fov
      }
      expect(last).toBe(FOV)
    }
  })

  it('grows the body once it is in the middle', () => {
    const tele = onEarth(0.3, -3)
    const t2 = planTravel(tele, [0, 0, 0], EARTH, R_EARTH, MARS, SUN, reachMars)
    let last = 0
    for (const f of fly(t2)) {
      if (f.t < t2.turn) continue
      const size = R_MARS / len(sub(f.eye.at, MARS)) / Math.tan(f.eye.fov / 4)
      expect(size).toBeGreaterThanOrEqual(last * (1 - 1e-9))
      last = size
    }
  })
})

describe('the turn', () => {
  it('does not turn at all when the body is already in the middle', () => {
    const tr = planTravel(onEarth(), [0, 0, 0], EARTH, R_EARTH, MARS, SUN, reachMars)
    expect(tr.turn).toBe(0)
    expect(tr.go).toBe(0)
  })

  it('turns right round in under two seconds, and no faster than a few radians a second', () => {
    const tr = planTravel(onEarth(Math.PI - 0.01), [0, 0, 0], EARTH, R_EARTH, MARS, SUN, reachMars)
    expect(tr.turn).toBeGreaterThan(1500)
    expect(tr.turn).toBeLessThanOrEqual(1800)
    const frames = fly(tr)
    for (let i = 1; i < frames.length; i++) expect(angle(frames[i].eye.forward, frames[i - 1].eye.forward) / 16).toBeLessThan(0.0035)
  })

  it('carries on at the speed a turn already under way had', () => {
    const from = onEarth(0.5)
    const aim = norm(sub(MARS, from.at))
    const w = 0.0012
    const spin = scale(norm(cross(from.forward, aim)), w)
    const tr = planTravel(from, spin, EARTH, R_EARTH, MARS, SUN, reachMars)
    const a = travelEye(tr, 1, EARTH, MARS)
    expect(angle(a.forward, from.forward)).toBeCloseTo(w, 4)
    // And never past the body and back.
    let last = Infinity
    for (const f of fly(tr)) {
      const off = angle(f.eye.forward, norm(sub(f.target, f.eye.at)))
      expect(off).toBeLessThanOrEqual(last + 1e-9)
      last = off
    }
  })
})

describe('where you arrive', () => {
  const sun: Vec3 = [1, 0, 0]

  it('keeps the side you came from when it is lit', () => {
    const from = norm([Math.cos(0.8), Math.sin(0.8), 0.5])
    const side = arrivalSide(from, sun)
    expect(dot(side, from)).toBeGreaterThan(0.999)
  })

  it('keeps a lit side met edge on as it is, so the stars do not swing', () => {
    const from: Vec3 = [Math.cos(0.5), Math.sin(0.5), 0]
    expect(dot(arrivalSide(from, sun), from)).toBeCloseTo(1, 12)
  })

  it('swings out of the night to where a globe is first shown, on your side of the Sun', () => {
    for (const from of [norm([-0.6, 0.8, 0.4]), norm([-0.6, 0.8, -0.6]), norm([-0.99, 0.01, -0.1])]) {
      expect(Math.acos(dot(from, sun))).toBeGreaterThan(LIT)
      const side = arrivalSide(from, sun)
      expect(Math.atan2(side[1], side[0])).toBeCloseTo(AIM, 9)
      expect(Math.asin(side[2])).toBeCloseTo(HIGH, 9)
    }
    expect(arrivalSide(norm([-0.6, -0.8, 0]), sun)[1]).toBeLessThan(0)
  })

  it('arrives where a globe is first shown when coming straight out of the night', () => {
    const side = arrivalSide([-1, 0, 0], sun)
    expect(Math.atan2(side[1], side[0])).toBeCloseTo(0.75, 9)
    expect(Math.asin(side[2])).toBeCloseTo(0.32, 9)
  })

  it('keeps off the poles, as dragging the globe does', () => {
    for (const z of [1, -1]) expect(Math.abs(Math.asin(arrivalSide([0.001, 0, z], sun)[2]))).toBeLessThan(PITCH_MAX)
  })

  it('swings round no nearer than it comes to rest', () => {
    const night: Vec3 = [2 * AU_KM, 0, 0]
    const eye = seatEye([5 * AU_KM, 0, 0], 69911, night, 0, 0, 0)
    const tr = planTravel(eye, [0, 0, 0], [5 * AU_KM, 0, 0], 69911, night, SUN, 3.4 * 6371)
    expect(angle(tr.side, norm(sub(eye.at, night)))).toBeGreaterThan(1)
    for (const f of fly(tr, () => [5 * AU_KM, 0, 0], () => night)) expect(len(sub(f.eye.at, night))).toBeGreaterThanOrEqual(tr.reach * (1 - 1e-9))
  })
})

describe('leaving a body that is in the way', () => {
  const moon: Vec3 = add(EARTH, [384400, 0, 0])
  const eye = globeEye(EARTH, R_EARTH, 0, Math.PI, 0.1)

  it('goes round it first, never through it, then has a clear line', () => {
    const tr = planTravel(eye, [0, 0, 0], EARTH, R_EARTH, moon, SUN, 3.4 * 1737)
    expect(tr.angle).toBeGreaterThan(0)
    for (const f of fly(tr, () => EARTH, () => moon)) {
      expect(len(sub(f.eye.at, EARTH))).toBeGreaterThan(1.05 * R_EARTH)
      if (f.t < tr.round) continue
      // The line on to the Moon misses the Earth.
      const to = norm(sub(moon, f.eye.at))
      const c = sub(EARTH, f.eye.at)
      const along = dot(c, to)
      if (along > 0) expect(len(sub(c, scale(to, along)))).toBeGreaterThan(R_EARTH)
    }
  })

  it('goes straight when nothing is in the way', () => {
    const near = globeEye(EARTH, R_EARTH, 0, 0, 0.1)
    const tr = planTravel(near, [0, 0, 0], EARTH, R_EARTH, moon, SUN, 3.4 * 1737)
    expect(tr.angle).toBe(0)
    expect(tr.round).toBe(0)
  })

  it('goes round even when the body is right behind it', () => {
    const behind = globeEye(EARTH, R_EARTH, 0, Math.PI, 0)
    const tr = planTravel(behind, [0, 0, 0], EARTH, R_EARTH, moon, SUN, 3.4 * 1737)
    expect(tr.angle).toBeGreaterThan(0)
    expect(len(tr.axis)).toBeCloseTo(1, 9)
    const after = rotate(tr.rel, tr.axis, tr.angle)
    expect(dot(norm(after), [1, 0, 0])).toBeGreaterThan(-0.95)
  })
})

describe('how long it takes', () => {
  const h = 1.02 * R_EARTH

  it('takes a second and a half or so from a planet to its moon, and seconds across the system', () => {
    const moon = travelMs(384400, 3.4 * 1737, h)
    expect(moon).toBeGreaterThanOrEqual(1500)
    expect(moon).toBeLessThan(2000)
    const neptune = travelMs(4.3e9, 3.4 * 24622, h)
    expect(neptune).toBeGreaterThan(3000)
    expect(neptune).toBeLessThan(4500)
  })

  it('takes longer the further it goes', () => {
    let last = 0
    for (const d of [4e5, 8e7, 6e8, 1.3e9, 4.3e9, 6e9]) {
      const ms = travelMs(d, 3.4 * 30000, h)
      expect(ms).toBeGreaterThan(last)
      last = ms
    }
  })

  it('gives a swing round the body time enough to stay slow', () => {
    expect(travelMs(384400, 3.4 * 1737, h, 2) * (1 - SWING)).toBeGreaterThan(2000)
  })

  it('never takes more than five seconds', () => {
    const far: Vec3 = [40 * AU_KM, 0, 0]
    const tr = planTravel(globeEye(EARTH, R_EARTH, 0, Math.PI, 0), [0, 0, 0], EARTH, R_EARTH, far, SUN, 3.4 * 10)
    expect(tr.ms).toBeLessThanOrEqual(TRAVEL_MAX)
  })
})

describe('setting off', () => {
  it('leaves the old seat a power of ten at a time, as it comes into the new one', () => {
    const from = onEarth()
    const tr = planTravel(from, [0, 0, 0], EARTH, R_EARTH, MARS, SUN, reachMars)
    const frames = fly(tr)
    // Away from the Earth the distance grows by no more than a third a frame,
    // and in to Mars it falls by no more than a quarter.
    for (let i = 1; i < frames.length; i++) {
      const a = len(sub(frames[i].eye.at, EARTH))
      const b = len(sub(frames[i - 1].eye.at, EARTH))
      expect(a / b).toBeLessThan(1.34)
      const c = len(sub(frames[i].eye.at, MARS))
      const d = len(sub(frames[i - 1].eye.at, MARS))
      expect(d / c).toBeLessThan(1.34)
    }
  })

  it('swings round to a lit side no faster than two radians a second', () => {
    const moon: Vec3 = add(EARTH, [-384400, 0, 0])
    const eye = globeEye(EARTH, R_EARTH, 0, Math.PI, 0.1)
    const tr = planTravel(eye, [0, 0, 0], EARTH, R_EARTH, moon, SUN, 3.4 * 1737)
    expect(angle(tr.side, norm(sub(EARTH, moon)))).toBeGreaterThan(1)
    const frames = fly(tr, () => EARTH, () => moon)
    for (let i = 1; i < frames.length; i++) {
      if (frames[i].t < tr.turn) continue
      expect(angle(frames[i].eye.forward, frames[i - 1].eye.forward) / 16).toBeLessThan(0.002)
    }
  })
})
