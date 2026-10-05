/*
 * The instrument: the clock, where you sit and what you look at, the hand on
 * the sky, and the frame loop. React only draws the chrome around it, from
 * snapshots handed out a few times a second; the clock in the dock and the
 * names in the sky are written straight into the page every frame.
 */

import { AU_KM, BODIES, LIGHT_KM_S, RINGS, bodyById } from '../sky/bodies'
import type { Body, BodyId } from '../sky/bodies'
import { nextEclipse } from '../sky/eclipses'
import type { Eclipse } from '../sky/eclipses'
import { TIME_MAX, TIME_MIN, orbitOf, posesAt } from '../sky/ephemeris'
import type { Poses, Vec3 } from '../sky/ephemeris'
import { unpackStars } from '../sky/stars'
import {
  FOV,
  FOV_MIN,
  GLOBE,
  RISE_MAX,
  ZG_MIN,
  Z_MIN,
  NORTH,
  across,
  add,
  dot,
  frameOf,
  globeEye,
  len,
  norm,
  project,
  scale,
  seatEye,
  slerp,
  sub,
  unproject,
  zMax,
  zgMax,
} from '../render/camera'
import type { Eye, Frame } from '../render/camera'
import { ORBIT_UNIT, Renderer } from '../render/gl'
import type { BodyDraw, OrbitDraw, Shade } from '../render/gl'
import { EARTH_CLOUDS, EARTH_NIGHT, SATURN_RING, STARS, SURFACE } from '../render/maps'
import { Tape } from './tape'
import { clampRung, clockLabel, dayLabel, rateName, rateOf } from './time'

export interface Snapshot {
  playing: boolean
  rung: number
  rate: string
  reverse: boolean
  /** True when the clock shows the present at real speed. */
  live: boolean
  seat: Body
  look: Body
  readout: Array<[string, string]>
  solar: Eclipse | null
  lunar: Eclipse | null
  announce: string
  /** Where the clock is on the tape, 1 its newest moment. */
  position: number
  /** How much of the tape has been watched, 0 to 1. */
  filled: number
  /** The eclipse peaks the tape ran through, as places on it. */
  marks: number[]
  /** Paused or scrubbing: the tape opens out. */
  expanded: boolean
  /** The moment on the clock, in words. */
  moment: string
}

const SHADES: Record<BodyId, Shade> = {
  sun: 'sun',
  mercury: 'rock',
  venus: 'gas',
  earth: 'earth',
  moon: 'moon',
  mars: 'rock',
  jupiter: 'gas',
  saturn: 'gas',
  uranus: 'gas',
  neptune: 'gas',
}

const YEAR_MS = 365.2425 * 86_400_000

/** Points a lap. */
const LAP = 361
/** Snapshots a second, at most. */
const SNAP_MS = 125
const CLICK_PX = 5
/** How near a dot a click still counts as on it. */
const PICK_PX = 14
/** Whose name stays when two would run into each other, after the one you are looking at. */
const BY_SIZE: BodyId[] = [...BODIES].sort((a, b) => b.radius - a.radius).map((b) => b.id)

interface Flight {
  from: Eye
  /** Where the eye started, from the old seat's centre, so the start moves with it. */
  fromSeat: BodyId
  rel: Vec3
  start: number
  ms: number
}

interface Orbit {
  id: BodyId
  centre: number
  points: Float64Array
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function smoother(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x * x * x * (x * (x * 6 - 15) + 10)
}

/** Share of a disc covered by another, both given by angular radius and separation. */
export function covered(rs: number, ro: number, sep: number): number {
  if (sep >= rs + ro) return 0
  if (sep <= ro - rs) return 1
  if (sep <= rs - ro) return (ro * ro) / (rs * rs)
  const d = sep
  const a1 = rs * rs * Math.acos(Math.max(-1, Math.min(1, (d * d + rs * rs - ro * ro) / (2 * d * rs))))
  const a2 = ro * ro * Math.acos(Math.max(-1, Math.min(1, (d * d + ro * ro - rs * rs) / (2 * d * ro))))
  const a3 = 0.5 * Math.sqrt(Math.max(0, (-d + rs + ro) * (d + rs - ro) * (d - rs + ro) * (d + rs + ro)))
  return Math.max(0, Math.min(1, (a1 + a2 - a3) / (Math.PI * rs * rs)))
}

function angle(a: Vec3, b: Vec3): number {
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  return Math.atan2(Math.hypot(c[0], c[1], c[2]), dot(a, b))
}

/** "384,400 km", or AU once that reads better. */
export function distanceLabel(km: number): string {
  if (km >= 0.05 * AU_KM) return `${(km / AU_KM).toFixed(km >= 10 * AU_KM ? 1 : 3)} AU`
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`
  return `${Math.round(km).toLocaleString('en-US')} km`
}

export function lightLabel(km: number): string {
  const s = km / LIGHT_KM_S
  if (s < 59.95) return `${s.toFixed(s < 10 ? 2 : 1)} s`
  const whole = Math.round(s)
  if (whole < 3600) return `${Math.floor(whole / 60)} min ${whole % 60} s`
  const m = Math.round(s / 60)
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** Apparent diameter: degrees, arcminutes or arcseconds, whichever has a whole number in front. */
export function sizeLabel(rad: number): string {
  const deg = (rad * 180) / Math.PI
  if (deg >= 1) return `${deg.toFixed(2)}°`
  const min = deg * 60
  if (min >= 1) return `${min.toFixed(1)}′`
  return `${(min * 60).toFixed(1)}″`
}

export class Instrument {
  private canvas: HTMLCanvasElement
  private labels: HTMLElement
  private renderer: Renderer
  private raf = 0
  private last = 0
  private listeners = new Set<() => void>()
  private snap: Snapshot
  private snapAt = 0
  private dirty = true

  private ms = Date.now()
  private rung = 0
  private playing = true
  private seat: BodyId = 'earth'
  private look: BodyId = 'moon'
  private z = 0
  /** How far round the seat the eye has been swung from the target, along and up the sky, radians. */
  private swing = 0
  private rise = 0
  private zg = 0
  private yaw = 0
  private pitch = 0.3
  private flight: Flight | null = null
  private poses: Poses
  private eye: Eye
  private frame: Frame | null = null
  private width = 1
  private height = 1
  private orbits: Orbit[] = []
  private moonOrbit: Orbit | null = null
  private moonOrbitAt = 0
  private labelEls = new Map<BodyId, HTMLSpanElement>()
  private labelWidths = new Map<BodyId, number>()
  private placed = new Map<BodyId, { dir: Vec3; ang: number; d: number; x: number; y: number; r: number; shown: boolean }>()
  private clockEls: { day: HTMLElement; time: HTMLElement } | null = null
  private eclipses: { solar: Eclipse | null; lunar: Eclipse | null; from: number; at: number } = {
    solar: null,
    lunar: null,
    from: NaN,
    at: 0,
  }
  private drag: { x: number; y: number; id: number; moved: boolean } | null = null
  private tape = new Tape()
  /** Where on the tape the clock is, 1 its newest moment. Below 1 only while paused or scrubbing. */
  private back = 1
  private scrubbing = false
  private resumeAfterScrub = false
  private announce = ''
  private observer: ResizeObserver

  constructor(canvas: HTMLCanvasElement, labels: HTMLElement) {
    this.canvas = canvas
    this.labels = labels
    this.renderer = new Renderer(canvas)
    this.poses = posesAt(this.ms)
    this.tape.jump(this.ms)
    this.z = this.zoomFor(this.seat, this.look)
    this.eye = this.restingEye()
    for (const b of BODIES) {
      const el = document.createElement('span')
      el.className = 'sl-label'
      el.textContent = b.name
      el.dataset.body = b.id
      labels.appendChild(el)
      this.labelEls.set(b.id, el)
    }
    for (const b of BODIES) {
      if (b.id === 'sun' || b.id === 'moon') continue
      this.orbits.push({ id: b.id, centre: this.ms, points: orbitOf(b.id, this.ms, LAP) })
    }
    this.snap = this.makeSnapshot()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()
    this.loadMaps()
  }

  private loadMaps(): void {
    for (const b of BODIES) void this.renderer.load(b.id, SURFACE[b.id], false, b.color).catch(() => undefined)
    void this.renderer.load('night', EARTH_NIGHT).catch(() => undefined)
    void this.renderer.load('clouds', EARTH_CLOUDS, true).catch(() => undefined)
    void this.renderer.load('rings', SATURN_RING).catch(() => undefined)
    fetch(STARS)
      .then((r) => r.arrayBuffer())
      .then((buf) => this.renderer.setStars(unpackStars(buf)))
      .catch(() => undefined)
  }

  // ------------------------------------------------------------ store

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Snapshot => this.snap

  private emit(force = false): void {
    const now = performance.now()
    if (!force && !this.dirty && now - this.snapAt < SNAP_MS) return
    this.snapAt = now
    this.dirty = false
    this.snap = this.makeSnapshot()
    for (const fn of this.listeners) fn()
  }

  private touch(announce?: string): void {
    if (announce) this.announce = announce
    this.dirty = true
  }

  attachClock(day: HTMLElement | null, time: HTMLElement | null): void {
    this.clockEls = day && time ? { day, time } : null
    this.writeClock()
  }

  // ------------------------------------------------------------ loop

  start(): void {
    this.attachPointer()
    this.last = performance.now()
    const tick = (now: number): void => {
      this.raf = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - this.last) / 1000)
      this.last = now
      this.step(dt, now)
    }
    this.raf = requestAnimationFrame(tick)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    this.observer.disconnect()
    this.detachPointer()
    this.labels.replaceChildren()
  }

  private resize(): void {
    const rect = this.canvas.getBoundingClientRect()
    this.width = Math.max(1, rect.width)
    this.height = Math.max(1, rect.height)
    this.renderer.resize(this.width, this.height, Math.min(2, window.devicePixelRatio || 1))
  }

  private step(dt: number, now: number): void {
    if (this.playing) {
      const next = this.ms + dt * 1000 * rateOf(this.rung)
      if (next <= TIME_MIN || next >= TIME_MAX) {
        this.ms = Math.max(TIME_MIN, Math.min(TIME_MAX, next))
        this.playing = false
        this.touch('The clock has reached the end of its range')
      } else this.ms = next
      this.tape.record(dt, this.ms)
    }
    this.poses = posesAt(this.ms)
    this.refreshOrbits(now)
    this.eye = this.flownEye(now)
    this.frame = frameOf(this.eye, this.width / this.height)
    this.renderer.draw({
      eye: this.eye,
      bodies: this.bodyDraws(),
      ...this.sunCover(),
      orbits: this.orbitDraws(),
      clock: now / 1000,
    })
    this.placeLabels()
    this.writeClock()
    this.emit()
  }

  private writeClock(): void {
    if (!this.clockEls) return
    const day = dayLabel(this.ms)
    const time = clockLabel(this.ms)
    if (this.clockEls.day.textContent !== day) this.clockEls.day.textContent = day
    if (this.clockEls.time.textContent !== time) this.clockEls.time.textContent = time
  }

  // ------------------------------------------------------------ eye

  private at(id: BodyId): Vec3 {
    return this.poses[id].at
  }

  private radius(id: BodyId): number {
    return (bodyById(id) as Body).radius
  }

  private restingEye(): Eye {
    if (this.seat === this.look) return globeEye(this.at(this.seat), this.radius(this.seat), this.zg, this.yaw, this.pitch)
    const air = (bodyById(this.seat) as Body).air?.depth ?? 0
    return seatEye(this.at(this.seat), this.radius(this.seat), this.at(this.look), this.z, this.swing, this.rise, air)
  }

  private flownEye(now: number): Eye {
    const to = this.restingEye()
    const f = this.flight
    if (!f) return to
    const t = (now - f.start) / f.ms
    if (t >= 1) {
      this.flight = null
      return to
    }
    const p = smoother(t)
    const seat = this.at(this.seat)
    let at: Vec3
    let fov = Math.exp(Math.log(f.from.fov) + (Math.log(to.fov) - Math.log(f.from.fov)) * p)
    let turn = p
    if (f.fromSeat === this.seat) {
      // Round the seat, never through it.
      const r0 = f.rel
      const r1 = sub(to.at, seat)
      const reach = Math.exp(Math.log(len(r0)) + (Math.log(len(r1)) - Math.log(len(r0))) * p)
      at = add(seat, scale(slerp(norm(r0), norm(r1), p), reach))
    } else {
      // Up out of the plane and over, wide, facing the way you go until the
      // last part, where you turn to what you will be looking at.
      const from = add(this.at(f.fromSeat), f.rel)
      const way = sub(to.at, from)
      const lift = across(NORTH, norm(way), [1, 0, 0])
      const arc = Math.sin(Math.PI * p)
      at = add(add(from, scale(way, p)), scale(lift, 0.3 * len(way) * arc))
      fov = Math.exp(Math.log(fov) + (Math.log(FOV) - Math.log(fov)) * arc * 0.85)
      turn = smoother((t - 0.3) / 0.7)
    }
    const forward = slerp(f.from.forward, to.forward, turn)
    const up = slerp(f.from.up, to.up, turn)
    return { at, forward, up, fov }
  }

  private fly(ms: number): void {
    this.flight = {
      from: this.eye,
      fromSeat: this.seat,
      rel: sub(this.eye.at, this.at(this.seat)),
      start: performance.now(),
      ms,
    }
  }

  /** A lens that shows the target an eighth of the frame across, as far as the lens goes. */
  private zoomFor(seat: BodyId, look: BodyId): number {
    if (seat === look) return 0
    const d = len(sub(this.at(look), this.at(seat)))
    const across = 2 * Math.asin(Math.min(1, this.radius(look) / d))
    const fov = Math.max(FOV_MIN, Math.min(FOV, across * 8))
    return Math.log(fov / FOV)
  }

  /** Turn to look at a body from where you sit. Looking at the seat itself circles it. */
  lookAt(id: BodyId): void {
    if (id === this.look) {
      // Looking at it again, after swinging away, brings it back to the middle.
      if (id !== this.seat && (this.swing !== 0 || this.rise !== 0)) {
        this.fly(700)
        this.swing = 0
        this.rise = 0
      }
      return
    }
    this.fly(900)
    this.look = id
    if (id === this.seat) this.enterGlobe()
    else {
      this.z = this.zoomFor(this.seat, id)
      this.swing = 0
      this.rise = 0
    }
    this.touch(`Looking at ${(bodyById(id) as Body).name}`)
    this.emit(true)
  }

  /** Become a body: sit on it, keep looking at what you were looking at if you can. */
  become(id: BodyId): void {
    if (id === this.seat) {
      if (this.look !== id) this.lookAt(id)
      return
    }
    const old = this.seat
    const dist = len(sub(this.at(id), this.at(old)))
    this.fly(1300 + 260 * Math.max(0, Math.log10(dist / 1e5)))
    this.seat = id
    if (this.look === id) this.look = old
    if (this.look === this.seat) this.enterGlobe()
    else {
      this.z = this.zoomFor(id, this.look)
      this.swing = 0
      this.rise = 0
    }
    this.touch(`On ${(bodyById(id) as Body).name}, looking at ${(bodyById(this.look) as Body).name}`)
    this.emit(true)
  }

  /** Back to the globe of the body you are on. */
  lookHome(): void {
    this.lookAt(this.seat)
  }

  private enterGlobe(): void {
    const sun = norm(sub(this.at('sun'), this.at(this.seat)))
    this.yaw = Math.atan2(sun[1], sun[0]) + 0.75
    this.pitch = 0.32
    this.zg = this.seat === 'sun' ? 0.6 : 0
  }

  // ------------------------------------------------------------ time

  /** Leaving a scrubbed moment for a new future: what the tape held after it is gone. */
  private branch(): void {
    if (this.back < 1) this.tape.cut(this.back)
    this.back = 1
  }

  private play(): void {
    if (this.scrubbing) {
      this.resumeAfterScrub = true
      return
    }
    this.branch()
    this.playing = true
  }

  togglePlay(): void {
    if (this.playing) this.playing = false
    else this.play()
    this.touch(this.playing ? 'Playing' : 'Paused')
    this.emit(true)
  }

  setRung(rung: number): void {
    const r = clampRung(rung)
    if (r === this.rung) return
    this.rung = r
    this.play()
    this.touch(`${rateName(r)}${r < 0 ? ', backward' : ''}`)
    this.emit(true)
  }

  faster(): void {
    this.setRung(this.rung + 1)
  }

  slower(): void {
    this.setRung(this.rung - 1)
  }

  now(): void {
    this.branch()
    this.ms = Date.now()
    this.tape.jump(this.ms)
    this.rung = 0
    this.playing = true
    this.touch('Now, at real speed')
    this.emit(true)
  }

  /** Arrive a little before an eclipse, placed to watch it happen. */
  watch(e: Eclipse): void {
    const solar = e.type === 'solar'
    this.branch()
    this.ms = e.peak - (solar ? 90 : 120) * 60_000
    this.tape.jump(this.ms)
    this.tape.know(e.peak)
    this.rung = 2
    this.playing = true
    this.poses = posesAt(this.ms)
    this.fly(1600)
    this.seat = solar ? 'moon' : 'earth'
    this.look = solar ? 'earth' : 'moon'
    this.swing = 0
    this.rise = 0
    // Close enough on the target to see the shadow cross it.
    const d = len(sub(this.at(this.look), this.at(this.seat)))
    const across = 2 * Math.asin(this.radius(this.look) / d)
    this.z = Math.log(Math.max(FOV_MIN, Math.min(FOV, across * (solar ? 2.2 : 3.2))) / FOV)
    this.eclipses.from = NaN
    this.touch(`${e.kind} ${e.type} eclipse, ${dayLabel(e.peak)}`)
    this.emit(true)
  }

  /** Taking hold of the tape: the clock stops while a moment is found. */
  scrubStart(): void {
    if (this.scrubbing) return
    if (this.back === 1) this.tape.seal(this.ms)
    this.scrubbing = true
    this.resumeAfterScrub = this.playing
    this.playing = false
    this.emit(true)
  }

  scrub(position: number): void {
    if (!this.scrubbing) return
    this.back = Math.max(0, Math.min(1, position))
    this.ms = this.tape.at(this.back)
    this.dirty = true
  }

  /** Letting go: if it was playing it plays on from there. */
  scrubEnd(): void {
    if (!this.scrubbing) return
    this.scrubbing = false
    if (this.resumeAfterScrub) this.play()
    this.resumeAfterScrub = false
    this.emit(true)
  }

  // ------------------------------------------------------------ hand

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0) return
    this.canvas.setPointerCapture(e.pointerId)
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false }
    this.canvas.classList.add('is-dragging')
  }

  private onMove = (e: PointerEvent): void => {
    const d = this.drag
    if (!d || d.id !== e.pointerId) {
      this.hover(e.clientX, e.clientY)
      return
    }
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (!d.moved && Math.hypot(dx, dy) < CLICK_PX) return
    d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    if (this.seat === this.look) {
      // Grabbing the globe, slower near the ground so it keeps up with the hand.
      const k = 0.005 * Math.min(1, (GLOBE * Math.exp(this.zg) - 1) / (GLOBE - 1))
      this.yaw -= dx * k
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + dy * k))
    } else {
      // Grabbing the sky: the eye swings round the seat, which stays under
      // you, and the sky moves with the hand. Wide, a drag across the screen
      // turns you more than half way round; through a telescope the sky moves
      // at most ten times as fast as the hand, so it can still be aimed.
      const k = Math.min(0.003, (20 * Math.tan(this.eye.fov / 2)) / this.height)
      const lat0 = Math.asin(norm(sub(this.at(this.look), this.at(this.seat)))[2])
      this.swing += dx * k
      this.rise = Math.max(-RISE_MAX - lat0, Math.min(RISE_MAX - lat0, this.rise + dy * k))
    }
  }

  private onUp = (e: PointerEvent): void => {
    const d = this.drag
    if (!d || d.id !== e.pointerId) return
    this.drag = null
    this.canvas.classList.remove('is-dragging')
    if (!d.moved) {
      const hit = this.pick(e.clientX, e.clientY)
      if (hit) this.lookAt(hit)
    }
  }

  private onDouble = (e: MouseEvent): void => {
    const hit = this.pick(e.clientX, e.clientY)
    if (hit) this.become(hit)
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const k = e.deltaMode === 1 ? 0.06 : 0.002
    const step = e.deltaY * k
    const r = this.radius(this.seat)
    if (this.seat === this.look) this.zg = Math.max(ZG_MIN, Math.min(zgMax(r), this.zg + step))
    else this.z = Math.max(Z_MIN, Math.min(zMax(r), this.z + step))
  }

  private attachPointer(): void {
    const c = this.canvas
    c.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    c.addEventListener('dblclick', this.onDouble)
    c.addEventListener('wheel', this.onWheel, { passive: false })
  }

  private detachPointer(): void {
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    c.removeEventListener('dblclick', this.onDouble)
    c.removeEventListener('wheel', this.onWheel)
  }

  private hover(x: number, y: number): void {
    const rect = this.canvas.getBoundingClientRect()
    const hit = this.pick(x, y, rect)
    this.canvas.classList.toggle('is-over', hit !== null)
  }

  /** The body under a point: its name, its disc (the nearest one), or a ring round its dot. */
  private pick(cx: number, cy: number, rect = this.canvas.getBoundingClientRect()): BodyId | null {
    const fr = this.frame
    if (!fr) return null
    const x = cx - rect.left
    const y = cy - rect.top
    const ray = unproject(fr, x, y, this.width, this.height)
    const px = (2 * fr.ty) / this.height
    let best: BodyId | null = null
    let bestScore = Infinity
    for (const [id, p] of this.placed) {
      const el = this.labelEls.get(id)
      const lx = p.x + Math.max(p.r, 2) + 7
      const onLabel = p.shown && el !== undefined && x >= lx - 4 && x <= lx + el.offsetWidth + 4 && Math.abs(y - p.y) <= 10
      const off = angle(ray, p.dir)
      let score: number
      if (onLabel) score = -1
      else if (off <= p.ang) score = p.d
      else if (off <= p.ang + PICK_PX * px) score = 1e30 + off
      else continue
      if (score < bestScore) {
        bestScore = score
        best = id
      }
    }
    return best
  }

  // ------------------------------------------------------------ drawing

  private bodyDraws(): BodyDraw[] {
    const eye = this.eye.at
    const P = this.poses
    const earth = P.earth.at
    const moon = P.moon.at
    const out: BodyDraw[] = []
    for (const b of BODIES) {
      const pose = P[b.id]
      const rel = sub(pose.at, eye)
      const sun = scale(pose.at, -1)
      let occ: BodyDraw['occ'] = null
      let shine: BodyDraw['shine'] = null
      if (b.id === 'earth') occ = { rel: sub(moon, earth), radius: this.radius('moon') }
      if (b.id === 'moon') {
        // The Earth's shadow is a little wider than the Earth: its air blocks light too.
        occ = { rel: sub(earth, moon), radius: this.radius('earth') * 1.02 }
        const toEarth = norm(sub(earth, moon))
        const lit = (1 + dot(norm(scale(earth, -1)), scale(toEarth, -1))) / 2
        shine = { dir: toEarth, k: 0.05 * lit }
      }
      // As a point: its colour, dimmed by how little of its day side faces the eye.
      let dot3: readonly [number, number, number]
      if (b.id === 'sun') dot3 = [1, 0.92, 0.78]
      else {
        const toEye = norm(scale(rel, -1))
        const toSun = norm(sun)
        const lit = (1 + dot(toEye, toSun)) / 2
        const c = rgb(b.color)
        const k = 0.35 + 0.75 * Math.sqrt(lit)
        dot3 = [Math.min(1, c[0] * k + 0.1), Math.min(1, c[1] * k + 0.1), Math.min(1, c[2] * k + 0.1)]
      }
      out.push({
        id: b.id,
        shade: SHADES[b.id],
        rel,
        radius: b.radius,
        flat: b.flat,
        axes: [pose.x, pose.y, pose.z],
        sun,
        occ,
        shine,
        air: b.air ?? null,
        rings: b.id === 'saturn' ? RINGS : null,
        dot: dot3,
      })
    }
    out.sort((a, b) => len(b.rel) - len(a.rel))
    return out
  }

  /** How much of the Sun the eye sees, and the body covering the most of it. */
  private sunCover(): { sunSeen: number; cover: { rel: Vec3; radius: number } | null } {
    const eye = this.eye.at
    const toSun = sub(this.at('sun'), eye)
    const ds = len(toSun)
    const rs = Math.asin(Math.min(1, this.radius('sun') / ds))
    let seen = 1
    let cover: { rel: Vec3; radius: number } | null = null
    let most = 0
    for (const b of BODIES) {
      if (b.id === 'sun') continue
      const rel = sub(this.at(b.id), eye)
      const d = len(rel)
      if (d >= ds) continue
      const ro = Math.asin(Math.min(1, b.radius / d))
      const c = covered(rs, ro, angle(toSun, rel))
      if (c > 0) {
        seen *= 1 - c
        if (c > most) {
          most = c
          cover = { rel, radius: b.radius }
        }
      }
    }
    return { sunSeen: seen, cover }
  }

  private refreshOrbits(now: number): void {
    for (const o of this.orbits) {
      // The planets' paths creep only over centuries.
      if (Math.abs(this.ms - o.centre) > 50 * YEAR_MS) {
        o.centre = this.ms
        o.points = orbitOf(o.id, this.ms, LAP)
      }
    }
    // The Moon's is pulled about by the Sun, so it is redrawn as it goes.
    const m = this.moonOrbit
    const stale = !m || Math.abs(this.ms - m.centre) > 6 * 3.6e6
    if (stale && now - this.moonOrbitAt > 200) {
      this.moonOrbitAt = now
      this.moonOrbit = { id: 'moon', centre: this.ms, points: orbitOf('moon', this.ms, LAP) }
    }
  }

  private orbitDraws(): OrbitDraw[] {
    const eye = this.eye.at
    const out: OrbitDraw[] = []
    const lines = [...this.orbits]
    if (this.moonOrbit) lines.push(this.moonOrbit)
    const wide = smoothstep(0.15, 0.7, this.eye.fov)
    for (const o of lines) {
      const moon = o.id === 'moon'
      const base: Vec3 = moon ? this.at('earth') : [0, 0, 0]
      // Fade where the line passes close by the eye: up close it is no longer a path, just a stroke.
      const near = moon ? 2.5e4 : 4e6
      const points = new Float32Array(LAP * 3)
      const alpha = new Float32Array(LAP)
      for (let i = 0; i < LAP; i++) {
        const x = o.points[i * 3] + base[0] - eye[0]
        const y = o.points[i * 3 + 1] + base[1] - eye[1]
        const z = o.points[i * 3 + 2] + base[2] - eye[2]
        points[i * 3] = x / ORBIT_UNIT
        points[i * 3 + 1] = y / ORBIT_UNIT
        points[i * 3 + 2] = z / ORBIT_UNIT
        const d = Math.hypot(x, y, z)
        const t = Math.max(0, Math.min(1, (d - near) / (near * 3)))
        alpha[i] = t * t * (3 - 2 * t)
      }
      // Paths are a map: through a narrow lens they are clutter, so only the
      // one through what you are looking at stays, and that faintly.
      const ink = o.id === this.look ? 0.26 * (0.35 + 0.65 * wide) : 0.14 * wide
      out.push({ points, alpha, count: LAP, ink })
    }
    return out
  }

  private placeLabels(): void {
    const fr = this.frame
    if (!fr) return
    const eye = this.eye.at
    const pxAngle = (2 * fr.ty) / this.height
    const discs: Array<{ id: BodyId; dir: Vec3; ang: number; d: number }> = []
    for (const b of BODIES) {
      const rel = sub(this.at(b.id), eye)
      const d = len(rel)
      discs.push({ id: b.id, dir: scale(rel, 1 / d), ang: Math.asin(Math.min(1, b.radius / d)), d })
    }
    for (const disc of discs) {
      const at = project(fr, disc.dir, this.width, this.height)
      const r = disc.ang / pxAngle
      let shown = at !== null && disc.id !== this.seat && r < 26
      if (shown && at) {
        if (at[0] < -40 || at[0] > this.width + 40 || at[1] < -20 || at[1] > this.height + 20) shown = false
        // Hidden behind a nearer body.
        for (const o of discs) {
          if (o.d >= disc.d || o.id === disc.id) continue
          if (angle(o.dir, disc.dir) < o.ang) {
            shown = false
            break
          }
        }
      }
      this.placed.set(disc.id, { dir: disc.dir, ang: disc.ang, d: disc.d, x: at ? at[0] : NaN, y: at ? at[1] : NaN, r, shown })
    }
    // Names that would run into each other, as the inner planets' do from far
    // out: the one you are looking at keeps its name, then the biggest body.
    const kept: Array<[number, number, number, number]> = []
    for (const id of [this.look, ...BY_SIZE.filter((b) => b !== this.look)]) {
      const p = this.placed.get(id)
      if (!p?.shown) continue
      const x = p.x + Math.max(p.r, 2) + 7
      const box: [number, number, number, number] = [x - 4, p.y - 9, x + this.labelWidth(id) + 4, p.y + 9]
      if (kept.some((k) => box[0] < k[2] && k[0] < box[2] && box[1] < k[3] && k[1] < box[3])) p.shown = false
      else kept.push(box)
    }
    for (const [id, p] of this.placed) {
      const el = this.labelEls.get(id) as HTMLSpanElement
      el.classList.toggle('is-shown', p.shown)
      el.classList.toggle('is-look', id === this.look)
      if (p.shown) el.style.transform = `translate(${(p.x + Math.max(p.r, 2) + 7).toFixed(1)}px, ${(p.y - 6).toFixed(1)}px)`
    }
  }

  /** How wide a name is on screen, measured once it has been laid out. */
  private labelWidth(id: BodyId): number {
    let w = this.labelWidths.get(id) ?? 0
    if (w === 0) {
      w = (this.labelEls.get(id) as HTMLSpanElement).offsetWidth
      this.labelWidths.set(id, w)
    }
    return w
  }

  // ------------------------------------------------------------ snapshot

  /** The next eclipse of each kind. Searching takes a few ms, so at speed it is done twice a second at most. */
  private upcoming(): { solar: Eclipse | null; lunar: Eclipse | null } {
    const e = this.eclipses
    const now = performance.now()
    const stale =
      Number.isNaN(e.from) ||
      this.ms < e.from ||
      (e.solar !== null && this.ms > e.solar.peak) ||
      (e.lunar !== null && this.ms > e.lunar.peak)
    if (stale && (Number.isNaN(e.from) || now - e.at > 500)) {
      try {
        this.eclipses = { solar: nextEclipse('solar', this.ms), lunar: nextEclipse('lunar', this.ms), from: this.ms, at: now }
        for (const next of [this.eclipses.solar, this.eclipses.lunar]) if (next) this.tape.know(next.peak)
      } catch {
        this.eclipses = { solar: null, lunar: null, from: this.ms, at: now }
      }
    }
    return this.eclipses
  }

  private makeSnapshot(): Snapshot {
    const seat = bodyById(this.seat) as Body
    const look = bodyById(this.look) as Body
    const eye = this.eye.at
    const rows: Array<[string, string]> = []
    if (this.seat === this.look) {
      const alt = len(sub(this.at(seat.id), eye)) - seat.radius
      const fromSun = len(this.at(seat.id))
      rows.push(['Above', distanceLabel(Math.max(0, alt))])
      if (seat.id !== 'sun') {
        rows.push(['Sun', distanceLabel(fromSun)])
        rows.push(['Sunlight', lightLabel(fromSun)])
      }
      rows.push(['Radius', `${Math.round(seat.radius).toLocaleString('en-US')} km`])
    } else {
      const d = len(sub(this.at(look.id), this.at(seat.id)))
      const rel = sub(this.at(look.id), eye)
      const across = 2 * Math.asin(Math.min(1, look.radius / len(rel)))
      rows.push(['Distance', distanceLabel(d)])
      rows.push(['Light', lightLabel(d)])
      rows.push(['Size', sizeLabel(across)])
      if (look.id !== 'sun') {
        const lit = (1 + dot(norm(scale(rel, -1)), norm(scale(this.at(look.id), -1)))) / 2
        rows.push(['Lit', `${Math.round(lit * 100)}%`])
      }
    }
    const { solar, lunar } = this.upcoming()
    return {
      playing: this.playing,
      rung: this.rung,
      rate: rateName(this.rung),
      reverse: this.rung < 0,
      live: this.rung === 0 && Math.abs(this.ms - Date.now()) < 5000,
      seat,
      look,
      readout: rows,
      solar,
      lunar,
      announce: this.announce,
      position: this.back,
      filled: this.tape.filled,
      marks: this.tape.markings,
      expanded: !this.playing || this.scrubbing,
      moment: `${dayLabel(this.ms)}, ${clockLabel(this.ms)} UTC`,
    }
  }
}

