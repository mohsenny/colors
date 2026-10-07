/*
 * The particles, on a fixed step, with the last fifteen seconds kept.
 *
 * Every frame is written to a ring buffer, which is where the trails come from
 * as well as the timeline: a trail is the particle's own past read back out of
 * history, so scrubbing restores trails for free and a held particle's trail
 * honestly shrinks into it.
 *
 * Nothing in a tick draws a random number. Same state in, same state out, so
 * resuming from a scrubbed frame continues exactly as it would have.
 */

import { landing, radiusOf, step } from '../physics/motion'
import type { Kind, Mover, Vec3 } from '../physics/motion'

export const DT = 1 / 60
export const HISTORY_FRAMES = 900
/** On screen at once. A ninth retires the oldest. */
export const MAX_LIVE = 8
/** Slots, so retiring particles can finish fading while new ones arrive. */
const SLOTS = 12
/** Seconds to fade out after hitting something, leaving or being retired. */
const FADE_S = 0.6
/** Past this the particle has left the room. */
export const ESCAPE_R = 12

const F_ALIVE = 0
const F_ID = 1
const F_KIND = 2
const F_X = 3
const F_V = 6
const F_E = 9
const F_HUE = 10
const F_HELD = 11
const F_FADE = 12
const FIELDS = 13
const FRAME = SLOTS * FIELDS

export interface Particle extends Mover {
  id: number
  hue: number
  held: boolean
  /** 0 alive, rising to 1 as it fades out. */
  fade: number
}

/** Something reaching the surface or the horizon, kept as long as the history. */
export interface Impact {
  /** Where it struck, as a unit vector from the centre. */
  at: Vec3
  kind: Kind
  hue: number
  /** The tick it struck on. */
  tick: number
}

export interface WorldField {
  rs: number
  /** Surface or horizon, room units. */
  radius: number
  /** Simulated units per second of viewer time. */
  rate: number
}

export class World {
  slots: Array<Particle | null> = new Array<Particle | null>(SLOTS).fill(null)
  private nextId = 1
  private nextHue = 0

  /** The hue the next add() deals. */
  get upcoming(): number {
    return this.nextHue
  }

  private ring = new Float64Array(HISTORY_FRAMES * FRAME)
  /** Ring index of the newest frame. */
  private head = -1
  /** Frames recorded, up to HISTORY_FRAMES. */
  count = 0
  /** Ticks since the room was dealt, less any rewound: the newest frame's number. */
  ticks = 0
  impacts: Impact[] = []

  add(m: Mover): Particle {
    const live = this.slots.filter((p): p is Particle => p !== null && p.fade === 0)
    if (live.length >= MAX_LIVE) {
      const oldest = live.reduce((a, b) => (a.id < b.id ? a : b))
      oldest.fade = 1e-6
      oldest.held = false
    }
    let i = this.slots.findIndex((p) => p === null)
    if (i < 0) {
      // Every slot is busy fading: take the one furthest gone.
      i = this.slots.reduce((best, p, j) => ((p?.fade ?? 0) > (this.slots[best]?.fade ?? 0) ? j : best), 0)
    }
    const p: Particle = { ...m, id: this.nextId++, hue: this.nextHue, held: false, fade: 0 }
    this.nextHue = (this.nextHue + 1) % 8
    this.slots[i] = p
    return p
  }

  clear(): void {
    this.slots.fill(null)
    this.count = 0
    this.head = -1
    this.ticks = 0
    this.impacts = []
  }

  tick(field: WorldField): void {
    const dt = DT * field.rate
    this.ticks++
    if (this.impacts.length > 0 && this.ticks - this.impacts[0].tick >= HISTORY_FRAMES) this.impacts.shift()
    for (let i = 0; i < SLOTS; i++) {
      const p = this.slots[i]
      if (!p) continue
      if (p.fade > 0) {
        p.fade += DT / FADE_S
        if (p.fade >= 1) this.slots[i] = null
        continue
      }
      if (p.held) continue
      const from: Vec3 = [p.pos[0], p.pos[1], p.pos[2]]
      const ok = step(p, field.rs, dt)
      const r = radiusOf(p)
      if (!ok || r <= field.radius) {
        p.fade = 1e-6
        this.impacts.push({ at: landing(from, p.pos, field.radius), kind: p.kind, hue: p.hue, tick: this.ticks })
      } else if (r > ESCAPE_R) p.fade = 1e-6
    }
    this.record()
  }

  private record(): void {
    this.head = (this.head + 1) % HISTORY_FRAMES
    this.count = Math.min(HISTORY_FRAMES, this.count + 1)
    const base = this.head * FRAME
    for (let i = 0; i < SLOTS; i++) {
      const o = base + i * FIELDS
      const p = this.slots[i]
      if (!p) {
        this.ring[o + F_ALIVE] = 0
        continue
      }
      this.ring[o + F_ALIVE] = 1
      this.ring[o + F_ID] = p.id
      this.ring[o + F_KIND] = p.kind === 'light' ? 1 : 0
      this.ring[o + F_X] = p.pos[0]
      this.ring[o + F_X + 1] = p.pos[1]
      this.ring[o + F_X + 2] = p.pos[2]
      this.ring[o + F_V] = p.vel[0]
      this.ring[o + F_V + 1] = p.vel[1]
      this.ring[o + F_V + 2] = p.vel[2]
      this.ring[o + F_E] = p.energy
      this.ring[o + F_HUE] = p.hue
      this.ring[o + F_HELD] = p.held ? 1 : 0
      this.ring[o + F_FADE] = p.fade
    }
  }

  /** Ring index of the frame `back` frames before the newest. */
  private index(back: number): number {
    return (((this.head - back) % HISTORY_FRAMES) + HISTORY_FRAMES) % HISTORY_FRAMES
  }

  /** The particles as they were `back` frames ago. Used to draw while scrubbing. */
  frameAt(back: number): Particle[] {
    const out: Particle[] = []
    if (this.count === 0) return out
    const base = this.index(back) * FRAME
    for (let i = 0; i < SLOTS; i++) {
      const o = base + i * FIELDS
      if (this.ring[o + F_ALIVE] === 0) continue
      out.push(this.read(o))
    }
    return out
  }

  private read(o: number): Particle {
    const r = this.ring
    return {
      id: r[o + F_ID],
      kind: (r[o + F_KIND] === 1 ? 'light' : 'probe') as Kind,
      pos: [r[o + F_X], r[o + F_X + 1], r[o + F_X + 2]],
      vel: [r[o + F_V], r[o + F_V + 1], r[o + F_V + 2]],
      energy: r[o + F_E],
      hue: r[o + F_HUE],
      held: r[o + F_HELD] === 1,
      fade: r[o + F_FADE],
    }
  }

  /**
   * A trail: positions of particle `id` going back from `back`, every `stride`
   * frames, newest first, until the particle did not exist yet.
   */
  trail(id: number, back: number, stride: number, max: number): Vec3[] {
    const out: Vec3[] = []
    for (let k = 0; k < max; k++) {
      const b = back + k * stride
      if (b >= this.count) break
      const base = this.index(b) * FRAME
      let found = false
      for (let i = 0; i < SLOTS; i++) {
        const o = base + i * FIELDS
        if (this.ring[o + F_ALIVE] === 1 && this.ring[o + F_ID] === id) {
          out.push([this.ring[o + F_X], this.ring[o + F_X + 1], this.ring[o + F_X + 2]])
          found = true
          break
        }
      }
      if (!found) break
    }
    return out
  }

  /**
   * Continue from `back` frames ago. Everything newer is dropped: resuming from
   * a scrubbed moment is a branch, and the old future is no longer true.
   */
  rewind(back: number): void {
    if (back <= 0 || this.count === 0) return
    back = Math.min(back, this.count - 1)
    const base = this.index(back) * FRAME
    for (let i = 0; i < SLOTS; i++) {
      const o = base + i * FIELDS
      if (this.ring[o + F_ALIVE] === 0) {
        this.slots[i] = null
        continue
      }
      const p = this.read(o)
      // Hold is the user's choice, not the simulation's, so a rewind keeps the
      // particle's current hold rather than restoring an old one.
      const now = this.slots[i]
      if (now && now.id === p.id) p.held = now.held
      this.slots[i] = p
    }
    this.head = this.index(back)
    this.count -= back
    this.ticks -= back
    this.impacts = this.impacts.filter((s) => s.tick <= this.ticks)
  }
}
