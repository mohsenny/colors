import {
  CORNER_INNER,
  CORNER_OUTER,
  TAB_H,
  TAB_INSET,
  TAB_PROUD,
  TAB_RADIUS,
  TAB_W,
} from '../../../src/core/constants'
import type { Dye, RenderOptions, SimState, SlideState, Viewport } from '../../../src/core/types'
import { measureViewport } from '../../../src/app/viewport'
import { Painter } from '../../../src/render/paint'
import { shadowStack } from '../../../src/render/shadow'
import { ART, inkOf } from '../art'
import { inside, toStage } from '../layout'
import type { Fit, Laid, Placed } from '../layout'
import { tabOf, yearsOf } from '../life'
import type { Life } from '../life'

/*
 * The life on the lightbox: Lightbox's own Painter for the film and its own
 * mounts and tabs in the DOM, laid where layout.ts says and never moving on
 * their own. Nothing here runs Lightbox's stage or simulation. The painter is
 * handed a SimState that is only ever a still picture, so the film is the same
 * film, mixed the same way, with none of the drift, sway or tubes. Each
 * mount carries its chapter's picture (art.ts) over the film, as a printed
 * transparency does.
 *
 * It draws when the camera, the selection or the hover has changed, and not
 * otherwise: `draw` compares the picture it is asked for with the last one.
 */

/** Mounts start above the surface and the film canvas, which own 1 and 2, as in Lightbox. Their layer stands at this, and they stack inside it. */
const Z_BASE = 10

/** Heights as stage.ts quantises them, so the shadow string is built once per visible step. */
const Z_SHADOW_STEPS = 250

/** Card left clear between the widest tab and where a sheet's top right corner turns, px. Where there is less, every tab says its year alone. */
const TAB_CLEAR = 8

/** The picture to draw. */
export interface View {
  fit: Fit
  /** Where the camera looks, u along. */
  camera: number
  /** Each sheet's height off the surface, 0 to 1, in the shadow formula's terms. */
  z: readonly number[]
  /** How far each sheet stands up off the row, 0 to 1. */
  lift: readonly number[]
  /** The sheet that is the current chapter. */
  current: readonly boolean[]
  hovered: readonly boolean[]
}

interface Mount {
  frame: HTMLDivElement
  tab: HTMLButtonElement
  transform: string
  side: number
  shadow: number
  rank: number
  current: boolean
  hovered: boolean
}

function div(cls: string): HTMLDivElement {
  const node = document.createElement('div')
  node.className = cls
  return node
}

/** A sheet as the painter reads one. Only the place, size, lean, height and dye are ever looked at; the rest is the shape the type asks for, at rest. */
function still(id: number, dye: Dye): SlideState {
  return {
    id,
    x: 0,
    y: 0,
    heading: 0,
    speed0: 0,
    rot: 0,
    rotRest: 0,
    omegaRot: 0,
    sizeFrac: 0,
    aspect: 1,
    w: 0,
    h: 0,
    z: 0,
    zTarget: 0,
    dye,
    dyeBase: dye,
    dyeFrom: dye,
    dyeTo: dye,
    tweenT: 1,
    tweenDelay: 0,
    driftGate: 0,
    lonelyTimer: 0,
    stickyTimer: 0,
    cd: [0, 0, 0, 0],
    rngState: 0,
    catchUntil: 0,
    speedPre: 0,
    locked: true,
    held: true,
  }
}

export class Film {
  private readonly root: HTMLElement
  private readonly placed: readonly Placed[]
  private readonly painter: Painter
  private readonly state: SimState
  /** The mounts' own layer, which stacks with the story, the paper and the chrome. */
  private readonly layer: HTMLDivElement
  private readonly mounts: Mount[] = []
  private laid: Laid[] = []
  private viewport: Viewport
  private key = ''
  /** The widest tab with its country, px. */
  private widest = 0
  /** The sheets are too small for it, so the countries are left off. */
  private tight = false

  constructor(root: HTMLElement, life: Life, placed: readonly Placed[], onTab: (index: number) => void) {
    this.root = root
    this.placed = placed
    this.painter = new Painter(root)
    this.viewport = measureViewport(root)
    this.state = {
      t: 0,
      aspect: this.viewport.aspect,
      // Paint, not light, as Lightbox opens in.
      modeMix: 0,
      paletteEpoch: 0,
      crowd: 0,
      slides: life.chapters.map((c, i) => still(i, c.dye)),
    }

    // The mount's measures, set on the root as stage.ts sets them, so
    // stage.css draws the same card.
    const style = root.style
    style.setProperty('--lb-tab-h', `${TAB_H}px`)
    style.setProperty('--lb-tab-proud', `${TAB_PROUD}px`)
    style.setProperty('--lb-tab-radius', `${TAB_RADIUS}px`)
    style.setProperty('--lb-radius-outer', `${CORNER_OUTER}px`)
    style.setProperty('--lb-radius-inner', `${CORNER_INNER}px`)
    style.setProperty('--lb-frame', `${this.viewport.frame}px`)

    this.layer = div('cv-mounts')
    this.layer.style.zIndex = String(Z_BASE)
    root.append(this.layer)

    // In time order, so Tab walks the chapters as the years run.
    for (const [i, c] of life.chapters.entries()) {
      const frame = div('lb-frame')
      // Under the tab, so the tab's own card hides the ring across its base.
      const edge = div('lb-edge')
      const tab = document.createElement('button')
      tab.type = 'button'
      tab.className = 'lb-tab'
      // As wide as its words and never narrower than Lightbox's, from the
      // same left edge (ui.css), so a tab with a country grows to the right.
      tab.style.minWidth = `${TAB_W}px`
      tab.style.left = `${TAB_INSET}px`
      const { year, country } = tabOf(c, life)
      // Its own words first, which voice control listens for, then the
      // chapter as the live message and the tape say it.
      tab.setAttribute('aria-label', `${country ? `${year} ${country}` : year}, ${c.name}, ${yearsOf(c)}`)
      // So the pointer over a tab lifts its own sheet, as over the film.
      tab.dataset.chapter = String(i)
      const words = document.createElement('span')
      words.className = 'lb-hex'
      // The start year, or for Growing up the year he was born.
      words.textContent = String(year)
      if (country) {
        // A word space between, as a reader writes it, and the space goes
        // with the country where the room leaves it off.
        const where = document.createElement('span')
        where.className = 'cv-tab-country'
        where.textContent = ` ${country}`
        words.append(where)
      }
      tab.append(words)
      tab.addEventListener('click', () => onTab(i))
      // The picture, first, so the edge and the tab are drawn over it.
      const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      art.setAttribute('class', 'cv-art')
      art.setAttribute('viewBox', '0 0 100 100')
      art.setAttribute('preserveAspectRatio', 'xMidYMid slice')
      art.setAttribute('aria-hidden', 'true')
      art.innerHTML = ART[c.id] ?? ''
      art.style.color = inkOf(c.dye)
      frame.append(art, edge, tab)
      this.layer.append(frame)
      this.mounts.push({
        frame,
        tab,
        transform: '',
        side: -1,
        shadow: -1,
        rank: -1,
        current: false,
        hovered: false,
      })
    }
    // A font arriving changes the words' width.
    void document.fonts.ready.then(() => this.measure())
  }

  destroy(): void {
    this.layer.remove()
    this.mounts.length = 0
    this.painter.destroy()
  }

  /** The stage changed size: measured again, and drawn on the next call whatever it is asked. */
  resize(): Viewport {
    this.viewport = measureViewport(this.root)
    this.state.aspect = this.viewport.aspect
    this.root.style.setProperty('--lb-frame', `${this.viewport.frame}px`)
    this.measure()
    return this.viewport
  }

  /**
   * The tabs' widest, read with every country showing. On a resize and once
   * the fonts are in, never per frame: a draw only holds it against the sheet.
   */
  private measure(): void {
    this.layer.classList.remove('is-tight')
    this.widest = Math.max(0, ...this.mounts.map((m) => m.tab.offsetWidth))
    this.layer.classList.toggle('is-tight', this.tight)
    this.key = ''
  }

  draw(view: View): void {
    const key = [
      view.fit.u.toFixed(2),
      view.fit.narrow ? 'n' : 'w',
      (view.camera * view.fit.u).toFixed(1),
      view.z.map((z) => Math.round(z * Z_SHADOW_STEPS)).join(','),
      view.lift.map((l) => l.toFixed(3)).join(','),
      view.current.map(Number).join(''),
      view.hovered.map(Number).join(''),
    ].join('|')
    if (key === this.key) return
    this.key = key

    const vp = this.viewport
    const vh = vp.height
    this.laid = this.placed.map((p, i) => toStage(view.fit, p, view.camera, view.lift[i] ?? 0))

    // Every tab says its country or none does. A sheet at rest decides, so
    // the current one, drawn larger, says what the rest say. A tab starts a
    // frame in from the sheet's left edge.
    const tight = vp.frame + this.widest + TAB_CLEAR + CORNER_OUTER > view.fit.u
    if (tight !== this.tight) {
      this.tight = tight
      this.layer.classList.toggle('is-tight', tight)
    }

    for (let i = 0; i < this.laid.length; i++) {
      const s = this.laid[i] as Laid
      const slide = this.state.slides[i] as SlideState
      slide.x = s.x / vh
      slide.y = s.y / vh
      slide.w = s.side / vh
      slide.h = s.side / vh
      slide.rot = s.rot
      slide.rotRest = s.rot
      slide.z = view.z[i] ?? 0

      const m = this.mounts[i] as Mount
      const transform =
        `translate3d(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px, 0) ` +
        `rotate(${s.rot.toFixed(4)}rad) translate(-50%, -50%)`
      if (transform !== m.transform) {
        m.transform = transform
        m.frame.style.transform = transform
      }
      const side = Math.round(s.side * 100) / 100
      if (side !== m.side) {
        m.side = side
        m.frame.style.width = `${side}px`
        m.frame.style.height = `${side}px`
      }
      const shadow = Math.round((view.z[i] ?? 0) * Z_SHADOW_STEPS)
      if (shadow !== m.shadow) {
        m.shadow = shadow
        m.frame.style.boxShadow = shadowStack(shadow / Z_SHADOW_STEPS)
      }
      const current = view.current[i] === true
      const hovered = view.hovered[i] === true
      if (current !== m.current) {
        m.current = current
        m.frame.classList.toggle('is-selected', current)
        m.tab.setAttribute('aria-current', current ? 'true' : 'false')
      }
      if (hovered !== m.hovered) {
        m.hovered = hovered
        m.frame.classList.toggle('is-hovered', hovered)
      }
      // The hovered sheet over the rest, the current over all, so a grown
      // sheet's shadow falls on its neighbours and not under them.
      const rank = current ? 2 : hovered ? 1 : 0
      if (rank !== m.rank) {
        m.rank = rank
        m.frame.style.zIndex = String(rank)
      }
    }

    const opts: RenderOptions = {
      viewport: vp,
      selectedId: null,
      hoveredId: null,
      reducedMotion: true,
      warmth: 0,
    }
    this.painter.draw(this.state, opts)
  }

  /** The chapter whose sheet is under a stage point, mount included, the one nearest the top. */
  targetAt(x: number, y: number): number | null {
    let best = -1
    let rank = -1
    for (let i = 0; i < this.laid.length; i++) {
      const m = this.mounts[i] as Mount
      if (m.rank > rank && inside(this.laid[i] as Laid, x, y)) {
        best = i
        rank = m.rank
      }
    }
    return best >= 0 ? best : null
  }
}
