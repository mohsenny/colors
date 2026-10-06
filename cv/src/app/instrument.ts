/*
 * The instrument: where in the life the clock is, which chapter that makes
 * current, where the camera looks, and the frame loop that draws the film
 * when one of those has changed. React only draws the chrome around it, from
 * snapshots; the clock in the dock is written straight into the page.
 *
 * Time is a position on the tape, 0 to 1, as the tape draws it: Growing up
 * squeezed into the first tenth, true scale from 2008 to today. Every chapter
 * has a stop on it where it starts, and Now is the end. The card, the lifted
 * sheet and the camera all follow the position, so a scrub moves through the
 * life the way the tape does, and letting go settles on the nearest stop.
 */

import { LIFE, yearsOf } from '../life'
import type { Chapter, Crossing, Life } from '../life'
import { aim, fit, length, place } from '../layout'
import type { Fit, Placed, Room } from '../layout'
import { Film } from '../render/life'
import type { Target } from '../render/life'

export interface Snapshot {
  /** The chapter the clock is in, by index, or null at Now. */
  chapter: number | null
  /** The crossing whose card is up, by index. */
  crossing: number | null
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
 * years, so each has its own place to settle. Leading QA and With AI both
 * start in 2024; the clock floors the year, so both still read 2024.
 */
export const TIE = 0.5

/** The glide to a stop, as `--lb-t-mode`. */
export const GLIDE_MS = 420

/** A sheet rising or settling, as `--lb-t-grow`. */
export const HOVER_MS = 180

/** Quiet after the last wheel event before the clock settles on a stop. */
export const SETTLE_MS = 160

/** Play holds each chapter this long, and a second more for each sentence past the first. */
export const HOLD_MS = 5000
export const HOLD_PER_SENTENCE_MS = 1000

/** Heights off the surface, in the shadow formula's terms: at rest, under the pointer, and the chapter being read. */
export const Z_REST = 0.2
export const Z_HOVER = 0.45
export const Z_CURRENT = 0.8

/** A line of wheel, px, for the mice that still count in lines. */
const WHEEL_LINE_PX = 16

/** A touch that travels less than this is a tap. */
const TAP_PX = 6

/** How far a flick carries the clock on after the finger leaves, in ms of its speed. */
const FLICK_MS = 220

/**
 * Where the dock's top edge is, up from the bottom of the stage: 18px up and
 * 38px tall, or 12px up under 620px.
 */
const DOCK_PX = 56
const DOCK_PX_SMALL = 50

/** The card's lower edge until it has been measured, near what the facts card comes to at 1440. */
const CARD_PX = 260

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

/** Full stops that end a sentence, not the ones in B.Sc. or .NET. */
export function sentences(text: string): number {
  return text.match(/[.!?](?=\s+[A-Z]|$)/g)?.length ?? 0
}

/** How long Play stays on a chapter. */
export function holdOf(chapter: Chapter): number {
  return HOLD_MS + HOLD_PER_SENTENCE_MS * Math.max(0, sentences(chapter.copy) - 1)
}

/** A crossing's place in the address: its two chapters' ids, so lowercase words like theirs and never `s=`. */
export function crossingId(crossing: Crossing): string {
  return `${crossing.a}-${crossing.b}`
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
}

interface Drag {
  id: number
  y: number
  at: number
  /** Tape per ms, smoothed over the last few moves. */
  speed: number
  moved: boolean
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
  private crossing: number | null = null
  private position = 1
  /** Where the camera looks, u along, before it is kept to the life's ends. */
  private camera: number
  private glide: Glide | null = null
  private scrubbing = false
  private settleTimer: ReturnType<typeof setTimeout> | undefined
  private playing = false
  private playTimer: ReturnType<typeof setTimeout> | undefined
  /** The pointer is on the card, and Play waits for it. */
  private held = false
  private paper = false
  private list = false
  private announce = ''
  private reduced: boolean
  private hovered: Target | null = null
  private readonly z: number[]

  private root: HTMLElement | null = null
  private film: Film | null = null
  private observer: ResizeObserver | null = null
  private raf = 0
  private last = 0
  private fitted: Fit | null = null
  private cardBottom = CARD_PX
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
    this.placed = place(this.life.chapters, this.life.crossings)
    this.len = length(this.placed)
    this.camera = this.len
    this.z = this.life.chapters.map(() => Z_REST)
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
      crossing: this.crossing,
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
    root.addEventListener('pointermove', this.onMove)
    root.addEventListener('pointerleave', this.onLeave)
    root.addEventListener('pointerdown', this.onDown)
    root.addEventListener('pointerup', this.onUp)
    root.addEventListener('pointercancel', this.onUp)
    root.addEventListener('click', this.onClick)
    root.addEventListener('wheel', this.onWheel, { passive: true })
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
      root.removeEventListener('pointermove', this.onMove)
      root.removeEventListener('pointerleave', this.onLeave)
      root.removeEventListener('pointerdown', this.onDown)
      root.removeEventListener('pointerup', this.onUp)
      root.removeEventListener('pointercancel', this.onUp)
      root.removeEventListener('click', this.onClick)
      root.removeEventListener('wheel', this.onWheel)
      root.style.cursor = ''
    }
    this.film?.destroy()
    this.film = null
    this.root = null
  }

  /** The card's lower edge as it is at Now, px from the top of the stage. The life is laid under it. */
  setCard(bottom: number): void {
    if (Math.abs(bottom - this.cardBottom) < 0.5) return
    this.cardBottom = bottom
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
      top: this.cardBottom,
      bottom: vp.height - (vp.width < 620 ? DOCK_PX_SMALL : DOCK_PX),
    }
    this.fitted = fit(room, this.len)
  }

  /** `#text` puts the paper out, a chapter's or a crossing's id goes to it; anything else is Now. */
  private readHash(): void {
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (id === 'text') {
      this.paper = true
      this.emit()
      return
    }
    const i = this.life.chapters.findIndex((c) => c.id === id)
    const x = this.life.crossings.findIndex((c) => crossingId(c) === id)
    if (i < 0 && x < 0) return
    // Arriving is not a move, so the life is simply there.
    const reduced = this.reduced
    this.reduced = true
    if (i >= 0) this.go(i)
    else this.goCrossing(x)
    this.reduced = reduced
  }

  /** The address says what is open, so Back and a shared link come back to it. Replaced, never pushed. */
  private writeHash(): void {
    if (!this.root) return
    const x = this.crossing === null ? null : this.life.crossings[this.crossing]
    const c = this.chapter === null ? null : this.life.chapters[this.chapter]
    const hash = this.paper ? '#text' : x ? `#${crossingId(x)}` : c ? `#${c.id}` : ''
    if (window.location.hash === hash) return
    history.replaceState(history.state, '', hash || window.location.pathname + window.location.search)
  }

  // ------------------------------------------------------------ loop

  private step(now: number): void {
    const dt = Math.min(100, now - this.last)
    this.last = now
    const g = this.glide
    if (g) {
      const t = (now - g.start) / GLIDE_MS
      const e = ease(t)
      this.position = g.from + (g.to - g.from) * e
      this.camera = g.camFrom + (g.camTo - g.camFrom) * e
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
      current: this.z.map((_, i) => this.isCurrent(i)),
      hovered: this.z.map((_, i) => this.isHovered(i)),
    })
  }

  private pair(crossing: number): [number, number] {
    const x = this.life.crossings[crossing]
    const a = this.life.chapters.findIndex((c) => c.id === x?.a)
    const b = this.life.chapters.findIndex((c) => c.id === x?.b)
    return [a, b]
  }

  private isCurrent(i: number): boolean {
    if (this.crossing !== null) return this.pair(this.crossing).includes(i)
    return this.chapter === i
  }

  private isHovered(i: number): boolean {
    const h = this.hovered
    if (!h) return false
    return h.kind === 'chapter' ? h.index === i : this.pair(h.index).includes(i)
  }

  private zTarget(i: number): number {
    return this.isCurrent(i) ? Z_CURRENT : this.isHovered(i) ? Z_HOVER : Z_REST
  }

  // ------------------------------------------------------------ moving

  /** Glides the clock and the camera to a stop, or cuts there. */
  private moveTo(position: number, camera: number): void {
    this.scrubbing = false
    clearTimeout(this.settleTimer)
    if (this.reduced || !this.root) {
      this.glide = null
      this.position = position
      this.camera = camera
      this.settled()
    } else {
      this.glide = { from: this.position, to: position, camFrom: this.camera, camTo: camera, start: performance.now() }
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
    if (this.crossing !== null) {
      const x = this.life.crossings[this.crossing]
      const [a, b] = this.pair(this.crossing).map((i) => this.life.chapters[i]?.name)
      return x ? `${x.name}: ${a} and ${b}` : ''
    }
    const c = this.chapter === null ? null : this.life.chapters[this.chapter]
    return c ? `${c.name}, ${yearsOf(c)}` : 'Now'
  }

  /** To a chapter. */
  go(index: number, fromPlay = false): void {
    if (!fromPlay) this.stopPlay()
    if (!this.life.chapters[index]) return
    this.chapter = index
    this.crossing = null
    this.moveTo(this.stops[index] as number, this.placed[index]?.along ?? 0)
  }

  /** To where two chapters cross: the later one's stop, the camera between the two. */
  goCrossing(index: number): void {
    this.stopPlay()
    const [a, b] = this.pair(index)
    if (a < 0 || b < 0) return
    const later = Math.max(a, b)
    this.chapter = later
    this.crossing = index
    const mid = ((this.placed[a]?.along ?? 0) + (this.placed[b]?.along ?? 0)) / 2
    this.moveTo(this.stops[later] as number, mid)
  }

  /** To the end of the tape, where the card is the facts. */
  now(fromPlay = false): void {
    if (!fromPlay) this.stopPlay()
    this.chapter = null
    this.crossing = null
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

  pick(target: Target): void {
    if (target.kind === 'chapter') this.go(target.index)
    else this.goCrossing(target.index)
  }

  /** The wheel, or a finger, moving the clock by `dy` px of film. */
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
    this.crossing = null
    this.camera = alongAt(this.position, this.stops, this.placed, this.len)
    clearTimeout(this.settleTimer)
    this.writeTape()
    this.emit()
  }

  /** The tape let go of: on to the nearest stop. */
  scrubEnd(): void {
    if (this.scrubbing) this.settle(this.position)
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
    // From the chapter being read, or from the start when there is nothing left to walk to.
    const last = this.life.chapters.length - 1
    const from = this.chapter === null || (this.chapter === last && this.crossing === null) ? 0 : this.chapter
    this.walk(from)
  }

  private walk(index: number): void {
    const c = this.life.chapters[index]
    if (!c) {
      this.now(true)
      this.playing = false
      this.emit()
      return
    }
    this.go(index, true)
    this.hold()
  }

  private hold(): void {
    clearTimeout(this.playTimer)
    const c = this.chapter === null ? null : this.life.chapters[this.chapter]
    if (!this.playing || this.held || !c) return
    const at = this.chapter as number
    this.playTimer = setTimeout(() => this.walk(at + 1), (this.reduced ? 0 : GLIDE_MS) + holdOf(c))
  }

  /** The pointer on the card holds Play where it is; leaving it starts the hold again. */
  holdPlay(on: boolean): void {
    if (on === this.held) return
    this.held = on
    if (on) clearTimeout(this.playTimer)
    else this.hold()
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
    else if (this.chapter !== null || this.crossing !== null || this.playing) this.now()
  }

  // ------------------------------------------------------------ hand

  /** Stage px from a pointer, or null when it is not on the life: on the card, the paper or any other chrome. */
  private onLife(e: PointerEvent | MouseEvent): { x: number; y: number } | null {
    const t = e.target as Element | null
    if (!t?.closest('.cv-film')) return null
    return { x: e.clientX - this.originX, y: e.clientY - this.originY }
  }

  private targetOf(e: PointerEvent | MouseEvent): Target | null {
    const tab = (e.target as Element | null)?.closest<HTMLElement>('.lb-tab')
    if (tab?.dataset.chapter) return { kind: 'chapter', index: Number(tab.dataset.chapter) }
    const p = this.onLife(e)
    return p && this.film ? this.film.targetAt(p.x, p.y) : null
  }

  private setHover(t: Target | null): void {
    const h = this.hovered
    if (t?.kind === h?.kind && t?.index === h?.index) return
    this.hovered = t
    if (this.root) this.root.style.cursor = t ? 'pointer' : ''
  }

  private onMove = (e: PointerEvent): void => {
    const d = this.drag
    if (d && d.id === e.pointerId) {
      const dy = e.clientY - d.y
      if (!d.moved && Math.abs(dy) < TAP_PX) return
      d.moved = true
      const now = performance.now()
      const perPx = this.fitted ? 1 / (this.len * this.fitted.u) : 1 / 1000
      // Finger up is forward in time: the life runs down the phone.
      this.scroll(-dy)
      clearTimeout(this.settleTimer)
      const speed = (-dy * perPx) / Math.max(1, now - d.at)
      d.speed = d.speed * 0.6 + speed * 0.4
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
    if (e.pointerType === 'mouse' || !this.onLife(e)) return
    this.drag = { id: e.pointerId, y: e.clientY, at: performance.now(), speed: 0, moved: false }
  }

  private onUp = (e: PointerEvent): void => {
    const d = this.drag
    if (!d || d.id !== e.pointerId) return
    this.drag = null
    if (!d.moved) return
    this.dragged = true
    // A finger that stopped before it lifted carries nothing on.
    const still = performance.now() - d.at > 80
    this.settle(this.position + (still ? 0 : d.speed * FLICK_MS))
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
    if (t) this.pick(t)
  }

  private onWheel = (e: WheelEvent): void => {
    // Pinch on a trackpad comes as a wheel with ctrl, and is the browser's.
    if (e.ctrlKey) return
    const k = e.deltaMode === 1 ? WHEEL_LINE_PX : e.deltaMode === 2 ? window.innerHeight : 1
    this.scroll((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k)
  }
}
