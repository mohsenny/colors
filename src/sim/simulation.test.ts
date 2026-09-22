import { describe, expect, it } from 'vitest'
import {
  DRIFT_HUE_DEG,
  DRIFT_KEEP_DEG,
  DT,
  HISTORY_FRAMES,
  OMEGA_MAX_DEG,
  ROT_RESTORE_DEG,
  SLIDE_COUNT,
  SPEED_MAX,
  SPEED_MIN,
  TAB_PROUD,
} from '../core/constants'
import { DEG, wrapPi } from '../core/noise'
import type { Dye, SimState, SlideState, Viewport } from '../core/types'
import { History } from './history'
import { Simulation } from './simulation'

const VP: Viewport = {
  width: 1440,
  height: 900,
  short: 900,
  aspect: 1440 / 900,
  frame: 7,
  slideCount: SLIDE_COUNT,
}

const PORTRAIT: Viewport = { width: 420, height: 880, short: 420, aspect: 420 / 880, frame: 5, slideCount: 4 }

function fingerprint(state: SimState): string {
  return state.slides
    .map((s) =>
      [s.x, s.y, s.heading, s.speed0, s.rot, s.omegaRot, s.z, s.zTarget, s.rngState, s.catchUntil]
        .map((v) => v.toFixed(12))
        .join(','),
    )
    .join('|')
}

/** Shortest distance between two hue angles, in degrees. */
function hueGap(a: number, b: number): number {
  return Math.abs((((a - b) % 360) + 540) % 360 - 180)
}

/** The rotated union of the frame and its protruding tab, in height units. */
function unionBox(s: SlideState, vp: Viewport) {
  const p = TAB_PROUD / vp.height
  const c = Math.cos(s.rot)
  const sn = Math.sin(s.rot)
  const H = s.h + p
  return {
    left: s.x + (p / 2) * sn - (Math.abs(c) * s.w + Math.abs(sn) * H) / 2,
    right: s.x + (p / 2) * sn + (Math.abs(c) * s.w + Math.abs(sn) * H) / 2,
    top: s.y - (p / 2) * c - (Math.abs(sn) * s.w + Math.abs(c) * H) / 2,
    bottom: s.y - (p / 2) * c + (Math.abs(sn) * s.w + Math.abs(c) * H) / 2,
  }
}

function run(sim: Simulation, seconds: number, reduced = false): void {
  const steps = Math.round(seconds / DT)
  for (let i = 0; i < steps; i++) sim.step(reduced)
}

describe('determinism', () => {
  it('produces identical state from identical seeds', () => {
    const a = new Simulation(12345, VP)
    const b = new Simulation(12345, VP)
    run(a, 20)
    run(b, 20)
    expect(fingerprint(a.state)).toBe(fingerprint(b.state))
  })

  it('produces different state from different seeds', () => {
    const a = new Simulation(12345, VP)
    const b = new Simulation(999, VP)
    run(a, 5)
    run(b, 5)
    expect(fingerprint(a.state)).not.toBe(fingerprint(b.state))
  })

  it('never draws from the PRNG on a tick without a wall contact', () => {
    const sim = new Simulation(4242, VP)
    let changes = 0
    let before = sim.state.slides.map((s) => s.rngState)
    for (let i = 0; i < 60 * 60; i++) {
      sim.step(false)
      const after = sim.state.slides.map((s) => s.rngState)
      for (let k = 0; k < after.length; k++) if (after[k] !== before[k]) changes++
      before = after
    }
    // Six slides crossing a 1.6:1 box at ~0.02u/s bounce a few dozen times a
    // minute between them. Anything near the 21600 tick-count means the sim is
    // drawing every frame, which would make scrubbing unreproducible.
    expect(changes).toBeGreaterThan(0)
    expect(changes).toBeLessThan(200)
  })
})

describe('containment', () => {
  it('keeps the frame and tab inside the lightbox for five minutes', () => {
    const sim = new Simulation(777, VP)
    const steps = Math.round(300 / DT)
    let worst = 0
    for (let i = 0; i < steps; i++) {
      sim.step(false)
      for (const s of sim.state.slides) {
        const b = unionBox(s, VP)
        worst = Math.max(worst, -b.left, -b.top, b.right - sim.state.aspect, b.bottom - 1)
      }
    }
    // One pixel of tolerance: depenetration nudges by half a pixel by design.
    expect(worst).toBeLessThan(1 / VP.height)
  })

  it('keeps portrait layouts inside a narrow box', () => {
    const sim = new Simulation(31337, PORTRAIT)
    const steps = Math.round(180 / DT)
    let worst = 0
    for (let i = 0; i < steps; i++) {
      sim.step(false)
      for (const s of sim.state.slides) {
        const b = unionBox(s, PORTRAIT)
        worst = Math.max(worst, -b.left, -b.top, b.right - sim.state.aspect, b.bottom - 1)
      }
    }
    expect(worst).toBeLessThan(1 / PORTRAIT.height)
  })
})

describe('motion quality', () => {
  it('never locks onto a horizontal or vertical axis', () => {
    const sim = new Simulation(2024, VP)
    const steps = Math.round(240 / DT)
    let axisTicks = 0
    let total = 0
    for (let i = 0; i < steps; i++) {
      sim.step(false)
      for (const s of sim.state.slides) {
        const off = Math.abs(wrapPi(s.heading))
        const near =
          off < 4 * DEG || Math.abs(off - Math.PI / 2) < 4 * DEG || Math.abs(off - Math.PI) < 4 * DEG
        if (near) axisTicks++
        total++
      }
    }
    // Passing through an axis is fine. Living on one is not.
    expect(axisTicks / total).toBeLessThan(0.1)
  })

  it('does not run a periodic loop', () => {
    const sim = new Simulation(5150, VP)
    run(sim, 30)
    const mark = fingerprint(sim.state)
    let repeats = 0
    const steps = Math.round(240 / DT)
    for (let i = 0; i < steps; i++) {
      sim.step(false)
      if (fingerprint(sim.state) === mark) repeats++
    }
    expect(repeats).toBe(0)
  })

  // Reads the tilt constants rather than fixed numbers: tilt is one switch
  // (TILT_DEG), and this has to hold both when it is off, which is how it
  // ships, and when it is turned back on.
  it('keeps rotation gentle and unwrapped', () => {
    const sim = new Simulation(8080, VP)
    const steps = Math.round(300 / DT)
    let maxRot = 0
    let maxOmega = 0
    for (let i = 0; i < steps; i++) {
      sim.step(false)
      for (const s of sim.state.slides) {
        maxRot = Math.max(maxRot, Math.abs(s.rot))
        maxOmega = Math.max(maxOmega, Math.abs(s.omegaRot))
      }
    }
    expect(maxRot).toBeLessThanOrEqual((ROT_RESTORE_DEG + 18) * DEG)
    expect(maxOmega).toBeLessThanOrEqual(OMEGA_MAX_DEG * DEG + 1e-9)
  })

  // Both ends matter. Too fast stops being hypnotic; too slow reads as a still
  // image, which is what the first tuning pass shipped. The band is checked
  // against the constants so a retune cannot silently drift out of it.
  it('moves inside the speed band it was tuned for', () => {
    const sim = new Simulation(606, VP)
    const before = sim.state.slides.map((s) => ({ x: s.x, y: s.y }))
    run(sim, 1)
    let fastest = 0
    sim.state.slides.forEach((s, i) => {
      const p = before[i] as { x: number; y: number }
      const travelled = Math.hypot(s.x - p.x, s.y - p.y)
      // SPEED_MAX bounds the slide's base speed, not what it does with it: the
      // breath noise adds up to 18% and the depth term up to 12%, so the real
      // envelope is a third above the constant. Steering curves the path, so a
      // second of travel is always a little short of a second of speed, which
      // is what the floor allows for.
      expect(travelled).toBeLessThanOrEqual(SPEED_MAX * 1.33)
      expect(travelled).toBeGreaterThan(SPEED_MIN * 0.7)
      fastest = Math.max(fastest, travelled)
    })
    expect(fastest).toBeGreaterThan(SPEED_MIN * 1.3)
  })

  it('substantially reduces movement under prefers-reduced-motion', () => {
    const normal = new Simulation(4711, VP)
    const reduced = new Simulation(4711, VP)
    const start = normal.state.slides.map((s) => ({ x: s.x, y: s.y }))
    run(normal, 10)
    run(reduced, 10, true)
    const travel = (sim: Simulation) =>
      sim.state.slides.reduce((acc, s, i) => {
        const p = start[i] as { x: number; y: number }
        return acc + Math.hypot(s.x - p.x, s.y - p.y)
      }, 0)
    expect(travel(reduced)).toBeLessThan(travel(normal) * 0.35)
  })
})

describe('overlap behaviour', () => {
  it('reaches an interesting composition within the first four seconds', () => {
    let good = 0
    const seeds = 24
    for (let k = 0; k < seeds; k++) {
      const sim = new Simulation(1000 + k * 7919, VP)
      let pairs = 0
      let triples = 0
      const steps = Math.round(4 / DT)
      for (let i = 0; i < steps; i++) {
        sim.step(false)
        const c = sim.overlapCountsNow()
        pairs = Math.max(pairs, c.pairs)
        triples = Math.max(triples, c.triples)
      }
      if (pairs >= 2 && triples >= 1) good++
    }
    expect(good).toBeGreaterThanOrEqual(seeds - 2)
  })

  it('spends most of its time in the 1 to 4 overlap band', () => {
    const sim = new Simulation(90210, VP)
    const steps = Math.round(300 / DT)
    const clusters: number[] = [0, 0, 0, 0, 0, 0, 0]
    let anyOverlapTicks = 0
    for (let i = 0; i < steps; i++) {
      sim.step(false)
      const largest = sim.largestCluster()
      clusters[largest] = (clusters[largest] as number) + 1
      if (sim.overlapPairs() > 0) anyOverlapTicks++
    }
    // Something is overlapping nearly all the time: that is the whole product.
    expect(anyOverlapTicks / steps).toBeGreaterThan(0.75)
    // But all six never pile up and stay there.
    expect((clusters[6] as number) / steps).toBeLessThan(0.02)
    expect(((clusters[2] as number) + (clusters[3] as number)) / steps).toBeGreaterThan(0.4)
  })

  /**
   * The overlap tests above pass perfectly well on a composition that huddles in
   * the middle of a big blank room, which is exactly what shipped: a single
   * shared attractor plus a circular leash left the rim permanently empty. This
   * is the test that would have caught it.
   */
  it('uses the whole lightbox rather than huddling in the middle', () => {
    for (const seed of [90210, 4242, 777]) {
      const sim = new Simulation(seed, VP)
      const cols = 4
      const rows = 3
      const visited = new Set<number>()
      const steps = Math.round(240 / DT)
      for (let i = 0; i < steps; i++) {
        sim.step(false)
        for (const s of sim.state.slides) {
          const c = Math.min(cols - 1, Math.max(0, Math.floor((s.x / sim.state.aspect) * cols)))
          const r = Math.min(rows - 1, Math.max(0, Math.floor(s.y * rows)))
          visited.add(r * cols + c)
        }
      }
      // Every cell of a 4x3 grid sees a slide centre within four minutes.
      expect(visited.size).toBe(cols * rows)
    }
  })

  it('is usually spread out, while still allowing a momentary huddle', () => {
    for (const seed of [31337, 90210, 4242]) {
      const sim = new Simulation(seed, VP)
      const steps = Math.round(180 / DT)
      const spreads: number[] = []
      for (let i = 0; i < steps; i++) {
        sim.step(false)
        // Mean distance from the centroid, over the half-diagonal. A tight huddle
        // sits near 0.15; a composition that uses the box sits near 0.3.
        const n = sim.state.slides.length
        let mx = 0
        let my = 0
        for (const s of sim.state.slides) {
          mx += s.x / n
          my += s.y / n
        }
        let spread = 0
        for (const s of sim.state.slides) spread += Math.hypot(s.x - mx, s.y - my) / n
        spreads.push(spread / (0.5 * Math.hypot(sim.state.aspect, 1)))
      }
      spreads.sort((a, b) => a - b)
      const median = spreads[Math.floor(spreads.length / 2)] as number
      const p05 = spreads[Math.floor(0.05 * spreads.length)] as number
      // Typically using the box.
      expect(median).toBeGreaterThan(0.26)
      // A brief huddle is a good thing, it is where the overlaps come from. What
      // must not happen is the set collapsing into a permanent knot.
      expect(p05).toBeGreaterThan(0.15)
    }
  })
})

describe('scrub exactness', () => {
  it('replays the identical future after restoring a past frame', () => {
    const sim = new Simulation(60606, VP)
    const history = new History(SLIDE_COUNT)
    const recorded: string[] = []
    for (let tick = 1; tick <= 500; tick++) {
      sim.step(false)
      history.capture(sim.state, tick)
      recorded.push(fingerprint(sim.state))
    }

    // Drag back 200 frames, then let it run forward again.
    history.restore(sim.state, 300)
    expect(fingerprint(sim.state)).toBe(recorded[299])

    for (let tick = 301; tick <= 500; tick++) {
      sim.step(false)
      expect(fingerprint(sim.state)).toBe(recorded[tick - 1])
    }
  })

  it('survives a restore taken mid-bounce', () => {
    const sim = new Simulation(13, VP)
    const history = new History(SLIDE_COUNT)
    const recorded: string[] = []
    let bounceTick = -1
    let prev = sim.state.slides.map((s) => s.rngState)
    // Exactly one window: recording past HISTORY_FRAMES would roll the bounce
    // out of the buffer, and restore() clamps rather than throwing, so the
    // failure would look like a determinism bug instead of a test that asked
    // for a frame the ring no longer holds.
    for (let tick = 1; tick <= HISTORY_FRAMES; tick++) {
      sim.step(false)
      history.capture(sim.state, tick)
      recorded.push(fingerprint(sim.state))
      const now = sim.state.slides.map((s) => s.rngState)
      if (bounceTick < 0 && now.some((v, i) => v !== prev[i]) && tick > 60) bounceTick = tick
      prev = now
    }
    expect(bounceTick).toBeGreaterThan(0)

    history.restore(sim.state, bounceTick)
    expect(fingerprint(sim.state)).toBe(recorded[bounceTick - 1])
    for (let tick = bounceTick + 1; tick <= bounceTick + 240; tick++) {
      sim.step(false)
      expect(fingerprint(sim.state)).toBe(recorded[tick - 1])
    }
  })

  it('restores every frame in the retained window', () => {
    const sim = new Simulation(31, VP)
    const history = new History(SLIDE_COUNT)
    const recorded = new Map<number, string>()
    for (let tick = 1; tick <= HISTORY_FRAMES + 200; tick++) {
      sim.step(false)
      history.capture(sim.state, tick)
      recorded.set(tick, fingerprint(sim.state))
    }
    for (let tick = history.oldest; tick <= history.head; tick += 37) {
      history.restore(sim.state, tick)
      expect(fingerprint(sim.state)).toBe(recorded.get(tick))
    }
  })
})

describe('holding', () => {
  it('stops the held slide dead and leaves the other five alone', () => {
    const sim = new Simulation(8642, VP)
    run(sim, 2)
    const held = sim.state.slides[2] as SlideState
    sim.setHeld(held.id)
    const before = sim.state.slides.map((s) => ({ x: s.x, y: s.y, rot: s.rot, heading: s.heading }))
    run(sim, 6)
    const frozen = before[2] as { x: number; y: number; rot: number; heading: number }
    expect(held.x).toBe(frozen.x)
    expect(held.y).toBe(frozen.y)
    expect(held.rot).toBe(frozen.rot)
    // The clocks stop too, so it resumes on the heading it stopped on.
    expect(held.heading).toBe(frozen.heading)
    sim.state.slides.forEach((s, i) => {
      if (i === 2) return
      const p = before[i] as { x: number; y: number }
      expect(Math.hypot(s.x - p.x, s.y - p.y)).toBeGreaterThan(0.01)
    })
  })

  it('lets go again, and the slide carries on rather than restarting', () => {
    const sim = new Simulation(8642, VP)
    run(sim, 2)
    const s = sim.state.slides[2] as SlideState
    sim.setHeld(s.id)
    const heading = s.heading
    run(sim, 6)
    sim.setHeld(null)
    const from = { x: s.x, y: s.y }
    run(sim, 1)
    expect(Math.hypot(s.x - from.x, s.y - from.y)).toBeGreaterThan(0.005)
    // Same bearing it was put down on, give or take one second of steering.
    expect(Math.abs(wrapPi(Math.atan2(s.y - from.y, s.x - from.x) - heading))).toBeLessThan(0.15)
  })

  it('still dissolves a new colour into a slide that is being held', () => {
    const sim = new Simulation(8642, VP)
    const s = sim.state.slides[0] as SlideState
    sim.setHeld(s.id)
    const was = s.dye.h
    sim.applyPalette(sim.state.slides.map((v) => ({ ...v.dye, h: (v.dye.h + 120) % 360 })))
    run(sim, 2)
    expect(s.dye.h).not.toBe(was)
    expect(s.tweenT).toBe(1)
  })

  it('puts a slide where it is dropped, but never outside the box', () => {
    const sim = new Simulation(2468, VP)
    run(sim, 3)
    const s = sim.state.slides[1] as SlideState
    sim.setHeld(s.id)
    sim.moveTo(s.id, 0.9, 0.4)
    expect(s.x).toBeCloseTo(0.9, 10)
    expect(s.y).toBeCloseTo(0.4, 10)
    // Dropped hard against the top-left corner: the tab has to stay on screen.
    sim.moveTo(s.id, -5, -5)
    const b = unionBox(s, VP)
    expect(b.left).toBeGreaterThanOrEqual(-1e-9)
    expect(b.top).toBeGreaterThanOrEqual(-1e-9)
    sim.moveTo(s.id, 99, 99)
    const c = unionBox(s, VP)
    expect(c.right).toBeLessThanOrEqual(sim.state.aspect + 1e-9)
    expect(c.bottom).toBeLessThanOrEqual(1 + 1e-9)
  })
})

describe('drift against the palette', () => {
  it('never lets two slides wander into the same colour', () => {
    // A tight but legal set: the generator's typical roll is wider than this.
    // Unbounded, two neighbours swinging DRIFT_HUE_DEG each would close 52 of
    // the 40 degrees between them and cross, which is the four-shades-of-blue
    // the palette work exists to prevent, arriving four seconds later instead.
    const sim = new Simulation(4711, VP)
    const spaced: Dye[] = sim.state.slides.map((_, i) => ({
      L: 0.72,
      C: 0.18,
      h: i * 40,
      d: 0.86,
    }))
    sim.setPalette(spaced)

    let worst = 360
    for (let i = 0; i < Math.round(240 / DT); i++) {
      sim.step(false)
      for (let a = 0; a < sim.state.slides.length; a++) {
        for (let b = a + 1; b < sim.state.slides.length; b++) {
          const p = sim.state.slides[a] as SlideState
          const q = sim.state.slides[b] as SlideState
          worst = Math.min(worst, hueGap(p.dye.h, q.dye.h))
        }
      }
    }
    expect(worst).toBeGreaterThanOrEqual(DRIFT_KEEP_DEG - 1e-6)
  })

  it('still gives a slide with room a real excursion', () => {
    const sim = new Simulation(4711, VP)
    const wide: Dye[] = sim.state.slides.map((_, i) => ({
      L: 0.72,
      C: 0.18,
      h: (i * 360) / sim.state.slides.length,
      d: 0.86,
    }))
    sim.setPalette(wide)
    const base = sim.state.slides.map((s) => s.dyeBase.h)

    let reached = 0
    for (let i = 0; i < Math.round(240 / DT); i++) {
      sim.step(false)
      sim.state.slides.forEach((s, k) => {
        reached = Math.max(reached, hueGap(s.dye.h, base[k] as number))
      })
    }
    // Evenly spaced, every slide gets the same allowance, and the drift should
    // spend most of it rather than sitting near its base. Written against the
    // geometry, not a number, so adding slides tightens the expectation instead
    // of silently failing it.
    const allowance = (360 / sim.state.slides.length - DRIFT_KEEP_DEG) / 2
    expect(reached).toBeGreaterThan(allowance * 0.7)
  })
})

describe('mutation', () => {
  it('resizes without moving the slide out of bounds or changing its aspect', () => {
    const sim = new Simulation(2468, VP)
    run(sim, 3)
    const s = sim.state.slides[0] as SlideState
    const ratio = s.w / s.h
    sim.setSizeFrac(s.id, 0.62)
    expect(s.w / s.h).toBeCloseTo(ratio, 10)
    const b = unionBox(s, VP)
    expect(b.left).toBeGreaterThanOrEqual(-1e-9)
    expect(b.top).toBeGreaterThanOrEqual(-1e-9)
    expect(b.right).toBeLessThanOrEqual(sim.state.aspect + 1e-9)
    expect(b.bottom).toBeLessThanOrEqual(1 + 1e-9)
  })

  it('clamps size to the configured band', () => {
    const sim = new Simulation(2468, VP)
    const s = sim.state.slides[0] as SlideState
    sim.setSizeFrac(s.id, 99)
    expect(s.sizeFrac).toBeLessThanOrEqual(0.62)
    sim.setSizeFrac(s.id, -5)
    expect(s.sizeFrac).toBeGreaterThanOrEqual(0.12)
  })

  it('keeps colours moving and motion untouched when the palette is regenerated', () => {
    const sim = new Simulation(1379, VP)
    run(sim, 5)
    const before = sim.state.slides.map((s) => ({ x: s.x, y: s.y, heading: s.heading }))
    sim.applyPalette(sim.state.slides.map((s) => ({ ...s.dye, h: (s.dye.h + 120) % 360 })))
    sim.state.slides.forEach((s, i) => {
      const p = before[i] as { x: number; y: number; heading: number }
      expect(s.x).toBe(p.x)
      expect(s.y).toBe(p.y)
      expect(s.heading).toBe(p.heading)
    })
    run(sim, 2)
    sim.state.slides.forEach((s) => {
      expect(s.tweenT).toBe(1)
      // The base lands on the target exactly. What is on screen is the base
      // plus the slow drift, which is bounded by DRIFT_HUE_DEG either way.
      expect(s.dyeBase.h).toBeCloseTo(s.dyeTo.h, 6)
      expect(hueGap(s.dye.h, s.dyeBase.h)).toBeLessThanOrEqual(DRIFT_HUE_DEG + 1e-9)
    })
  })

  it('keeps slides inside the box after a viewport change', () => {
    const sim = new Simulation(13579, VP)
    run(sim, 10)
    const next: Viewport = { ...VP, width: 800, height: 1200, short: 800, aspect: 800 / 1200 }
    sim.setViewport(next)
    for (const s of sim.state.slides) {
      const b = unionBox(s, next)
      expect(b.left).toBeGreaterThanOrEqual(-1e-9)
      expect(b.right).toBeLessThanOrEqual(next.aspect + 1e-9)
      expect(b.top).toBeGreaterThanOrEqual(-1e-9)
      expect(b.bottom).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('rebuilds the layout but preserves locks when the slide count changes', () => {
    const sim = new Simulation(24680, VP)
    ;(sim.state.slides[1] as SlideState).locked = true
    sim.setViewport({ ...VP, slideCount: 4, width: 420, height: 880, short: 420, aspect: 420 / 880 })
    expect(sim.state.slides).toHaveLength(4)
    expect((sim.state.slides[1] as SlideState).locked).toBe(true)
  })

  it('carries the pinned colour through a rebuild, not just the pin', () => {
    const sim = new Simulation(24680, VP)
    const pinned: Dye = { L: 0.55, C: 0.17, h: 212, d: 0.9 }
    sim.setPalette(sim.state.slides.map((_, i) => (i === 1 ? pinned : { L: 0.7, C: 0.12, h: i * 40, d: 0.8 })))
    // Through the real path: pinning freezes the drift on the base, which is
    // what makes the pinned colour a fixed thing worth carrying at all.
    sim.setLocked(1, true)
    // What the pin saved is what was on screen at the moment it was pinned:
    // the palette colour with that instant's drift baked in, held still.
    const saved = { ...(sim.state.slides[1] as SlideState).dye }
    expect(hueGap(saved.h, pinned.h)).toBeLessThanOrEqual(DRIFT_HUE_DEG + 1e-9)

    sim.setViewport({ ...VP, slideCount: 4, width: 420, height: 880, short: 420, aspect: 420 / 880 })
    const s = sim.state.slides[1] as SlideState
    // Not the seed placeholder: a pin the user saved has to survive a resize.
    for (const d of [s.dye, s.dyeBase, s.dyeFrom, s.dyeTo]) {
      expect(d.L).toBeCloseTo(saved.L, 12)
      expect(d.C).toBeCloseTo(saved.C, 12)
      expect(d.h).toBeCloseTo(saved.h, 12)
      expect(d.d).toBeCloseTo(saved.d, 12)
    }
    // And the copies are not aliased to the caller's object or to each other.
    const h = saved.h
    s.dye.h = 0
    expect(s.dyeTo.h).toBe(h)
    expect(pinned.h).toBe(212)
  })
})
