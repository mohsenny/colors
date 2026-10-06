import {
  CAST_TAU,
  CORNER_INNER,
  CORNER_OUTER,
  TAB_H,
  TAB_INSET,
  TAB_PROUD,
  TAB_RADIUS,
  TAB_W,
} from '../core/constants'
import { lampsAt } from '../core/lamps'
import type { Cast, Lamp } from '../core/lamps'
import { crowdDragTo, crowdLanded, inPaperGrab, litEdgePx, litRect } from '../core/lit'
import { filmHex } from '../core/oklab'
import { clampSide, sideBand, stockSizeFrac } from '../core/size'
import type { RenderOptions, SimState, SlideState, StageHandlers, Viewport } from '../core/types'
import { png } from '../photo/save'
import { grainOf, litSurface, patternOf, tile } from '../photo/surface'
import { Painter } from './paint'
import { drawMount, drawPaper } from './photo'
import type { Stock } from './photo'
import { LIP, shadowParts, shadowStack } from './shadow'

/**
 * The stage is the only thing that touches the playground's DOM. React never
 * renders here: the mount for each slide is created once and then only its
 * style properties are rewritten, and only when a value actually changed.
 *
 * The mounts are the only slide DOM left. Everything inside them is painted on
 * one canvas by paint.ts, which this class owns and drives.
 */

/** types.ts has no hover channel, so reporting hover is opt-in. */
export interface StageHoverHandler {
  onHover?(id: number | null): void
}

export type StageAllHandlers = StageHandlers & StageHoverHandler

/** Mounts start above the surface and the interior canvas, which own 1 and 2. */
const Z_BASE = 10

/**
 * The paper, between the interior canvas and the mounts. It has to be over the
 * paint, because it covers sheets rather than sliding under them, and under the
 * mounts because a mount it covered would lose its shadow and its tab and stop
 * being an object. It never takes a pointer: the gesture that moves it starts
 * on bare lit surface.
 */
const Z_PAPER = 5

/**
 * The leading edge rounds to a whole pixel. A hairline on a fractional
 * boundary antialiases to two rows of grey, and on a covering that composites
 * to roughly (255,255,255) over a surface of roughly (245,246,247) the edge is
 * most of what says an object arrived rather than the lamp going flat.
 */
function paperWidth(crowd: number, aspect: number, vh: number): number {
  return Math.round(litEdgePx(litRect(aspect, crowd), vh))
}

/** z is eased continuously; quantising it stops the shadow string being rebuilt
 *  on every frame for a change nobody can see. */
const Z_SHADOW_STEPS = 250

/** The fibre tile, as background-size has it. */
const FIBRE_PX = 64

/** Tab width when selected: room for the hex plus the copy and lock buttons. */
const TAB_W_SELECTED = 104
const TAB_W_FRACTION = 0.62

const COPIED_MS = 1100

/**
 * How far the pointer has to travel before a press turns into a move drag, in
 * px. A mouse click is never perfectly still, and without this the hex tab and
 * its two buttons sat on a slide that jumped a pixel or two out from under the
 * cursor between the press and the release. Roughly a trackpad's worth of
 * tremor: large enough to absorb it, small enough that a deliberate drag feels
 * immediate. Resize has no dead zone, because the grip is only reachable on a
 * slide the user already stopped.
 */
const MOVE_DEADZONE = 3.5

/**
 * The same tremor, but the crowd gesture pays more for a false positive: a
 * press on bare surface that never travels is a deselect, and a press that
 * travels is the wall of the room moving. Wider than MOVE_DEADZONE because a
 * sheet nudged two pixels is nothing and a room nudged two pixels is a state
 * change under every sheet on the glass.
 *
 * Measured on HORIZONTAL travel alone, which is the only travel the paper
 * answers. Against Math.hypot a tap that slid 6px down the glass and 1px
 * across armed the drag, and on touch that is the common tap rather than a
 * clumsy one: the paper came in two pixels, the instrument started playing
 * again, and the sheet the user had selected was never deselected.
 */
const CROWD_DEADZONE = 6

/** Keyboard resize increments, as a fraction of the viewport short edge. */
const KEY_RESIZE_STEP = 0.005
const KEY_RESIZE_STEP_COARSE = 0.02

const COPY_SVG =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<rect x="4.2" y="1.2" width="6.6" height="6.6" rx="1.2"/><path d="M7.8 10.8H2.4a1.2 1.2 0 0 1-1.2-1.2V4.2"/></svg>'

const LOCK_SVG =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<rect x="2.1" y="5.4" width="7.8" height="5.4" rx="1.3"/><path d="M4.1 5.4V3.9a1.9 1.9 0 0 1 3.8 0v1.5"/></svg>'

/**
 * The crossfade between the hex and the share, quantised before it is written.
 *
 * Fifty steps over the whole gesture: an opacity step of 0.02 on 10.5px text is
 * invisible, and this is a custom property on the stage root, so every write
 * invalidates the style of every tab on the surface. The three tube colours are
 * quantised to bytes for the same reason a few lines above.
 */
const SHARE_FADE_STEPS = 50

/**
 * How far past the rounding boundary the percent has to go before the tab is
 * rewritten, in percentage points. A sheet drifting around 21.4999 crosses
 * round-to-nearest several times a second and would rewrite the text node each
 * time for a number that never visibly changes. 0.6 costs a tenth of a point of
 * lag at the switch and makes the reading stable.
 */
const SHARE_HYSTERESIS = 0.6

interface SlideEls {
  frame: HTMLDivElement
  tab: HTMLDivElement
  /** The hex itself. Owns the width of the pair: the share centres over it. */
  hexText: HTMLSpanElement
  share: HTMLSpanElement
  copy: HTMLButtonElement
  lock: HTMLButtonElement
  copied: HTMLSpanElement
  grip: HTMLDivElement
}

/** Last value written to the DOM, per property. Nothing is written twice. */
interface Prev {
  transform: string
  rank: number
  frameW: number
  frameH: number
  innerW: number
  innerH: number
  dyeL: number
  dyeC: number
  dyeH: number
  dyeD: number
  shadowKey: number
  tabW: number
  tabLeft: number
  hex: string
  /** Last whole percent shown, -1 before the first one. Held for the band. */
  share: number
  /** Last text written into the share span, hysteresis already applied. */
  shareText: string
  label: string
  locked: boolean
  selected: boolean
  hovered: boolean
}

interface SlideRec {
  els: SlideEls
  /** Live reference: the simulation mutates these objects in place. */
  state: SlideState
  ordinal: number
  prev: Prev
  copiedTimer: number
}

interface DragState {
  /** -1 on a crowd drag: the thing in hand is the room, not a sheet. */
  id: number
  pointerId: number
  target: Element
  kind: 'resize' | 'move' | 'crowd'
  /** Unused by resize since the grip went two-axis; kept for the move path. */
  grabRatio: number
  /** Crowd only: how far the paper was in when the pointer went down. */
  crowd0: number
  /**
   * Move: pointer-to-centre offset in u, taken once at the grab. Resize:
   * pointer-to-corner offset in px, in the slide's own axes. Either way it is
   * read once and the slide is held still, so it stays true for the drag.
   */
  grabDX: number
  grabDY: number
  /** Where the pointer went down, in client px, for the dead zone below. */
  startX: number
  startY: number
  /** Move and crowd: false until the pointer has left the dead zone. */
  armed: boolean
  /**
   * Crowd only: the room has actually changed width since the press. Armed is
   * not enough, because the gesture is capped: a hand that keeps pushing at
   * the cap travels as far as it likes and moves nothing, and that press is
   * still a press on bare lightbox, which means deselect.
   */
  moved: boolean
}

function div(cls: string): HTMLDivElement {
  const node = document.createElement('div')
  node.className = cls
  return node
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x
}

export class Stage {
  private readonly root: HTMLElement
  private readonly handlers: StageAllHandlers
  private readonly recs = new Map<number, SlideRec>()
  private readonly painter: Painter
  private readonly paper: HTMLDivElement
  /** Last paper width written, in whole px. -1 so the first frame writes. */
  private paperPx = -1
  /**
   * The hex-to-share crossfade as last written. Seeded to the value the
   * stylesheet already falls back to, so an instrument nobody has crowded
   * never writes the property at all.
   */
  private shareFade = 0
  /**
   * Crowd as the simulation last had it. Read off the state rather than kept
   * as the gesture's own number, so a scrub or a replay that moves the paper
   * leaves the next press grabbing the edge that is actually on screen.
   */
  private crowdNow = 0
  /** Aspect as the simulation last had it, for the same reason. */
  private aspectNow = 1

  private viewport: Viewport | null = null
  /** The cast, low-passed, linear sRGB. White until a field says otherwise. */
  private readonly castHeld: [number, number, number] = [1, 1, 1]
  private castT = 0
  private drag: DragState | null = null
  private hoveredId: number | null = null
  private framePx = -1
  private reduced = false
  /** Last lamp values written, so a style write only happens when one changes. */
  private lampKeys: string[] = []
  /**
   * The stage never moves, so its offset is read once per drag, not per move,
   * and once per viewport change for the hover path: a getBoundingClientRect
   * on every pointermove is a forced layout for a rectangle that only a
   * resize can change.
   */
  private originX = 0
  private originY = 0
  /** Whether the root is currently wearing the grab strip's cursor. */
  private grabCursor = false

  constructor(root: HTMLElement, handlers: StageAllHandlers) {
    this.root = root
    this.handlers = handlers
    root.classList.add('lb-stage')
    this.painter = new Painter(root)

    this.paper = div('lb-paper')
    this.paper.setAttribute('aria-hidden', 'true')
    // Reused verbatim from the mounts. The paper is the same card as they are,
    // lying on the surface rather than a few millimetres above it, so it takes
    // the middle of the depth range and nothing about the shadow is retuned.
    this.paper.style.boxShadow = shadowStack(0.5)
    this.paper.style.zIndex = String(Z_PAPER)
    root.append(this.paper)

    const s = root.style
    s.setProperty('--lb-tab-h', `${TAB_H}px`)
    s.setProperty('--lb-tab-proud', `${TAB_PROUD}px`)
    s.setProperty('--lb-tab-radius', `${TAB_RADIUS}px`)
    s.setProperty('--lb-radius-outer', `${CORNER_OUTER}px`)
    s.setProperty('--lb-radius-inner', `${CORNER_INNER}px`)

    root.addEventListener('pointerdown', this.onPointerDown)
    root.addEventListener('pointermove', this.onPointerMove)
    root.addEventListener('pointerup', this.onPointerUp)
    root.addEventListener('pointercancel', this.onPointerUp)
    root.addEventListener('lostpointercapture', this.onLostCapture)
    root.addEventListener('pointerleave', this.onPointerLeave)
    root.addEventListener('click', this.onClick)
    root.addEventListener('dblclick', this.onDoubleClick)
    root.addEventListener('keydown', this.onKeyDown)
  }

  // --- DOM lifecycle --------------------------------------------------------

  sync(slides: SlideState[]): void {
    // Nothing on the stage yet means this is the first layout, and the whole
    // set appearing at once is the page loading rather than a sheet arriving.
    // A sheet added to a stage that already has sheets on it gets the fade.
    const populated = this.recs.size > 0
    const seen = new Set<number>()
    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i]
      if (!slide) continue
      seen.add(slide.id)
      const existing = this.recs.get(slide.id)
      if (existing) {
        existing.state = slide
        existing.ordinal = i + 1
        continue
      }
      this.recs.set(slide.id, this.create(slide, i + 1, populated))
    }
    for (const [id, rec] of this.recs) {
      if (seen.has(id)) continue
      this.dispose(rec)
      this.recs.delete(id)
    }
  }

  private create(slide: SlideState, ordinal: number, entering = false): SlideRec {
    const frame = div(entering ? 'lb-frame is-entering' : 'lb-frame')
    /*
     * The card's cut edge. Declared before the tab on purpose: it has to paint
     * underneath it so the tab's own background can hide the segment of the
     * ring that runs across the tab's base. See `.lb-edge` in stage.css for why
     * this is a real element rather than an outline or a pseudo-element.
     */
    const edge = div('lb-edge')
    const tab = div('lb-tab')
    const grip = div('lb-grip')

    /*
     * The hex and the share are two children of one box rather than two states
     * of one text node, because they have to cross over: at any packing in the
     * middle of the gesture both are on screen at once. The hex is the one in
     * flow, so it keeps owning the width of the pair, and the share is laid
     * over it. TAB_W is unchanged and so is every tab: see constants.ts:40-45
     * for what widening the tab did to the hex the last time it was tried.
     */
    const hex = document.createElement('span')
    hex.className = 'lb-hex'
    const hexText = document.createElement('span')
    hexText.className = 'lb-hex-t'
    const share = document.createElement('span')
    share.className = 'lb-share'
    // The hex is the accessible name's job (see the aria-label below) and a
    // share that changes several times a second would be re-announced each
    // time, so this is decoration as far as a screen reader is concerned.
    share.setAttribute('aria-hidden', 'true')
    hex.append(hexText, share)

    const copy = document.createElement('button')
    copy.type = 'button'
    copy.className = 'lb-copy'
    copy.setAttribute('aria-label', 'Copy hex')
    copy.innerHTML = COPY_SVG

    const lock = document.createElement('button')
    lock.type = 'button'
    lock.className = 'lb-lock'
    lock.setAttribute('aria-label', 'Pin colour')
    lock.setAttribute('aria-pressed', 'false')
    lock.innerHTML = LOCK_SVG

    const copied = document.createElement('span')
    copied.className = 'lb-copied'
    copied.textContent = 'Copied'
    copied.setAttribute('aria-hidden', 'true')

    frame.dataset.slideId = String(slide.id)
    frame.setAttribute('role', 'button')
    frame.tabIndex = 0
    frame.setAttribute('aria-pressed', 'false')

    tab.append(hex, copy, lock, copied)
    frame.append(edge, tab, grip)
    this.root.append(frame)

    return {
      els: { frame, tab, hexText, share, copy, lock, copied, grip },
      state: slide,
      ordinal,
      copiedTimer: 0,
      prev: {
        transform: '',
        rank: -1,
        frameW: -1,
        frameH: -1,
        innerW: -1,
        innerH: -1,
        dyeL: Number.NaN,
        dyeC: Number.NaN,
        dyeH: Number.NaN,
        dyeD: Number.NaN,
        shadowKey: -1,
        tabW: -1,
        tabLeft: -1,
        hex: '',
        share: -1,
        shareText: '',
        label: '',
        locked: false,
        selected: false,
        hovered: false,
      },
    }
  }

  private dispose(rec: SlideRec): void {
    if (rec.copiedTimer) clearTimeout(rec.copiedTimer)
    rec.els.frame.remove()
  }

  destroy(): void {
    const root = this.root
    root.removeEventListener('pointerdown', this.onPointerDown)
    root.removeEventListener('pointermove', this.onPointerMove)
    root.removeEventListener('pointerup', this.onPointerUp)
    root.removeEventListener('pointercancel', this.onPointerUp)
    root.removeEventListener('lostpointercapture', this.onLostCapture)
    root.removeEventListener('pointerleave', this.onPointerLeave)
    root.removeEventListener('click', this.onClick)
    root.removeEventListener('dblclick', this.onDoubleClick)
    root.removeEventListener('keydown', this.onKeyDown)
    for (const rec of this.recs.values()) this.dispose(rec)
    this.recs.clear()
    this.paper.remove()
    this.painter.destroy()
    this.drag = null
  }

  // --- the frame ------------------------------------------------------------

  render(state: SimState, opts: RenderOptions): void {
    try {
      this.write(state, opts)
    } catch {
      // A render must never take the animation loop down with it.
    }
  }

  /**
   * The three tubes, as custom properties the stylesheet builds its gradients
   * from. Rounded to bytes before comparison: on a 100 second cycle a tube's
   * colour only changes a couple of times a second, and a style write on a
   * full-viewport element is not something to do 60 times a second for nothing.
   */
  private writeLamps(t: number, warmth: number, cast: Cast | undefined): void {
    const lamps = lampsAt(t, warmth, cast)
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i] as Lamp
      const key = `${l.r} ${l.g} ${l.b}|${l.gain.toFixed(3)}`
      if (key === this.lampKeys[i]) continue
      this.lampKeys[i] = key
      this.root.style.setProperty(`--lb-tube-${i + 1}`, `${l.r} ${l.g} ${l.b}`)
      this.root.style.setProperty(`--lb-tube-${i + 1}-i`, l.gain.toFixed(3))
    }
  }

  /**
   * The cast the tubes get this frame. Low-passed, because the field follows
   * the sheets and the sheets move at sheet speed: the lamps are the slowest
   * thing on screen by an order of magnitude and the cast must not be what
   * changes that. Held in linear sRGB, which is where the average was taken.
   */
  private castFor(t: number, opts: RenderOptions): Cast | undefined {
    // Simulation time, so a scrub takes the cast with it. It stands still
    // while paused, which would strand the cast if a sheet were dragged then,
    // so a stalled clock still gets one frame's worth of settling.
    const raw = t - this.castT
    this.castT = t
    const dt = raw > 0 && raw < 0.25 ? raw : 1 / 60

    const f = this.painter.field
    const a = this.castHeld
    const k = 1 - Math.exp(-dt / CAST_TAU)
    a[0] += ((f[0] as number) - a[0]) * k
    a[1] += ((f[1] as number) - a[1]) * k
    a[2] += ((f[2] as number) - a[2]) * k

    // Tracked even at zero so turning the cast on picks up the field that is
    // already there instead of swinging in from white.
    const strength = opts.castStrength ?? 0
    return strength > 0 ? { linear: a, strength } : undefined
  }

  private write(state: SimState, opts: RenderOptions): void {
    const vp = opts.viewport
    if (vp !== this.viewport) {
      this.viewport = vp
      // A new viewport object is a resize, which is the only thing that can
      // move the stage. The hover path reads this rather than the layout.
      const rect = this.root.getBoundingClientRect()
      this.originX = rect.left
      this.originY = rect.top
    }
    if (vp.frame !== this.framePx) {
      this.framePx = vp.frame
      this.root.style.setProperty('--lb-frame', `${vp.frame}px`)
    }
    if (opts.reducedMotion !== this.reduced) {
      this.reduced = opts.reducedMotion
      this.root.classList.toggle('is-reduced', opts.reducedMotion)
    }

    // The painter first, then the lamps: the cast is the field the painter
    // just measured, so the other order hands the tubes the previous frame.
    this.painter.draw(state, opts)
    this.writeLamps(state.t, opts.warmth, this.castFor(state.t, opts))

    // Both, and off the state rather than off the viewport: the paper below is
    // drawn from `state.aspect`, so the strip that takes hold of it has to be
    // placed from the same number or the target drifts off the object. The two
    // part company on any resize the simulation has not taken yet, and the
    // sub-threshold ones never reach it at all.
    this.crowdNow = state.crowd
    this.aspectNow = state.aspect

    // The paper. Width only: a zero-width element still draws its right-hand
    // hairline, so the class is what takes it off the surface entirely and is
    // why crowd 0 is byte identical to an instrument that had never heard of
    // paper.
    const paperPx = paperWidth(state.crowd, state.aspect, vp.height)
    if (paperPx !== this.paperPx) {
      if (paperPx > 0 !== this.paperPx > 0) this.paper.classList.toggle('is-in', paperPx > 0)
      this.paperPx = paperPx
      this.paper.style.width = `${paperPx}px`
    }

    /*
     * How far the tabs have crossed from the hex to the share. The packing,
     * exactly: the same number the tubes take their cast from, so the room
     * changing colour and the tabs changing what they measure are one state
     * change rather than two that nearly agree. It is a function of phi and
     * of nothing else, so it is the same for every sheet and is written once
     * on the root for all of them to inherit.
     */
    const packed = clamp(opts.castStrength ?? 0, 0, 1)
    const fade = Math.round(packed * SHARE_FADE_STEPS) / SHARE_FADE_STEPS
    if (fade !== this.shareFade) {
      this.shareFade = fade
      this.root.style.setProperty('--lb-share-t', fade.toFixed(2))
    }

    const slides = state.slides
    const vh = vp.height

    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i]
      if (!slide) continue
      const rec = this.recs.get(slide.id)
      if (!rec) continue
      rec.state = slide
      const p = rec.prev
      const els = rec.els
      const selected = opts.selectedId === slide.id

      // --- position and paint order (the only things that move every frame) --
      const transform =
        `translate3d(${(slide.x * vh).toFixed(2)}px, ${(slide.y * vh).toFixed(2)}px, 0) ` +
        `rotate(${slide.rot.toFixed(4)}rad) translate(-50%, -50%)`
      if (transform !== p.transform) {
        p.transform = transform
        els.frame.style.transform = transform
      }

      /*
       * Selecting lifts the slide to the top of the pile, the way you would pull
       * one slide out of a stack to read it. Not decoration: the frame is the only
       * hit-testable layer, so a selected slide sitting low in the stack had its
       * tab, copy button and lock button buried under the slide above, and the
       * hex you had just clicked to read was unreadable and uncopyable.
       *
       * In Light the dye layers are a product, which commutes, so lifting is very
       * nearly invisible: only the 3% screen veil fails to commute with it. In
       * Blend the layers composite normally, so the lifted slide does come
       * forward in the stack, which is the correct reading of having picked it up.
       */
      const rank = selected ? slides.length : depthRank(slides, slide)
      if (rank !== p.rank) {
        p.rank = rank
        els.frame.style.zIndex = String(Z_BASE + rank)
      }

      // --- geometry ---------------------------------------------------------
      const frameW = Math.round(slide.w * vh * 100) / 100
      const frameH = Math.round(slide.h * vh * 100) / 100
      const innerW = Math.max(0, Math.round((frameW - 2 * vp.frame) * 100) / 100)
      const innerH = Math.max(0, Math.round((frameH - 2 * vp.frame) * 100) / 100)
      if (frameW !== p.frameW) {
        p.frameW = frameW
        els.frame.style.width = `${frameW}px`
      }
      if (frameH !== p.frameH) {
        p.frameH = frameH
        els.frame.style.height = `${frameH}px`
      }
      if (innerW !== p.innerW) p.innerW = innerW
      if (innerH !== p.innerH) p.innerH = innerH

      // --- colour -----------------------------------------------------------
      // The interior is the painter's job now. All the mount needs from the dye
      // is the hex on its tab, and that only changes when the dye does.
      const dye = slide.dye
      const dyeChanged =
        dye.L !== p.dyeL || dye.C !== p.dyeC || dye.h !== p.dyeH || dye.d !== p.dyeD
      if (dyeChanged) {
        p.dyeL = dye.L
        p.dyeC = dye.C
        p.dyeH = dye.h
        p.dyeD = dye.d
      }

      // --- state ------------------------------------------------------------
      const hovered = opts.hoveredId === slide.id
      if (selected !== p.selected) {
        p.selected = selected
        els.frame.classList.toggle('is-selected', selected)
        els.frame.setAttribute('aria-pressed', selected ? 'true' : 'false')
      }
      if (hovered !== p.hovered) {
        p.hovered = hovered
        els.frame.classList.toggle('is-hovered', hovered)
      }

      // --- shadows ----------------------------------------------------------
      const zKey = Math.round(clamp(slide.z, 0, 1) * Z_SHADOW_STEPS)
      if (zKey !== p.shadowKey) {
        p.shadowKey = zKey
        els.frame.style.boxShadow = shadowStack(zKey / Z_SHADOW_STEPS)
      }

      // --- tab --------------------------------------------------------------
      const tabBase = Math.min(TAB_W, frameW * TAB_W_FRACTION)
      // Capped against the inner box, not the outer one: the tab is positioned
      // inside the mount's border, so measuring it against frameW let it hang
      // proud of the right edge on the smallest slides.
      const tabWide = Math.max(tabBase, Math.min(TAB_W_SELECTED, Math.max(innerW, tabBase)))
      const tabW = Math.round((selected ? tabWide : tabBase) * 10) / 10
      if (tabW !== p.tabW) {
        p.tabW = tabW
        els.tab.style.width = `${tabW}px`
      }

      // Same corner on every slide: hard left on the top edge, flush with the
      // inside of the mount. The clamp still matters, because selecting widens
      // the tab and the widened tab must not hang past the right edge.
      const half = tabW / 2
      const tabLeft =
        Math.round(clamp(half + TAB_INSET, half, Math.max(half, innerW - half)) * 10) / 10
      if (tabLeft !== p.tabLeft) {
        p.tabLeft = tabLeft
        els.tab.style.left = `${tabLeft}px`
      }

      // The mode no longer touches the tab: both modes transmit the same film
      // through one sheet and only differ where sheets cross.
      if (dyeChanged) {
        const hex = filmHex(dye)
        if (hex !== p.hex) {
          p.hex = hex
          els.hexText.textContent = hex
          els.copy.setAttribute('aria-label', `Copy ${hex}`)
        }
      }

      /*
       * The share, which replaces the hex while the paper is in. Outside the
       * dye guard on purpose: this number moves with the room and not with the
       * colour, and a sheet whose dye never changes is exactly the sheet whose
       * share is changing fastest.
       */
      if (packed > 0) {
        const share = this.painter.shareOf(slide.id)
        // A miss still writes, because the crossfade is global and the gap is
        // per sheet: leaving the text alone would fade the tab to a blank box
        // rather than to the fallback. The fallback is the hex it already has.
        let text = p.hex
        if (share !== null) {
          const pct = clamp(share * 100, 0, 100)
          if (p.share < 0 || Math.abs(pct - p.share) >= SHARE_HYSTERESIS) {
            p.share = Math.round(pct)
          }
          text = `${p.share}%`
        }
        if (text !== p.shareText) {
          p.shareText = text
          els.share.textContent = text
        }
      }

      if (slide.locked !== p.locked) {
        p.locked = slide.locked
        els.lock.setAttribute('aria-pressed', slide.locked ? 'true' : 'false')
        els.lock.setAttribute('aria-label', slide.locked ? 'Unpin colour' : 'Pin colour')
      }

      const label = `Slide ${rec.ordinal}, ${p.hex}${slide.locked ? ', locked' : ''}`
      if (label !== p.label) {
        p.label = label
        els.frame.setAttribute('aria-label', label)
      }
    }
  }

  /**
   * The room as it stands, for a photograph: the lit surface, the paint, the
   * paper and the mounts, without the tabs, the grips or what is held or
   * hovered. The tiles load first, then all of it is read and laid down at
   * once, so every layer is the same frame.
   */
  async photo(): Promise<Blob> {
    const css = getComputedStyle(this.root)
    const { canvas: paint, dpr } = this.painter.picture
    const [grain, fibre] = await Promise.all([
      grainOf(this.root, dpr),
      tile(css.getPropertyValue('--lb-fibre'), FIBRE_PX, dpr),
    ])
    const ctx = litSurface(this.root, paint.width, paint.height, dpr, grain)
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalCompositeOperation = 'multiply'
    ctx.drawImage(paint, 0, 0)
    ctx.restore()

    const stock: Stock = {
      mount: css.getPropertyValue('--lb-mount').trim(),
      edge: css.getPropertyValue('--lb-card-edge').trim(),
      lip: LIP,
      fibre: fibre && patternOf(ctx, fibre, dpr),
    }
    if (this.paperPx > 0) drawPaper(ctx, this.paperPx, paint.height / dpr, shadowParts(0.5), stock, dpr)
    const vh = this.viewport?.height ?? 0
    const recs = [...this.recs.values()].sort((a, b) => a.prev.rank - b.prev.rank)
    for (const { state, prev } of recs) {
      const mount = {
        x: state.x * vh,
        y: state.y * vh,
        rot: state.rot,
        w: prev.frameW,
        h: prev.frameH,
        frame: this.framePx,
        radius: CORNER_OUTER,
        shades: shadowParts(prev.shadowKey / Z_SHADOW_STEPS),
      }
      drawMount(ctx, mount, stock, dpr)
    }
    return png(ctx.canvas)
  }

  flashCopied(id: number): void {
    const rec = this.recs.get(id)
    if (!rec) return
    if (rec.copiedTimer) clearTimeout(rec.copiedTimer)
    rec.els.copied.classList.add('is-on')
    rec.copiedTimer = window.setTimeout(() => {
      rec.copiedTimer = 0
      rec.els.copied.classList.remove('is-on')
    }, COPIED_MS)
  }

  // --- interaction ----------------------------------------------------------

  private recFromEvent(e: Event): SlideRec | null {
    const target = e.target
    if (!(target instanceof Element)) return null
    const frame = target.closest('.lb-frame')
    if (!(frame instanceof HTMLElement)) return null
    const id = Number(frame.dataset.slideId)
    if (!Number.isFinite(id)) return null
    return this.recs.get(id) ?? null
  }

  private onPointerDown = (e: PointerEvent): void => {
    const target = e.target
    if (!(target instanceof Element)) return

    const grip = target.closest('.lb-grip')
    if (grip) {
      const rec = this.recFromEvent(e)
      const vp = this.viewport
      if (!rec || !vp) return
      const rect = this.root.getBoundingClientRect()
      this.originX = rect.left
      this.originY = rect.top
      // Where the corner is relative to where the pointer landed on the grip.
      // Held for the whole drag so the corner does not jump to the cursor on
      // the first move.
      const { lx, ly } = this.localOffset(rec.state, e.clientX, e.clientY, vp)
      const vh = vp.height
      this.drag = {
        id: rec.state.id,
        pointerId: e.pointerId,
        target: grip,
        kind: 'resize',
        grabRatio: 0,
        crowd0: 0,
        grabDX: (rec.state.w * vh) / 2 - lx,
        grabDY: (rec.state.h * vh) / 2 - ly,
        startX: e.clientX,
        startY: e.clientY,
        armed: true,
        moved: false,
      }
      if (grip instanceof HTMLElement) {
        try {
          grip.setPointerCapture(e.pointerId)
        } catch {
          // Capture can be refused if the pointer is already gone; the drag
          // still works through the bubbled events.
        }
      }
      e.preventDefault()
      e.stopPropagation()
      return
    }

    // Copy and lock must never change the selection.
    if (target.closest('.lb-copy') || target.closest('.lb-lock')) {
      e.stopPropagation()
      return
    }

    const rec = this.recFromEvent(e)
    const vp = this.viewport

    /*
     * Bare surface beside the paper: the room's own handle.
     *
     * Armed here but deliberately NOT acted on, and in particular the
     * selection is left alone. A press on bare lightbox means deselect, and
     * that meaning has to survive: unless the room actually ends up a
     * different width, this falls back to the plain bare-surface press and
     * deselects on pointerup, exactly as it did before there was any paper.
     * Only a room that moved makes it a crowd drag, and a crowd drag keeps
     * the selection, because resizing the room is not a statement about
     * which sheet you are reading.
     */
    if (!rec && vp) {
      const rect = this.root.getBoundingClientRect()
      if (this.inGrabStrip(e.clientX - rect.left, vp)) {
        this.originX = rect.left
        this.originY = rect.top
        this.drag = {
          id: -1,
          pointerId: e.pointerId,
          target: this.root,
          kind: 'crowd',
          grabRatio: 0,
          crowd0: this.crowdNow,
          grabDX: 0,
          grabDY: 0,
          startX: e.clientX,
          startY: e.clientY,
          armed: false,
          moved: false,
        }
        try {
          // On the ROOT, not on the event's target. The Dock is a z-index 200
          // sibling of the stage rather than a descendant of it, so without
          // capture the gesture dies the moment the hand crosses the dock and
          // lostpointercapture never fires to end it.
          this.root.setPointerCapture(e.pointerId)
        } catch {
          // Refused if the pointer has already gone; the bubbled events still work.
        }
        e.preventDefault()
        return
      }
    }

    // Select first: that is what stops the slide, and a stopped slide is what
    // makes the grab offset below hold for the rest of the drag.
    this.handlers.onSelect(rec ? rec.state.id : null)
    if (!rec) return

    const frame = target.closest('.lb-frame')
    if (!vp || !(frame instanceof HTMLElement)) return
    const rect = this.root.getBoundingClientRect()
    this.originX = rect.left
    this.originY = rect.top
    this.drag = {
      id: rec.state.id,
      pointerId: e.pointerId,
      target: frame,
      kind: 'move',
      grabRatio: 0,
      crowd0: 0,
      grabDX: rec.state.x - (e.clientX - this.originX) / vp.height,
      grabDY: rec.state.y - (e.clientY - this.originY) / vp.height,
      startX: e.clientX,
      startY: e.clientY,
      armed: false,
      moved: false,
    }
    try {
      frame.setPointerCapture(e.pointerId)
    } catch {
      // Refused if the pointer has already gone; the bubbled events still work.
    }
    // Suppresses the native image/text drag, which would otherwise start on the
    // first move and leave the slide stranded under a ghost. preventDefault also
    // costs the element its focus, so focus is taken explicitly: the keyboard
    // shortcuts on a slide have to work after clicking it.
    e.preventDefault()
    frame.focus()
  }

  private onPointerMove = (e: PointerEvent): void => {
    const drag = this.drag
    if (drag) {
      if (e.pointerId !== drag.pointerId) return
      const vp = this.viewport
      if (!vp) return
      if (drag.kind === 'crowd') {
        // Horizontal travel only, both for the dead zone and for the drag.
        // The paper has one degree of freedom and a hand pushing something
        // sideways does not travel in a straight line.
        const asked = crowdDragTo(drag, e.clientX - drag.startX, vp.width, CROWD_DEADZONE)
        if (asked === null) return
        crowdLanded(drag, this.handlers.onCrowd(asked))
        return
      }
      const rec = this.recs.get(drag.id)
      if (!rec) return
      if (drag.kind === 'move') {
        if (!drag.armed) {
          if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < MOVE_DEADZONE) return
          drag.armed = true
        }
        this.handlers.onMove(
          drag.id,
          (e.clientX - this.originX) / vp.height + drag.grabDX,
          (e.clientY - this.originY) / vp.height + drag.grabDY,
        )
        return
      }
      // The slide keeps drifting under the pointer, so the centre, the rotation
      // and the current size are all re-read from the live state each move.
      const { lx, ly } = this.localOffset(rec.state, e.clientX, e.clientY, vp)
      const band = sideBand(vp.short)
      const vh = vp.height
      this.handlers.onResize(
        drag.id,
        clampSide(2 * (lx + drag.grabDX), band) / vh,
        clampSide(2 * (ly + drag.grabDY), band) / vh,
      )
      return
    }

    const rec = this.recFromEvent(e)
    const id = rec ? rec.state.id : null
    if (id !== this.hoveredId) {
      this.hoveredId = id
      this.handlers.onHover?.(id)
    }
    /*
     * The one mark the grab strip gets.
     *
     * A stock sheet of bare surface behaves differently from the surface
     * beside it (243px at 1440x900, 40% of the width on a 390px phone) and
     * nothing said so: the feature was found by an accident that shoves the
     * whole composition sideways. The grip's own trick, and the same reason
     * there is no Legend row for it: a row is permanent dead text for
     * everyone who never crowds, and it is display:none under 620px, which is
     * the width where the strip is largest.
     *
     * Only when nothing is under the pointer, because a sheet lying over the
     * strip takes the press itself.
     */
    const vp = this.viewport
    this.setCursor(id === null && vp !== null && this.inGrabStrip(e.clientX - this.originX, vp))
  }

  /**
   * Is a client-relative x on the strip of lit surface that takes hold of the
   * paper? One expression, because the press and the cursor that advertises
   * it disagreeing by a pixel is a target that cannot be learned.
   */
  private inGrabStrip(x: number, vp: Viewport): boolean {
    return inPaperGrab(
      x,
      litEdgePx(litRect(this.aspectNow, this.crowdNow), vp.height),
      stockSizeFrac(vp.short) * vp.short,
    )
  }

  /** Written only on change, so an instrument nobody hovers the strip on
   *  never gets the property at all. */
  private setCursor(grab: boolean): void {
    if (grab === this.grabCursor) return
    this.grabCursor = grab
    this.root.style.cursor = grab ? 'col-resize' : ''
  }

  private onPointerUp = (e: PointerEvent): void => {
    const drag = this.drag
    if (!drag || e.pointerId !== drag.pointerId) return
    this.endDrag()
    e.stopPropagation()
  }

  private onLostCapture = (e: PointerEvent): void => {
    if (this.drag && e.pointerId === this.drag.pointerId) this.endDrag()
  }

  private endDrag(): void {
    const drag = this.drag
    if (!drag) return
    this.drag = null
    if (drag.target instanceof HTMLElement && drag.target.hasPointerCapture(drag.pointerId)) {
      drag.target.releasePointerCapture(drag.pointerId)
    }
    // Three kinds, three endings, written as a switch: the if/else this
    // replaced ended a crowd drag by committing a resize to slide -1.
    switch (drag.kind) {
      case 'move':
        this.handlers.onMoveEnd()
        return
      case 'resize':
        this.handlers.onResizeEnd()
        return
      case 'crowd':
        // The room never moved means this press was a click on bare lightbox
        // after all, and the deselect it owes is paid here. On the paper and
        // not on the arming, because the gesture is capped: a hand that keeps
        // pushing once the room is one sheet wide has armed and has changed
        // nothing, and refusing the deselect there would leave a sheet
        // selected with nothing the user can see to explain it.
        if (drag.moved) this.handlers.onCrowdEnd()
        else this.handlers.onSelect(null)
        return
    }
  }

  private onPointerLeave = (): void => {
    if (this.drag) return
    this.setCursor(false)
    if (this.hoveredId === null) return
    this.hoveredId = null
    this.handlers.onHover?.(null)
  }

  private onClick = (e: MouseEvent): void => {
    const target = e.target
    if (!(target instanceof Element)) return
    const rec = this.recFromEvent(e)
    if (!rec) return
    if (target.closest('.lb-copy')) {
      e.stopPropagation()
      this.handlers.onCopy(rec.state.id)
      return
    }
    if (target.closest('.lb-lock')) {
      e.stopPropagation()
      this.handlers.onToggleLock(rec.state.id)
    }
  }

  /**
   * Save the colour under the pointer.
   *
   * The overlaps are the reason the slides move at all, and until now they were
   * the one colour on the box that could not be kept: a crossing belongs to no
   * slide, has no tab and no element, and disappears the moment the sheets
   * slide apart. Double-click asks the painter what is under the pointer and
   * pins the answer.
   *
   * Single sheets included. It was crossings only, on the grounds that a sheet
   * already has its colour on a tab a few pixels away, and the rule that came
   * out of that was "double-click works here but not there", which is a rule
   * nobody can see and therefore nobody trusts. One sentence is better: this
   * saves what is under the pointer.
   *
   * Bare lightbox is still nothing, because the near-white of the surface is
   * not a colour anyone came here to keep.
   */
  private onDoubleClick = (e: MouseEvent): void => {
    const target = e.target
    if (target instanceof Element && (target.closest('.lb-copy') || target.closest('.lb-lock'))) {
      return
    }
    const rect = this.root.getBoundingClientRect()
    const hit = this.painter.sampleAt(e.clientX - rect.left, e.clientY - rect.top)
    if (!hit) return
    e.preventDefault()
    e.stopPropagation()
    this.handlers.onPinMix(hit.ids, hit.hex)
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target
    if (!(target instanceof Element)) return
    // A focused tab button owns its own keys; the frame must not shadow them.
    if (target.closest('.lb-copy') || target.closest('.lb-lock')) return
    const rec = this.recFromEvent(e)
    if (!rec) return
    const id = rec.state.id

    switch (e.key) {
      // Enter selects. Space deliberately does NOT, even though the frame is a
      // role="button" and the convention says both should: Space is Play/Pause
      // everywhere else on the box, and a key that means "pause" until you
      // happen to have a sheet focused is a key nobody can rely on. Stopping
      // the whole instrument is worth more here than the convention.
      case 'Enter':
        e.preventDefault()
        this.handlers.onSelect(id)
        return
      case 'c':
      case 'C':
        this.handlers.onCopy(id)
        return
      case 'l':
      case 'L':
        this.handlers.onToggleLock(id)
        return
      case 'ArrowRight':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowDown': {
        const vp = this.viewport
        if (!vp) return
        e.preventDefault()
        // One axis per key, matching the grip: left and right are the width,
        // up and down are the height. The old pair-of-signs mapping scaled both
        // axes at once, which there is no longer any way to ask for and no
        // reason to want.
        const step = (e.shiftKey ? KEY_RESIZE_STEP_COARSE : KEY_RESIZE_STEP) * vp.short
        const band = sideBand(vp.short)
        const vh = vp.height
        const horizontal = e.key === 'ArrowLeft' || e.key === 'ArrowRight'
        const sign = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1
        const w = horizontal ? clampSide(rec.state.w * vh + sign * step, band) : rec.state.w * vh
        const h = horizontal ? rec.state.h * vh : clampSide(rec.state.h * vh + sign * step, band)
        if (w === rec.state.w * vh && h === rec.state.h * vh) return
        this.handlers.onResize(id, w / vh, h / vh)
        this.handlers.onResizeEnd()
        return
      }
      default:
        return
    }
  }

  /**
   * The pointer's offset from the slide centre, un-rotated into the slide's own
   * axes, in CSS px. The grip is the bottom-right corner in that frame, so
   * these are directly the half-extents the corner is being dragged to.
   *
   * Two numbers rather than one projection onto the half-diagonal: the axes are
   * independent now, so dragging straight right changes only the width and
   * straight down only the height.
   */
  private localOffset(
    slide: SlideState,
    clientX: number,
    clientY: number,
    vp: Viewport,
  ): { lx: number; ly: number } {
    const vh = vp.height
    const dx = clientX - this.originX - slide.x * vh
    const dy = clientY - this.originY - slide.y * vh
    const cos = Math.cos(slide.rot)
    const sin = Math.sin(slide.rot)
    return { lx: dx * cos + dy * sin, ly: -dx * sin + dy * cos }
  }
}

/** Rank 0 is the slide resting lowest. Ties break on id so the order is stable. */
function depthRank(slides: SlideState[], slide: SlideState): number {
  let rank = 0
  for (let i = 0; i < slides.length; i += 1) {
    const other = slides[i]
    if (!other || other === slide) continue
    if (other.z < slide.z || (other.z === slide.z && other.id < slide.id)) rank += 1
  }
  return rank
}
