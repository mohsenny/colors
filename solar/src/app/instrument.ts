/*
 * The instrument: the clock, where you sit and what you look at, the hand on
 * the sky, and the frame loop. React only draws the chrome around it, from
 * snapshots handed out a few times a second; the clock in the dock and the
 * names in the sky are written straight into the page every frame.
 */

import { AU_KM, BODIES, KEYED, LIGHT_KM_S, RINGS, bodyById } from '../sky/bodies'
import type { Body, BodyId } from '../sky/bodies'
import { NEAR_MS, nearEclipse, stepTo, stepsFrom } from '../sky/eclipses'
import type { Eclipse, EclipseSteps, EclipseType } from '../sky/eclipses'
import { PERIOD, TIME_MAX, TIME_MIN, orbitOf, posesAt } from '../sky/ephemeris'
import type { Poses, Vec3 } from '../sky/ephemeris'
import { DARK, LIGHTS, excess, gain, glareOf, luxOf, magnitude, noonLux, pointLook, ringsMagnitude, skyAt, sunMagnitude } from '../sky/light'
import type { Glare } from '../sky/light'
import { unpackStars } from '../sky/stars'
import {
  FOV,
  FOV_MIN,
  GLOBE,
  LOW,
  LOW_MAX,
  LOW_MIN,
  PITCH_MAX,
  RISE_MAX,
  ZG_MIN,
  Z_MIN,
  NORTH,
  across,
  add,
  dot,
  frameOf,
  globeEye,
  grip,
  len,
  magnification,
  meet,
  norm,
  overSpot,
  pixelAngle,
  project,
  scale,
  seatEye,
  slerp,
  sub,
  turnTo,
  unproject,
  zMax,
  zgMax,
} from '../render/camera'
import type { Eye, Frame } from '../render/camera'
import { ORBIT_UNIT, Renderer } from '../render/gl'
import type { BodyDraw, OrbitDraw, Shade } from '../render/gl'
import { EARTH_CLOUDS, EARTH_NIGHT, SATURN_RING, STARS, SURFACE } from '../render/maps'
import { png } from '../../../src/photo/save'
import { isIdle } from '../../../src/ui/idle'
import { Tape } from './tape'
import type { Mark } from './tape'
import { DEAD, clockLabel, dayLabel, dialOf, notch, rateOf, speedSaid } from './time'

export interface Snapshot {
  playing: boolean
  /** Where the speed knob is turned, -1 to 1: below 0 the clock runs back, 0 is real time. */
  dial: number
  /** True when the clock is playing the present at real speed. */
  live: boolean
  seat: Body
  look: Body
  readout: Array<[string, string]>
  solar: EclipseSteps
  lunar: EclipseSteps
  announce: string
  /** Where the clock is on the tape, 1 its newest moment. */
  position: number
  /** How much of the tape has been watched, 0 to 1. */
  filled: number
  /** The eclipses the tape ran through, at their places on it. */
  marks: Mark[]
  /** Paused or scrubbing: the tape opens out. */
  expanded: boolean
  /** The moment on the clock, in words. */
  moment: string
}

/** Every moon, and Pluto, is lit as the Moon is, but Titan, which is all haze. */
const SHADES: Partial<Record<BodyId, Shade>> = {
  sun: 'sun',
  mercury: 'rock',
  venus: 'gas',
  earth: 'earth',
  mars: 'rock',
  jupiter: 'gas',
  saturn: 'gas',
  titan: 'gas',
  uranus: 'gas',
  neptune: 'gas',
}

/** The colour of a planet's light on its moons' night sides. */
const SHINE: Partial<Record<BodyId, readonly [number, number, number]>> = {
  earth: [0.55, 0.68, 1],
  jupiter: [1, 0.84, 0.64],
  saturn: [1, 0.9, 0.68],
  uranus: [0.74, 0.95, 1],
  neptune: [0.5, 0.64, 1],
  pluto: [1, 0.86, 0.74],
}

/** Each planet's moons, nearest first. */
const MOONS = new Map<BodyId, Body[]>()
for (const b of BODIES) if (b.parent) MOONS.set(b.parent, [...(MOONS.get(b.parent) ?? []), b])

const YEAR_MS = 365.2425 * 86_400_000
const ORIGIN: Vec3 = [0, 0, 0]

/** Points a lap. */
const LAP = 361
/** The widest step an orbit line takes across the sky, radians: wider, the straight step would cut the path's curve. */
const STEP = 0.035
/** Seconds the paths take to go when the page goes idle, and to come back: as slowly and as quickly as the chrome. */
const PATHS_OUT = 0.7
const PATHS_IN = 0.32
/** Snapshots a second, at most. */
const SNAP_MS = 125
const CLICK_PX = 5
/** How near a dot a click still counts as on it. */
const PICK_PX = 14
/** A star of 6.5, the faintest drawn, on a dark sky: what you are looking at never shows fainter. */
const FINDABLE = excess(6.5, DARK, 0)
/** The nearest the haze round a light is reckoned, radians as the eye sees the widest lens. */
const HAZE = (0.5 * Math.PI) / 180
/** Points a lit disc is sampled at, for how much of it is on screen. */
const SAMPLES = 64
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
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

/** The seat's ground under the pointer, and where the pointer is. */
interface Under {
  n: Vec3
  /** How far the eye is from the seat's centre, in its radii. */
  back: number
  /** How far the pointer is from the middle of the frame, radians, and which way round from the right. */
  off: number
  toward: number
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** A body's colour washed pale, as a star's is: the eye sees little colour in a point. */
function pale(c: readonly [number, number, number]): [number, number, number] {
  const top = Math.max(c[0], c[1], c[2], 1e-3)
  return [0.5 + (0.5 * c[0]) / top, 0.5 + (0.5 * c[1]) / top, 0.5 + (0.5 * c[2]) / top]
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

/**
 * Whether a name's box, set beside a dot at x, y, runs across a disc it is
 * not on: as a close moon's would across its planet from the planet's left.
 */
export function crossesDisc(box: readonly number[], x: number, y: number, disc: { x: number; y: number; r: number }): boolean {
  if (Math.hypot(x - disc.x, y - disc.y) <= disc.r) return false
  const dx = Math.max(box[0], Math.min(disc.x, box[2])) - disc.x
  const dy = Math.max(box[1], Math.min(disc.y, box[3])) - disc.y
  return Math.hypot(dx, dy) < disc.r
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

/** Lux to three figures: "103 lux", "128,000 lux". */
export function luxLabel(lux: number): string {
  const r = Number(lux.toPrecision(3))
  return `${r >= 1000 ? r.toLocaleString('en-US') : lux.toPrecision(3)} lux`
}

/**
 * Apparent diameter: degrees, arcminutes or arcseconds, whichever has a whole
 * number in front. Under a tenth of an arcsecond, as the small moons are from
 * the Earth, to two figures rather than 0.0.
 */
export function sizeLabel(rad: number): string {
  const deg = (rad * 180) / Math.PI
  if (deg >= 1) return `${deg.toFixed(2)}°`
  const min = deg * 60
  if (min >= 1) return `${min.toFixed(1)}′`
  const sec = min * 60
  return `${sec >= 0.1 ? sec.toFixed(1) : sec.toPrecision(2)}″`
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
  /** The wall clock at the last frame. */
  private wall = Date.now()
  private dial = 0
  private playing = true
  private seat: BodyId = 'earth'
  private look: BodyId = 'moon'
  private z = 0
  /** How far round the seat the eye has been swung from the target, along and up the sky, radians. */
  private swing = 0
  private rise = 0
  /** How far round the seat you have gone from over its north, and how low its horizon is: both set by taking hold of the ground. */
  private side = 0
  private low = LOW
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
  /** The moons' paths round their planets, worked out once there is a line to draw. */
  private locals = new Map<BodyId, Orbit>()
  private localAt = 0
  /** How much the paths show, 0 to 1. They are a guide, as the names are, so they leave with the chrome. */
  private paths = 1
  /** How much of each moon shows, 0 to 1. */
  private fades = new Map<BodyId, number>()
  private mapped = new Set<BodyId>()
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
  /** A hand on the sky, or on the ground at `ground`, a unit vector from the seat's centre. */
  private drag: { x: number; y: number; id: number; moved: boolean; ground: Vec3 | null } | null = null
  /** Where the pointer was when scrolling over the seat took the eye down to its globe. */
  private dived: [number, number] | null = null
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
      if (b.kind !== 'planet' && b.kind !== 'dwarf') continue
      this.orbits.push({ id: b.id, centre: this.ms, points: orbitOf(b.id, this.ms, LAP) })
    }
    this.snap = this.makeSnapshot()
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(canvas)
    this.resize()
    this.loadMaps()
  }

  /**
   * Every body in its own colour at once, which is all the small moons ever
   * have. The giants' big moons, Pluto and Charon fetch their maps once they
   * are near enough to show them.
   */
  private loadMaps(): void {
    for (const b of BODIES) this.renderer.paint(b.id, b.color)
    for (const b of KEYED) this.loadMap(b.id)
    void this.renderer.load('night', EARTH_NIGHT).catch(() => undefined)
    void this.renderer.load('clouds', EARTH_CLOUDS, true).catch(() => undefined)
    void this.renderer.load('rings', SATURN_RING).catch(() => undefined)
    fetch(STARS)
      .then((r) => r.arrayBuffer())
      .then((buf) => this.renderer.setStars(unpackStars(buf)))
      .catch(() => undefined)
  }

  private loadMap(id: BodyId): void {
    if (this.mapped.has(id)) return
    const url = SURFACE[id]
    if (!url) return
    this.mapped.add(id)
    void this.renderer.load(id, url).catch(() => undefined)
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
    // At real time the clock keeps to the wall clock, so a while in another
    // tab, or asleep, does not leave it behind.
    const wall = Date.now()
    const real = wall - this.wall
    this.wall = wall
    if (this.playing) {
      const next = this.ms + (this.dial === 0 ? real : dt * 1000 * rateOf(this.dial))
      if (next <= TIME_MIN || next >= TIME_MAX) {
        this.ms = Math.max(TIME_MIN, Math.min(TIME_MAX, next))
        this.playing = false
        this.touch('The clock has reached the end of its range')
      } else this.ms = next
      this.tape.record(dt, this.ms)
    }
    this.poses = posesAt(this.ms)
    this.eye = this.flownEye(now)
    this.frame = frameOf(this.eye, this.width / this.height)
    this.mergeMoons()
    this.refreshOrbits(now)
    this.paths = Math.min(1, Math.max(0, this.paths + (isIdle() ? -dt / PATHS_OUT : dt / PATHS_IN)))
    this.draw(now, smoothstep(0, 1, this.paths))
    this.placeLabels()
    this.writeClock()
    this.emit()
  }

  /** A frame, its paths drawn at `paths`, 0 to 1. */
  private draw(now: number, paths: number): void {
    const cover = this.sunCover()
    const power = magnification(this.eye.fov)
    const mags = this.magnitudes()
    const glare = this.glare(mags, cover.sunSeen, power)
    this.renderer.draw({
      eye: this.eye,
      bodies: this.bodyDraws(mags, glare, gain(power)),
      ...cover,
      orbits: paths > 0 ? this.orbitDraws(paths) : [],
      glare,
      lens: gain(power),
      clock: now / 1000,
    })
  }

  /**
   * The sky as it is, without the names on it, which live in the page, or the
   * paths. The last frame is drawn again so the picture is taken before it is
   * shown.
   */
  photo(): Promise<Blob> {
    this.draw(this.last, 0)
    return png(this.canvas)
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

  /** How much sky a pixel covers toward `to`, from the eye. */
  private pixel(to: Vec3): number {
    return pixelAngle(this.frame ?? frameOf(this.eye, this.width / this.height), norm(to), this.height)
  }

  private restingEye(): Eye {
    if (this.seat === this.look) return globeEye(this.at(this.seat), this.radius(this.seat), this.zg, this.yaw, this.pitch)
    return this.seatEyeAt(this.side, this.low)
  }

  /** The eye on the seat looking at the target, gone `side` round it with the horizon at `low`. */
  private seatEyeAt(side: number, low: number): Eye {
    const air = (bodyById(this.seat) as Body).air?.depth ?? 0
    return seatEye(this.at(this.seat), this.radius(this.seat), this.at(this.look), this.z, this.swing, this.rise, air, low, side)
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
    const [forward, up] = turnTo(f.from, to, turn)
    return { at, forward, up, fov }
  }

  private fly(ms: number): void {
    this.dived = null
    this.flight = {
      from: this.eye,
      fromSeat: this.seat,
      rel: sub(this.eye.at, this.at(this.seat)),
      start: performance.now(),
      ms,
    }
  }

  /**
   * A lens that shows the target an eighth of the frame across, as far as the
   * lens goes. A planet is framed wider when it needs to be for the moons that
   * go round it within three weeks to fit across as well.
   */
  private zoomFor(seat: BodyId, look: BodyId): number {
    if (seat === look) return 0
    const d = len(sub(this.at(look), this.at(seat)))
    // On the plane, half a body seen a across is tan(a / 4), half the frame tan(fov / 4).
    let fov = 4 * Math.atan(8 * Math.tan(Math.asin(Math.min(1, this.radius(look) / d)) / 2))
    for (const m of MOONS.get(look) ?? []) {
      const r = len(sub(this.at(m.id), this.at(look)))
      if ((PERIOD[m.id] ?? Infinity) < 21 && r < d / 4) {
        const half = Math.atan((1.1 * r) / d)
        fov = Math.max(fov, 4 * Math.atan(Math.tan(half / 2) / (this.width / this.height)))
      }
    }
    return Math.log(Math.max(FOV_MIN, Math.min(FOV, fov)) / FOV)
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
      this.settle()
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
      this.settle()
    }
    this.touch(`On ${(bodyById(id) as Body).name}, looking at ${(bodyById(this.look) as Body).name}`)
    this.emit(true)
  }

  /** Facing the target from over the seat's north, its horizon where it rests. */
  private settle(): void {
    this.swing = 0
    this.rise = 0
    this.side = 0
    this.low = LOW
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

  /** Turning the speed knob. Its own turns are not announced: as a slider it says what it is at. */
  setDial(dial: number, say = false): void {
    const d = Math.abs(dial) < DEAD ? 0 : Math.max(-1, Math.min(1, dial))
    if (d === this.dial) return
    this.dial = d
    this.play()
    this.touch(say ? speedSaid(d) : undefined)
    this.emit(true)
  }

  faster(): void {
    this.setDial(notch(this.dial, 1), true)
  }

  slower(): void {
    this.setDial(notch(this.dial, -1), true)
  }

  now(): void {
    this.branch()
    this.ms = Date.now()
    this.tape.jump(this.ms)
    this.dial = 0
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
    this.tape.know(e)
    this.dial = dialOf(10 * 60)
    this.playing = true
    this.poses = posesAt(this.ms)
    this.fly(1600)
    this.seat = solar ? 'moon' : 'earth'
    this.look = solar ? 'earth' : 'moon'
    this.settle()
    // Close enough on the target to see the shadow cross it.
    const d = len(sub(this.at(this.look), this.at(this.seat)))
    const across = 2 * Math.asin(this.radius(this.look) / d)
    this.z = Math.log(Math.max(FOV_MIN, Math.min(FOV, across * (solar ? 2.2 : 3.2))) / FOV)
    this.eclipses.from = NaN
    this.touch(`${e.kind} ${e.type} eclipse, ${dayLabel(e.peak)}`)
    this.emit(true)
  }

  /** To the eclipse of a type before the one the clock is at or coming to, or on to the one after. */
  stepEclipse(type: EclipseType, way: 1 | -1): void {
    const to = stepTo(type, this.ms, way)
    if (to) this.watch(to)
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
    let ground: Vec3 | null = null
    if (this.seat !== this.look && !this.flight) {
      const rect = this.canvas.getBoundingClientRect()
      ground = this.underPointer(e.clientX - rect.left, e.clientY - rect.top)?.n ?? null
    }
    this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, ground }
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
      this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + dy * k))
    } else if (d.ground) {
      // Taking hold of the ground: across, you go round the seat, its sky
      // turning about the target, and the ground under the hand keeps up with
      // it; up and down you look the way you drag, as on the sky, the horizon
      // moving a pixel for a pixel. The ground is taken again where the hand
      // was, so a long drag never runs it over the horizon.
      const rect = this.canvas.getBoundingClientRect()
      d.ground = this.underPointer(e.clientX - dx - rect.left, e.clientY - dy - rect.top)?.n ?? d.ground
      const ground = add(this.at(this.seat), scale(d.ground, this.radius(this.seat)))
      this.low = Math.max(LOW_MIN, Math.min(LOW_MAX, this.low - (2 * dy) / this.height))
      this.side = grip((s) => this.seatEyeAt(s, this.low), ground, e.clientX - rect.left, this.width, this.height, this.side)
    } else {
      // Turning on the spot: the eye swings round the seat, which stays under
      // you. Across, you turn the way you drag; up and down you look the way
      // you drag, as a camera tilts. Wide, a drag across the screen turns you
      // more than half way round; through a telescope the sky moves at most
      // ten times as fast as the hand, so it can still be aimed.
      const k = Math.min(0.003, (40 * Math.tan(this.eye.fov / 4)) / this.height)
      const lat0 = Math.asin(norm(sub(this.at(this.look), this.at(this.seat)))[2])
      this.swing -= dx * k
      this.rise = Math.max(-RISE_MAX - lat0, Math.min(RISE_MAX - lat0, this.rise - dy * k))
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
    const rect = this.canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Scrolling on without moving from where the eye went down to the globe
    // goes straight in, to the ground that was pointed at.
    if (this.dived && Math.hypot(x - this.dived[0], y - this.dived[1]) > CLICK_PX) this.dived = null
    const under = this.dived ? null : this.underPointer(x, y)
    if (this.seat === this.look) {
      this.zg = Math.max(ZG_MIN, Math.min(zgMax(r), this.zg + step))
      if (under) this.keepUnder(under)
    } else if (under && step < 0) this.dive(under, step, x, y)
    else this.z = Math.max(Z_MIN, Math.min(zMax(r), this.z + step))
  }

  /** The seat's ground under the pointer, as the eye will see it once it comes to rest. Null over the sky. */
  private underPointer(x: number, y: number): Under | null {
    const eye = this.restingEye()
    const fr = frameOf(eye, this.width / this.height)
    const from = scale(sub(eye.at, this.at(this.seat)), 1 / this.radius(this.seat))
    const ray = unproject(fr, x, y, this.width, this.height)
    const n = meet(from, ray)
    if (!n) return null
    return { n, back: len(from), off: angle(ray, fr.forward), toward: Math.atan2(dot(ray, fr.up), dot(ray, fr.right)) }
  }

  /**
   * Scrolling in over the seat turns to its globe, over the ground pointed
   * at, so any side of it can be zoomed into, not only the top you sit on.
   */
  private dive(under: Under, step: number, x: number, y: number): void {
    this.fly(700)
    this.dived = [x, y]
    this.look = this.seat
    this.zg = Math.max(ZG_MIN, Math.min(zgMax(this.radius(this.seat)), Math.log(under.back / GLOBE) + step))
    this.yaw = Math.atan2(under.n[1], under.n[0])
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, Math.asin(under.n[2])))
    this.touch(`Looking at ${(bodyById(this.seat) as Body).name}`)
    this.emit(true)
  }

  /** Turns the globe, at its new distance, so the ground that was under the pointer still is. */
  private keepUnder(under: Under): void {
    const [yaw, pitch] = overSpot(under.n, under.off, under.toward, GLOBE * Math.exp(this.zg), this.yaw, this.pitch)
    this.yaw = yaw
    this.pitch = pitch
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
    const px = pixelAngle(fr, ray, this.height)
    let best: BodyId | null = null
    let bestScore = Infinity
    for (const [id, p] of this.placed) {
      if ((this.fades.get(id) ?? 1) < 0.5) continue
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

  /** Moons too near their planet on screen to tell apart from it fold into its point. Never the seat or the target. */
  private mergeMoons(): void {
    const eye = this.eye.at
    for (const b of BODIES) {
      if (!b.parent) continue
      const p = sub(this.at(b.parent), eye)
      const px = this.pixel(p)
      const big = Math.asin(Math.min(1, this.radius(b.parent) / len(p))) / px
      const apart = angle(p, sub(this.at(b.id), eye)) / px
      const keep = b.id === this.seat || b.id === this.look
      this.fades.set(b.id, keep ? 1 : Math.max(smoothstep(2, 6, big), smoothstep(2.5, 6, apart)))
    }
  }

  /**
   * What can throw a shadow on a body: a moon's planet, or those of a planet's
   * moons whose shadow can reach it, the four biggest if more can at once.
   */
  private shadowers(b: Body): BodyDraw['occ'] {
    const at = this.at(b.id)
    if (b.parent) {
      // The Earth's shadow is a little wider than the Earth: its air blocks light too.
      const k = b.parent === 'earth' ? 1.02 : 1
      return [{ rel: sub(this.at(b.parent), at), radius: this.radius(b.parent) * k }]
    }
    const toSun = norm(scale(at, -1))
    const r = this.radius(b.id)
    // A shadow's edge spreads by the Sun's width as seen from here.
    const spread = this.radius('sun') / len(at)
    return (MOONS.get(b.id) ?? [])
      .map((m) => ({ rel: sub(this.at(m.id), at), radius: m.radius }))
      .filter((o) => {
        const along = dot(o.rel, toSun)
        return along > 0 && len(sub(o.rel, scale(toSun, along))) < r + o.radius + (along + r) * spread
      })
      .sort((p, q) => q.radius - p.radius)
      .slice(0, 4)
  }

  /** How much sunlight reaches a moon past its planet: none in the umbra, but for the Moon's copper. */
  private sunlit(b: Body): number {
    if (!b.parent) return 1
    const at = this.at(b.id)
    const toSun = sub(this.at('sun'), at)
    const toPlanet = sub(this.at(b.parent), at)
    const k = b.parent === 'earth' ? 1.02 : 1
    const rs = Math.asin(Math.min(1, this.radius('sun') / len(toSun)))
    const ro = Math.asin(Math.min(1, (this.radius(b.parent) * k) / len(toPlanet)))
    return Math.max(b.id === 'moon' ? 1e-4 : 0, 1 - covered(rs, ro, angle(toSun, toPlanet)))
  }

  /** Every body's magnitude from the eye. */
  private magnitudes(): Map<BodyId, number> {
    const eye = this.eye.at
    const sunAt = this.at('sun')
    const out = new Map<BodyId, number>()
    for (const b of BODIES) {
      const at = this.at(b.id)
      const toEye = sub(eye, at)
      const d = len(toEye)
      if (b.id === 'sun') {
        out.set(b.id, sunMagnitude(d / AU_KM))
        continue
      }
      const toSun = sub(sunAt, at)
      let rings = 0
      if (b.id === 'saturn') {
        const pole = this.poses.saturn.z
        rings = ringsMagnitude(Math.asin(dot(pole, toEye) / d), Math.asin(dot(pole, toSun) / len(toSun)))
      }
      out.set(b.id, magnitude(b.id, b.radius, d, len(toSun) / AU_KM, angle(toSun, toEye), this.sunlit(b), rings))
    }
    return out
  }

  /**
   * The lights in view, for the haze they put over the sky round them: the
   * Sun and every body bright enough to matter, each by as much of its
   * sunlit side as is on screen and not behind something nearer. Light from
   * off screen never reaches the eye, but a light just past the edge still
   * counts a little, so the haze goes smoothly as it leaves.
   */
  private glare(mags: Map<BodyId, number>, seen: number, power: number): Glare[] {
    const fr = this.frame ?? frameOf(this.eye, this.width / this.height)
    const eye = this.eye.at
    const sunAt = this.at('sun')
    const near = HAZE / power
    const discs = BODIES.map((b) => {
      const rel = sub(this.at(b.id), eye)
      const d = len(rel)
      return { dir: scale(rel, 1 / d), d, cos: Math.cos(Math.asin(Math.min(1, b.radius / d))) }
    })
    const hidden = (r: Vec3, far: number): boolean => discs.some((o) => o.d < far && dot(r, o.dir) > o.cos)
    const edge = 0.1 * this.height
    const onScreen = (r: Vec3): number => {
      const p = project(fr, r, this.width, this.height)
      if (!p) return 0
      return 1 - smoothstep(0, edge, Math.max(-p[0], p[0] - this.width, -p[1], p[1] - this.height, 0))
    }
    const out: Glare[] = []
    for (const b of BODIES) {
      const isSun = b.id === 'sun'
      const k = glareOf(luxOf(mags.get(b.id) as number) * (isSun ? seen : 1), power)
      if (k < 0.3 * DARK * near * near) continue
      const at = this.at(b.id)
      const rel = sub(at, eye)
      const d = len(rel)
      const dir = scale(rel, 1 / d)
      const ang = Math.asin(Math.min(1, b.radius / d))
      let share = 0
      let spread = 0
      let centre = dir
      if (ang / this.pixel(rel) < 2) {
        share = !isSun && hidden(dir, d) ? 0 : onScreen(dir)
      } else {
        // Points spread evenly over the disc, each weighed by how brightly it
        // is lit as its own shader lights it, and kept if it is in view.
        const toSun = norm(sub(sunAt, at))
        const dusty = (SHADES[b.id] ?? 'moon') === 'moon'
        const u = norm(across(NORTH, dir, [1, 0, 0]))
        const v: Vec3 = [dir[1] * u[2] - dir[2] * u[1], dir[2] * u[0] - dir[0] * u[2], dir[0] * u[1] - dir[1] * u[0]]
        const cap = 2 * Math.sin(ang / 2) ** 2
        const kept: Array<[Vec3, number]> = []
        let all = 0
        let sum: Vec3 = [0, 0, 0]
        let shown = 0
        for (let i = 0; i < SAMPLES; i++) {
          const down = ((i + 0.5) / SAMPLES) * cap
          const s = Math.sqrt(down * (2 - down))
          const c = 1 - down
          const ph = i * GOLDEN
          const r = add(add(scale(dir, c), scale(u, s * Math.cos(ph))), scale(v, s * Math.sin(ph)))
          let g = 1
          if (!isSun) {
            const t = d * c - Math.sqrt(Math.max(0, b.radius * b.radius - d * d * s * s))
            const n = scale(sub(scale(r, t), rel), 1 / b.radius)
            const mu0 = dot(n, toSun)
            const mu = Math.max(0, -dot(n, r))
            g = mu0 <= 0 ? 0 : dusty ? (2 * mu0) / (mu0 + mu + 1e-4) : mu0
          }
          all += g
          if (g <= 0 || (!isSun && hidden(r, d))) continue
          const w = g * onScreen(r)
          if (w <= 0) continue
          kept.push([r, w])
          sum = add(sum, scale(r, w))
          shown += w
        }
        if (shown > 0) {
          share = shown / all
          centre = norm(sum)
          let s2 = 0
          for (const [r, w] of kept) s2 += w * angle(r, centre) ** 2
          spread = Math.sqrt(s2 / shown)
        }
      }
      if (share > 0) out.push({ id: b.id, dir: centre, k: k * share, min: Math.max(near, 1.2 * spread) })
    }
    return out.sort((p, q) => q.k - p.k).slice(0, LIGHTS)
  }

  private bodyDraws(mags: Map<BodyId, number>, glare: readonly Glare[], lens: number): BodyDraw[] {
    const eye = this.eye.at
    const out: BodyDraw[] = []
    for (const b of BODIES) {
      const pose = this.poses[b.id]
      const rel = sub(pose.at, eye)
      const sun = scale(pose.at, -1)
      let shine: BodyDraw['shine'] = null
      if (b.parent) {
        // The planet's day side lights the moon's night side: as brightly as
        // the Moon's earthshine is drawn, or more close under a giant.
        const p = this.at(b.parent)
        const d = len(sub(p, pose.at))
        const toPlanet = scale(sub(p, pose.at), 1 / d)
        const lit = (1 + dot(norm(scale(p, -1)), scale(toPlanet, -1))) / 2
        const k = Math.max(0.05, 0.5 * (this.radius(b.parent) / d) ** 2) * lit
        shine = { dir: toPlanet, k, tint: SHINE[b.parent] ?? [1, 1, 1] }
      }
      // As a point: a star of its magnitude, against the sky round it, which
      // the lights in view lighten. What you are looking at stays findable.
      let x = excess(mags.get(b.id) as number, skyAt(glare, norm(rel), b.id), lens)
      if (b.id === this.look) x = Math.max(x, FINDABLE)
      const { a, size } = pointLook(x)
      const c = b.id === 'sun' ? [1, 0.92, 0.78] : pale(rgb(b.color))
      out.push({
        id: b.id,
        shade: SHADES[b.id] ?? 'moon',
        rel,
        radius: b.radius,
        flat: b.flat,
        axes: [pose.x, pose.y, pose.z],
        sun,
        occ: this.shadowers(b),
        copper: b.id === 'moon',
        shine,
        air: b.air ?? null,
        rings: b.id === 'saturn' ? RINGS : null,
        dot: { rgb: [c[0] * a, c[1] * a, c[2] * a], a, size },
        fade: this.fades.get(b.id) ?? 1,
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
    // A moon's is worked out once there is a line to draw, and again a few
    // laps on. The Moon's is pulled about by the Sun, so it is redone every
    // few hours of the clock. One a frame, ten a second at most.
    if (now - this.localAt < 100) return
    for (const b of BODIES) {
      if (!b.parent || this.localInk(b) <= 0) continue
      const o = this.locals.get(b.id)
      const life = b.id === 'moon' ? 6 * 3.6e6 : 4 * (PERIOD[b.id] ?? 0) * 86_400_000
      if (o && Math.abs(this.ms - o.centre) <= life) continue
      this.locals.set(b.id, { id: b.id, centre: this.ms, points: orbitOf(b.id, this.ms, LAP) })
      this.localAt = now
      return
    }
  }

  /**
   * How strongly a moon's path is drawn: once it is big enough on screen to
   * be a path, and like the planets' faded through a narrow lens, unless the
   * whole of it is in view.
   */
  private localInk(b: Body): number {
    const planet = this.at(b.parent as BodyId)
    const px = this.pixel(sub(planet, this.eye.at))
    const r = len(sub(this.at(b.id), planet)) / (len(sub(planet, this.eye.at)) * px)
    const look = b.id === this.look
    const wide = smoothstep(0.15, 0.7, this.eye.fov)
    const whole = 1 - smoothstep(1, 3, r / (Math.max(this.width, this.height) / 2))
    return (look ? 0.26 : 0.14) * smoothstep(8, 24, r) * Math.max(look ? 0.35 + 0.65 * wide : wide, whole)
  }

  private orbitDraws(shown: number): OrbitDraw[] {
    const eye = this.eye.at
    const out: OrbitDraw[] = []
    const wide = smoothstep(0.15, 0.7, this.eye.fov)
    const line = (o: Orbit, base: Vec3, ink: number): void => {
      // Fade where the line passes close by the eye: up close it is no longer a path, just a stroke.
      const near = base === ORIGIN ? 4e6 : 0.065 * Math.hypot(o.points[0], o.points[1], o.points[2])
      const points: number[] = []
      const alpha: number[] = []
      const put = (p: Vec3): void => {
        points.push(p[0] / ORBIT_UNIT, p[1] / ORBIT_UNIT, p[2] / ORBIT_UNIT)
        alpha.push(smoothstep(near, 4 * near, len(p)))
      }
      let last: Vec3 | null = null
      for (let i = 0; i < LAP; i++) {
        const p: Vec3 = [o.points[i * 3] + base[0] - eye[0], o.points[i * 3 + 1] + base[1] - eye[1], o.points[i * 3 + 2] + base[2] - eye[2]]
        // The screen draws a straight line between two points, but a straight
        // path is curved on the stereographic plane: a step that crosses much
        // of the sky, as one passing near the eye does, is broken up.
        if (last && Math.max(len(last), len(p)) > near) {
          const steps = Math.ceil(angle(last, p) / STEP)
          for (let k = 1; k < steps; k++) put(add(last, scale(sub(p, last), k / steps)))
        }
        put(p)
        last = p
      }
      out.push({ points: new Float32Array(points), alpha: new Float32Array(alpha), count: alpha.length, ink: ink * shown })
    }
    // Paths are a map: through a narrow lens they are clutter, so only the
    // one through what you are looking at stays, and that faintly.
    for (const o of this.orbits) line(o, ORIGIN, o.id === this.look ? 0.26 * (0.35 + 0.65 * wide) : 0.14 * wide)
    for (const o of this.locals.values()) {
      const b = bodyById(o.id) as Body
      const ink = this.localInk(b)
      if (ink > 0) line(o, this.at(b.parent as BodyId), ink)
    }
    return out
  }

  private placeLabels(): void {
    const fr = this.frame
    if (!fr) return
    const eye = this.eye.at
    const discs: Array<{ id: BodyId; dir: Vec3; ang: number; d: number }> = []
    for (const b of BODIES) {
      const rel = sub(this.at(b.id), eye)
      const d = len(rel)
      discs.push({ id: b.id, dir: scale(rel, 1 / d), ang: Math.asin(Math.min(1, b.radius / d)), d })
    }
    for (const disc of discs) {
      const at = project(fr, disc.dir, this.width, this.height)
      const r = disc.ang / pixelAngle(fr, disc.dir, this.height)
      if (r > 1.5 || disc.id === this.seat || disc.id === this.look) this.loadMap(disc.id)
      let shown = at !== null && disc.id !== this.seat && r < 26 && (this.fades.get(disc.id) ?? 1) >= 0.5
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
    // Nor does a moon's name run across its planet from beside it.
    const kept: Array<[number, number, number, number]> = []
    for (const id of [this.look, ...BY_SIZE.filter((b) => b !== this.look)]) {
      const p = this.placed.get(id)
      if (!p?.shown) continue
      const x = p.x + Math.max(p.r, 2) + 7
      const box: [number, number, number, number] = [x - 4, p.y - 9, x + this.labelWidth(id) + 4, p.y + 9]
      const parent = bodyById(id)?.parent
      const q = parent && parent !== this.seat && id !== this.look ? this.placed.get(parent) : undefined
      if (q && crossesDisc(box, p.x, p.y, { x: q.x, y: q.y, r: Math.max(q.r, 2) })) p.shown = false
      else if (kept.some((k) => box[0] < k[2] && k[0] < box[2] && box[1] < k[3] && k[1] < box[3])) p.shown = false
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

  /**
   * The eclipse of each type the clock is at or coming to, and where a step
   * either way can go. Searching takes a few ms, so at speed it is done twice
   * a second at most.
   */
  private upcoming(): { solar: EclipseSteps; lunar: EclipseSteps } {
    const e = this.eclipses
    const now = performance.now()
    const stale =
      Number.isNaN(e.from) ||
      this.ms < e.from ||
      (e.solar !== null && this.ms >= e.solar.peak + NEAR_MS) ||
      (e.lunar !== null && this.ms >= e.lunar.peak + NEAR_MS)
    if (stale && (Number.isNaN(e.from) || now - e.at > 500)) {
      try {
        this.eclipses = { solar: nearEclipse('solar', this.ms), lunar: nearEclipse('lunar', this.ms), from: this.ms, at: now }
        for (const next of [this.eclipses.solar, this.eclipses.lunar]) if (next) this.tape.know(next)
      } catch {
        this.eclipses = { solar: null, lunar: null, from: this.ms, at: now }
      }
    }
    const steps = (x: Eclipse | null): EclipseSteps => (x ? stepsFrom(x, this.ms) : { e: null, at: false, back: false, on: false })
    return { solar: steps(this.eclipses.solar), lunar: steps(this.eclipses.lunar) }
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
        rows.push(['Noon', luxLabel(noonLux(fromSun / AU_KM))])
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
      dial: this.dial,
      live: this.playing && this.dial === 0 && Math.abs(this.ms - Date.now()) < 5000,
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

