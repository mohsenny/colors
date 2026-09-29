/**
 * The interiors.
 *
 * Everything inside the mounts is painted here, on one canvas that sits under
 * every slide's chrome and multiplies into the lit surface. The white mounts,
 * tabs, shadows and hit testing stay in the DOM (see stage.ts); only the colour
 * comes through here.
 *
 * Why a canvas at all. The old build gave every slide three blended DOM layers
 * and let `mix-blend-mode: multiply` do the mixing. That works, and it is real
 * optics, but the mix it produces is an RGB channel product, which is the wrong
 * model for looking at colour: yellow over blue came out olive grey instead of
 * green (core/pigment.ts opens with the full argument). Computing the mix means
 * owning the compositing, and owning the compositing means one surface.
 *
 * Two things fell out of the change. Twenty-one blended layers became one
 * canvas, and the mix became a pure function that a unit test can hold to
 * "yellow over blue is green".
 *
 * How the regions are found. Every distinct region of the stage is defined by
 * the SET of slides covering it, so the painter walks the subsets: start from
 * each slide's interior, clip it against a later slide, recurse. Regions are
 * then filled in order of increasing set size, which is the one detail that
 * makes this look seamless: a region of k+1 slides is by construction strictly
 * inside every region of k it came from, so each fill lands on solid paint
 * rather than on the edge between paint and background, and no antialiasing
 * seam can appear between neighbouring regions.
 */

import { CORNER_INNER, SLIDE_COUNT_MAX } from '../core/constants'
import { litRect } from '../core/lit'
import { encode, filmLinear } from '../core/oklab'
import { blendModes, filmStat, filmToRyb, mixFilm, stackLight } from '../core/pigment'
import type { Ryb, SheetStat } from '../core/pigment'
import type { RenderOptions, SimState, SlideState, Viewport } from '../core/types'

/** Depth luminance lift: 2% toward white for a slide at the top of the stack. */
const LIFT_PER_Z = 0.02

/**
 * The sheen. Dyed acetate is never perfectly even, and a sheet held over a lamp
 * thins where the light catches it. Painted in the slide's own frame, so it
 * turns with the slide: a fixed-angle highlight on a turning object reads as a
 * screen effect instantly. White means less dye.
 */
const SHEEN_ANGLE = 148
const SHEEN_HIGH = 0.055
const SHEEN_LOW = 0.02

/** The film's own edge, darkened so the sheet reads as seated in its mount. */
const LIP_ALPHA = 0.045
const LIP_PX = 0.6

/** Regions smaller than this many square px are not worth a fill. */
const MIN_AREA = 0.5

interface Sheet {
  id: number
  /** Interior quad, world px, clockwise from the top-left corner. */
  poly: number[]
  cx: number
  cy: number
  hw: number
  hh: number
  rot: number
  z: number
  film: [number, number, number]
  ryb: Ryb
  stat: SheetStat
}

interface Cached {
  L: number
  C: number
  h: number
  d: number
  film: [number, number, number]
  ryb: Ryb
  stat: SheetStat
}

interface Region {
  poly: number[]
  set: number[]
  /** Area of the intersection of `set`, world px². Not the visible area. */
  area: number
  /** `set` as bits, so a superset test is one AND. Bounded by SLIDE_COUNT_MAX. */
  mask: number
  /** The region's own colour, linear sRGB, lifted. Written by the fill pass. */
  linear: [number, number, number]
  /** Area covered by exactly this set and no more. Written by integrateField. */
  exclusive: number
}

/** What `integrateField` needs of a region. The Painter's `Region` is one. */
export interface FieldRegion {
  area: number
  mask: number
  linear: readonly [number, number, number]
  exclusive: number
}

/**
 * The colour of the whole lit surface, area-weighted, in linear sRGB.
 *
 * Partitive mixing: what the eye does at a distance, and the honest
 * counterpart to the transmittance product the sheets themselves are built
 * on. It is not a mean of the dyes. Bare lit surface counts as white and
 * counts by its area, so a nearly empty box is nearly white, which is the
 * reason the cast strengthens on its own as the field fills up.
 *
 * The regions the walk produces are NOT disjoint. A region for a set S is the
 * full intersection of S, and every region for a superset of S lies inside
 * it, so summing them directly counts an overlap once for every subset of the
 * sheets covering it. Each region's exclusive area therefore comes out by
 * Mobius inversion over the lattice the walk has already enumerated: the area
 * covered by exactly S is A(S) less the exclusive areas of all its strict
 * supersets. Deepest level first, so every superset is resolved before the
 * subsets that need it are read.
 *
 * The same disjoint areas answer the other question the tabs ask: what share
 * of the surface is this one sheet's doing. Credit is 1/k, each disjoint
 * region's area split equally among the k sheets covering it, which is the
 * only split that is order free. There is no topmost sheet in this renderer to
 * hand the whole region to, the shares sum to the covered fraction rather than
 * past 100%, and a sheet's number falls when another sheet crosses it while
 * the total climbs, which is the reading the tabs are for. Written into
 * `shares` by sheet index, the same bit positions the masks are built from.
 *
 * Writes into `out` and `shares`, returns the covered fraction, allocates
 * nothing.
 */
export function integrateField(
  levels: readonly (readonly FieldRegion[])[],
  litArea: number,
  out: [number, number, number],
  shares?: Float64Array | number[],
): number {
  if (shares) for (let i = 0; i < shares.length; i++) shares[i] = 0
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let covered = 0

  for (let depth = levels.length - 1; depth >= 0; depth--) {
    const here = levels[depth] as readonly FieldRegion[]
    for (let i = 0; i < here.length; i++) {
      const s = here[i] as FieldRegion
      let exclusive = s.area
      for (let d2 = depth + 1; d2 < levels.length; d2++) {
        const deeper = levels[d2] as readonly FieldRegion[]
        for (let j = 0; j < deeper.length; j++) {
          const t = deeper[j] as FieldRegion
          if ((t.mask & s.mask) === s.mask) exclusive -= t.exclusive
        }
      }
      // Clamped because the walk prunes subtrees under MIN_AREA, so a missing
      // deep region can leave its parent a fraction of a pixel negative.
      if (exclusive < 0) exclusive = 0
      s.exclusive = exclusive
      covered += exclusive
      if (shares && exclusive > 0) {
        // Walks the set bits rather than every sheet, because the deep levels
        // are where the region count is and their sets are the small ones.
        let bits = 0
        for (let m = s.mask; m; m &= m - 1) bits++
        const credit = exclusive / bits
        for (let m = s.mask; m; m &= m - 1) {
          const i2 = 31 - Math.clz32(m & -m)
          if (i2 < shares.length) shares[i2] = (shares[i2] as number) + credit
        }
      }
      rSum += exclusive * (s.linear[0] as number)
      gSum += exclusive * (s.linear[1] as number)
      bSum += exclusive * (s.linear[2] as number)
    }
  }

  const bare = litArea - covered
  if (bare > 0) {
    rSum += bare
    gSum += bare
    bSum += bare
  }
  const k = litArea > 0 ? 1 / litArea : 0
  out[0] = rSum * k
  out[1] = gSum * k
  out[2] = bSum * k
  // Against the lit area, so a share is a share of the room the sheet is
  // actually in. A room of zero width gives every sheet zero, which is true
  // and is the only finite answer.
  if (shares) for (let i = 0; i < shares.length; i++) shares[i] = (shares[i] as number) * k
  return litArea > 0 ? covered / litArea : 0
}

function shoelace(p: readonly number[]): number {
  const n = p.length / 2
  if (n < 3) return 0
  let a = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    a += (p[2 * i] as number) * (p[2 * j + 1] as number)
    a -= (p[2 * j] as number) * (p[2 * i + 1] as number)
  }
  return Math.abs(a) / 2
}

/** Clip a convex polygon to the half-plane nx*x + ny*y <= c. Sutherland-Hodgman. */
function clipHalf(src: readonly number[], nx: number, ny: number, c: number): number[] {
  const out: number[] = []
  const n = src.length / 2
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ax = src[2 * i] as number
    const ay = src[2 * i + 1] as number
    const bx = src[2 * j] as number
    const by = src[2 * j + 1] as number
    const da = nx * ax + ny * ay - c
    const db = nx * bx + ny * by - c
    if (da <= 0) out.push(ax, ay)
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
      const t = da / (da - db)
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t)
    }
  }
  return out
}

/** Clip against a slide's interior: four half-planes in the slide's own frame. */
function clipToSheet(poly: readonly number[], s: Sheet): number[] {
  const ux = Math.cos(s.rot)
  const uy = Math.sin(s.rot)
  const du = ux * s.cx + uy * s.cy
  const dv = -uy * s.cx + ux * s.cy
  let p = clipHalf(poly, ux, uy, du + s.hw)
  if (p.length < 6) return p
  p = clipHalf(p, -ux, -uy, -du + s.hw)
  if (p.length < 6) return p
  p = clipHalf(p, -uy, ux, dv + s.hh)
  if (p.length < 6) return p
  return clipHalf(p, uy, -ux, -dv + s.hh)
}

function hex2(v: number): string {
  return v.toString(16).toUpperCase().padStart(2, '0')
}

function byte(x: number): number {
  const v = encode(x)
  return Math.round((v < 0 ? 0 : v > 1 ? 1 : v) * 255)
}

export class Painter {
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D | null
  private readonly cache = new Map<number, Cached>()
  private readonly sheets: Sheet[] = []
  private readonly levels: Region[][] = []
  private dpr = 1
  /**
   * The colour of the whole lit surface as of the last draw, linear sRGB, and
   * how much of it the sheets cover. Read by the Stage, which gels the tubes
   * with it. Mutated in place: nothing here allocates per frame.
   */
  readonly field: [number, number, number] = [1, 1, 1]
  coverage = 0
  /**
   * Each sheet's share of the lit surface, by sheet index, as of the last
   * draw. Allocated once at the largest legal count and written in place.
   */
  private readonly shares = new Float64Array(SLIDE_COUNT_MAX)
  /**
   * Slides that are live but have no lit area: clipped away by the paper, or
   * shrunk past a pixel. Their share is zero rather than missing, which is a
   * different answer from a slide that is not on the stage at all.
   */
  private readonly dark: number[] = []
  /** The blend mix of the last draw, so a sample answers for what is on screen. */
  private lastMix = 0
  /** Left edge of the lit area at the last draw, in stage px. Paper's width. */
  private litX0 = 0
  private cssW = 0
  private cssH = 0

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'lb-paint'
    this.canvas.setAttribute('aria-hidden', 'true')
    root.prepend(this.canvas)
    // alpha is required: everything outside a slide has to stay transparent so
    // the multiply leaves the lit surface exactly as it is.
    this.ctx = this.canvas.getContext('2d', { alpha: true })
  }

  destroy(): void {
    this.canvas.remove()
    this.cache.clear()
  }

  resize(vp: Viewport): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)
    if (vp.width === this.cssW && vp.height === this.cssH && dpr === this.dpr) return
    this.cssW = vp.width
    this.cssH = vp.height
    this.dpr = dpr
    this.canvas.width = Math.max(1, Math.round(vp.width * dpr))
    this.canvas.height = Math.max(1, Math.round(vp.height * dpr))
    this.canvas.style.width = `${vp.width}px`
    this.canvas.style.height = `${vp.height}px`
  }

  draw(state: SimState, opts: RenderOptions): void {
    const ctx = this.ctx
    if (!ctx) return
    const vp = opts.viewport
    this.resize(vp)

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    ctx.clearRect(0, 0, vp.width, vp.height)

    // The lit area, in the stage pixels this canvas is drawn in. Held on the
    // painter because `sampleAt` has to refuse the same region between draws.
    const lit = litRect(state.aspect, state.crowd)
    this.litX0 = lit.x0 * vp.height

    /*
     * Everything is clipped to the lit area, not just the region polys below.
     * The mount is only 95.5% white, so paint left under the paper would come
     * through it at 4.5%: a saturated sheet reads as three or four bytes of
     * colour bleeding into a surface that is supposed to be blank card. The
     * polys are clipped as well because the field integral measures them, and
     * the clip is a raster operation the arithmetic cannot see.
     */
    const clipped = this.litX0 > 0
    if (clipped) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(this.litX0, 0, vp.width - this.litX0, vp.height)
      ctx.clip()
    }

    const sheets = this.collect(state, opts)
    const n = sheets.length
    if (n === 0) {
      // Nothing to integrate, but the shares from the last draw are no longer
      // true of anything: a stale number on a tab is worse than a zero.
      this.shares.fill(0)
      if (clipped) ctx.restore()
      return
    }

    // --- find every region ----------------------------------------------------
    const levels = this.levels
    for (let i = 0; i < levels.length; i++) (levels[i] as Region[]).length = 0
    const push = (depth: number, poly: number[], set: number[], area: number): void => {
      while (levels.length <= depth) levels.push([])
      let mask = 0
      for (let i = 0; i < set.length; i++) mask |= 1 << (set[i] as number)
      ;(levels[depth] as Region[]).push({
        poly,
        set,
        area,
        mask,
        linear: [0, 0, 0],
        exclusive: 0,
      })
    }

    const walk = (poly: number[], set: number[], next: number, area: number): void => {
      push(set.length - 1, poly, set.slice(), area)
      for (let j = next; j < n; j++) {
        const clipped = clipToSheet(poly, sheets[j] as Sheet)
        if (clipped.length < 6) continue
        // Already needed to decide whether the region exists at all, so
        // keeping it is free and it is the only area measured in the frame.
        const a = shoelace(clipped)
        if (a < MIN_AREA) continue
        set.push(j)
        walk(clipped, set, j + 1, a)
        set.pop()
      }
    }
    for (let i = 0; i < n; i++) {
      const s = sheets[i] as Sheet
      walk(s.poly, [i], i + 1, shoelace(s.poly))
    }

    // --- fill, thinnest stack first ------------------------------------------
    const mix = state.modeMix < 0 ? 0 : state.modeMix > 1 ? 1 : state.modeMix
    this.lastMix = mix
    for (let depth = 0; depth < levels.length; depth++) {
      const regions = levels[depth] as Region[]
      for (let r = 0; r < regions.length; r++) {
        const region = regions[r] as Region
        const lin = this.linearFor(region.set, sheets, mix)
        region.linear = lin
        ctx.fillStyle = `rgb(${byte(lin[0])},${byte(lin[1])},${byte(lin[2])})`
        if (depth === 0) {
          const s = sheets[region.set[0] as number] as Sheet
          this.pathRounded(ctx, s)
        } else {
          this.pathPoly(ctx, region.poly)
        }
        ctx.fill()
      }
    }

    // --- per-sheet material ---------------------------------------------------
    for (let i = 0; i < n; i++) this.material(ctx, sheets[i] as Sheet)

    if (clipped) ctx.restore()

    // Against the LIT area, not the viewport. Surface under paper is not bare
    // white waiting to be covered, it is not surface: counting it would keep
    // the field pale exactly as the room gets small and the crowding starts.
    this.coverage = integrateField(
      this.levels,
      (vp.width - this.litX0) * vp.height,
      this.field,
      this.shares,
    )
  }

  // --- pieces ----------------------------------------------------------------

  private collect(state: SimState, opts: RenderOptions): Sheet[] {
    const vp = opts.viewport
    const vh = vp.height
    const slides = state.slides
    const sheets = this.sheets
    sheets.length = 0
    this.dark.length = 0

    const live = new Set<number>()
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i]
      if (!slide) continue
      live.add(slide.id)
      const hw = Math.max(0, (slide.w * vh) / 2 - vp.frame)
      const hh = Math.max(0, (slide.h * vh) / 2 - vp.frame)
      if (hw < 0.5 || hh < 0.5) {
        this.dark.push(slide.id)
        continue
      }
      const c = this.colours(slide)
      const cx = slide.x * vh
      const cy = slide.y * vh
      const cos = Math.cos(slide.rot)
      const sin = Math.sin(slide.rot)
      const corner = (sx: number, sy: number): [number, number] => [
        cx + sx * hw * cos - sy * hh * sin,
        cy + sx * hw * sin + sy * hh * cos,
      ]
      const [x0, y0] = corner(-1, -1)
      const [x1, y1] = corner(1, -1)
      const [x2, y2] = corner(1, 1)
      const [x3, y3] = corner(-1, 1)
      // Clipped to the lit area before the walk, because the walk's areas are
      // what the field is integrated over. Nothing clipped sheets to anything
      // before crowding: it worked only because the simulation kept them in
      // the box, and paper is the first thing that overlaps a sheet without
      // moving it. Left untouched when no paper is in, so the frame allocates
      // exactly what it always did.
      let poly = [x0, y0, x1, y1, x2, y2, x3, y3]
      if (this.litX0 > 0) {
        poly = clipHalf(poly, -1, 0, -this.litX0)
        if (poly.length < 6) {
          this.dark.push(slide.id)
          continue
        }
      }
      sheets.push({
        id: slide.id,
        poly,
        cx,
        cy,
        hw,
        hh,
        rot: slide.rot,
        z: slide.z,
        film: c.film,
        ryb: c.ryb,
        stat: c.stat,
      })
    }
    for (const id of this.cache.keys()) if (!live.has(id)) this.cache.delete(id)

    // No stacking order here on purpose. Both modes are now functions of the
    // SET of sheets over a point, so the interior cannot disagree with the
    // chrome about which slide is on top: it never asks.
    return sheets
  }

  /** Dye to paint, cached: the RYB inverse is a search, not a formula. */
  private colours(slide: SlideState): Cached {
    const dye = slide.dye
    const hit = this.cache.get(slide.id)
    if (hit && hit.L === dye.L && hit.C === dye.C && hit.h === dye.h && hit.d === dye.d) return hit
    const film = filmLinear(dye)
    const next: Cached = {
      L: dye.L,
      C: dye.C,
      h: dye.h,
      d: dye.d,
      film,
      ryb: filmToRyb(film),
      stat: filmStat(film),
    }
    this.cache.set(slide.id, next)
    return next
  }

  /**
   * One sheet's share of the lit surface, 0 to 1, or null if the last draw
   * knew nothing about that id.
   *
   * Null and zero are different answers and the tab reads them differently. A
   * sheet entirely under the paper shows its mount and its tab over the paper
   * with no colour left inside it, and zero is what it is contributing, so it
   * says so. Null means the painter never saw the slide (the first frame, a
   * missing 2d context), and the tab keeps its hex rather than inventing a
   * number.
   *
   * A linear scan of at most twelve, called once per slide per frame: the map
   * that would replace it costs a per-frame rebuild to save 144 comparisons.
   */
  shareOf(id: number): number | null {
    const sheets = this.sheets
    for (let i = 0; i < sheets.length; i++) {
      if ((sheets[i] as Sheet).id === id) {
        return i < this.shares.length ? (this.shares[i] as number) : null
      }
    }
    for (let i = 0; i < this.dark.length; i++) if (this.dark[i] === id) return 0
    return null
  }

  /**
   * What the box is showing at one point, and which slides are making it.
   *
   * This is the only way to reach an overlap. The crossing of two gels is not
   * any slide's colour and has no element of its own: it is a region this
   * painter computed and filled, and the moment the slides separate it is gone.
   * So the interaction that saves one has to ask the painter, which is what
   * double-clicking the stage does.
   *
   * Reads the sheets retained from the last draw, so it answers for exactly
   * what is on screen, including while paused or scrubbed.
   *
   * `x`/`y` are stage pixels, the same space the canvas is drawn in.
   */
  sampleAt(x: number, y: number): { ids: number[]; hex: string } | null {
    // Under the paper there is no film to sample, only card. The sheets are
    // still there in the simulation, so without this the gesture would return
    // a colour from a part of the box the user cannot see.
    if (x < this.litX0) return null
    const sheets = this.sheets
    const set: number[] = []
    for (let i = 0; i < sheets.length; i++) {
      const s = sheets[i] as Sheet
      const dx = x - s.cx
      const dy = y - s.cy
      const cos = Math.cos(s.rot)
      const sin = Math.sin(s.rot)
      if (Math.abs(dx * cos + dy * sin) <= s.hw && Math.abs(-dx * sin + dy * cos) <= s.hh) {
        set.push(i)
      }
    }
    if (set.length === 0) return null
    const [r, g, b] = this.rgbFor(set, sheets, this.lastMix)
    return {
      ids: set.map((i) => (sheets[i] as Sheet).id),
      hex: `#${hex2(r)}${hex2(g)}${hex2(b)}`,
    }
  }

  /** The mixed colour of a set of sheets, as three bytes. */
  private rgbFor(
    set: readonly number[],
    sheets: readonly Sheet[],
    mix: number,
  ): [number, number, number] {
    const out = this.linearFor(set, sheets, mix)
    return [byte(out[0]), byte(out[1]), byte(out[2])]
  }

  /**
   * The same colour one step earlier, in linear sRGB and already lifted.
   *
   * Split out because the field average has to be summed in linear light: a
   * mean of encoded bytes is a mean of the wrong quantity, and the error is
   * worst at the pale end, which is where a lightbox spends all of its time.
   */
  private linearFor(
    set: readonly number[],
    sheets: readonly Sheet[],
    mix: number,
  ): [number, number, number] {
    const pigments: Ryb[] = []
    const films: [number, number, number][] = []
    const stats: SheetStat[] = []
    let zSum = 0
    for (let i = 0; i < set.length; i++) {
      const s = sheets[set[i] as number] as Sheet
      pigments.push(s.ryb)
      films.push(s.film)
      stats.push(s.stat)
      zSum += s.z
    }

    let out = mixFilm(pigments, films, stats)
    if (mix > 0) out = blendModes(out, stackLight(films), mix)

    // Depth, as brightness. Averaged over the set so the lift cannot depend on
    // stacking order, which the mix itself never does.
    const lift = LIFT_PER_Z * (zSum / set.length)
    return [
      out[0] + (1 - out[0]) * lift,
      out[1] + (1 - out[1]) * lift,
      out[2] + (1 - out[2]) * lift,
    ]
  }

  private pathPoly(ctx: CanvasRenderingContext2D, poly: readonly number[]): void {
    ctx.beginPath()
    ctx.moveTo(poly[0] as number, poly[1] as number)
    for (let i = 1; i < poly.length / 2; i++) {
      ctx.lineTo(poly[2 * i] as number, poly[2 * i + 1] as number)
    }
    ctx.closePath()
  }

  /** A lone slide gets the mount's inner radius; overlaps are cut square. The
   *  difference is a pixel and a half, and the mount's border covers it. */
  private pathRounded(ctx: CanvasRenderingContext2D, s: Sheet): void {
    ctx.beginPath()
    if (s.rot === 0) {
      const r = Math.min(CORNER_INNER, s.hw, s.hh)
      ctx.roundRect(s.cx - s.hw, s.cy - s.hh, s.hw * 2, s.hh * 2, r)
      return
    }
    this.pathPoly(ctx, s.poly)
  }

  /** Sheen and lip, in the slide's frame. Both modes: it is film either way. */
  private material(ctx: CanvasRenderingContext2D, s: Sheet): void {
    if (s.hw < 1 || s.hh < 1) return
    ctx.save()
    ctx.translate(s.cx, s.cy)
    if (s.rot !== 0) ctx.rotate(s.rot)
    const w = s.hw * 2
    const h = s.hh * 2
    ctx.beginPath()
    ctx.roundRect(-s.hw, -s.hh, w, h, Math.min(CORNER_INNER, s.hw, s.hh))
    ctx.clip()

    const a = (SHEEN_ANGLE * Math.PI) / 180
    const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
    const gx = (Math.cos(a) * len) / 2
    const gy = (Math.sin(a) * len) / 2
    const grad = ctx.createLinearGradient(-gx, -gy, gx, gy)
    grad.addColorStop(0, `rgba(255,255,255,${SHEEN_HIGH.toFixed(4)})`)
    grad.addColorStop(0.38, 'rgba(255,255,255,0.012)')
    grad.addColorStop(0.62, 'rgba(255,255,255,0)')
    grad.addColorStop(1, `rgba(0,0,0,${SHEEN_LOW.toFixed(4)})`)
    ctx.fillStyle = grad
    ctx.fillRect(-s.hw, -s.hh, w, h)

    ctx.lineWidth = LIP_PX
    ctx.strokeStyle = `rgba(0,0,0,${LIP_ALPHA})`
    ctx.beginPath()
    ctx.roundRect(
      -s.hw + LIP_PX / 2,
      -s.hh + LIP_PX / 2,
      w - LIP_PX,
      h - LIP_PX,
      Math.min(CORNER_INNER, s.hw, s.hh),
    )
    ctx.stroke()

    ctx.restore()
  }
}
