import { describe, expect, it } from 'vitest'
import { AU_KM } from '../sky/bodies'
import type { Vec3 } from '../sky/ephemeris'
import {
  FOV,
  GLOBE,
  LOW,
  LOW_MAX,
  LOW_MIN,
  PITCH_MAX,
  RISE_MAX,
  across,
  add,
  backOf,
  circleOf,
  cross,
  dot,
  facing,
  frameOf,
  globeEye,
  grip,
  meet,
  norm,
  overSpot,
  project,
  scale,
  seatEye,
  sub,
  turnTo,
  unproject,
  zMax,
  zgMax,
} from './camera'
import type { Eye } from './camera'

const H = 1000

/** Where the seat's horizon, or a shell `lift` radii above it, crosses the middle column of the screen, in pixels from the top. */
function horizonY(eye: Eye, seat: Vec3, radius: number, lift = 0): number {
  const fr = frameOf(eye, 1)
  const toSeat = sub(seat, eye.at)
  const c = norm(toSeat)
  const L = Math.asin((radius * (1 + lift)) / Math.hypot(...toSeat))
  const side = across(fr.forward, c, fr.up)
  const p = project(fr, add(scale(c, Math.cos(L)), scale(side, Math.sin(L))), H, H)
  if (!p) throw new Error('horizon behind the eye')
  return p[1]
}

const at = (low: number): number => (H / 2) * (1 + low)

describe('sitting on a body', () => {
  it('puts the horizon where it is asked, below a target far away', () => {
    const seat: Vec3 = [0, 0, 0]
    for (const low of [LOW_MIN, 0.2, LOW, LOW_MAX]) {
      const eye = seatEye(seat, 1, [1e9, 3e8, 1e8], 0, 0.4, 0.1, 0, low)
      expect(horizonY(eye, seat, 1)).toBeCloseTo(at(low), -1)
    }
  })

  it('allows for a target only a few dozen radii off, through a narrow lens', () => {
    // The Sun looking at Mercury: 83 of its radii away, through a lens of a few hundredths of a degree.
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [0, 83, 0]
    const z = Math.log((0.04 * Math.PI) / 180 / FOV)
    const eye = seatEye(seat, 1, target, z, 0, 0)
    expect(horizonY(eye, seat, 1)).toBeCloseTo(at(LOW), -1)
  })

  it('looks over the air rather than through it when the lens is narrow', () => {
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [6e9, 0, 0]
    const air = 0.014
    // Wide: the ground's horizon stays where it was asked.
    const wide = seatEye(seat, 1, target, 0, 0, 0, air)
    expect(horizonY(wide, seat, 1)).toBeCloseTo(at(LOW), -1)
    // Narrow: the top of the air sits below the target.
    const z = Math.log((0.075 * Math.PI) / 180 / FOV)
    const narrow = seatEye(seat, 1, target, z, 0, 0, air)
    expect(horizonY(narrow, seat, 1, air)).toBeGreaterThan(H / 2 + 0.1 * H)
  })

  it('backs away without losing the target', () => {
    const seat: Vec3 = [0, 0, 0]
    const target: Vec3 = [1e9, 0, 0]
    const eye = seatEye(seat, 1, target, 3, 0, 0)
    expect(Math.hypot(...eye.at)).toBeCloseTo(backOf(3), 6)
    const fr = frameOf(eye, 1)
    const p = project(fr, norm(sub(target, eye.at)), H, H)
    expect(p?.[0]).toBeCloseTo(H / 2, 6)
    expect(p?.[1]).toBeCloseTo(H / 2, 6)
  })
})

describe('dragging round the seat', () => {
  const seat: Vec3 = [0, 0, 0]
  const moon = 1737
  const earth: Vec3 = [384_400, 0, 0]
  const px = (4 * Math.tan(FOV / 4)) / H

  it('carries the target a pixel for every pixel turned', () => {
    // Swinging and rising by ten pixels' worth carries the target ten pixels right and down.
    const swung = seatEye(seat, moon, earth, 0, 10 * px, 0)
    const risen = seatEye(seat, moon, earth, 0, 0, 10 * px)
    const a = project(frameOf(swung, 1), norm(sub(earth, swung.at)), H, H)
    const b = project(frameOf(risen, 1), norm(sub(earth, risen.at)), H, H)
    expect(a?.[0]).toBeCloseTo(H / 2 + 10, 0)
    expect(b?.[1]).toBeCloseTo(H / 2 + 10, 0)
  })

  it('keeps you under the view, level, all the way round', () => {
    for (const swing of [0.7, Math.PI / 2, Math.PI, 4]) {
      const eye = seatEye(seat, moon, earth, 0, swing, 0)
      expect(horizonY(eye, seat, moon)).toBeCloseTo(at(LOW), -1)
      expect(project(frameOf(eye, 1), norm(sub(seat, eye.at)), H, H)?.[0]).toBeCloseTo(H / 2, 6)
    }
  })

  it('brings the Sun behind you round into view', () => {
    // On the Moon, the Earth ahead and the Sun behind: half way round, the Sun is ahead.
    const sun: Vec3 = [-1.5e8, 0, 0]
    const eye = seatEye(seat, moon, earth, 0, Math.PI, 0)
    const p = project(frameOf(eye, 1), norm(sub(sun, eye.at)), H, H)
    expect(p?.[0]).toBeCloseTo(H / 2, 6)
    expect(Math.abs((p?.[1] ?? 0) - H / 2)).toBeLessThan(10)
  })

  it('stops short of the poles of the sky', () => {
    expect(Math.asin(facing(earth, 0, 9)[2])).toBeCloseTo(RISE_MAX, 9)
    expect(Math.asin(facing(earth, 0, -9)[2])).toBeCloseTo(-RISE_MAX, 9)
  })
})

describe('going round the seat', () => {
  // On the Moon, the Earth ahead.
  const seat: Vec3 = [0, 0, 0]
  const moon = 1737
  const earth: Vec3 = [384_400, 0, 0]
  const W = 2 * H
  const px = (4 * Math.tan(FOV / 4)) / H
  const spot = (eye: Eye, p: Vec3): [number, number] | null => project(frameOf(eye, 2), norm(sub(p, eye.at)), W, H)
  const round = (side: number, swing = 0, rise = 0, low = LOW): Eye => seatEye(seat, moon, earth, 0, swing, rise, 0, low, side)

  it('sits over the north, then the side, then the south', () => {
    expect(round(0).at[2]).toBeGreaterThan(moon)
    expect(round(Math.PI / 2).at[2]).toBeCloseTo(0, 6)
    expect(round(Math.PI).at[2]).toBeLessThan(-moon)
  })

  it('keeps the target in the middle and the horizon where it was', () => {
    for (const side of [0.8, Math.PI / 2, Math.PI, -2]) {
      const p = spot(round(side), earth)
      expect(p?.[0]).toBeCloseTo(W / 2, 6)
      expect(p?.[1]).toBeCloseTo(H / 2, 6)
      expect(horizonY(round(side), seat, moon)).toBeCloseTo(at(LOW), -1)
    }
  })

  it('still turns the sky the way the hand goes', () => {
    // A quarter round, swinging and rising by ten pixels' worth carries the target ten pixels right and down.
    const a = spot(round(Math.PI / 2, 10 * px), earth)
    const b = spot(round(Math.PI / 2, 0, 10 * px), earth)
    expect(a?.[0]).toBeCloseTo(W / 2 + 10, 0)
    expect(a?.[1]).toBeCloseTo(H / 2, 0)
    expect(b?.[0]).toBeCloseTo(W / 2, 0)
    expect(b?.[1]).toBeCloseTo(H / 2 + 10, 0)
  })

  describe('taking hold of the ground', () => {
    const view = (side: number): Eye => round(side, 0.2, 0.1)
    const eye = view(0)
    const n = meet(scale(sub(eye.at, seat), 1 / moon), unproject(frameOf(eye, 2), 900, 900, W, H))
    if (!n) throw new Error('missed the ground')
    const ground = add(seat, scale(n, moon))
    /** Moves the hand across from where it took hold to `x` in a few steps, as a drag does. */
    const drag = (x: number): number => {
      let side = 0
      for (let i = 1; i <= 12; i++) side = grip(view, ground, 900 + ((x - 900) * i) / 12, W, H, side)
      return side
    }

    it('keeps it under the hand going across', () => {
      for (const x of [1300, 500, 1000]) expect(spot(view(drag(x)), ground)?.[0]).toBeCloseTo(x, 1)
    })

    it('goes round the seat when dragged across', () => {
      expect(Math.abs(drag(1400))).toBeGreaterThan(0.3)
    })

    it('cannot be flung round by a hand past its reach', () => {
      const side = drag(20_000)
      expect(Number.isFinite(side)).toBe(true)
      expect(Math.abs(side)).toBeLessThan(Math.PI)
    })

    it('comes back with a hand that went past its reach', () => {
      // Out a hundred pixels at a time to well past the edge of the screen, then back.
      let side = 0
      for (let x = 1000; x <= 3000; x += 100) side = grip(view, ground, x, W, H, side)
      const out = Math.sign(side)
      for (let x = 2900; x >= 900; x -= 100) {
        const was = side
        side = grip(view, ground, x, W, H, side)
        expect((side - was) * out).toBeLessThanOrEqual(1e-9)
      }
      expect(side).toBeCloseTo(0, 6)
    })
  })
})

describe('backing away', () => {
  // On the Moon, the Earth toward the Sun.
  const moon = 1737
  const seat: Vec3 = [AU_KM, 0, 0]
  const earth: Vec3 = [AU_KM - 384_400, 0, 0]
  const neptune = Array.from({ length: 72 }, (_, i): Vec3 => {
    const t = (i / 72) * 2 * Math.PI
    return [31 * AU_KM * Math.cos(t), 31 * AU_KM * Math.sin(t), 0]
  })
  const fits = (eye: Eye): boolean =>
    neptune.every((p) => {
      const q = project(frameOf(eye, 1), norm(sub(p, eye.at)), H, H)
      return q !== null && q[0] > 0 && q[0] < H && q[1] > 0 && q[1] < H
    })

  it('goes far enough from even the Moon to fit the orbit of Neptune', () => {
    expect(fits(seatEye(seat, moon, earth, 0, 0, 0))).toBe(false)
    expect(fits(seatEye(seat, moon, earth, zMax(moon), 0, 0))).toBe(true)
    expect(fits(seatEye(seat, moon, earth, zMax(moon), 2, 1))).toBe(true)
    expect(fits(globeEye(seat, moon, zgMax(moon), 0.3, 1.2))).toBe(true)
  })
})

describe('turning to look at something else', () => {
  // On the Moon gone almost right round the Earth, to the right way up looking ten degrees above it.
  const seat: Vec3 = [0, 0, 0]
  const from = seatEye(seat, 1737, [384_400, 0, 0], 0, 0, 0, 0, LOW, 3.12)
  const to = seatEye(seat, 1737, [380_000, 0, 67_000], 0, 0, 0, 0, LOW, 0)

  it('rolls over steadily rather than all at once', () => {
    let up = frameOf(from, 2).up
    for (let i = 1; i <= 54; i++) {
      const [forward, next] = turnTo(from, to, i / 54)
      const fr = frameOf({ at: from.at, forward, up: next, fov: FOV }, 2)
      expect(Math.acos(Math.min(1, dot(fr.up, up)))).toBeLessThan(0.1)
      up = fr.up
    }
    expect(dot(up, to.up)).toBeCloseTo(1, 9)
  })
})

describe('the lens', () => {
  const eye: Eye = { at: [0, 0, 0], forward: [1, 0, 0], up: [0, 0, 1], fov: FOV }
  const fr = frameOf(eye, 2)

  it('keeps a body round out at the edge of a wide frame', () => {
    // Three degrees across, near the right-hand edge: its rim lands on the circle given for it.
    const d = norm([1, -0.72, 0.2])
    const ang = 0.026
    const c = circleOf(fr, d, ang)
    if (!c) throw new Error('no circle')
    const e1 = across([0, 0, 1], d, [1, 0, 0])
    const e2 = cross(d, e1)
    const cx = (c.x / fr.sx + 1) * H
    const cy = ((1 - c.y / fr.sy) / 2) * H
    const r = (c.r / fr.sy) * (H / 2)
    for (let i = 0; i < 12; i++) {
      const t = (i / 12) * 2 * Math.PI
      const rim = add(scale(d, Math.cos(ang)), scale(add(scale(e1, Math.cos(t)), scale(e2, Math.sin(t))), Math.sin(ang)))
      const p = project(fr, rim, 2 * H, H)
      if (!p) throw new Error('rim behind the eye')
      expect(Math.hypot(p[0] - cx, p[1] - cy)).toBeCloseTo(r, 6)
    }
  })

  it('turns a point on the screen back into the direction it shows', () => {
    const d = norm([1, 0.6, -0.3])
    const p = project(fr, d, 2 * H, H)
    if (!p) throw new Error('behind the eye')
    const back = unproject(fr, p[0], p[1], 2 * H, H)
    for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(d[i], 12)
  })
})

describe('zooming a globe', () => {
  const W = 2 * H
  /** Zooming from one globe eye to `back` radii out about a point on the screen: the yaw and pitch after, and that point's ground. */
  const turn = (yaw: number, pitch: number, z: number, back: number, px: number, py: number): [number, number, Vec3] => {
    const eye = globeEye([0, 0, 0], 1, z, yaw, pitch)
    const fr = frameOf(eye, 2)
    const ray = unproject(fr, px, py, W, H)
    const n = meet(eye.at, ray)
    if (!n) throw new Error('missed the globe')
    return [...overSpot(n, Math.acos(dot(ray, fr.forward)), Math.atan2(dot(ray, fr.up), dot(ray, fr.right)), back, yaw, pitch), n]
  }
  /** Where that point's ground lands after. */
  const zoom = (yaw: number, pitch: number, z: number, back: number, px: number, py: number): [number, number] | null => {
    const [y2, p2, n] = turn(yaw, pitch, z, back, px, py)
    const next = globeEye([0, 0, 0], 1, Math.log(back / GLOBE), y2, p2)
    return project(frameOf(next, 2), norm(sub(n, next.at)), W, H)
  }

  it('keeps the ground under the pointer, in and out', () => {
    const cases: [number, number, number, number, number, number][] = [
      [0.4, 0.3, 0, 3.8, 1250, 300],
      [2.0, -0.6, -0.5, 1.15, 700, 640],
      [-1.2, 1.1, 0.4, 4.5, 1100, 330],
      [0.9, 0.2, -0.9, 1.5, 820, 610],
    ]
    for (const [yaw, pitch, z, back, px, py] of cases) {
      const p = zoom(yaw, pitch, z, back, px, py)
      if (!p) throw new Error('behind the eye')
      expect(p[0]).toBeCloseTo(px, 6)
      expect(p[1]).toBeCloseTo(py, 6)
    }
  })

  it('goes as near as it can to ground north cannot be kept above', () => {
    // Over the north pole the ground beyond it would need the eye past the pole.
    const [yaw, pitch] = overSpot(norm([0.05, 0, 1]), 0.3, -Math.PI / 2, 3, 0, PITCH_MAX)
    expect(Number.isFinite(yaw)).toBe(true)
    expect(pitch).toBeLessThanOrEqual(PITCH_MAX)
  })

  it('stays on its side of a pole zooming about ground near it', () => {
    // Looking down on the north pole, drawn just above the middle, about ground either side of it.
    const yaw = 0.5
    const pitch = 1.2
    const round = (y: number): number => Math.abs(Math.atan2(Math.sin(y - yaw), Math.cos(y - yaw)))
    for (const [px, py] of [[1000, 250], [1100, 250], [900, 280], [1000, 300], [1000, 330]]) {
      for (const step of [-0.002, 0, 0.002]) {
        const [y2, p2] = turn(yaw, pitch, 0, GLOBE * Math.exp(step), px, py)
        expect(round(y2)).toBeLessThan(0.01)
        expect(Math.abs(p2 - pitch)).toBeLessThan(0.01)
      }
      // A whole wheel tick in or out, never half way round.
      for (const step of [-0.2, 0.2]) expect(round(turn(yaw, pitch, 0, GLOBE * Math.exp(step), px, py)[0])).toBeLessThan(1)
    }
  })
})
