import { HISTORY_FRAMES, DT, MAX_SUBSTEPS, MODE_MS } from '../core/constants'
import { slideHex } from '../core/oklab'
import { Rng, randomSeed } from '../core/rng'
import type { BlendMode, Dye, SlideState, Viewport } from '../core/types'
import { generatePalette } from '../palette/palette'
import { Stage } from '../render/stage'
import { History } from '../sim/history'
import { Simulation } from '../sim/simulation'
import { measureViewport, viewportSignificant } from './viewport'

export interface PinnedEntry {
  id: number
  hex: string
  locked: boolean
  /**
   * `slide` follows a live slide and changes as that slide drifts. `mix` is a
   * crossing that was sampled and frozen: the sheets that made it have long
   * since moved apart, so there is nothing left to follow.
   */
  kind: 'slide' | 'mix'
  /**
   * How many sheets were stacked where the colour was taken. Always 1 for a
   * slide pin; 1 or more for a sample, which is what lets the tray say whether
   * a frozen colour came off one sheet or out of a crossing.
   */
  sheets: number
}

export interface InstrumentSnapshot {
  playing: boolean
  blend: BlendMode
  selectedId: number | null
  pinned: PinnedEntry[]
  /** 0..1 playhead position inside the retained window. 1 is the live edge. */
  position: number
  /** 0..1 how much of the window has been recorded. */
  filled: number
  /** The timeline should be prominent. */
  expanded: boolean
  /** Text for the polite live region. Purely for screen readers. */
  announcement: string
}

type Playback = 'live' | 'replay' | 'paused' | 'scrubbing'

const IDLE_DT_CAP = 0.1

/**
 * The instrument: simulation, history, renderer and the playback state machine.
 *
 * This deliberately lives outside React. React subscribes to a small snapshot
 * that changes only on user intent, never per frame, so the animation loop never
 * triggers a render.
 */
export class Instrument {
  private readonly root: HTMLElement
  private readonly stage: Stage
  private sim: Simulation
  private history: History
  private viewport: Viewport

  private raf = 0
  private lastNow = 0
  private accumulator = 0
  private running = false

  private playback: Playback = 'live'
  private wasPlayingBeforeScrub = false
  /** Float tick position being displayed. Equals history.head while live. */
  private playhead = 0
  private tick = 0

  private blendTarget: BlendMode = 'light'
  private modeMix = 0

  private selectedId: number | null = null
  private hoveredId: number | null = null
  /**
   * Pin order, holding both kinds. A slide pin is the slide's id; a sampled
   * colour gets a negative synthetic id and its frozen hex in `mixPins`, along
   * with how many sheets made it, which is the only thing the tray still needs
   * to know about a colour whose sheets have long since moved apart. One
   * list because the tray is one list, and the order colours were saved in is
   * the only order the user can reason about.
   */
  private pinOrder: number[] = []
  private mixPins = new Map<number, { hex: string; sheets: number }>()
  private nextMixId = -1
  private paletteRng: Rng
  private previousPalette: Dye[] | null = null

  private reducedMotion = false
  private reduceQuery: MediaQueryList | null = null
  private announcement = ''

  private listeners = new Set<() => void>()
  private snapshot: InstrumentSnapshot
  private resizeObserver: ResizeObserver | null = null
  private resizeTimer = 0

  constructor(root: HTMLElement) {
    this.root = root
    this.viewport = measureViewport(root)

    const seed = readSeedFromHash()
    this.paletteRng = new Rng(seed ^ 0x5bf03635)
    this.sim = new Simulation(seed, this.viewport)
    this.history = new History(this.viewport.slideCount)

    this.reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion = this.reduceQuery.matches
    this.reduceQuery.addEventListener('change', this.onReduceChange)

    this.sim.setPalette(this.rollPalette())

    this.stage = new Stage(root, {
      onSelect: (id) => this.select(id),
      onCopy: (id) => this.copy(id),
      onToggleLock: (id) => this.toggleLock(id),
      onResize: (id, sizeFrac) => this.resizeSlide(id, sizeFrac),
      onResizeEnd: () => this.notify(),
      onMove: (id, x, y) => this.moveSlide(id, x, y),
      onMoveEnd: () => this.notify(),
      onPinMix: (ids, hex) => this.pinMix(ids, hex),
    })
    this.stage.sync(this.sim.state.slides)

    writeSeedToHash(seed)
    this.snapshot = this.buildSnapshot()

    this.resizeObserver = new ResizeObserver(() => this.onViewportResize())
    this.resizeObserver.observe(root)
  }

  // --- lifecycle -----------------------------------------------------------

  start(): void {
    if (this.running) return
    this.running = true
    this.lastNow = performance.now()
    this.raf = requestAnimationFrame(this.frame)
  }

  destroy(): void {
    this.running = false
    cancelAnimationFrame(this.raf)
    clearTimeout(this.resizeTimer)
    this.resizeObserver?.disconnect()
    this.reduceQuery?.removeEventListener('change', this.onReduceChange)
    this.stage.destroy()
    this.listeners.clear()
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): InstrumentSnapshot => this.snapshot

  // --- the loop ------------------------------------------------------------

  private frame = (now: number): void => {
    if (!this.running) return
    this.raf = requestAnimationFrame(this.frame)

    const dt = Math.min((now - this.lastNow) / 1000, IDLE_DT_CAP)
    this.lastNow = now

    if (this.playback === 'live') {
      this.accumulator += dt
      let steps = 0
      while (this.accumulator >= DT && steps < MAX_SUBSTEPS) {
        this.sim.step(this.reducedMotion)
        this.tick += 1
        this.history.capture(this.sim.state, this.tick)
        this.accumulator -= DT
        steps += 1
      }
      // A long stall drops simulation time rather than spiralling.
      if (this.accumulator > DT * MAX_SUBSTEPS) this.accumulator = 0
      this.playhead = this.history.head
      this.notifyTimelineCheap()
    } else if (this.playback === 'replay') {
      this.playhead += dt / DT
      const head = this.history.head
      if (this.playhead >= head) {
        this.playhead = head
        this.history.restore(this.sim.state, head)
        this.playback = 'live'
        this.accumulator = 0
        this.notify()
      } else {
        this.history.restore(this.sim.state, Math.round(this.playhead))
        this.notify()
      }
    }

    // Colour tweens keep running while paused: a regenerate must be visible even
    // when the user has frozen the composition to study it. The drift inside
    // the same call is a function of simulation time, which is frozen, so this
    // does not restart the animation by the back door.
    if (this.playback !== 'live') this.advanceTweensWhilePaused(dt)

    this.easeMode(dt)
    this.sim.state.modeMix = this.modeMix

    this.stage.render(this.sim.state, {
      viewport: this.viewport,
      selectedId: this.selectedId,
      hoveredId: this.hoveredId,
      reducedMotion: this.reducedMotion,
    })
  }

  private easeMode(dt: number): void {
    const target = this.blendTarget === 'blend' ? 1 : 0
    if (this.modeMix === target) return
    const step = dt / (MODE_MS / 1000)
    if (Math.abs(target - this.modeMix) <= step) {
      this.modeMix = target
      this.notify()
    } else {
      this.modeMix += Math.sign(target - this.modeMix) * step
    }
  }

  /**
   * Runs the simulation's own colour step on a frozen stage, so a paused
   * regenerate still dissolves and a pinned colour still settles. One code
   * path, so the easing cannot drift apart from the live one.
   */
  private advanceTweensWhilePaused(dt: number): void {
    const settling = this.sim.state.slides.some((s) => s.tweenT < 1)
    this.sim.tickColour(dt)
    if (settling && this.sim.state.slides.every((s) => s.tweenT >= 1)) this.notify()
  }

  // --- intents -------------------------------------------------------------

  togglePlay(): void {
    this.setPlaying(!this.isPlaying())
  }

  isPlaying(): boolean {
    return this.playback === 'live' || this.playback === 'replay'
  }

  setPlaying(next: boolean): void {
    if (next === this.isPlaying()) return
    if (next) {
      this.playback = this.playhead < this.history.head ? 'replay' : 'live'
      this.accumulator = 0
    } else {
      this.playback = 'paused'
    }
    this.notify()
  }

  regenerate(): void {
    this.commitBranch()
    this.sim.applyPalette(this.rollPalette())
    const kept = this.pinOrder.length
    this.announcement = kept
      ? `New colours generated. ${kept} pinned ${kept === 1 ? 'colour' : 'colours'} kept.`
      : 'New colours generated.'
    this.notify()
  }

  setBlend(mode: BlendMode): void {
    if (mode === this.blendTarget) return
    this.blendTarget = mode
    this.notify()
  }

  toggleBlend(): void {
    this.setBlend(this.blendTarget === 'light' ? 'blend' : 'light')
  }

  /**
   * Selecting also stops the slide where it stands.
   *
   * The original rule was that nothing but Pause may ever freeze a slide. It
   * did not survive contact: a colour you are trying to read, copy or drag is
   * sliding out from under the pointer the whole time, and pausing everything
   * to inspect one thing kills the composition that made you curious. Holding
   * one still while the other five keep drifting is the version that works, and
   * it is what makes a slide graspable: picking it up is now the same gesture
   * as selecting it. Deselect and it carries on from exactly where it stopped.
   */
  select(id: number | null): void {
    if (id === this.selectedId) return
    // Taking hold of a slide happens at the live edge, like every other
    // mutation. Mid-replay the positions come straight out of the ring buffer,
    // so a held slide carried on sliding: the click looked ignored. Committing
    // keeps the frame on screen exactly as it is and makes it the present.
    if (id !== null) this.commitBranch()
    this.selectedId = id
    this.sim.setHeld(id)
    this.notify()
  }

  setHovered(id: number | null): void {
    this.hoveredId = id
  }

  toggleLock(id: number): void {
    const slide = this.slide(id)
    if (!slide) return
    // Through the simulation, because pinning also stops the colour drifting,
    // and it has to stop on exactly the colour that is on screen.
    this.sim.setLocked(id, !slide.locked)
    const hex = slideHex(slide.dye, this.modeMix)
    if (slide.locked) {
      if (!this.pinOrder.includes(id)) this.pinOrder.push(id)
      this.announcement = `${hex} pinned.`
    } else {
      this.pinOrder = this.pinOrder.filter((p) => p !== id)
      this.announcement = `${hex} unpinned.`
    }
    this.notify()
  }

  /**
   * Save whatever colour is under the pointer.
   *
   * Crossings are the point of the whole instrument and were the one thing it
   * could not keep. A slide's colour has a tab to pin from; the green where a
   * yellow passes over a blue has no owner and exists for about four seconds.
   *
   * It takes single sheets too, and the rule is better for it: double-click
   * saves the colour you are looking at, wherever you are looking. Restricting
   * it to crossings made the user learn where the gesture worked, and a gesture
   * that works in some places is one nobody trusts anywhere. On a single sheet
   * it duplicates the lock button, which is fine: the button also protects the
   * slide from Regenerate, and this does not.
   *
   * Frozen, not tracked. Even one sheet is drifting, so the colour that was on
   * screen when the pointer went down is gone within seconds. So the sample is
   * a value, and unlike a slide pin it changes nothing about the simulation:
   * nothing is locked, nothing stops.
   */
  pinMix(ids: number[], hex: string): void {
    if (ids.length < 1) return
    // Sampling the same colour twice is one colour, not two. Slide pins count:
    // a locked slide's live entry and a frozen sample of it would be the same
    // hex on two rows, which reads as a bug rather than as two saved colours.
    for (const [key, value] of this.mixPins) {
      if (value.hex === hex && this.pinOrder.includes(key)) {
        this.announcement = `${hex} is already pinned.`
        this.notify()
        return
      }
    }
    for (const pinned of this.pinOrder) {
      if (pinned < 0) continue
      const slide = this.slide(pinned)
      if (slide && slideHex(slide.dye, this.modeMix) === hex) {
        this.announcement = `${hex} is already pinned.`
        this.notify()
        return
      }
    }
    const id = this.nextMixId
    this.nextMixId -= 1
    this.mixPins.set(id, { hex, sheets: ids.length })
    this.pinOrder.push(id)
    this.announcement =
      ids.length > 1 ? `${hex}, the overlap of ${ids.length} slides, pinned.` : `${hex} pinned.`
    this.notify()
  }

  /** One entry point for the tray's close button, whichever kind it is. */
  unpin(id: number): void {
    if (id >= 0) {
      if (this.slide(id)?.locked) this.toggleLock(id)
      return
    }
    const sample = this.mixPins.get(id)
    this.mixPins.delete(id)
    this.pinOrder = this.pinOrder.filter((p) => p !== id)
    this.announcement = sample ? `${sample.hex} unpinned.` : 'Unpinned.'
    this.notify()
  }

  copy(id: number): void {
    const slide = this.slide(id)
    if (!slide) return
    this.copyHex(slideHex(slide.dye, this.modeMix))
    this.stage.flashCopied(id)
  }

  copyHex(hex: string): void {
    void writeClipboard(hex)
    this.announcement = `Copied ${hex}.`
    this.notify()
  }

  resizeSlide(id: number, sizeFrac: number): void {
    this.commitBranch()
    this.sim.setSizeFrac(id, sizeFrac)
  }

  /** Live during a drag. The slide is already held, so it goes where it is put. */
  moveSlide(id: number, x: number, y: number): void {
    this.commitBranch()
    this.sim.moveTo(id, x, y)
  }

  // --- scrubbing -----------------------------------------------------------

  beginScrub(): void {
    this.wasPlayingBeforeScrub = this.isPlaying()
    this.playback = 'scrubbing'
    this.notify()
  }

  scrubTo(position: number): void {
    const { oldest, head } = this.history
    if (head < 0 || head === oldest) return
    const clamped = Math.min(1, Math.max(0, position))
    const tick = Math.round(oldest + clamped * (head - oldest))
    this.playhead = tick
    this.history.restore(this.sim.state, tick)
    this.notify()
  }

  endScrub(): void {
    if (this.wasPlayingBeforeScrub && this.playhead < this.history.head) {
      this.playback = 'replay'
    } else if (this.wasPlayingBeforeScrub) {
      this.playback = 'live'
      this.accumulator = 0
    } else {
      this.playback = 'paused'
    }
    this.notify()
  }

  /**
   * Anything that mutates simulation state while the playhead sits in the past
   * has to commit that point as the new present, otherwise the buffer would hold
   * frames that can never be reached again.
   */
  private commitBranch(): void {
    if (this.history.head < 0) return
    const current = Math.round(this.playhead)
    if (current >= this.history.head) return
    this.history.restore(this.sim.state, current)
    this.history.truncateAfter(current)
    this.tick = current
    this.playhead = current
    if (this.playback === 'replay') this.playback = 'live'
  }

  // --- palette -------------------------------------------------------------

  private rollPalette(): Dye[] {
    const slides = this.sim.state.slides
    const areas = slides.map((s) => s.w * s.h)
    const maxArea = Math.max(...areas, 1e-6)
    const dyes = generatePalette({
      rng: this.paletteRng,
      count: slides.length,
      areaNorm: areas.map((a) => a / maxArea),
      keep: slides.map((s) => (s.locked ? s.dye : null)),
      previous: this.previousPalette,
    })
    this.previousPalette = dyes.map((d) => ({ ...d }))
    return dyes
  }

  // --- viewport ------------------------------------------------------------

  private onViewportResize = (): void => {
    clearTimeout(this.resizeTimer)
    this.resizeTimer = window.setTimeout(() => {
      const next = measureViewport(this.root)
      if (!viewportSignificant(this.viewport, next)) {
        this.viewport = next
        return
      }
      const countChanged = next.slideCount !== this.viewport.slideCount
      this.viewport = next
      this.sim.setViewport(next)
      if (countChanged) {
        this.history = new History(next.slideCount)
        // The slides are new objects: a selection carried across would point at
        // a stranger, and since selecting now holds a slide still, that stranger
        // would sit frozen with nothing on screen explaining why.
        this.selectedId = null
        // Sampled crossings survive a relayout: they are values, not slides.
        this.pinOrder = this.pinOrder.filter((id) => id < 0 || this.slide(id)?.locked)
        this.sim.setPalette(this.rollPalette())
        this.stage.sync(this.sim.state.slides)
      } else {
        this.history.clear()
      }
      this.tick = 0
      this.playhead = 0
      this.notify()
    }, 250)
  }

  private onReduceChange = (e: MediaQueryListEvent): void => {
    this.reducedMotion = e.matches
    this.notify()
  }

  // --- snapshot ------------------------------------------------------------

  private slide(id: number): SlideState | undefined {
    return this.sim.state.slides.find((s) => s.id === id)
  }

  private buildSnapshot(): InstrumentSnapshot {
    const { oldest, head } = this.history
    const span = head - oldest
    return {
      playing: this.isPlaying(),
      blend: this.blendTarget,
      selectedId: this.selectedId,
      pinned: this.pinOrder.flatMap<PinnedEntry>((id) => {
        if (id < 0) {
          const sample = this.mixPins.get(id)
          return sample
            ? [{ id, hex: sample.hex, locked: true, kind: 'mix', sheets: sample.sheets }]
            : []
        }
        const s = this.slide(id)
        return s
          ? [
              {
                id,
                hex: slideHex(s.dye, this.modeMix),
                locked: s.locked,
                kind: 'slide',
                sheets: 1,
              },
            ]
          : []
      }),
      position: span > 0 ? (this.playhead - oldest) / span : 1,
      filled: head < 0 ? 0 : (head - oldest + 1) / HISTORY_FRAMES,
      expanded: !this.isPlaying() || this.playback === 'scrubbing',
      announcement: this.announcement,
    }
  }

  private notify(): void {
    this.snapshot = this.buildSnapshot()
    for (const fn of this.listeners) fn()
  }

  /** While live only `filled` moves, and only for the first 15 seconds. */
  private notifyTimelineCheap(): void {
    if (this.snapshot.filled >= 1) return
    const filled = this.history.head < 0 ? 0 : (this.history.head - this.history.oldest + 1) / HISTORY_FRAMES
    if (filled - this.snapshot.filled < 0.02 && filled < 1) return
    this.notify()
  }
}

function readSeedFromHash(): number {
  const match = /[#&]s=([0-9a-z]+)/i.exec(window.location.hash)
  if (match) {
    const parsed = Number.parseInt(match[1] as string, 36)
    if (Number.isFinite(parsed) && parsed > 0) return parsed >>> 0
  }
  return randomSeed()
}

function writeSeedToHash(seed: number): void {
  const hash = `#s=${seed.toString(36)}`
  if (window.location.hash !== hash) {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`)
  }
}

async function writeClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Clipboard API needs a secure context and permission. Fall back to a
    // throwaway textarea so the interaction still works over plain http.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(ta)
    ta.select()
    try {
      document.execCommand('copy')
    } finally {
      ta.remove()
    }
  }
}
