import { GLOBAL_LANES, HISTORY_FRAMES, SLIDE_LANES } from '../core/constants'
import type { SimState, SlideState } from '../core/types'

/**
 * A fixed ring of complete simulation states.
 *
 * One flat Float64Array, allocated once, written in place: the timeline must not
 * produce a single byte of garbage per frame, and it must not grow while the app
 * runs for an hour. Float64 rather than the smaller Float32 because the buffer
 * carries `rngState` (a uint32, which Float32 cannot hold exactly) and absolute
 * times; a scrub that returns an almost-right random seed is not a scrub.
 *
 * `locked` is deliberately absent, and so is the `driftGate` derived from it.
 * Locking is user state, not simulation state, so dragging the playhead must
 * never unlock a colour somebody pinned.
 */
export class History {
  readonly capacity = HISTORY_FRAMES
  private readonly stride: number
  private readonly slideCount: number
  private readonly buf: Float64Array
  private newest = -1
  private stored = 0

  constructor(slideCount: number) {
    this.slideCount = slideCount
    this.stride = GLOBAL_LANES + slideCount * SLIDE_LANES
    this.buf = new Float64Array(this.capacity * this.stride)
  }

  /** Absolute tick of the newest recorded frame, or -1 when empty. */
  get head(): number {
    return this.newest
  }

  /** Absolute tick of the oldest frame still reachable. */
  get oldest(): number {
    return this.newest < 0 ? 0 : this.newest - this.stored + 1
  }

  get length(): number {
    return this.stored
  }

  has(tick: number): boolean {
    return this.stored > 0 && tick >= this.oldest && tick <= this.newest
  }

  clear(): void {
    this.newest = -1
    this.stored = 0
  }

  /**
   * Record the current state at `tick`. Ticks must arrive contiguously; anything
   * else means the caller re-based time, so the ring restarts rather than
   * silently interleaving two timelines.
   */
  capture(state: SimState, tick: number): void {
    if (this.newest >= 0 && tick !== this.newest + 1) {
      this.newest = -1
      this.stored = 0
    }

    const b = this.buf
    let p = this.offset(tick)
    b[p] = state.t
    b[p + 1] = state.aspect
    b[p + 2] = state.modeMix
    b[p + 3] = state.paletteEpoch
    p += GLOBAL_LANES

    const n = Math.min(this.slideCount, state.slides.length)
    for (let i = 0; i < n; i++) {
      const s = state.slides[i] as SlideState
      b[p] = s.x
      b[p + 1] = s.y
      b[p + 2] = s.heading
      b[p + 3] = s.speed0
      b[p + 4] = s.rot
      b[p + 5] = s.omegaRot
      b[p + 6] = s.sizeFrac
      b[p + 7] = s.aspect
      b[p + 8] = s.w
      b[p + 9] = s.h
      b[p + 10] = s.z
      b[p + 11] = s.zTarget
      b[p + 12] = s.dye.L
      b[p + 13] = s.dye.C
      b[p + 14] = s.dye.h
      b[p + 15] = s.dye.d
      b[p + 16] = s.tweenT
      b[p + 17] = s.tweenDelay
      b[p + 18] = s.lonelyTimer
      b[p + 19] = s.cd[0]
      b[p + 20] = s.cd[1]
      b[p + 21] = s.cd[2]
      b[p + 22] = s.cd[3]
      b[p + 23] = s.rngState
      b[p + 24] = s.catchUntil
      b[p + 25] = s.speedPre
      b[p + 26] = s.stickyTimer
      // The base colour as well as the displayed one. The drift on top of it is
      // a pure function of `t` and recomputes itself on the next step, but the
      // base is real state: without it a scrub landing mid-regenerate would
      // resume the crossfade from the wrong place.
      b[p + 27] = s.dyeBase.L
      b[p + 28] = s.dyeBase.C
      b[p + 29] = s.dyeBase.h
      b[p + 30] = s.dyeBase.d
      // Same argument as dyeBase, one lane over: `rot` is the resting lean plus
      // a pure function of `t`, so the displayed angle rebuilds itself, but the
      // lean is state and the spin integrates into it.
      b[p + 31] = s.rotRest
      p += SLIDE_LANES
    }

    this.newest = tick
    if (this.stored < this.capacity) this.stored += 1
  }

  /**
   * Put the simulation back exactly where it was at `tick`. Out-of-range ticks
   * clamp to the window rather than throwing: the playhead is driven by a pointer
   * and will overshoot by a frame at the edges.
   */
  restore(state: SimState, tick: number): boolean {
    if (this.stored === 0) return false
    const t = tick < this.oldest ? this.oldest : tick > this.newest ? this.newest : tick

    const b = this.buf
    let p = this.offset(t)
    state.t = b[p] as number
    state.aspect = b[p + 1] as number
    state.modeMix = b[p + 2] as number
    state.paletteEpoch = b[p + 3] as number
    p += GLOBAL_LANES

    const n = Math.min(this.slideCount, state.slides.length)
    for (let i = 0; i < n; i++) {
      const s = state.slides[i] as SlideState
      s.x = b[p] as number
      s.y = b[p + 1] as number
      s.heading = b[p + 2] as number
      s.speed0 = b[p + 3] as number
      s.rot = b[p + 4] as number
      s.omegaRot = b[p + 5] as number
      s.sizeFrac = b[p + 6] as number
      s.aspect = b[p + 7] as number
      s.w = b[p + 8] as number
      s.h = b[p + 9] as number
      s.z = b[p + 10] as number
      s.zTarget = b[p + 11] as number
      // Mutated in place: dye is never aliased to dyeFrom or dyeTo.
      s.dye.L = b[p + 12] as number
      s.dye.C = b[p + 13] as number
      s.dye.h = b[p + 14] as number
      s.dye.d = b[p + 15] as number
      s.tweenT = b[p + 16] as number
      s.tweenDelay = b[p + 17] as number
      s.lonelyTimer = b[p + 18] as number
      s.cd[0] = b[p + 19] as number
      s.cd[1] = b[p + 20] as number
      s.cd[2] = b[p + 21] as number
      s.cd[3] = b[p + 22] as number
      s.rngState = b[p + 23] as number
      s.catchUntil = b[p + 24] as number
      s.speedPre = b[p + 25] as number
      s.stickyTimer = b[p + 26] as number
      s.dyeBase.L = b[p + 27] as number
      s.dyeBase.C = b[p + 28] as number
      s.dyeBase.h = b[p + 29] as number
      s.dyeBase.d = b[p + 30] as number
      s.rotRest = b[p + 31] as number
      p += SLIDE_LANES
    }
    return true
  }

  /** Drop everything after `tick`. Used when the user edits from the past. */
  truncateAfter(tick: number): void {
    if (this.stored === 0 || tick >= this.newest) return
    if (tick < this.oldest) {
      this.clear()
      return
    }
    this.stored -= this.newest - tick
    this.newest = tick
  }

  private offset(tick: number): number {
    const i = ((tick % this.capacity) + this.capacity) % this.capacity
    return i * this.stride
  }
}
