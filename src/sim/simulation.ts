import {
  AXIS_ESCAPE_DEG,
  AXIS_ESCAPE_GAIN_DEG,
  AXIS_LOCK_MAX_DEG,
  AXIS_LOCK_MIN_DEG,
  BOUNCE_ANGLE_JITTER_DEG,
  BOUNCE_COOLDOWN,
  BOUNCE_SPEED_JITTER,
  CROWD_GAIN_DEG,
  CROWD_GAIN_HARD_DEG,
  CROWD_TRIGGER,
  DEPTH_EASE_TAU,
  DRIFT_GATE_S,
  DRIFT_HUE_DEG,
  DRIFT_KEEP_DEG,
  DRIFT_MIN_DEG,
  DT,
  HOME_DRIFT,
  HOME_GAIN_DEG,
  HOME_LEAD,
  HOME_OFFSET,
  HOME_RING,
  HOME_SLACK,
  LONELY_AFTER_S,
  LONELY_GAIN_DEG,
  OMEGA_MAX_DEG,
  OMEGA_MIN_DEG,
  REDUCED_OMEGA,
  REDUCED_SPEED,
  ROT_RESTORE_DEG,
  SIZE_FRAC_MAX,
  SIZE_FRAC_MIN,
  SIZE_FRAC_ONE,
  SIZE_PX_MAX,
  SIZE_PX_MIN,
  SLIDE_ASPECT,
  SLIDE_ASPECT_SPREAD,
  SOFT_CATCH_CHANCE,
  SOFT_CATCH_FACTOR,
  SOFT_CATCH_RECOVER,
  SPEED_MAX,
  SPEED_MIN,
  STEER_CLAMP_DEG,
  STICKY_AFTER_S,
  STICKY_DECAY,
  STICKY_GAIN_DEG,
  STICKY_RAMP_S,
  STICKY_TRIGGER,
  TAB_PROUD,
  TILT_DEG,
  TWEEN_MS,
  TWEEN_STAGGER_MS,
  WANDER_GAIN_DEG,
} from '../core/constants'
import { driftDye } from '../core/drift'
import { DEG, clamp, clampAbs, makeNoiseTables, smoothstep, vnoise, wrapPi } from '../core/noise'
import { mixDye } from '../core/oklab'
import { Rng, splitmix32 } from '../core/rng'
import type { Dye, SimState, SlideState, Viewport } from '../core/types'

/** Noise tables per slide: heading slow, heading slower, speed, rotation. */
const NOISE_TABLES = 4
const NOISE_SIZE = 32

/**
 * Radius multipliers used when placing the ring. Two slides start overlapping.
 * One entry per slide: a short list leaves the last slides on an undefined
 * radius, which places them at NaN and drops them off the stage entirely.
 */
const PLACEMENT_RADII = [0.5, 0.58, 0.66, 0.8, 0.92, 1.02, 1.12, 1.24, 1.42]

const PROBE_SECONDS = 4
const PROBE_DT = 1 / 30
const MAX_SEED_ATTEMPTS = 24

interface SlideRuntime {
  noise: Float32Array[]
  rng: Rng
}

/**
 * Per-layout constants drawn once at seed time. `x`/`y` place the opening
 * composition and set the opening bearings, and then stop mattering: nothing is
 * attracted to this point. `p1`/`p2` phase the per-slide home rings, which is
 * what actually steers. It was called an attractor when one shared point did
 * both jobs, and that is exactly the arrangement that clumped the composition.
 */
interface Origin {
  x: number
  y: number
  p1: number
  p2: number
}

interface Candidate {
  slides: SlideState[]
  origin: Origin
}

function substream(master: number, id: number): Rng {
  return new Rng(splitmix32(master ^ Math.imul(id + 1, 0x9e3779b9)))
}

function cloneDye(d: Dye): Dye {
  return { L: d.L, C: d.C, h: d.h, d: d.d }
}

/**
 * The deterministic core.
 *
 * Two rules make the timeline trustworthy and are not negotiable:
 *   1. A plain tick never draws from the PRNG. Every continuous wobble is value
 *      noise, a pure function of (seed, slide, t). Random numbers are consumed
 *      only on a wall contact, and always exactly six of them, so a slide's
 *      whole future is one uint32.
 *   2. Rotation is stored unwrapped. A wrapped angle produces a 350 degree spin
 *      artefact the moment a scrub interpolates across the wrap.
 */
export class Simulation {
  readonly state: SimState
  private master: number
  private viewport: Viewport
  private runtime: SlideRuntime[] = []
  /** Placement origin and home-ring phases, from the layout stream. */
  private origin = { x: 0.5, y: 0.5, p1: 0, p2: 0 }
  private tabProudU = 0

  constructor(seed: number, viewport: Viewport) {
    this.master = seed >>> 0
    this.viewport = viewport
    this.tabProudU = TAB_PROUD / viewport.height
    this.state = { t: 0, aspect: viewport.aspect, modeMix: 0, paletteEpoch: 0, slides: [] }
    this.buildLayout(viewport.slideCount)
  }

  get seed(): number {
    return this.master
  }

  // --- seeding --------------------------------------------------------------

  private buildLayout(count: number, preserve?: Map<number, Dye>): void {
    let best: Candidate | null = null
    let bestScore = -Infinity
    let bestMaster = this.master
    let master = this.master

    for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt++) {
      const candidate = this.seedSlides(substream(master, 0), count)
      const score = this.probe(candidate, master)
      if (score.value > bestScore) {
        bestScore = score.value
        best = candidate
        bestMaster = master
      }
      if (score.pass) break
      master = splitmix32(master)
    }

    this.master = bestMaster
    this.origin = (best as Candidate).origin

    const slides = (best as Candidate).slides
    if (preserve) {
      // A pinned colour is a thing the user saved, so it has to survive a
      // relayout that a window resize triggered on its own. Carrying only the
      // flag re-pinned the seed placeholder dye instead, which silently
      // rewrote the hex under the pin with a colour nobody had ever seen.
      for (const s of slides) {
        const dye = preserve.get(s.id)
        if (!dye) continue
        s.locked = true
        s.dye = cloneDye(dye)
        s.dyeBase = cloneDye(dye)
        s.dyeFrom = cloneDye(dye)
        s.dyeTo = cloneDye(dye)
        s.driftGate = 0
      }
    }
    this.state.slides = slides
    this.state.aspect = this.viewport.aspect
    this.runtime = slides.map((_, i) => this.makeRuntime(this.master, i))
    // The stream position lives in the slide so the history buffer carries it.
    slides.forEach((s, i) => {
      s.rngState = (this.runtime[i] as SlideRuntime).rng.state
    })
  }

  /** Noise tables are drawn first, then the stream is left for bounce events. */
  private makeRuntime(master: number, index: number): SlideRuntime {
    const rng = substream(master, 2 + index)
    const noise = makeNoiseTables(rng, NOISE_TABLES, NOISE_SIZE)
    return { noise, rng }
  }

  private seedSlides(layout: Rng, count: number): Candidate {
    const vp = this.viewport
    const A = vp.aspect

    const radii = layout.shuffle(PLACEMENT_RADII.slice(0, count))

    // Depth order is now a straight shuffle. It used to correlate with size,
    // which gave the stack a readable reason for who floats above whom; with
    // one size for every slide there is nothing left to correlate with, so the
    // ladder is drawn at random and depth is carried by shadow and speed alone.
    const order = Array.from({ length: count }, (_, i) => ({ i, key: layout.next() })).sort(
      (a, b) => a.key - b.key,
    )

    const origin: Origin = {
      x: A * (0.42 + 0.16 * layout.next()),
      y: 0.44 + 0.14 * layout.next(),
      p1: layout.next() * Math.PI * 2,
      p2: layout.next() * Math.PI * 2,
    }

    const u0 = layout.next()
    // One size, so the px clamp is resolved once. It still matters: on a phone
    // the fraction would come out under the readable floor, and on a very large
    // monitor a 30% slide would be big enough to cover most of the stage.
    const sizePx = clamp(
      SIZE_FRAC_ONE * vp.short,
      SIZE_PX_MIN,
      Math.min(SIZE_PX_MAX, vp.short * 0.82),
    )
    const sizeFrac = clamp(sizePx / vp.short, SIZE_FRAC_MIN, SIZE_FRAC_MAX)
    const meanSizeU = sizePx / vp.height

    const slides: SlideState[] = []
    for (let i = 0; i < count; i++) {
      // Square, give or take. Drawn once here and then carried in the slide,
      // so a resize and a scrub both keep the shape this slide was cut to.
      const slideAspect = SLIDE_ASPECT * (1 + layout.spread(SLIDE_ASPECT_SPREAD))
      const { w, h } = this.dimensions(sizeFrac, slideAspect)

      const depthRank = order.findIndex((o) => o.i === i)
      const z = clamp((depthRank + 0.5 + 0.35 * layout.spread(1)) / count, 0.02, 0.98)

      // Golden-angle spokes around the origin: even coverage, no symmetry.
      let x = 0
      let y = 0
      for (let tries = 0; tries < 6; tries++) {
        const theta = 2 * Math.PI * (((0.6180339887 * i + u0) % 1) + (tries ? layout.next() : 0))
        const r = (radii[i] as number) * ((w + h) / 2 + meanSizeU) * 0.5
        x = origin.x + Math.cos(theta) * r * (A > 1 ? A * 0.72 : 1)
        y = origin.y + Math.sin(theta) * r
        const cx = clamp(x, 0.06 + w / 2, A - 0.06 - w / 2)
        const cy = clamp(y, 0.06 + h / 2, 0.94 - h / 2)
        if (Math.hypot(cx - x, cy - y) < 0.08) {
          x = cx
          y = cy
          break
        }
        x = cx
        y = cy
      }

      // Tangential, never aimed at the origin: radial aiming produces a staged
      // collapse and then an explosion, which reads as choreography.
      const bearing = Math.atan2(origin.y - y, origin.x - x)
      let heading = 0
      for (let tries = 0; tries < 8; tries++) {
        const sign = layout.chance(0.5) ? 1 : -1
        heading = bearing + sign * (62 + 56 * layout.next()) * DEG
        const off = Math.abs(wrapPi(heading))
        const nearAxis =
          off < 10 * DEG ||
          Math.abs(off - Math.PI / 2) < 10 * DEG ||
          Math.abs(off - Math.PI) < 10 * DEG
        if (!nearAxis) break
      }

      const depthNorm = count > 1 ? depthRank / (count - 1) : 0
      // Speed now reads depth rather than size: the slide floating highest runs
      // fastest, which is what parallax does, and it is the only cue left that
      // ties the stack order to the movement. The spread across the seven is
      // wide on purpose. Similar speeds read as one hand moving a whole set.
      const speed0 = clamp(
        (0.076 - 0.038 * (1 - depthNorm)) * (0.82 + 0.36 * layout.next()),
        SPEED_MIN,
        SPEED_MAX,
      )

      const dye: Dye = { L: 0.82, C: 0.1, h: (i * 57) % 360, d: 0.8 }
      slides.push({
        id: i,
        x,
        y,
        heading,
        speed0,
        rot: layout.spread(TILT_DEG) * DEG,
        omegaRot: clampAbs(
          (layout.chance(0.5) ? 1 : -1) * (OMEGA_MIN_DEG + 0.85 * layout.next()) * DEG,
          OMEGA_MAX_DEG * DEG,
        ),
        sizeFrac,
        aspect: slideAspect,
        w,
        h,
        z,
        zTarget: z,
        dye,
        dyeBase: cloneDye(dye),
        dyeFrom: cloneDye(dye),
        dyeTo: cloneDye(dye),
        tweenT: 1,
        tweenDelay: 0,
        driftGate: 1,
        lonelyTimer: 0,
        stickyTimer: 0,
        cd: [0, 0, 0, 0],
        rngState: 0,
        catchUntil: 0,
        speedPre: speed0,
        locked: false,
        held: false,
      })
    }

    return { slides, origin }
  }

  /**
   * Fast-forward a candidate layout and ask whether anything interesting happens
   * in the first four seconds. This is what stops a load from opening on six
   * slides drifting politely apart.
   */
  private probe(candidate: Candidate, master: number): { pass: boolean; value: number } {
    const scratch: SimState = {
      t: 0,
      aspect: this.viewport.aspect,
      modeMix: 0,
      paletteEpoch: 0,
      slides: candidate.slides.map((s) => ({
        ...s,
        cd: [...s.cd] as SlideState['cd'],
        dye: cloneDye(s.dye),
        dyeFrom: cloneDye(s.dyeFrom),
        dyeTo: cloneDye(s.dyeTo),
      })),
    }
    const runtime = candidate.slides.map((_, i) => this.makeRuntime(master, i))
    scratch.slides.forEach((s, i) => {
      s.rngState = (runtime[i] as SlideRuntime).rng.state
    })
    const origin = candidate.origin

    let bestPairs = 0
    let sawTriple = false
    let best = 0
    const steps = Math.round(PROBE_SECONDS / PROBE_DT)
    for (let k = 0; k < steps; k++) {
      this.advance(scratch, runtime, origin, PROBE_DT, false)
      const { pairs, triples } = this.overlapCounts(scratch.slides)
      if (pairs >= 2) bestPairs = Math.max(bestPairs, pairs)
      if (triples >= 1) sawTriple = true
      best = Math.max(best, pairs + 2 * triples)
    }
    const occ = this.occupancyOf(scratch.slides)
    const calm = Math.max(...occ) <= 2.6
    return { pass: bestPairs >= 2 && sawTriple && calm, value: best - (calm ? 0 : 2) }
  }

  // --- geometry -------------------------------------------------------------

  private dimensions(sizeFrac: number, aspect: number): { w: number; h: number } {
    const vp = this.viewport
    const sPx = clamp(sizeFrac * vp.short, SIZE_PX_MIN, Math.min(SIZE_PX_MAX, vp.short * 0.82))
    const root = Math.sqrt(aspect)
    return { w: (sPx * root) / vp.height, h: sPx / root / vp.height }
  }

  /** Half-extents of the rotated frame-plus-tab union, and that union's centre. */
  private bounds(s: SlideState): { hx: number; hy: number; cx: number; cy: number } {
    const p = this.tabProudU
    const c = Math.cos(s.rot)
    const sn = Math.sin(s.rot)
    const H = s.h + p
    return {
      hx: (Math.abs(c) * s.w + Math.abs(sn) * H) / 2,
      hy: (Math.abs(sn) * s.w + Math.abs(c) * H) / 2,
      cx: s.x + (p / 2) * sn,
      cy: s.y - (p / 2) * c,
    }
  }

  private proxyRadius(s: SlideState): number {
    return 0.45 * ((s.w + s.h) / 2) * 0.9
  }

  /**
   * Where slide `i` is loosely trying to be at time `t`: a point on an ellipse
   * inscribed in the lightbox, the six spread by golden angle so the homes never
   * clump. Odd slides turn the ring the other way, so the set sweeps through
   * itself instead of holding formation, and the y phase breathes so the path
   * never reads as a circle. Pure in its arguments: a restored frame replays to
   * the same homes, which is what keeps scrubbing exact.
   */
  private homeOf(i: number, t: number, A: number, at: Origin): { x: number; y: number } {
    // Three independent per-slide numbers, from two irrationals so they cannot
    // correlate: how fast the orbit turns, how wide it is, and where it is
    // centred. Six orbits of one radius about one centre is a hexagon, and a
    // hexagon that turns is still a formation however slowly it shears. Giving
    // each slide its own orbit is what makes them read as six objects that
    // happen to share a table rather than one object with six parts.
    const f1 = (i * 0.3819660113) % 1
    const f2 = (i * 0.7548776662) % 1
    const rate = HOME_DRIFT * (0.45 + 1.6 * f1) * (i % 2 === 0 ? 1 : -1)
    const ring = HOME_RING * (0.55 + 0.85 * f2)
    const theta = 2 * Math.PI * ((i * 0.6180339887) % 1) + at.p1 + rate * t
    const wobble = 0.18 * Math.sin(0.013 * t + at.p2 + 2 * Math.PI * f2)
    const cx = 0.5 + HOME_OFFSET * Math.cos(2 * Math.PI * f2 + at.p2)
    const cy = 0.5 + HOME_OFFSET * Math.sin(2 * Math.PI * f1 + at.p1)
    return {
      x: A * (cx + ring * 0.5 * Math.cos(theta)),
      y: cy + ring * 0.5 * Math.sin(theta + wobble),
    }
  }

  private occupancyOf(slides: SlideState[]): number[] {
    const occ = new Array<number>(slides.length).fill(0)
    for (let i = 0; i < slides.length; i++) {
      const a = slides[i] as SlideState
      const ra = this.proxyRadius(a)
      for (let j = i + 1; j < slides.length; j++) {
        const b = slides[j] as SlideState
        const rb = this.proxyRadius(b)
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const ov = clamp(1 - d / (ra + rb), 0, 1)
        occ[i] = (occ[i] as number) + ov
        occ[j] = (occ[j] as number) + ov
      }
    }
    return occ
  }

  private overlapCounts(slides: SlideState[]): { pairs: number; triples: number } {
    const n = slides.length
    const hit: boolean[][] = []
    for (let i = 0; i < n; i++) hit.push(new Array<boolean>(n).fill(false))
    let pairs = 0
    for (let i = 0; i < n; i++) {
      const a = slides[i] as SlideState
      for (let j = i + 1; j < n; j++) {
        const b = slides[j] as SlideState
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        const touching = d < 0.85 * (this.proxyRadius(a) + this.proxyRadius(b))
        hit[i]![j] = touching
        hit[j]![i] = touching
        if (touching) pairs++
      }
    }
    let triples = 0
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++)
        for (let k = j + 1; k < n; k++) if (hit[i]![j] && hit[j]![k] && hit[i]![k]) triples++
    return { pairs, triples }
  }

  overlapPairs(): number {
    return this.overlapCounts(this.state.slides).pairs
  }

  overlapCountsNow(): { pairs: number; triples: number } {
    return this.overlapCounts(this.state.slides)
  }

  occupancy(): number[] {
    return this.occupancyOf(this.state.slides)
  }

  /** Largest set of slides that are all mutually overlapping. */
  largestCluster(): number {
    const slides = this.state.slides
    const n = slides.length
    let best = n ? 1 : 0
    const adj: boolean[][] = []
    for (let i = 0; i < n; i++) adj.push(new Array<boolean>(n).fill(false))
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const a = slides[i] as SlideState
        const b = slides[j] as SlideState
        const t = Math.hypot(a.x - b.x, a.y - b.y) < 0.85 * (this.proxyRadius(a) + this.proxyRadius(b))
        adj[i]![j] = t
        adj[j]![i] = t
      }
    const grow = (members: number[], start: number): void => {
      best = Math.max(best, members.length)
      for (let k = start; k < n; k++) {
        if (members.every((m) => adj[m]![k])) {
          members.push(k)
          grow(members, k + 1)
          members.pop()
        }
      }
    }
    for (let i = 0; i < n; i++) grow([i], i + 1)
    return best
  }

  // --- stepping -------------------------------------------------------------

  step(reducedMotion: boolean): void {
    this.advance(this.state, this.runtime, this.origin, DT, reducedMotion)
  }

  private advance(
    st: SimState,
    runtime: SlideRuntime[],
    origin: Origin,
    dt: number,
    reduced: boolean,
  ): void {
    st.t += dt
    const t = st.t
    const A = st.aspect
    const slides = st.slides
    const occ = this.occupancyOf(slides)

    const speedScale = reduced ? REDUCED_SPEED : 1
    const omegaScale = reduced ? REDUCED_OMEGA : 1

    for (let i = 0; i < slides.length; i++) {
      const s = slides[i] as SlideState
      const rt = runtime[i] as SlideRuntime
      const o = occ[i] as number
      // Adopt the stream position recorded on the slide. After a scrub this is a
      // restored value, which is exactly why the future replays identically.
      rt.rng.state = s.rngState

      // Held: the user has it under a pointer or has selected it to study. All
      // kinematics stop dead, including the clocks, so it resumes on exactly
      // the heading it stopped on. Colour is not kinematics: a regenerate has
      // to dissolve in a slide that is being held still, and the slow drift
      // carries on for the same reason. Click stops a slide moving; pinning is
      // what stops it changing colour.
      if (s.held) {
        this.colourStep(s, dt, t)
        continue
      }

      // --- steering, in degrees per second ---
      const nHdg =
        0.65 * vnoise(rt.noise[0] as Float32Array, t / 9) + 0.35 * vnoise(rt.noise[1] as Float32Array, t / 23)
      let steer = WANDER_GAIN_DEG * (2 * nHdg - 1)

      // Home: a point on a slowly turning ellipse that covers the whole box, one
      // per slide. Each slide turns the ring at its own rate, so the formation
      // shears instead of rotating rigidly, which would read as choreography.
      // Territories overlap far more than they exclude, so slides still cross
      // constantly; what they no longer do is all sit in the middle.
      const home = this.homeOf(i, t, A, origin)
      const dhx = home.x - s.x
      const dhy = home.y - s.y
      // Normalised per axis. A circular leash on a 16:10 box wastes the width.
      const r = Math.hypot(dhx / (A / 2), dhy / 0.5)
      const pull = smoothstep(HOME_SLACK[0], HOME_SLACK[1], r)
      if (pull > 0) {
        // Led, not aimed. Steering straight at a point parks the slide on
        // whatever heading joins the two, and often enough that is horizontal:
        // axis dwell went from 5% to 13% on one seed. The lead turns the
        // approach into a spiral, in the same direction the slide's home orbits.
        const lead = Math.atan2(dhy, dhx) + (i % 2 === 0 ? HOME_LEAD : -HOME_LEAD)
        steer += HOME_GAIN_DEG * pull * turnSign(s.heading, lead)
      }

      // Contact clock. Rises while touching anything at all, unwinds faster than
      // it rises, so a slide that brushes past repeatedly does not accumulate a
      // grudge it never had time to earn.
      s.stickyTimer =
        o > STICKY_TRIGGER ? s.stickyTimer + dt : Math.max(0, s.stickyTimer - STICKY_DECAY * dt)

      if (o > STICKY_TRIGGER) {
        let wx = 0
        let wy = 0
        let wsum = 0
        for (let j = 0; j < slides.length; j++) {
          if (j === i) continue
          const b = slides[j] as SlideState
          const d = Math.hypot(s.x - b.x, s.y - b.y)
          const ov = clamp(1 - d / (this.proxyRadius(s) + this.proxyRadius(b)), 0, 1)
          if (ov <= 0) continue
          wx += b.x * ov
          wy += b.y * ov
          wsum += ov
        }
        if (wsum > 0) {
          // Two separate reasons to leave, same bearing: too many neighbours
          // right now, or one neighbour for too long.
          let gain =
            o > CROWD_TRIGGER
              ? o > 2.2
                ? CROWD_GAIN_HARD_DEG
                : CROWD_GAIN_DEG * smoothstep(CROWD_TRIGGER, 2, o)
              : 0
          gain +=
            STICKY_GAIN_DEG * smoothstep(STICKY_AFTER_S, STICKY_AFTER_S + STICKY_RAMP_S, s.stickyTimer)
          if (gain > 0) steer -= gain * turnSign(s.heading, Math.atan2(wy / wsum - s.y, wx / wsum - s.x))
        }
      }

      s.lonelyTimer = o < 0.05 ? s.lonelyTimer + dt : 0
      if (s.lonelyTimer > LONELY_AFTER_S && o < 0.35) {
        let nearest = -1
        let nd = Infinity
        for (let j = 0; j < slides.length; j++) {
          if (j === i) continue
          const b = slides[j] as SlideState
          const d = Math.hypot(s.x - b.x, s.y - b.y)
          if (d < nd) {
            nd = d
            nearest = j
          }
        }
        if (nearest >= 0) {
          const b = slides[nearest] as SlideState
          steer += LONELY_GAIN_DEG * turnSign(s.heading, Math.atan2(b.y - s.y, b.x - s.x))
        }
      }

      // Anti-axis, the steering counterpart of the bounce guard. Pushes away from
      // whichever axis is nearest, hardest when the heading is right on it, so a
      // slide passes through an axis but never settles on one. Ties break on slide
      // parity rather than a draw, because a plain tick must not touch the PRNG.
      const axisGap = wrapPi(s.heading - Math.round(s.heading / (Math.PI / 2)) * (Math.PI / 2))
      const axisWindow = AXIS_ESCAPE_DEG * DEG
      if (Math.abs(axisGap) < axisWindow) {
        const away = axisGap === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(axisGap)
        steer += AXIS_ESCAPE_GAIN_DEG * (1 - Math.abs(axisGap) / axisWindow) * away
      }

      s.heading += clampAbs(steer, STEER_CLAMP_DEG) * DEG * dt

      // --- soft catch recovery ---
      if (s.catchUntil > 0) {
        if (t >= s.catchUntil) {
          s.speed0 = s.speedPre
          s.catchUntil = 0
        } else {
          const remaining = (s.catchUntil - t) / SOFT_CATCH_RECOVER
          s.speed0 = s.speedPre * (SOFT_CATCH_FACTOR + (1 - SOFT_CATCH_FACTOR) * (1 - remaining))
        }
      }

      // --- advance ---
      const breath = 0.82 + 0.36 * vnoise(rt.noise[2] as Float32Array, t / 13)
      const v = s.speed0 * breath * (0.88 + 0.24 * s.z) * speedScale
      s.x += Math.cos(s.heading) * v * dt
      s.y += Math.sin(s.heading) * v * dt

      const rotBreath = 0.7 + 0.6 * vnoise(rt.noise[3] as Float32Array, t / 17)
      s.rot += s.omegaRot * rotBreath * omegaScale * dt
      if (Math.abs(s.rot) > ROT_RESTORE_DEG * DEG) {
        s.omegaRot = clampAbs(s.omegaRot - Math.sign(s.rot) * 0.05 * DEG * (60 * dt), OMEGA_MAX_DEG * DEG)
      }

      s.z += (s.zTarget - s.z) * (1 - Math.exp(-dt / DEPTH_EASE_TAU))

      for (let k = 0; k < 4; k++) s.cd[k] = Math.max(0, (s.cd[k] as number) - dt)

      this.resolveWalls(s, rt, t, A)
      s.rngState = rt.rng.state

      this.colourStep(s, dt, t)
    }
  }

  /**
   * Colour only, with no kinematics: the regenerate tween, the lock gate and
   * the slow autonomous drift.
   *
   * Public because it also has to run while the stage is paused. A regenerate
   * must dissolve on a frozen composition, and the instrument drives that from
   * the wall clock. The drift itself is a function of `state.t`, which does not
   * advance while paused, so pausing stops the colours dead with everything
   * else even though this keeps being called.
   */
  tickColour(dt: number): void {
    for (const s of this.state.slides) this.colourStep(s, dt, this.state.t)
  }

  private colourStep(s: SlideState, dt: number, t: number): void {
    if (s.tweenT < 1) {
      if (s.tweenDelay > 0) {
        s.tweenDelay = Math.max(0, s.tweenDelay - dt)
      } else {
        s.tweenT = Math.min(1, s.tweenT + dt / (TWEEN_MS / 1000))
        s.dyeBase = mixDye(s.dyeFrom, s.dyeTo, s.tweenT)
      }
    }

    const target = s.locked ? 0 : 1
    if (s.driftGate !== target) {
      const step = dt / DRIFT_GATE_S
      s.driftGate =
        target > s.driftGate ? Math.min(target, s.driftGate + step) : Math.max(target, s.driftGate - step)
    }

    s.dye = driftDye(s.dyeBase, s.id, t, s.driftGate, this.hueRoom(s))
  }

  /**
   * How much of the drift's hue excursion this slide may actually spend, as a
   * fraction of DRIFT_HUE_DEG. Half the distance to its nearest neighbour,
   * less the separation the two of them have to keep: both ends move, so half
   * each is what makes the arithmetic come out. A slide with the wheel to
   * itself wanders the full amount, one with a close neighbour stays home.
   *
   * Derived from `dyeBase`, which is in the history, so it needs no lane of
   * its own and it follows a regenerate through the crossfade.
   */
  private hueRoom(s: SlideState): number {
    let nearest = 180
    for (const o of this.state.slides) {
      if (o === s) continue
      const d = Math.abs(((((o.dyeBase.h - s.dyeBase.h) % 360) + 540) % 360) - 180)
      if (d < nearest) nearest = d
    }
    const allowed = Math.max(DRIFT_MIN_DEG, (nearest - DRIFT_KEEP_DEG) / 2)
    return clamp(allowed / DRIFT_HUE_DEG, 0, 1)
  }

  /**
   * Containment is total: the union of the frame and its tab never leaves the
   * lightbox, because a hex code you cannot read is a functional failure.
   * Exactly six draws are consumed per contact, including one that is sometimes
   * discarded, so a test can assert the stream position from the bounce count.
   */
  private resolveWalls(s: SlideState, rt: SlideRuntime, t: number, A: number): void {
    const eps = 0.5 / this.viewport.height
    for (let pass = 0; pass < 2; pass++) {
      const b = this.bounds(s)
      let wall = -1
      let push = 0
      if (b.cx - b.hx < 0) {
        wall = 0
        push = -(b.cx - b.hx)
      } else if (b.cx + b.hx > A) {
        wall = 1
        push = A - (b.cx + b.hx)
      } else if (b.cy - b.hy < 0) {
        wall = 2
        push = -(b.cy - b.hy)
      } else if (b.cy + b.hy > 1) {
        wall = 3
        push = 1 - (b.cy + b.hy)
      }
      if (wall < 0) return

      const horizontal = wall === 0 || wall === 1
      if (horizontal) s.x += push + Math.sign(push) * eps
      else s.y += push + Math.sign(push) * eps

      if ((s.cd[wall] as number) > 0) return

      const normalAngle = wall === 0 ? 0 : wall === 1 ? Math.PI : wall === 2 ? Math.PI / 2 : -Math.PI / 2

      s.heading = horizontal ? Math.PI - s.heading : -s.heading
      s.heading += rt.rng.spread(BOUNCE_ANGLE_JITTER_DEG) * DEG
      s.speed0 = clamp(
        s.speed0 * rt.rng.range(BOUNCE_SPEED_JITTER[0], BOUNCE_SPEED_JITTER[1]),
        SPEED_MIN,
        SPEED_MAX,
      )

      // Anti-axis-lock. Without it slides ping-pong on one axis or skate along an
      // edge within the first minute, and no amount of good colour rescues that.
      const tiebreak = rt.rng.next()
      const off = wrapPi(s.heading - normalAngle)
      const sgn = off === 0 ? (tiebreak < 0.5 ? -1 : 1) : Math.sign(off)
      const mag = clamp(Math.abs(off), AXIS_LOCK_MIN_DEG * DEG, AXIS_LOCK_MAX_DEG * DEG)
      s.heading = normalAngle + sgn * mag

      s.omegaRot = clampAbs(s.omegaRot + rt.rng.spread(0.5) * DEG, OMEGA_MAX_DEG * DEG)
      if (Math.abs(s.omegaRot) < OMEGA_MIN_DEG * DEG) {
        s.omegaRot = (s.omegaRot < 0 ? -1 : 1) * OMEGA_MIN_DEG * DEG
      }

      s.zTarget = clamp(s.zTarget + rt.rng.spread(0.18), 0, 1)

      if (rt.rng.chance(SOFT_CATCH_CHANCE) && s.catchUntil === 0) {
        s.speedPre = s.speed0
        s.speed0 *= SOFT_CATCH_FACTOR
        s.catchUntil = t + SOFT_CATCH_RECOVER
      } else if (s.catchUntil === 0) {
        s.speedPre = s.speed0
      }

      s.cd[wall] = BOUNCE_COOLDOWN
    }
  }

  // --- external mutations ---------------------------------------------------

  setViewport(vp: Viewport): void {
    const prev = this.viewport
    this.viewport = vp
    this.tabProudU = TAB_PROUD / vp.height

    if (vp.slideCount !== this.state.slides.length) {
      const pinned = new Map(
        this.state.slides.filter((s) => s.locked).map((s) => [s.id, cloneDye(s.dye)]),
      )
      this.buildLayout(vp.slideCount, pinned)
      return
    }

    const scale = vp.aspect / prev.aspect
    this.state.aspect = vp.aspect
    for (const s of this.state.slides) {
      s.x *= scale
      const dim = this.dimensions(s.sizeFrac, s.aspect)
      s.w = dim.w
      s.h = dim.h
      this.depenetrate(s, vp.aspect)
    }
  }

  private depenetrate(s: SlideState, A: number): void {
    for (let pass = 0; pass < 3; pass++) {
      const b = this.bounds(s)
      let moved = false
      if (b.cx - b.hx < 0) {
        s.x += -(b.cx - b.hx)
        moved = true
      } else if (b.cx + b.hx > A) {
        s.x += A - (b.cx + b.hx)
        moved = true
      }
      if (b.cy - b.hy < 0) {
        s.y += -(b.cy - b.hy)
        moved = true
      } else if (b.cy + b.hy > 1) {
        s.y += 1 - (b.cy + b.hy)
        moved = true
      }
      if (!moved) return
    }
  }

  /**
   * Place a slide by hand. The same containment every other mutation goes
   * through, so a slide cannot be dropped half outside the lightbox.
   */
  moveTo(id: number, x: number, y: number): void {
    const s = this.state.slides.find((v) => v.id === id)
    if (!s) return
    s.x = x
    s.y = y
    this.depenetrate(s, this.state.aspect)
  }

  /** Stop a slide where it stands, or let it go again. */
  setHeld(id: number | null): void {
    for (const s of this.state.slides) s.held = s.id === id
  }

  setSizeFrac(id: number, sizeFrac: number): void {
    const s = this.state.slides.find((x) => x.id === id)
    if (!s) return
    s.sizeFrac = clamp(sizeFrac, SIZE_FRAC_MIN, SIZE_FRAC_MAX)
    const dim = this.dimensions(s.sizeFrac, s.aspect)
    s.w = dim.w
    s.h = dim.h
    this.depenetrate(s, this.state.aspect)
  }

  /**
   * Pin a colour, or let it go again.
   *
   * Locking freezes the drift, and it freezes it on the colour that is on
   * screen: the base becomes what you were looking at when you pinned it, so
   * the swatch in the tray and the hex on the slide agree and stay agreeing.
   * Unlocking eases the excursion back in over a couple of seconds rather than
   * snapping to wherever the waypoints have got to in the meantime.
   */
  setLocked(id: number, locked: boolean): void {
    const s = this.state.slides.find((v) => v.id === id)
    if (!s) return
    s.locked = locked
    if (locked) {
      s.dyeBase = cloneDye(s.dye)
      s.dyeFrom = cloneDye(s.dye)
      s.dyeTo = cloneDye(s.dye)
      s.tweenT = 1
      s.tweenDelay = 0
      s.driftGate = 0
    }
  }

  /** Apply colours with no transition. Used on first load. */
  setPalette(dyes: Dye[]): void {
    this.state.slides.forEach((s, i) => {
      const d = dyes[i]
      if (!d) return
      s.dyeBase = cloneDye(d)
      s.dyeFrom = cloneDye(d)
      s.dyeTo = cloneDye(d)
      s.tweenT = 1
      s.tweenDelay = 0
    })
    // Second pass: the room each slide has depends on where the others landed.
    for (const s of this.state.slides) {
      s.dye = driftDye(s.dyeBase, s.id, this.state.t, s.driftGate, this.hueRoom(s))
    }
    this.state.paletteEpoch += 1
  }

  /** Dissolve to new colours, deepest slide first. Motion is untouched. */
  applyPalette(dyes: Dye[]): void {
    const byDepth = this.state.slides.map((s, i) => ({ i, z: s.z })).sort((a, b) => a.z - b.z)
    byDepth.forEach((entry, rank) => {
      const s = this.state.slides[entry.i] as SlideState
      const next = dyes[entry.i]
      if (!next) return
      // From the base, not from the displayed colour: the drift offset is
      // continuous across the roll and gets re-applied on top of whatever the
      // crossfade has reached, so the dissolve starts from exactly where the
      // eye already is.
      s.dyeFrom = cloneDye(s.dyeBase)
      s.dyeTo = cloneDye(next)
      s.tweenT = 0
      s.tweenDelay = (rank * TWEEN_STAGGER_MS) / 1000
    })
    this.state.paletteEpoch += 1
  }
}

/** Which way to turn to aim at `target`. Never returns 0. */
function turnSign(heading: number, target: number): number {
  const d = wrapPi(target - heading)
  return d < 0 ? -1 : 1
}
