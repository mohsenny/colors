/*
 * The instrument: where in the life the clock is, which chapter that makes
 * current, where the camera looks, and the frame loop that draws the film
 * when one of those has changed. React only draws the chrome around it, from
 * snapshots; the clock in the dock is written straight into the page.
 *
 * Time is a position on the tape, 0 to 1, as the tape draws it: Growing up
 * squeezed into the first tenth, true scale from 2008 to today. Every chapter
 * has a stop on it where it starts, and Now is the end. The story, the lifted
 * sheet and the camera all follow the position, so a scrub moves through the
 * life the way the tape does, and letting go settles on the nearest stop.
 */

import { LIFE, MOVED, facts, yearsOf } from '../life'
import type { Chapter, Life } from '../life'
import { NARROW, PHONE_U_MIN, STEP, aim, fit, length, place } from '../layout'
import type { Fit, Placed, Room } from '../layout'
import { Film } from '../render/life'

export interface Snapshot {
  /** The chapter the clock is in, by index, or null at Now. */
  chapter: number | null
  /** What the clock says: a year, or for Growing up the place it began. */
  year: string
  playing: boolean
  /** The text CV is out. */
  paper: boolean
  /** The chapter list is open. */
  list: boolean
  announce: string
}

/** How much of the tape Growing up is squeezed into, before the break tick. */
export const SQUEEZE = 0.1

/**
 * Two chapters that start in the same year get stops this far apart, in
 * years, so each has its own place to settle. None do in this life; the
 * clock floors the year, so both would still read the same.
 */
export const TIE = 0.5

/** The glide to a stop, as `--lb-t-mode`. */
export const GLIDE_MS = 420

/**
 * Play's way back from Now to the start: the whole strip in one glide, the
 * lift and the story passing back through every chapter on the way. Three
 * glides long, about 210ms a chapter, which reads as going back along the
 * row rather than a jump, and is still under a breath.
 */
export const GLIDE_BACK_MS = 3 * GLIDE_MS

/** A sheet rising or settling, as `--lb-t-grow`. */
export const HOVER_MS = 180

/** Quiet after the last wheel event before the clock settles on a stop. */
export const SETTLE_MS = 160

/**
 * Play holds a face long enough to read it: a beat to arrive, then 220ms for
 * every word and every logo, a glance each. That is 270 words a minute, a
 * brisk read: Growing up comes to 9.5s, Leading QA to 13.7s and Now to 17s.
 */
export const HOLD_MS = 2500
export const HOLD_PER_WORD_MS = 220

/** Heights off the surface, in the shadow formula's terms: at rest, under the pointer, and the chapter being read. */
export const Z_REST = 0.2
export const Z_HOVER = 0.45
export const Z_CURRENT = 0.8

/** A line of wheel, px, for the mice that still count in lines. */
const WHEEL_LINE_PX = 16

/** A touch that travels less than this is a tap. */
const TAP_PX = 6

/** How far a flick carries the clock on after the finger leaves, in ms of its speed. Never past the next sheet. */
const FLICK_MS = 220

/**
 * Where the dock's top edge is, up from the bottom of the stage: 18px up and
 * 38px tall, or 12px up under 620px.
 */
const DOCK_PX = 56
const DOCK_PX_SMALL = 50

/** The story's lower edge until it has been measured, near what the tallest face comes to at 1440x900. */
const STORY_PX = 440

/** Below this the positions on the tape are the same place. */
const EPS = 1e-6

/** The year now, with the fraction of it gone. */
export function yearNow(date: Date = new Date()): number {
  const y = date.getUTCFullYear()
  const start = Date.UTC(y, 0, 1)
  return y + (date.getTime() - start) / (Date.UTC(y + 1, 0, 1) - start)
}

/** Where the true-scale tape begins: the first year a chapter starts at, 2008. */
export function scaleFrom(life: Life): number {
  for (const c of life.chapters) if (typeof c.from === 'number') return c.from
  return 0
}

/** A year's place on the tape. */
export function tapeOf(year: number, from: number, now: number): number {
  return SQUEEZE + ((1 - SQUEEZE) * (year - from)) / (now - from)
}

/** The year at a place on the tape, from 2008 on. */
export function yearOf(position: number, from: number, now: number): number {
  return from + ((position - SQUEEZE) * (now - from)) / (1 - SQUEEZE)
}

/** Each chapter's stop on the tape, where it starts. Growing up's is the start of the tape. */
export function stopsOf(life: Life, now: number): number[] {
  const from = scaleFrom(life)
  return life.chapters.map((c, i) => {
    if (typeof c.from !== 'number') return 0
    const start = c.from
    const ties = life.chapters.slice(0, i).filter((d) => d.from === start).length
    return tapeOf(start + TIE * ties, from, now)
  })
}

/** The chapter the clock is in: the last one started by that point, or null at Now. */
export function chapterAt(position: number, stops: readonly number[]): number | null {
  if (position >= 1 - EPS) return null
  let at = 0
  for (let i = 0; i < stops.length; i++) if ((stops[i] as number) <= position + EPS) at = i
  return at
}

/** The stop nearest a point on the tape: a chapter's index, or null for Now. */
export function nearest(position: number, stops: readonly number[]): number | null {
  let best: number | null = null
  let gap = Math.abs(1 - position)
  for (let i = 0; i < stops.length; i++) {
    const d = Math.abs((stops[i] as number) - position)
    if (d < gap) {
      gap = d
      best = i
    }
  }
  return best
}

/** What the clock says at a point on the tape. */
export function yearLabel(position: number, life: Life, now: number): string {
  if (position < SQUEEZE - EPS) return String(life.chapters[0]?.from ?? '')
  // Nudged up first, so a stop that lands on 2024 does not read 2023.99999.
  return String(Math.floor(yearOf(Math.min(1, position), scaleFrom(life), now) + EPS))
}

/** Words as a reader counts them: B.Sc. and .NET are one each. */
export function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

/** How long Play stays on a chapter: its headline, its copy and its logos. */
export function holdOf(chapter: Chapter): number {
  const glances = chapter.orgs.length + chapter.tools.length
  return HOLD_MS + HOLD_PER_WORD_MS * (words(`${chapter.headline} ${chapter.copy}`) + glances)
}

/** How long Play stays on Now: all the story says there but the ways to reach him, which are not read but used. */
export function holdOfNow(life: Life): number {
  const said = [life.name, life.intro, ...facts(life).filter((f) => f.label !== 'Reach').map((f) => f.value)]
  return HOLD_MS + HOLD_PER_WORD_MS * words([...said, life.outside, life.closing].join(' '))
}

/**
 * A point on the tape counted in chapters: 0 at the first stop, 1 at the
 * next, and the number of chapters at Now, straight between. A finger moves
 * the clock in these, so a sheet's step of it is one chapter whether the
 * years between are four or six, and Play's way back passes each chapter in
 * the same time.
 */
export function indexAt(position: number, stops: readonly number[]): number {
  const i = chapterAt(position, stops)
  if (i === null) return stops.length
  const from = stops[i] as number
  const to = stops[i + 1] ?? 1
  if (to - from < EPS) return i
  return i + Math.min(1, Math.max(0, (position - from) / (to - from)))
}

/** The point on the tape a count of chapters comes to, the other way. */
export function positionAt(index: number, stops: readonly number[]): number {
  const k = Math.min(stops.length, Math.max(0, index))
  const i = Math.min(stops.length - 1, Math.floor(k))
  const from = stops[i] ?? 0
  const to = stops[i + 1] ?? 1
  return from + (to - from) * (k - i)
}

/**
 * The camera's place along the life, u, for a point on the tape: each stop
 * is its chapter's sheet, Now the far end, and between them it runs straight,
 * so a scrub carries the camera with it.
 */
export function alongAt(position: number, stops: readonly number[], placed: readonly Placed[], len: number): number {
  let p0 = 0
  let a0 = placed[0]?.along ?? 0
  for (let i = 0; i <= stops.length; i++) {
    const p1 = i < stops.length ? (stops[i] as number) : 1
    const a1 = i < stops.length ? (placed[i]?.along ?? 0) : len
    if (position <= p1) return p1 - p0 < EPS ? a1 : a0 + ((a1 - a0) * (position - p0)) / (p1 - p0)
    p0 = p1
    a0 = a1
  }
  return len
}

/**
 * `--lb-ease`, cubic-bezier(0.4, 0, 0.2, 1), as a function of time. Newton's
 * method on x, which is monotonic for these handles, then y at the t found.
 */
export function ease(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const bx = (s: number): number => 3 * (1 - s) * (1 - s) * s * 0.4 + 3 * (1 - s) * s * s * 0.2 + s * s * s
  const by = (s: number): number => 3 * (1 - s) * s * s + s * s * s
  let s = t
  for (let i = 0; i < 8; i++) {
    const dx = (bx(s + 1e-4) - bx(s - 1e-4)) / 2e-4
    if (Math.abs(dx) < 1e-6) break
    s -= (bx(s) - t) / dx
    s = Math.min(1, Math.max(0, s))
  }
  return by(s)
}

interface Glide {
  from: number
  to: number
  camFrom: number
  camTo: number
  start: number
  ms: number
  /**
   * Play's way back: evenly through the chapters rather than the years, the
   * chapter, its lift and the story following the clock as in a scrub.
   */
  through: boolean
}

interface Drag {
  id: number
  x: number
  y: number
  /** Where the finger came down, and the count of chapters the clock stood at then. */
  x0: number
  y0: number
  from: number
  /** The axis the finger took first, held for the rest of the drag. */
  axis: 'x' | 'y' | null
  at: number
  /** Chapters per ms, smoothed over the last few moves. */
  speed: number
}

export interface InstrumentOptions {
  life?: Life
  /** The year now, fraction and all. Today unless a test says otherwise. */
  now?: number
  /** Cuts instead of glides. */
  reduced?: boolean
}

export class Instrument {
  private readonly life: Life
  private readonly year: number
  private readonly stops: number[]
  private readonly placed: Placed[]
  private readonly len: number
  private readonly listeners = new Set<() => void>()
  private snap: Snapshot
  private dirty = false

  private chapter: number | null = null
  private position = 1
  /** Where the camera looks, u along, before it is kept to the life's ends. */
  private camera: number
  private glide: Glide | null = null
  private scrubbing = false
  private settleTimer: ReturnType<typeof setTimeout> | undefined
  private playing = false
  private playTimer: ReturnType<typeof setTimeout> | undefined
  /** The pointer is on the story, and Play waits for it. */
  private held = false
  private paper = false
  private list = false
  private announce = ''
  private reduced: boolean
  private hovered: number | null = null
  private readonly z: number[]
  private readonly holdNow: number

  private root: HTMLElement | null = null
  private story: HTMLElement | null = null
  private film: Film | null = null
  private observer: ResizeObserver | null = null
  private raf = 0
  private last = 0
  private fitted: Fit | null = null
  private storyBottom = STORY_PX
  private clockEl: HTMLElement | null = null
  private tapeEl: HTMLElement | null = null
  private tapeInput: HTMLInputElement | null = null
  private tapeAt = ''
  private drag: Drag | null = null
  /** The press that just ended was a drag, so the click it makes is not a pick. */
  private dragged = false
  private originX = 0
  private originY = 0

  constructor(options: InstrumentOptions = {}) {
    this.life = options.life ?? LIFE
    this.year = options.now ?? yearNow()
    this.reduced = options.reduced ?? false
    this.stops = stopsOf(this.life, this.year)
    this.placed = place(this.life.chapters)
    this.len = length(this.placed)
    this.camera = this.len
    this.z = this.life.chapters.map(() => Z_REST)
    this.holdNow = holdOfNow(this.life)
    this.snap = this.makeSnapshot()
  }

  // ------------------------------------------------------------ store

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Snapshot => this.snap

  /**
   * A new snapshot when one of its fields has changed, and not otherwise: a
   * glide moves the clock every frame but the year only now and then, and the
   * clock writes itself.
   */
  private emit(): void {
    this.dirty = false
    const next = this.makeSnapshot()
    const last = this.snap as unknown as Record<string, unknown>
    if (Object.entries(next).every(([k, v]) => last[k] === v)) return
    this.snap = next
    for (const fn of this.listeners) fn()
  }

  private makeSnapshot(): Snapshot {
    return {
      chapter: this.chapter,
      year: yearLabel(this.position, this.life, this.year),
      playing: this.playing,
      paper: this.paper,
      list: this.list,
      announce: this.announce,
    }
  }

  attachClock(el: HTMLElement | null): void {
    this.clockEl = el
    this.writeClock()
  }

  private writeClock(): void {
    if (!this.clockEl) return
    const year = yearLabel(this.position, this.life, this.year)
    if (this.clockEl.textContent !== year) this.clockEl.textContent = year
  }

  /**
   * The tape's head, written as the clock is: every frame of a glide moves it,
   * and React only hears when the year or the chapter changes. The input's own
   * value goes with it, so a drag that starts on the head starts where it is.
   */
  attachTape(el: HTMLElement | null, input: HTMLInputElement | null): void {
    this.tapeEl = el
    this.tapeInput = input
    this.tapeAt = ''
    this.writeTape()
  }

  private writeTape(): void {
    if (!this.tapeEl) return
    const at = this.position.toFixed(4)
    if (at === this.tapeAt) return
    this.tapeAt = at
    this.tapeEl.style.setProperty('--lb-tl-pos', `${this.position * 100}%`)
    if (this.tapeInput) this.tapeInput.value = at
  }

  /** Where each chapter's stop is on the tape, for its marks. */
  stopsOnTape(): readonly number[] {
    return this.stops
  }

  // ------------------------------------------------------------ the page

  /** Lays the film on `root` and starts the loop. Until then every move is a cut, which is what a test wants. */
  attach(root: HTMLElement, reduced: boolean): void {
    this.root = root
    this.reduced = reduced
    this.film = new Film(root, this.life, this.placed, (i) => this.go(i))
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(root)
    this.resize()
    this.readHash()
    this.listen(root)
    root.addEventListener('pointerleave', this.onLeave)
    root.addEventListener('click', this.onClick)
    this.last = performance.now()
    const tick = (now: number): void => {
      this.raf = requestAnimationFrame(tick)
      this.step(now)
    }
    this.raf = requestAnimationFrame(tick)
  }

  detach(): void {
    cancelAnimationFrame(this.raf)
    clearTimeout(this.settleTimer)
    clearTimeout(this.playTimer)
    this.observer?.disconnect()
    const root = this.root
    if (root) {
      this.unlisten(root)
      root.removeEventListener('pointerleave', this.onLeave)
      root.removeEventListener('click', this.onClick)
      root.style.cursor = ''
    }
    this.attachStory(null)
    this.film?.destroy()
    this.film = null
    this.root = null
  }

  /** The wheel and a finger move the clock from the film and from the story both. */
  private listen(el: HTMLElement): void {
    el.addEventListener('pointermove', this.onMove)
    el.addEventListener('pointerdown', this.onDown)
    el.addEventListener('pointerup', this.onUp)
    el.addEventListener('pointercancel', this.onUp)
    el.addEventListener('wheel', this.onWheel, { passive: true })
  }

  private unlisten(el: HTMLElement): void {
    el.removeEventListener('pointermove', this.onMove)
    el.removeEventListener('pointerdown', this.onDown)
    el.removeEventListener('pointerup', this.onUp)
    el.removeEventListener('pointercancel', this.onUp)
    el.removeEventListener('wheel', this.onWheel)
  }

  /** The story over the film, so a scroll or a swipe on its words moves the clock as one on the sheets does. */
  attachStory(el: HTMLElement | null): void {
    if (el === this.story) return
    if (this.story) this.unlisten(this.story)
    this.story = el
    if (el) this.listen(el)
  }

  /** The story's lower edge at its tallest, px from the top of the stage. The life is laid under it. */
  setStory(bottom: number): void {
    if (Math.abs(bottom - this.storyBottom) < 0.5) return
    this.storyBottom = bottom
    this.resize()
  }

  setReduced(reduced: boolean): void {
    this.reduced = reduced
  }

  private resize(): void {
    const film = this.film
    const root = this.root
    if (!film || !root) return
    const vp = film.resize()
    const rect = root.getBoundingClientRect()
    this.originX = rect.left
    this.originY = rect.top
    const room: Room = {
      width: vp.width,
      height: vp.height,
      top: this.storyBottom,
      bottom: vp.height - (vp.width < NARROW ? DOCK_PX_SMALL : DOCK_PX),
    }
    this.fitted = fit(room, this.len)
  }

  /**
   * `#text` puts the paper out, and a chapter's id goes to it, or the id of
   * one the eight-sheet page had, to where it went. Anything else is Now.
   */
  private readHash(): void {
    const said = decodeURIComponent(window.location.hash.slice(1))
    if (said === 'text') {
      this.paper = true
      this.emit()
      return
    }
    const id = MOVED[said] ?? said
    const i = this.life.chapters.findIndex((c) => c.id === id)
    if (i < 0) return
    // Arriving is not a move, so the life is simply there.
    const reduced = this.reduced
    this.reduced = true
    this.go(i)
    this.reduced = reduced
  }

  /** The address says what is open, so Back and a shared link come back to it. Replaced, never pushed. */
  private writeHash(): void {
    if (!this.root) return
    const c = this.chapter === null ? null : this.life.chapters[this.chapter]
    const hash = this.paper ? '#text' : c ? `#${c.id}` : ''
    if (window.location.hash === hash) return
    history.replaceState(history.state, '', hash || window.location.pathname + window.location.search)
  }

  // ------------------------------------------------------------ loop

  private step(now: number): void {
    const dt = Math.min(100, now - this.last)
    this.last = now
    const g = this.glide
    if (g) {
      const t = (now - g.start) / g.ms
      const e = ease(t)
      if (g.through) {
        const from = indexAt(g.from, this.stops)
        this.position = positionAt(from + (indexAt(g.to, this.stops) - from) * e, this.stops)
        this.camera = alongAt(this.position, this.stops, this.placed, this.len)
        this.chapter = chapterAt(this.position, this.stops)
      } else {
        this.position = g.from + (g.to - g.from) * e
        this.camera = g.camFrom + (g.camTo - g.camFrom) * e
      }
      this.dirty = true
      if (t >= 1) {
        this.glide = null
        this.settled()
      }
    }

    // Each sheet eases to its height; three time constants in HOVER_MS is
    // within 5% when the beat ends, and the last of it is snapped.
    const k = 1 - Math.exp((-3 * dt) / HOVER_MS)
    for (let i = 0; i < this.z.length; i++) {
      const target = this.zTarget(i)
      const z = this.z[i] as number
      this.z[i] = Math.abs(target - z) < 0.004 ? target : z + (target - z) * k
    }

    this.draw()
    this.writeClock()
    this.writeTape()
    if (this.dirty) this.emit()
  }

  private draw(): void {
    const film = this.film
    const f = this.fitted
    if (!film || !f) return
    film.draw({
      fit: f,
      camera: aim(f, this.camera),
      z: this.z,
      // The lift follows the height, so a hovered sheet stands up part of
      // the way and the current one all of it, on the same beat.
      lift: this.z.map((z) => Math.max(0, (z - Z_REST) / (Z_CURRENT - Z_REST))),
      current: this.z.map((_, i) => this.chapter === i),
      hovered: this.z.map((_, i) => this.hovered === i),
    })
  }

  private zTarget(i: number): number {
    return this.chapter === i ? Z_CURRENT : this.hovered === i ? Z_HOVER : Z_REST
  }

  // ------------------------------------------------------------ moving

  /** Glides the clock and the camera to a stop, or cuts there. */
  private moveTo(position: number, camera: number, ms = GLIDE_MS, through = false): void {
    this.scrubbing = false
    clearTimeout(this.settleTimer)
    if (this.reduced || !this.root) {
      this.glide = null
      this.position = position
      this.camera = camera
      // A cut passes nothing on the way.
      if (through) this.chapter = chapterAt(position, this.stops)
      this.settled()
    } else {
      const start = performance.now()
      this.glide = { from: this.position, to: position, camFrom: this.camera, camTo: camera, start, ms, through }
    }
    this.emit()
  }

  /** Arrived. Said once, unless Play is walking through, and written into the address. */
  private settled(): void {
    if (!this.playing) this.announce = this.said()
    this.writeHash()
    this.dirty = true
  }

  private said(): string {
    const c = this.chapter === null ? null : this.life.chapters[this.chapter]
    return c ? `${c.name}, ${yearsOf(c)}` : 'Now'
  }

  /** To a chapter. */
  go(index: number, fromPlay = false): void {
    if (!fromPlay) this.stopPlay()
    if (!this.life.chapters[index]) return
    this.chapter = index
    this.moveTo(this.stops[index] as number, this.placed[index]?.along ?? 0)
  }

  /** To the end of the tape, where the story is who he is now. */
  now(fromPlay = false): void {
    if (!fromPlay) this.stopPlay()
    this.chapter = null
    this.moveTo(1, this.len)
  }

  /** The next chapter on, or back. On past the last is Now, and back from Now is the last. */
  stepBy(way: 1 | -1): void {
    this.stopPlay()
    const from = this.scrubbing ? nearest(this.position, this.stops) : this.chapter
    const n = this.life.chapters.length
    if (from === null) {
      if (way < 0) this.go(n - 1)
      else this.now()
      return
    }
    const next = from + way
    if (next >= n) this.now()
    else this.go(Math.max(0, next))
  }

  /** The wheel moving the clock by `dy` px of film, through the years as the tape runs. */
  scroll(dy: number): void {
    const perPx = this.fitted ? 1 / (this.len * this.fitted.u) : 1 / 1000
    this.scrubTo(this.position + dy * perPx)
    this.settleTimer = setTimeout(() => this.settle(this.position), SETTLE_MS)
  }

  /**
   * The clock to a point on the tape, held there until something lets go:
   * the wheel's quiet, a finger lifting, or the tape's own handle let go of
   * in `scrubEnd`.
   */
  scrubTo(position: number): void {
    this.stopPlay()
    this.glide = null
    this.scrubbing = true
    this.position = Math.min(1, Math.max(0, position))
    this.chapter = chapterAt(this.position, this.stops)
    this.camera = alongAt(this.position, this.stops, this.placed, this.len)
    clearTimeout(this.settleTimer)
    this.writeTape()
    this.emit()
  }

  /** The tape let go of: on to the nearest stop. */
  scrubEnd(): void {
    if (this.scrubbing) this.settle(this.position)
  }

  /**
   * A finger moving the clock `chapters` on from where it came down, held
   * there until it lifts. In chapters rather than years, so the strip keeps
   * under the finger, and never more than one either way: one swipe is one
   * chapter, however long.
   */
  private slide(from: number, chapters: number): void {
    const home = Math.round(from)
    this.scrubTo(positionAt(Math.min(home + 1, Math.max(home - 1, from + chapters)), this.stops))
  }

  /** Lets go of a scrub, carried on to `to`: the nearest stop to there. */
  private settle(to: number): void {
    const at = nearest(Math.min(1, Math.max(0, to)), this.stops)
    if (at === null) this.now()
    else this.go(at)
  }

  // ------------------------------------------------------------ play

  togglePlay(): void {
    if (this.playing) {
      this.stopPlay()
      this.emit()
      return
    }
    this.playing = true
    this.paper = false
    this.list = false
    // From the chapter being read, or from Now back to the start.
    if (this.chapter === null) this.back()
    else this.walk(this.chapter)
  }

  /** On to a chapter, or past the last one to Now, and held there. */
  private walk(index: number): void {
    if (this.life.chapters[index]) this.go(index, true)
    else this.now(true)
    this.hold(GLIDE_MS)
  }

  /** From Now back to the first chapter, the long way along the row, and held there. */
  private back(): void {
    this.moveTo(this.stops[0] as number, this.placed[0]?.along ?? 0, GLIDE_BACK_MS, true)
    this.hold(GLIDE_BACK_MS)
  }

  /** Waits out the glide there, then the chapter's hold or Now's, and moves on: after Now, back to the start. */
  private hold(glide: number): void {
    clearTimeout(this.playTimer)
    if (!this.playing || this.held) return
    // On the way back the chapter is still passing; Play is bound for the start.
    const g = this.glide
    const at = g?.through ? chapterAt(g.to, this.stops) : this.chapter
    const c = at === null ? null : this.life.chapters[at]
    const wait = (this.reduced ? 0 : glide) + (c ? holdOf(c) : this.holdNow)
    this.playTimer = setTimeout(() => (at === null ? this.back() : this.walk(at + 1)), wait)
  }

  /** The pointer on the story holds Play where it is; leaving it starts the hold again, without the glide. */
  holdPlay(on: boolean): void {
    if (on === this.held) return
    this.held = on
    if (on) clearTimeout(this.playTimer)
    else this.hold(0)
  }

  private stopPlay(): void {
    if (!this.playing) return
    this.playing = false
    clearTimeout(this.playTimer)
    this.dirty = true
  }

  /** Play stopped where it is, by a key that is not its own. */
  stop(): void {
    if (!this.playing) return
    this.stopPlay()
    this.emit()
  }

  // ------------------------------------------------------------ paper and list

  openPaper(): void {
    this.stopPlay()
    this.paper = true
    this.writeHash()
    this.emit()
  }

  closePaper(): void {
    if (!this.paper) return
    this.paper = false
    this.writeHash()
    this.emit()
  }

  togglePaper(): void {
    if (this.paper) this.closePaper()
    else this.openPaper()
  }

  openList(): void {
    this.stopPlay()
    this.list = true
    this.emit()
  }

  closeList(): void {
    if (!this.list) return
    this.list = false
    this.emit()
  }

  toggleList(): void {
    if (this.list) this.closeList()
    else this.openList()
  }

  /** Escape: the paper first, then the list, then back to Now. */
  escape(): void {
    if (this.paper) this.closePaper()
    else if (this.list) this.closeList()
    else if (this.chapter !== null || this.playing) this.now()
  }

  // ------------------------------------------------------------ hand

  /** Stage px from a pointer, or null when it is not on the film: on the story, the paper or any other chrome. */
  private onLife(e: PointerEvent | MouseEvent): { x: number; y: number } | null {
    const t = e.target as Element | null
    if (!t?.closest('.cv-film')) return null
    return { x: e.clientX - this.originX, y: e.clientY - this.originY }
  }

  private targetOf(e: PointerEvent | MouseEvent): number | null {
    const tab = (e.target as Element | null)?.closest<HTMLElement>('.lb-tab')
    if (tab?.dataset.chapter) return Number(tab.dataset.chapter)
    const p = this.onLife(e)
    return p && this.film ? this.film.targetAt(p.x, p.y) : null
  }

  private setHover(t: number | null): void {
    if (t === this.hovered) return
    this.hovered = t
    if (this.root) this.root.style.cursor = t === null ? '' : 'pointer'
  }

  private onMove = (e: PointerEvent): void => {
    const d = this.drag
    if (d && d.id === e.pointerId) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.axis) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < TAP_PX) return
        d.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      // Finger up or to the left is forward in time, and a sheet's step of
      // it is one chapter: the strip follows a sideways finger, and an
      // upward one turns the pages on at the same rate.
      const step = (this.fitted?.u ?? PHONE_U_MIN) * STEP
      const ahead = d.axis === 'x' ? d.x0 - e.clientX : d.y0 - e.clientY
      this.slide(d.from, ahead / step)
      const now = performance.now()
      const speed = (d.axis === 'x' ? -dx : -dy) / step / Math.max(1, now - d.at)
      d.speed = d.speed * 0.6 + speed * 0.4
      d.x = e.clientX
      d.y = e.clientY
      d.at = now
      return
    }
    if (e.pointerType === 'mouse') this.setHover(this.targetOf(e))
  }

  private onLeave = (): void => {
    this.setHover(null)
  }

  private onDown = (e: PointerEvent): void => {
    this.dragged = false
    if (e.pointerType === 'mouse') return
    const { clientX: x, clientY: y } = e
    const from = indexAt(this.position, this.stops)
    this.drag = { id: e.pointerId, x, y, x0: x, y0: y, from, axis: null, at: performance.now(), speed: 0 }
  }

  private onUp = (e: PointerEvent): void => {
    const d = this.drag
    if (!d || d.id !== e.pointerId) return
    this.drag = null
    if (!d.axis) return
    this.dragged = true
    // A finger that stopped before it lifted carries nothing on, and a flick
    // carries on to the next sheet the way it was going, never past it.
    const k = indexAt(this.position, this.stops)
    const still = performance.now() - d.at > 80
    const carried = Math.min(Math.ceil(k), Math.max(Math.floor(k), k + (still ? 0 : d.speed * FLICK_MS)))
    const to = Math.round(carried)
    if (to >= this.life.chapters.length) this.now()
    else this.go(to)
  }

  private onClick = (e: MouseEvent): void => {
    if (this.dragged) {
      this.dragged = false
      return
    }
    // Tabs are buttons and say so themselves.
    if ((e.target as Element | null)?.closest('.lb-tab')) return
    const p = this.onLife(e)
    if (!p || !this.film) return
    const t = this.film.targetAt(p.x, p.y)
    if (t !== null) this.go(t)
  }

  private onWheel = (e: WheelEvent): void => {
    // Pinch on a trackpad comes as a wheel with ctrl, and is the browser's.
    if (e.ctrlKey) return
    const k = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? window.innerHeight : 1
    this.scroll((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k)
  }
}
