import { describe, expect, it } from 'vitest'
import { HISTORY_FRAMES, SLIDE_COUNT } from '../core/constants'
import type { SimState, SlideState } from '../core/types'
import { History } from './history'

function slide(id: number): SlideState {
  return {
    id,
    x: id,
    y: id,
    heading: id,
    speed0: id,
    rot: id,
    omegaRot: id,
    sizeFrac: 0.3,
    aspect: 1,
    w: 0.2,
    h: 0.2,
    z: 0.5,
    zTarget: 0.5,
    dye: { L: 0.8, C: 0.2, h: 30, d: 0.9 },
    dyeBase: { L: 0.8, C: 0.2, h: 30, d: 0.9 },
    dyeFrom: { L: 0.8, C: 0.2, h: 30, d: 0.9 },
    dyeTo: { L: 0.8, C: 0.2, h: 30, d: 0.9 },
    tweenT: 1,
    tweenDelay: 0,
    driftGate: 1,
    lonelyTimer: 0,
    stickyTimer: id * 0.25,
    cd: [0, 0, 0, 0],
    rngState: 0,
    catchUntil: 0,
    speedPre: id,
    locked: false,
    held: false,
  }
}

function makeState(): SimState {
  return {
    t: 0,
    aspect: 1.6,
    modeMix: 0,
    paletteEpoch: 0,
    slides: Array.from({ length: SLIDE_COUNT }, (_, i) => slide(i)),
  }
}

/** Stamp every recorded lane with a value derived from the tick. */
function stamp(state: SimState, tick: number): void {
  state.t = tick * 0.016
  state.modeMix = (tick % 100) / 100
  state.paletteEpoch = Math.floor(tick / 50)
  state.slides.forEach((s, i) => {
    const v = tick * 10 + i
    s.x = v
    s.y = v + 0.5
    s.heading = v * 0.001
    s.speed0 = v * 0.0001
    s.rot = v * 0.002
    s.omegaRot = v * 0.0003
    s.sizeFrac = 0.2 + (i % 5) * 0.05
    s.w = 0.1 + i * 0.01
    s.h = 0.2 + i * 0.01
    s.z = (i + 1) / 10
    s.zTarget = (i + 2) / 10
    s.dye = { L: 0.5 + i * 0.01, C: 0.1 + i * 0.01, h: v % 360, d: 0.8 }
    s.dyeBase = { L: 0.52 + i * 0.01, C: 0.12 + i * 0.01, h: (v + 17) % 360, d: 0.82 }
    s.tweenT = ((tick + i) % 20) / 20
    s.tweenDelay = i * 0.01
    s.lonelyTimer = tick * 0.01
    s.stickyTimer = tick * 0.02 + i
    s.cd = [i * 0.1, i * 0.2, i * 0.3, i * 0.4]
    s.rngState = (tick * 2654435761 + i) >>> 0
    s.catchUntil = v * 0.05
    s.speedPre = v * 0.00011
  })
}

function digest(state: SimState): string {
  return JSON.stringify([
    state.t,
    state.aspect,
    state.modeMix,
    state.paletteEpoch,
    state.slides.map((s) => [
      s.x,
      s.y,
      s.heading,
      s.speed0,
      s.rot,
      s.omegaRot,
      s.sizeFrac,
      s.aspect,
      s.w,
      s.h,
      s.z,
      s.zTarget,
      s.dye.L,
      s.dye.C,
      s.dye.h,
      s.dye.d,
      s.dyeBase.L,
      s.dyeBase.C,
      s.dyeBase.h,
      s.dyeBase.d,
      s.tweenT,
      s.tweenDelay,
      s.lonelyTimer,
      s.stickyTimer,
      s.cd,
      s.rngState,
      s.catchUntil,
      s.speedPre,
    ]),
  ])
}

describe('History', () => {
  it('starts empty', () => {
    const h = new History(SLIDE_COUNT)
    expect(h.head).toBe(-1)
    expect(h.length).toBe(0)
    expect(h.has(0)).toBe(false)
    expect(h.restore(makeState(), 0)).toBe(false)
  })

  it('round-trips every lane exactly', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    const expected = new Map<number, string>()
    for (let tick = 1; tick <= 40; tick++) {
      stamp(state, tick)
      h.capture(state, tick)
      expected.set(tick, digest(state))
    }
    for (let tick = 1; tick <= 40; tick++) {
      h.restore(state, tick)
      expect(digest(state)).toBe(expected.get(tick))
    }
  })

  it('holds a uint32 rng state without rounding', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    ;(state.slides[0] as SlideState).rngState = 4294967295
    ;(state.slides[1] as SlideState).rngState = 2147483649
    h.capture(state, 1)
    ;(state.slides[0] as SlideState).rngState = 0
    ;(state.slides[1] as SlideState).rngState = 0
    h.restore(state, 1)
    expect((state.slides[0] as SlideState).rngState).toBe(4294967295)
    expect((state.slides[1] as SlideState).rngState).toBe(2147483649)
  })

  it('evicts the oldest frame once full and keeps the window exact', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    const expected = new Map<number, string>()
    const last = HISTORY_FRAMES + 250
    for (let tick = 1; tick <= last; tick++) {
      stamp(state, tick)
      h.capture(state, tick)
      expected.set(tick, digest(state))
    }
    expect(h.length).toBe(HISTORY_FRAMES)
    expect(h.head).toBe(last)
    expect(h.oldest).toBe(last - HISTORY_FRAMES + 1)
    expect(h.has(h.oldest - 1)).toBe(false)

    for (const tick of [h.oldest, h.oldest + 1, h.head - 1, h.head]) {
      h.restore(state, tick)
      expect(digest(state)).toBe(expected.get(tick))
    }
  })

  it('clamps rather than throwing when the playhead overshoots', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    for (let tick = 1; tick <= 30; tick++) {
      stamp(state, tick)
      h.capture(state, tick)
    }
    const atOldest = (() => {
      h.restore(state, h.oldest)
      return digest(state)
    })()
    h.restore(state, -500)
    expect(digest(state)).toBe(atOldest)

    const atHead = (() => {
      h.restore(state, h.head)
      return digest(state)
    })()
    h.restore(state, 99999)
    expect(digest(state)).toBe(atHead)
  })

  it('truncates the future when the user edits from the past', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    for (let tick = 1; tick <= 100; tick++) {
      stamp(state, tick)
      h.capture(state, tick)
    }
    h.truncateAfter(60)
    expect(h.head).toBe(60)
    expect(h.oldest).toBe(1)
    expect(h.length).toBe(60)
    expect(h.has(61)).toBe(false)

    // Recording resumes contiguously from the branch point.
    stamp(state, 61)
    const branch = digest(state)
    h.capture(state, 61)
    expect(h.head).toBe(61)
    h.restore(state, 61)
    expect(digest(state)).toBe(branch)
  })

  it('ignores a truncate at or past the head', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    for (let tick = 1; tick <= 20; tick++) {
      stamp(state, tick)
      h.capture(state, tick)
    }
    h.truncateAfter(20)
    expect(h.head).toBe(20)
    h.truncateAfter(999)
    expect(h.head).toBe(20)
    expect(h.length).toBe(20)
  })

  it('restarts cleanly when the tick sequence is rebased', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    for (let tick = 1; tick <= 50; tick++) {
      stamp(state, tick)
      h.capture(state, tick)
    }
    h.clear()
    expect(h.head).toBe(-1)
    expect(h.length).toBe(0)

    stamp(state, 1)
    h.capture(state, 1)
    expect(h.head).toBe(1)
    expect(h.oldest).toBe(1)
    expect(h.length).toBe(1)

    // A non-contiguous tick must not stitch two timelines together.
    stamp(state, 500)
    h.capture(state, 500)
    expect(h.head).toBe(500)
    expect(h.length).toBe(1)
    expect(h.oldest).toBe(500)
  })

  it('never restores the locked flag, because locking is user state', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    h.capture(state, 1)
    ;(state.slides[2] as SlideState).locked = true
    h.restore(state, 1)
    expect((state.slides[2] as SlideState).locked).toBe(true)
  })

  it('never restores the held flag either: a scrub must not let go of a slide', () => {
    const h = new History(SLIDE_COUNT)
    const state = makeState()
    ;(state.slides[2] as SlideState).held = true
    h.capture(state, 1)
    h.restore(state, 1)
    expect((state.slides[2] as SlideState).held).toBe(true)
  })

  it('sizes itself to the slide count it was built for', () => {
    const h = new History(4)
    const state: SimState = { ...makeState(), slides: [slide(0), slide(1), slide(2), slide(3)] }
    stamp(state, 1)
    const expected = digest(state)
    h.capture(state, 1)
    stamp(state, 99)
    h.restore(state, 1)
    expect(digest(state)).toBe(expected)
  })
})
