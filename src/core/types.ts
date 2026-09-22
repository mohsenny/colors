/**
 * The shared contract.
 *
 * Every module in this app talks through the types below and nothing else.
 * Read the units comments carefully: most of the subtle bugs in a piece like
 * this come from mixing normalised simulation units with CSS pixels.
 */

/** A colour in OKLCh. `h` is in DEGREES, `L` in 0..1, `C` in 0..~0.37. */
export interface Oklch {
  L: number
  C: number
  h: number
}

/**
 * A slide's colour is not an ink, it is a transmittance dye: `L/C/h` describe the
 * gel itself, `d` (density, 0..1) describes how thick the sheet is. What you see
 * on the lightbox is the dye at that density. See `filmRgb()`.
 */
export interface Dye extends Oklch {
  d: number
}

/**
 * What a crossing is. `paint` mixes the sheets like pigment, so the hue is one
 * a painter would predict and the light never runs out. `light` is the optics:
 * the product of what each sheet transmits, darker and true.
 */
export type BlendMode = 'paint' | 'light'

/**
 * One slide's complete simulation state.
 *
 * Positions are in NORMALISED HEIGHT UNITS: `1u === viewport height in px`.
 * So `y` runs 0..1 and `x` runs 0..aspect. Sizes (`w`, `h`) are in the same
 * units. The renderer multiplies by `viewportHeight` to get CSS pixels.
 *
 * Frame thickness, tab size and shadow blur are always in CSS px and never
 * scale with the slide: that is what keeps the white frame constant when the
 * colour area is resized.
 */
export interface SlideState {
  readonly id: number

  // --- motion -------------------------------------------------------------
  /** Centre of the slide's frame rect (excludes the tab), in u. */
  x: number
  y: number
  /** Direction of travel, radians, unwrapped is fine (it is normalised on use). */
  heading: number
  /** Base speed in u/s, before the noise breath and depth factor. */
  speed0: number
  /** Rotation in RADIANS, stored UNWRAPPED. Never store this wrapped. */
  rot: number
  /** Rotational velocity, radians/s. */
  omegaRot: number

  // --- geometry -----------------------------------------------------------
  /** Size as a fraction of `S = min(vw, vh)`. This is what resizing changes. */
  sizeFrac: number
  /** w / h. Constant for the life of the slide; resizing preserves it. */
  aspect: number
  /** Derived from sizeFrac + aspect + viewport, in u. Never set directly. */
  w: number
  h: number

  // --- depth --------------------------------------------------------------
  /** 0 = resting near the surface, 1 = floating highest. Drives shadow + parallax. */
  z: number
  /** Where `z` is easing toward. Re-rolled on wall contact. */
  zTarget: number

  // --- colour -------------------------------------------------------------
  /**
   * The dye as currently displayed: the base with the drift applied, already
   * interpolated mid-tween. Everything downstream of the simulation reads this
   * one and nothing else: the paint, the hex, the copy button, the tray.
   */
  dye: Dye
  /**
   * The colour the palette assigned. The tween moves this; the drift wanders
   * around it (core/drift.ts). Separating the two is what lets a slide change
   * colour continuously without ever losing the palette's intent.
   */
  dyeBase: Dye
  /** Tween source/target for the BASE; `tweenT` is 0..1, and >= 1 means settled. */
  dyeFrom: Dye
  dyeTo: Dye
  tweenT: number
  /** Seconds of tween still to wait before this slide starts (depth stagger). */
  tweenDelay: number
  /**
   * How much of the drift excursion is in effect, 0..1. Locking takes it to 0
   * at once so a pinned colour is exactly the colour that was pinned; unlocking
   * eases it back so nothing snaps. Derived from `locked`, so like `locked` it
   * is user state and stays out of the timeline.
   */
  driftGate: number

  // --- bookkeeping --------------------------------------------------------
  /** Seconds this slide has been alone. Feeds the "lonely" steering term. */
  lonelyTimer: number
  /** Seconds of unbroken contact with anything. Feeds the "sticky" term. */
  stickyTimer: number
  /** Per-wall bounce cooldowns, seconds: [left, right, top, bottom]. */
  cd: [number, number, number, number]
  /** This slide's PRNG stream position. Advances ONLY on discrete events. */
  rngState: number
  /** While `t < catchUntil` the slide is recovering from a soft edge catch. */
  catchUntil: number
  /** Speed to recover to after a soft catch. */
  speedPre: number

  // --- user state (NOT part of the timeline) ------------------------------
  /** Locked slides keep their colour through a regenerate. */
  locked: boolean
  /**
   * The user has this one in hand: selected, or under a dragging pointer. All
   * kinematics stop while it is true. Not in the timeline for the same reason
   * `locked` is not: history stores where a slide WAS, and a held slide was
   * simply in the same place for a while, which replays correctly on its own.
   */
  held: boolean
}

/** The whole simulation at one instant. */
export interface SimState {
  /** Simulation time in seconds. Monotonic while live. */
  t: number
  /** Viewport aspect, `vw / vh`. x runs 0..aspect. */
  aspect: number
  /** 0 = fully "Light" (optical), 1 = fully "Blend" (graphic). Eased, scrubbable. */
  modeMix: number
  /** Increments on every palette roll. Lets the UI notice colour changes. */
  paletteEpoch: number
  slides: SlideState[]
}

/** Viewport metrics, recomputed on resize. */
export interface Viewport {
  /** CSS pixels. */
  width: number
  height: number
  /** `min(width, height)`, the basis for slide sizes. */
  short: number
  /** `width / height`. */
  aspect: number
  /** Constant white frame thickness in CSS px for this viewport. */
  frame: number
  /** Number of slides this viewport should carry. */
  slideCount: number
}

/** Everything the renderer needs that is not in `SimState`. */
export interface RenderOptions {
  viewport: Viewport
  /** id of the selected slide, or null. */
  selectedId: number | null
  /** id of the hovered slide, or null. */
  hoveredId: number | null
  /** Movement is substantially reduced; also disables the surface shimmer. */
  reducedMotion: boolean
  /** Lamp colour bias, -1 warm to +1 cool. */
  warmth: number
}

/** Callbacks the stage raises. All are user intent, never animation. */
export interface StageHandlers {
  onSelect(id: number | null): void
  onCopy(id: number): void
  onToggleLock(id: number): void
  /**
   * Live during a drag. Width and height in height units, each already clamped
   * into the legal side band, and independent of each other: dragging the grip
   * straight down changes only the height.
   */
  onResize(id: number, w: number, h: number): void
  /** Raised once when a resize drag ends, so history can branch. */
  onResizeEnd(): void
  /** Live during a drag; the centre in u, clamped by the simulation. */
  onMove(id: number, x: number, y: number): void
  /** Raised once when a move drag ends. */
  onMoveEnd(): void
  /**
   * Double-click on the film: save the colour that point is currently showing.
   * `ids` are the slides stacked there, `hex` what they come to. One sheet or
   * six; the only place it is not raised is bare lightbox.
   */
  onPinMix(ids: number[], hex: string): void
}

export type PlaybackMode = 'live' | 'replay' | 'paused'

/** The sparse, React-visible slice of app state. Never updated per frame. */
export interface AppSnapshot {
  playing: boolean
  blend: BlendMode
  selectedId: number | null
  /** Locked slide ids, in the order the user pinned them. */
  pinned: number[]
  /** Hex strings keyed by slide id, refreshed when colours settle. */
  hexes: Record<number, string>
}
