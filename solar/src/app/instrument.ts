/*
 * The instrument: the clock, where you sit and what you look at, the hand on
 * the sky, and the frame loop. React only draws the chrome around it, from
 * snapshots handed out a few times a second; the clock in the dock and the
 * names in the sky are written straight into the page every frame.
 */

import { AU_KM, BODIES, KEYED, LIGHT_KM_S, RINGS, bodyById } from '../sky/bodies'
import type { Body, BodyId } from '../sky/bodies'
import { NEAR_MS, nearEclipse, stepTo, stepsFrom, withinEclipses } from '../sky/eclipses'
import type { Eclipse, EclipseSteps, EclipseType } from '../sky/eclipses'
import { PERIOD, TIME_MAX, TIME_MIN, orbitOf, posesAt } from '../sky/ephemeris'
import type { Poses, Vec3 } from '../sky/ephemeris'
import { presenceOf, smearOf } from '../sky/deep'
import { engulfed, sunAt, sunTint } from '../sky/sun'
import type { SunState } from '../sky/sun'
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
  cross,
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
import { globeAngles, planTravel, smoother, travelEye } from '../render/travel'
import type { Travel } from '../render/travel'
import { ORBIT_UNIT, Renderer } from '../render/gl'
import type { BodyDraw, OrbitDraw, Shade } from '../render/gl'
import { EARTH_CLOUDS, EARTH_NIGHT, SATURN_RING, STARS, SURFACE } from '../render/maps'
import { png } from '../../../src/photo/save'
import { isIdle } from '../../../src/ui/idle'
import { Tape } from './tape'
import type { Mark } from './tape'
import { DEAD, clockLabel, dayLabel, deepLabel, deepParts, dialOf, isDeep, momentLabel, notch, rateOf, speedSaid } from './time'

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
  /** The moment on the clock, UTC ms. */
  ms: number
  /** The bodies the Sun has taken by then. */
  gone: ReadonlySet<BodyId>
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

const DAY_MS = 86_400_000
const YEAR_MS = 365.2425 * DAY_MS
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
/** A second click this soon after the first, ms, near where it was, takes the body the first one picked: by then the view is already turning to it. */
const DOUBLE_MS = 500
/** The nearest a flight between bodies comes to any of them or their planets, radii: under the nearest a globe is seen from. */
const CLEAR = 1.05
/**
 * Scrolling in at the narrowest lens: a scroll that starts after a pause this
 * long, ms, is a new one and goes on into the body, so the tail of the one that
 * brought the lens to its end, a trackpad's fling, stops there.
 */
const PUSH_GAP_MS = 250
/** How far on the zoom axis the new scroll goes past the end before the eye goes in: two notches of a wheel. */
const PUSH = 0.3
/** A push left this long, ms, starts again from nothing. */
const PUSH_FORGET_MS = 1500
/** A star of 6.5, the faintest drawn, on a dark sky: what you are looking at never shows fainter. */
const FINDABLE = excess(6.5, DARK, 0)
/** The nearest the haze round a light is reckoned, radians as the eye sees the widest lens. */
const HAZE = (0.5 * Math.PI) / 180
/** Points a lit disc is sampled at, for how much of it is on screen. */
const SAMPLES = 64
const GOLDEN = Math.PI * (3 - Math.sqrt(5))
/** How strongly where a body may be along its path glows, at its most. */
const ARC = 0.5
/** Whose name stays when two would run into each other, after the one you are looking at. */
const BY_SIZE: BodyId[] = [...BODIES].sort((a, b) => b.radius - a.radius).map((b) => b.id)

interface Flight {
  from: Eye
  /** Where the eye started, from the centre of the body it was reckoned from, so the start moves with it. */
  fromSeat: BodyId
  rel: Vec3
  start: number
  ms: number
  /** When the lens starts to change, ms in, and when it is done. Without it the lens goes with the rest. */
  lens?: [number, number]
  /** Becoming a body: the way there, worked out when it set off. */
  travel?: Travel
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

/**
 * How likely a body is to be `x` radians along its orbit from where it would
 * be, a share a radian, its place known to `s` radians: a bell that wraps
 * round the orbit and, once wider than it, is even all the way round.
 */
export function spread(x: number, s: number): number {
  const t = x - 2 * Math.PI * Math.round(x / (2 * Math.PI))
  if (s > 1) {
    let d = 1
    for (let n = 1; n <= 4; n++) d += 2 * Math.exp((-n * n * s * s) / 2) * Math.cos(n * t)
    return d / (2 * Math.PI)
  }
  let d = 0
  for (let k = -1; k <= 1; k++) d += Math.exp(-(((t + 2 * Math.PI * k) / s) ** 2) / 2)
  return d / (s * Math.sqrt(2 * Math.PI))
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
  /** What adding a frame's time to the clock lost to rounding, put back the next: a billion years out a ms is far below what it can hold. */
  private carry = 0
  /** The Sun at the time, the bodies it has taken, and how far off along its orbit each body may be, radians. */
  private sun: SunState = sunAt(this.ms)
  private gone = new Set<BodyId>()
  private smears = new Map<BodyId, number>()
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
  /** How far past where it was kept a swelling Sun has pushed the eye, and the distance it left the eye at. */
  private pushed = { by: 0, at: 0 }
  private yaw = 0
  private pitch = 0.3
  private flight: Flight | null = null
  /** The way the eye faced a frame before, and when the last frame was: how fast the view is turning. */
  private before: { forward: Vec3; at: number } | null = null
  private drawnAt = -Infinity
  /** Travel arrives at once for anyone who has asked for less motion. */
  private still = window.matchMedia('(prefers-reduced-motion: reduce)')
  /** A dock this narrow has the clock's short reading far from now (ui.css). */
  private narrow = window.matchMedia('(max-width: 759px)')
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
  private clockEls: { clock: HTMLElement; day: HTMLElement; time: HTMLElement } | null = null
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
  /** The body the last click picked, where and when. */
  private clicked: { id: BodyId; x: number; y: number; at: number } | null = null
  /** When the last scroll came, ms, and how far a new one has gone past the narrowest lens; null when none has. */
  private wheelAt = -Infinity
  private push: number | null = null
  /** The scroll that went into a body, swallowed till it ends. */
  private held = false
  private tape = new Tape()
  /** Where on the tape the clock is, 1 its newest moment. Below 1 only while paused or scrubbing. */
  private back = 1
  private scrubbing = false
  private resumeAfterScrub = false
  /** A date is being picked: a clock faster than real time waits for it. */
  private holding = false
  private announce = ''
  private observer: ResizeObserver

  constructor(canvas: HTMLCanvasElement, labels: HTMLElement) {
    this.canvas = canvas
    this.labels = labels
    this.renderer = new Renderer(canvas)
    this.poses = posesAt(this.ms)
    this.reckon()
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
    ;(window as unknown as { __travel?: unknown }).__travel = { // travel-probe
      eye: () => this.eye, // travel-probe
      rest: () => this.restingEye(), // travel-probe
      seat: () => this.seat, // travel-probe
      look: () => this.look, // travel-probe
      flight: () => this.flight, // travel-probe
      angles: () => ({ yaw: this.yaw, pitch: this.pitch, zg: this.zg, z: this.z }), // travel-probe
      body: (id: BodyId) => ({ at: this.at(id), radius: this.radius(id) }), // travel-probe
      screen: (id: BodyId) => (this.frame ? project(this.frame, norm(sub(this.at(id), this.eye.at)), this.width, this.height) : null), // travel-probe
      become: (id: BodyId) => this.become(id), // travel-probe
      lookAt: (id: BodyId) => this.lookAt(id), // travel-probe
      clock: (playing: boolean) => (this.playing = playing), // travel-probe
      globe: (yaw: number, pitch: number) => ((this.yaw = yaw), (this.pitch = pitch)), // travel-probe
    } // travel-probe
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

  attachClock(clock: HTMLElement | null, day: HTMLElement | null, time: HTMLElement | null): void {
    this.clockEls = clock && day && time ? { clock, day, time } : null
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
    if (this.playing && !(this.holding && this.dial !== 0)) {
      const add = (this.dial === 0 ? real : dt * 1000 * rateOf(this.dial)) - this.carry
      const next = this.ms + add
      this.carry = next - this.ms - add
      if (next <= TIME_MIN || next >= TIME_MAX) {
        this.ms = Math.max(TIME_MIN, Math.min(TIME_MAX, next))
        this.carry = 0
        this.playing = false
        this.touch('The clock has reached the end of its range')
      } else this.ms = next
      this.tape.record(dt, this.ms)
    }
    this.poses = posesAt(this.ms)
    this.reckon()
    this.before = { forward: this.eye.forward, at: this.drawnAt }
    this.eye = this.flownEye(now)
    this.drawnAt = now
    this.frame = frameOf(this.eye, this.width / this.height)
    this.fade()
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
      orbits: this.orbitDraws(paths),
      glare,
      lens: gain(power),
      clock: now / 1000,
      // A white dwarf is a twentieth of the Sun's size and less.
      sun: { tint: sunTint(this.sun.temperature), cells: this.cells(), calm: 1 - smoothstep(0.025, 0.1, this.sun.radius / 695_700) },
    })
  }

  /**
   * How many of the Sun's granules go round it. They are as wide as its gas
   * is deep, which goes as its warmth over the pull at its surface: a few
   * hundred thousand now, a few dozen on a red giant, as Betelgeuse has.
   */
  private cells(): number {
    const { radius, temperature, mass } = this.sun
    return 900 * mass * (695_700 / radius) * (5772 / temperature)
  }

  /**
   * The sky as it is, without the names on it, which live in the page, or the
   * paths, though it keeps the glow where a body may be. The last frame is
   * drawn again so the picture is taken before it is shown.
   */
  photo(): Promise<Blob> {
    this.draw(this.last, 0)
    return png(this.canvas)
  }

  /** The date and time; far from now, the years from now, in full or, on a narrow dock, short and in two. */
  private writeClock(): void {
    if (!this.clockEls) return
    const { clock, day, time } = this.clockEls
    const deep = isDeep(this.ms)
    const [a, b] = !deep ? [dayLabel(this.ms), clockLabel(this.ms)] : this.narrow.matches ? deepParts(this.ms) : [deepLabel(this.ms), '']
    // Not a class, which the dock sets its own.
    clock.toggleAttribute('data-deep', deep)
    if (day.textContent !== a) day.textContent = a
    if (time.textContent !== b) time.textContent = b
  }

  // ------------------------------------------------------------ eye

  private at(id: BodyId): Vec3 {
    return this.poses[id].at
  }

  private radius(id: BodyId): number {
    return id === 'sun' ? this.sun.radius : (bodyById(id) as Body).radius
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
    if (now - f.start >= Math.max(f.ms, f.lens?.[1] ?? 0)) {
      this.flight = null
      return to
    }
    if (f.travel) return this.travelled(f, f.travel, now)
    const t = (now - f.start) / f.ms
    const p = smoother(t)
    const seat = this.at(this.seat)
    let at: Vec3
    const pl = f.lens ? smoother((now - f.start - f.lens[0]) / (f.lens[1] - f.lens[0])) : p
    let fov = Math.exp(Math.log(f.from.fov) + (Math.log(to.fov) - Math.log(f.from.fov)) * pl)
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
      at = this.clear(add(add(from, scale(way, p)), scale(lift, 0.3 * len(way) * arc)), [f.fromSeat, this.seat])
      fov = Math.exp(Math.log(fov) + (Math.log(FOV) - Math.log(fov)) * arc * 0.85)
      turn = smoother((t - 0.3) / 0.7)
    }
    const [forward, up] = turnTo(f.from, to, turn)
    return { at, forward, up, fov }
  }

  /** The eye on its way to the seat. It goes over the planets either end goes round, and the Sun, should the line pass through one. */
  private travelled(f: Flight, tr: Travel, now: number): Eye {
    const eye = travelEye(tr, now - f.start, this.at(f.fromSeat), this.at(this.seat))
    const ends = [f.fromSeat, this.seat]
    const near = ends.map((id) => bodyById(id)?.parent ?? 'sun').filter((id) => !ends.includes(id))
    const at = this.clear(eye.at, near)
    if (at === eye.at) return eye
    const forward = norm(sub(this.at(this.seat), at))
    return { ...eye, at, forward, up: across(eye.up, forward, NORTH) }
  }

  /** A point on a flight lifted to just over any of these bodies, or the planets they go round, that it would be inside. */
  private clear(at: Vec3, ids: BodyId[]): Vec3 {
    for (const id of ids) {
      for (const b of [id, bodyById(id)?.parent]) {
        if (!b) continue
        const c = this.at(b)
        const off = sub(at, c)
        const keep = CLEAR * this.radius(b)
        if (len(off) < keep) at = add(c, scale(norm(off), keep))
      }
    }
    return at
  }

  /** A flight to wherever the eye now rests, reckoned from `round`: the seat, or a body the eye goes straight into. */
  private fly(ms: number, round: BodyId = this.seat, lens?: [number, number]): void {
    this.dived = null
    this.push = null
    this.flight = {
      from: this.eye,
      fromSeat: round,
      rel: sub(this.eye.at, this.at(round)),
      start: performance.now(),
      ms,
      lens,
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
    if (this.gone.has(id)) return this.touch(`The Sun has taken ${(bodyById(id) as Body).name}`)
    if (id === this.look) {
      // Looking at it again, after swinging away, brings it back to the middle.
      if (id !== this.seat && (this.swing !== 0 || this.rise !== 0)) {
        this.fly(700)
        this.swing = 0
        this.rise = 0
      }
      return
    }
    this.look = id
    if (id === this.seat) {
      this.fly(900)
      this.enterGlobe()
    } else {
      // The lens waits until the turn is well under way, so a second click
      // that makes this a trip there finds it as it was.
      this.fly(900, this.seat, [500, 1250])
      this.z = this.zoomFor(this.seat, id)
      this.settle()
    }
    this.touch(`Looking at ${(bodyById(id) as Body).name}`)
    this.emit(true)
  }

  /**
   * Become a body: travel there and look at its globe, the whole of it in the
   * frame. Picking the body you are on brings its globe back to that view.
   */
  become(id: BodyId): void {
    if (this.gone.has(id)) return this.touch(`The Sun has taken ${(bodyById(id) as Body).name}`)
    if (id === this.seat) {
      // Already on the way there.
      if (this.flight?.travel) return
      if (this.look !== id) this.lookAt(id)
      else {
        this.fly(700)
        this.enterGlobe()
        this.touch(`Back over ${(bodyById(id) as Body).name}`)
        this.emit(true)
      }
      return
    }
    this.travel(id)
    this.touch(`On ${(bodyById(id) as Body).name}`)
    this.emit(true)
  }

  /**
   * Turn to a body and go straight to it, coming to rest over its globe on
   * the side you came from, or its day side. The globe is set to where the
   * way ends from the start, so the last step of it is where the eye rests.
   */
  private travel(id: BodyId): void {
    const from = this.seat
    const target = this.at(id)
    const r = this.radius(id)
    const reach = GLOBE * Math.exp(this.globeFit(id)) * r
    const sun = id === 'sun' ? null : this.at('sun')
    const tr = planTravel(this.eye, this.spin(), this.at(from), this.radius(from), target, sun, reach)
    const end = globeAngles(target, r, add(target, scale(tr.side, tr.reach)))
    this.seat = id
    this.look = id
    this.yaw = end.yaw
    this.pitch = end.pitch
    this.zg = end.zg
    this.fly(tr.ms, from)
    const f = this.flight as Flight
    // It sets off from the eye last drawn, so its clock starts then too.
    if (f.start - this.drawnAt < 100) f.start = this.drawnAt
    if (this.still.matches) this.flight = null
    else f.travel = tr
  }

  /** How fast the view is turning, radians a ms about the axis it turns round. Still after a pause. */
  private spin(): Vec3 {
    const b = this.before
    const dt = this.drawnAt - (b?.at ?? -Infinity)
    if (!b || !(dt > 0 && dt < 100)) return [0, 0, 0]
    return scale(cross(b.forward, this.eye.forward), 1 / dt)
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
    this.zg = this.globeFit(this.seat)
  }

  /**
   * How far back on a globe all of the body fits across the narrower side of
   * the frame, Saturn's rings too, with a tenth to spare. Never nearer than
   * the globe is first seen from, so a wide screen keeps that view.
   */
  private globeFit(id: BodyId): number {
    const r = this.radius(id)
    const reach = id === 'saturn' ? RINGS.outer : r
    // On the plane, half a body seen a across is tan(a / 4), half the frame tan(fov / 4).
    const half = 0.9 * Math.tan(FOV / 4) * Math.min(1, this.width / this.height)
    const back = reach / Math.sin(2 * Math.atan(half))
    return Math.max(id === 'sun' ? 0.6 : 0, Math.min(zgMax(r), Math.log(back / (GLOBE * r))))
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
    this.carry = 0
    this.tape.jump(this.ms)
    this.dial = 0
    this.playing = true
    this.touch('Now, at real speed')
    this.emit(true)
  }

  /** To a date set in the drawer, worked out from the moment the clock is on, as it goes on as it was. False if that is where it is. */
  goTo(way: (ms: number) => number): boolean {
    const to = Math.max(TIME_MIN, Math.min(TIME_MAX, way(this.ms)))
    if (to === this.ms) return false
    this.branch()
    this.ms = to
    this.carry = 0
    this.tape.jump(to)
    this.eclipses.from = NaN
    this.touch(momentLabel(to))
    this.emit(true)
    return true
  }

  hold(on: boolean): void {
    this.holding = on
  }

  /** Arrive a little before an eclipse, placed to watch it happen. */
  watch(e: Eclipse): void {
    const solar = e.type === 'solar'
    this.branch()
    this.ms = e.peak - (solar ? 90 : 120) * 60_000
    this.carry = 0
    this.tape.jump(this.ms)
    this.tape.know(e)
    this.dial = dialOf(10 * 60)
    this.playing = true
    // From the eye as it stands, taken at the old moment, before the bodies move.
    this.fly(1600)
    this.poses = posesAt(this.ms)
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
    this.carry = 0
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
      this.land()
      // Grabbing the globe, slower near the ground so it keeps up with the hand.
      const k = 0.005 * Math.min(1, (GLOBE * Math.exp(this.zg) - 1) / (GLOBE - 1))
      this.yaw -= dx * k
      this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, this.pitch + dy * k))
      this.arrive()
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
      const c = this.clicked
      const again = c && e.timeStamp - c.at < DOUBLE_MS && Math.hypot(e.clientX - c.x, e.clientY - c.y) < PICK_PX
      const hit = again ? c.id : this.pick(e.clientX, e.clientY)
      if (!hit) return
      if (!again) this.clicked = { id: hit, x: e.clientX, y: e.clientY, at: e.timeStamp }
      this.lookAt(hit)
    }
  }

  private onDouble = (e: MouseEvent): void => {
    const c = this.clicked
    const hit = c && e.timeStamp - c.at < DOUBLE_MS ? c.id : this.pick(e.clientX, e.clientY)
    // On the globe you are circling, a double-click on it keeps the view you have.
    if (hit && !(hit === this.seat && this.look === this.seat)) this.become(hit)
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const k = e.deltaMode === 1 ? 0.06 : 0.002
    const step = e.deltaY * k
    const gap = e.timeStamp - this.wheelAt
    this.wheelAt = e.timeStamp
    if (this.held && gap <= PUSH_GAP_MS) return
    this.held = false
    if (step === 0) return
    const r = this.radius(this.seat)
    const rect = this.canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    // Scrolling on without moving from where the eye went down to the globe
    // goes straight in, to the ground that was pointed at.
    if (this.dived && Math.hypot(x - this.dived[0], y - this.dived[1]) > CLICK_PX) this.dived = null
    const away = this.seat === this.look && this.land()
    const under = this.dived || away ? null : this.underPointer(x, y)
    if (this.seat === this.look) {
      this.push = null
      this.zg = Math.max(ZG_MIN, Math.min(zgMax(r), this.zg + step))
      if (under) this.keepUnder(under)
      this.arrive()
    } else if (under && step < 0) this.dive(under, step, x, y)
    else if (step < 0 && this.z <= Z_MIN && !this.flight) {
      if (this.push === null ? gap > PUSH_GAP_MS : gap > PUSH_FORGET_MS) this.push = 0
      if (this.push === null) return
      this.push -= step
      if (this.push < PUSH) return
      const into = this.passTarget(e.clientX, e.clientY, rect)
      if (!into) return
      this.passInto(into)
      this.held = true
    } else {
      this.push = null
      this.z = Math.max(Z_MIN, Math.min(zMax(r), this.z + step))
    }
  }

  /**
   * A hand on the globe while on the way to it. Nearly there, the globe is
   * taken from wherever the eye has got to. Further out the way carries on,
   * and the hand moves where it ends: true then.
   */
  private land(): boolean {
    const tr = this.flight?.travel
    if (!tr) return false
    const r = this.radius(this.seat)
    if (len(sub(this.eye.at, this.at(this.seat))) > 3 * tr.reach) return true
    const a = globeAngles(this.at(this.seat), r, this.eye.at)
    this.yaw = a.yaw
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, a.pitch))
    this.zg = Math.max(ZG_MIN, Math.min(zgMax(r), a.zg))
    this.fly(500)
    return false
  }

  /** The end of the way there, moved to where the globe's yaw, pitch and zoom now put the eye. */
  private arrive(): void {
    const tr = this.flight?.travel
    if (!tr) return
    const c = this.at(this.seat)
    const to = sub(globeEye(c, this.radius(this.seat), this.zg, this.yaw, this.pitch).at, c)
    tr.side = norm(to)
    tr.reach = len(to)
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

  /**
   * What a scroll past the narrowest lens goes into: the body under the
   * pointer, or else the one looked at if it is in the frame. The eye goes
   * straight at its middle, so a nearer body in front of that is met first,
   * and if that is the seat, nothing is.
   */
  private passTarget(cx: number, cy: number, rect: DOMRect): BodyId | null {
    const hit = this.pick(cx, cy, rect)
    const aim = hit && hit !== this.seat ? hit : this.look
    const p = this.placed.get(aim)
    if (!p) return null
    if (aim !== hit && !(p.x >= 0 && p.x <= this.width && p.y >= 0 && p.y <= this.height)) return null
    let into = aim
    let d = p.d
    for (const [id, o] of this.placed) {
      if (o.d >= d || id === aim || angle(o.dir, p.dir) >= o.ang) continue
      into = id
      d = o.d
    }
    return into === this.seat ? null : into
  }

  /**
   * Scrolled on past the narrowest lens: the eye goes on into the body, along
   * the way it was looking, to its globe on the side it was seen from. It comes
   * to rest with the whole globe in the frame, or as near as the middle of the
   * body already looked if that is nearer.
   */
  private passInto(id: BodyId): void {
    const rel = sub(this.eye.at, this.at(id))
    const d = len(rel)
    const r = this.radius(id)
    // The ground in the middle as large in the globe's lens as in this one: it
    // is d - r away, and a lens magnifies it as 1 / tan(fov / 4). Matching the
    // outline instead lands a body wider than the lens on its ground.
    const back = 1 + ((d / r - 1) * Math.tan(this.eye.fov / 4)) / Math.tan(FOV / 4)
    this.fly(1300 + 260 * Math.max(0, Math.log10(d / 1e5)), id)
    this.seat = id
    this.look = id
    const n = norm(rel)
    this.yaw = Math.atan2(n[1], n[0])
    this.pitch = Math.max(-PITCH_MAX, Math.min(PITCH_MAX, Math.asin(n[2])))
    this.zg = Math.max(ZG_MIN, Math.min(this.globeFit(id), Math.log(back / GLOBE)))
    this.touch(`On ${(bodyById(id) as Body).name}`)
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

  /**
   * The Sun at the time, the bodies it has taken, and how well each body's
   * place along its orbit is known. Should it take the body you are on, you
   * go to it, and if the one you are looking at, you look at it instead.
   */
  private reckon(): void {
    const was = this.sun.radius
    this.sun = sunAt(this.ms)
    // Over the Sun, the eye keeps its distance as it swells or shrinks: pushed
    // out ahead of it as it swells, and back to where it was as it shrinks.
    // Moving the eye, or leaving the Sun, keeps it where it now is.
    if (this.seat !== 'sun' || this.zg !== this.pushed.at) this.pushed.by = 0
    if (this.seat === 'sun' && this.sun.radius !== was) {
      const want = this.zg + Math.log(was / this.sun.radius) - this.pushed.by
      this.zg = Math.max(ZG_MIN, Math.min(zgMax(this.sun.radius), want))
      this.pushed = { by: this.zg - want, at: this.zg }
    }
    this.gone.clear()
    for (const b of BODIES) {
      if (engulfed(b.id, this.ms)) this.gone.add(b.id)
      this.smears.set(b.id, smearOf(b.id, this.ms))
    }
    const taken = this.gone.has(this.seat) ? this.seat : this.gone.has(this.look) ? this.look : null
    if (!taken) return
    if (taken === this.seat) this.travel('sun')
    else this.lookAt('sun')
    this.touch(`The Sun has taken ${(bodyById(taken) as Body).name}`)
    this.emit(true)
  }

  /**
   * How much of a body is at its place, 0 to 1: none once it could be
   * anywhere along its orbit, or a moon's planet could. The sky is seen from
   * where the seat is taken to be, so the seat, and the planet it goes round,
   * are always there.
   */
  private presence(id: BodyId): number {
    const parent = bodyById(id)?.parent
    const seatParent = bodyById(this.seat)?.parent
    if (this.gone.has(id)) return 0
    if (id === this.seat || id === seatParent) return 1
    const own = presenceOf(this.smears.get(id) ?? 0)
    return parent && parent !== this.seat && parent !== seatParent ? own * this.presence(parent) : own
  }

  /**
   * How much of each body shows. Moons too near their planet on screen to
   * tell apart from it fold into its point, never the seat or the target.
   */
  private fade(): void {
    const eye = this.eye.at
    for (const b of BODIES) {
      let f = this.presence(b.id)
      if (b.parent && b.id !== this.seat && b.id !== this.look) {
        const p = sub(this.at(b.parent), eye)
        const px = this.pixel(p)
        const big = Math.asin(Math.min(1, this.radius(b.parent) / len(p))) / px
        const apart = angle(p, sub(this.at(b.id), eye)) / px
        f *= Math.max(smoothstep(2, 6, big), smoothstep(2.5, 6, apart))
      }
      this.fades.set(b.id, f)
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
      .filter((m) => this.presence(m.id) >= 0.5)
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
        out.set(b.id, sunMagnitude(d / AU_KM, this.sun.luminosity))
        continue
      }
      const toSun = sub(sunAt, at)
      let rings = 0
      if (b.id === 'saturn') {
        const pole = this.poses.saturn.z
        rings = ringsMagnitude(Math.asin(dot(pole, toEye) / d), Math.asin(dot(pole, toSun) / len(toSun)))
      }
      out.set(b.id, magnitude(b.id, b.radius, d, len(toSun) / AU_KM, angle(toSun, toEye), this.sunlit(b), rings, this.sun.luminosity))
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
    // What is not at its place blocks no light.
    const discs = BODIES.map((b) => {
      const rel = sub(this.at(b.id), eye)
      const d = len(rel)
      return { dir: scale(rel, 1 / d), d, cos: this.presence(b.id) < 0.5 ? 2 : Math.cos(Math.asin(Math.min(1, this.radius(b.id) / d))) }
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
      const k = glareOf(luxOf(mags.get(b.id) as number) * (isSun ? seen : this.presence(b.id)), power)
      if (k < 0.3 * DARK * near * near) continue
      const at = this.at(b.id)
      const rel = sub(at, eye)
      const d = len(rel)
      const dir = scale(rel, 1 / d)
      const R = this.radius(b.id)
      const ang = Math.asin(Math.min(1, R / d))
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
            const t = d * c - Math.sqrt(Math.max(0, R * R - d * d * s * s))
            const n = scale(sub(scale(r, t), rel), 1 / R)
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
    const tint = sunTint(this.sun.temperature)
    for (const b of BODIES) {
      if (this.gone.has(b.id)) continue
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
      const c = b.id === 'sun' ? [tint[0], 0.92 * tint[1], 0.78 * tint[2]] : pale(rgb(b.color))
      out.push({
        id: b.id,
        shade: SHADES[b.id] ?? 'moon',
        rel,
        radius: this.radius(b.id),
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
      if (b.id === 'sun' || this.presence(b.id) < 0.5) continue
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
    // A moon's is worked out once there is a line or a glow to draw, and
    // again a few laps on. The Moon's is pulled about by the Sun, so it is
    // redone every few hours of the clock. One a frame, ten a second at most.
    if (now - this.localAt < 100) return
    for (const b of BODIES) {
      if (!b.parent || (this.localInk(b) <= 0 && this.localGlow(b) <= 0)) continue
      const o = this.locals.get(b.id)
      const life = b.id === 'moon' ? 6 * 3.6e6 : 4 * (PERIOD[b.id] ?? 0) * DAY_MS
      if (o && Math.abs(this.ms - o.centre) <= life) continue
      this.locals.set(b.id, { id: b.id, centre: this.ms, points: orbitOf(b.id, this.ms, LAP) })
      this.localAt = now
      return
    }
  }

  /** How wide a moon's path is on screen, px from its planet. */
  private localSize(b: Body): number {
    const planet = this.at(b.parent as BodyId)
    const px = this.pixel(sub(planet, this.eye.at))
    return len(sub(this.at(b.id), planet)) / (len(sub(planet, this.eye.at)) * px)
  }

  /**
   * How strongly a moon's path is drawn: once it is big enough on screen to
   * be a path, and like the planets' faded through a narrow lens, unless the
   * whole of it is in view. Not round a planet whose own place is lost.
   */
  private localInk(b: Body): number {
    const r = this.localSize(b)
    const look = b.id === this.look
    const wide = smoothstep(0.15, 0.7, this.eye.fov)
    const whole = 1 - smoothstep(1, 3, r / (Math.max(this.width, this.height) / 2))
    const there = this.presence(b.parent as BodyId) * (this.gone.has(b.id) ? 0 : 1)
    return (look ? 0.26 : 0.14) * smoothstep(8, 24, r) * Math.max(look ? 0.35 + 0.65 * wide : wide, whole) * there
  }

  /**
   * How strongly the glow of where a body may be along its path shows: from
   * when that is known only to a few degrees, at full by the time the body
   * itself starts to go.
   */
  private glowOf(id: BodyId): number {
    const b = bodyById(id) as Body
    // Not for where the sky is seen from, which is taken to be where it is.
    if (this.gone.has(id) || id === this.seat || id === bodyById(this.seat)?.parent) return 0
    const ink = ARC * smoothstep(0.02, 0.06, this.smears.get(id) ?? 0)
    return b.parent ? ink * this.presence(b.parent) : ink
  }

  /** A moon's, once its path is wide enough on screen. */
  private localGlow(b: Body): number {
    const g = this.glowOf(b.id)
    return g > 0 ? g * smoothstep(4, 12, this.localSize(b)) : 0
  }

  private orbitDraws(shown: number): OrbitDraw[] {
    const eye = this.eye.at
    const out: OrbitDraw[] = []
    const wide = smoothstep(0.15, 0.7, this.eye.fov)
    // The path at `ink`, and over it, at `glow`, how likely the body is to be
    // at each point: a bell round where it would be, wider as its place is
    // less well known, until it is a ring.
    const line = (o: Orbit, base: Vec3, ink: number, glow: number): void => {
      if (ink <= 0 && glow <= 0) return
      // Fade where the line passes close by the eye: up close it is no longer a path, just a stroke.
      const near = base === ORIGIN ? 4e6 : 0.065 * Math.hypot(o.points[0], o.points[1], o.points[2])
      const smear = this.smears.get(o.id) ?? 0
      const lap = (PERIOD[o.id] ?? 1) * DAY_MS
      // Where the body is along the lap, in its points: the middle one when it was worked out.
      const now = (LAP - 1) / 2 + (((this.ms - o.centre) / lap) % 1) * (LAP - 1)
      const points: number[] = []
      const alpha: number[] = []
      const likely: number[] = []
      const put = (p: Vec3, i: number): void => {
        const a = smoothstep(near, 4 * near, len(p))
        points.push(p[0] / ORBIT_UNIT, p[1] / ORBIT_UNIT, p[2] / ORBIT_UNIT)
        alpha.push(a)
        if (glow > 0) likely.push(a * Math.min(1, 2.2 * spread(((i - now) / (LAP - 1)) * 2 * Math.PI, smear)))
      }
      let last: Vec3 | null = null
      for (let i = 0; i < LAP; i++) {
        const p: Vec3 = [o.points[i * 3] + base[0] - eye[0], o.points[i * 3 + 1] + base[1] - eye[1], o.points[i * 3 + 2] + base[2] - eye[2]]
        // The screen draws a straight line between two points, but a straight
        // path is curved on the stereographic plane: a step that crosses much
        // of the sky, as one passing near the eye does, is broken up.
        if (last && Math.max(len(last), len(p)) > near) {
          const steps = Math.ceil(angle(last, p) / STEP)
          for (let k = 1; k < steps; k++) put(add(last, scale(sub(p, last), k / steps)), i - 1 + k / steps)
        }
        put(p, i)
        last = p
      }
      const xyz = new Float32Array(points)
      const count = alpha.length
      if (ink > 0) out.push({ points: xyz, alpha: new Float32Array(alpha), count, ink })
      if (glow > 0) out.push({ points: xyz, alpha: new Float32Array(likely), count, ink: glow, color: pale(rgb((bodyById(o.id) as Body).color)), glow: true })
    }
    // Paths are a map: through a narrow lens they are clutter, so only the
    // one through what you are looking at stays, and that faintly. The glows
    // are where the bodies are, so they stay whatever the lens, and in a picture.
    for (const o of this.orbits) {
      if (this.gone.has(o.id)) continue
      const ink = o.id === this.look ? 0.26 * (0.35 + 0.65 * wide) : 0.14 * wide
      line(o, ORIGIN, ink * shown, this.glowOf(o.id))
    }
    for (const o of this.locals.values()) {
      const b = bodyById(o.id) as Body
      line(o, this.at(b.parent as BodyId), this.localInk(b) * shown, this.localGlow(b))
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
      // A body that is not at its place, or no more, hides nothing.
      const there = !this.gone.has(b.id) && (this.fades.get(b.id) ?? 1) >= 0.5
      discs.push({ id: b.id, dir: scale(rel, 1 / d), ang: there ? Math.asin(Math.min(1, this.radius(b.id) / d)) : 0, d })
    }
    for (const disc of discs) {
      const at = project(fr, disc.dir, this.width, this.height)
      const r = disc.ang / pixelAngle(fr, disc.dir, this.height)
      if (r > 1.5 || disc.id === this.seat || disc.id === this.look) this.loadMap(disc.id)
      // What you are looking at keeps its name while it is only a glow along its path.
      const seen = disc.id === this.look || (this.fades.get(disc.id) ?? 1) >= 0.5
      let shown = at !== null && disc.id !== this.seat && r < 26 && seen && !this.gone.has(disc.id)
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
    // Past their years, the clock is held at the nearer end, so they are not looked for again and again.
    const ms = withinEclipses(this.ms)
    const stale =
      Number.isNaN(e.from) ||
      ms < e.from ||
      (e.solar !== null && ms >= e.solar.peak + NEAR_MS) ||
      (e.lunar !== null && ms >= e.lunar.peak + NEAR_MS)
    if (stale && (Number.isNaN(e.from) || now - e.at > 500)) {
      try {
        this.eclipses = { solar: nearEclipse('solar', ms), lunar: nearEclipse('lunar', ms), from: ms, at: now }
        for (const next of [this.eclipses.solar, this.eclipses.lunar]) if (next) this.tape.know(next)
      } catch {
        this.eclipses = { solar: null, lunar: null, from: ms, at: now }
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
      const alt = len(sub(this.at(seat.id), eye)) - this.radius(seat.id)
      const fromSun = len(this.at(seat.id))
      rows.push(['Above', distanceLabel(Math.max(0, alt))])
      if (seat.id !== 'sun') {
        rows.push(['Sun', distanceLabel(fromSun)])
        rows.push(['Sunlight', lightLabel(fromSun)])
        rows.push(['Noon', luxLabel(noonLux(fromSun / AU_KM, this.sun.luminosity))])
      }
      rows.push(['Radius', `${Math.round(this.radius(seat.id)).toLocaleString('en-US')} km`])
    } else if (this.presence(look.id) < 0.5) {
      // Where it is along its path is not known, only how far round what it goes round.
      rows.push(['Orbit', distanceLabel(len(sub(this.at(look.id), this.at(look.parent ?? 'sun'))))])
    } else {
      const d = len(sub(this.at(look.id), this.at(seat.id)))
      const rel = sub(this.at(look.id), eye)
      const across = 2 * Math.asin(Math.min(1, this.radius(look.id) / len(rel)))
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
      moment: momentLabel(this.ms),
      ms: this.ms,
      gone: new Set(this.gone),
    }
  }
}

