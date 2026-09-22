import {
  CORNER_INNER,
  CORNER_OUTER,
  H_MM_BASE,
  H_MM_RANGE,
  SIZE_FRAC_MAX,
  SIZE_FRAC_MIN,
  SIZE_PX_MAX,
  SIZE_PX_MIN,
  TAB_H,
  TAB_INSET,
  TAB_PROUD,
  TAB_RADIUS,
  TAB_W,
} from '../core/constants'
import { lampsAt } from '../core/lamps'
import type { Lamp } from '../core/lamps'
import { slideHex } from '../core/oklab'
import type { RenderOptions, SimState, SlideState, StageHandlers, Viewport } from '../core/types'
import { Painter } from './paint'

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

/** Shadow model (design notes 1.5). Alpha falls as blur grows; that inversion
 *  is what reads as a physical object a few millimetres above a lit surface. */
const SOFT_BLUR_BASE = 3
const SOFT_BLUR_PER_MM = 4
const SOFT_OY_PER_MM = 1.6
const CONTACT_BLUR_BASE = 1.5
const CONTACT_BLUR_PER_MM = 0.6
const CONTACT_OY_PER_MM = 0.4
const OX_OVER_OY = 0.35
const SOFT_ALPHA_BASE = 0.155
const SOFT_ALPHA_PER_MM = 0.0105
const CONTACT_ALPHA_BASE = 0.1
const CONTACT_ALPHA_PER_MM = 0.008
const OUTER_LIP = '0 0 0 0.5px rgba(30,34,48,0.055)'
const SELECT_RING = '0 0 0 1px rgba(26,30,44,0.18)'

/** z is eased continuously; quantising it stops the shadow string being rebuilt
 *  on every frame for a change nobody can see. */
const Z_SHADOW_STEPS = 250

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

/** Keyboard resize increments, in sizeFrac per press. */
const KEY_RESIZE_STEP = 0.005
const KEY_RESIZE_STEP_COARSE = 0.02

const COPY_SVG =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<rect x="4.2" y="1.2" width="6.6" height="6.6" rx="1.2"/><path d="M7.8 10.8H2.4a1.2 1.2 0 0 1-1.2-1.2V4.2"/></svg>'

const LOCK_SVG =
  '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<rect x="2.1" y="5.4" width="7.8" height="5.4" rx="1.3"/><path d="M4.1 5.4V3.9a1.9 1.9 0 0 1 3.8 0v1.5"/></svg>'

interface SlideEls {
  frame: HTMLDivElement
  tab: HTMLDivElement
  hex: HTMLSpanElement
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
  modeMix: number
  dyeL: number
  dyeC: number
  dyeH: number
  dyeD: number
  shadowKey: number
  tabW: number
  tabLeft: number
  hex: string
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
  id: number
  pointerId: number
  target: Element
  kind: 'resize' | 'move'
  /** Resize only: where on the grip the pointer landed, over the half-diagonal. */
  grabRatio: number
  /** Move only: pointer-to-centre offset in u, taken once at the grab. The
   *  slide is held still for the whole drag, so this stays true. */
  grabDX: number
  grabDY: number
  /** Where the pointer went down, in client px, for the dead zone below. */
  startX: number
  startY: number
  /** Move only: false until the pointer has travelled past the dead zone. */
  armed: boolean
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

  private viewport: Viewport | null = null
  private drag: DragState | null = null
  private hoveredId: number | null = null
  private framePx = -1
  private reduced = false
  /** Last lamp values written, so a style write only happens when one changes. */
  private lampKeys: string[] = []
  /** The stage never moves, so its offset is read once per drag, not per move. */
  private originX = 0
  private originY = 0

  constructor(root: HTMLElement, handlers: StageAllHandlers) {
    this.root = root
    this.handlers = handlers
    root.classList.add('lb-stage')
    this.painter = new Painter(root)

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
      this.recs.set(slide.id, this.create(slide, i + 1))
    }
    for (const [id, rec] of this.recs) {
      if (seen.has(id)) continue
      this.dispose(rec)
      this.recs.delete(id)
    }
  }

  private create(slide: SlideState, ordinal: number): SlideRec {
    const frame = div('lb-frame')
    const tab = div('lb-tab')
    const grip = div('lb-grip')

    const hex = document.createElement('span')
    hex.className = 'lb-hex'

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
    frame.append(tab, grip)
    this.root.append(frame)

    return {
      els: { frame, tab, hex, copy, lock, copied, grip },
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
        modeMix: -1,
        dyeL: Number.NaN,
        dyeC: Number.NaN,
        dyeH: Number.NaN,
        dyeD: Number.NaN,
        shadowKey: -1,
        tabW: -1,
        tabLeft: -1,
        hex: '',
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
   * The four tubes, as custom properties the stylesheet builds its gradients
   * from. Rounded to bytes before comparison: on a 100 second cycle a tube's
   * colour only changes a couple of times a second, and a style write on a
   * full-viewport element is not something to do 60 times a second for nothing.
   */
  private writeLamps(t: number): void {
    const lamps = lampsAt(t)
    for (let i = 0; i < lamps.length; i++) {
      const l = lamps[i] as Lamp
      const key = `${l.r} ${l.g} ${l.b}|${l.gain.toFixed(3)}`
      if (key === this.lampKeys[i]) continue
      this.lampKeys[i] = key
      this.root.style.setProperty(`--lb-tube-${i + 1}`, `${l.r} ${l.g} ${l.b}`)
      this.root.style.setProperty(`--lb-tube-${i + 1}-i`, l.gain.toFixed(3))
    }
  }

  private write(state: SimState, opts: RenderOptions): void {
    const vp = opts.viewport
    this.viewport = vp
    if (vp.frame !== this.framePx) {
      this.framePx = vp.frame
      this.root.style.setProperty('--lb-frame', `${vp.frame}px`)
    }
    if (opts.reducedMotion !== this.reduced) {
      this.reduced = opts.reducedMotion
      this.root.classList.toggle('is-reduced', opts.reducedMotion)
    }

    this.writeLamps(state.t)
    this.painter.draw(state, opts)

    const slides = state.slides
    const vh = vp.height
    const modeMix = clamp(state.modeMix, 0, 1)

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
      const shadowKey = zKey * 2 + (selected ? 1 : 0)
      if (shadowKey !== p.shadowKey) {
        p.shadowKey = shadowKey
        els.frame.style.boxShadow = shadowStack(zKey / Z_SHADOW_STEPS, selected)
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

      const modeChanged = modeMix !== p.modeMix
      p.modeMix = modeMix
      if (dyeChanged || modeChanged) {
        const hex = slideHex(dye, modeMix)
        if (hex !== p.hex) {
          p.hex = hex
          els.hex.textContent = hex
          els.copy.setAttribute('aria-label', `Copy ${hex}`)
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
      const grabRatio = this.diagonalRatio(rec.state, e.clientX, e.clientY, vp)
      if (!(grabRatio > 0.05)) return
      this.drag = {
        id: rec.state.id,
        pointerId: e.pointerId,
        target: grip,
        kind: 'resize',
        grabRatio,
        grabDX: 0,
        grabDY: 0,
        startX: e.clientX,
        startY: e.clientY,
        armed: true,
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
    // Select first: that is what stops the slide, and a stopped slide is what
    // makes the grab offset below hold for the rest of the drag.
    this.handlers.onSelect(rec ? rec.state.id : null)
    if (!rec) return

    const vp = this.viewport
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
      grabDX: rec.state.x - (e.clientX - this.originX) / vp.height,
      grabDY: rec.state.y - (e.clientY - this.originY) / vp.height,
      startX: e.clientX,
      startY: e.clientY,
      armed: false,
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
      const rec = this.recs.get(drag.id)
      const vp = this.viewport
      if (!rec || !vp) return
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
      const ratio = this.diagonalRatio(rec.state, e.clientX, e.clientY, vp)
      if (!(ratio > 0)) return
      const next = clampSizeFrac((rec.state.sizeFrac * ratio) / drag.grabRatio, vp)
      this.handlers.onResize(drag.id, next)
      return
    }

    const rec = this.recFromEvent(e)
    const id = rec ? rec.state.id : null
    if (id !== this.hoveredId) {
      this.hoveredId = id
      this.handlers.onHover?.(id)
    }
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
    if (drag.kind === 'move') this.handlers.onMoveEnd()
    else this.handlers.onResizeEnd()
  }

  private onPointerLeave = (): void => {
    if (this.drag || this.hoveredId === null) return
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
        const step = e.shiftKey ? KEY_RESIZE_STEP_COARSE : KEY_RESIZE_STEP
        const sign = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : -1
        const next = clampSizeFrac(rec.state.sizeFrac + sign * step, vp)
        if (next === rec.state.sizeFrac) return
        this.handlers.onResize(id, next)
        this.handlers.onResizeEnd()
        return
      }
      default:
        return
    }
  }

  /**
   * The pointer's offset from the slide centre, un-rotated into the slide's own
   * axes and projected onto its half-diagonal. 1 means the pointer sits exactly
   * on the corner, so this is directly a multiplier for `sizeFrac`.
   */
  private diagonalRatio(slide: SlideState, clientX: number, clientY: number, vp: Viewport): number {
    const vh = vp.height
    const dx = clientX - this.originX - slide.x * vh
    const dy = clientY - this.originY - slide.y * vh
    const cos = Math.cos(slide.rot)
    const sin = Math.sin(slide.rot)
    const lx = dx * cos + dy * sin
    const ly = -dx * sin + dy * cos
    const hw = (slide.w * vh) / 2
    const hh = (slide.h * vh) / 2
    const half2 = hw * hw + hh * hh
    if (half2 <= 0) return 0
    return (lx * hw + ly * hh) / half2
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

function shadowStack(z: number, selected: boolean): string {
  const hmm = H_MM_BASE + H_MM_RANGE * z
  const softBlur = SOFT_BLUR_BASE + SOFT_BLUR_PER_MM * hmm
  const softOy = SOFT_OY_PER_MM * hmm
  const softA = Math.max(0, SOFT_ALPHA_BASE - SOFT_ALPHA_PER_MM * hmm)
  const contactBlur = CONTACT_BLUR_BASE + CONTACT_BLUR_PER_MM * hmm
  const contactOy = CONTACT_OY_PER_MM * hmm
  const contactA = Math.max(0, CONTACT_ALPHA_BASE - CONTACT_ALPHA_PER_MM * hmm)
  const soft =
    `${(softOy * OX_OVER_OY).toFixed(2)}px ${softOy.toFixed(2)}px ${softBlur.toFixed(2)}px ` +
    `rgba(46,52,72,${softA.toFixed(4)})`
  const contact =
    `${(contactOy * OX_OVER_OY).toFixed(2)}px ${contactOy.toFixed(2)}px ${contactBlur.toFixed(2)}px ` +
    `rgba(46,52,72,${contactA.toFixed(4)})`
  return selected
    ? `${OUTER_LIP}, ${SELECT_RING}, ${soft}, ${contact}`
    : `${OUTER_LIP}, ${soft}, ${contact}`
}

/** Both the fractional range and the absolute pixel range have to hold. */
function clampSizeFrac(frac: number, vp: Viewport): number {
  const short = Math.max(1, vp.short)
  const lo = Math.max(SIZE_FRAC_MIN, SIZE_PX_MIN / short)
  const hi = Math.max(lo, Math.min(SIZE_FRAC_MAX, SIZE_PX_MAX / short))
  return clamp(frac, lo, hi)
}
