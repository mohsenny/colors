/*
 * The tape: the last two minutes of the clock as you watched it, so a moment
 * that has gone by can be found again. A sample is taken every thirtieth of a
 * second of playing whatever the speed, so an eclipse watched slowly takes as
 * much of the tape as a year that flew past. A jump (back to now, or to an
 * eclipse) stays a jump rather than a blur of the years between, and the
 * eclipse peaks the clock runs through are marked on it.
 */

import type { Eclipse } from '../sky/eclipses'

/** Seconds of watching the tape holds. */
export const TAPE_S = 120
const STEP_S = 1 / 30
const SIZE = Math.round(TAPE_S / STEP_S)
/** Eclipse peaks remembered, to mark when the clock runs through one. */
const KNOWN = 12

/** An eclipse the clock ran through, and where its peak falls on the tape, 0 the oldest moment and 1 the newest. */
export interface Mark {
  at: number
  e: Eclipse
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export class Tape {
  private ring = new Float64Array(SIZE)
  /** Whether the clock jumped to each sample rather than running to it. */
  private jumps = new Uint8Array(SIZE)
  /** Samples ever taken, so a mark keeps its place as the oldest fall off. */
  private taken = 0
  private count = 0
  private acc = 0
  /** Where eclipse peaks fall, in samples ever taken, oldest first. */
  private marks: Array<{ sample: number; e: Eclipse }> = []
  private known: Eclipse[] = []

  /** How much of the tape has been watched, 0 to 1. */
  get filled(): number {
    return this.count / SIZE
  }

  /** Where the eclipse peaks it ran through fall on it, 0 the oldest moment and 1 the newest. */
  get markings(): Mark[] {
    const first = this.taken - this.count
    const n = this.count - 1
    return n > 0 ? this.marks.map((m) => ({ at: (m.sample - first) / n, e: m.e })) : []
  }

  private slot(i: number): number {
    return (this.taken - this.count + i) % SIZE
  }

  private push(ms: number, jump: boolean): void {
    if (this.count > 0 && !jump) {
      const a = this.ring[this.slot(this.count - 1)]
      const k = this.taken - 1
      const found: Array<{ sample: number; e: Eclipse }> = []
      for (const e of this.known) {
        const p = e.peak
        if ((a < p && p <= ms) || (ms <= p && p < a)) found.push({ sample: k + (p - a) / (ms - a), e })
      }
      this.marks.push(...found.sort((x, y) => x.sample - y.sample))
    }
    this.ring[this.taken % SIZE] = ms
    this.jumps[this.taken % SIZE] = jump ? 1 : 0
    this.taken++
    if (this.count < SIZE) this.count++
    const first = this.taken - this.count
    while (this.marks.length > 0 && this.marks[0].sample < first) this.marks.shift()
  }

  /** The clock jumped to `ms`, or starts there. */
  jump(ms: number): void {
    this.push(ms, this.count > 0)
    this.acc = 0
  }

  /** An eclipse worth marking if the clock runs through its peak. */
  know(e: Eclipse): void {
    if (this.known.some((k) => Math.abs(k.peak - e.peak) < 60_000)) return
    this.known.push(e)
    if (this.known.length > KNOWN) this.known.shift()
  }

  /** The clock played for `dt` seconds and now reads `ms`. */
  record(dt: number, ms: number): void {
    this.acc += dt
    if (this.acc < STEP_S) return
    this.acc = Math.min(STEP_S, this.acc - STEP_S)
    this.push(ms, false)
  }

  /** Ends the tape exactly at `ms`, the moment on screen, before it is scrubbed. */
  seal(ms: number): void {
    if (this.count === 0 || this.ring[this.slot(this.count - 1)] !== ms) this.push(ms, false)
    this.acc = 0
  }

  /** The moment at a place on the tape, 0 the oldest and 1 the newest. Across a jump it is one side or the other. */
  at(p: number): number {
    if (this.count === 0) return NaN
    const f = clamp01(p) * (this.count - 1)
    const i = Math.floor(f)
    const a = this.ring[this.slot(i)]
    if (i >= this.count - 1) return a
    const b = this.ring[this.slot(i + 1)]
    if (this.jumps[this.slot(i + 1)]) return f - i < 0.5 ? a : b
    return a + (b - a) * (f - i)
  }

  /** Playing on from a place on the tape: what was watched after it is gone. */
  cut(p: number): void {
    if (this.count < 2) return
    const ms = this.at(p)
    const f = clamp01(p) * (this.count - 1)
    let i = Math.floor(f)
    if (i < this.count - 1 && this.jumps[this.slot(i + 1)] && f - i >= 0.5) i++
    this.taken -= this.count - (i + 1)
    this.count = i + 1
    const last = this.taken - 1
    while (this.marks.length > 0 && this.marks[this.marks.length - 1].sample > last) this.marks.pop()
    this.seal(ms)
  }
}
