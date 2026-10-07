/*
 * The instrument: the body, the net, the particles, the camera and the clock,
 * and the pointer gestures on the room. React only draws the chrome around it
 * and reads a snapshot.
 */

import {
  PRESETS,
  effectiveRadius,
  exaggeration,
  fieldFor,
  formatClock,
  formatExaggeration,
  formatLength,
  formatMass,
  presetById,
  schwarzschild,
  surfaceClock,
} from '../physics/bodies'
import type { Field, Preset } from '../physics/bodies'
import {
  FORECAST_TICKS,
  SNAP_PX,
  circleDrag,
  circleOffered,
  circleVelocity,
  dotsAlong,
  fateOf,
  runTrace,
  snapTo,
  startTrace,
  tangentAt,
} from '../physics/aim'
import type { Fate, Trace } from '../physics/aim'
import { buildNet, deform, detailFor, radialMap } from '../physics/lattice'
import type { Net, RadialMap } from '../physics/lattice'
import {
  circularSpeed,
  clockRate,
  cross,
  dot,
  len,
  lightSpeedSeen,
  localSpeed,
  makeLight,
  makeProbe,
} from '../physics/motion'
import type { Kind, Mover, Vec3 } from '../physics/motion'
import { OrbitCamera, matricesOf, mixView, normalize, project, ray } from '../render/camera'
import type { Matrices, View } from '../render/camera'
import { BEAM_STRIDE, POINT_STRIDE, Renderer } from '../render/gl'
import type { ImpactDraw, SeatDraw } from '../render/gl'
import { SURFACES } from '../render/maps'
import { DT, ESCAPE_R, HISTORY_FRAMES, World } from '../sim/world'
import { png } from '../../../src/photo/save'
import { grainOf, litSurface } from '../../../src/photo/surface'
import type { Particle } from '../sim/world'

/** Log10 bounds of the two body sliders, kg and m. M87* sits inside both. */
export const MASS_LOG = [22, 41] as const
export const SIZE_LOG = [3, 14] as const

/** A second press this soon and this close is a double-click. */
const DOUBLE_MS = 320
const DOUBLE_PX = 12
/** A fingertip is less exact, and the aim starts with a double-tap. */
const DOUBLE_TOUCH_PX = 24
const CLICK_PX = 5
const TURN_PER_PX = 0.006
/** Rad per second the room turns by itself once nobody is touching it. */
const IDLE_TURN = 0.05
const IDLE_MS = 2400
const HIT_PX = 14

/** Probe trail: a dot every 0.1 s for 4 s. Light: a streak for 1.5 s, this wide at the front. */
const DOT_STRIDE = 6
const DOT_COUNT = 40
const LIGHT_FRAMES = 90
const BEAM_PX = 3.2
/**
 * The aim's forecast: up to this many dots, and this many ticks stepped a
 * frame, so a wide orbit takes a few frames rather than one long one.
 */
const FORECAST_DOTS = 1500
const FORECAST_CHUNK = 600
/** A photon's release is kept this far inside the screen's edge. */
const AIM_EDGE_PX = 28
/** The aim's tab sits this far out from the release, away from the body. */
const AIM_TAB_PX = 26
/** A press further out than this releases from here, toward the press. */
const REACH_PRESS = 8
/**
 * Light let go nearer than this starts this far out, on the same side, so a
 * ride has a run in to the pass. Let go without a drag, it heads for the body
 * and misses it by a throw of the dice: from this share of the closest pass
 * that gets away up to this many times it, mostly close, so about one in five
 * hits.
 */
const LIGHT_RUN = 5
const MISS_FROM = 0.9
const MISS_SPAN = 2.1
/** Ridden light on its way out past this is leaving the room, and the ride ends with it. */
const LIGHT_OUT = 6
/** Seconds the rings from a strike take to spread out and go. */
const RING_S = 1.6

/**
 * Riding. What is ridden is drawn as a ball this big, and the eye sits on it:
 * this many of its radii from its middle and this high (radians) above its
 * path, so the top of it fills the bottom of the screen, its top edge this far
 * from the middle of the screen to the bottom. The eye looks the way it is
 * going, turned in toward the body as it passes, by up to atan 0.8, about 39
 * degrees, so the body is in view round the turn. Wider than the room's lens,
 * so the net rushes past.
 */
const SEAT: Record<Kind, number> = { probe: 0.06, light: 0.04 }
const SEAT_BACK = 2.2
const SEAT_RISE = 0.75
const SEAT_LOW = 0.5
const LEAN = 0.8
const RIDE_FOV = (70 * Math.PI) / 180
/** Seconds to swing in or out, and for the eye to follow the path's turns. */
const SWING_S = 0.9
const TURN_LAG_S = 0.25
/**
 * Light crosses the room in about a second, so riding it slows the room to
 * this, easing in and out over about this many seconds.
 */
const LIGHT_RIDE_PACE = 0.25
const PACE_S = 0.4

/**
 * Light in the room: an uneven stream, each ray sent in along a rope of the net
 * from this far out, so it starts on the lattice and leaves it only where the
 * body bends it. Gaps in ticks, at most this many in flight, and ropes up to
 * this many units off the centre on either side.
 */
const LIGHT_FROM = 10
const LIGHT_GAP = [9, 45] as const
const LIGHT_FLYING = 6
const LIGHT_OFF = 4.5

/** Probe hues: the Lightbox roll without its amber, which is too near gold. */
const HUES: readonly Vec3[] = [
  [0.89, 0.34, 0.18],
  [0.18, 0.42, 1.0],
  [0.09, 0.64, 0.6],
  [0.7, 0.25, 0.56],
  [0.36, 0.55, 0.16],
  [0.82, 0.29, 0.36],
  [0.24, 0.35, 0.5],
]
/** Light is always gold, and nothing else in the room is. Deep enough to hold on white. */
const GOLD: Vec3 = [0.8, 0.58, 0.1]
/** The core at the front of a streak, where the light is. */
const HOT: Vec3 = [1, 0.72, 0.12]
const INK: Vec3 = [26 / 255, 30 / 255, 44 / 255]
/** Gold a step deeper for the forecast: drawn small, gold is the weakest hue on white. */
const FORECAST_GOLD: Vec3 = [0.7, 0.49, 0.05]
/** The ground, under the aim's marks, so they hold over the net and the body. */
const PAPER: Vec3 = [1, 1, 1]

export interface Snapshot {
  presetId: string | null
  name: string
  color: string
  hole: boolean
  massLog: number
  sizeLog: number
  kind: Kind
  riding: boolean
  playing: boolean
  expanded: boolean
  position: number
  filled: number
  readout: { mass: string; radius: string; clock: string; drawn: string }
  /** For the live region. */
  announce: string
}

function hexToVec(hex: string): Vec3 {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

/** Time scale, simulated units per second: a circular orbit at 4 takes ten
 * seconds, capped so light takes over a second to cross the room. */
function rateFor(rs: number): number {
  const v = Math.sqrt(rs / 8)
  const period = (2 * Math.PI * 4) / v
  return Math.min(9, period / 10)
}

interface Press {
  id: number
  x: number
  y: number
  t: number
  moved: boolean
  mode: 'turn' | 'aim'
  /** Aim: the release point in the room, and the drag so far. */
  origin?: Vec3
  dx?: number
  dy?: number
  /** Light: how far wide of the middle it goes if not dragged, and which way. */
  miss?: Vec3
  /** Aim: where the pointer was when it began, which the drag is measured from. */
  ax?: number
  ay?: number
  touch?: boolean
  /** Aim, probe: the target the drag is snapped to, or -1, and the drags for a circle. */
  snap?: number
  targets?: [number, number][]
  /** Click on a particle: its id, and whether this press toggled its hold. */
  toggled?: number
}

interface Ride {
  id: number
  kind: Kind
  /** The eye's frame, eased: along the path, and square to the plane of it. */
  along: Vec3
  normal: Vec3
  /** Looking round: angle about the seat from behind, height, and how far off in its radii. */
  yaw: number
  rise: number
  back: number
}

export class Instrument {
  private renderer: Renderer
  private camera = new OrbitCamera()
  private world = new World()
  private net: Net
  private shape: Float32Array
  private squeeze: Float32Array

  private mass: number
  private radius: number
  private frame: number
  private presetId: string | null
  private field: Field = { rs: 0, radius: 1, hole: false }
  private rate = 1
  private kind: Kind = 'probe'
  /** Where the net draws a rest point, for laying light on a rope. */
  private map: RadialMap = radialMap(0, 1)
  /** Ticks until the next ray, and dice thrown so far. */
  private wait = 0
  private dice = 0

  private playing = true
  private scrubbing = false
  private resumeAfterScrub = false
  /** Frames back from the newest that is on screen. 0 is now. */
  private back = 0

  private width = 1
  private height = 1
  private dpr = 1
  private raf = 0
  private last = 0
  private acc = 0
  private lastTouch = 0
  private reduced = false

  private view: View = this.camera.view()
  private mats: Matrices = matricesOf(this.view, 1)
  /** What is being ridden. A click on a probe waits out the double-click first. */
  private ride: Ride | null = null
  private pendingRide: { id: number; at: number } | null = null
  /** The view on screen when the eye last changed what it follows, and when. */
  private swing: { from: View; t0: number } | null = null
  /** What was just stepped off, still drawn as a ball while the eye swings away. */
  private left: number | null = null
  private seat: SeatDraw | null = null
  /** How fast the room runs, slowed while riding light. */
  private pace = 1

  private presses = new Map<number, Press>()
  private pinch: { d: number } | null = null
  private lastDown = { x: -999, y: -999, t: -999, toggled: undefined as number | undefined }
  private hover: { x: number; y: number } | null = null

  /**
   * The aim's forecast: the one being stepped, and the last finished one, which
   * is what is drawn, so the line never grows on screen. Two paths, swapped.
   */
  private aimLive: Trace | null = null
  private aimKey = ''
  private aimShown: { trace: Trace; fate: Fate } | null = null
  private aimPaths = [new Float32Array(3 * (FORECAST_TICKS + 1)), new Float32Array(3 * (FORECAST_TICKS + 1))]
  private aimScreen = new Float32Array(2 * (FORECAST_TICKS + 1))

  private points = new Float32Array(8192 * POINT_STRIDE)
  private beams = new Float32Array(12 * LIGHT_FRAMES * 6 * BEAM_STRIDE)

  private snap: Snapshot
  private listeners = new Set<() => void>()
  private announceText = ''

  private canvas: HTMLCanvasElement
  private tab: HTMLElement

  constructor(canvas: HTMLCanvasElement, tab: HTMLElement) {
    this.canvas = canvas
    this.tab = tab
    this.renderer = new Renderer(canvas)
    this.net = buildNet()
    this.shape = new Float32Array(this.net.rest.length)
    this.squeeze = new Float32Array(this.net.rest.length / 3)
    this.renderer.setNet(this.net)

    const fromHash = this.readHash()
    const preset = presetById(fromHash?.preset ?? 'sun') ?? PRESETS[2]
    this.presetId = fromHash?.preset ? preset.id : fromHash ? null : preset.id
    this.mass = fromHash?.mass ?? preset.mass
    this.radius = fromHash?.radius ?? Math.max(preset.radius, schwarzschild(preset.mass))
    this.frame = effectiveRadius(this.mass, this.radius)
    this.applyBody()
    this.seed()

    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    this.snap = this.makeSnapshot()
  }

  // ------------------------------------------------------------- lifecycle

  start(): void {
    this.resize()
    window.addEventListener('resize', this.resize)
    this.canvas.addEventListener('pointerdown', this.onDown)
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    this.canvas.addEventListener('pointerleave', this.onLeave)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })
    this.last = performance.now()
    this.lastTouch = this.last
    this.raf = requestAnimationFrame(this.frameLoop)
  }

  stop(): void {
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.resize)
    this.canvas.removeEventListener('pointerdown', this.onDown)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    this.canvas.removeEventListener('pointerleave', this.onLeave)
    this.canvas.removeEventListener('wheel', this.onWheel)
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Snapshot => this.snap

  private emit(): void {
    this.snap = this.makeSnapshot()
    for (const fn of this.listeners) fn()
  }

  private resize = (): void => {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.dpr = Math.min(2, window.devicePixelRatio || 1)
    this.renderer.resize(this.width, this.height, this.dpr)
  }

  // ------------------------------------------------------------------ body

  private applyBody(): void {
    this.dropAim()
    this.field = fieldFor(this.mass, this.radius, this.frame)
    this.rate = rateFor(this.field.rs)
    this.map = radialMap(this.field.rs, this.field.radius)
    deform(this.net, this.field.rs, this.field.radius, this.shape, this.squeeze)
    this.renderer.setShape(this.shape, this.squeeze)
    const surface = this.presetId ? SURFACES[this.presetId] : undefined
    if (surface) this.renderer.load(surface)
    this.writeHash()
  }

  /**
   * The room opens already moving: three probes on tilted planes, or in Photon,
   * the first ray of the stream.
   */
  private seed(): void {
    this.stepOff()
    this.dropAim()
    this.world.clear()
    this.back = 0
    this.wait = 0
    if (this.kind === 'light') {
      this.sendLight()
      return
    }
    const base = this.field.hole ? [3.6, 4.6, 6] : [2.4, 3.4, 4.6].map((r) => Math.max(r, this.field.radius + 0.6))
    const tilts = [0.35, -0.6, 1.1]
    base.forEach((r, i) => {
      const a = i * 2.1
      const t = tilts[i]
      const pos: Vec3 = [r * Math.cos(a), 0, r * Math.sin(a)]
      // Tangent in the xz plane, then tilted about the radius.
      const tan: Vec3 = [-Math.sin(a), 0, Math.cos(a)]
      const radial = normalize(pos)
      const dir = rotate(tan, radial, t)
      const v = circularSpeed(r, this.field.rs) * (i === 1 ? 0.88 : 1)
      this.world.add(makeProbe(pos, [dir[0] * v, dir[1] * v, dir[2] * v], this.field.rs))
    })
  }

  /**
   * In Photon, called every tick: after a random gap, a ray comes in along a
   * random rope, from either end of any of the three directions.
   */
  private sendLight(): void {
    if (this.wait-- > 0) return
    this.wait = LIGHT_GAP[0] + Math.floor(this.roll() * (LIGHT_GAP[1] - LIGHT_GAP[0]))
    const flying = this.world.slots.filter((p) => p !== null && p.kind === 'light' && p.fade === 0 && !p.held).length
    if (flying >= LIGHT_FLYING) return
    // Ropes sit on the half-steps. Never one straight through the body's middle.
    const steps = 2 * LIGHT_OFF + 1
    const near = Math.min(LIGHT_OFF, 0.6 * Math.max(this.field.radius, this.field.rs))
    let a = 0
    let b = 0
    do {
      a = Math.floor(this.roll() * steps) - LIGHT_OFF
      b = Math.floor(this.roll() * steps) - LIGHT_OFF
    } while (Math.hypot(a, b) < near)
    const axis = Math.floor(this.roll() * 3)
    const sign = this.roll() < 0.5 ? -1 : 1
    const rest: Vec3 = [0, 0, 0]
    const dir: Vec3 = [0, 0, 0]
    rest[axis] = -sign * LIGHT_FROM
    rest[(axis + 1) % 3] = a
    rest[(axis + 2) % 3] = b
    dir[axis] = sign
    // Where the net draws that point, so the ray starts on the drawn rope.
    const rho = len(rest)
    const k = this.map.radius(rho) / rho
    this.world.add(makeLight([rest[0] * k, rest[1] * k, rest[2] * k], dir))
  }

  /** The stream's dice: the same throws on every visit. */
  private roll(): number {
    return hash01(++this.dice)
  }

  selectPreset(id: string): void {
    const p = presetById(id)
    if (!p) return
    this.presetId = p.id
    this.mass = p.mass
    this.radius = Math.max(p.radius, schwarzschild(p.mass))
    this.frame = effectiveRadius(this.mass, this.radius)
    this.applyBody()
    this.seed()
    this.announceText = `${p.name}`
    this.emit()
  }

  setMassLog(v: number): void {
    this.mass = 10 ** v
    this.presetId = null
    this.applyBody()
    this.emit()
  }

  setSizeLog(v: number): void {
    this.radius = 10 ** v
    this.presetId = null
    this.applyBody()
    this.emit()
  }

  /**
   * A slider was let go. If the body has grown or shrunk out of the room,
   * re-frame on it: the room is always the size the body can be seen in.
   */
  settleBody(): void {
    const drawn = effectiveRadius(this.mass, this.radius) / this.frame
    if (drawn >= 0.4 && drawn <= 2.5) return
    this.frame = effectiveRadius(this.mass, this.radius)
    this.applyBody()
    this.seed()
    this.emit()
  }

  /** What moves in the room. Switching deals it fresh. */
  setKind(k: Kind): void {
    if (k === this.kind) return
    this.kind = k
    this.seed()
    if (!this.playing) this.togglePlay()
    this.announceText = k === 'probe' ? 'Probes' : 'Photons'
    this.emit()
  }

  toggleKind(): void {
    this.setKind(this.kind === 'probe' ? 'light' : 'probe')
  }

  reset(): void {
    this.camera.reset()
    this.seed()
    if (!this.playing) this.togglePlay()
    this.emit()
  }

  // -------------------------------------------------------------- playback

  togglePlay(): void {
    if (this.playing) {
      this.playing = false
    } else {
      this.world.rewind(this.back)
      this.back = 0
      this.playing = true
      this.acc = 0
    }
    this.emit()
  }

  scrubStart(): void {
    this.scrubbing = true
    this.resumeAfterScrub = this.playing
    this.playing = false
    this.emit()
  }

  scrub(position: number): void {
    const n = this.world.count
    this.back = Math.round((1 - position) * Math.max(0, n - 1))
    this.emit()
  }

  scrubEnd(): void {
    this.scrubbing = false
    if (this.resumeAfterScrub) {
      this.world.rewind(this.back)
      this.back = 0
      this.playing = true
      this.acc = 0
    }
    this.emit()
  }

  /** Anything that changes the particles from a scrubbed moment branches there. */
  private branch(): void {
    if (this.back === 0) return
    this.world.rewind(this.back)
    this.back = 0
  }

  // ------------------------------------------------------------------ loop

  private frameLoop = (now: number): void => {
    this.raf = requestAnimationFrame(this.frameLoop)
    const elapsed = Math.min(0.1, (now - this.last) / 1000)
    this.last = now

    if (this.playing) {
      this.acc += elapsed
      const wf = { rs: this.field.rs, radius: this.field.radius, rate: this.rate * this.pace }
      let ticked = false
      while (this.acc >= DT) {
        this.world.tick(wf)
        if (this.kind === 'light') this.sendLight()
        this.acc -= DT
        ticked = true
      }
      // The timeline only moves at 60 Hz, but React does not need every frame.
      if (ticked && this.world.count < HISTORY_FRAMES && this.world.count % 6 === 0) this.emit()
    }

    if (this.playing && !this.reduced && !this.ride && this.presses.size === 0 && now - this.lastTouch > IDLE_MS) {
      this.camera.turn(IDLE_TURN * elapsed, 0)
    }

    this.updateView(now, elapsed)
    this.draw()
  }

  private visible(): Particle[] {
    if (this.back === 0) return this.world.slots.filter((p): p is Particle => p !== null)
    return this.world.frameAt(this.back)
  }

  // ------------------------------------------------------------------ ride

  /**
   * Rides a particle: the eye swings in, sits on it and travels with it, so
   * the net streams past and the turn round the body and the rush through the
   * closest pass are felt from the inside.
   */
  private rideOn(id: number): void {
    const p = this.visible().find((q) => q.id === id && q.fade === 0)
    if (!p) return
    const along = normalize(len(p.vel) > 1e-9 ? p.vel : cross(p.pos, [0, 1, 0]))
    // Up is square to the plane of the path, on the side the screen's up is on,
    // so the swing in never turns the room over.
    const up = this.mats.basis.up
    const plane = cross(p.pos, along)
    let normal = squareTo(len(plane) > 1e-6 * len(p.pos) ? plane : up, along)
    if (dot(normal, up) < 0) normal = [-normal[0], -normal[1], -normal[2]]
    this.ride = { id, kind: p.kind, along, normal, yaw: 0, rise: SEAT_RISE, back: SEAT_BACK }
    this.left = null
    this.swing = this.reduced ? null : { from: this.view, t0: performance.now() }
    this.announceText = p.kind === 'probe' ? 'Riding the probe' : 'Riding the photon'
    this.emit()
  }

  /** Back to the room, as it was left. */
  stepOff(): void {
    this.pendingRide = null
    if (!this.ride) return
    this.left = this.ride.id
    this.ride = null
    this.swing = this.reduced ? null : { from: this.view, t0: performance.now() }
    this.announceText = 'Stepped off'
    this.emit()
  }

  private updateView(now: number, elapsed: number): void {
    if (this.pendingRide && now >= this.pendingRide.at) {
      const { id } = this.pendingRide
      this.pendingRide = null
      this.rideOn(id)
    }
    let goal = this.camera.view()
    this.seat = null
    if (this.ride) {
      const id = this.ride.id
      const p = this.visible().find((q) => q.id === id)
      // Into the body, out of the room, or scrubbed to before it was let go:
      // the ride ends with it. Light ends a little sooner, on its way out,
      // since past where the net fades there is nothing to see from it.
      const leaving = p?.kind === 'light' && dot(p.pos, p.vel) > 0 && len(p.pos) > LIGHT_OUT
      if (p && p.fade === 0 && !leaving) {
        const at = this.seatAt(p)
        this.seat = this.seatFor(p, at)
        goal = this.rideView(this.ride, at, p.vel, elapsed)
      } else this.stepOff()
    }
    if (!this.ride && this.left !== null) {
      const id = this.left
      const p = this.swing ? this.visible().find((q) => q.id === id) : undefined
      if (p) this.seat = this.seatFor(p, p.pos)
      else this.left = null
    }
    if (this.swing) {
      const u = Math.max(0, (now - this.swing.t0) / 1000 / SWING_S)
      if (u >= 1) this.swing = null
      else goal = mixView(this.swing.from, goal, u * u * (3 - 2 * u))
    }
    this.view = goal
    this.mats = matricesOf(goal, this.width / this.height)
    const pace = this.ride?.kind === 'light' ? LIGHT_RIDE_PACE : 1
    this.pace += (pace - this.pace) * (1 - Math.exp(-elapsed / PACE_S))
  }

  /**
   * Where the ridden particle is between ticks. The room steps at 60 Hz and
   * the screen may not, and with the eye this close every step would show.
   */
  private seatAt(p: Particle): Vec3 {
    if (!this.playing || this.back !== 0 || p.held) return p.pos
    const [now, before] = this.world.trail(p.id, 0, 1, 2)
    if (!before) return p.pos
    return mix3(before, now, Math.min(1, this.acc / DT))
  }

  private seatFor(p: Particle, at: Vec3): SeatDraw {
    const light = p.kind === 'light'
    return {
      center: at,
      radius: SEAT[p.kind],
      color: light ? GOLD : HUES[p.hue % HUES.length],
      glow: light,
      alpha: 1 - Math.min(1, p.fade),
    }
  }

  private rideView(r: Ride, at: Vec3, vel: Vec3, elapsed: number): View {
    const turn = 1 - Math.exp(-elapsed / TURN_LAG_S)
    if (len(vel) > 1e-9) r.along = normalize(mix3(r.along, normalize(vel), turn))
    // A free fall keeps to one plane. Only a fall straight in or out has none,
    // and keeps the last.
    const plane = cross(at, vel)
    if (len(plane) > 1e-3 * len(at) * len(vel)) {
      const n = normalize(plane)
      r.normal = normalize(mix3(r.normal, dot(n, r.normal) < 0 ? [-n[0], -n[1], -n[2]] : n, turn))
    }
    const f = r.along
    const up = squareTo(r.normal, f)
    // Turned in toward the body by how much of the way to it is across the
    // path: most at the closest pass, none on a fall straight in.
    const rp = len(at)
    const a = dot(at, f)
    const k = LEAN / rp
    const heading = normalize([f[0] - (at[0] - f[0] * a) * k, f[1] - (at[1] - f[1] * a) * k, f[2] - (at[2] - f[2] * a) * k])
    const side = normalize(cross(heading, up))
    const cy = Math.cos(r.yaw)
    const sy = Math.sin(r.yaw)
    const ahead: Vec3 = [cy * heading[0] + sy * side[0], cy * heading[1] + sy * side[1], cy * heading[2] + sy * side[2]]
    const radius = SEAT[r.kind]
    const d = r.back * radius
    const cr = Math.cos(r.rise)
    const sr = Math.sin(r.rise)
    let eye: Vec3 = [
      at[0] + d * (sr * up[0] - cr * ahead[0]),
      at[1] + d * (sr * up[1] - cr * ahead[1]),
      at[2] + d * (sr * up[2] - cr * ahead[2]),
    ]
    // Never inside the body, whichever way the eye has been turned.
    const clear = this.field.radius + 0.02
    const re = len(eye)
    if (re < clear) eye = [(eye[0] / re) * clear, (eye[1] / re) * clear, (eye[2] / re) * clear]
    // Look past the seat, lifted so its top edge sits SEAT_LOW of the way from
    // the middle of the screen to the bottom.
    const lift = Math.asin(Math.min(1, 1 / r.back)) + Math.atan(SEAT_LOW * Math.tan(RIDE_FOV / 2))
    const pitch = r.rise - lift
    const cp = Math.cos(pitch)
    const spp = Math.sin(pitch)
    const target: Vec3 = [
      eye[0] + cp * ahead[0] - spp * up[0],
      eye[1] + cp * ahead[1] - spp * up[1],
      eye[2] + cp * ahead[2] - spp * up[2],
    ]
    // The net drawn out well past the seat, so on the way out there is still
    // something ahead to rush past.
    const reach = 1.5 * Math.max(len(eye), rp) + 3
    return {
      eye,
      target,
      up,
      fov: RIDE_FOV,
      near: Math.max(0.002, 0.3 * (d - radius)),
      far: len(eye) + 30,
      detail: Math.min(40, Math.max(6, detailFor(reach))),
      lens: 0.35 * d,
    }
  }

  private lookAround(dYaw: number, dRise: number): void {
    if (!this.ride) return
    this.ride.yaw += dYaw
    this.ride.rise = Math.max(0.15, Math.min(1.35, this.ride.rise + dRise))
  }

  /** On a ride, from sitting on it out to following it from a little way back. */
  private zoom(factor: number): void {
    if (this.ride) this.ride.back = Math.max(1.6, Math.min(40, this.ride.back * factor))
    else this.camera.zoom(factor)
  }

  // ------------------------------------------------------------------ draw

  /**
   * The room on the lit surface it stands on, without the tab or the chrome.
   * The grain is loaded first, then the surface is painted and the last frame
   * drawn again and laid over it in one go: once a frame is shown, it is gone.
   */
  async photo(): Promise<Blob> {
    const stage = this.canvas.parentElement ?? document.body
    const { width, height } = this.canvas
    const scale = width / this.width
    const grain = await grainOf(stage, scale)
    const ctx = litSurface(stage, width, height, scale, grain)
    this.draw()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(this.canvas, 0, 0)
    return png(ctx.canvas)
  }

  private draw(): void {
    const m = this.mats
    const b = m.basis
    // Lamps upper left of the viewer, as on the lightbox.
    const light = normalize([
      -b.right[0] * 0.6 + b.up[0] * 0.7 - b.forward[0] * 0.5,
      -b.right[1] * 0.6 + b.up[1] * 0.7 - b.forward[1] * 0.5,
      -b.right[2] * 0.6 + b.up[2] * 0.7 - b.forward[2] * 0.5,
    ])
    const preset = this.presetId ? presetById(this.presetId) : undefined
    const color = hexToVec(preset?.color ?? customColor(this.field))

    let pc = 0
    let bc = 0
    // Shape: 0 dot, 1 ring, 2 and 3 the same drawn on top of everything.
    const point = (p: Vec3, c: Vec3, a: number, size: number, shape: number): void => {
      if (pc * POINT_STRIDE >= this.points.length) return
      const o = pc * POINT_STRIDE
      this.points.set([p[0], p[1], p[2], c[0], c[1], c[2], a, size, shape], o)
      pc++
    }
    // A light's path, newest first, as a ribbon that narrows and fades behind it.
    const beam = (path: Vec3[], life: number): void => {
      const n = path.length
      if (n < 2 || (bc + (n - 1) * 6) * BEAM_STRIDE > this.beams.length) return
      const at = (i: number, side: number): void => {
        const u = i / (LIGHT_FRAMES - 1)
        const p = path[i]
        const prev = path[Math.min(n - 1, i + 1)]
        const next = path[Math.max(0, i - 1)]
        const width = 0.7 + (BEAM_PX - 0.7) * (1 - u) ** 1.5
        const shape = [side, width, life * (1 - u) ** 1.3, Math.max(0, 1 - 4 * u)]
        this.beams.set([...p, ...prev, ...next, ...shape], bc * BEAM_STRIDE)
        bc++
      }
      for (let i = 0; i + 1 < n; i++) {
        at(i, -1)
        at(i, 1)
        at(i + 1, -1)
        at(i, 1)
        at(i + 1, 1)
        at(i + 1, -1)
      }
    }

    for (const p of this.visible()) {
      const c = HUES[p.hue % HUES.length]
      const life = 1 - Math.min(1, p.fade)
      if (p.kind === 'probe') {
        const dots = this.world.trail(p.id, this.back, DOT_STRIDE, DOT_COUNT)
        for (let i = 1; i < dots.length; i++) {
          const k = 1 - i / DOT_COUNT
          point(dots[i], c, 0.75 * k * life, 3.2, 0)
        }
        // The one ridden is drawn where the eye is, between ticks, and as a ball.
        point(p.id === this.ride?.id && this.seat ? this.seat.center : p.pos, c, life, 8, 0)
        if (p.held) point(p.pos, INK, 0.55 * life, 17, 1)
      } else {
        // No head: the streak is the light, brightest where it has just been.
        beam(this.world.trail(p.id, this.back, 1, LIGHT_FRAMES), life)
        if (p.held) point(p.pos, INK, 0.55 * life, 15, 1)
      }
    }

    // The aim forecast: where the particle will go if let go now. Not a trail:
    // a line laid evenly on screen, full strength to the end, which is the answer.
    const aim = this.aimPress()
    this.stepForecast(aim)
    const shown = aim ? this.aimShown : null
    if (aim && shown && shown.trace.count > 1) {
      const tr = shown.trace
      const path = tr.path
      const n = tr.count
      const light = tr.from.kind === 'light'
      const c = light ? FORECAST_GOLD : HUES[this.world.upcoming % HUES.length]
      const vp = m.viewProj
      const sc = this.aimScreen
      let total = 0
      for (let i = 0; i < n; i++) {
        const x = path[3 * i]
        const y = path[3 * i + 1]
        const z = path[3 * i + 2]
        const w = vp[3] * x + vp[7] * y + vp[11] * z + vp[15]
        if (w <= 0) {
          sc[2 * i] = NaN
          sc[2 * i + 1] = NaN
          continue
        }
        sc[2 * i] = ((vp[0] * x + vp[4] * y + vp[8] * z + vp[12]) / w / 2 + 0.5) * this.width
        sc[2 * i + 1] = (0.5 - (vp[1] * x + vp[5] * y + vp[9] * z + vp[13]) / w / 2) * this.height
        if (i > 0) total += Math.hypot(sc[2 * i] - sc[2 * i - 2], sc[2 * i + 1] - sc[2 * i - 1]) || 0
      }
      // Bigger than a trail's dots, and close enough to read as one line.
      const size = this.dpr >= 1.5 ? 3.4 : 4
      const dots = dotsAlong(sc, n, Math.max(2 * size, total / FORECAST_DOTS), 10)
      const base = light ? 0.95 : 0.9
      dots.forEach((f, j) => {
        const i = Math.min(n - 2, Math.floor(f))
        const u = f - i
        const o = 3 * i
        const at: Vec3 = [
          path[o] + (path[o + 3] - path[o]) * u,
          path[o + 1] + (path[o + 4] - path[o + 1]) * u,
          path[o + 2] + (path[o + 5] - path[o + 2]) * u,
        ]
        let a = base
        // Off the room it goes on: the line fades out rather than stops.
        if (tr.end === 'edge') a *= Math.min(1, (dots.length - j) / 11)
        // A circle balanced inside 3 rs is no promise: its last half turn fades.
        if (shown.fate === 'unstable') a *= Math.min(1, (1 - f / (n - 1)) * 4)
        point(at, c, a, size, 0)
      })
      // Into the body: the ring a strike leaves, where it would strike.
      const end: Vec3 = [path[3 * n - 3], path[3 * n - 2], path[3 * n - 1]]
      if (tr.end === 'fall') {
        point(end, PAPER, 0.85, 16, 3)
        point(end, c, 0.95, 13, 3)
      }
      // A probe's two targets: the drag for a circle, one each way round.
      const snapped = aim.snap ?? -1
      if (!light) {
        this.aimTargets(aim).forEach(([dx, dy], k) => {
          if (snapped >= 0 && snapped !== k) return
          const x = (aim.ax ?? aim.x) + dx
          const y = (aim.ay ?? aim.y) + dy
          if (x < 0 || y < 0 || x > this.width || y > this.height) return
          const at = this.planeAt(x, y)
          point(at, PAPER, 0.85, 18, 3)
          point(at, c, snapped === k ? 1 : 0.8, 15, 3)
          if (snapped === k) {
            point(at, PAPER, 0.85, 8, 2)
            point(at, c, 1, 5, 2)
          }
        })
      }
      point(tr.from.pos, PAPER, 0.85, light ? 9 : 11, 2)
      point(tr.from.pos, c, 1, light ? 6 : 8, 2)
    }

    this.renderer.draw({
      viewProj: m.viewProj,
      inverse: m.inverse,
      eye: b.eye,
      light,
      detail: this.view.detail,
      lens: this.view.lens,
      body: { radius: this.field.radius, color, hole: this.field.hole, surface: (preset && SURFACES[preset.id]) ?? null },
      impacts: this.impacts(),
      seat: this.seat,
      points: this.points,
      pointCount: pc,
      beams: this.beams,
      beamCount: bc,
      beamColor: GOLD,
      beamHot: HOT,
    })

    this.drawTab(m.viewProj)
  }

  /** The strikes still ringing at the moment on screen, which scrubbing replays. */
  private impacts(): ImpactDraw[] {
    const shown = this.world.ticks - this.back + (this.playing && this.back === 0 ? this.acc / DT : 0)
    const out: ImpactDraw[] = []
    for (const s of this.world.impacts) {
      const age = ((shown - s.tick) * DT) / RING_S
      if (age < 0 || age >= 1) continue
      out.push({ at: s.at, color: s.kind === 'light' ? HOT : HUES[s.hue % HUES.length], age })
    }
    return out
  }

  /**
   * Steps the aim's forecast a chunk a frame, from fresh whenever what would
   * be let go changes. The last finished one stays up until the new one ends.
   */
  private stepForecast(aim: Press | undefined): void {
    if (!aim) {
      this.aimLive = null
      this.aimShown = null
      this.aimKey = ''
      return
    }
    const b = this.mats.basis
    const m = this.aimMover(aim, b.right, b.up)
    const { rs, radius } = this.field
    const key = [m.kind, ...m.pos, ...m.vel, rs, radius, this.rate].join()
    if (key !== this.aimKey) {
      this.aimKey = key
      const spare = this.aimShown?.trace.path === this.aimPaths[0] ? this.aimPaths[1] : this.aimPaths[0]
      this.aimLive = startTrace(m, spare)
    }
    const live = this.aimLive
    if (live && runTrace(live, rs, radius, ESCAPE_R, DT * this.rate, FORECAST_CHUNK)) {
      this.aimShown = { trace: live, fate: fateOf(live, rs, radius, ESCAPE_R) }
      this.aimLive = null
    }
  }

  /** How the forecast ends, in a word or three. */
  private aimWords(q: Press, shown: { trace: Trace; fate: Fate }): string {
    const { trace, fate } = shown
    if (fate === 'orbit') return (q.snap ?? -1) >= 0 && trace.from.kind === 'probe' ? 'Circular orbit' : 'Orbit'
    if (fate === 'unstable') return 'No stable orbit here'
    if (fate === 'fall') return this.field.hole ? 'Falls in' : 'Hits the surface'
    return trace.from.kind === 'light' || trace.from.energy >= 1 ? 'Escapes' : 'Leaves the room'
  }

  // ------------------------------------------------------------- hover tab

  private hitParticle(x: number, y: number): Particle | null {
    const vp = this.mats.viewProj
    let best: Particle | null = null
    let bestD = HIT_PX
    for (const p of this.visible()) {
      if (p.fade > 0) continue
      const s = project(vp, p.pos, this.width, this.height)
      if (!s) continue
      const d = Math.hypot(s[0] - x, s[1] - y)
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  /**
   * While aiming, the tab names how the forecast ends. It sits just out from
   * the release, away from the body, so it is off the path and the targets.
   */
  private drawAimTab(vp: Float32Array): boolean {
    const aim = this.aimPress()
    const shown = this.aimShown
    if (!aim || !shown) return false
    this.canvas.style.cursor = 'grabbing'
    const s = project(vp, shown.trace.from.pos, this.width, this.height)
    const c = project(vp, [0, 0, 0], this.width, this.height)
    if (!s) {
      this.tab.classList.remove('is-on')
      return true
    }
    let ox = c ? s[0] - c[0] : 0
    let oy = c ? s[1] - c[1] : -1
    const d = Math.hypot(ox, oy)
    ox = d > 1e-6 ? ox / d : 0
    oy = d > 1e-6 ? oy / d : -1
    const text = this.aimWords(aim, shown)
    if (this.tab.textContent !== text) this.tab.textContent = text
    const w = this.tab.offsetWidth
    const h = this.tab.offsetHeight
    const x = s[0] + ox * AIM_TAB_PX + ((ox - 1) * w) / 2
    const y = s[1] + oy * AIM_TAB_PX + ((oy - 1) * h) / 2
    const left = Math.max(8, Math.min(this.width - w - 8, x))
    const top = Math.max(8, Math.min(this.height - h - 8, y))
    this.tab.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    this.tab.classList.add('is-on')
    return true
  }

  private drawTab(vp: Float32Array): void {
    if (this.drawAimTab(vp)) return
    const hovered = this.hover && this.presses.size === 0 ? this.hitParticle(this.hover.x, this.hover.y) : null
    this.canvas.style.cursor = hovered ? 'pointer' : this.presses.size > 0 ? 'grabbing' : 'grab'
    // What is being ridden keeps its tab, pinned just above the seat, so the
    // speed and clock can be watched change.
    const ridden = this.ride ? this.visible().find((p) => p.id === this.ride?.id) : undefined
    const target = hovered ?? ridden
    if (!target) {
      this.tab.classList.remove('is-on')
      return
    }
    const seat = target === ridden ? this.seat : null
    const b = this.mats.basis
    const anchor: Vec3 = seat
      ? [seat.center[0] + b.up[0] * seat.radius, seat.center[1] + b.up[1] * seat.radius, seat.center[2] + b.up[2] * seat.radius]
      : target.pos
    const s = project(vp, anchor, this.width, this.height)
    if (!s) {
      this.tab.classList.remove('is-on')
      return
    }
    if (seat) s[1] = Math.min(s[1], this.height - 96)
    const rs = this.field.rs
    let text: string
    if (target.kind === 'probe') {
      text = `Probe ${localSpeed(target, rs).toFixed(2)} c · Clock ${clockRate(target, rs).toFixed(2)}×`
    } else {
      text = `Photon ${lightSpeedSeen(target.pos, target.vel, rs).toFixed(2)} c seen from here`
    }
    if (target.held) text += ' · Held'
    if (this.tab.textContent !== text) this.tab.textContent = text
    this.tab.style.transform = `translate(${Math.round(s[0] + 12)}px, ${Math.round(s[1] - 26)}px)`
    this.tab.classList.add('is-on')
  }

  // ----------------------------------------------------------------- input

  private local(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  /** A screen point on the plane through the centre that faces the viewer. */
  private planeAt(x: number, y: number): Vec3 {
    const m = this.mats
    const b = m.basis
    const d = ray(m.inverse, b.eye, x, y, this.width, this.height)
    const t = -dot(b.eye, b.forward) / dot(d, b.forward)
    return [b.eye[0] + d[0] * t, b.eye[1] + d[1] * t, b.eye[2] + d[2] * t]
  }

  /** Where a press lands: on the plane through the centre that faces the viewer. */
  private pressPoint(x: number, y: number): Vec3 {
    const b = this.mats.basis
    let p = this.planeAt(x, y)
    const r = len(p)
    const min = Math.max(this.field.radius * 1.25, this.field.rs * 1.6)
    if (r < min) {
      // Pressing on the body releases from just outside it, toward the press.
      const n = r > 1e-6 ? normalize(p) : b.up
      p = [n[0] * min, n[1] * min, n[2] * min]
    }
    const far = len(p)
    if (far <= REACH_PRESS) return p
    return [(p[0] * REACH_PRESS) / far, (p[1] * REACH_PRESS) / far, (p[2] * REACH_PRESS) / far]
  }

  /** A body or kind change ends an aim: what it forecast no longer holds. */
  private dropAim(): void {
    for (const q of this.presses.values()) {
      if (q.mode !== 'aim') continue
      q.mode = 'turn'
      q.origin = undefined
      q.moved = true
    }
    this.aimLive = null
    this.aimShown = null
  }

  private aimPress(): Press | undefined {
    for (const q of this.presses.values()) if (q.mode === 'aim' && q.origin) return q
    return undefined
  }

  /**
   * The drags that release a probe on an exact circle, one each way round,
   * where one is offered: never inside 3 rs, nor where it would touch the body.
   */
  private aimTargets(q: Press): [number, number][] {
    if (q.targets) return q.targets
    q.targets = []
    if (this.kind !== 'probe' || !q.origin) return q.targets
    const b = this.mats.basis
    const t = tangentAt(q.origin, b.forward, b.right)
    if (circleOffered(q.origin, t, this.field.rs, this.field.radius, ESCAPE_R)) {
      const [dx, dy] = circleDrag(t, b.right, b.up)
      q.targets = [
        [dx, dy],
        [-dx, -dy],
      ]
    }
    return q.targets
  }

  private aimMover(q: Press, right: Vec3, up: Vec3): Mover {
    const p = q.origin as Vec3
    if (this.kind === 'probe' && (q.snap ?? -1) >= 0) {
      // Snapped: exactly circular, so what is drawn is the circle let go.
      const t = tangentAt(p, this.mats.basis.forward, right)
      return makeProbe(p, circleVelocity(p, t, q.snap === 0 ? 1 : -1, this.field.rs), this.field.rs)
    }
    const dx = q.dx ?? 0
    const dy = q.dy ?? 0
    const drag = Math.hypot(dx, dy)
    const b = this.mats.basis
    let dir: Vec3
    if (drag > 6) {
      dir = normalize([right[0] * dx - up[0] * dy, right[1] * dx - up[1] * dy, right[2] * dx - up[2] * dy])
    } else if (q.miss) {
      // Light, undirected: in at the body, turned aside just enough to pass
      // the middle at the distance thrown.
      const r = len(p)
      const wide = len(q.miss)
      const a = Math.asin(Math.min(0.98, wide / r))
      const side = normalize(q.miss)
      const c = Math.cos(a) / r
      const sa = Math.sin(a)
      dir = [-p[0] * c + side[0] * sa, -p[1] * c + side[1] * sa, -p[2] * c + side[2] * sa]
    } else {
      // A probe, undirected: across the line of sight, around the body.
      const t = cross(b.forward, p)
      dir = len(t) > 1e-6 ? normalize(t) : right
    }
    if (this.kind === 'light') return makeLight(p, dir)
    const circ = circularSpeed(len(p), this.field.rs)
    const speed = drag > 6 ? Math.min(circ * 2.4, circ * (drag / 70)) : circ * 0.92
    return makeProbe(p, [dir[0] * speed, dir[1] * speed, dir[2] * speed], this.field.rs)
  }

  /**
   * Light let go near the body starts LIGHT_RUN out, on the same side, but
   * never so far that it starts off the screen: on a phone it is drawn back to
   * AIM_EDGE_PX inside the edge. Never nearer than the press itself.
   */
  private runIn(o: Vec3): Vec3 {
    const r0 = len(o)
    const at = (r: number): Vec3 => [(o[0] / r0) * r, (o[1] / r0) * r, (o[2] / r0) * r]
    const inside = (r: number): boolean => {
      const s = project(this.mats.viewProj, at(r), this.width, this.height)
      const m = AIM_EDGE_PX
      return s !== null && s[0] >= m && s[0] <= this.width - m && s[1] >= m && s[1] <= this.height - m
    }
    if (inside(LIGHT_RUN)) return at(LIGHT_RUN)
    let lo = r0
    let hi = LIGHT_RUN
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (inside(mid)) lo = mid
      else hi = mid
    }
    return at(lo)
  }

  /**
   * How far wide of the middle undirected light goes, and which way round, as
   * one vector square to the line in from `origin`. Measured against the
   * closest pass that gets away: grazing the surface, or for anything inside
   * its own photon sphere, the edge of the shadow.
   */
  private throwMiss(origin: Vec3): Vec3 {
    const { rs, radius } = this.field
    const graze = rs > 1e-9 && radius > rs ? radius / Math.sqrt(1 - rs / radius) : radius
    const escape = Math.max(graze, ((3 * Math.sqrt(3)) / 2) * rs)
    const u = Math.random()
    const wide = escape * (MISS_FROM + MISS_SPAN * u * u)
    const n = normalize(origin)
    const e1 = squareTo([0, 1, 0], n)
    const e2 = cross(n, e1)
    const a = Math.random() * 2 * Math.PI
    const c = Math.cos(a) * wide
    const s = Math.sin(a) * wide
    return [e1[0] * c + e2[0] * s, e1[1] * c + e2[1] * s, e1[2] * c + e2[2] * s]
  }

  private onDown = (e: PointerEvent): void => {
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const { x, y } = this.local(e)
    this.lastTouch = performance.now()
    this.canvas.setPointerCapture(e.pointerId)

    if (this.presses.size === 1) {
      // Second finger: pinch. Whatever the first was doing stops.
      const first = [...this.presses.values()][0]
      first.mode = 'turn'
      first.origin = undefined
      first.moved = true
      this.pinch = { d: Math.hypot(first.x - x, first.y - y) }
      this.presses.set(e.pointerId, { id: e.pointerId, x, y, t: e.timeStamp, moved: true, mode: 'turn' })
      return
    }

    const prev = this.lastDown
    const reach = e.pointerType === 'touch' ? DOUBLE_TOUCH_PX : DOUBLE_PX
    const double = e.timeStamp - prev.t < DOUBLE_MS && Math.hypot(prev.x - x, prev.y - y) < reach
    const press: Press = { id: e.pointerId, x, y, t: e.timeStamp, moved: false, mode: 'turn' }

    if (double && !this.ride) {
      // The first click of a double-click held whatever it landed on, or was
      // about to ride it. That was not what was meant, so it is undone before
      // the release.
      if (prev.toggled !== undefined) this.toggleHold(prev.toggled)
      this.pendingRide = null
      press.mode = 'aim'
      press.origin = this.pressPoint(x, y)
      press.dx = 0
      press.dy = 0
      press.ax = x
      press.ay = y
      press.touch = e.pointerType === 'touch'
      press.snap = -1
      if (this.kind === 'light') {
        const o = press.origin
        const r = len(o)
        if (r < LIGHT_RUN) press.origin = this.runIn(o)
        press.miss = this.throwMiss(press.origin)
      }
      this.lastDown = { x: -999, y: -999, t: -999, toggled: undefined }
    } else {
      this.lastDown = { x, y, t: e.timeStamp, toggled: undefined }
    }
    this.presses.set(e.pointerId, press)
  }

  private onMove = (e: PointerEvent): void => {
    const { x, y } = this.local(e)
    const q = this.presses.get(e.pointerId)
    if (!q) {
      if (e.target === this.canvas) this.hover = { x, y }
      return
    }
    this.lastTouch = performance.now()
    const dx = x - q.x
    const dy = y - q.y

    if (this.pinch && this.presses.size === 2) {
      q.x = x
      q.y = y
      const [a, b] = [...this.presses.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (this.pinch.d > 0 && d > 0) this.zoom(this.pinch.d / d)
      this.pinch.d = d
      return
    }

    if (q.mode === 'aim') {
      q.dx = (q.dx ?? 0) + dx
      q.dy = (q.dy ?? 0) + dy
      q.x = x
      q.y = y
      // Near the drag for a circle, the aim snaps to it exactly. Instant, both
      // ways, so what is drawn is always what letting go makes.
      const was = q.snap ?? -1
      const [enter, leave] = q.touch ? SNAP_PX.touch : SNAP_PX.mouse
      q.snap = snapTo(q.dx, q.dy, this.aimTargets(q), was, enter, leave)
      if (q.touch && was < 0 && q.snap >= 0) navigator.vibrate?.(8)
      return
    }

    if (!q.moved && Math.hypot(dx, dy) < CLICK_PX) return
    q.moved = true
    if (this.ride) this.lookAround(-dx * TURN_PER_PX, dy * TURN_PER_PX)
    else this.camera.turn(-dx * TURN_PER_PX, dy * TURN_PER_PX)
    q.x = x
    q.y = y
    this.hover = null
  }

  private onUp = (e: PointerEvent): void => {
    const q = this.presses.get(e.pointerId)
    if (!q) return
    this.presses.delete(e.pointerId)
    if (this.presses.size < 2) this.pinch = null
    this.lastTouch = performance.now()

    if (q.mode === 'aim' && q.origin) {
      const b = this.mats.basis
      this.branch()
      const p = this.world.add(this.aimMover(q, b.right, b.up))
      this.aimLive = null
      this.aimShown = null
      // Light is ridden from the moment it is let go, until it is gone.
      if (p.kind === 'light') {
        this.rideOn(p.id)
        return
      }
      this.announceText = (q.snap ?? -1) >= 0 ? 'Probe in orbit' : 'Probe released'
      this.emit()
      return
    }

    if (!q.moved && e.type === 'pointerup') {
      const { x, y } = this.local(e)
      const hit = this.hitParticle(x, y)
      if (hit?.kind === 'probe' && hit.id !== this.ride?.id) {
        this.pendingRide = { id: hit.id, at: performance.now() + DOUBLE_MS }
      } else if (this.ride) {
        // Anywhere else, or the probe itself, steps off, and is not the first
        // half of a double-click.
        this.stepOff()
        this.lastDown = { x: -999, y: -999, t: -999, toggled: undefined }
      } else if (hit) {
        this.toggleHold(hit.id)
        this.lastDown.toggled = hit.id
      }
    }
  }

  private onLeave = (): void => {
    this.hover = null
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    this.lastTouch = performance.now()
    const scale = e.deltaMode === 1 ? 16 : 1
    this.zoom(Math.exp(e.deltaY * scale * 0.0015))
  }

  private toggleHold(id: number): void {
    this.branch()
    const p = this.world.slots.find((s) => s?.id === id)
    if (!p) return
    p.held = !p.held
    this.announceText = p.held ? 'Particle held' : 'Particle let go'
    this.emit()
  }

  // ------------------------------------------------------------------- URL

  private readHash(): { preset?: string; mass?: number; radius?: number } | null {
    const h = window.location.hash.slice(1)
    if (!h) return null
    if (presetById(h)) return { preset: h }
    const q = new URLSearchParams(h)
    const m = Number(q.get('m'))
    const r = Number(q.get('r'))
    if (!(m > 0) || !(r > 0)) return null
    const clamp = (v: number, [lo, hi]: readonly [number, number]): number => 10 ** Math.max(lo, Math.min(hi, Math.log10(v)))
    return { mass: clamp(m, MASS_LOG), radius: clamp(r, SIZE_LOG) }
  }

  private writeHash(): void {
    const h = this.presetId ?? `m=${this.mass.toPrecision(4)}&r=${this.radius.toPrecision(4)}`
    if (window.location.hash.slice(1) === h) return
    window.history.replaceState(null, '', `#${h}`)
  }

  // -------------------------------------------------------------- snapshot

  private makeSnapshot(): Snapshot {
    const preset: Preset | undefined = this.presetId ? presetById(this.presetId) : undefined
    const hole = this.field.hole
    const n = this.world.count
    const clock = surfaceClock(this.mass, this.radius)
    return {
      presetId: this.presetId,
      name: preset?.name ?? (hole ? 'Your black hole' : 'Your body'),
      color: preset?.color ?? customColor(this.field),
      hole,
      massLog: Math.log10(this.mass),
      sizeLog: Math.log10(effectiveRadius(this.mass, this.radius)),
      kind: this.kind,
      riding: this.ride !== null,
      playing: this.playing,
      expanded: !this.playing || this.scrubbing,
      position: n <= 1 ? 1 : 1 - this.back / (n - 1),
      filled: n / HISTORY_FRAMES,
      readout: {
        mass: formatMass(this.mass),
        radius: formatLength(effectiveRadius(this.mass, this.radius)),
        clock: formatClock(clock),
        drawn: formatExaggeration(exaggeration(this.mass, this.radius)),
      },
      announce: this.announceText,
    }
  }
}

/** A body off the presets is grey, darkening toward ink as it nears collapse. */
function customColor(f: Field): string {
  if (f.hole) return '#101014'
  const c = Math.min(1, f.rs / f.radius)
  const v = Math.round(178 - 120 * c)
  const h = v.toString(16).padStart(2, '0')
  return `#${h}${h}${Math.min(255, v + 10).toString(16).padStart(2, '0')}`
}

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

/** `v` with its part along unit `f` taken out, as a unit vector; any square one if nothing is left. */
function squareTo(v: Vec3, f: Vec3): Vec3 {
  const a = dot(v, f)
  const w: Vec3 = [v[0] - f[0] * a, v[1] - f[1] * a, v[2] - f[2] * a]
  if (len(w) > 1e-6) return normalize(w)
  return normalize(cross(f, Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]))
}

/** An integer to [0, 1), well mixed. */
function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

/** Rodrigues: v rotated by `a` about unit axis `k`. */
function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  const kv = cross(k, v)
  const d = dot(k, v) * (1 - c)
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d]
}
